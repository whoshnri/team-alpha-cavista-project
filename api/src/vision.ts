// vision.ts — PreventIQ Multimodal Vision Routes
// Supports: base64 images, video file uploads, multi-pass analysis with backtracking

import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { prisma } from "../prisma/client.js";
import {
  runAnalysisPipeline,
  type MediaInput,
  type AnalysisConfig,
  type AnalysisPipeline,
} from "./lib/vision-engine.js";

const vision = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || "preventiq_super_secret_key_123!";

// Protect all vision routes
vision.use("/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));

// ─────────────────────────────────────────────
// HEALTH PROFILE HELPER
// ─────────────────────────────────────────────

async function getProfileBlock(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { healthProfile: true },
    });
    if (!user) return "No patient profile available.";

    const hp = user.healthProfile;
    let age: number | undefined;
    if (user.dateOfBirth) {
      const birth = new Date(user.dateOfBirth);
      const today = new Date();
      age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    }

    return `
Patient Context:
- Age: ${age ?? "Unknown"}
- Gender: ${user.gender ?? "Unknown"}
- BMI: ${hp?.bmi ? hp.bmi.toFixed(1) : "Unknown"}
- Existing Conditions: ${hp?.existingConditions?.length ? hp.existingConditions.join(", ") : "None reported"}
- Family History: ${hp?.familyHistory?.length ? hp.familyHistory.join(", ") : "None reported"}
- Smoking: ${hp?.smokingStatus ?? "Unknown"}
- Physical Activity: ${hp?.physicalActivityLevel ?? "Unknown"}
- Resting HR: ${hp?.hrBaseline ? Math.round(hp.hrBaseline) + " BPM" : "Unknown"}
- Blood Group: ${hp?.bloodGroup ?? "Unknown"}
    `.trim();
  } catch (err) {
    console.warn("[Vision] Profile fetch failed:", err);
    return "No patient profile available.";
  }
}

// ─────────────────────────────────────────────
// MEDIA PARSING — Handles JSON (base64) + multipart (file upload)
// ─────────────────────────────────────────────

type ParsedMedia = {
  media: MediaInput;
  additionalContext?: string;
  tempFilePath?: string;
};

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function parseMediaFromRequest(c: any): Promise<ParsedMedia> {
  const contentType = c.req.header("content-type") || "";

  // ── MULTIPART FORM DATA (image file uploads) ──
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const additionalContext = (formData.get("context") as string | null) ?? (formData.get("additionalContext") as string | null);

    if (!file) {
      throw {
        errorCode: "E_NO_FILE",
        message: "No image file found in form data. Send a file with field name 'file'.",
        guidance: [
          "Use multipart/form-data with a field named 'file'",
          "Accepted image types: JPEG, PNG, WebP, GIF",
        ],
      };
    }

    const mimeType = file.type;
    const isImage = SUPPORTED_IMAGE_TYPES.includes(mimeType) || mimeType.startsWith("image/");

    if (!isImage) {
      throw {
        errorCode: "E_UNSUPPORTED_FORMAT",
        message: `Unsupported file type: ${mimeType}`,
        guidance: [
          `Received: ${mimeType}`,
          "Accepted images: JPEG, PNG, WebP, GIF",
        ],
      };
    }

    // Image → base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      media: { data: base64, mimeType },
      additionalContext: additionalContext ?? undefined,
    };
  }

  // ── JSON BODY (base64 encoded) ──
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    throw {
      errorCode: "E_INVALID_BODY",
      message: "Could not parse request body.",
      guidance: [
        "Send JSON with 'image' (base64 string)",
        "Include 'mimeType' field (e.g. 'image/jpeg')",
      ],
    };
  }

  if (!body.image) {
    throw {
      errorCode: "E_NO_MEDIA",
      message: "Request must include 'image' field.",
      guidance: [
        "JSON body: { \"image\": \"<base64>\", \"mimeType\": \"image/jpeg\" }",
        "Or use multipart/form-data with a 'file' field for direct photo uploads",
      ],
    };
  }

  // Validate base64 image isn't empty/garbage
  if (typeof body.image !== "string" || body.image.length < 100) {
    throw {
      errorCode: "E_INVALID_IMAGE",
      message: "Image data is too short or not a valid base64 string.",
      guidance: [
        "Ensure base64 string does NOT include the 'data:image/...;base64,' prefix",
        "The raw base64 string should be at least a few KB for a real image",
      ],
    };
  }

  return {
    media: {
      data: body.image,
      mimeType: body.mimeType || "image/jpeg",
    },
    additionalContext: body.additionalContext ?? body.context,
  };
}

// ─────────────────────────────────────────────
// RESPONSE FORMATTER
// ─────────────────────────────────────────────

function formatPipelineResponse(pipeline: AnalysisPipeline, analysisType: string) {
  const base: Record<string, any> = {
    success: pipeline.success,
    type: `${analysisType}_screening`,
    processingTimeMs: pipeline.totalDurationMs,
  };

  if (pipeline.success) {
    base.screening = pipeline.finalResult;
  } else {
    base.error = pipeline.finalResult;
  }

  // Pipeline telemetry for frontend debugging/progress
  base.pipeline = {
    totalPasses: pipeline.passes.length,
    passBreakdown: pipeline.passes.map((p) => ({
      pass: p.passNumber,
      strategy: p.strategy,
      durationMs: p.durationMs,
      success: p.error === null,
    })),
    backtrackEvents: pipeline.backtrackLog.length,
    backtrackLog: pipeline.backtrackLog,
  };

  return base;
}

// ─────────────────────────────────────────────
// SHARED ROUTE HANDLER
// ─────────────────────────────────────────────

async function handleVisionRequest(
  c: any,
  analysisType: "fundus" | "skin" | "general",
  options: { requireQuestion?: boolean; forceType?: boolean } = {}
) {
  const start = Date.now();
  const payload = c.get("jwtPayload") as any;
  const userId = payload?.userId;

  console.log(`[Vision:${analysisType}] Request from user: ${userId}`);

  try {
    const { media, additionalContext } = await parseMediaFromRequest(c);

    // General endpoint requires a question
    if (options.requireQuestion && !additionalContext) {
      return c.json({
        success: false,
        error: {
          error: "MISSING_QUESTION",
          errorCode: "E_NO_QUESTION",
          message: "Please include a question about the image/video.",
          guidance: [
            "Add 'context' or 'additionalContext' field with your question",
            "Example: 'What does this rash look like?'",
            "Example: 'Is this wound healing properly?'",
          ],
          suggestedAction: "ADD_QUESTION",
        },
      }, 400);
    }

    const profileBlock = userId ? await getProfileBlock(userId) : "No profile available.";

    const config: AnalysisConfig = {
      analysisType,
      profileBlock,
      additionalContext,
      forceType: options.forceType ?? (analysisType !== "general"),
    };

    const pipeline = await runAnalysisPipeline(media, config);
    const actualType = pipeline.finalResult?.mediaType ?? analysisType;
    const response = formatPipelineResponse(pipeline, actualType);

    console.log(
      `[Vision:${analysisType}] Done ${Date.now() - start}ms | ` +
      `Success: ${pipeline.success} | Passes: ${pipeline.passes.length} | ` +
      `Backtracks: ${pipeline.backtrackLog.length}`
    );

    // Background persistence
    if (userId && pipeline.success) {
      persistScreening(userId, actualType, pipeline.finalResult).catch((e) =>
        console.error(`[Vision:${analysisType}] Persist error:`, e)
      );
    }

    return c.json(response, pipeline.success ? 200 : 422);

  } catch (err: any) {
    console.error(`[Vision:${analysisType}] Fatal:`, err);

    // Structured error thrown by parseMediaFromRequest
    if (err.errorCode) {
      return c.json({
        success: false,
        error: {
          error: err.errorCode.replace("E_", ""),
          errorCode: err.errorCode,
          message: err.message,
          recaptureGuidance: err.guidance ?? [],
          suggestedAction: "FIX_AND_RETRY",
        },
        pipeline: null,
      }, 400);
    }

    return c.json({
      success: false,
      error: {
        error: "REQUEST_FAILED",
        errorCode: "E_REQUEST_FAILED",
        message: err.message || "An unexpected error occurred",
        recaptureGuidance: ["Check your request format and try again"],
        suggestedAction: "RETRY",
      },
      pipeline: null,
    }, 500);

  } finally {
    // No temp files to clean for photo-only
  }
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// Specific endpoints — skip triage, go straight to analysis type
vision.post("/fundus", (c) => handleVisionRequest(c, "fundus", { forceType: false }));
vision.post("/skin", (c) => handleVisionRequest(c, "skin", { forceType: false }));
vision.post("/general", (c) => handleVisionRequest(c, "general", { requireQuestion: true }));

// Smart auto-routing endpoint — triage decides what analysis to run
vision.post("/analyze", (c) => handleVisionRequest(c, "general", { forceType: false }));

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────

async function persistScreening(userId: string, type: string, screening: any) {
  try {
    const testNameMap: Record<string, string> = {
      fundus: "AI Fundus Screening (Gemini Vision)",
      skin: "AI Skin Screening (Gemini Vision)",
      general: "AI Image Analysis (Gemini Vision)",
    };

    await prisma.labResult.create({
      data: {
        userId,
        testName: testNameMap[type] ?? `AI ${type} Screening`,
        rawText: JSON.stringify(screening),
        plainLanguageSummary: screening.summary ?? screening.answer ?? "",
        overallStatus: mapRiskToStatus(screening.overallRisk ?? screening.overallConcern ?? "LOW"),
        aiRecommendations: screening.recommendations ?? [],
        interpretedAt: new Date(),
      },
    });

    // Flag high-risk fundus results in health profile
    if (type === "fundus" && screening.riskIndicators) {
      const htn = screening.riskIndicators.hypertensiveRetinopathy;
      const dr = screening.riskIndicators.diabeticRetinopathy;

      if (htn?.risk === "HIGH" || dr?.risk === "HIGH") {
        const profile = await prisma.healthProfile.findUnique({ where: { userId } });
        if (profile) {
          const meta = (profile.labMetadata as any) || {};
          meta.lastFundusScreening = {
            date: new Date().toISOString(),
            hypertensiveRetinopathyRisk: htn?.risk,
            diabeticRetinopathyRisk: dr?.risk,
            flagged: true,
          };
          await prisma.healthProfile.update({
            where: { id: profile.id },
            data: { labMetadata: meta },
          });
        }
      }
    }

    console.log(`[Vision:Persist] Saved ${type} screening for user: ${userId}`);
  } catch (err) {
    console.error(`[Vision:Persist] Failed:`, err);
  }
}

function mapRiskToStatus(risk: string): "NORMAL" | "BORDERLINE" | "CONCERNING" {
  switch (risk?.toUpperCase()) {
    case "HIGH": case "SEVERE": return "CONCERNING";
    case "MODERATE": return "BORDERLINE";
    default: return "NORMAL";
  }
}

export { vision as visionRoutes };
