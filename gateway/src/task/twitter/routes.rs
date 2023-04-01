use axum::{extract::State, routing::put, Json, Router};
use serde::{Deserialize, Serialize};

use crate::{
  error::{AppError, AppJsonResult},
  prisma,
  task::{db, DBTaskParam, TaskParam, TaskResult, TaskState},
  AppState, Database, HttpClient, MITWorkers, R2Client,
};

use super::scrape;

pub fn router() -> Router<AppState> {
  Router::new().route("/v1", put(twitter_put_v1).post(twitter_post_v1))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct TwitterCreateRequest {
  tweet: String,
  photo: i32,

  #[serde(flatten)]
  param: TaskParam,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct TwitterCreateResponse {
  id: String,
  status: String,
  result: Option<TaskResult>,
}

async fn twitter_put_v1(
  State(http_client): State<HttpClient>,
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  Json(payload): Json<TwitterCreateRequest>,
) -> AppJsonResult<TwitterCreateResponse> {
  twitter_create_v1(http_client, r2, db, mit_workers, payload, false).await
}

async fn twitter_post_v1(
  State(http_client): State<HttpClient>,
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  Json(payload): Json<TwitterCreateRequest>,
) -> AppJsonResult<TwitterCreateResponse> {
  twitter_create_v1(http_client, r2, db, mit_workers, payload, true).await
}

async fn twitter_create_v1(
  http_client: HttpClient,
  r2: R2Client,
  db: Database,
  mit_workers: MITWorkers,
  payload: TwitterCreateRequest,
  retry: bool,
) -> AppJsonResult<TwitterCreateResponse> {
  let existing = db
    .twitter_source()
    .find_unique(prisma::twitter_source::tweet_id_photo_index(
      payload.tweet.clone(),
      payload.photo,
    ))
    .select(prisma::twitter_source::select!({
      pbs_id
      source_image_id
    }))
    .exec()
    .await?;

  let (source_image_id, source_image) = if let Some(existing) = existing {
    (existing.source_image_id, None)
  } else {
    let images = scrape::twitter_tweet_images(&payload.tweet, &http_client, &r2, &db).await?;
    let len = images.len();
    let (source_image_id, image) = images
      .into_iter()
      .nth(payload.photo as usize - 1)
      .ok_or_else(|| {
        AppError::BadRequest(format!(
          "Invalid photo number: {} out of {}",
          payload.photo, len
        ))
      })??;
    (source_image_id, Some(image))
  };

  let db_param: DBTaskParam = payload.param.into();

  let db_task = db::upsert_task(&db, &source_image_id, db_param, retry).await?;

  if !retry && matches!(db_task.state, prisma::TaskState::Done) {
    return Ok(Json(TwitterCreateResponse {
      id: db_task.id.clone(),
      status: db_task.state.to_string(),
      result: db_task.translation_mask.map(|translation_mask| TaskResult {
        translation_mask: r2.public.public_url(&translation_mask),
      }),
    }));
  }

  let id = db_task.id.clone();

  mit_workers.dispatch(db_task, source_image).await?;

  Ok(Json(TwitterCreateResponse {
    id,
    status: TaskState::Pending.to_string(),
    result: None,
  }))
}
