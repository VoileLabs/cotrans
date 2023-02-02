use crate::{mit_worker::DBToTask, prisma, Database};

use super::DBTaskParam;

pub async fn upsert_task(
  db: &Database,
  source_id: &str,
  param: DBTaskParam,
  retry: bool,
) -> prisma_client_rust::Result<DBToTask::Data> {
  db.task()
    .upsert(
      prisma::task::source_image_id_target_language_detector_direction_translator_size(
        source_id.to_owned(),
        param.target_language,
        param.detector,
        param.direction,
        param.translator,
        param.size,
      ),
      prisma::task::create(
        prisma::source_image::id::equals(source_id.to_owned()),
        param.target_language,
        param.detector,
        param.direction,
        param.translator,
        param.size,
        vec![],
      ),
      if retry {
        vec![
          prisma::task::state::set(prisma::TaskState::Pending),
          prisma::task::translation_mask::set(None),
        ]
      } else {
        vec![]
      },
    )
    .include(DBToTask::include())
    .exec()
    .await
}