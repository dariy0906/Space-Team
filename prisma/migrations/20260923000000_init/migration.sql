CREATE TYPE "Role" AS ENUM ('RESIDENT', 'WORKER', 'OPERATOR');
CREATE TYPE "IncidentType" AS ENUM ('FIRE', 'WATER_LEAK', 'PERSON_FALL', 'WATER_RESCUE', 'CITIZEN_REPORT', 'OTHER');
CREATE TYPE "IncidentSource" AS ENUM ('CAMERA', 'SENSOR', 'DRONE', 'RESIDENT', 'MANUAL');
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');
CREATE TYPE "TaskStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE', 'COMPLETED');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TABLE "User" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "role" "Role" NOT NULL,
  "lat" DOUBLE PRECISION, "lng" DOUBLE PRECISION,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Incident" (
  "id" UUID NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "type" "IncidentType" NOT NULL,
  "source" "IncidentSource" NOT NULL, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "severity" "Severity" NOT NULL, "confidence" DOUBLE PRECISION,
  "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL,
  "address" TEXT NOT NULL, "district" TEXT,
  "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reporterId" UUID, "assignedWorkerId" UUID,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IncidentMedia" (
  "id" UUID NOT NULL, "incidentId" UUID NOT NULL,
  "type" "MediaType" NOT NULL, "url" TEXT NOT NULL,
  CONSTRAINT "IncidentMedia_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IncidentHistory" (
  "id" UUID NOT NULL, "incidentId" UUID NOT NULL,
  "action" TEXT NOT NULL, "comment" TEXT,
  "previousStatus" "IncidentStatus", "newStatus" "IncidentStatus",
  "actorId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkerTask" (
  "id" UUID NOT NULL, "workerId" UUID NOT NULL,
  "incidentId" UUID NOT NULL, "status" "TaskStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  CONSTRAINT "WorkerTask_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkerLocation" (
  "id" UUID NOT NULL, "workerId" UUID NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkerLocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CitizenReport" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "incidentId" UUID NOT NULL,
  CONSTRAINT "CitizenReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Camera" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ONLINE',
  CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Sensor" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "type" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ONLINE',
  CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Drone" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STANDBY',
  CONSTRAINT "Drone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");
CREATE INDEX "Incident_reporterId_idx" ON "Incident"("reporterId");
CREATE UNIQUE INDEX "WorkerTask_incidentId_key" ON "WorkerTask"("incidentId");
CREATE UNIQUE INDEX "CitizenReport_incidentId_key" ON "CitizenReport"("incidentId");
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedWorkerId_fkey" FOREIGN KEY ("assignedWorkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentMedia" ADD CONSTRAINT "IncidentMedia_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentHistory" ADD CONSTRAINT "IncidentHistory_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentHistory" ADD CONSTRAINT "IncidentHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkerTask" ADD CONSTRAINT "WorkerTask_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerTask" ADD CONSTRAINT "WorkerTask_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerLocation" ADD CONSTRAINT "WorkerLocation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitizenReport" ADD CONSTRAINT "CitizenReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitizenReport" ADD CONSTRAINT "CitizenReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
