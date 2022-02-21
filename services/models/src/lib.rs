use std::collections::HashSet;

use bson::oid::ObjectId;


pub struct ImageSource {
    /// Canonicalized raw URL of source image (e.g. twitter CDN url)
    pub source_url: Option<String>,
    /// Canonicalized URL of web page for this image (e.g. twitter url)
    pub source_page: Option<String>,
    /// When is the image created, this is provided by its source website, fill this field whenever possible
    pub created_at: Option<bson::DateTime>,
    /// When is the image uploaded to cotrans
    pub uploaded_at: bson::DateTime,
    /// Who uploaded this image to cotrans
    pub uploaded_by: String,
}

pub struct OriginalImage {
    /// Sources of this image
    /// Use vec in case of same image being reposted at multiple websites
    pub sources: Vec<ImageSource>,
    /// Highest width of this image, there maybe multiple version of the same image exist
    /// we only keep the one with highest resolution
    pub width: u32,
    /// Highest height of this image, there maybe multiple version of the same image exist
    /// we only keep the one with highest resolution
    pub height: u32,
    /// File size in octets of the best version of this image
    pub file_size: u64,
    /// Format of this image (e.g. JPEG, PNG, WEBM)
    pub image_format: Option<String>,
    /// Number of channels in this image (e.g. 1 for grayscale, 3 for RGB, 4 for RGBA)
    pub channels: u32,
    /// When is image with this phash value first uploaded to cotrans
    pub created_at: bson::DateTime,
    /// Who is the first one uploaded image with this phash value to cotrans
    pub created_by: String,

    /// <KEY> Perceptual hash value of this image
    pub phash_value: String,
    /// Blockhash value of this image (optional)
    pub blockhash_value: Option<String>,
    /// Wavelet hash value of this image (optional)
    pub whash_value: Option<String>,

    /// Link to cotrans' store of this image, likely a Cloudflare image link
    pub url: String,
    /// Optional backup links to this image
    pub backup_urls: Option<Vec<String>>,
    /// SHA256 hash of this image
    pub sha256_value: String
}

/// For flexibility, result does not have a fixed form
pub enum FreeFormResult {
    JSON(String),
    XML(String)
}

pub struct TextExtractionResult {
    /// Link to mask generated
    pub mask_url: String,

    /// Format of result
    pub format: String,
    /// Extracted text
    pub result: FreeFormResult
}

/// Record of a automatic text extraction operation, incldues both metadata and result
pub struct TextExtraction {
    /// Which image is this record for
    pub phash_value: String,
    /// When is this text extraction request made
    pub created_at: bson::DateTime,
    /// Who made this text extraction request
    pub created_by: String,
    /// How long did this request take to finish
    pub time_used_ms: u32,
    /// Log
    pub log: Option<String>,

    /// Name and version of detector (e.g. `DBNet-RN101-v20210711`)
    pub detector: String,
    /// Name and version of OCR (e.g. `OCR-AR-48px-v20210921`)
    pub ocr: String,

    /// Height of image sent to detector
    pub detection_height: u32,
    /// Width of image sent to detector
    pub detection_width: u32,

    /// Extraction result
    pub result: TextExtractionResult
}

pub struct Inpainting {
    /// Inpainting model name and version (e.g. `LaMa-v20220220`)
    pub model: String,
    /// Link to inpainted image
    pub inpainted_url: String,
    /// Link to mask used during inpainting
    pub mask: String,
    /// Width of image used for inpainting
    pub width: u32,
    /// Height of image used for inpainting
    pub height: u32,
    /// Blending method used, one of `replace`, `poisson`, `cutout`
    pub blending: String
}

pub struct Typesetting {

}

pub struct TextRendering {

}


pub struct Translation {
    /// Which image is this record for
    pub phash_value: String,
    /// Which extraction result is this record based on
    pub extraction_id: Option<ObjectId>,
    /// Which translation result is this record based on
    pub translation_id: Option<ObjectId>,
    /// When is this translation created
    pub created_at: bson::DateTime,
    /// Who made this translation
    pub created_by: CreatedBy,

    /// Info related to inpaitning, empty if user did his own typesetting
    pub inpainting: Option<Inpainting>,
    /// Info related typesetting
    pub typesetting: Option<Typesetting>,
    /// Info related text rendering
    pub text_rendering: Option<TextRendering>,

    /// Format of result
    pub format: String,
    /// Result
    pub result: FreeFormResult,
    /// Final image
    pub final_url: String,
    pub width: u32,
    pub height: u32,
    pub file_size: u64,
    /// Backup links to this image
    pub backup_urls: Option<Vec<String>>,
    pub sha256_value: String,

    /// Upvotes
    pub upvotes: u32,
    /// Downvotes
    pub downvotes: u32,
    /// Score
    pub score: u32
}

pub struct User {
    pub created_at: bson::DateTime,
    pub password_hashed: Option<String>
}

pub struct MachineTranslator {
    pub name: String,
    pub version: String
}

pub enum CreatedBy {
    User(ObjectId),
    Machine(MachineTranslator)
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
