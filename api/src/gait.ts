// gait.ts — Gait Analysis endpoints for PWA logging and AI tool retrieval

import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { prisma } from "../prisma/client.js";
import { recalibrateHealthProfile } from "./lib/recalibrate.js";
import { sseManager } from "./sse.js";
import { encryptToken, decryptToken } from "./lib/crypto.js";
import { sign } from "hono/jwt";

const gait = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || "preventiq_super_secret_key_123!";

// ─────────────────────────────────────────────
// PUBLIC ENDPOINT: Create Gait Log (PWA)
// ─────────────────────────────────────────────

gait.post("/log", jwt({ secret: JWT_SECRET, alg: "HS256" }), async (c) => {
    try {
        const body = await c.req.json();
        const payload = c.get("jwtPayload");
        const userId = payload.userId;

        // Handle batch or single
        const logs = body.batch ? (Array.isArray(body.batch) ? body.batch : [body.batch]) : [body];

        if (!userId) {
            return c.json({ success: false, error: "userId missing from token" }, 401);
        }

        // Verify user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return c.json({ success: false, error: "User not found" }, 404);
        }

        const results = await Promise.all(logs.map(async (logData: any) => {
            return await prisma.gaitLog.create({
                data: {
                    userId,
                    timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
                    windowDurationSec: logData.window_duration_seconds ?? logData.windowDurationSec,
                    sampleCount: logData.sample_count ?? logData.sampleCount,
                    activity: logData.activity_classification ?? logData.activity,
                    stepsEstimated: logData.steps_estimated ?? logData.stepsEstimated,
                    dominantAxis: logData.dominant_axis ?? logData.dominantAxis,
                    meanMagnitude: logData.mean_magnitude ?? logData.meanMagnitude,
                    stdDevMagnitude: logData.std_dev_magnitude ?? logData.stdDevMagnitude,
                    gaitRegularityScore: logData.gait_regularity_score ?? logData.gaitRegularityScore,
                    fatigueIndex: logData.fatigue_index ?? logData.fatigueIndex,
                    estimatedCalories: logData.estimated_calories ?? logData.estimatedCalories,
                    movementDetected: logData.movementDetected ?? (logData.std_dev_magnitude > 0.15),
                    prolongedStillness: logData.anomaly_flags?.prolonged_stillness ?? logData.prolongedStillness ?? false,
                    highVariability: logData.anomaly_flags?.high_variability ?? logData.highVariability ?? false,
                    irregularGait: logData.anomaly_flags?.irregular_gait ?? logData.irregularGait ?? false,
                    xMean: logData.raw_summary?.x_mean ?? logData.xMean,
                    yMean: logData.raw_summary?.y_mean ?? logData.yMean,
                    zMean: logData.raw_summary?.z_mean ?? logData.zMean,
                    xVariance: logData.raw_summary?.x_variance ?? logData.xVariance,
                    yVariance: logData.raw_summary?.y_variance ?? logData.yVariance,
                    zVariance: logData.raw_summary?.z_variance ?? logData.zVariance,
                },
            });
        }));

        console.log(`[Gait] Stashed ${results.length} logs for user: ${userId}`);

        // ─── RECALIBRATE HEALTH PROFILE ─────────────
        await recalibrateHealthProfile(prisma, userId, results.map(log => ({
            gaitRegularity: log.gaitRegularityScore,
            fatigueIndex: log.fatigueIndex,
            stepsEstimated: log.stepsEstimated,
            estimatedCalories: log.estimatedCalories,
            activity: log.activity,
        })));

        return c.json({ success: true, count: results.length }, 201);
    } catch (err: any) {
        console.error("[Gait Error] Failed to process logs:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// ─────────────────────────────────────────────
// PROTECTED ENDPOINT: Get Recent Gait Data
// ─────────────────────────────────────────────

gait.get("/:userId/recent", jwt({ secret: JWT_SECRET, alg: "HS256" }), async (c) => {
    const userId = c.req.param("userId");
    const payload = c.get("jwtPayload");

    // Basic security: only allow user to fetch their own gait data (unless admin etc)
    if (payload.userId !== userId) {
        return c.json({ success: false, error: "Unauthorized access to user data" }, 403);
    }

    try {
        // Search window: last 30 minutes
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const logs = await prisma.gaitLog.findMany({
            where: {
                userId,
                createdAt: { gte: thirtyMinutesAgo },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
        });

        console.log(`[Gait] Fetched ${logs.length} recent logs for user: ${userId}`);

        return c.json({
            success: true,
            userId,
            count: logs.length,
            logs: logs.map((l: any) => ({
                timestamp: l.timestamp,
                activity: l.activity,
                steps: l.stepsEstimated,
                regularity: l.gaitRegularityScore,
                fatigue: l.fatigueIndex,
                irregular: l.irregularGait,
                variability: l.highVariability,
                movement: l.movementDetected
            }))
        });
    } catch (err: any) {
        console.error("[Gait Error] Failed to fetch logs:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// ─────────────────────────────────────────────
// PROTECTED ENDPOINT: Ping PWA
// ─────────────────────────────────────────────

gait.post("/ping/:userId", jwt({ secret: JWT_SECRET, alg: "HS256" }), async (c) => {
    const userId = c.req.param("userId");
    const payload = c.get("jwtPayload");

    if (payload.userId !== userId) {
        return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    const magicLink = `${process.env.PWA_URL || "http://localhost:3001"}/?token=${encryptToken({ userId, ts: Date.now() })}`

    const sent = await sseManager.sendToUser(userId, "PING_PWA", {
        timestamp: new Date().toISOString(),
        magicLink
    });

    return c.json({
        success: sent,
        message: sent ? "Ping sent" : "PWA not connected",
        magicLink: magicLink
    });
});

gait.post("/pong/:userId", jwt({ secret: JWT_SECRET, alg: "HS256" }), async (c) => {
    const userId = c.req.param("userId");
    const payload = c.get("jwtPayload");

    if (payload.userId !== userId) {
        return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    await sseManager.sendToUser(userId, "PONG_PWA", { timestamp: new Date().toISOString() });
    return c.json({ success: true, message: "Pong received" });
});

// ─────────────────────────────────────────────
// PUBLIC ENDPOINT: Validate Magic Link
// ─────────────────────────────────────────────

gait.get("/validate-magic-link", async (c) => {
    const token = c.req.query("token");
    console.log(`[Gait] Validating magic link. Token present: ${!!token}`);
    if (!token) return c.json({ success: false, error: "Token missing" }, 400);

    const payload = decryptToken(token);
    console.log(`[Gait] Decrypted payload:`, payload);
    if (!payload || !payload.userId || !payload.ts) {
        return c.json({ success: false, error: "Invalid or expired token" }, 401);
    }

    // 5 minute TTL
    if (Date.now() - payload.ts > 5 * 60 * 1000) {
        return c.json({ success: false, error: "Token expired" }, 401);
    }

    // Issue a fresh JWT for the PWA
    const jwtToken = await sign({ userId: payload.userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }, JWT_SECRET);

    return c.json({ success: true, token: jwtToken, userId: payload.userId });
});

export { gait as gaitRoutes };
