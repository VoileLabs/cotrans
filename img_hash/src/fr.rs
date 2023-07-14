use std::num::NonZeroU32;

use fast_image_resize as fr;
pub use fr::FilterType;
use image::GrayImage;

pub fn resize_gray(image: &GrayImage, width: u32, height: u32, filter: FilterType) -> GrayImage {
  let src_img = fr::Image::from_vec_u8(
    NonZeroU32::new(image.width()).unwrap(),
    NonZeroU32::new(image.height()).unwrap(),
    image.as_raw().to_vec(),
    fr::PixelType::U8,
  )
  .unwrap();

  let mut dst_img = fr::Image::new(
    NonZeroU32::new(width).unwrap(),
    NonZeroU32::new(height).unwrap(),
    fr::PixelType::U8,
  );

  let mut dst_view = dst_img.view_mut();

  let mut resizer = fr::Resizer::new(fr::ResizeAlg::Convolution(filter));
  resizer.resize(&src_img.view(), &mut dst_view).unwrap();

  image::GrayImage::from_vec(
    dst_img.width().get(),
    dst_img.height().get(),
    dst_img.into_vec(),
  )
  .unwrap()
}
