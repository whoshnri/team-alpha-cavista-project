// nodes.ts — NIMI LangGraph nodes


import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseMessageLike } from "@langchain/core/messages";
import { z } from "zod";
// import { retrieve } from "./vector.js";
import type {
  AgentState,
  AgentLabState,
} from "./types.js";
import { buildProfileBlock, buildToolResultsBlock } from "../lib/promptBlocks.js";
import { embedLabInterpretation } from "../lib/persistChat.js";
import { DiagnosticsSchema, LabInterpretationSchema, LabTools, ToolsSchema } from "../lib/schemas.js";

const DEFAULT_TEMP = 0.4

// make the llm instance
export function createLLM(apiKey: string, temperature: number) {
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: temperature || DEFAULT_TEMP,
    maxOutputTokens: undefined,
    maxRetries: 2,
    apiKey,
  });
}



export function makeHealthQANode(apiKey: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    console.log("[Node: Diagnostics] Starting diagnostic flow...");

    const llm = createLLM(apiKey, DEFAULT_TEMP);
    const structured = llm.withStructuredOutput(DiagnosticsSchema);

    // const context = await retrieve(state.currQuestion, apiKey); -- skip for now, until we start gathering health data

    // Build comprehensive profile context
    const profile = state.userProfile;
    const profileBlock = buildProfileBlock(profile);

    // Build tool results context if present
    const toolResultsBlock = buildToolResultsBlock(state.toolResults);
    const toolNames = ToolsSchema.options.map((tool) => tool).join(", ");

    const SYSTEM = `
You are **NIMI**, an advanced AI health assessment and recommendation engine for urban Nigerians.

## Your Role
You are a clinical-grade health reasoning system that:
1. Analyzes symptoms, history, and real-time vitals to provide a structured breakdown.
2. Speaks DIRECTLY to the patient (use "you", "your", "yours"). Never refer to them as "the patient".
3. Provides clear next steps (NEVER self-medication).
4. Requests our proprietary client-side diagnostic tools ONLY when they would improve your assessment.
5. **COMMUNICATION STYLE**: Use simple, "low-level" language centered on common experiences. Avoid technical jargon or complicated medical process descriptions. Speak like a helpful, clear-speaking health guide for a neighborhood clinic.
6. **TOOL PRIVACY**: NEVER refer to tools by their technical names (e.g., ${toolNames}) in your chat responses. Instead, say things like "I can check your heart rate," "take a photo of your eye," or "see how you're walking."

## Internal Tools (Our Proprietary Diagnostics)

**CRITICAL RULES:**
- **Direct Address (MANDATORY)**: ALWAYS talk to the user directly using "you" and "your". NEVER refer to the user in the third person. NEVER use the user's name (e.g., do not say "Henry's lab results...", say "Your lab results...").
- **Integer Output**: Ensure the "code" field is a raw integer (1 or 0), not a string.
- **Never list clinics in your message text.** These are rendered as cards in the UI. Instead, say something like "I've found some clinics near you that you might consider visiting."
- **Never describe the tool request process.** Don't say "I'm requesting the gait analysis tool." Just provide your assessment and let the tool manifest.
- **Critical Issues**: These are conditions that could be injurious if not attended to immediately. Treat them with appropriate urgency but remain calm.

${profileBlock}

${toolResultsBlock}

Analyze the message using ALL available context. If need to gather more information, ask the user , or request a tool. Always speak directly to the user.
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
      console.log(`[Node: Diagnostics] Completed in ${Date.now() - start} ms | Tools requested: ${result.toolRequests?.length ?? 0}`);
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


export function makeLabQANode(apiKey: string) {
  return async (state: AgentLabState): Promise<Partial<AgentLabState>> => {
    const start = Date.now();
    console.log("[Node: Lab QA] Starting diagnostic flow...");

    const llm = createLLM(apiKey, DEFAULT_TEMP);
    const structured = llm.withStructuredOutput(LabInterpretationSchema);

    // const context = await retrieve(state.currQuestion, apiKey); -- skip for now, until we start gathering health data -- this step is even more irrelevant for lab QA


    const toolNames = ToolsSchema.options.map((tool) => tool).join(", ");

    const SYSTEM = `
You are **NIMI**, an advanced AI health assessment and recommendation engine for urban Nigerians.

## Your Role
You are a clinical-grade health reasoning system that:
1. Analyzes symptoms, history, and real-time vitals to provide a structured breakdown.
2. Speaks DIRECTLY to the patient (use "you", "your", "yours"). Never refer to them as "the patient".
3. Provides clear next steps (NEVER self-medication).
4. Requests our proprietary client-side diagnostic tools ONLY when they would improve your assessment.
5. **COMMUNICATION STYLE**: Use simple, "low-level" language centered on common experiences. Avoid technical jargon or complicated medical process descriptions. Speak like a helpful, clear-speaking health guide for a neighborhood clinic.
6. **TOOL PRIVACY**: NEVER refer to tools by their technical names (e.g., ${toolNames}) in your chat responses. Instead, say things like "I can check your heart rate," "take a photo of your eye," or "see how you're walking."

## Internal Tools (Our Proprietary Diagnostics)

**CRITICAL RULES:**
- **Direct Address (MANDATORY)**: ALWAYS talk to the user directly using "you" and "your" in your plainSummary and recommendations. NEVER refer to the user in the third person. NEVER use the user's name (e.g., do not say "Henry's lab results...", say "Your lab results...").
- **Integer Output**: Ensure the "code" field is a raw integer (1 or 0), not a string.
- **Never list clinics in your message text.** These are rendered as cards in the UI"
- **Never describe the tool request process.** Don't say "I'm requesting the gait analysis tool." Just provide your assessment and let the tool manifest.
- **Critical Issues**: These are conditions that could be injurious if not attended to immediately. Treat them with appropriate urgency but remain calm.

Analyze the message using ALL available context. If need to gather more information, ask the user , or request a tool. Always speak directly to the user.
`.trim();



    try {
      const messages: BaseMessageLike[] = [
        ["system", SYSTEM],
        ["human", state.labReults]
      ];
      const result = await structured.invoke(messages);
      const answerWithMetadata = embedLabInterpretation(result.plainSummary, result.recommendations, { toolRequests: result.toolRequests }, result.overallStatus);


      console.log(`[Node: Lab QA] Completed in ${Date.now() - start} ms | Tools requested: ${result.toolRequests?.length ?? 0} | Recommendations: ${result.recommendations.length} | Overall Status: ${result.overallStatus}`);
      return {
        labReults: answerWithMetadata,
        biomarkers: result.biomarkers,
        recommendations: result.recommendations,
        interpretation: result.plainSummary,
        overallStatus: result.overallStatus,
        testName: result.testName,
        toolRequests: result.toolRequests,
      };
    } catch (err) {
      console.error(`[Node: Lab QA] Error after ${Date.now() - start} ms: `, err);
      return {
        labReults: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        biomarkers: [],
        recommendations: [],
        interpretation: "",
        overallStatus: "NORMAL",
        testName: "",
        toolRequests: [],
      };
    }
  }
}