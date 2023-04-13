-- DropIndex
DROP INDEX "Task_sourceImageId_targetLanguage_detector_direction_transl_key";

-- CreateIndex
CREATE INDEX "Task_sourceImageId_targetLanguage_detector_direction_transl_idx" ON "Task"("sourceImageId", "targetLanguage", "detector", "direction", "translator", "size");
