use std::{io::Cursor, num::NonZeroU32};

use fast_image_resize as fr;
use image::{
  codecs::png::{CompressionType, PngEncoder},
  io::Reader as ImageReader,
  DynamicImage, ImageEncoder, ImageFormat,
};
use image_hasher::{Hasher, HasherConfig};
use js_sys::{ArrayBuffer, Uint8Array};
use once_cell::sync::Lazy;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use worker::*;
use worker_sys::R2Bucket;

static HASHER: Lazy<Hasher> = Lazy::new(|| {
  HasherConfig::new()
    .hash_size(10, 10)
    .resize_filter(image_hasher::FilterType::Lanczos3)
    .preproc_dct()
    .to_hasher()
});

pub fn hash_image(image: &DynamicImage) -> String {
  let hash = HASHER.hash_image(image);
  hex::encode(hash.as_bytes())
}

#[event(fetch)]
async fn main(req: Request, env: Env, ctx: Context) -> Result<Response> {
  handle(req, env, ctx).await
}

#[derive(Serialize)]
struct ResponseJson {
  key: String,
  width: u32,
  height: u32,
  size: usize,
  hash: String,
  sha: String,
}

async fn handle(mut req: Request, env: Env, ctx: Context) -> Result<Response> {
  let worker: web_sys::WorkerGlobalScope = js_sys::global().unchecked_into();
  let bucket_pri: R2Bucket = js_sys::Reflect::get(&env, &JsValue::from("BUCKET_PRI"))
    .unwrap()
    .unchecked_into();

  let form = req.form_data().await?;

  let Some(FormEntry::File(file)) = form.get("file") else {
    return Response::error("No file found", 400);
  };
  let file = file.bytes().await?;

  let mime = match form.get("mime") {
    Some(FormEntry::Field(mime)) => Some(mime),
    _ => None,
  };

  let cursor = Cursor::new(file.clone());
  let mut image = match mime {
    Some(mime) if !mime.is_empty() => {
      let Some(format) = ImageFormat::from_mime_type(mime) else {
        return Response::error("Invalid MIME type", 400);
      };
      let Ok(image) = ImageReader::with_format(cursor, format).decode() else {
        return Response::error("Invalid image", 400);
      };
      image
    }
    _ => {
      let Ok(reader) = ImageReader::new(cursor).with_guessed_format() else {
        return Response::error("Could not guess image format", 400);
      };
      let Ok(image) = reader.decode() else {
        return Response::error("Invalid image", 400);
      };
      image
    }
  };

  let mut width = image.width();
  let mut height = image.height();

  image = match image {
    DynamicImage::ImageRgb8(_) => image,
    DynamicImage::ImageRgba8(_) => image,
    DynamicImage::ImageLuma8(_) => image,
    DynamicImage::ImageLumaA8(_) => image,
    _ => DynamicImage::ImageRgba8(image.to_rgba8()),
  };

  // scale image to less than 6000x6000
  if width > 6000 || height > 6000 {
    let widthf: f64 = width as f64;
    let heightf: f64 = height as f64;

    let (nwidth, nheight) = if widthf > heightf {
      (6000, (6000. / widthf * heightf).round() as u32)
    } else {
      ((6000. / heightf * widthf).round() as u32, 6000)
    };

    image = resize(image, nwidth, nheight);

    width = nwidth;
    height = nheight;
  }

  // sha using SubtleCrypto
  let sha: ArrayBuffer = JsFuture::from(
    worker
      .crypto()?
      .subtle()
      .digest_with_str_and_buffer_source(
        "SHA-256",
        &unsafe { Uint8Array::view(image.as_bytes()) }.into(),
      )?,
  )
  .await?
  .unchecked_into();
  let sha = hex::encode(Uint8Array::new(&sha).to_vec());

  let mut png_buf: Vec<u8> = vec![];
  if let Err(_) = PngEncoder::new_with_quality(
    &mut Cursor::new(&mut png_buf),
    CompressionType::Fast,
    image::codecs::png::FilterType::default(),
  )
  .write_image(image.as_bytes(), width, height, image.color())
  {
    return Response::error("Could not encode image", 500);
  };

  let size = png_buf.len();

  let key = "upload/".to_owned() + &sha + ".png";
  let put_res = JsFuture::from(bucket_pri.put(
    key.clone(),
    unsafe { Uint8Array::view(&png_buf).into() },
    JsValue::UNDEFINED,
  ));

  // hash the image while we wait for the upload to finish
  let hash = hash_image(&image);
  let _ = put_res.await?;

  Response::from_json(&ResponseJson {
    key,
    width,
    height,
    size,
    hash,
    sha,
  })
}

fn resize(image: DynamicImage, width: u32, height: u32) -> DynamicImage {
  let pixel_type = match image {
    DynamicImage::ImageRgb8(_) => fr::PixelType::U8x3,
    DynamicImage::ImageRgba8(_) => fr::PixelType::U8x4,
    DynamicImage::ImageLuma8(_) => fr::PixelType::U8,
    DynamicImage::ImageLumaA8(_) => fr::PixelType::U8x2,
    _ => unreachable!(),
  };

  let mut src_img = fr::Image::from_vec_u8(
    NonZeroU32::new(image.width()).unwrap(),
    NonZeroU32::new(image.height()).unwrap(),
    image.into_bytes(),
    pixel_type,
  )
  .unwrap();

  // multiple RGB channels of source image by alpha channel
  // (not required for the Nearest algorithm)
  let alpha_mul_div = fr::MulDiv::default();
  if pixel_type == fr::PixelType::U8x4 || pixel_type == fr::PixelType::U8x2 {
    alpha_mul_div
      .multiply_alpha_inplace(&mut src_img.view_mut())
      .unwrap();
  }

  let mut dst_img = fr::Image::new(
    NonZeroU32::new(width).unwrap(),
    NonZeroU32::new(height).unwrap(),
    src_img.pixel_type(),
  );

  let mut dst_view = dst_img.view_mut();

  let mut resizer = fr::Resizer::new(fr::ResizeAlg::Convolution(fr::FilterType::Lanczos3));
  resizer.resize(&src_img.view(), &mut dst_view).unwrap();

  if pixel_type == fr::PixelType::U8x4 || pixel_type == fr::PixelType::U8x2 {
    alpha_mul_div.divide_alpha_inplace(&mut dst_view).unwrap();
  }

  match pixel_type {
    fr::PixelType::U8x3 => DynamicImage::ImageRgb8(
      image::RgbImage::from_vec(
        dst_img.width().get(),
        dst_img.height().get(),
        dst_img.into_vec(),
      )
      .unwrap(),
    ),
    fr::PixelType::U8x4 => DynamicImage::ImageRgba8(
      image::RgbaImage::from_vec(
        dst_img.width().get(),
        dst_img.height().get(),
        dst_img.into_vec(),
      )
      .unwrap(),
    ),
    fr::PixelType::U8 => DynamicImage::ImageLuma8(
      image::GrayImage::from_vec(
        dst_img.width().get(),
        dst_img.height().get(),
        dst_img.into_vec(),
      )
      .unwrap(),
    ),
    fr::PixelType::U8x2 => DynamicImage::ImageLumaA8(
      image::GrayAlphaImage::from_vec(
        dst_img.width().get(),
        dst_img.height().get(),
        dst_img.into_vec(),
      )
      .unwrap(),
    ),
    _ => unreachable!(),
  }
}
