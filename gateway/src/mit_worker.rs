use std::{
  collections::VecDeque,
  sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
  },
  time::{Duration, Instant},
};

use axum::{
  body::Bytes,
  extract::{
    ws::{self, WebSocket},
    State, WebSocketUpgrade,
  },
  response::IntoResponse,
  routing::get,
  Router, TypedHeader,
};
use chrono::Utc;
use cotrans_proto_rs::gateway::mit::{web_socket_message, NewTask, WebSocketMessage};
use dashmap::DashMap;
use futures::{Sink, SinkExt, Stream, StreamExt};
use http::StatusCode;
use metrics::{counter, decrement_gauge, gauge, histogram, increment_counter, increment_gauge};
use prost::Message;
use tokio::sync::{watch, Mutex, Notify};

use crate::{
  error::{AppError, AppResult},
  headers::x_secret::HeaderXSecret,
  prisma,
  r2::translation_mask_key,
  task::{Task, TaskParam, TaskResult},
  AppState, Database, MITWorkers, R2Client,
};

pub static WORKER_REVISION: i32 = 1;

#[derive(Debug, Clone)]
pub enum TaskWatchMessage {
  Pending(usize),
  Status(String),
  Result(TaskResult),
  Error(bool),
}

pub struct MITWorkersInner {
  secret: String,
  data: Arc<MITWorkerData>,
}

pub struct MITWorkerData {
  queue: Mutex<VecDeque<(Task, watch::Sender<TaskWatchMessage>)>>,
  queue_len: AtomicUsize,
  tasks: DashMap<String, watch::Receiver<TaskWatchMessage>>,
  notify: Notify,
  db: Database,
  r2: R2Client,
}

impl MITWorkerData {
  pub fn queue_len_inc(&self) {
    self.queue_len.fetch_add(1, Ordering::Release);
    increment_gauge!("mit_worker_queue_length", 1.);
  }

  pub fn queue_len_dec(&self) {
    self.queue_len.fetch_sub(1, Ordering::Release);
    decrement_gauge!("mit_worker_queue_length", 1.);
  }

  pub fn queue_len_set(&self, len: usize) {
    self.queue_len.store(len, Ordering::Release);
    gauge!("mit_worker_queue_length", len as f64);
  }

  pub fn queue_len(&self) -> usize {
    self.queue_len.load(Ordering::Acquire)
  }
}

impl MITWorkersInner {
  pub fn new(secret: String, db: Database, r2: R2Client) -> Self {
    Self {
      secret,
      data: Arc::new(MITWorkerData {
        queue: Mutex::new(VecDeque::new()),
        queue_len: AtomicUsize::new(0),
        tasks: DashMap::new(),
        notify: Notify::new(),
        db,
        r2,
      }),
    }
  }

  pub fn data(&self) -> Arc<MITWorkerData> {
    self.data.clone()
  }
}

prisma::task::include!(DBToTask {
  source_image: select { file }
});

impl MITWorkersInner {
  pub async fn resume(&self) -> AppResult<()> {
    let mut queue = self.data.queue.lock().await;

    let db_tasks = self
      .data
      .db
      .task()
      .find_many(vec![
        prisma::task::worker_revision::equals(WORKER_REVISION),
      ])
      .include(DBToTask::include())
      .exec()
      .await?;

    for db_task in db_tasks {
      if let prisma::TaskState::Done | prisma::TaskState::Error = db_task.state {
        continue;
      }

      if db_task.failed_count >= 3 {
        tracing::debug!(task_id = %db_task.id, failed_count = db_task.failed_count, "skipping failed task");
        continue;
      }

      let id = db_task.id.clone();
      tracing::debug!(task_id = %id, "resuming task");
      let Ok(task) = self.db_to_task(db_task, None).await else {
        _ = self.data.db.task().update(
          prisma::task::id::equals(id),
          vec![
            prisma::task::state::set(prisma::TaskState::Error),
          ]
        ).exec().await;
        continue;
      };
      let (tx, rx) = watch::channel(TaskWatchMessage::Pending(queue.len()));
      self.data.tasks.insert(id, rx);
      queue.push_back((task, tx));
    }

    counter!("mit_worker_task_dispatch_count", queue.len() as u64);
    self.data.queue_len_set(queue.len());

    self.data.notify.notify_waiters();

    Ok(())
  }

  pub async fn db_to_task(
    &self,
    db_task: DBToTask::Data,
    source_image: Option<Bytes>,
  ) -> AppResult<Task> {
    let source_image = if let Some(source_image) = source_image {
      source_image
    } else {
      self.data.r2.private.get(&db_task.source_image.file).await?
    };

    let result = db_task
      .translation_mask
      .map(|translation_mask| TaskResult { translation_mask });

    Ok(Task::new(
      db_task.id,
      TaskParam {
        target_language: db_task.target_language.into(),
        detector: db_task.detector.into(),
        direction: db_task.direction.into(),
        translator: db_task.translator.into(),
        size: db_task.size.into(),
      },
      source_image,
      db_task.state.into(),
      db_task.last_attempted_at,
      db_task.failed_count,
      result,
    ))
  }

  pub async fn dispatch_task(&self, task: Task) {
    tracing::debug!(task_id = %task.id(), "dispatching task");
    increment_counter!("mit_worker_task_dispatch_count");
    // we lock the queue first to prevent other threads from dispatching the same task
    let mut queue = self.data.queue.lock().await;
    let (tx, rx) = watch::channel(TaskWatchMessage::Pending(queue.len()));
    self.data.tasks.insert(task.id().to_owned(), rx);
    queue.push_back((task, tx));
    self.data.queue_len_inc();
    self.data.notify.notify_one();
  }

  pub async fn dispatch(
    &self,
    db_task: DBToTask::Data,
    source_image: Option<Bytes>,
  ) -> AppResult<()> {
    let task = self.db_to_task(db_task, source_image).await?;
    self.dispatch_task(task).await;
    Ok(())
  }

  pub async fn status(&self, id: &str) -> Option<TaskWatchMessage> {
    self.data.tasks.get(id).map(|rx| rx.borrow().to_owned())
  }

  pub async fn subscribe(&self, id: &str) -> Option<watch::Receiver<TaskWatchMessage>> {
    self.data.tasks.get(id).map(|rx| rx.value().clone())
  }

  pub async fn subscribe_or_dispatch(
    &self,
    db_task: DBToTask::Data,
    source_image: Option<Bytes>,
  ) -> AppResult<watch::Receiver<TaskWatchMessage>> {
    // we lock the queue first to prevent other threads from dispatching the same task
    let mut queue = self.data.queue.lock().await;

    let id = db_task.id.clone();

    if let Some(rx) = self.data.tasks.get(&id) {
      return Ok(rx.value().clone());
    }

    // let db_task = self
    //   .data
    //   .db
    //   .task()
    //   .find_unique(prisma::task::id::equals(id.clone()))
    //   .include(DBToTask::include())
    //   .exec()
    //   .await?
    //   .ok_or_else(|| AppError::NotFound)?;

    increment_counter!("mit_worker_task_dispatch_count");

    let task = self.db_to_task(db_task, source_image).await?;

    let (tx, rx) = watch::channel(TaskWatchMessage::Pending(queue.len()));
    self.data.tasks.insert(id, rx.clone());
    queue.push_back((task, tx));
    self.data.queue_len_inc();

    self.data.notify.notify_one();

    Ok(rx)
  }
}

pub fn router() -> Router<AppState> {
  Router::new().route("/worker_ws", get(worker_ws))
}

async fn worker_ws(
  State(mit_workers): State<MITWorkers>,
  secret: Option<TypedHeader<HeaderXSecret>>,
  ws: WebSocketUpgrade,
) -> impl IntoResponse {
  match secret {
    Some(TypedHeader(secret))
      if ring::constant_time::verify_slices_are_equal(
        secret.as_bytes(),
        mit_workers.secret.as_bytes(),
      )
      .is_ok() =>
    {
      ()
    }
    _ => return StatusCode::FORBIDDEN.into_response(),
  }

  let data = mit_workers.data.clone();

  ws.on_upgrade(|socket| worker_socket(socket, data))
}

async fn worker_socket(socket: WebSocket, data: Arc<MITWorkerData>) {
  let (mut sender, mut receiver) = socket.split();

  increment_gauge!("mit_worker_count", 1.);
  struct DropGuard {}
  impl Drop for DropGuard {
    fn drop(&mut self) {
      decrement_gauge!("mit_worker_count", 1.);
    }
  }
  let _guard = DropGuard {};

  loop {
    let mut queue = data.queue.lock().await;
    let (mut task, tx) = if let Some(task) = queue.pop_front() {
      task
    } else {
      drop(queue);
      loop {
        tokio::select! {
          _ = data.notify.notified() => {
            break
          },
          msg = receiver.next() => match msg {
            Some(Ok(msg)) => match msg {
              ws::Message::Ping(msg) => {
                _ = sender.send(ws::Message::Pong(msg)).await;
              }
              ws::Message::Close(_) => {
                return;
              }
              _ => (),
            },
            _ => return,
          },
        }
      }
      continue;
    };

    // notify other tasks position
    for (i, (_, tx)) in queue.iter_mut().enumerate() {
      _ = tx.send(TaskWatchMessage::Pending(i + 1));
    }

    data.queue_len_dec();

    drop(queue);

    let task_id = task.id().to_owned();
    tracing::debug!(task_id = %task_id, "executing task");
    let time_start = Instant::now();

    match execute_task(
      &mut sender,
      &mut receiver,
      &mut task,
      &tx,
      &data.db,
      &data.r2,
    )
    .await
    {
      Ok(result) => {
        tracing::debug!(task_id = %task_id, "task finished");
        histogram!(
          "mit_worker_task_duration_seconds",
          time_start.elapsed().as_secs_f64()
        );

        task.result = Some(result.clone());
        task.state = prisma::TaskState::Done.into();

        data.tasks.remove(&task_id);
        increment_counter!("mit_worker_task_finish_count");

        _ = tx.send(TaskWatchMessage::Result(result.clone()));
      }
      Err(err) => {
        task.failed_count += 1;
        tracing::debug!(
          "task {} failed in attempt {}: {:?}",
          task.id(),
          task.failed_count,
          err
        );
        increment_counter!("mit_worker_task_error_count");

        let db_ok = data
          .db
          .task()
          .update(
            prisma::task::id::equals(task.id().to_owned()),
            vec![
              prisma::task::failed_count::set(task.failed_count),
              prisma::task::state::set(prisma::TaskState::Error),
            ],
          )
          .exec()
          .await
          .is_ok();

        if db_ok && task.failed_count < 3 {
          _ = tx.send(TaskWatchMessage::Error(true));

          data.queue.lock().await.push_front((task, tx));
          data.queue_len_inc();

          data.notify.notify_one();
        } else {
          _ = tx.send(TaskWatchMessage::Error(false));

          data.tasks.remove(&task_id);
        }

        if let AppError::AxumError(_) = err {
          return;
        }
      }
    }
  }
}

async fn execute_task<S, R>(
  sender: &mut S,
  receiver: &mut R,
  task: &mut Task,
  tx: &watch::Sender<TaskWatchMessage>,
  db: &Database,
  r2: &R2Client,
) -> AppResult<TaskResult>
where
  S: Sink<ws::Message, Error = axum::Error> + Unpin,
  R: Stream<Item = Result<ws::Message, axum::Error>> + Unpin,
{
  task.state = prisma::TaskState::Running.into();
  task.last_attempted_at = Some(Utc::now().into());
  db.task()
    .update(
      prisma::task::id::equals(task.id().to_owned()),
      vec![
        prisma::task::state::set(task.state.into()),
        prisma::task::last_attempted_at::set(task.last_attempted_at),
      ],
    )
    .exec()
    .await?;
  _ = tx.send(TaskWatchMessage::Status("pending".to_owned()));

  let param = task.param();

  let new_task = NewTask {
    id: task.id().to_owned(),
    source_image: task.source_image().to_vec(),
    target_language: param.target_language.to_string(),
    detector: param.detector.to_string(),
    direction: param.direction.to_string(),
    translator: param.translator.to_string(),
    size: param.size.to_string(),
  };

  send_message(sender, web_socket_message::Message::NewTask(new_task)).await?;

  loop {
    let msg = wait_or_recv(sender, receiver, Duration::from_secs(30)).await?;
    match msg {
      web_socket_message::Message::Status(status) => {
        if status.id != *task.id() {
          tracing::warn!(
            task_id = %task.id(),
            status_id = %status.id,
            status = %status.status,
            "worker sent a mismatched status"
          );
          continue;
        }
        tracing::debug!(task_id = %task.id(), status = %status.status, "task status");
        _ = tx.send(TaskWatchMessage::Status(status.status));
      }
      web_socket_message::Message::FinishTask(finish_task) => {
        if finish_task.id != *task.id() {
          tracing::warn!(
            task_id = %task.id(),
            finish_task_id = %finish_task.id,
            "worker sent a mismatched finish task"
          );
          continue;
        }

        let translation_mask_file = translation_mask_key(task.id());
        r2.public
          .put(&translation_mask_file, &finish_task.translation_mask.into())
          .await?;

        db.task()
          .update(
            prisma::task::id::equals(task.id().to_owned()),
            vec![
              prisma::task::translation_mask::set(Some(translation_mask_file.clone())),
              prisma::task::state::set(prisma::TaskState::Done),
            ],
          )
          .exec()
          .await?;

        let result = TaskResult {
          translation_mask: translation_mask_file,
        };

        return Ok(result);
      }
      _ => (),
    }
  }
}

async fn send_message<S>(
  sender: &mut S,
  message: web_socket_message::Message,
) -> Result<(), axum::Error>
where
  S: Sink<ws::Message, Error = axum::Error> + Unpin,
{
  let msg = WebSocketMessage {
    message: Some(message),
  };
  sender.send(ws::Message::Binary(msg.encode_to_vec())).await
}

async fn wait_or_recv<S, R>(
  sender: &mut S,
  receiver: &mut R,
  timeout: Duration,
) -> Result<web_socket_message::Message, AppError>
where
  S: Sink<ws::Message, Error = axum::Error> + Unpin,
  R: Stream<Item = Result<ws::Message, axum::Error>> + Unpin,
{
  let timeout = tokio::time::sleep(timeout);
  tokio::pin!(timeout);

  loop {
    tokio::select! {
      _ = &mut timeout => {
        return Err(axum::Error::new("timeout").into())
      },
      msg = receiver.next() => {
        let msg = match msg {
          Some(msg) => msg?,
          None => return Err(axum::Error::new("socket closed").into()),
        };
        match msg {
          ws::Message::Binary(msg) => {
            let msg = WebSocketMessage::decode(msg.as_slice())?;
            return Ok(msg.message.ok_or_else(|| axum::Error::new("invalid message"))?);
          }
          ws::Message::Ping(msg) => {
            sender.send(ws::Message::Pong(msg)).await?;
          }
          ws::Message::Close(_) => {
            return Err(axum::Error::new("socket closed").into());
          }
          _ => (),
        }
      }
    }
  }
}
