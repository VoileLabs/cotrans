use axum::{
  extract::{
    ws::{self, WebSocket},
    Path, State, WebSocketUpgrade,
  },
  response::IntoResponse,
  routing::get,
  Router,
};
use serde::{Deserialize, Serialize};

use crate::{
  error::{AppError, AppResult},
  mit_worker::{DBToTask, TaskWatchMessage},
  prisma, AppState, Database, MITWorkers, R2Client,
};

use super::{pixiv, twitter, upload, TaskResult};

pub fn router() -> Router<AppState> {
  Router::new()
    .nest("/twitter", twitter::router())
    .nest("/pixiv", pixiv::router())
    .nest("/upload", upload::router())
    .route("/:id/event/v1", get(task_query_v1))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum QueryV1Message {
  #[serde(rename = "pending")]
  Pending { pos: usize },
  #[serde(rename = "status")]
  Status { status: String },
  #[serde(rename = "result")]
  Result { result: TaskResult },
  #[serde(rename = "error")]
  Error { error_id: Option<String> },
  #[serde(rename = "not_found")]
  NotFound,
}

async fn task_query_v1(
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  Path(id): Path<String>,
  ws: WebSocketUpgrade,
) -> impl IntoResponse {
  ws.on_upgrade(|mut socket| async move {
    let res = task_query_v1_ws(r2, db, mit_workers, id, &mut socket);
    if let Err(err) = res.await {
      let msg = QueryV1Message::Error {
        error_id: Some(err.to_string()),
      };
      if let Ok(msg) = serde_json::to_string(&msg) {
        _ = socket.send(msg.into()).await;
      }
    }
  })
}

async fn task_query_v1_ws(
  r2: R2Client,
  db: Database,
  mit_workers: MITWorkers,
  id: String,
  socket: &mut WebSocket,
) -> AppResult<()> {
  let db_task = db
    .task()
    .find_unique(prisma::task::id::equals(id.clone()))
    .include(DBToTask::include())
    .exec()
    .await?
    .ok_or(AppError::NotFound)?;

  if let (prisma::TaskState::Done, Some(translation_mask)) =
    (db_task.state, &db_task.translation_mask)
  {
    _ = send_msg(
      socket,
      QueryV1Message::Result {
        result: TaskResult {
          translation_mask: r2.public_url(translation_mask),
        },
      },
    )
    .await;
    return Ok(());
  }

  let mut rx = match mit_workers.subscribe(&id).await {
    Some(rx) => rx,
    None => {
      send_msg(socket, QueryV1Message::NotFound).await?;
      return Ok(());
    }
  };

  let msg = rx.borrow().to_owned();
  let finish = send_watch_msg(&r2, socket, msg).await?;
  if finish {
    return Ok(());
  }

  loop {
    tokio::select! {
      msg = socket.recv() => match msg {
        Some(Ok(msg)) => match msg {
          ws::Message::Ping(msg) => {
            _ = socket.send(ws::Message::Pong(msg)).await;
          }
          ws::Message::Close(_) => {
            return Ok(());
          }
          _ => (),
        },
        _ => return Ok(()),
      },
      changed = rx.changed() => match changed {
        Ok(_) => {
          let msg = rx.borrow().to_owned();
          let finish = send_watch_msg(&r2, socket, msg).await?;
          if finish {
            return Ok(());
          }
        },
        Err(err) => return Err(AppError::from(err)),
      },
    }
  }
}

async fn send_watch_msg(
  r2: &R2Client,
  socket: &mut WebSocket,
  msg: TaskWatchMessage,
) -> AppResult<bool> {
  match msg {
    TaskWatchMessage::Pending(pos) => {
      send_msg(socket, QueryV1Message::Pending { pos }).await?;
      return Ok(false);
    }
    TaskWatchMessage::Status(status) => {
      send_msg(socket, QueryV1Message::Status { status }).await?;
      return Ok(false);
    }
    TaskWatchMessage::Result(result) => {
      send_msg(
        socket,
        QueryV1Message::Result {
          result: TaskResult {
            translation_mask: r2.public_url(&result.translation_mask),
          },
        },
      )
      .await?;
      return Ok(true);
    }
    TaskWatchMessage::Error => {
      send_msg(socket, QueryV1Message::Error { error_id: None }).await?;
      return Ok(true);
    }
  }
}

async fn send_msg(socket: &mut WebSocket, msg: QueryV1Message) -> AppResult<()> {
  let msg = serde_json::to_string(&msg)?;
  socket.send(msg.into()).await.map_err(AppError::from)
}
