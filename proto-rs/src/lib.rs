pub mod gateway {
  pub mod mit {
    include!(concat!(env!("OUT_DIR"), "/gateway.mit.rs"));
  }
}
