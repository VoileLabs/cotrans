use axum::{extract::State, routing::get, Json, Router};
use metrics_exporter_prometheus::PrometheusHandle;
use serde::{Deserialize, Serialize};

use crate::{mit_worker, task, AppState, MITWorkers};

pub fn router(metric_handle: PrometheusHandle) -> Router<AppState> {
  Router::new()
    .route("/", get(root))
    .route("/status/v1", get(status_v1))
    .route("/metrics", get(|| async move { metric_handle.render() }))
    .nest("/mit", mit_worker::router())
    .nest("/task", task::router())
}

async fn root() -> String {
  format!("Cotrans API by VoileLabs {}", env!("CARGO_PKG_VERSION"))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct StatusV1Response {
  version: String,
}

async fn status_v1(State(mit_worker): State<MITWorkers>) -> Json<StatusV1Response> {
  Json(StatusV1Response {
    version: env!("CARGO_PKG_VERSION").to_string(),
  })
}