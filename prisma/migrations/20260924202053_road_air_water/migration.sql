-- CreateEnum
CREATE TYPE "FacilityKind" AS ENUM ('SCHOOL', 'KINDERGARTEN', 'HOSPITAL', 'SOCIAL');

-- AlterEnum
ALTER TYPE "IncidentSource" ADD VALUE 'SIMULATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentType" ADD VALUE 'POTHOLE';
ALTER TYPE "IncidentType" ADD VALUE 'WATER_OUTAGE';
ALTER TYPE "IncidentType" ADD VALUE 'AIR_QUALITY';

-- CreateTable
CREATE TABLE "CityFacility" (
    "id" UUID NOT NULL,
    "kind" "FacilityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CityFacility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CityFacility_kind_idx" ON "CityFacility"("kind");
