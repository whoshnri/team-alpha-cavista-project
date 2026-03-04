import { redis, getRedisStatus } from './redis.js';

type MetricDirectionPreference = 'higher' | 'lower';

const metricPreferences: Record<string, MetricDirectionPreference> = {
    hrBaseline: 'lower',
    hrvBaseline: 'higher',
    respiratoryBase: 'lower',
    fatigueIndexBase: 'lower',
    stepsPerWindowBase: 'higher',
    'bio:haemoglobin': 'higher',
    'bio:fasting glucose': 'lower',
    'bio:total cholesterol': 'lower',
    'bio:ldl': 'lower',
    'bio:hdl': 'higher',
    'bio:vitamin d': 'higher',
    'bio:ferritin': 'higher',
    'bio:serum iron': 'higher',
    'bio:creatinine': 'lower',
};

const metricLabelsAndUnits: Record<string, { label: string, unit: string }> = {
    hrBaseline: { label: 'Resting Heart Rate', unit: 'bpm' },
    hrvBaseline: { label: 'Heart Rate Variability', unit: 'ms' },
    respiratoryBase: { label: 'Respiratory Rate', unit: 'brpm' },
    fatigueIndexBase: { label: 'Fatigue Index', unit: '/100' },
    stepsPerWindowBase: { label: 'Steps per Window', unit: 'steps' },
    'bio:haemoglobin': { label: 'Haemoglobin', unit: 'g/dL' },
    'bio:fasting glucose': { label: 'Fasting Glucose', unit: 'mg/dL' },
    'bio:total cholesterol': { label: 'Total Cholesterol', unit: 'mg/dL' },
    'bio:ldl': { label: 'LDL Cholesterol', unit: 'mg/dL' },
    'bio:hdl': { label: 'HDL Cholesterol', unit: 'mg/dL' },
    'bio:vitamin d': { label: 'Vitamin D', unit: 'ng/mL' },
    'bio:ferritin': { label: 'Ferritin', unit: 'ng/mL' },
    'bio:serum iron': { label: 'Serum Iron', unit: 'μg/dL' },
    'bio:creatinine': { label: 'Creatinine', unit: 'mg/dL' },
};

function determineTrend(skew: number, preference: MetricDirectionPreference): 'improving' | 'declining' | 'stable' {
    if (Math.abs(skew) < 0.001) return 'stable';
    if (preference === 'higher') {
        return skew > 0 ? 'improving' : 'declining';
    } else {
        return skew < 0 ? 'improving' : 'declining';
    }
}

export interface TrendEntry {
    label: string;
    unit: string;
    baseline: number;
    current: number;
    skew: number;
    skewPercent: number;
    trend: 'improving' | 'declining' | 'stable';
    direction: 'up' | 'down' | 'flat';
    readingsCount: number;
    timestamp: string;
    stdDev: number;
    isAnomalous: boolean;
}

export async function upsertTrends(userId: string, beforeProfile: any, afterProfile: any, overrideBaselineAsCurrent = false) {
    if (!getRedisStatus()) return;

    try {
        const pipeline = redis.pipeline();
        const trendKey = `nimi:trends:${userId}`;

        const processMetric = (
            key: string,
            dictKey: string,
            beforeVal: number | undefined | null,
            afterVal: number | undefined | null,
            stdDev: number | undefined | null,
            readingsCount: number | undefined | null,
            timestamp: string
        ) => {
            const current = afterVal ?? 0;
            const computedBaseline = overrideBaselineAsCurrent ? current : (beforeVal ?? current);

            if (current === 0 && computedBaseline === 0) return; // Skip empty metrics

            const skew = current - computedBaseline;
            const skewPercent = computedBaseline === 0 ? 0 : (skew / computedBaseline) * 100;
            const direction = skew > 0 ? 'up' : (skew < 0 ? 'down' : 'flat');

            const preference = metricPreferences[dictKey] || 'higher';
            const trend = determineTrend(skew, preference);

            const safeStdDev = stdDev ?? 1; // Default to 1 to prevent division by zero in anomaly checks when new
            const isAnomalous = Math.abs(skew) > safeStdDev * 1.5;

            const entry: TrendEntry = {
                label: metricLabelsAndUnits[dictKey]?.label || dictKey,
                unit: metricLabelsAndUnits[dictKey]?.unit || '',
                baseline: computedBaseline,
                current,
                skew,
                skewPercent,
                trend,
                direction,
                readingsCount: readingsCount ?? 1,
                timestamp,
                stdDev: safeStdDev,
                isAnomalous
            };

            // Write each entry to the hash
            pipeline.hset(trendKey, dictKey, JSON.stringify(entry));
            // Invalidate insight cache for this vital
            pipeline.del(`nimi:insight:${userId}:${dictKey}`);
        };

        const coreMetrics: (string | null)[][] = [
            ['hrBaseline', 'hrBaseline', 'hrStdDev', 'hrReadingCount'],
            ['hrvBaseline', 'hrvBaseline', 'hrvStdDev', 'totalScans'],
            ['respiratoryBase', 'respiratoryBase', 'respiratoryStdDev', 'totalScans'],
            ['fatigueIndexBase', 'fatigueIndexBase', null, 'totalScans'], // fatigueIndex lacks a stdDev in schema sometimes, fallback to 10
            ['stepsPerWindowBase', 'stepsPerWindowBase', null, 'totalScans'],
        ];

        const timestamp = new Date().toISOString();

        for (const [key, dictKey, stdDevKey, countKey] of coreMetrics) {
            const stdDevValue = stdDevKey ? afterProfile[stdDevKey] : (dictKey === 'fatigueIndexBase' ? 10 : 1000);
            processMetric(
                key ?? '',
                dictKey ?? "",
                beforeProfile[key ?? ""],
                afterProfile[key ?? ""],
                stdDevValue,
                afterProfile[countKey ?? ""],
                timestamp
            );
        }

        const beforeLabMeta = typeof beforeProfile.labMetadata === 'string'
            ? JSON.parse(beforeProfile.labMetadata || '{}')
            : (beforeProfile.labMetadata || {});

        const afterLabMeta = typeof afterProfile.labMetadata === 'string'
            ? JSON.parse(afterProfile.labMetadata || '{}')
            : (afterProfile.labMetadata || {});

        const labBiomarkers = [
            'haemoglobin', 'fasting glucose', 'total cholesterol', 'ldl', 'hdl', 'vitamin d', 'ferritin', 'serum iron', 'creatinine'
        ];

        for (const bio of labBiomarkers) {
            // Find key in labMeta case insensitively if needed, but schema says bio.name is stored. 
            // In recalibrate.ts it's stored as `bio.name` directly.
            // Let's check both exact match and lowercase
            const findMeta = (meta: Record<string, any>, name: string) => {
                for (const k in meta) {
                    if (k.toLowerCase() === name) return meta[k];
                }
                return null;
            };

            const beforeData = findMeta(beforeLabMeta, bio);
            const afterData = findMeta(afterLabMeta, bio);

            if (afterData) {
                const dictKey = `bio:${bio}`;
                // For biomarkers we might not have stdDev stored, use a standard 10% of value as dummy stdDev or default 1
                const dummyStdDev = afterData.value * 0.1 || 1;
                processMetric(
                    bio,
                    dictKey,
                    beforeData?.value,
                    afterData.value,
                    dummyStdDev,
                    afterProfile.totalScans,
                    afterData.updatedAt || timestamp
                );
            }
        }

        pipeline.expire(trendKey, 7 * 24 * 60 * 60); // Expire after 7 days
        await pipeline.exec();

    } catch (err) {
        console.error('[Trends Error] Failed to upsert trends for user', userId, err);
    }
}
