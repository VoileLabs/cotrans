
use std::io::{self, Read};
use std::sync::Arc;


use actix_cors::Cors;
use actix_web::http;
use actix_web::{App, Error, HttpMessage, HttpResponse, HttpServer, cookie, middleware, web};
use chrono::Utc;
use jwt_simple::prelude::{ES256kKeyPair, ES256kPublicKey};

mod models;
mod services;
mod handlers;
mod context;

use context::AppContext;

fn create_app_context() -> AppContext {
    AppContext {
        allowed: "760ea711154c58ddd3b0367060b1ca59".into()
    }
}

#[actix_web::main]
async fn main() -> io::Result<()> {
	std::env::set_var("RUST_LOG", "actix_web=info");
	env_logger::init();

	// Start http server
	HttpServer::new(move || {
		App::new()
			.app_data(web::Data::new(create_app_context()))
			.wrap(
				Cors::default()
				.allow_any_origin()
				.allow_any_header()
				.allow_any_method()
			)
			.service(handlers::handle_api_v1_imghash_language)
	})
	.bind("0.0.0.0:8080")?
	.run()
	.await
}
