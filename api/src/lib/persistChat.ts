import { prisma } from "../../prisma/client.js";
import type { BiomarkerStatus } from "../ai/types.js";

export function embedMetadata(text: string, metadata: Record<string, any> | null): string {
  if (!metadata) return text;
  const filtered = Object.fromEntries(Object.entries(metadata).filter(([_, v]) => v != null));
  if (Object.keys(filtered).length === 0) return text;
  return `${text}\n<!--METADATA:${JSON.stringify(filtered)}-!>`;
}

export function embedLabInterpretation(plainSummary: string, recommendations: string[], toolRequests: Record<string, any>, overallStatus: BiomarkerStatus): string {
  const filtered = Object.fromEntries(Object.entries(toolRequests).filter(([_, v]) => v != null));
  if (Object.keys(filtered).length === 0 && !recommendations?.length && !overallStatus) return plainSummary;

  let result = plainSummary;
  if (Object.keys(filtered).length > 0) {
    result += `\n<!--METADATA:${JSON.stringify(filtered)}-!>`;
  }
  if (recommendations && recommendations.length > 0) {
    result += `\n<!--RECOMMENDATIONS:${JSON.stringify(recommendations)}-!>`;
  }
  if (overallStatus) {
    result += `\n<!--OVERALL_STATUS:${JSON.stringify(overallStatus)}-!>`;
  }
  return result;
}

export type PersistChatOptions = {
  userId: string;
  message: string;
  response: string;
  category: string;
  chatSessionId?: string;
  toolRequests?: any[];
  toolResults?: any[];
  labInterpretation?: any;
  riskScores?: any;
  escalation?: any;
};

export async function persistChat(opts: PersistChatOptions) {
  const {
    userId, message, response, category, chatSessionId,
    toolRequests, toolResults, labInterpretation, riskScores, escalation
  } = opts;

  try {
    let session = null;
    if (chatSessionId) {
      session = await prisma.chatSession.findUnique({
        where: { id: chatSessionId },
      });
    }

    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId, channel: "PUSH" }
      });
    }

    const assistantMetadata: Record<string, any> = {};
    if (toolRequests?.length) assistantMetadata.toolRequests = toolRequests;
    if (labInterpretation) assistantMetadata.lab = labInterpretation;
    if (riskScores) assistantMetadata.risk = riskScores;
    if (escalation?.isEmergency) assistantMetadata.escalation = escalation;

    const assistantContent = embedMetadata(response, assistantMetadata);

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
