// useVisionCapture.ts — React hook for the chat → capture → analysis → resume flow
// Listens for capture_request events from SSE stream and manages the entire lifecycle

import { useState, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type OverlayType = "fundus_guide" | "skin_guide" | "general_guide";

export interface CaptureGuidance {
  title: string;
  instructions: string[];
  overlay: OverlayType;
}

export interface CaptureRequest {
  __capture_request: true;
  captureType: "fundus" | "skin" | "general";
  reason: string;
  urgency: "routine" | "recommended" | "important";
  guidance: CaptureGuidance;
  analysisConfig: {
    endpoint: string;
    additionalContext: string;
  };
}

export interface VisionResult {
  success: boolean;
  screening?: any;
  error?: any;
  mediaType: string;
  pipeline?: any;
  processingTimeMs: number;
}

export type CaptureState =
  | { status: "idle" }
  | { status: "requested"; request: CaptureRequest; toolCallId: string }
  | { status: "capturing"; request: CaptureRequest; toolCallId: string }
  | { status: "uploading"; request: CaptureRequest; toolCallId: string; progress: number }
  | { status: "analyzing"; request: CaptureRequest; toolCallId: string }
  | { status: "complete"; result: VisionResult; toolCallId: string }
  | { status: "error"; error: string; request: CaptureRequest; toolCallId: string };

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────

export function useVisionCapture(token: string, apiBase = "") {
  const [captureState, setCaptureState] = useState<CaptureState>({ status: "idle" });
  const threadIdRef = useRef<string | null>(null);

  // ── Called when SSE stream emits a capture_request event ──
  const handleCaptureRequest = useCallback((data: CaptureRequest, toolCallId: string, threadId: string) => {
    threadIdRef.current = threadId;
    setCaptureState({
      status: "requested",
      request: data,
      toolCallId,
    });
  }, []);

  // ── User accepts — transition to capturing state ──
  const acceptCapture = useCallback(() => {
    setCaptureState((prev) => {
      if (prev.status !== "requested") return prev;
      return { ...prev, status: "capturing" };
    });
  }, []);

  // ── User declines — resume chat with "user declined" ──
  const declineCapture = useCallback(async () => {
    const state = captureState;
    if (state.status !== "requested") return;

    setCaptureState({ status: "idle" });

    // Tell the backend the user declined
    await fetch(`${apiBase}/api/ai/chat/vision-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        threadId: threadIdRef.current,
        toolCallId: state.toolCallId,
        visionResult: {
          success: false,
          error: { error: "USER_DECLINED", message: "User chose not to capture at this time" },
          mediaType: "none",
        },
      }),
    });
  }, [captureState, token, apiBase]);

  // ── User captured media — upload to vision API, then resume chat ──
  const submitCapture = useCallback(async (file: File) => {
    const state = captureState;
    if (state.status !== "capturing") return;

    const { request, toolCallId } = state;

    try {
      // Phase 1: Upload to vision endpoint
      setCaptureState({ ...state, status: "uploading", progress: 0 });

      const formData = new FormData();
      formData.append("file", file);
      if (request.analysisConfig.additionalContext) {
        formData.append("context", request.analysisConfig.additionalContext);
      }

      const uploadRes = await fetch(`${apiBase}${request.analysisConfig.endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      // Phase 2: Waiting for analysis
      setCaptureState({ ...state, status: "analyzing" });

      const visionResult: VisionResult = await uploadRes.json();

      // Phase 3: Complete — show result
      setCaptureState({ status: "complete", result: visionResult, toolCallId });

      // Phase 4: Resume the chat with vision results
      await fetch(`${apiBase}/api/ai/chat/vision-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          toolCallId,
          visionResult,
        }),
      });
    } catch (err: any) {
      setCaptureState({
        status: "error",
        error: err.message || "Capture failed",
        request,
        toolCallId,
      });
    }
  }, [captureState, token, apiBase]);

  // ── Retry after error ──
  const retryCapture = useCallback(() => {
    setCaptureState((prev) => {
      if (prev.status !== "error") return prev;
      return { status: "capturing", request: prev.request, toolCallId: prev.toolCallId };
    });
  }, []);

  // ── Reset to idle ──
  const dismissCapture = useCallback(() => {
    setCaptureState({ status: "idle" });
  }, []);

  return {
    captureState,
    handleCaptureRequest,
    acceptCapture,
    declineCapture,
    submitCapture,
    retryCapture,
    dismissCapture,
    isActive: captureState.status !== "idle",
  };
}

// ─────────────────────────────────────────────
// SSE STREAM PARSER — plug into your existing chat stream handler
// ─────────────────────────────────────────────

export function parseSSEForCaptureRequests(
  eventSource: EventSource | ReadableStreamDefaultReader<Uint8Array>,
  onCaptureRequest: (data: CaptureRequest, toolCallId: string) => void,
  onMessage: (data: any) => void,
  onDone: () => void
) {
  // If using EventSource:
  if (eventSource instanceof EventSource) {
    eventSource.addEventListener("capture_request", (e: any) => {
      const data = JSON.parse(e.data);
      onCaptureRequest(data, data._toolCallId || `tc_${Date.now()}`);
    });

    eventSource.addEventListener("message", (e: any) => {
      onMessage(JSON.parse(e.data));
    });

    eventSource.addEventListener("done", () => onDone());
    return;
  }

  // If using fetch + ReadableStream (more common with Hono SSE):
  const decoder = new TextDecoder();
  let buffer = "";

  async function read() {
    while (true) {
      const { done, value } = await (eventSource as any).read();
      if (done) { onDone(); break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "message";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentData) {
          try {
            const parsed = JSON.parse(currentData);
            if (currentEvent === "capture_request" || parsed.__capture_request) {
              onCaptureRequest(parsed, parsed._toolCallId || `tc_${Date.now()}`);
            } else {
              onMessage(parsed);
            }
          } catch {
            onMessage(currentData);
          }
          currentEvent = "message";
          currentData = "";
        }
      }
    }
  }

  read();
}
