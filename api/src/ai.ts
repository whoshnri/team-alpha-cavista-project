// routes/ai.ts — PreventIQ Hono AI endpoints

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { runPreventIQ } from "./ai/graph.js"
import type { CookieTurn, ToolResult } from "./ai/types.js";
import { prisma } from "../prisma/client.js"
import { recalibrateHealthProfile } from "./lib/recalibrate.js";
import { sseManager } from "./sse.js";

const ai = new Hono();
const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  throw new Error("GROQ_API_KEY is not defined");
}

// ─────────────────────────────────────────────
// DATA PERSISTENCE HELPERS
// ─────────────────────────────────────────────

async function persistChat(userId: string, message: string, response: string, category: string, escalation?: any) {
  try {
    // Find or create an active chat session for this user
    let session = await prisma.chatSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' }
    });

    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId, channel: "PUSH" }
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        sender: 'USER',
        content: message,
        containsEmergencySignal: escalation?.isEmergency ?? false
      }
    });

    // Save AI response
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        sender: 'AI',
        content: response,
        modelUsed: "llama-3.3-70b-versatile",
        wasEscalated: escalation?.isEmergency ?? false
      }
    });

    // If escalation detected, create/update escalation record
    if (escalation?.isEmergency) {
      await prisma.escalation.upsert({
        where: { sessionId: session.id },
        update: {
          triggerMessage: message,
          detectedKeywords: escalation.detectedKeywords ?? [],
        },
        create: {
          userId,
          sessionId: session.id,
          triggerMessage: message,
          detectedKeywords: escalation.detectedKeywords ?? [],
        },
      });
    }

    console.log(`[Persistence] Saved chat interaction for user: ${userId} in session: ${session.id}`);
  } catch (err) {
    console.error("[Persistence Error] Failed to save chat:", err);
  }
}

async function persistLab(userId: string, rawText: string, interpretation: any) {
  try {
    if (!interpretation) return;
    await prisma.labResult.create({
      data: {
        userId,
        rawText,
        testName: interpretation.testName || "Unknown Lab Test",
        plainLanguageSummary: interpretation.plainSummary,
        overallStatus: interpretation.overallStatus as any,
        aiRecommendations: interpretation.recommendations,
        interpretedAt: new Date(),
        biomarkers: {
          create: interpretation.biomarkers.map((bio: any) => ({
            name: bio.name,
            value: bio.value,
            unit: bio.unit,
            referenceMin: bio.referenceMin,
            referenceMax: bio.referenceMax,
            status: bio.status as any,
            flagNote: bio.flagNote
          }))
        }
      }
    });
    console.log(`[Persistence] Saved lab result for user: ${userId}`);

    // ─── RECALIBRATE HEALTH PROFILE ─────────────
    if (interpretation.biomarkers?.length > 0) {
      recalibrateHealthProfile(prisma, userId, {
        biomarkers: interpretation.biomarkers.map((bio: any) => ({
          name: bio.name,
          value: bio.value,
          unit: bio.unit
        }))
      }).catch(err => console.error("[Recalibrate Error] Lab data failed:", err));
    }
  } catch (err) {
    console.error("[Persistence Error] Failed to save lab result:", err);
  }
}

async function persistRisk(userId: string, scores: any) {
  try {
    if (!scores) return;
    await prisma.riskAssessment.create({
      data: {
        userId,
        overallRiskScore: scores.overall,
        overallRiskLevel: scores.overallLevel as any,
        diabetesRisk: scores.diabetes,
        hypertensionRisk: scores.hypertension,
        cardiovascularRisk: scores.cardiovascular,
        topRiskFactors: scores.topFactors,
        priorityActions: scores.recommendations
      }
    });
    console.log(`[Persistence] Saved risk assessment for user: ${userId}`);
  } catch (err) {
    console.error("[Persistence Error] Failed to save risk assessment:", err);
  }
}

async function persistLesson(userId: string, lesson: any) {
  try {
    if (!lesson) return;

    // Check if lesson exists by title or create new
    let dbLesson = await prisma.microLesson.findFirst({
      where: { title: lesson.title }
    });

    if (!dbLesson) {
      dbLesson = await prisma.microLesson.create({
        data: {
          title: lesson.title,
          content: lesson.content,
          category: lesson.category,
          readTimeSecs: lesson.readTimeSecs
        }
      });
    }

    // Link to user
    await prisma.userMicroLesson.upsert({
      where: { userId_lessonId: { userId, lessonId: dbLesson.id } },
      update: { sentAt: new Date() },
      create: { userId, lessonId: dbLesson.id }
    });
    console.log(`[Persistence] Linked lesson "${lesson.title}" to user: ${userId}`);
  } catch (err) {
    console.error("[Persistence Error] Failed to save micro-lesson:", err);
  }
}

async function getUserId(profile: any) {
  try {
    // If profile has an id, use it
    if (profile?.userId) return profile.userId;

    // Timeout for DB check to prevent hang — increased to 5s
    const userPromise = prisma.user.findFirst();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timed out after 5s")), 5000));

    //@ts-ignore
    const firstUser = await Promise.race([userPromise, timeoutPromise]);
    if (firstUser) return (firstUser as any).id;
  } catch (err) {
    console.warn("[Persistence] getUserId failed:", err instanceof Error ? err.message : err);
  }
  return null;
}

// ─────────────────────────────────────────────
// SHARED SCHEMAS
// ─────────────────────────────────────────────

const LifestyleSchema = z.object({
  smokingStatus: z.string().optional(),
  physicalActivityLevel: z.string().optional(),
  dietType: z.string().optional(),
  stressLevel: z.number().min(1).max(10).optional(),
});

const UserProfileSchema = z.object({
  age: z.number().optional(),
  gender: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  bmi: z.number().optional(),
  existingConditions: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  lifestyle: LifestyleSchema.optional(),
  preferredLanguage: z.string().optional(),
}).optional();

const ChatHistorySchema = z.array(
  z.object({
    user: z.string(),
    bot: z.string().nullable(),
  })
).default([]);

// ─────────────────────────────────────────────
// ROUTE SCHEMAS (one per endpoint)
// ─────────────────────────────────────────────

const ToolResultSchema = z.object({
  tool: z.string(),
  data: z.record(z.any()),
});

const ChatBodySchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  chatHistory: ChatHistorySchema,
  userProfile: UserProfileSchema,
  toolResults: z.array(ToolResultSchema).optional().default([]),
});

const VisionResultBodySchema = z.object({
  visionResult: z.any(),
  chatHistory: ChatHistorySchema,
  userProfile: UserProfileSchema,
  toolCallId: z.string().optional(),
});

const LabBodySchema = z.object({
  labText: z.string().min(10, "Please provide the lab result text"),
  userProfile: UserProfileSchema,
});

const RiskBodySchema = z.object({
  userProfile: UserProfileSchema,
  message: z.string().optional().default("Please assess my health risk."),
});

const LessonBodySchema = z.object({
  topic: z.string().optional(),
  userProfile: UserProfileSchema,
});

const EscalateBodySchema = z.object({
  message: z.string().min(1, "Message is required"),
});


// ─────────────────────────────────────────────
// POST /api/ai/chat
// General health Q&A — auto-detects intent
// ─────────────────────────────────────────────

ai.post("/chat", zValidator("json", ChatBodySchema), async (c) => {
  const body = c.req.valid("json");
  console.log("[API: /chat] Received body:", JSON.stringify(body, null, 2));
  const { message, chatHistory, userProfile, toolResults } = body;

  // Fetch enriched profile from DB if we have a JWT user
  let enrichedProfile = userProfile;
  try {
    const payload = c.get("jwtPayload") as any;
    if (payload?.userId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { healthProfile: true },
      });
      if (dbUser) {
        const hp = (dbUser as any).healthProfile;
        // Compute age from dateOfBirth
        const dob = (dbUser as any).dateOfBirth;
        let computedAge = userProfile?.age;
        if (dob) {
          const birthDate = new Date(dob);
          const today = new Date();
          computedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            computedAge--;
          }
        }
        enrichedProfile = {
          age: computedAge,
          gender: (dbUser as any).gender ?? userProfile?.gender,
          heightCm: hp?.heightCm ?? userProfile?.heightCm,
          weightKg: hp?.weightKg ?? userProfile?.weightKg,
          bmi: hp?.bmi ?? userProfile?.bmi,
          existingConditions: hp?.existingConditions ?? userProfile?.existingConditions,
          familyHistory: hp?.familyHistory ?? userProfile?.familyHistory,
          lifestyle: {
            smokingStatus: hp?.smokingStatus ?? userProfile?.lifestyle?.smokingStatus,
            physicalActivityLevel: hp?.physicalActivityLevel ?? userProfile?.lifestyle?.physicalActivityLevel,
            dietType: hp?.dietType ?? userProfile?.lifestyle?.dietType,
            stressLevel: hp?.stressLevel ?? userProfile?.lifestyle?.stressLevel,
          },
        };
      }
    }
  } catch (profileErr) {
    console.warn("[/chat] Could not fetch enriched profile from DB:", profileErr);
  }

  try {
    // 1. Run the AI graph
    const result = await runPreventIQ({
      message,
      chatHistory: chatHistory as CookieTurn[],
      userProfile: enrichedProfile,
      toolResults: toolResults as ToolResult[],
      apiKey: API_KEY,
    });

    // 2. Build the base response
    const response: Record<string, unknown> = {
      success: true,
      response: result.response,
      code: result.code,
      category: result.category,
      chatHistory: result.chatHistory,
    };

    // 3. Attach optional structured data only if present
    if (result.labInterpretation) response.labInterpretation = result.labInterpretation;
    if (result.riskScores) response.riskScores = result.riskScores;
    if (result.microLesson) response.microLesson = result.microLesson;
    if (result.escalation?.isEmergency) response.escalation = result.escalation;
    if (result.toolRequests?.length) {
      response.toolRequests = result.toolRequests;

      // Pulse SSE for vision capture requests
      const jwtPayload = c.get("jwtPayload") as any;
      const jwtUserId = jwtPayload?.userId;

      if (jwtUserId) {
        for (const req of result.toolRequests) {
          if (req.tool.startsWith("capture_")) {
            const captureType = req.tool.replace("capture_", "") as "fundus" | "skin" | "general";

            sseManager.sendToUser(jwtUserId, "capture_request", {
              __capture_request: true,
              captureType,
              reason: req.reason,
              urgency: "recommended",
              guidance: {
                title: `Guided ${captureType.toUpperCase()} Capture`,
                instructions: captureType === "fundus"
                  ? ["Hold camera 2-3cm from eye", "Look for the red/orange glow", "AI will detect the retina automatically"]
                  : captureType === "skin"
                    ? ["Hold camera 10cm from skin", "Ensure center focus on the lesion", "Natural light is best"]
                    : ["Align the camera with the area of concern", "Hold steady"],
                overlay: `${captureType}_guide`,
              },
              analysisConfig: {
                endpoint: `/api/vision/${captureType}`,
                additionalContext: req.reason
              },
              _toolCallId: (req as any).id || `tc_${Date.now()}`
            }).catch(e => console.error("[SSE] Vision push failed:", e));
          }
        }
      }
    }

    // 4. Background Persistence (Don't await to keep response fast)
    const jwtPayload = c.get("jwtPayload") as any;
    const jwtUserId = jwtPayload?.userId;

    if (jwtUserId) {
      persistChat(jwtUserId, message, (result.response as string), result.category, result.escalation);
      if (result.labInterpretation) persistLab(jwtUserId, message, result.labInterpretation);

      // ─── RECALIBRATE FROM TOOL RESULTS ────────────
      if (toolResults && toolResults.length > 0) {
        for (const tr of toolResults) {
          if (tr.tool === 'heart_rate_scan' && tr.data) {
            recalibrateHealthProfile(prisma, jwtUserId, {
              heartRate: tr.data.bpm,
              hrv: tr.data.hrv_rmssd || (tr.data.median_ibi_ms ? (1000 / tr.data.median_ibi_ms) * 60 : null),
            }).catch(err => console.error("[Recalibrate Error] Failed:", err));
          }
        }
      }
    } else {
      console.warn("[/chat] No JWT userId found, chat will not be persisted.");
    }

    return c.json(response);
  } catch (err) {
    console.error("[/chat] error:", err);
    return c.json({ success: false, error: "Failed to process your message." }, 500);
  }
});

// Resumes chat after vision capture
ai.post("/chat/vision-result", zValidator("json", VisionResultBodySchema), async (c) => {
  const { visionResult, chatHistory, userProfile } = c.req.valid("json");
  console.log("[API: /chat/vision-result] Received result:", JSON.stringify(visionResult, null, 2));

  try {
    // Treat the vision result as a tool result
    const toolResults: ToolResult[] = [{
      tool: (visionResult.type?.replace("_screening", "") === "fundus" ? "capture_fundus" :
        visionResult.type?.replace("_screening", "") === "skin" ? "capture_skin" : "capture_general") as any,
      data: visionResult
    }];

    const result = await runPreventIQ({
      message: "Vision scan complete.",
      chatHistory: chatHistory as CookieTurn[],
      userProfile,
      toolResults,
      visionResult,
      apiKey: API_KEY,
    });

    return c.json({
      success: true,
      response: result.response,
      chatHistory: result.chatHistory,
      toolRequests: result.toolRequests,
    });
  } catch (err) {
    console.error("[/chat/vision-result] error:", err);
    return c.json({ success: false, error: "Failed to resume chat with vision result." }, 500);
  }
});


// ─────────────────────────────────────────────
// POST /api/ai/lab
// Dedicated lab result interpretation
// ─────────────────────────────────────────────

ai.post("/lab", zValidator("json", LabBodySchema), async (c) => {
  const body = c.req.valid("json");
  console.log("[API: /lab] Received body:", JSON.stringify(body, null, 2));
  const { labText, userProfile } = body;

  try {
    // 1. Run graph with forced lab_result intent
    const result = await runPreventIQ({
      message: labText,
      chatHistory: [],
      userProfile,
      intent: "lab_result",
      apiKey: API_KEY,
    });

    // 4. Background Persistence
    getUserId(userProfile).then(userId => {
      if (userId) persistLab(userId, labText, result.labInterpretation);
    }).catch(err => console.error("[Persistence Error] Lab storage failed:", err));

    // 2. Return structured interpretation
    return c.json({
      success: true,
      summary: result.response,
      labInterpretation: result.labInterpretation,
    });
  } catch (err) {
    console.error("[/lab] error:", err);
    return c.json({ success: false, error: "Failed to interpret lab result." }, 500);
  }
});


// ─────────────────────────────────────────────
// POST /api/ai/risk
// NCD risk score assessment
// ─────────────────────────────────────────────

/* Hidden for now
ai.post("/risk", zValidator("json", RiskBodySchema), async (c) => {
  ...
});
*/


// ─────────────────────────────────────────────
// POST /api/ai/lesson
// Personalized micro-lesson generation
// ─────────────────────────────────────────────

/* Hidden for now
ai.post("/lesson", zValidator("json", LessonBodySchema), async (c) => {
  ...
});
*/


// ─────────────────────────────────────────────
// POST /api/ai/escalate
// Dedicated emergency detection check
// ─────────────────────────────────────────────

ai.post("/escalate", zValidator("json", EscalateBodySchema), async (c) => {
  const body = c.req.valid("json");
  console.log("[API: /escalate] Received body:", JSON.stringify(body, null, 2));
  const { message } = body;

  try {
    // 1. Run graph — escalation node always runs first regardless of intent
    const result = await runPreventIQ({
      message,
      chatHistory: [],
      intent: "health_qa",
      apiKey: API_KEY,
    });

    // 2. Return escalation assessment
    return c.json({
      success: true,
      isEmergency: result.escalation?.isEmergency ?? false,
      escalation: result.escalation,
      response: result.response,
    });
  } catch (err) {
    console.error("[/escalate] error:", err);
    return c.json({ success: false, error: "Failed to run escalation check." }, 500);
  }
});

export const aiRoutes = ai;
