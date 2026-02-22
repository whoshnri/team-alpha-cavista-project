# PreventIQ Vision — Real-Time Capture Workflow

## The Flow

```
User: "I've been having blurry vision and headaches"
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  LANGGRAPH AI PIPELINE                                │
│                                                       │
│  Intent: health_symptoms                              │
│  Context: blurry vision + headaches                   │
│  Profile: hypertension, age 42, BMI 28                │
│                                                       │
│  AI DECISION: "I should look at their retina"         │
│  → Calls: capture_fundus({                            │
│      reason: "Your symptoms and blood pressure        │
│              history suggest an eye check would help", │
│      clinicalContext: "Blurry vision 2 weeks,          │
│              headaches, known hypertension",           │
│      urgency: "recommended",                          │
│      preferVideo: false                               │
│    })                                                 │
│                                                       │
│  GRAPH PAUSES — waiting for tool result               │
└──────────────────┬───────────────────────────────────┘
                   │ SSE: event: capture_request
                   ▼
┌──────────────────────────────────────────────────────┐
│  FRONTEND                                             │
│                                                       │
│  1. SSE parser intercepts capture_request event       │
│  2. useVisionCapture transitions: idle → requested    │
│  3. VisionCaptureUI renders prompt overlay:           │
│                                                       │
│  ┌────────────────────────────────┐                   │
│  │  RECOMMENDED                   │                   │
│  │                                │                   │
│  │  Let's check your eyes         │                   │
│  │                                │                   │
│  │  Your symptoms and blood       │                   │
│  │  pressure history suggest an   │                   │
│  │  eye check would help.         │                   │
│  │                                │                   │
│  │  1. Position camera near eye   │                   │
│  │  2. Keep eye open, look ahead  │                   │
│  │  3. Hold steady                │                   │
│  │                                │                   │
│  │  📷 Photo capture              │                   │
│  │                                │                   │
│  │  [Not now]  [Open Camera]      │                   │
│  └────────────────────────────────┘                   │
│                                                       │
│  User taps "Open Camera"                              │
│  → State: requested → capturing                       │
│  → Camera opens with fundus circle overlay            │
│  → User captures                                      │
│  → State: capturing → uploading → analyzing           │
└──────────────────┬───────────────────────────────────┘
                   │ POST /api/vision/fundus (multipart)
                   ▼
┌──────────────────────────────────────────────────────┐
│  VISION ENGINE (multi-pass w/ backtracking)           │
│                                                       │
│  Pass 0: Triage → "This is a fundus image, GOOD"     │
│  Pass 1: Main analysis → findings + risk indicators   │
│  Pass 2: Validation → cross-check, no corrections     │
│                                                       │
│  Result: {                                            │
│    overallRisk: "MODERATE",                           │
│    riskIndicators: {                                  │
│      hypertensiveRetinopathy: { risk: "MODERATE" }    │
│    },                                                 │
│    summary: "Mild vascular changes detected..."       │
│  }                                                    │
└──────────────────┬───────────────────────────────────┘
                   │ Response JSON
                   ▼
┌──────────────────────────────────────────────────────┐
│  FRONTEND                                             │
│                                                       │
│  State: analyzing → complete                          │
│  Shows: "✅ Analysis Complete"                        │
│                                                       │
│  Then immediately resumes chat:                       │
│  POST /api/ai/chat/vision-result {                    │
│    threadId,                                          │
│    toolCallId,                                        │
│    visionResult: { screening, pipeline, ... }         │
│  }                                                    │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  LANGGRAPH RESUMES                                    │
│                                                       │
│  Tool result injected → AI interprets findings        │
│  with full context of conversation + health profile   │
│                                                       │
│  AI responds:                                         │
│  "I've looked at your retinal image. Here's what I    │
│   found: mild blood vessel changes that can be linked │
│   to blood pressure. Given your headaches, I'd        │
│   recommend seeing an ophthalmologist within 2-4      │
│   weeks. Would you like me to find a clinic nearby?"  │
│                                                       │
│  → Can then tool-call clinic_finder if user says yes  │
└──────────────────────────────────────────────────────┘
```

---

## File Map

### Backend (add to `api/src/`)

| File | What it does |
|---|---|
| `lib/vision-engine.ts` | Multi-pass Gemini analysis with backtracking (triage → analysis → validation) |
| `lib/vision-tools.ts` | **NEW** — LangGraph tool definitions (capture_fundus, capture_skin, capture_general) |
| `lib/vision-graph-integration.ts` | **REFERENCE** — Shows how to wire tools into your existing graph |
| `vision.ts` | Route handlers with video upload + multipart support |
| `index.ts` | Updated entry point |

### Frontend (add to your React/Next.js app)

| File | What it does |
|---|---|
| `useVisionCapture.ts` | React hook managing the full capture lifecycle + SSE parsing |
| `VisionCaptureUI.tsx` | Camera UI with guided overlays (fundus circle, skin frame, crosshair) |
| `ChatWithVision.tsx` | **REFERENCE** — Example chat page showing complete integration |

---

## Integration Steps

### 1. Backend

```bash
# Install
pnpm add @google/generative-ai

# Add to .env
GEMINI_API_KEY=your_key
```

Add files to `api/src/lib/`.

Then in your existing LangGraph graph definition, add the vision tools:

```typescript
import { visionTools } from "./lib/vision-tools.js";

// Add to your tools array
const tools = [...existingTools, ...visionTools];
```

Add the vision system prompt section to your existing system prompt (see `vision-graph-integration.ts`).

Add the `/api/ai/chat/vision-result` endpoint to your `ai.ts` routes (see example in `vision-graph-integration.ts`).

### 2. Frontend

Drop `useVisionCapture.ts` and `VisionCaptureUI.tsx` into your components.

In your chat page:

```tsx
import { useVisionCapture, parseSSEForCaptureRequests } from "./useVisionCapture";
import { VisionCaptureUI } from "./VisionCaptureUI";

function ChatPage() {
  const vision = useVisionCapture(token, apiBase);

  // In your SSE stream handler, use parseSSEForCaptureRequests
  // to intercept capture events

  return (
    <>
      {/* Your existing chat UI */}
      <VisionCaptureUI
        captureState={vision.captureState}
        onAccept={vision.acceptCapture}
        onDecline={vision.declineCapture}
        onSubmit={vision.submitCapture}
        onRetry={vision.retryCapture}
        onDismiss={vision.dismissCapture}
      />
    </>
  );
}
```

### 3. SSE Event Format

Your existing chat SSE stream needs to emit capture requests as a distinct event type:

```
event: capture_request
data: {"__capture_request":true,"captureType":"fundus","reason":"...","guidance":{...},"analysisConfig":{...}}

event: message
data: {"content":"I'd like to take a look at your eyes..."}
```

The frontend SSE parser (`parseSSEForCaptureRequests`) already handles both event types.

---

## What Triggers Each Tool

| User Says | AI Calls | What Happens |
|---|---|---|
| "I have blurry vision" | `capture_fundus` | Camera opens with eye guide overlay |
| "There's a rash on my arm" | `capture_skin` | Camera opens with skin frame guide |
| "What is this bump?" | `capture_skin` | Camera with skin guide, body area noted |
| "Can you read my lab results?" | `capture_general` | Camera with generic crosshair |
| "My wound looks weird" | `capture_general` | Camera for wound assessment |
| "I have diabetes, should I check my eyes?" | `capture_fundus` | Proactive screening triggered by risk |

---

## Error Recovery in the Flow

### Camera denied
→ UI shows "Camera permission denied" with instructions
→ User can go back to chat, AI continues verbally

### User declines capture
→ `declineCapture()` sends `USER_DECLINED` to resume the graph
→ AI responds: "No worries! Let me continue with what you've told me..."

### Bad image captured
→ Vision engine triage detects bad quality
→ Backtrack: tries quality recovery
→ If unrecoverable: returns `E_BAD_QUALITY` with recapture guidance
→ Frontend shows "Try Again" with specific tips

### Wrong subject (e.g., face instead of fundus)
→ Triage detects content mismatch
→ Backtrack: tries enhanced detection, then auto-reroute
→ If still wrong: returns `E_NO_SUBJECT` with guidance
→ Frontend shows exactly what to capture instead

### Video processing timeout
→ Returns `E_VIDEO_UPLOAD_FAILED`
→ Frontend shows: "Try a shorter clip (under 2 minutes)"

### Analysis fails
→ Backtrack: simplified retry
→ If still fails: `E_ANALYSIS_FAILED`
→ Frontend offers retry or redirect to general analysis

All errors flow back to the chat as tool results, so the AI can gracefully handle them in conversation.
