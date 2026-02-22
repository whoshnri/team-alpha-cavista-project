// index.ts — PreventIQ Hono server entry point (with Multimodal Vision)

import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { getCollection } from "./ai/vector.js";
import { aiRoutes } from "./ai.js";
import { authRoutes } from "./auth.js";
import { userRoutes } from "./user.js";
import { clinicsRoutes } from "./clinics.js";
import { gaitRoutes } from "./gait.js";
import { visionRoutes } from "./vision.js";
import { jwt } from "hono/jwt";

const app = new Hono();

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

app.use("*", logger());
app.use("*", cors({ origin: "*" }));

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get("/", (c) =>
  c.json({
    status: "PreventIQ AI API is running 🏥",
    version: "2.0.0",
    capabilities: {
      ai_chat: "LangGraph pipeline — intent routing, risk assessment, emergency detection",
      lab_interpretation: "Lab result parsing with plain-language summaries",
      gait_analysis: "Accelerometer-based gait pattern logging",
      clinic_finder: "Nearby clinic geosearch",
      computer_vision: "Gemini 2.5 Flash multimodal — image + video analysis with backtracking",
    },
    endpoints: {
      auth: "POST /api/auth/signup | /api/auth/login",
      chat: "POST /api/ai/chat",
      lab: "POST /api/ai/lab",
      escalate: "POST /api/ai/escalate",
      clinics: "GET  /api/clinics/nearby",
      gait_log: "POST /api/gait/log",
      gait_recent: "GET  /api/gait/:userId/recent",
      vision_fundus: "POST /api/vision/fundus    — Retinal screening (image/video)",
      vision_skin: "POST /api/vision/skin      — Skin condition screening (image/video)",
      vision_general: "POST /api/vision/general   — Medical image/video Q&A",
      vision_auto: "POST /api/vision/analyze   — Smart auto-routing (triage → analysis)",
    },
  })
);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || "preventiq_super_secret_key_123!";

// Public
app.route("/api/auth", authRoutes);

// Protected
app.route("/api/user", userRoutes);
app.route("/api/clinics", clinicsRoutes);
app.route("/api/gait", gaitRoutes);

// AI (JWT protected)
app.use("/api/ai/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));
app.route("/api/ai", aiRoutes);

// Vision — multimodal (JWT protected inside routes)
app.route("/api/vision", visionRoutes);

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000);

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not defined");
}

const geminiReady = !!process.env.GEMINI_API_KEY;

getCollection()
  .then(() => console.log("✅ ChromaDB vector store connected"))
  .catch((err) => console.warn("⚠️  ChromaDB not ready:", err.message));

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`\n🚀 PreventIQ API v2.0.0 → http://localhost:${PORT}`);
  console.log(`🧠 AI Chat:      ENABLED (Groq/LangGraph)`);
  console.log(`🔬 Vision:       ${geminiReady ? "ENABLED (Gemini 2.5 Flash)" : "DISABLED — set GEMINI_API_KEY"}`);
  console.log(`📹 Video input:  ${geminiReady ? "ENABLED (up to 100MB)" : "DISABLED"}`);
  console.log(`🔄 Backtracking: ${geminiReady ? "ENABLED (multi-pass w/ validation)" : "DISABLED"}\n`);
});

export default app;
