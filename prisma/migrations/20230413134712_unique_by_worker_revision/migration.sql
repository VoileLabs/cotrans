/*
  Warnings:

  - A unique constraint covering the columns `[sourceImageId,targetLanguage,detector,direction,translator,size,workerRevision]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "workerRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceImageId_targetLanguage_detector_direction_transl_key" ON "Task"("sourceImageId", "targetLanguage", "detector", "direction", "translator", "size", "workerRevision");
