
const EMA_WEIGHT = 0.2; // how much new data influences baseline
const MIN_READINGS_FOR_CONFIDENCE = 10;

import { upsertTrends } from './trends.js';

function exponentialMovingAverage(current: number | null, newValue: number): number {
    if (current === null) return newValue;
    return (1 - EMA_WEIGHT) * (current ?? 0) + EMA_WEIGHT * newValue;
}

function updateStdDev(currentStd: number | null, currentBase: number, newValue: number): number {
    const diff = Math.pow(newValue - currentBase, 2);
    if (currentStd === null) return Math.sqrt(diff);
    return Math.sqrt((1 - EMA_WEIGHT) * Math.pow(currentStd, 2) + EMA_WEIGHT * diff);
}

function deriveTrend(baseline: number | null, newValue: number, stdDev: number | null): string {
    if (!baseline || !stdDev) return 'stable';
    const delta = newValue - baseline;
    if (delta > stdDev * 0.5) return 'improving';
    if (delta < -stdDev * 0.5) return 'declining';
    return 'stable';
}

function deriveRiskFlags(profile: any) {
    return {
        chronicFatigueRisk: (profile.fatigueIndexBase ?? 0) > 60,
        elevatedHRRisk: (profile.hrBaseline ?? 0) > 100,
        lowHRVRisk: (profile.hrvBaseline ?? 100) < 20,
        sedentaryRisk: (profile.dominantActivity === 'stationary') &&
            (profile.avgDailySteps ?? 0) < 50
    };
}

export type recalibrateData = {
    heartRate?: number | null,
    hrv?: number | null,
    respiratoryRate?: number | null,
    fatigueIndex?: number | null,
    stepsEstimated?: number | null,
    estimatedCalories?: number | null,
    activity?: string | null,
    biomarkers?: { name: string, value: number, unit: string }[] | null,
};

export async function recalibrateHealthProfile(
    prisma: any,
    userId: string,
    data: recalibrateData | recalibrateData[]
) {
    const dataPoints = Array.isArray(data) ? data : [data];
    console.log(`[HealthProfile] Starting recalibration for user: ${userId} (${dataPoints.length} points)`);

    let profile = await prisma.healthProfile.findUnique({ where: { userId } });

    if (!profile) {
        console.log(`[HealthProfile] Creating new profile for user: ${userId}`);
        profile = await prisma.healthProfile.create({ data: { userId } });
    }

    // Work with a mutable copy of the profile state
    let current = { ...profile };
    let metadata = (profile.labMetadata as any) || {};
    if (typeof metadata === 'string') metadata = JSON.parse(metadata);

    const metricsUpdated = new Set<string>();

    for (const point of dataPoints) {
        if (point.heartRate) {
            current.hrBaseline = exponentialMovingAverage(current.hrBaseline, point.heartRate);
            current.hrStdDev = updateStdDev(current.hrStdDev, current.hrBaseline || point.heartRate, point.heartRate);
            current.hrTrend = deriveTrend(current.hrBaseline, point.heartRate, current.hrStdDev);
            current.hrReadingCount = (current.hrReadingCount || 0) + 1;
            metricsUpdated.add('HeartRate');
        }

        if (point.hrv) {
            current.hrvBaseline = exponentialMovingAverage(current.hrvBaseline, point.hrv);
            current.hrvStdDev = updateStdDev(current.hrvStdDev, current.hrvBaseline || point.hrv, point.hrv);
            current.hrvTrend = deriveTrend(current.hrvBaseline, point.hrv, current.hrvStdDev);
            metricsUpdated.add('HRV');
        }

        if (point.respiratoryRate) {
            current.respiratoryBase = exponentialMovingAverage(current.respiratoryBase, point.respiratoryRate);
            current.respiratoryStdDev = updateStdDev(current.respiratoryStdDev, current.respiratoryBase || point.respiratoryRate, point.respiratoryRate);
            metricsUpdated.add('RespiratoryRate');
        }

        if (point.fatigueIndex !== null && point.fatigueIndex !== undefined) {
            current.fatigueIndexBase = exponentialMovingAverage(current.fatigueIndexBase, point.fatigueIndex);
            metricsUpdated.add('FatigueIndex');
        }

        if (point.stepsEstimated) {
            current.stepsPerWindowBase = exponentialMovingAverage(current.stepsPerWindowBase, point.stepsEstimated);
            current.avgDailySteps = (current.avgDailySteps || 0) + point.stepsEstimated;
            metricsUpdated.add('Steps');
        }

        if (point.estimatedCalories) {
            current.avgDailyCalories = (current.avgDailyCalories || 0) + point.estimatedCalories;
        }

        if (point.activity) {
            current.dominantActivity = point.activity;
        }

        if (point.biomarkers) {
            for (const bio of point.biomarkers) {
                const normalized = bio.name.toLowerCase().trim();
                if (normalized === 'heart rate' || normalized === 'pulse') {
                    current.hrBaseline = exponentialMovingAverage(current.hrBaseline, bio.value);
                    metricsUpdated.add('Lab:HeartRate');
                } else if (normalized === 'hrv' || normalized === 'heart rate variability') {
                    current.hrvBaseline = exponentialMovingAverage(current.hrvBaseline, bio.value);
                    metricsUpdated.add('Lab:HRV');
                } else {
                    metadata[bio.name] = {
                        value: bio.value,
                        unit: bio.unit,
                        updatedAt: new Date().toISOString()
                    };
                    metricsUpdated.add(`LabMeta:${bio.name}`);
                }
            }
        }

        current.totalScans = (current.totalScans || 0) + 1;
    }

    // Derive risks and confidence
    const risks = deriveRiskFlags(current);
    const totalScans = current.totalScans;
    const profileConfidence = Math.min(1.0, totalScans / MIN_READINGS_FOR_CONFIDENCE);

    console.log(`[HealthProfile] Saving final batch update for ${userId}. Metrics affected: ${Array.from(metricsUpdated).join(', ')}`);

    // Explicitly map only relevant fields to avoid Prisma internal field leakage or PKey issues
    const updateData = {
        hrBaseline: current.hrBaseline,
        hrStdDev: current.hrStdDev,
        hrReadingCount: current.hrReadingCount,
        hrvBaseline: current.hrvBaseline,
        hrvStdDev: current.hrvStdDev,
        fatigueIndexBase: current.fatigueIndexBase,
        stepsPerWindowBase: current.stepsPerWindowBase,
        respiratoryBase: current.respiratoryBase,
        respiratoryStdDev: current.respiratoryStdDev,
        dominantActivity: current.dominantActivity,
        avgDailySteps: current.avgDailySteps,
        avgDailyCalories: current.avgDailyCalories,
        chronicFatigueRisk: risks.chronicFatigueRisk,
        elevatedHRRisk: risks.elevatedHRRisk,
        lowHRVRisk: risks.lowHRVRisk,
        sedentaryRisk: risks.sedentaryRisk,
        hrTrend: current.hrTrend,
        hrvTrend: current.hrvTrend,
        lastRecalibrated: new Date(),
        totalScans: totalScans,
        profileConfidence: profileConfidence,
        labMetadata: metadata
    };

    try {
        const updatedProfile = await prisma.healthProfile.update({
            where: { id: profile.id },
            data: updateData
        });

        // Fire and forget cache building. 
        // This will only work if the Redis connection is active in `./redis.ts`
        upsertTrends(userId, profile, updatedProfile).catch(err => {
            console.error(`[Trends] Failed to populate cache after recalibrate:`, err);
        });

        return updatedProfile;
    } catch (err) {
        console.error(`[HealthProfile Error] Update failed for ${userId} (ID: ${profile.id}):`, err);
        throw err;
    }
}
