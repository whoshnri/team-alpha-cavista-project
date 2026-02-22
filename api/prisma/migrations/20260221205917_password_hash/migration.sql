-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ENGLISH', 'YORUBA', 'IGBO', 'HAUSA', 'PIDGIN', 'FRENCH');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BiomarkerStatus" AS ENUM ('NORMAL', 'BORDERLINE', 'CONCERNING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('DETECTED', 'NOTIFIED', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "whatsappId" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'ENGLISH',
    "profileImageUrl" TEXT,
    "passwordHash" TEXT,
    "state" TEXT,
    "lga" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_profiles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "existingConditions" TEXT[],
    "familyHistory" TEXT[],
    "currentMedications" TEXT[],
    "allergies" TEXT[],
    "bloodGroup" TEXT,
    "smokingStatus" TEXT,
    "alcoholUse" TEXT,
    "physicalActivityLevel" TEXT,
    "dietType" TEXT,
    "averageSleepHours" DOUBLE PRECISION,
    "stressLevel" INTEGER,
    "occupation" TEXT,
    "incomeLevel" TEXT,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "rawText" TEXT,
    "documentUrl" TEXT,
    "testName" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3),
    "labName" TEXT,
    "plainLanguageSummary" TEXT,
    "overallStatus" "BiomarkerStatus" NOT NULL DEFAULT 'NORMAL',
    "aiRecommendations" TEXT[],
    "interpretedAt" TIMESTAMP(3),

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomarkers" (
    "id" TEXT NOT NULL,
    "labResultId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "referenceMin" DOUBLE PRECISION,
    "referenceMax" DOUBLE PRECISION,
    "status" "BiomarkerStatus" NOT NULL DEFAULT 'NORMAL',
    "flagNote" TEXT,

    CONSTRAINT "biomarkers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitals" (
    "id" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "systolicBP" INTEGER,
    "diastolicBP" INTEGER,
    "heartRateBpm" INTEGER,
    "bloodOxygenPct" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "bloodGlucose" DOUBLE PRECISION,
    "respiratoryRate" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'self_report',
    "deviceId" TEXT,
    "notes" TEXT,

    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "overallRiskScore" DOUBLE PRECISION NOT NULL,
    "overallRiskLevel" "RiskLevel" NOT NULL,
    "diabetesRisk" DOUBLE PRECISION,
    "hypertensionRisk" DOUBLE PRECISION,
    "cardiovascularRisk" DOUBLE PRECISION,
    "modelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "featuresUsed" TEXT[],
    "confidenceScore" DOUBLE PRECISION,
    "topRiskFactors" TEXT[],
    "priorityActions" TEXT[],
    "nextAssessmentDue" TIMESTAMP(3),

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "micro_lessons" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "language" "Language" NOT NULL DEFAULT 'ENGLISH',
    "readTimeSecs" INTEGER NOT NULL DEFAULT 45,
    "sourceUrl" TEXT,

    CONSTRAINT "micro_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_micro_lessons" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "wasHelpful" BOOLEAN,

    CONSTRAINT "user_micro_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_stats" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "badgesEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gamification_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "targetMetric" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "pointsReward" INTEGER NOT NULL DEFAULT 50,
    "badgeImageUrl" TEXT,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "sharedAt" TIMESTAMP(3),

    CONSTRAINT "user_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT,
    "pointsValue" INTEGER NOT NULL DEFAULT 100,
    "triggerLogic" TEXT,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'ENGLISH',
    "translatedFrom" "Language",
    "ragSourceDocs" TEXT[],
    "modelUsed" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "containsEmergencySignal" BOOLEAN NOT NULL DEFAULT false,
    "wasEscalated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "triggerMessage" TEXT NOT NULL,
    "detectedKeywords" TEXT[],
    "status" "EscalationStatus" NOT NULL DEFAULT 'DETECTED',
    "nearestClinicId" TEXT,
    "clinicName" TEXT,
    "clinicAddress" TEXT,
    "clinicPhone" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "facilityAddress" TEXT,
    "facilityPhone" TEXT,
    "appointmentType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reminderSentAt" TIMESTAMP(3),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "users_whatsappId_key" ON "users"("whatsappId");

-- CreateIndex
CREATE UNIQUE INDEX "health_profiles_userId_key" ON "health_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_micro_lessons_userId_lessonId_key" ON "user_micro_lessons"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_stats_userId_key" ON "gamification_stats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_challenges_userId_challengeId_key" ON "user_challenges"("userId", "challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_name_key" ON "achievements"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON "user_achievements"("userId", "achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "escalations_sessionId_key" ON "escalations"("sessionId");

-- AddForeignKey
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomarkers" ADD CONSTRAINT "biomarkers_labResultId_fkey" FOREIGN KEY ("labResultId") REFERENCES "lab_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_micro_lessons" ADD CONSTRAINT "user_micro_lessons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_micro_lessons" ADD CONSTRAINT "user_micro_lessons_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "micro_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamification_stats" ADD CONSTRAINT "gamification_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenges" ADD CONSTRAINT "user_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenges" ADD CONSTRAINT "user_challenges_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
