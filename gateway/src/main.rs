use std::{env, net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Result;
use axum::{extract::FromRef, Router};
use http::{header, request, HeaderValue, Method, Request};
use hyper::Body;
use mit_worker::MITWorkersInner;
use tower_http::{
  compression::CompressionLayer,
  cors::{AllowOrigin, CorsLayer},
  trace::TraceLayer,
};
use tracing_subscriber::prelude::*;

use crate::r2::R2Inner;

mod error;
mod images;
mod mit_worker;
mod prisma;
mod r2;
mod routes;
mod task;

pub type Database = Arc<prisma::PrismaClient>;
pub type HttpClient = reqwest::Client;
pub type R2Client = Arc<R2Inner>;
pub type MITWorkers = Arc<MITWorkersInner>;

#[derive(Clone, FromRef)]
pub struct AppState {
  db: Database,
  http: HttpClient,
  r2: R2Client,
  mit_workers: MITWorkers,
}

#[tokio::main]
async fn main() -> Result<()> {
  // initialize tracing
  tracing_subscriber::registry()
    .with(tracing_subscriber::EnvFilter::new(
      std::env::var("RUST_LOG").unwrap_or_else(|_| "cotrans_gateway=debug,tower_http=debug".into()),
    ))
    .with(tracing_subscriber::fmt::layer())
    .init();

  tracing::debug!("starting cotrans gateway");

  // prisma client
  let db = Arc::new(prisma::new_client().await?);
  // http client
  let http = reqwest::Client::new();
  // r2 client
  let r2 = Arc::new(R2Inner::new(
    http.clone(),
    env::var("R2_BASE")?,
    env::var("R2_PUBLIC_BASE")?,
    env::var("R2_SECRET")?,
  ));
  // mit workers
  let mit_workers = Arc::new(MITWorkersInner::new(
    env::var("MIT_WORKER_SECRET")?,
    db.clone(),
    r2.clone(),
  ));

  tracing::debug!("resuming mit workers tasks");
  mit_workers.resume().await?;

  let state = AppState {
    db,
    http,
    r2,
    mit_workers,
  };

  let router = Router::new()
    .merge(routes::router())
    .with_state(state)
    .layer(
      CorsLayer::new()
        .allow_methods([
          Method::GET,
          Method::POST,
          Method::PUT,
          Method::DELETE,
          Method::OPTIONS,
        ])
        .allow_origin(AllowOrigin::predicate(
          |origin: &HeaderValue, _request_parts: &request::Parts| {
            let origin = origin.as_bytes();
            origin == b"http://localhost"
              || origin == b"https://localhost"
              || origin.starts_with(b"http://localhost:")
              || origin.starts_with(b"https://localhost:")
              || origin == b"https://cotrans.touhou.ai"
          },
        ))
        .allow_credentials(true)
        .allow_headers([header::RANGE])
        .max_age(Duration::from_secs(60) * 5),
    )
    .layer(
      TraceLayer::new_for_http().make_span_with(|request: &Request<Body>| {
        tracing::debug_span!(
          "request",
          id = %cuid::cuid().unwrap(),
          method = %request.method(),
          uri = %request.uri(),
          version = ?request.version()
        )
      }),
    )
    .layer(CompressionLayer::new());

  let port = match env::var("PORT") {
    Ok(port) => port.parse()?,
    Err(_) => 3000,
  };
  let addr = SocketAddr::from(([0, 0, 0, 0], port));
  tracing::info!("listening on http://localhost:{}", port);
  axum::Server::bind(&addr)
    .serve(router.into_make_service())
    .await?;

  Ok(())
}
