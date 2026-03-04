// routes/ai.ts — NIMI Hono AI endpoints

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
// import { runChat } from "./ai/graph.js"
import type { CookieTurn, ToolResult } from "./ai/types.js";
import { prisma } from "../prisma/client.js"
import { recalibrateHealthProfile } from "./lib/recalibrate.js";
import { sseManager } from "./sse.js";
import { validateSession } from "./lib/sessionValidation.js";
import { ChatBodySchema, LabBodySchema } from "./lib/schemas.js";
import { persistChat } from "./lib/persistChat.js";
import { persistLab } from "./lib/persistLab.js";
import { runChat, runLab } from "./ai/graph.js";

const ai = new Hono();
const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  throw new Error("GROQ_API_KEY is not defined");
}

// // ─────────────────────────────────────────────
// // DATA PERSISTENCE HELPERS
// // ─────────────────────────────────────────────

// // Embeds metadata into content using the <!--METADATA:{}-!> convention

// // Append a tool_result message to an existing chat session
// async function persistToolResult(chatSessionId: string, tool: string, data: any) {
//   try {
//     const session = await prisma.chatSession.findUnique({
//       where: { id: chatSessionId },
//     });
//     if (!session) return;

//     const currentMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
//     const updatedMessages = [...currentMessages, {
//       role: 'tool_result',
//       tool,
//       data,
//       timestamp: new Date().toISOString(),
//     }];

//     await prisma.chatSession.update({
//       where: { id: chatSessionId },
//       data: { messages: updatedMessages }
//     });

//     console.log(`[Persistence] Saved tool_result (${tool}) in session: ${chatSessionId}`);
//   } catch (err) {
//     console.error("[Persistence Error] Failed to save tool result:", err);
//   }
// }

ai.post("/chat", zValidator("json", ChatBodySchema), async (c) => {
  const body = c.req.valid("json");
  const chatSessionId = c.req.header("x-chat-session-id");
  const { message, chatHistory, userProfile, toolResults } = body;

  console.log("[API: /chat] ──────────────────────────────────────");
  console.log("[API: /chat] Message:", message);

  const jwtPayload = c.get("jwtPayload") as any;
  const jwtUserId = jwtPayload?.userId;

  if (!jwtUserId) {
    console.warn("[API: /chat] No JWT userId found, rejecting request.");
    return c.json({ success: false, error: "Authentication required." }, 401);
  }

  if (chatSessionId) {
    validateSession({ chatSessionId, jwtUserId, c })
  }

  let enrichedProfile = userProfile;
  try {
    const result = await runChat({
      message,
      chatHistory: chatHistory as CookieTurn[],
      userProfile: enrichedProfile,
      toolResults: toolResults as ToolResult[],
      apiKey: API_KEY,
    });

    const persistedSessionId = await persistChat({
      userId: jwtUserId,
      message,
      response: result.response as string,
      category: result.category,
      chatSessionId,
      toolRequests: result.toolRequests,
      toolResults: toolResults as any[],
      labInterpretation: result.labInterpretation,
    });

    console.log("[API: /chat] Persisted in session:", persistedSessionId ?? 'FAILED');

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
      sessionId: persistedSessionId,
    };

    if (result.labInterpretation) response.labInterpretation = result.labInterpretation;
    if (result.toolRequests?.length) {
      response.toolRequests = result.toolRequests;
    }

    return c.json(response);
  } catch (err) {
    console.error("[chat] error:", err);
    return c.json({ success: false, error: "Failed to process your message." }, 500);
  }
});

ai.post('/lab', zValidator("json", LabBodySchema), async (c) => {
  const body = c.req.valid("json");
  const chatSessionId = c.req.header("x-chat-session-id");
  const { labText } = body;

  if (!chatSessionId) {
    return c.json({ success: false, error: "Chat session ID is required." }, 400);
  }

  console.log("[API: /lab] ──────────────────────────────────────");

  const jwtPayload = c.get("jwtPayload") as any;
  const jwtUserId = jwtPayload?.userId;

  if (!jwtUserId) {
    console.warn("[API: /lab] No JWT userId found, rejecting request.");
    return c.json({ success: false, error: "Authentication required." }, 401);
  }

  if (chatSessionId) {
    validateSession({ chatSessionId, jwtUserId, c })
  }

  try {
    const result = await runLab({
      message: labText,
      chatSessionId,
      apiKey: API_KEY,
    });

    const persistedSessionId = await persistLab(jwtUserId, result, chatSessionId);

    console.log("[API: /lab] Persisted in session:", persistedSessionId ?? 'FAILED');

    const response: Record<string, unknown> = {
      success: true,
      result: result.labReults,
      sessionId: persistedSessionId,
    };

    return c.json({ response }, 200);
  } catch (err) {
    console.error("[lab] error:", err);
    return c.json({ success: false, error: "Failed to process your message." }, 500);
  }
});


export { ai as aiRoutes };