// nodes.ts — PreventIQ LangGraph nodes


import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseMessageLike } from "@langchain/core/messages";
import { z } from "zod";
import { retrieve } from "./vector.js";
import type {
  AgentState,
  LabInterpretation,
  RiskScores,
  EscalationResult,
  MicroLesson,
} from "./types.js";

// ─────────────────────────────────────────────
// LLM FACTORY
// ─────────────────────────────────────────────

export function createLLM(apiKey: string, temperature = 0.3) {
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.3,
    maxOutputTokens: undefined,
    maxRetries: 2,
    apiKey,
  });
}

// ─────────────────────────────────────────────
// NODE 1: ESCALATION DETECTION
// Runs first — gates everything else if emergency
// ─────────────────────────────────────────────

const EscalationSchema = z.object({
  isEmergency: z.boolean().describe("True if the message signals a medical emergency"),
  detectedKeywords: z.array(z.string()).describe("Emergency keywords or phrases found"),
  urgencyMessage: z.string().describe("Calm, empathetic message urging immediate action"),
  nearestClinicPrompt: z.string().describe("Prompt instructing user to find nearest clinic or call emergency services"),
});

export function makeEscalationNode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();

    // Safety check: Skip if specifically routing to a dedicated feature
    if (state._intent && state._intent !== "health_qa") {
      console.log(`[Node: Escalation] Skipping check for intent: ${state._intent}`);
      return {
        escalation: {
          isEmergency: false,
          detectedKeywords: [],
          urgencyMessage: "",
          nearestClinicPrompt: ""
        }
      };
    }

    console.log("[Node: Escalation] Starting detection...");

    const llm = createLLM(apiKey, 0.1);
    const structured = llm.withStructuredOutput(EscalationSchema);

    const prompt = `
You are a medical emergency detection system for PreventIQ, a Nigerian health app.

Analyze the user's message and determine if it signals a medical emergency.

Emergency signals include: chest pain, difficulty breathing, stroke symptoms, severe bleeding, loss of consciousness, suicidal ideation, seizure, severe allergic reaction, or any phrase implying immediate danger to life.

User message: "${state.currQuestion}"

Respond with your structured assessment. Ensure "isEmergency" is a raw boolean, not a string. (e.g. true, not "true").
    `.trim();

    try {
      const result = await structured.invoke([["human", prompt]]);
      console.log(`[Node: Escalation] Completed in ${Date.now() - start}ms`);
      return { escalation: result as EscalationResult };
    } catch (err) {
      console.error(`[Node: Escalation] Failed after ${Date.now() - start}ms:`, err);
      return {
        escalation: {
          isEmergency: false,
          detectedKeywords: [],
          urgencyMessage: "",
          nearestClinicPrompt: "",
        },
      };
    }
  };
}

// ─────────────────────────────────────────────
// NODE 2: DIAGNOSTICS & HEALTH Q&A (RAG + Tool Use)
// ─────────────────────────────────────────────

const DiagnosticsSchema = z.object({
  category: z.string().describe("Question category e.g. Cardiology, Nutrition, Hypertension, Diabetes, Mental Health, General"),
  code: z.number().int().describe("1 if definitive answer from knowledge base, 0 if uncertain"),
  answer: z.string().describe("Comprehensive health answer with breakdown and steps. Use markdown formatting."),
  toolRequests: z.array(z.object({
    tool: z.enum(["heart_rate_scan", "nearby_clinics", "gait_analysis", "capture_fundus", "capture_skin", "capture_general"]).describe("The client-side tool to invoke"),
    reason: z.string().describe("Brief explanation of WHY this tool would help the assessment"),
  })).default([]).describe("Tools the AI wants the frontend to invoke. Empty if no tools needed."),
});

export function makeHealthQANode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    console.log("[Node: Diagnostics] Starting diagnostic flow...");

    const llm = createLLM(apiKey, 0.4);
    const structured = llm.withStructuredOutput(DiagnosticsSchema);

    const context = await retrieve(state.currQuestion, apiKey);

    // Build comprehensive profile context
    const profile = state.userProfile;
    const profileBlock = profile ? `
### Patient Profile
- **Gender**: ${profile.gender ?? "Not specified"}
- **Age**: ${profile.age ?? "Not specified"}
- **Height**: ${profile.heightCm ? profile.heightCm + " cm" : "Not recorded"}
- **Weight**: ${profile.weightKg ? profile.weightKg + " kg" : "Not recorded"}
- **BMI**: ${profile.bmi ? profile.bmi.toFixed(1) : "Not calculated"}
- **Existing Conditions**: ${profile.existingConditions?.length ? profile.existingConditions.join(", ") : "None reported"}
- **Family History**: ${profile.familyHistory?.length ? profile.familyHistory.join(", ") : "None reported"}
- **Smoking**: ${profile.lifestyle?.smokingStatus ?? "Unknown"}
- **Physical Activity**: ${profile.lifestyle?.physicalActivityLevel ?? "Unknown"}
- **Diet**: ${profile.lifestyle?.dietType ?? "Unknown"}
- **Stress Level (1–10)**: ${profile.lifestyle?.stressLevel ?? "Unknown"}
    `.trim() : "No patient profile data available.";

    // Build tool results context if present
    const hasToolResults = state.toolResults && state.toolResults.length > 0;
    const toolResultsBlock = hasToolResults ? `
### Real-Time Vitals (Just Collected)
The patient just completed a heart rate scan. Here is the data:
${JSON.stringify(state.toolResults, null, 2)}

IMPORTANT: Use this real-time vital data to enhance your assessment. Factor the heart rate, signal quality, and confidence into your analysis. Compare against the patient's profile and conditions.
    `.trim() : "";

    const visionBlock = state.visionResult ? `
### Image Analysis Result
- **Status**: ${state.visionResult.success ? "Success" : "Failed/Uncertain"}
- **Quality**: ${state.visionResult.screening?.imageQuality || "Unknown"}
- **Reasoning**: ${state.visionResult.pipeline?.backtrackLog?.[0]?.reasoning || "N/A"}
- **Summary**: "${state.visionResult.screening?.summary || state.visionResult.screening?.answer || JSON.stringify(state.visionResult.screening)}"

IMPORTANT: Incorporate this visual information into your assessment. If the image quality is POOR or there was a "backtrack" (e.g. they provided a face instead of a retina), politely explain that you couldn't get a clear reading and state the reason (e.g. "it looks like a photo of your face instead of your eye"). Suggest how they can take a better photo based on the reasoning provided.
    `.trim() : "";

    const SYSTEM = `
You are **PreventIQ Diagnostics**, an advanced AI health assessment and recommendation engine for urban Nigerians.

## Your Role
You are a clinical-grade health reasoning system that:
1. Analyzes symptoms, history, and real-time vitals to provide a structured breakdown.
2. Speaks DIRECTLY to the patient (use "you", "your", "yours"). Never refer to them as "the patient".
3. Provides clear next steps (NEVER self-medication).
4. Requests our proprietary client-side diagnostic tools ONLY when they would improve your assessment.

## Internal Tools (Our Proprietary Diagnostics)
1. "heart_rate_scan" — Request this for cardiovascular concerns (chest pain, palpitations, dizziness).
2. "gait_analysis" — Request this for walking difficulties or balance issues where motion data adds value.
3. "nearby_clinics" — Request this ONLY when you recommend professional consultation AND the user shows an intent to seek physical help.
4. "capture_fundus" — Request this when the user has vision issues AND hypertension or diabetes. This takes a photo of the back of the eye.
5. "capture_skin" — Request this for rashes, bumps, or skin changes.
6. "capture_general" — Request this to see anything else (wounds, paper lab results).

**CRITICAL RULES:**
- **Integer Output**: Ensure the "code" field is a raw integer (1 or 0), not a string.
- **Never list clinics in your message text.** These are rendered as cards in the UI. Instead, say something like "I've found some clinics near you that you might consider visiting."
- **Never describe the tool request process.** Don't say "I'm requesting the gait analysis tool." Just provide your assessment and let the tool manifest.
- **Direct Address**: Always talk to the user directly: "You should consider..." rather than "The patient should consider...".
- **Critical Issues**: These are conditions that could be injurious if not attended to immediately. Treat them with appropriate urgency but remain calm.

## Cross-Tool Verification & Recalibration
1. **Gait Inaccuracies**: If 'gait_analysis' returns high fatigue (>70) or low regularity (<50), or if the mechanical movement logs seem inconsistent with the reported symptoms, you MUST request a 'heart_rate_scan' ('VitalPulse').
2. **Gait Logs Missing**: If you receive a message with '[GAIT_DATA]' but it says "No recent gait activity data found", DO NOT request the 'gait_analysis' tool again. This means the user has already been prompted and either opened the app (but logs hasn't synced yet) or skipped the check. Proceed with the assessment based on their reported symptoms and ask them to ensure the PWA is logging if they want a recheck.
3. **Explicit Verification**: If the user questions the accuracy of their gait reading or if you detect a mismatch (e.g., you feel fine but logs show high strain), use the 'heart_rate_scan' as the "gold standard" to recalibrate your assessment.
4. **Reasoning**: Explain that you are requesting a heart rate check to clarify the movement-based findings and ensure cardiovascular stability.

${profileBlock}

${toolResultsBlock}

${visionBlock}

### Health Knowledge Base Context
${context}

Analyze the message using ALL available context. If you see inaccuracies or need a more stable baseline, request a 'heart_rate_scan' for recalibration. Always speak directly to the user.
`.trim();

    const messages: BaseMessageLike[] = [["human", SYSTEM]];

    for (const turn of state.cookie) {
      messages.push(["human", turn.user]);
      if (turn.bot) messages.push(["ai", turn.bot]);
    }

    try {
      const result = await structured.invoke(messages);
      const updatedCookie = [...state.cookie];
      if (updatedCookie.length > 0) {
        updatedCookie[updatedCookie.length - 1] = {
          ...updatedCookie[updatedCookie.length - 1],
          bot: result.answer,
        };
      }
      console.log(`[Node: Diagnostics]Completed in ${Date.now() - start} ms | Tools requested: ${result.toolRequests?.length ?? 0} `);
      return {
        currAnswer: result.answer,
        code: result.code,
        category: result.category,
        cookie: updatedCookie,
        messages: [],
        toolRequests: result.toolRequests as AgentState["toolRequests"],
      };
    } catch (err) {
      console.error(`[Node: Diagnostics] Error after ${Date.now() - start} ms: `, err);
      return {
        currAnswer: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        code: 0,
        category: "General",
        toolRequests: [],
      };
    }
  };
}


// ─────────────────────────────────────────────
// NODE 3: LAB RESULT INTERPRETER
// ─────────────────────────────────────────────

const BiomarkerSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  referenceMin: z.number().optional(),
  referenceMax: z.number().optional(),
  status: z.enum(["NORMAL", "BORDERLINE", "CONCERNING"]),
  flagNote: z.string().describe("Plain-language explanation of what this value means"),
});

const LabSchema = z.object({
  testName: z.string().describe("Name of the lab test e.g. Complete Blood Count"),
  overallStatus: z.enum(["NORMAL", "BORDERLINE", "CONCERNING"]),
  biomarkers: z.array(BiomarkerSchema),
  plainSummary: z.string().describe("2–3 sentence plain-language summary a non-doctor can understand"),
  recommendations: z.array(z.string()).describe("3–5 actionable next steps for the patient"),
});

export function makeLabInterpreterNode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    console.log("[Node: Lab Interpreter] Starting interpretation...");

    const llm = createLLM(apiKey, 0.2);
    console.log("[Node: Lab Interpreter] Using model: " + llm.model);
    const structured = llm.withStructuredOutput(LabSchema);

    const prompt = `
You are a medical lab result interpreter for PreventIQ, a Nigerian health app.
Your job is to explain lab results in simple, friendly language that any Nigerian patient can understand — no medical degree required.

Use a traffic - light system:
    - NORMAL: values within reference range ✅
    - BORDERLINE: slightly outside range, worth monitoring ⚠️
    - CONCERNING: significantly outside range, needs medical attention 🔴

Lab result text from user:
    """
${state.currQuestion}
    """

Parse and interpret every biomarker you can identify. If reference ranges are not provided, use standard clinical reference ranges.
Provide a kind, non-alarming tone while being accurate.
Ensure all numerical values (value, referenceMin, referenceMax) are raw numbers, not strings.
    `.trim();

    try {
      const result = await structured.invoke([["human", prompt]]);
      const interpretation = result as LabInterpretation;
      console.log(`[Node: Lab Interpreter]Completed in ${Date.now() - start} ms`);
      return {
        labInterpretation: interpretation,
        currAnswer: interpretation.plainSummary,
        category: "Lab Result",
        code: 1,
      };
    } catch (err) {
      console.error(`[Node: Lab Interpreter] Error after ${Date.now() - start} ms: `, err);
      return {
        currAnswer: "I had trouble interpreting that lab result. Please check the format and try again.",
        category: "Lab Result",
        code: 0,
      };
    }
  };
}

// ─────────────────────────────────────────────
// NODE 4: RISK SCORE ASSESSMENT
// ─────────────────────────────────────────────

const RiskSchema = z.object({
  overall: z.number().min(0).max(1).describe("Overall risk score 0.0–1.0"),
  overallLevel: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]),
  diabetes: z.number().min(0).max(1),
  hypertension: z.number().min(0).max(1),
  cardiovascular: z.number().min(0).max(1),
  topFactors: z.array(z.string()).describe("Top 3–5 risk factors driving the score"),
  recommendations: z.array(z.string()).describe("5 prioritized lifestyle or clinical recommendations"),
});

export function makeRiskAssessmentNode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    console.log("[Node: Risk Assessment] Starting calculation...");

    const llm = createLLM(apiKey, 0.2);
    const structured = llm.withStructuredOutput(RiskSchema);

    const profile = state.userProfile;
    const profileText = profile
      ? `
    Age: ${profile.age ?? "Unknown"}
    Gender: ${profile.gender ?? "Unknown"}
Existing conditions: ${profile.existingConditions?.join(", ") || "None reported"}
Family history: ${profile.familyHistory?.join(", ") || "None reported"}
    Smoking: ${profile.lifestyle?.smokingStatus ?? "Unknown"}
Physical activity: ${profile.lifestyle?.physicalActivityLevel ?? "Unknown"}
    Diet: ${profile.lifestyle?.dietType ?? "Unknown"}
Stress level(1–10): ${profile.lifestyle?.stressLevel ?? "Unknown"}
    `.trim()
      : "No profile data provided.";

    const prompt = `
You are a preventive health risk analyst for PreventIQ, focused on Non - Communicable Diseases(NCDs) prevalent in urban Nigeria.

Based on the patient profile below, calculate risk scores for diabetes, hypertension, and cardiovascular disease.
Scores must be between 0.0(no risk) and 1.0(maximum risk).
Be evidence - based and reference standard NCD risk factors.

Patient Profile:
${profileText}

Additional context from patient message:
    "${state.currQuestion}"

Provide scores, top risk factors, and specific actionable recommendations tailored to a Nigerian urban lifestyle.
Ensure all scores (overall, diabetes, hypertension, cardiovascular) are raw numbers between 0.0 and 1.0, not strings.
    `.trim();

    try {
      const result = await structured.invoke([["human", prompt]]);
      const riskScores = result as RiskScores;
      console.log(`[Node: Risk Assessment]Completed in ${Date.now() - start} ms`);
      return {
        riskScores,
        currAnswer: `Your overall health risk level is ** ${riskScores.overallLevel}** (score: ${(riskScores.overall * 100).toFixed(0)}%). Your top risk factors are: ${riskScores.topFactors.join(", ")}.`,
        category: "Risk Assessment",
        code: 1,
      };
    } catch (err) {
      console.error(`[Node: Risk Assessment] Error after ${Date.now() - start} ms: `, err);
      return {
        currAnswer: "I was unable to complete your risk assessment. Please ensure your health profile is filled in.",
        category: "Risk Assessment",
        code: 0,
      };
    }
  };
}

// ─────────────────────────────────────────────
// NODE 5: MICRO-LESSON GENERATOR
// ─────────────────────────────────────────────

const MicroLessonSchema = z.object({
  title: z.string().describe("Catchy, clear lesson title"),
  content: z.string().describe("The lesson body — under 60 seconds to read, plain language"),
  category: z.string().describe("e.g. Nutrition, Exercise, Stress, Sleep, Medication"),
  readTimeSecs: z.number().int().describe("Estimated read time in seconds"),
  sourceNote: z.string().describe("Brief attribution e.g. 'Based on WHO NCD guidelines 2023'"),
});

export function makeMicroLessonNode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    console.log("[Node: Micro Lesson] Starting generation...");

    const llm = createLLM(apiKey, 0.6);
    const structured = llm.withStructuredOutput(MicroLessonSchema);

    const profile = state.userProfile;
    const conditions = profile?.existingConditions?.join(", ") || "general health";
    const topic = state.currQuestion || conditions;

    const context = await retrieve(`health tips ${topic} Nigeria prevention`, apiKey);

    const prompt = `
You are a health educator for PreventIQ, generating personalized micro - lessons for urban Nigerians.

Create a micro - lesson on: "${topic}"
Patient conditions / focus areas: ${conditions}

    Rules:
    - Maximum 60 seconds to read(around 120–150 words for the content)
      - Use simple, friendly, everyday language
        - Include one practical tip the user can apply TODAY
          - Be culturally relevant to a Nigerian context(mention local foods, habits, or scenarios where appropriate)
            - Base content on WHO guidelines or Nigerian health authority recommendations

Reference knowledge:
${context}

Ensure "readTimeSecs" is a raw integer, not a string.
    `.trim();

    try {
      const result = await structured.invoke([["human", prompt]]);
      const lesson = result as MicroLesson;
      console.log(`[Node: Micro Lesson]Completed in ${Date.now() - start} ms`);
      return {
        microLesson: lesson,
        currAnswer: `📚 ** ${lesson.title}**\n\n${lesson.content} \n\n_${lesson.sourceNote} _`,
        category: "Micro-Lesson",
        code: 1,
      };
    } catch (err) {
      console.error(`[Node: Micro Lesson] Error after ${Date.now() - start} ms: `, err);
      return {
        currAnswer: "I couldn't generate a lesson right now. Please try again.",
        category: "Micro-Lesson",
        code: 0,
      };
    }
  };
}
