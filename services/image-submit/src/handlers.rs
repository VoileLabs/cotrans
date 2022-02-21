

use std::io::Write;

use actix_web::{get, post, web, Error, http::header::ContentDisposition};
use futures_util::{TryStreamExt, StreamExt};
use crate::{models::{ServiceError, GetFinalProductV1Response, TranslatedImageJson, OriginalImageJson}, context::AppContext};

fn is_file(cd: &ContentDisposition) -> bool {
    let mut found = false;
    for item in cd.parameters.iter() {
        found |= item.is_filename();
    }
    found
}

async fn extract_form_key_value(cd: &ContentDisposition, field: &mut actix_multipart::Field) -> (String, String) {
    let key = cd.parameters[0].as_name().unwrap().to_string();
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = field.next().await {
        let data = chunk.unwrap();
        bytes.extend_from_slice(&data);
    }
    (key, std::str::from_utf8(bytes.as_slice()).unwrap().to_owned())
}

#[post("/v1/submit-raw")]
pub async fn handle_v1_submit_raw(ctx: web::Data<AppContext>, mut payload: actix_multipart::Multipart) -> Result<web::HttpResponse, ServiceError> {
    let file_path = "1.jpg";
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_type = field.content_disposition().clone();
        if is_file(&content_type) {
            println!("is file");
            //let filename = content_type.get_filename().unwrap();
            let filepath = format!(".{}", file_path);

            // File::create is blocking operation, use threadpool
            let mut f = web::block(|| std::fs::File::create(filepath))
                .await
                .unwrap().unwrap();

            // Field in turn is stream of *Bytes* object
            while let Some(chunk) = field.next().await {
                let data = chunk.unwrap();
                // filesystem operations are blocking, we have to use threadpool
                f = web::block(move || f.write_all(&data).map(|_| f))
                    .await
                    .unwrap().unwrap();
            }
        } else {
            let (k, v) = extract_form_key_value(&content_type, &mut field).await;
            println!("k: {}, v: {}", k, v);
        }
        
    }
    Ok(web::HttpResponse::Ok().body("body"))
}

#[post("/v1/submit-url")]
pub async fn handle_v1_submit_url(ctx: web::Data<AppContext>, mut payload: actix_multipart::Multipart) -> Result<web::HttpResponse, ServiceError> {
    todo!()
}
