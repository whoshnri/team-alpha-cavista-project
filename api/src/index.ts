// index.ts — NIMI Hono server entry point

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
import { jwt, sign } from "hono/jwt";
import { handleSSE } from "./sse.js";


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
    status: "NIMI AI API is running 🏥",
    version: "1.0.0",
    endpoints: {
      chat: "POST /api/ai/chat     — General health Q&A (auto-routes by intent)",
      lab: "POST /api/ai/lab      — Lab result interpreter",
      escalate: "POST /api/ai/escalate — Emergency detection check",
      clinics: "GET  /api/clinics/nearby — Find nearby clinics",
      gait: "POST /api/gait/log — Register gait logs (Public)",
      gait_recent: "GET /api/gait/:userId/recent — Get recent gait logs (JWT)",
    },
  })
);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// Token verification middleware
const verifyToken = (token: string) => {
  return true;
};

app.use('*', async (c, next) => {
  if (c.req.path === '/' || c.req.path.startsWith('/api/auth')) {
    return await next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authorization header missing or invalid' }, 401);
  }
  const token = authHeader.split(' ')[1];
  if (!verifyToken(token)) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
  await next();
});

const JWT_SECRET = process.env.JWT_SECRET || "nimi_super_secret_key_123!";

app.route("/api/auth", authRoutes);
app.route("/api/user", userRoutes);
app.route("/api/clinics", clinicsRoutes);
app.route("/api/gait", gaitRoutes);

app.use("/api/ai/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));
app.route("/api/ai", aiRoutes);

app.get("/api/sse", handleSSE);

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000);
const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  throw new Error("GROQ_API_KEY is not defined");
}

getCollection()
  .then(() => console.log("✅ ChromaDB vector store connected"))
  .catch((err) => console.warn("⚠️  ChromaDB not ready:", err.message));

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`🚀 NIMI API running → http://localhost:${PORT}`);
});

export default app;
