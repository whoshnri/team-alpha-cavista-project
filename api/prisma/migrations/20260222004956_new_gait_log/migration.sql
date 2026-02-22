-- CreateTable
CREATE TABLE "gait_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "windowDurationSec" INTEGER,
    "sampleCount" INTEGER,
    "activity" TEXT,
    "stepsEstimated" INTEGER,
    "dominantAxis" TEXT,
    "meanMagnitude" DOUBLE PRECISION,
    "stdDevMagnitude" DOUBLE PRECISION,
    "gaitRegularityScore" DOUBLE PRECISION,
    "fatigueIndex" DOUBLE PRECISION,
    "estimatedCalories" DOUBLE PRECISION,
    "movementDetected" BOOLEAN NOT NULL DEFAULT false,
    "prolongedStillness" BOOLEAN NOT NULL DEFAULT false,
    "highVariability" BOOLEAN NOT NULL DEFAULT false,
    "irregularGait" BOOLEAN NOT NULL DEFAULT false,
    "xMean" DOUBLE PRECISION,
    "yMean" DOUBLE PRECISION,
    "zMean" DOUBLE PRECISION,
    "xVariance" DOUBLE PRECISION,
    "yVariance" DOUBLE PRECISION,
    "zVariance" DOUBLE PRECISION,

    CONSTRAINT "gait_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gait_logs_userId_createdAt_idx" ON "gait_logs"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "gait_logs" ADD CONSTRAINT "gait_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
