use std::{env, net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Result;
use axum::{extract::FromRef, Router};
use axum_prometheus::{
  PrometheusMetricLayerBuilder, AXUM_HTTP_REQUESTS_DURATION_SECONDS, SECONDS_DURATION_BUCKETS,
};
use http::{header, request, HeaderValue, Method, Request};
use hyper::Body;
use metrics::{describe_counter, describe_gauge, describe_histogram};
use metrics_exporter_prometheus::{Matcher, PrometheusBuilder};
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
      std::env::var("RUST_LOG")
        .unwrap_or_else(|_| "info,cotrans_gateway=debug,tower_http=debug".into()),
    ))
    .with(tracing_subscriber::fmt::layer())
    .init();

  tracing::info!("starting cotrans gateway");

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

  let (prometheus_layer, metric_handle) = PrometheusMetricLayerBuilder::new()
    .with_ignore_patterns(&["/metrics"])
    .with_group_patterns_as("/task/{id}/event/v1", &[("/task/:id/event/v1")])
    .with_metrics_from_fn(|| {
      PrometheusBuilder::new()
        .set_buckets_for_metric(
          Matcher::Full(AXUM_HTTP_REQUESTS_DURATION_SECONDS.to_string()),
          SECONDS_DURATION_BUCKETS,
        )
        .unwrap()
        .install_recorder()
        .unwrap()
    })
    .build_pair();
  describe_gauge!("mit_worker_count", "Number of mit workers");
  describe_gauge!("mit_worker_queue_length", "Length of mit worker queue");
  describe_counter!(
    "mit_worker_task_dispatch_count",
    "Number of mit worker tasks dispatched"
  );
  describe_counter!(
    "mit_worker_task_finish_count",
    "Number of mit worker tasks finished"
  );
  describe_counter!(
    "mit_worker_task_error_count",
    "Number of mit worker tasks errored"
  );
  describe_histogram!(
    "mit_worker_task_duration_seconds",
    "Duration of mit worker tasks"
  );

  tracing::debug!("resuming mit workers tasks");
  mit_workers.resume().await?;

  let state = AppState {
    db,
    http,
    r2,
    mit_workers,
  };

  let router = Router::new()
    .merge(routes::router(metric_handle))
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
    .layer(CompressionLayer::new())
    .layer(prometheus_layer);

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
