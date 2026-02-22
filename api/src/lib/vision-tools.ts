// vision-tools.ts — LangGraph Tool Definitions for Real-Time Vision Capture
// These tools are called BY the AI during chat when it needs to see something.
// The frontend intercepts tool calls and handles the actual capture flow.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ─────────────────────────────────────────────
// TOOL: capture_fundus
// AI calls this when it suspects eye-related issues
// ─────────────────────────────────────────────

export const captureFundusTool = tool(
  async (input) => {
    // This doesn't execute server-side — it returns a capture REQUEST
    // that the frontend intercepts via the streaming response
    return JSON.stringify({
      __capture_request: true,
      captureType: "fundus",
      reason: input.reason,
      urgency: input.urgency,
      guidance: {
        title: "Let's check your eyes",
        instructions: [
          "Position your phone camera close to your eye",
          "If you have a fundus lens attachment, attach it now",
          "Keep your eye open and look straight ahead",
          "Hold steady — the AI will find the best frame",
        ],
        captureMode: input.preferVideo ? "video" : "photo",
        duration: input.preferVideo ? 10 : undefined,
        overlay: "fundus_guide", // Frontend renders a circular guide overlay
      },
      analysisConfig: {
        endpoint: "/api/vision/fundus",
        additionalContext: input.clinicalContext,
      },
    });
  },
  {
    name: "capture_fundus",
    description: `Trigger real-time fundus (retinal) image or video capture from the user's camera.
Call this when:
- User reports vision problems (blurry vision, floaters, vision loss, eye pain)
- User has uncontrolled hypertension and you want to check for retinal damage
- User has diabetes and hasn't had a recent eye screening
- User asks about eye health or mentions eye-related symptoms
- Risk assessment suggests elevated cardiovascular or diabetic eye risk

This opens the device camera with a guided overlay for retinal photography.`,
    schema: z.object({
      reason: z.string().describe("Why you're requesting this capture — shown to the user"),
      clinicalContext: z.string().describe("Clinical context to pass to the vision AI (symptoms, relevant history)"),
      urgency: z.enum(["routine", "recommended", "important"]).describe("How urgently this screening is needed"),
      preferVideo: z.boolean().default(false).describe("Whether to prefer video capture (better for finding clear frames)"),
    }),
  }
);

// ─────────────────────────────────────────────
// TOOL: capture_skin
// AI calls this for dermatological assessment
// ─────────────────────────────────────────────

export const captureSkinTool = tool(
  async (input) => {
    return JSON.stringify({
      __capture_request: true,
      captureType: "skin",
      reason: input.reason,
      urgency: input.urgency,
      guidance: {
        title: "Let's take a look",
        instructions: [
          `Point your camera at the ${input.bodyArea || "affected area"}`,
          "Get about 15cm (6 inches) away",
          "Make sure there's good lighting — natural light is best",
          "Include some surrounding normal skin for comparison",
          input.preferVideo
            ? "Slowly move around the area so I can see it from different angles"
            : "Hold steady and tap to capture",
        ],
        captureMode: input.preferVideo ? "video" : "photo",
        duration: input.preferVideo ? 15 : undefined,
        overlay: "skin_guide", // Frontend renders a square focus guide
      },
      analysisConfig: {
        endpoint: "/api/vision/skin",
        additionalContext: input.clinicalContext,
      },
    });
  },
  {
    name: "capture_skin",
    description: `Trigger real-time skin photo or video capture from the user's camera.
Call this when:
- User describes a rash, lesion, bump, discoloration, or skin change
- User asks "what is this on my skin?"
- User mentions itching, swelling, or skin pain in a specific area
- User has diabetes or immunosuppression and reports skin issues
- User wants to track a skin condition over time

This opens the device camera with focus guidance for dermatological photography.`,
    schema: z.object({
      reason: z.string().describe("Why you're requesting this — shown to the user"),
      clinicalContext: z.string().describe("Clinical context (symptoms, duration, location, history)"),
      bodyArea: z.string().optional().describe("Which body area to photograph (e.g., 'left forearm', 'back of neck')"),
      urgency: z.enum(["routine", "recommended", "important"]).describe("Screening urgency"),
      preferVideo: z.boolean().default(false).describe("Prefer video for multiple angles"),
    }),
  }
);

// ─────────────────────────────────────────────
// TOOL: capture_general
// AI calls this for any other visual assessment
// ─────────────────────────────────────────────

export const captureGeneralTool = tool(
  async (input) => {
    return JSON.stringify({
      __capture_request: true,
      captureType: "general",
      reason: input.reason,
      urgency: input.urgency,
      guidance: {
        title: input.captureTitle || "Show me what you're seeing",
        instructions: input.instructions || [
          "Point your camera at what you'd like me to look at",
          "Make sure it's well-lit and in focus",
          "Hold steady",
        ],
        captureMode: input.preferVideo ? "video" : "photo",
        duration: input.preferVideo ? 10 : undefined,
        overlay: "general_guide",
      },
      analysisConfig: {
        endpoint: "/api/vision/general",
        additionalContext: input.question,
      },
    });
  },
  {
    name: "capture_general",
    description: `Trigger general-purpose camera capture for any health-related visual assessment.
Call this when:
- User wants to show you a wound or injury
- User wants you to read a lab report or prescription
- User has a health-related question that needs visual context
- User mentions something visible that could help with assessment
- None of the specific capture tools (fundus, skin) apply

This opens the camera with a generic capture interface.`,
    schema: z.object({
      reason: z.string().describe("Why you need to see this"),
      question: z.string().describe("The specific question to answer about the visual"),
      captureTitle: z.string().optional().describe("Custom title for the capture UI"),
      instructions: z.array(z.string()).optional().describe("Custom capture instructions"),
      urgency: z.enum(["routine", "recommended", "important"]).default("routine"),
      preferVideo: z.boolean().default(false),
    }),
  }
);

// ─────────────────────────────────────────────
// ALL VISION TOOLS — export as array for LangGraph
// ─────────────────────────────────────────────

export const visionTools = [
  captureFundusTool,
  captureSkinTool,
  captureGeneralTool,
];

// Tool name → type mapping for the frontend
export const VISION_TOOL_NAMES = {
  capture_fundus: "fundus",
  capture_skin: "skin",
  capture_general: "general",
} as const;
