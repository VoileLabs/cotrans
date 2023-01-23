/*
  Warnings:

  - You are about to drop the column `inpaintMask` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `translation` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "inpaintMask",
DROP COLUMN "translation",
ADD COLUMN     "translationMask" TEXT;
