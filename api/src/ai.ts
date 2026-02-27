// routes/ai.ts — NIMI Hono AI endpoints

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { runNimi } from "./ai/graph.js"
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

// Embeds metadata into content using the <!--METADATA:{}--> convention
function embedMetadata(text: string, metadata: Record<string, any>): string {
  const filtered = Object.fromEntries(Object.entries(metadata).filter(([_, v]) => v != null));
  if (Object.keys(filtered).length === 0) return text;
  return `${text}\n<!--METADATA:${JSON.stringify(filtered)}-->`;
}

type PersistChatOptions = {
  userId: string;
  message: string;
  response: string;
  category: string;
  chatSessionId?: string;
  // Full AI result metadata
  toolRequests?: any[];
  toolResults?: any[];
  labInterpretation?: any;
  riskScores?: any;
  escalation?: any;
};

async function persistChat(opts: PersistChatOptions) {
  const {
    userId, message, response, category, chatSessionId,
    toolRequests, toolResults, labInterpretation, riskScores, escalation
  } = opts;

  try {
    let session = null;

    // Find session if ID provided
    if (chatSessionId) {
      session = await prisma.chatSession.findUnique({
        where: { id: chatSessionId },
      });
    }

    // Fallback/Create session
    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId, channel: "PUSH" }
      });
    }

    // Build assistant metadata (same shape the frontend expects)
    const assistantMetadata: Record<string, any> = {};
    if (toolRequests?.length) assistantMetadata.toolRequests = toolRequests;
    if (labInterpretation) assistantMetadata.lab = labInterpretation;
    if (riskScores) assistantMetadata.risk = riskScores;
    if (escalation?.isEmergency) assistantMetadata.escalation = escalation;

    // Embed metadata into the assistant content so the frontend can restore it
    const assistantContent = embedMetadata(response, assistantMetadata);

    // Prepare new messages to append
    const newMessages: any[] = [
      {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      },
      {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        metadata: {
          modelUsed: "gemini-2.5-flash",
          wasEscalated: escalation?.isEmergency ?? false,
          category
        }
      }
    ];

    // If the client sent tool results, persist each as a tool_result entry
    if (toolResults && toolResults.length > 0) {
      for (const tr of toolResults) {
        newMessages.push({
          role: 'tool_result',
          tool: tr.tool,
          data: tr.data,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Get existing messages and append
    const currentMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
    const updatedMessages = [...currentMessages, ...newMessages];

    // Update session with new messages
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        messages: updatedMessages
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
    return session.id;
  } catch (err) {
    console.error("[Persistence Error] Failed to save chat:", err);
    return null;
  }
}

// Append a tool_result message to an existing chat session
async function persistToolResult(chatSessionId: string, tool: string, data: any) {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });
    if (!session) return;

    const currentMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
    const updatedMessages = [...currentMessages, {
      role: 'tool_result',
      tool,
      data,
      timestamp: new Date().toISOString(),
    }];

    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { messages: updatedMessages }
    });

    console.log(`[Persistence] Saved tool_result (${tool}) in session: ${chatSessionId}`);
  } catch (err) {
    console.error("[Persistence Error] Failed to save tool result:", err);
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

async function getUserId(profile: any) {
  try {
    if (profile?.userId) return profile.userId;

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

const LabBodySchema = z.object({
  labText: z.string().min(10, "Please provide the lab result text"),
  userProfile: UserProfileSchema,
});

const EscalateBodySchema = z.object({
  message: z.string().min(1, "Message is required"),
});


ai.post("/chat", zValidator("json", ChatBodySchema), async (c) => {
  const body = c.req.valid("json");
  const chatSessionId = c.req.header("x-chat-session-id");
  const { message, chatHistory, userProfile, toolResults } = body;

  console.log("[API: /chat] ──────────────────────────────────────");
  console.log("[API: /chat] Message:", message);
  console.log("[API: /chat] ChatHistory entries:", chatHistory?.length ?? 0);
  if (chatHistory?.length) {
    chatHistory.forEach((entry: any, i: number) => {
      console.log(`[API: /chat]   [${i}] user: "${(entry.user || '').slice(0, 50)}" | bot: ${entry.bot ? `"${entry.bot.slice(0, 50)}..."` : 'null'}`);
    });
  }
  console.log("[API: /chat] ToolResults:", toolResults?.length ?? 0);
  console.log("[API: /chat] Session ID from header:", chatSessionId ?? 'none');

  const jwtPayload = c.get("jwtPayload") as any;
  const jwtUserId = jwtPayload?.userId;

  if (!jwtUserId) {
    console.warn("[API: /chat] No JWT userId found, rejecting request.");
    return c.json({ success: false, error: "Authentication required." }, 401);
  }

  // Validate session ownership if session ID is provided
  if (chatSessionId) {
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { userId: true }
    });
    if (!session) {
      console.warn(`[API: /chat] Session ${chatSessionId} not found, rejecting.`);
      return c.json({ success: false, error: "Invalid session." }, 404);
    }
    if (session.userId !== jwtUserId) {
      console.warn(`[API: /chat] Session ${chatSessionId} belongs to ${session.userId}, not ${jwtUserId}. Rejecting.`);
      return c.json({ success: false, error: "Session does not belong to you." }, 403);
    }
  }

  let enrichedProfile = userProfile;
  try {
    const result = await runNimi({
      message,
      chatHistory: chatHistory as CookieTurn[],
      userProfile: enrichedProfile,
      toolResults: toolResults as ToolResult[],
      apiKey: API_KEY,
    });

    console.log("[API: /chat] AI result category:", result.category);
    console.log("[API: /chat] AI response length:", (result.response as string)?.length ?? 0);
    console.log("[API: /chat] ToolRequests:", result.toolRequests?.length ?? 0);
    if (result.toolRequests?.length) {
      result.toolRequests.forEach((tr: any) => console.log(`[API: /chat]   Tool: ${tr.tool} — ${tr.reason}`));
    }
    console.log("[API: /chat] LabInterpretation:", result.labInterpretation ? 'present' : 'none');
    console.log("[API: /chat] RiskScores:", result.riskScores ? 'present' : 'none');
    console.log("[API: /chat] Escalation:", result.escalation?.isEmergency ? 'EMERGENCY' : 'none');

    // Persist chat and get (or create) session ID
    const persistedSessionId = await persistChat({
      userId: jwtUserId,
      message,
      response: result.response as string,
      category: result.category,
      chatSessionId,
      toolRequests: result.toolRequests,
      toolResults: toolResults as any[],
      labInterpretation: result.labInterpretation,
      riskScores: result.riskScores,
      escalation: result.escalation,
    });

    console.log("[API: /chat] Persisted in session:", persistedSessionId ?? 'FAILED');

    if (result.labInterpretation) persistLab(jwtUserId, message, result.labInterpretation);

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

    const response: Record<string, unknown> = {
      success: true,
      response: result.response,
      code: result.code,
      category: result.category,
      chatHistory: result.chatHistory,
      sessionId: persistedSessionId, // Return so frontend can track
    };

    if (result.labInterpretation) response.labInterpretation = result.labInterpretation;
    if (result.riskScores) response.riskScores = result.riskScores;
    if (result.escalation?.isEmergency) response.escalation = result.escalation;
    if (result.toolRequests?.length) {
      response.toolRequests = result.toolRequests;
    }

    console.log("[API: /chat] Response keys:", Object.keys(response).join(', '));
    console.log("[API: /chat] ──────────────────────────────────────");

    return c.json(response);
  } catch (err) {
    console.error("[chat] error:", err);
    return c.json({ success: false, error: "Failed to process your message." }, 500);
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
    const result = await runNimi({
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
// POST /api/ai/escalate
// Dedicated emergency detection check
// ─────────────────────────────────────────────

ai.post("/escalate", zValidator("json", EscalateBodySchema), async (c) => {
  const body = c.req.valid("json");
  console.log("[API: /escalate] Received body:", JSON.stringify(body, null, 2));
  const { message } = body;

  try {
    // 1. Run graph — escalation node always runs first regardless of intent
    const result = await runNimi({
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
