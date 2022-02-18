
use actix_web::{get, web, Error};
use crate::{models::{ServiceError, GetFinalProductV1Response}, context::AppContext};

#[get("/final-product/v1/{imghash}/{language}.json")]
pub async fn handle_get_final_product_v1(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::Json<GetFinalProductV1Response>, ServiceError> {
    let (imghash, language) = path.into_inner();
	match crate::services::final_product_v1::get(&ctx, imghash, language).await {
        Ok(a) => Ok(web::Json(a)),
        Err(e) => Err(e),
    }
}
