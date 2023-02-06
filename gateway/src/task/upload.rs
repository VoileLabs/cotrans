use std::{io::Cursor, str::FromStr};

use axum::{
  body::Bytes,
  extract::{DefaultBodyLimit, Multipart, State},
  routing::put,
  Json, Router,
};
use image::{imageops::FilterType, io::Reader as ImageReader, ImageFormat, ImageOutputFormat};
use serde::{Deserialize, Serialize};
use tokio::task::spawn_blocking;

use crate::{
  error::{AppError, AppJsonResult, AppResult},
  images::{self, sha256},
  prisma, r2,
  task::{TaskParam, TaskResult},
  AppState, Database, MITWorkers, R2Client,
};

use super::{db, DBTaskParam, Detector, Direction, Language, Size, TaskState, Translator};

pub fn router() -> Router<AppState> {
  Router::new()
    .route("/v1", put(upload_put_v1).post(upload_post_v1))
    .layer(DefaultBodyLimit::max(1024 * 1024 * 20))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UploadCreateRequest {
  retry: Option<bool>,

  file: Bytes,
  mime: Option<String>,

  param: TaskParam,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct UploadCreateResponse {
  id: String,
  status: String,
  result: Option<TaskResult>,
}

async fn upload_put_v1(
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  multipart: Multipart,
) -> AppJsonResult<UploadCreateResponse> {
  let payload = upload_parse_multipart_v1(multipart).await?;
  upload_create_v1(r2, db, mit_workers, payload, false).await
}

async fn upload_post_v1(
  State(r2): State<R2Client>,
  State(db): State<Database>,
  State(mit_workers): State<MITWorkers>,
  multipart: Multipart,
) -> AppJsonResult<UploadCreateResponse> {
  let payload = upload_parse_multipart_v1(multipart).await?;
  upload_create_v1(r2, db, mit_workers, payload, true).await
}

async fn upload_parse_multipart_v1(mut multipart: Multipart) -> AppResult<UploadCreateRequest> {
  let mut retry = None;
  let mut file = None;
  let mut mime = None;
  let mut target_language = None;
  let mut detector = None;
  let mut direction = None;
  let mut translator = None;
  let mut size = None;

  while let Some(field) = multipart.next_field().await? {
    let name = field
      .name()
      .ok_or_else(|| AppError::BadRequest("Form field missing name".to_string()))?;
    match name {
      "retry" => {
        let text = field.text().await?;
        retry = Some(text.parse().map_err(|_| {
          AppError::BadRequest("retry must be either empty, true or false".to_string())
        })?);
      }
      "file" => {
        let bytes = field.bytes().await?;
        file = Some(bytes);
      }
      "mime" => {
        let text = field.text().await?;
        mime = Some(text.to_owned());
      }
      "target_language" => {
        let text = field.text().await?;
        target_language = Some(Language::from_str(&text)?);
      }
      "detector" => {
        let text = field.text().await?;
        detector = Some(Detector::from_str(&text)?);
      }
      "direction" => {
        let text = field.text().await?;
        direction = Some(Direction::from_str(&text)?);
      }
      "translator" => {
        let text = field.text().await?;
        translator = Some(Translator::from_str(&text)?);
      }
      "size" => {
        let text = field.text().await?;
        size = Some(Size::from_str(&text)?);
      }
      _ => {}
    }
  }

  let file = file.ok_or_else(|| AppError::BadRequest("Missing file".to_string()))?;
  let target_language =
    target_language.ok_or_else(|| AppError::BadRequest("Missing target language".to_string()))?;
  let detector = detector.ok_or_else(|| AppError::BadRequest("Missing detector".to_string()))?;
  let direction = direction.ok_or_else(|| AppError::BadRequest("Missing direction".to_string()))?;
  let translator =
    translator.ok_or_else(|| AppError::BadRequest("Missing translator".to_string()))?;
  let size = size.ok_or_else(|| AppError::BadRequest("Missing size".to_string()))?;

  let param = TaskParam {
    target_language,
    detector,
    direction,
    translator,
    size,
  };

  Ok(UploadCreateRequest {
    retry,
    file,
    mime,
    param,
  })
}

async fn upload_create_v1(
  r2: R2Client,
  db: Database,
  mit_workers: MITWorkers,
  payload: UploadCreateRequest,
  retry: bool,
) -> AppJsonResult<UploadCreateResponse> {
  let retry = payload.retry.unwrap_or(retry);

  tracing::info!(
    file_len = %bytefmt::format(payload.file.len() as u64),
    mime = ?payload.mime,
    param = ?payload.param,
    retry = %retry,
    "received upload request"
  );

  let file = payload.file;

  let (image, png, hash, sha) = spawn_blocking(move || {
    let cursor = Cursor::new(file.clone());
    let mut image = match payload.mime {
      Some(mime) => ImageReader::with_format(
        cursor,
        ImageFormat::from_mime_type(mime)
          .ok_or_else(|| AppError::BadRequest("Invalid MIME type".to_string()))?,
      )
      .decode()?,
      None => ImageReader::new(cursor).with_guessed_format()?.decode()?,
    };

    let width = image.width();
    let height = image.height();
    tracing::debug!(width, height, "decoded image");

    // scale image to less than 6000x6000
    if width > 6000 || height > 6000 {
      let width = width as f64;
      let height = height as f64;
      let (width, height) = if width > height {
        (6000, (6000. / width * height) as u32)
      } else {
        ((6000. / height * width) as u32, 6000)
      };
      image = image.resize_exact(width, height, FilterType::Lanczos3);
    }

    let hash = images::hash(&image);

    let mut png_buf: Vec<u8> = vec![];
    image.write_to(&mut Cursor::new(&mut png_buf), ImageOutputFormat::Png)?;
    let png = Bytes::from(png_buf);

    let sha = sha256(&png);

    AppResult::Ok((image, png, hash, sha))
  })
  .await??;

  let key = r2::upload_image_key(&sha);
  r2.put(&key, &png).await?;

  let source = db
    .source_image()
    .upsert(
      prisma::source_image::hash::equals(hash.clone()),
      prisma::source_image::create(
        hash,
        key.clone(),
        image.width() as i32,
        image.height() as i32,
        vec![],
      ),
      if retry {
        vec![
          prisma::source_image::file::set(key),
          prisma::source_image::width::set(image.width() as i32),
          prisma::source_image::height::set(image.height() as i32),
        ]
      } else {
        vec![]
      },
    )
    .select(prisma::source_image::select!({ id }))
    .exec()
    .await?;

  let db_param: DBTaskParam = payload.param.into();

  let db_task = db::upsert_task(&db, &source.id, db_param, retry).await?;

  if !retry {
    if let (prisma::TaskState::Done, Some(translation_mask)) =
      (db_task.state, &db_task.translation_mask)
    {
      return Ok(Json(UploadCreateResponse {
        id: db_task.id.clone(),
        status: TaskState::from(db_task.state).to_string(),
        result: Some(TaskResult {
          translation_mask: r2.public_url(translation_mask),
        }),
      }));
    }
  }

  let id = db_task.id.clone();

  mit_workers.dispatch(db_task, Some(png)).await?;

  Ok(Json(UploadCreateResponse {
    id,
    status: TaskState::Pending.to_string(),
    result: None,
  }))
}
