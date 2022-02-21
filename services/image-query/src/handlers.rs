
use actix_web::{get, post, web, Error};
use crate::{models::{ServiceError, GetFinalProductV1Response, TranslatedImageJson, OriginalImageJson}, context::AppContext};

#[get("/api/v1/{imghash}/{language}.png")]
pub async fn handle_api_v1_imghash_language(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::HttpResponse, ServiceError> {
    let (imghash, language) = path.into_inner();
    todo!("get the best translated image of target language, definition of best is TBD");
    todo!("return redirect to image");
}

#[get("/api/v1/{imghash}/{language}.json")]
pub async fn handle_api_v1_imghash_language_json(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::Json<TranslatedImageJson>, ServiceError> {
    let (imghash, language) = path.into_inner();
    todo!("get the JSON info of best translated image of target language, definition of best is TBD");
}


#[get("/api/v1/{imghash}/original.png")]
pub async fn handle_api_v1_imghash_original(ctx: web::Data<AppContext>, path: web::Path<String>) -> Result<web::HttpResponse, ServiceError> {
    let imghash = path.into_inner();
    todo!("get the original image");
    todo!("return redirect to image");
}

#[get("/api/v1/{imghash}/original.json")]
pub async fn handle_api_v1_imghash_original_json(ctx: web::Data<AppContext>, path: web::Path<String>) -> Result<web::Json<OriginalImageJson>, ServiceError> {
    let imghash = path.into_inner();
    todo!("get the JSON info of original image");
}

#[get("/api/v1/{imghash}/mask.png")]
pub async fn handle_api_v1_imghash_mask(ctx: web::Data<AppContext>, path: web::Path<String>) -> Result<web::HttpResponse, ServiceError> {
    let imghash = path.into_inner();
    todo!("get the best mask of image, best means the mask used by the best translated image");
    todo!("return redirect to image");
}

#[get("/api/v1/{imghash}/v/{commit_id}.png")]
pub async fn handle_api_v1_imghash_v_commit_id(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::HttpResponse, ServiceError> {
    let (imghash, commit_id) = path.into_inner();
    todo!("get a translated image identified by commit_id");
    todo!("return redirect to image");
}

#[get("/api/v1/{imghash}/v/{commit_id}.json")]
pub async fn handle_api_v1_imghash_v_commit_id_json(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::Json<TranslatedImageJson>, ServiceError> {
    let (imghash, commit_id) = path.into_inner();
    todo!("get the JSON info of a translated image identified by commit_id");
}

#[get("/api/v1/{imghash}/v/{commit_id}/mask.png")]
pub async fn handle_api_v1_imghash_v_commit_id_mask(ctx: web::Data<AppContext>, path: web::Path<(String, String)>) -> Result<web::HttpResponse, ServiceError> {
    let (imghash, commit_id) = path.into_inner();
    todo!("get the mask of a translated image identified by commit_id");
    todo!("return redirect to image");
}
