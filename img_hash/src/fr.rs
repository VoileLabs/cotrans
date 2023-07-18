use std::num::NonZeroU32;

use fast_image_resize as fr;
pub use fr::FilterType;
use image::GrayImage;

pub fn resize_gray(image: &GrayImage, width: u32, height: u32, filter: FilterType) -> GrayImage {
  let src_view: fr::ImageView<'_, fr::pixels::U8> = fr::ImageView::from_buffer(
    NonZeroU32::new(image.width()).unwrap(),
    NonZeroU32::new(image.height()).unwrap(),
    image.as_raw(),
  )
  .unwrap();
  let src_view = fr::DynamicImageView::from(src_view);

  let mut dst_img = fr::Image::new(
    NonZeroU32::new(width).unwrap(),
    NonZeroU32::new(height).unwrap(),
    fr::PixelType::U8,
  );

  let mut dst_view = dst_img.view_mut();

  let mut resizer = fr::Resizer::new(fr::ResizeAlg::Convolution(filter));
  resizer.resize(&src_view, &mut dst_view).unwrap();

  image::GrayImage::from_vec(
    dst_img.width().get(),
    dst_img.height().get(),
    dst_img.into_vec(),
  )
  .unwrap()
}
