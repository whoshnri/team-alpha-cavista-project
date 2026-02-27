import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { jwt } from "hono/jwt";

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
