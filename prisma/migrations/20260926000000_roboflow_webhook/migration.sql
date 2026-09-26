-- Stable, operator-configured mapping from a Roboflow Workflow source to a Smart NIS camera.
ALTER TABLE "Camera" ADD COLUMN "roboflowCameraId" TEXT;

-- The Workflow incident key is an idempotency key. Nullable keeps existing incidents unchanged.
ALTER TABLE "Incident" ADD COLUMN "externalEventKey" TEXT;

CREATE UNIQUE INDEX "Camera_roboflowCameraId_key" ON "Camera"("roboflowCameraId");
CREATE UNIQUE INDEX "Incident_externalEventKey_key" ON "Incident"("externalEventKey");
