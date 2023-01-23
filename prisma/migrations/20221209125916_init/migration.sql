-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('CHS', 'CHT', 'CSY', 'NLD', 'ENG', 'FRA', 'DEU', 'HUN', 'ITA', 'JPN', 'KOR', 'PLK', 'PTB', 'ROM', 'RUS', 'ESP', 'TRK', 'UKR', 'VIN');

-- CreateEnum
CREATE TYPE "Detector" AS ENUM ('DEFAULT', 'CTD');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('AUTO', 'HORIZONTAL', 'VERTICAL');

-- CreateEnum
CREATE TYPE "Translator" AS ENUM ('YOUDAO', 'BAIDU', 'GOOGLE', 'DEEPL', 'PAPAGO', 'OFFLINE', 'NONE', 'ORIGINAL');

-- CreateEnum
CREATE TYPE "Size" AS ENUM ('S', 'M', 'L', 'X');

-- CreateTable
CREATE TABLE "TwitterSource" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "photoIndex" INTEGER NOT NULL,
    "pbsId" TEXT NOT NULL,
    "authorId" BIGINT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitterSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixivSource" (
    "id" TEXT NOT NULL,
    "artworkId" BIGINT NOT NULL,
    "page" INTEGER NOT NULL,
    "origUrl" TEXT NOT NULL,
    "authorId" BIGINT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixivSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceImage" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "targetLanguage" "Language" NOT NULL,
    "detector" "Detector" NOT NULL,
    "direction" "Direction" NOT NULL,
    "translator" "Translator" NOT NULL,
    "size" "Size" NOT NULL,
    "state" "TaskState" NOT NULL DEFAULT 'PENDING',
    "lastAttemptedAt" TIMESTAMP(3),
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "inpaintMask" TEXT,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitterSource_tweetId_photoIndex_key" ON "TwitterSource"("tweetId", "photoIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TwitterSource_tweetId_pbsId_key" ON "TwitterSource"("tweetId", "pbsId");

-- CreateIndex
CREATE UNIQUE INDEX "PixivSource_artworkId_page_key" ON "PixivSource"("artworkId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "SourceImage_hash_key" ON "SourceImage"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceImageId_targetLanguage_detector_direction_transl_key" ON "Task"("sourceImageId", "targetLanguage", "detector", "direction", "translator", "size");

-- AddForeignKey
ALTER TABLE "TwitterSource" ADD CONSTRAINT "TwitterSource_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixivSource" ADD CONSTRAINT "PixivSource_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
