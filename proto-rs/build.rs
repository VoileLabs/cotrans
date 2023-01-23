use std::io::Result;
fn main() -> Result<()> {
  prost_build::compile_protos(&["../proto/gateway.mit.proto"], &["../proto"])?;
  Ok(())
}
