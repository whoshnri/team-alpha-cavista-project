// vision-graph-integration.ts
// Shows how to integrate vision tools into your existing LangGraph AI pipeline.
// This is NOT a standalone file — it shows the patches to apply to your existing graph.

// ─────────────────────────────────────────────────────────────
// STEP 1: Import vision tools in your graph definition file
// (wherever you define your LangGraph StateGraph)
// ─────────────────────────────────────────────────────────────

import { visionTools } from "./lib/vision-tools.js";

// Add vision tools to your existing tools array:
// BEFORE:
//   const tools = [labInterpretTool, riskAssessTool, clinicFinderTool, ...];
// AFTER:
const tools = [
  labInterpretTool,
  riskAssessTool,
  clinicFinderTool,
  // ... your existing tools
  ...visionTools,  // ← ADD THIS
];

// ─────────────────────────────────────────────────────────────
// STEP 2: Update your system prompt to teach the AI when to
// use vision tools. Add this to your existing system prompt:
// ─────────────────────────────────────────────────────────────

const VISION_SYSTEM_PROMPT_ADDITION = `
## Vision & Camera Tools

You have access to the user's device camera through capture tools. Use them proactively when visual assessment would help.

WHEN TO TRIGGER CAMERA:
- User describes ANY visible symptom → offer to look at it
- User mentions eye problems + has hypertension/diabetes → suggest fundus screening
- User says "what is this" about something on their body → capture_skin
- User mentions a wound, burn, or injury → capture_general
- User wants you to read their lab results from paper → capture_general

HOW TO USE:
1. Explain WHY you want to look ("Based on what you're describing, it would help if I could see it")
2. Call the appropriate capture tool
3. The user's camera will open with guided instructions
4. Once they capture, the analysis flows back to you automatically
5. Interpret the results in context of their full health profile

IMPORTANT:
- Always ask permission before opening the camera: "Would you like me to take a look?"
- If the user says no, respect that and continue with verbal assessment
- After receiving results, explain findings in simple, reassuring language
- Always recommend professional follow-up for MODERATE+ findings
- Never diagnose — frame everything as screening observations

EXAMPLES OF NATURAL TRIGGERS:
- "I've been having blurry vision lately" → "I'd like to do a quick eye screening if you're okay with that. Do you have your phone camera handy?" → capture_fundus
- "There's this weird rash on my arm" → "Can you show me? I'll open your camera with some guidance" → capture_skin
- "I got my blood test results on paper" → "Point your camera at the results and I'll read them for you" → capture_general
`;

// ─────────────────────────────────────────────────────────────
// STEP 3: Handle the capture flow in your streaming endpoint
//
// The key insight: vision tool calls return a JSON with
// __capture_request: true. Your streaming handler needs to
// detect this and emit it as a special event type so the
// frontend knows to open the camera instead of showing text.
// ─────────────────────────────────────────────────────────────

// In your /api/ai/chat streaming handler, where you process
// tool call results from the graph:

/*
  EXAMPLE — adapt to your actual streaming implementation:

  for await (const event of stream) {
    if (event.type === "tool_result") {
      const result = JSON.parse(event.data);

      // ── VISION CAPTURE INTERCEPT ──
      if (result.__capture_request === true) {
        // Don't send this as a regular message — send as a capture event
        controller.enqueue(
          encoder.encode(`event: capture_request\ndata: ${JSON.stringify(result)}\n\n`)
        );

        // The graph is now PAUSED waiting for the tool result.
        // The frontend will:
        //   1. Open camera with the guidance from result.guidance
        //   2. User captures image/video
        //   3. Frontend sends capture to result.analysisConfig.endpoint
        //   4. Frontend sends analysis result back to resume the graph
        //
        // See: POST /api/ai/chat/vision-result (below)
        continue;
      }

      // Regular tool result — send as normal
      controller.enqueue(
        encoder.encode(`event: tool_result\ndata: ${JSON.stringify(result)}\n\n`)
      );
    }
  }
*/

// ─────────────────────────────────────────────────────────────
// STEP 4: Add endpoint to resume chat after vision capture
// Add this route to your ai.ts routes
// ─────────────────────────────────────────────────────────────

/*
  // POST /api/ai/chat/vision-result
  // Frontend calls this after camera capture + vision analysis completes
  // This resumes the paused LangGraph conversation with the vision results

  aiRoutes.post("/chat/vision-result", async (c) => {
    const { threadId, toolCallId, visionResult } = await c.req.json();
    const payload = c.get("jwtPayload");

    // Resume the graph with the vision analysis as the tool result
    const toolMessage = {
      role: "tool",
      tool_call_id: toolCallId,
      content: JSON.stringify({
        analysisComplete: true,
        screening: visionResult.screening,
        success: visionResult.success,
        error: visionResult.error,
        mediaType: visionResult.mediaType,
        pipeline: visionResult.pipeline,
      }),
    };

    // Feed back into your graph's thread
    const stream = await graph.stream(
      { messages: [toolMessage] },
      { configurable: { thread_id: threadId } }
    );

    // Stream the AI's interpretation of the vision results back to frontend
    return streamSSE(c, stream);
  });
*/

export { VISION_SYSTEM_PROMPT_ADDITION };
