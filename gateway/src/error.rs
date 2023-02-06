use std::fmt;

use axum::{
  extract::multipart::MultipartError,
  response::{IntoResponse, Response},
  Json,
};
use hyper::StatusCode;
use image::ImageError;
use prisma_client_rust::QueryError;
use thiserror::Error;
use tokio::task::JoinError;

use crate::task::{
  pixiv::scrape::{ParsePixivArtworkAjaxError, ParsePixivArtworkPagesAjaxError},
  twitter::scrape::ParseTwitterTweetError,
  DirectionIntoDBError, InvalidDetectorError, InvalidDirectionError, InvalidLanguageError,
  InvalidSizeError, InvalidTranslatorError,
};

pub type AppResult<T> = Result<T, AppError>;
pub type AppJsonResult<T> = AppResult<Json<T>>;

#[derive(Debug, Error)]
pub enum AppError {
  PrismaError(QueryError),
  ReqwestError(reqwest::Error),
  QuickXMLError(quick_xml::Error),
  TokioJoinError(JoinError),
  TokioBroadcastRecvError(tokio::sync::broadcast::error::RecvError),
  ParseTweetError(ParseTwitterTweetError),
  ImageError(ImageError),
  AxumError(axum::Error),
  ProtoDecodeError(prost::DecodeError),
  IoError(std::io::Error),
  MultipartError(MultipartError),
  SerdeJSONError(serde_json::Error),
  TokioWatchRecvError(tokio::sync::watch::error::RecvError),
  ParsePixivArtworkAjaxError(ParsePixivArtworkAjaxError),
  ParsePixivArtworkPagesAjaxError(ParsePixivArtworkPagesAjaxError),

  DirectionIntoDBError(DirectionIntoDBError),
  InvalidDirectionError(InvalidDirectionError),
  InvalidSizeError(InvalidSizeError),
  InvalidLanguageError(InvalidLanguageError),
  InvalidTranslatorError(InvalidTranslatorError),
  InvalidDetectorError(InvalidDetectorError),
  TaskFailedError(String),

  BadRequest(String),
  NotFound,
}

impl From<QueryError> for AppError {
  fn from(error: QueryError) -> Self {
    AppError::PrismaError(error)
  }
}

impl From<reqwest::Error> for AppError {
  fn from(error: reqwest::Error) -> Self {
    AppError::ReqwestError(error)
  }
}

impl From<quick_xml::Error> for AppError {
  fn from(error: quick_xml::Error) -> Self {
    AppError::QuickXMLError(error)
  }
}

impl From<JoinError> for AppError {
  fn from(error: tokio::task::JoinError) -> Self {
    AppError::TokioJoinError(error)
  }
}

impl From<tokio::sync::broadcast::error::RecvError> for AppError {
  fn from(error: tokio::sync::broadcast::error::RecvError) -> Self {
    AppError::TokioBroadcastRecvError(error)
  }
}

impl From<ParseTwitterTweetError> for AppError {
  fn from(error: ParseTwitterTweetError) -> Self {
    AppError::ParseTweetError(error)
  }
}

impl From<ImageError> for AppError {
  fn from(error: ImageError) -> Self {
    AppError::ImageError(error)
  }
}

impl From<axum::Error> for AppError {
  fn from(error: axum::Error) -> Self {
    AppError::AxumError(error)
  }
}

impl From<DirectionIntoDBError> for AppError {
  fn from(error: DirectionIntoDBError) -> Self {
    AppError::DirectionIntoDBError(error)
  }
}

impl From<InvalidDirectionError> for AppError {
  fn from(error: InvalidDirectionError) -> Self {
    AppError::InvalidDirectionError(error)
  }
}

impl From<InvalidSizeError> for AppError {
  fn from(error: InvalidSizeError) -> Self {
    AppError::InvalidSizeError(error)
  }
}

impl From<InvalidLanguageError> for AppError {
  fn from(error: InvalidLanguageError) -> Self {
    AppError::InvalidLanguageError(error)
  }
}

impl From<InvalidTranslatorError> for AppError {
  fn from(error: InvalidTranslatorError) -> Self {
    AppError::InvalidTranslatorError(error)
  }
}

impl From<InvalidDetectorError> for AppError {
  fn from(error: InvalidDetectorError) -> Self {
    AppError::InvalidDetectorError(error)
  }
}

impl From<prost::DecodeError> for AppError {
  fn from(error: prost::DecodeError) -> Self {
    AppError::ProtoDecodeError(error)
  }
}

impl From<std::io::Error> for AppError {
  fn from(error: std::io::Error) -> Self {
    AppError::IoError(error)
  }
}

impl From<MultipartError> for AppError {
  fn from(error: MultipartError) -> Self {
    AppError::MultipartError(error)
  }
}

impl From<serde_json::Error> for AppError {
  fn from(error: serde_json::Error) -> Self {
    AppError::SerdeJSONError(error)
  }
}

impl From<tokio::sync::watch::error::RecvError> for AppError {
  fn from(error: tokio::sync::watch::error::RecvError) -> Self {
    AppError::TokioWatchRecvError(error)
  }
}

impl From<ParsePixivArtworkAjaxError> for AppError {
  fn from(error: ParsePixivArtworkAjaxError) -> Self {
    AppError::ParsePixivArtworkAjaxError(error)
  }
}

impl From<ParsePixivArtworkPagesAjaxError> for AppError {
  fn from(error: ParsePixivArtworkPagesAjaxError) -> Self {
    AppError::ParsePixivArtworkPagesAjaxError(error)
  }
}

impl fmt::Display for AppError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    let id = cuid::cuid().unwrap();
    let text = format!("{self:#?}");
    tracing::debug!(id = %id, error = %text, "error");
    write!(f, "{{\"error_id\": \"{id}\"}}")
  }
}

// This centralizes all differents errors from our app in one place
impl IntoResponse for AppError {
  fn into_response(self) -> Response {
    let id = self.to_string();

    let status = match self {
      AppError::PrismaError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ReqwestError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::QuickXMLError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::TokioJoinError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::TokioBroadcastRecvError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ParseTweetError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ImageError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::AxumError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ProtoDecodeError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::IoError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::MultipartError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::SerdeJSONError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::TokioWatchRecvError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ParsePixivArtworkAjaxError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::ParsePixivArtworkPagesAjaxError(_) => StatusCode::INTERNAL_SERVER_ERROR,

      AppError::DirectionIntoDBError(_) => StatusCode::INTERNAL_SERVER_ERROR,
      AppError::InvalidDirectionError(_) => StatusCode::BAD_REQUEST,
      AppError::InvalidSizeError(_) => StatusCode::BAD_REQUEST,
      AppError::InvalidLanguageError(_) => StatusCode::BAD_REQUEST,
      AppError::InvalidTranslatorError(_) => StatusCode::BAD_REQUEST,
      AppError::InvalidDetectorError(_) => StatusCode::BAD_REQUEST,
      AppError::TaskFailedError(_) => StatusCode::INTERNAL_SERVER_ERROR,

      AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
      AppError::NotFound => StatusCode::NOT_FOUND,
    };

    (status, id).into_response()
  }
}
