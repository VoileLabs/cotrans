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
  Router::new().route("/v1", put(pixiv_put_v1).post(pixiv_post_v1))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PixivCreateRequest {
  artwork: i64,
  page: i32,

  #[serde(flatten)]
  param: TaskParam,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PixivCreateResponse {
  id: String,
  status: String,
  result: Option<TaskResult>,
}

async fn pixiv_put_v1(
  State(http_client): State<HttpClient>,
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  Json(payload): Json<PixivCreateRequest>,
) -> AppJsonResult<PixivCreateResponse> {
  pixiv_create_v1(http_client, r2, db, mit_workers, payload, false).await
}

async fn pixiv_post_v1(
  State(http_client): State<HttpClient>,
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  Json(payload): Json<PixivCreateRequest>,
) -> AppJsonResult<PixivCreateResponse> {
  pixiv_create_v1(http_client, r2, db, mit_workers, payload, true).await
}

async fn pixiv_create_v1(
  http_client: HttpClient,
  r2: R2Client,
  db: Database,
  mit_workers: MITWorkers,
  payload: PixivCreateRequest,
  retry: bool,
) -> AppJsonResult<PixivCreateResponse> {
  let existing = db
    .pixiv_source()
    .find_unique(prisma::pixiv_source::artwork_id_page(
      payload.artwork,
      payload.page,
    ))
    .select(prisma::pixiv_source::select!({ source_image_id }))
    .exec()
    .await?;

  let (source_image_id, source_image) = if let Some(existing) = existing {
    (existing.source_image_id, None)
  } else {
    let images = scrape::pixiv_artwork(payload.artwork, &http_client, &r2, &db).await?;
    let len = images.len();
    let (source_image_id, image) =
      images
        .into_iter()
        .nth(payload.page as usize)
        .ok_or_else(|| {
          AppError::BadRequest(format!(
            "Invalid page number: {} out of {}",
            payload.page, len
          ))
        })??;
    (source_image_id, Some(image))
  };

  let db_param: DBTaskParam = payload.param.into();

  let db_task = db::upsert_task(&db, &source_image_id, db_param, retry).await?;

  if !retry && matches!(db_task.state, prisma::TaskState::Done) {
    return Ok(Json(PixivCreateResponse {
      id: db_task.id.clone(),
      status: db_task.state.to_string(),
      result: db_task.translation_mask.map(|translation_mask| TaskResult {
        translation_mask: r2.public_url(&translation_mask),
      }),
    }));
  }

  let id = db_task.id.clone();

  mit_workers.dispatch(db_task, source_image).await?;

  Ok(Json(PixivCreateResponse {
    id,
    status: TaskState::Pending.to_string(),
    result: None,
  }))
}
