use crate::models::{SupportedDetector, SupportedDirection, SupportedTranslator, SupportedLanguages};


pub async fn post(
    raw_image_bytes: &[u8],
    translator: SupportedTranslator,
    size: u32,
    direction: SupportedDirection,
    detector: SupportedDetector,
    target_language: SupportedLanguages,
) {
    
}
