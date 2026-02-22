// ChatWithVision.tsx — Example integration: chat + real-time vision capture
// Shows how all pieces connect in your existing chat page

import React, { useState, useCallback, useRef } from "react";
import { useVisionCapture, parseSSEForCaptureRequests } from "./useVisionCapture";
import { VisionCaptureUI } from "./VisionCaptureUI";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  visionResult?: any; // Attached screening result
}

export default function ChatWithVision() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const threadIdRef = useRef<string>(crypto.randomUUID());

  const token = "YOUR_JWT_TOKEN"; // Get from your auth context
  const apiBase = "http://localhost:4000";

  // ── Vision capture hook ──
  const vision = useVisionCapture(token, apiBase);

  // ── Send message to chat API ──
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${apiBase}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: input,
          threadId: threadIdRef.current,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      // Parse the SSE stream, watching for capture_request events
      parseSSEForCaptureRequests(
        reader,

        // ── CAPTURE REQUEST intercepted ──
        (captureData, toolCallId) => {
          console.log("[Chat] Vision tool called:", captureData.captureType);

          // Pause streaming — the AI is waiting for visual input
          vision.handleCaptureRequest(captureData, toolCallId, threadIdRef.current);

          // Add a system message showing what's happening
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `🔬 AI requested ${captureData.captureType} capture: ${captureData.reason}`,
            },
          ]);
        },

        // ── Regular message chunk ──
        (data) => {
          if (typeof data === "string") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                last.content += data;
              }
              return updated;
            });
          } else if (data.type === "message_chunk" || data.content) {
            const text = data.content || data.text || "";
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                last.content += text;
              }
              return updated;
            });
          }
        },

        // ── Stream done ──
        () => {
          setIsStreaming(false);
        }
      );
    } catch (err) {
      console.error("[Chat] Error:", err);
      setIsStreaming(false);
    }
  }, [input, isStreaming, token, apiBase, vision]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor:
                msg.role === "user" ? "#2563EB" :
                msg.role === "system" ? "#1E293B" :
                "#1F2937",
              color: "#fff",
              maxWidth: msg.role === "user" ? "80%" : "90%",
              marginLeft: msg.role === "user" ? "auto" : 0,
              fontSize: msg.role === "system" ? 13 : 15,
              opacity: msg.role === "system" ? 0.7 : 1,
            }}
          >
            {msg.content || "..."}
          </div>
        ))}
      </div>

      {/* ── Input ── */}
      <div style={{
        display: "flex", gap: 8, padding: 16,
        borderTop: "1px solid #333", backgroundColor: "#111"
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Describe your symptoms..."
          disabled={isStreaming || vision.isActive}
          style={{
            flex: 1, padding: 14, borderRadius: 12,
            border: "1px solid #333", backgroundColor: "#1a1a2e",
            color: "#fff", fontSize: 15, outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isStreaming || vision.isActive || !input.trim()}
          style={{
            padding: "14px 24px", borderRadius: 12,
            border: "none", backgroundColor: "#3B82F6",
            color: "#fff", fontWeight: 600, cursor: "pointer",
            opacity: isStreaming ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>

      {/* ── Vision Capture Overlay ── */}
      <VisionCaptureUI
        captureState={vision.captureState}
        onAccept={vision.acceptCapture}
        onDecline={vision.declineCapture}
        onSubmit={vision.submitCapture}
        onRetry={vision.retryCapture}
        onDismiss={vision.dismissCapture}
      />
    </div>
  );
}

/*
  ═══════════════════════════════════════════════════════
  FULL FLOW — what happens when a user says
  "I've been having blurry vision and headaches"
  ═══════════════════════════════════════════════════════

  1. User types message → POST /api/ai/chat

  2. LangGraph processes:
     - Intent: health_symptoms
     - Detects: vision complaint + possible hypertension link
     - AI decides to call `capture_fundus` tool

  3. Tool returns JSON with __capture_request: true
     → SSE stream emits: event: capture_request

  4. Frontend intercepts:
     → parseSSEForCaptureRequests catches the event
     → vision.handleCaptureRequest() is called
     → CaptureState transitions: idle → requested

  5. VisionCaptureUI renders the prompt:
     "Let's check your eyes"
     "Based on your symptoms and blood pressure history,
      a quick eye screening could help us understand what's
      going on."
     [Not now] [Open Camera]

  6. User taps "Open Camera":
     → CaptureState: requested → capturing
     → Camera opens with fundus circular guide overlay
     → User aligns eye and taps capture (or records video)

  7. Capture complete:
     → CaptureState: capturing → uploading → analyzing
     → File sent to POST /api/vision/fundus (multipart)
     → Vision engine runs multi-pass pipeline:
        Pass 0: Triage (is this a fundus image?)
        Pass 1: Main analysis (with health profile enrichment)
        Pass 2: Validation (cross-check findings)

  8. Results flow back:
     → CaptureState: analyzing → complete
     → Frontend sends results to POST /api/ai/chat/vision-result
     → LangGraph resumes with vision findings as tool result

  9. AI interprets and responds:
     "I've taken a look at your retinal image. Here's what I found:

      Your eye screening shows some mild changes in the blood
      vessels that can sometimes be associated with blood pressure
      levels. Nothing alarming, but given your recent headaches
      and the blurry vision, I'd recommend:

      1. Schedule an eye exam with an ophthalmologist in the
         next 2-4 weeks
      2. Keep monitoring your blood pressure daily
      3. Reduce salt intake...

      Would you like me to find an eye clinic near you?"

  The entire flow happens inline in the chat — no page
  navigation, no separate upload screen.
  ═══════════════════════════════════════════════════════
*/
