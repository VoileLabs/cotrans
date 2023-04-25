use axum::body::Bytes;
use image::DynamicImage;
use image_hasher::{FilterType, Hasher, HasherConfig};
use once_cell::sync::Lazy;
use ring::digest;

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
