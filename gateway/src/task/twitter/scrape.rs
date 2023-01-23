use axum::body::Bytes;
use futures::future::join_all;
use http::header;
use once_cell::sync::Lazy;
use quick_xml::events::Event;
use regex::Regex;
use tokio::task::{spawn_blocking, JoinHandle};

use crate::{error::AppResult, images, prisma, r2, Database, HttpClient, R2Client};

// https://pbs.twimg.com/media/Bm54nBCCYAACwBi.jpg
static TWITTER_PBS_RE: Lazy<Regex> =
  Lazy::new(|| Regex::new(r#"//pbs\.twimg\.com/media/(\w+)"#).unwrap());

pub async fn twitter_tweet_images(
  tweet_id: &str,
  http_client: &HttpClient,
  r2: &R2Client,
  db: &Database,
) -> AppResult<Vec<AppResult<(String, Bytes)>>> {
  let tweet = twitter_tweet(tweet_id, http_client).await?;
  let tweet_text = tweet.text().await?;

  let info = parse_tweet(&tweet_text)?;

  // download images in parallel
  let tasks: Vec<JoinHandle<AppResult<(String, Bytes)>>> = info
    .images
    .clone()
    .into_iter()
    .enumerate()
    .map(|(index, image_id)| {
      let r2 = r2.clone();
      let tweet_id = tweet_id.to_owned();
      let http_client = http_client.clone();
      let db = db.clone();

      tokio::spawn(async move {
        let image = http_client
          .get(&format!("https://pbs.twimg.com/media/{}.png", image_id))
          .send()
          .await?;
        let image_bytes = image.bytes().await?;

        let image_file = r2::tweet_image_key(&tweet_id, &image_id);
        r2.put(&image_file, &image_bytes).await?;

        let image = images::load_bytes(&image_bytes)?;
        let (hash, image) = spawn_blocking(move || (images::hash(&image), image)).await?;

        let source = db
          .source_image()
          .upsert(
            prisma::source_image::hash::equals(hash.clone()),
            prisma::source_image::create(
              hash,
              r2::tweet_image_key(&tweet_id, &image_id),
              image.width() as i32,
              image.height() as i32,
              vec![],
            ),
            vec![],
          )
          .select(prisma::source_image::select!({ id }))
          .exec()
          .await?;

        db.twitter_source()
          .upsert(
            prisma::twitter_source::tweet_id_photo_index(tweet_id.clone(), index as i32 + 1),
            prisma::twitter_source::create(
              tweet_id.to_string(),
              index as i32 + 1,
              image_id.clone(),
              info.author_id,
              prisma::source_image::id::equals(source.id.clone()),
              vec![],
            ),
            vec![
              prisma::twitter_source::pbs_id::set(image_id),
              prisma::twitter_source::author_id::set(info.author_id),
              prisma::twitter_source::source_image_id::set(source.id.clone()),
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

pub async fn twitter_tweet(
  tweet_id: &str,
  http_client: &HttpClient,
) -> Result<reqwest::Response, reqwest::Error> {
  http_client
    .get(&format!("https://twitter.com/_/status/{}", tweet_id))
    .header(header::USER_AGENT, "bot")
    .send()
    .await
}

struct ParsedTwitterTweet {
  author_id: i64,
  images: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum ParseTwitterTweetError {
  NoAuthorId,
}

/// Parse images from a tweet page
fn parse_tweet(html: &str) -> Result<ParsedTwitterTweet, ParseTwitterTweetError> {
  let mut reader = quick_xml::Reader::from_str(html);
  reader.check_end_names(false);

  let mut author_id: Option<i64> = None;
  let mut images: Vec<String> = Vec::new();

  let mut in_tweet = false;
  let mut in_img = false;
  let mut in_author = false;

  loop {
    let Ok(e) = reader.read_event() else {
      break;
    };
    match e {
      Event::Start(e) => {
        if e.name().as_ref() == b"div" {
          if let Ok(Some(attr)) = e.try_get_attribute(b"itemType") {
            match attr.value.as_ref() {
              b"https://schema.org/SocialMediaPosting" => in_tweet = true,
              b"https://schema.org/Person" => in_author = true,
              b"https://schema.org/ImageObject" => in_img = true,
              _ => (),
            }
          }
        }
      }

      Event::Empty(e) if in_tweet => {
        if e.name().as_ref() == b"meta" {
          if in_img {
            // <meta content="https://pbs.twimg.com/media/Bm54nBCCYAACwBi.jpg" itemProp="contentUrl" />
            if let Ok(Some(item_prop)) = e.try_get_attribute(b"itemProp") {
              if item_prop.value.as_ref() == b"contentUrl" {
                if let Ok(Some(content)) = e.try_get_attribute(b"content") {
                  let url = String::from_utf8_lossy(content.value.as_ref());
                  let caps = TWITTER_PBS_RE.captures(&url);
                  if let Some(caps) = caps {
                    images.push(caps[1].to_string());
                  }
                }
              }
            }
          } else if in_author {
            // <meta content="76348185" itemprop="identifier" />
            if let Ok(Some(item_prop)) = e.try_get_attribute(b"itemProp") {
              if item_prop.value.as_ref() == b"identifier" {
                if let Ok(Some(content)) = e.try_get_attribute(b"content") {
                  if let Ok(id_str) = std::str::from_utf8(content.value.as_ref()) {
                    if let Ok(id) = id_str.parse::<i64>() {
                      author_id = Some(id);
                    }
                  }
                }
              }
            }
          }
        }
      }

      Event::End(e) => match e.name().as_ref() {
        b"article" if in_tweet => break,
        b"div" if in_img => in_img = false,
        b"div" if in_author => in_author = false,
        _ => (),
      },

      Event::Eof => break,
      _ => (),
    }
  }

  let Some(author_id) = author_id else {
    return Err(ParseTwitterTweetError::NoAuthorId)
  };

  Ok(ParsedTwitterTweet { author_id, images })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_parse_images() {
    let client = reqwest::Client::new();

    let res = client
      .get("https://twitter.com/_/status/463440424141459456")
      .header(header::USER_AGENT, "bot")
      .send()
      .await
      .unwrap();

    let html = res.text().await.unwrap();

    let info = parse_tweet(&html);

    assert!(info.is_ok());

    let info = info.unwrap();

    assert_eq!(info.author_id, 76348185);
    assert_eq!(info.images.len(), 1);
    assert_eq!(info.images[0], "Bm54nBCCYAACwBi");
  }
}
