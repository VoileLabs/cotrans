use axum::headers::{self, Header};

static HEADER_NAME_X_SECRET: headers::HeaderName = headers::HeaderName::from_static("x-secret");

#[derive(Debug, Clone)]
pub struct HeaderXSecret(String);

impl Header for HeaderXSecret {
  fn name() -> &'static headers::HeaderName {
    &HEADER_NAME_X_SECRET
  }

  fn decode<'i, I>(values: &mut I) -> Result<Self, headers::Error>
  where
    Self: Sized,
    I: Iterator<Item = &'i http::HeaderValue>,
  {
    values
      .next()
      .map(|value| HeaderXSecret(value.to_str().unwrap().to_string()))
      .ok_or_else(headers::Error::invalid)
  }

  fn encode<E: Extend<http::HeaderValue>>(&self, values: &mut E) {
    values.extend(std::iter::once(
      http::HeaderValue::from_str(&self.0).unwrap(),
    ));
  }
}

impl HeaderXSecret {
  pub fn from_static(src: &'static str) -> Self {
    Self(src.to_owned())
  }

  pub fn as_str(&self) -> &str {
    self.0.as_str()
  }

  pub fn as_bytes(&self) -> &[u8] {
    self.0.as_bytes()
  }
}
