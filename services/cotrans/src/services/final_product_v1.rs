use crate::{models::{GetFinalProductV1Response, ServiceError}, context::AppContext};


pub async fn get(ctx: &AppContext, imghash: String, language: String) -> Result<GetFinalProductV1Response, ServiceError> {
    if ctx.allowed == imghash {
        Ok(GetFinalProductV1Response {
            cf_url: None,
            direct_url: None
        })
    } else {
        Err(ServiceError::not_found())
    }
}
