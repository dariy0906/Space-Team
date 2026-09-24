-- CreateEnum
CREATE TYPE "Specialization" AS ENUM ('WATER', 'FIRE', 'ELECTRICITY', 'ROAD', 'RESCUE', 'SANITATION', 'OTHER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentType" ADD VALUE 'SMOKE';
ALTER TYPE "IncidentType" ADD VALUE 'FIGHT';
ALTER TYPE "IncidentType" ADD VALUE 'STRONG_WIND';
ALTER TYPE "IncidentType" ADD VALUE 'ROAD';
ALTER TYPE "IncidentType" ADD VALUE 'LIGHTING';
ALTER TYPE "IncidentType" ADD VALUE 'SAFETY';
ALTER TYPE "IncidentType" ADD VALUE 'WASTE';

-- AlterEnum
ALTER TYPE "IncidentSource" ADD VALUE 'SYSTEM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentStatus" ADD VALUE 'WAITING_OPERATOR';
ALTER TYPE "IncidentStatus" ADD VALUE 'REOPENED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "assignedOperatorId" UUID,
ADD COLUMN     "cameraId" UUID,
ADD COLUMN     "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "IncidentMedia" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'BEFORE';

-- AlterTable
ALTER TABLE "IncidentHistory" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkerTask" ADD COLUMN     "completionComment" TEXT,
ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3),
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Camera" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ResidentProfile" (
    "userId" UUID NOT NULL,

    CONSTRAINT "ResidentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OperatorProfile" (
    "userId" UUID NOT NULL,
    "onShift" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OperatorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "userId" UUID NOT NULL,
    "specialization" "Specialization" NOT NULL DEFAULT 'OTHER',
    "onShift" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WorkerSchedule" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAssignment" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "workerId" UUID,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerViolation" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID,
    "role" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicWarning" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" UUID NOT NULL,
    "sensorId" UUID NOT NULL,
    "values" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraSession" (
    "id" UUID NOT NULL,
    "cameraId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" UUID NOT NULL,
    "invitedEmail" TEXT,
    "acceptedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraPermission" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "consentText" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraSignal" (
    "id" SERIAL NOT NULL,
    "sessionId" UUID NOT NULL,
    "peerId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSchedule_workerId_day_key" ON "WorkerSchedule"("workerId", "day");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlan_taskId_key" ON "RoutePlan"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "CameraSession_tokenHash_key" ON "CameraSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CameraPermission_sessionId_key" ON "CameraPermission"("sessionId");

-- CreateIndex
CREATE INDEX "CameraSignal_sessionId_id_idx" ON "CameraSignal"("sessionId", "id");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentProfile" ADD CONSTRAINT "ResidentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorProfile" ADD CONSTRAINT "OperatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSchedule" ADD CONSTRAINT "WorkerSchedule_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAssignment" ADD CONSTRAINT "IncidentAssignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerViolation" ADD CONSTRAINT "WorkerViolation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraSession" ADD CONSTRAINT "CameraSession_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraPermission" ADD CONSTRAINT "CameraPermission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CameraSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraSignal" ADD CONSTRAINT "CameraSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CameraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
