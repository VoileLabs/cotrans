use std::io::Cursor;

use axum::body::Bytes;
use image::{io::Reader as ImageReader, DynamicImage, ImageError, ImageFormat};
use image_hasher::{FilterType, Hasher, HasherConfig};
use once_cell::sync::Lazy;
use ring::digest;

use crate::{error::AppResult, R2Client};

pub fn load_bytes(bytes: &Bytes) -> Result<DynamicImage, ImageError> {
  ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png).decode()
}

pub fn load_bytes_guessed(bytes: &Bytes) -> Result<DynamicImage, ImageError> {
  ImageReader::new(Cursor::new(bytes))
    .with_guessed_format()?
    .decode()
}

pub async fn load_r2(key: &str, r2_client: &R2Client) -> AppResult<DynamicImage> {
  let bytes = r2_client.get(key).await?;
  Ok(load_bytes(&bytes)?)
}

static HASHER: Lazy<Hasher> = Lazy::new(|| {
  HasherConfig::new()
    .hash_size(12, 12)
    .resize_filter(FilterType::Lanczos3)
    .preproc_dct()
    .to_hasher()
});

pub fn hash(image: &DynamicImage) -> String {
  let hash = HASHER.hash_image(image);
  hex::encode(hash.as_bytes())
}

pub fn sha256(bytes: &Bytes) -> String {
  let dig = digest::digest(&digest::SHA256, bytes);
  hex::encode(dig)
}
