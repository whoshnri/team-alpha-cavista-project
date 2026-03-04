import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { jwt } from "hono/jwt";
import { redis, getRedisStatus } from "./lib/redis.js";
import { upsertTrends } from "./lib/trends.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const user = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || "nimi_super_secret_key_123!";

// Middleware to protect user routes
user.use("/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));

const ProfileUpdateSchema = z.object({
    heightCm: z.number().optional(),
    weightKg: z.number().optional(),
    existingConditions: z.array(z.string()).optional(),
    familyHistory: z.array(z.string()).optional(),
    lifestyle: z.object({
        physicalActivityLevel: z.string().optional(),
        stressLevel: z.number().optional(),
        smokingStatus: z.string().optional(),
        dietType: z.string().optional(),
    }).optional(),
});

user.get("/profile", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;

    try {
        const profile = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                healthProfile: true,
            },
        });

        if (!profile) return c.json({ success: false, error: "User not found" }, 404);

        return c.json({ success: true, profile });
    } catch (err) {
        console.error("[Profile Get Error]", err);
        return c.json({ success: false, error: "Failed to fetch profile" }, 500);
    }
});

user.patch("/profile", zValidator("json", ProfileUpdateSchema), async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;
    const updates = c.req.valid("json");

    try {
        const { heightCm, weightKg, existingConditions, familyHistory, lifestyle } = updates;

        // Calculate BMI if height and weight are provided
        let bmi: number | undefined;
        if (heightCm && weightKg) {
            bmi = weightKg / ((heightCm / 100) ** 2);
        }

        await prisma.healthProfile.upsert({
            where: { userId },
            update: {
                heightCm,
                weightKg,
                bmi,
                existingConditions,
                familyHistory,
                physicalActivityLevel: lifestyle?.physicalActivityLevel,
                stressLevel: lifestyle?.stressLevel,
                smokingStatus: lifestyle?.smokingStatus,
                dietType: lifestyle?.dietType,
            },
            create: {
                userId,
                heightCm,
                weightKg,
                bmi,
                existingConditions: existingConditions || [],
                familyHistory: familyHistory || [],
                physicalActivityLevel: lifestyle?.physicalActivityLevel,
                stressLevel: lifestyle?.stressLevel,
                smokingStatus: lifestyle?.smokingStatus,
                dietType: lifestyle?.dietType,
            },
        });

        return c.json({ success: true, message: "Profile updated successfully" });
    } catch (err) {
        console.error("[Profile Update Error]", err);
        return c.json({ success: false, error: "Failed to update profile" }, 500);
    }
});


user.get("/chats", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;

    try {
        const sessions = await prisma.chatSession.findMany({
            where: { userId },
            orderBy: { startedAt: "desc" },
            take: 10,
            select: {
                id: true,
                startedAt: true,
                messages: true,
            },
        });

        const chats = sessions.map((s: any) => {
            const messages = Array.isArray(s.messages) ? s.messages : [];
            const firstUserMessage = messages.find((m: any) => m.role === 'user')?.content || "New conversation";

            return {
                id: s.id,
                firstMessage: firstUserMessage.slice(0, 60),
                lastMessageAt: s.startedAt?.toISOString() || new Date().toISOString(),
            };
        });

        return c.json({ success: true, chats });
    } catch (err) {
        console.error("[Chats Error]", err);
        return c.json({ success: true, chats: [] });
    }
});

// ─────────────────────────────────────────────
// GET /chats/:id — Full chat session messages
// ─────────────────────────────────────────────

user.get("/chats/:id", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;
    const sessionId = c.req.param("id");

    console.log(`[GET /chats/:id] ──────────────────────────────────────`);
    console.log(`[GET /chats/:id] Session: ${sessionId}, User: ${userId}`);

    try {
        const session = await prisma.chatSession.findFirst({
            where: { id: sessionId, userId },
            select: {
                id: true,
                startedAt: true,
                messages: true,
            },
        });

        if (!session) {
            console.warn(`[GET /chats/:id] Session not found for user ${userId}`);
            return c.json({ success: false, error: "Session not found" }, 404);
        }

        const rawMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
        console.log(`[GET /chats/:id] Raw messages in DB: ${rawMessages.length}`);

        // Log breakdown by role
        const roleCounts = rawMessages.reduce((acc: Record<string, number>, m: any) => {
            acc[m.role] = (acc[m.role] || 0) + 1;
            return acc;
        }, {});
        console.log(`[GET /chats/:id] Breakdown:`, JSON.stringify(roleCounts));

        // Log tool_result details
        rawMessages.filter((m: any) => m.role === 'tool_result').forEach((m: any, i: number) => {
            console.log(`[GET /chats/:id]   tool_result[${i}]: tool=${m.tool}, data_keys=${Object.keys(m.data || {}).join(',')}`);
        });

        const messages = rawMessages.map((m, idx) => {
            // Handle tool_result messages (clinic searches, heart rate scans, etc.)
            if (m.role === 'tool_result') {
                return {
                    id: `msg_${idx}`,
                    sender: 'TOOL_RESULT',
                    tool: m.tool,
                    data: m.data,
                    content: '',
                    createdAt: m.timestamp || session.startedAt,
                };
            }

            return {
                id: `msg_${idx}`,
                sender: m.role === 'assistant' ? 'AI' : 'USER',
                content: m.content,
                createdAt: m.timestamp || session.startedAt,
            };
        });

        console.log(`[GET /chats/:id] Returning ${messages.length} mapped messages`);
        console.log(`[GET /chats/:id] ──────────────────────────────────────`);

        return c.json({
            success: true,
            session: {
                ...session,
                messages
            }
        });
    } catch (err) {
        console.error("[Chat Session Error]", err);
        return c.json({ success: false, error: "Failed to fetch chat session" }, 500);
    }
});



user.get("/health-profile", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;

    try {
        const profile = await prisma.healthProfile.findUnique({
            where: { userId }
        });

        if (!profile) {
            return c.json({ success: false, error: { message: 'No profile found', code: 'NOT_FOUND' } }, 404);
        }

        // Attach human readable interpretation
        const interpretation = {
            heartRate: profile.hrBaseline ? `${Math.round(profile.hrBaseline)} BPM baseline` : 'Not enough data',
            hrv: profile.hrvBaseline ? `${Math.round(profile.hrvBaseline)}ms RMSSD baseline` : 'Not enough data',
            gait: profile.gaitRegularityBase ? `${Math.round(profile.gaitRegularityBase)}/100 regularity` : 'Not enough data',
            fatigue: profile.fatigueIndexBase ? `${Math.round(profile.fatigueIndexBase)}/100 fatigue index` : 'Not enough data',
            confidence: `${Math.round(profile.profileConfidence * 100)}% — ${profile.totalScans} readings collected`,
            risks: [
                profile.chronicFatigueRisk && 'Chronic fatigue risk detected',
                profile.elevatedHRRisk && 'Elevated resting heart rate',
                profile.lowHRVRisk && 'Low HRV — possible stress or fatigue',
                profile.sedentaryRisk && 'Sedentary behaviour pattern detected',
            ].filter(Boolean),
            metadata: profile.labMetadata || {}
        };

        return c.json({ success: true, profile, interpretation });
    } catch (err) {
        console.error("[Health Profile Error]", err);
        return c.json({ success: false, error: "Failed to fetch health profile" }, 500);
    }
});


user.get("/trends", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;
    const fresh = c.req.query("fresh") === 'true';

    try {
        if (!getRedisStatus()) {
            return c.json({ success: false, error: "Trends cache unavailable" }, 503);
        }

        const trendKey = `nimi:trends:${userId}`;

        if (fresh) {
            console.log(`[Trends] Rebuilding cache for user ${userId}`);
            await redis.del(trendKey);
            const profile = await prisma.healthProfile.findUnique({
                where: { userId }
            });

            if (profile) {
                // If fresh, set before and after to same profile to initialize skewed stats at 0
                await upsertTrends(userId, profile, profile, true);
            }
        }

        const rawCache = await redis.hgetall(trendKey);
        const trends = Object.values(rawCache).map(v => JSON.parse(v));

        if (trends.length === 0 && !fresh) {
            // First time loading - build cache auto
            const profile = await prisma.healthProfile.findUnique({
                where: { userId }
            });
            if (profile) {
                await upsertTrends(userId, profile, profile, true);
            }
            const updatedCache = await redis.hgetall(trendKey);
            const initialTrends = Object.values(updatedCache).map(v => JSON.parse(v));

            const anomalous = initialTrends.filter((t: any) => t.isAnomalous);
            const normal = initialTrends.filter((t: any) => !t.isAnomalous);

            return c.json({ success: true, trends: initialTrends, anomalous, normal });
        }

        const anomalous = trends.filter((t: any) => t.isAnomalous);
        const normal = trends.filter((t: any) => !t.isAnomalous);

        return c.json({ success: true, trends, anomalous, normal });

    } catch (err) {
        console.error("[Trends API Error]", err);
        return c.json({ success: false, error: "Failed to fetch trends" }, 500);
    }
});

user.get("/vital-insight", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;
    const vitalKey = c.req.query("vital_key");
    const fresh = c.req.query("fresh") === 'true';

    if (!vitalKey) return c.json({ success: false, error: "vital_key is required" }, 400);

    try {
        if (!getRedisStatus()) {
            return c.json({ success: false, error: "Redis cache unavailable" }, 503);
        }

        const cacheKey = `nimi:insight:${userId}:${vitalKey}`;

        if (!fresh) {
            const cachedInsight = await redis.get(cacheKey);
            if (cachedInsight) {
                return c.json({ success: true, insight: cachedInsight, cached: true });
            }
        }

        // Need to build the insight
        const profile = await prisma.healthProfile.findUnique({
            where: { userId }
        });

        if (!profile) return c.json({ success: false, error: "Profile not found" }, 404);

        const trendKey = `nimi:trends:${userId}`;
        const rawCache = await redis.hgetall(trendKey);

        let targetTrendStr = rawCache[vitalKey];
        if (!targetTrendStr && fresh) {
            await upsertTrends(userId, profile, profile, false);
            const freshRawCache = await redis.hgetall(trendKey);
            targetTrendStr = freshRawCache[vitalKey];
        }

        if (!targetTrendStr) return c.json({ success: false, error: "Trend data not found for vital" }, 404);

        const targetTrend = JSON.parse(targetTrendStr);
        const allTrends = Object.values(rawCache).map(v => JSON.parse(v));
        const anomalousTrends = allTrends.filter(t => t.isAnomalous);

        const prompt = `
You are Nimi, an expert clinical AI analyzing a specific health vital trend for a user.
The user is looking for an insight into their ${targetTrend.label}.

Target Vital Data:
- Baseline: ${targetTrend.baseline.toFixed(1)} ${targetTrend.unit}
- Current: ${targetTrend.current.toFixed(1)} ${targetTrend.unit}
- Change: ${targetTrend.skew.toFixed(1)} (${targetTrend.skewPercent.toFixed(1)}%)
- Status: ${targetTrend.isAnomalous ? 'ANOMALOUS (High Variation)' : 'NORMAL'}
- Direction: ${targetTrend.direction} (${targetTrend.trend})

Current Health Profile Context:
- Height: ${profile.heightCm}cm, Weight: ${profile.weightKg}kg
- Existing Conditions: ${(profile.existingConditions as any)?.join(', ') || 'None'}
- Age: ${(profile as any).age || 'Not provided'}
- Dominant Activity: ${profile.dominantActivity}
- Other Anomalous Vitals right now: ${anomalousTrends.map(t => t.label).join(', ') || 'None'}

Generate a structured markdown insight for this specific vital shift. It must contain exactly these five sections with these exact headers:
### What it means
(Plain language explanation of this specific shift)
### Why it matters
(Clinical significance of this metric and why this change is relevant)
### Connected signals
(How this might relate to their existing conditions, activity, or other anomalous vitals)
### What to do
(Specific, highly actionable steps for the next 7 days. Use bullet points)
### Risk level
(LOW, MODERATE, or HIGH, followed by a brief 1-sentence justification. Never suggest consulting a doctor UNLESS risk is HIGH)

Keep the entire response under 300 words. Be direct, authoritative but empathetic.
        `;

        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash",
            temperature: 0.2,
            apiKey: process.env.GROQ_API_KEY, // We'll assume the environment uses this var for generic AI keys
        });

        const responseMsg = await llm.invoke(prompt);
        const insightResult = responseMsg.content.toString().trim();

        await redis.set(cacheKey, insightResult, 'EX', 7 * 24 * 60 * 60);

        return c.json({ success: true, insight: insightResult, cached: false });

    } catch (err) {
        console.error("[Vital Insight Error]", err);
        return c.json({ success: false, error: "Failed to generate AI insight" }, 500);
    }
});

user.get("/health-profile/detailed", async (c) => {
    const payload = c.get("jwtPayload");
    const userId = payload.userId;

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                healthProfile: true,
                riskAssessments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                },
                labResults: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { biomarkers: true }
                },
                vitals: {
                    orderBy: { recordedAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!user) return c.json({ success: false, error: "User not found" }, 404);

        const profile = user.healthProfile;
        const latestRisk = user.riskAssessments[0];

        // Prepare a plain-language summary of the profile
        const healthSummary = {
            physical: {
                label: "Physical Build",
                description: "Your basic body measurements and indicators.",
                metrics: [
                    { label: "Height", value: profile?.heightCm ? `${profile.heightCm} cm` : "Not set" },
                    { label: "Weight", value: profile?.weightKg ? `${profile.weightKg} kg` : "Not set" },
                    { label: "Body Mass Index (BMI)", value: profile?.bmi ? profile.bmi.toFixed(1) : "Not set", note: "A measure of body fat based on height and weight." }
                ]
            },
            vitals: {
                label: "Heart & Circulation",
                description: "How your heart and blood flow are performing lately.",
                metrics: [
                    { label: "Baseline Heart Rate", value: profile?.hrBaseline ? `${Math.round(profile.hrBaseline)} BPM` : "Reading..." },
                    { label: "Heart Rhythm Stability (HRV)", value: profile?.hrvBaseline ? `${Math.round(profile.hrvBaseline)}ms` : "Gathering data...", note: "Higher often means better stress recovery." },
                    { label: "Latest Blood Pressure", value: user.vitals[0]?.systolicBP ? `${user.vitals[0].systolicBP}/${user.vitals[0].diastolicBP} mmHg` : "Not recorded" }
                ]
            },
            risks: {
                label: "Preventative Insights",
                description: "Areas where your health data suggests we should focus.",
                indicators: [
                    { label: "Overall Risk Level", value: latestRisk?.overallRiskLevel || "Calculating...", color: latestRisk?.overallRiskLevel === 'LOW' ? 'green' : 'amber' },
                    { label: "Fatigue Risk", status: profile?.chronicFatigueRisk ? "Elevated" : "Low", description: "Based on your activity and heart patterns." },
                    { label: "Activity Level", status: profile?.sedentaryRisk ? "Needs Improvement" : "Good", description: profile?.physicalActivityLevel || "Monitor your daily movement." }
                ]
            },
            history: {
                label: "Health Background",
                description: "Information about your medical history and lifestyle.",
                data: [
                    { label: "Known Conditions", values: profile?.existingConditions || [] },
                    { label: "Family History", values: profile?.familyHistory || [] },
                    {
                        label: "Lifestyle Habits", items: [
                            profile?.smokingStatus && `Smoking: ${profile.smokingStatus}`,
                            profile?.alcoholUse && `Alcohol: ${profile.alcoholUse}`,
                            profile?.dietType && `Diet: ${profile.dietType}`
                        ].filter(Boolean)
                    }
                ]
            }
        };

        return c.json({
            success: true,
            data: {
                user: {
                    name: user.fullName,
                    age: user.dateOfBirth ? Math.floor((new Date().getTime() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null,
                    gender: user.gender
                },
                summary: healthSummary,
                confidence: profile?.profileConfidence || 0,
                lastUpdated: profile?.updatedAt || user.updatedAt
            }
        });
    } catch (err) {
        console.error("[Detailed Health Profile Error]", err);
        return c.json({ success: false, error: "Failed to fetch detailed profile" }, 500);
    }
});

export { user as userRoutes };
