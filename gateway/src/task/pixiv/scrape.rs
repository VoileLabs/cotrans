use axum::body::Bytes;
use futures::future::join_all;
use http::header;
use thiserror::Error;
use tokio::task::{spawn_blocking, JoinHandle};

use crate::{error::AppResult, images, prisma, r2, Database, HttpClient, R2Client};

pub async fn pixiv_artwork(
  artwork_id: i64,
  http_client: &HttpClient,
  r2: &R2Client,
  db: &Database,
) -> AppResult<Vec<AppResult<(String, Bytes)>>> {
  let info = pixiv_artwork_ajax(artwork_id, http_client).await?;
  let pages = pixiv_artwork_pages_ajax(artwork_id, http_client).await?;

  // download images in parallel
  let tasks: Vec<JoinHandle<AppResult<(String, Bytes)>>> = pages
    .images
    .clone()
    .into_iter()
    .enumerate()
    .map(|(index, image_url)| {
      let r2 = r2.clone();
      let http_client = http_client.clone();
      let db = db.clone();
      let page = index as i32 + 1;

      tokio::spawn(async move {
        let image = http_client.get(&image_url).send().await?;
        let image_bytes = image.bytes().await?;

        let image_file = r2::pixiv_image_key(artwork_id, page);
        r2.put(&image_file, &image_bytes).await?;

        let image = images::load_bytes_guessed(&image_bytes)?;
        let (hash, image) = spawn_blocking(move || (images::hash(&image), image)).await?;

        let source = db
          .source_image()
          .upsert(
            prisma::source_image::hash::equals(hash.clone()),
            prisma::source_image::create(
              hash,
              r2::pixiv_image_key(artwork_id, page),
              image.width() as i32,
              image.height() as i32,
              vec![],
            ),
            vec![],
          )
          .select(prisma::source_image::select!({ id }))
          .exec()
          .await?;

        db.pixiv_source()
          .upsert(
            prisma::pixiv_source::artwork_id_page(artwork_id, page),
            prisma::pixiv_source::create(
              artwork_id,
              page,
              image_url.clone(),
              info.author_id,
              prisma::source_image::id::equals(source.id.clone()),
              vec![],
            ),
            vec![
              prisma::pixiv_source::orig_url::set(image_url),
              prisma::pixiv_source::author_id::set(info.author_id),
              prisma::pixiv_source::source_image_id::set(source.id.clone()),
            ],
          )
          .exec()
          .await?;

        Ok((source.id, image_bytes))
      })
    })
    .collect();

  let results = join_all(tasks).await;

  let mut images = Vec::with_capacity(results.len());
  for result in results {
    images.push(match result {
      Ok(Ok(image)) => Ok(image),
      Ok(Err(err)) => Err(err),
      Err(err) => Err(err.into()),
    });
  }

  Ok(images)
}

struct ParsedArtworkAjax {
  author_id: i64,
}

#[derive(Debug, Clone, Error)]
#[error("Failed to parse pixiv artwork ajax")]
pub enum ParsePixivArtworkAjaxError {
  ResponseError(String),
  NoAuthorId,
}

async fn pixiv_artwork_ajax(
  artwork_id: i64,
  http_client: &HttpClient,
) -> AppResult<ParsedArtworkAjax> {
  let res = http_client
    .get(&format!("https://www.pixiv.net/ajax/illust/{artwork_id}"))
    .header(header::USER_AGENT, "bot")
    .send()
    .await?;

  let text = res.text().await?;
  let json: serde_json::Value = serde_json::from_str(&text)?;

  json
    .get("error")
    .and_then(|error| error.as_bool())
    .ok_or(ParsePixivArtworkAjaxError::ResponseError(text))?;

  let author_id = json
    .get("body")
    .and_then(|body| body.get("userId"))
    .and_then(|user_id| user_id.as_str())
    .and_then(|user_id| user_id.parse::<i64>().ok())
    .ok_or(ParsePixivArtworkAjaxError::NoAuthorId)?;

  Ok(ParsedArtworkAjax { author_id })
}

struct ParsedArtworkPagesAjax {
  images: Vec<String>,
}

#[derive(Debug, Clone, Error)]
#[error("Failed to parse pixiv artwork pages ajax")]
pub enum ParsePixivArtworkPagesAjaxError {
  ResponseError(String),
  NoImage,
}

async fn pixiv_artwork_pages_ajax(
  artwork_id: i64,
  http_client: &HttpClient,
) -> AppResult<ParsedArtworkPagesAjax> {
  let res = http_client
    .get(&format!(
      "https://www.pixiv.net/ajax/illust/{artwork_id}/pages"
    ))
    .header(header::USER_AGENT, "bot")
    .send()
    .await?;

  let text = res.text().await?;
  let json: serde_json::Value = serde_json::from_str(&text)?;

  json
    .get("error")
    .and_then(|error| error.as_bool())
    .ok_or(ParsePixivArtworkPagesAjaxError::ResponseError(text))?;

  let images = json
    .get("body")
    .and_then(|body| body.as_array())
    .ok_or(ParsePixivArtworkPagesAjaxError::NoImage)?
    .iter()
    .filter_map(|image| image.get("urls").and_then(|urls| urls.get("original")))
    .filter_map(|url| url.as_str())
    .map(|url| url.to_owned())
    .collect();

  Ok(ParsedArtworkPagesAjax { images })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_ajax() {
    let http_client = reqwest::Client::new();

    let artwork_id = 102868200i64;

    let info = pixiv_artwork_ajax(artwork_id, &http_client).await.unwrap();

    assert_eq!(info.author_id, 4333566);

    let pages = pixiv_artwork_pages_ajax(artwork_id, &http_client)
      .await
      .unwrap();

    assert_eq!(pages.images.len(), 11);
    assert_eq!(
      pages.images[0],
      "https://i.pximg.net/img-original/img/2022/11/17/20/00/14/102868200_p0.jpg"
    );
  }
}
