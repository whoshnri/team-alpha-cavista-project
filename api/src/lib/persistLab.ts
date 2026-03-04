import { prisma } from "../../prisma/client.js";
import type { AgentLabState, BiomarkerStatus, ParsedBiomarker } from "../ai/types.js";
import { recalibrateHealthProfile } from "./recalibrate.js";

export async function persistLab(userId: string, result: AgentLabState, chatSessionId: string) {
  try {
    if (!result) return;

    await prisma.$transaction(async (tx) => {
      await tx.labResult.create({
        data: {
          userId,
          testName: result.testName || "Unknown Lab Test",
          plainLanguageSummary: result.interpretation,
          overallStatus: result.overallStatus as BiomarkerStatus,
          aiRecommendations: result.recommendations,
          interpretedAt: new Date(),
          biomarkers: {
            create: result.biomarkers.map((bio: ParsedBiomarker) => ({
              name: bio.name,
              value: bio.value,
              unit: bio.unit,
              referenceMin: bio.referenceMin,
              referenceMax: bio.referenceMax,
              status: bio.status,
              flagNote: bio.flagNote
            }))
          }
        }
      });

      // Get existing session to append message
      const session = await tx.chatSession.findUnique({
        where: { id: chatSessionId }
      });

      const newAssistantMsg = {
        role: 'assistant',
        content: result.labReults,
        timestamp: new Date().toISOString(),
      };

      if (session) {
        const currentMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
        await tx.chatSession.update({
          where: { id: chatSessionId },
          data: {
            messages: [...currentMessages, newAssistantMsg]
          }
        });
      } else {
        await tx.chatSession.create({
          data: {
            id: chatSessionId,
            userId,
            channel: "PUSH",
            messages: [newAssistantMsg]
          }
        });
      }
    })
    console.log(`[Persistence] Saved lab result for user: ${userId}`);

    // ─── RECALIBRATE HEALTH PROFILE ─────────────
    if (result.biomarkers?.length > 0) {
      recalibrateHealthProfile(prisma, userId, {
        biomarkers: result.biomarkers.map((bio: any) => ({
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