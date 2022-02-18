
use actix_web::http::StatusCode;
use actix_web::web::{get, resource, HttpRequest, HttpResponse};
use actix_web::{App, HttpServer, ResponseError};
use serde::Serialize;
use serde_json;
use std::fmt::{Display, Formatter, Result as FmtResult};
use std::io;


#[derive(Debug, Serialize)]
pub struct ServiceError {
    msg: String,
    status: u16
}

impl ServiceError {
    pub fn not_found() -> ServiceError {
        ServiceError {
            msg: "NOT_FOUND".to_string(),
            status: 404
        }
    }
}

impl Display for ServiceError {
    fn fmt(&self, f: &mut Formatter) -> FmtResult {
        let err_json = serde_json::to_string(self).unwrap();
        write!(f, "{}", err_json)
    }
}

impl ResponseError for ServiceError {
    fn error_response(&self) -> HttpResponse {
        let response = HttpResponse::build(StatusCode::from_u16(self.status).unwrap()).json(self);
        response
    }
}

#[derive(Debug, Serialize)]
pub struct GetFinalProductV1Response {
    pub direct_url: Option<String>,
    pub cf_url: Option<String>
}

pub enum SupportedLanguages {
    CHS
}

impl SupportedLanguages {
    pub fn to_deepl_code(&self) -> String {
        todo!()
    }
    pub fn to_google_code(&self) -> String {
        todo!()
    }
}

pub enum SupportedDirection {
    Auto,
    Horizontal,
    Vertical
}

pub enum SupportedDetector {
    Default,
    CTD
}

pub enum SupportedTranslator {
    Null,
    Baidu,
    Google,
    DeepL,
    Youdao
}
