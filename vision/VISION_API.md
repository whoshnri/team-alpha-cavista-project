# PreventIQ Vision API v2 — Multimodal Medical Screening

**Gemini 2.5 Flash** · **Image + Video** · **Multi-pass Backtracking** · **Structured Error Navigation**

---

## Setup

```bash
pnpm add @google/generative-ai
```

```env
GEMINI_API_KEY=your_key_here
```

Drop these files into your existing PreventIQ API:
```
src/
├── lib/
│   └── vision-engine.ts   ← Core analysis engine (triage → analysis → validation)
├── vision.ts               ← Route handlers (media parsing, persistence)
└── index.ts                ← Updated entry point
```

---

## Endpoints

| Endpoint | What it does |
|---|---|
| `POST /api/vision/fundus` | Retinal fundus screening (image or video) |
| `POST /api/vision/skin` | Skin condition screening (image or video) |
| `POST /api/vision/general` | Open medical image/video Q&A (requires question) |
| `POST /api/vision/analyze` | **Smart endpoint** — auto-detects content type, routes to correct analysis |

All endpoints accept **both** JSON (base64) and **multipart form data** (direct file upload).
All endpoints require `Authorization: Bearer <jwt_token>`.

---

## Sending Media

### Option A: Multipart Form Data (recommended for mobile/PWA)

```bash
# Image upload
curl -X POST http://localhost:4000/api/vision/skin \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@skin_photo.jpg" \
  -F "context=This rash appeared 3 days ago and itches"

# Video upload
curl -X POST http://localhost:4000/api/vision/fundus \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@eye_scan.mp4" \
  -F "context=Patient reports blurry vision for 2 weeks"
```

| Form field | Type | Required | Notes |
|---|---|---|---|
| `file` | File | ✅ | Image (JPEG/PNG/WebP/GIF) or Video (MP4/MOV/AVI/WebM) |
| `context` | string | No | Patient symptom description. Required for `/general`. |

### Option B: JSON Body (base64)

```json
// Image
{
  "image": "<base64-string-no-prefix>",
  "mimeType": "image/jpeg",
  "additionalContext": "Itchy rash on forearm for 3 days"
}

// Video
{
  "video": "<base64-string>",
  "mimeType": "video/mp4",
  "additionalContext": "Recording of eye examination"
}
```

### Frontend Helper

```typescript
// Works for both image and video
async function uploadToVision(
  file: File,
  endpoint: "fundus" | "skin" | "general" | "analyze",
  token: string,
  context?: string
) {
  const form = new FormData();
  form.append("file", file);
  if (context) form.append("context", context);

  const res = await fetch(`/api/vision/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  return res.json();
}

// Usage from camera or file picker
const input = document.querySelector<HTMLInputElement>("#camera");
input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const result = await uploadToVision(file, "analyze", userToken, "What is this?");

  if (result.success) {
    renderScreening(result.screening);
  } else {
    renderError(result.error); // Structured error with guidance
  }
});
```

### Video Constraints

| Constraint | Limit |
|---|---|
| Max file size | 100MB |
| Max duration (recommended) | 2 minutes |
| Supported formats | MP4, MOV, AVI, WebM |
| Processing | Uploaded to Gemini File API, polled until ready (up to 2 min) |

---

## The Multi-Pass Pipeline

Every request goes through up to **4 analysis passes** with intelligent backtracking:

```
┌──────────────────────────────────────────────────────┐
│  REQUEST (image or video + optional context)         │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  PASS 0: TRIAGE                                      │
│  "What are we looking at?"                           │
│  → Content type, subject detection, quality check    │
│                                                      │
│  ┌─ No subject found?                                │
│  │  → BACKTRACK → Enhanced Detection (look harder)   │
│  │     └─ Still nothing? → SUBJECT_NOT_FOUND error   │
│  │        with recapture guidance                    │
│  │                                                   │
│  ├─ Quality unusable?                                │
│  │  → BACKTRACK → Quality Recovery (extract partial) │
│  │     └─ Unrecoverable? → QUALITY_UNUSABLE error    │
│  │        with camera instructions                   │
│  │                                                   │
│  └─ Wrong content type?                              │
│     → BACKTRACK → Auto-reroute to correct analysis   │
│        (e.g. sent skin photo to /fundus → reroutes)  │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  PASS 1: MAIN ANALYSIS                               │
│  Full screening with health profile enrichment       │
│  Specialized prompt for fundus / skin / general      │
│  For video: analyzes ALL frames, finds best moments  │
│                                                      │
│  ┌─ Failed / unparseable?                            │
│  │  → BACKTRACK → Simplified retry (shorter prompt)  │
│  │     └─ Still failed? → ANALYSIS_FAILED error      │
│  │                                                   │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  PASS 2: VALIDATION                                  │
│  Second model pass cross-checks the findings against │
│  the actual image/video                              │
│  → Catches overstatements, understatements, misses   │
│  → Produces corrected result if needed               │
│                                                      │
│  ┌─ Corrections found?                               │
│  │  → BACKTRACK → Apply corrections to final result  │
│  │                                                   │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  FINAL RESPONSE                                      │
│  screening + pipeline telemetry + backtrack log      │
└──────────────────────────────────────────────────────┘
```

---

## Success Response Shape

```json
{
  "success": true,
  "type": "fundus_screening",
  "mediaType": "video",
  "processingTimeMs": 8420,
  "framesAnalyzed": -1,
  "screening": {
    "imageQuality": "GOOD",
    "qualityNote": "Clear fundus visible in frames 2-4 seconds",
    "mediaType": "fundus",
    "findings": [
      {
        "finding": "Arteriovenous nicking",
        "location": "Superior temporal arcade",
        "severity": "MILD",
        "description": "Slight narrowing where arteries cross veins",
        "videoTimestamp": "~3 seconds — clearest frame"
      }
    ],
    "riskIndicators": {
      "hypertensiveRetinopathy": { "risk": "MODERATE", "confidence": 0.72, "evidence": "..." },
      "diabeticRetinopathy": { "risk": "LOW", "confidence": 0.85, "evidence": "..." },
      "glaucomaIndicators": { "risk": "LOW", "confidence": 0.80, "evidence": "..." },
      "macularAbnormality": { "risk": "LOW", "confidence": 0.78, "evidence": "..." }
    },
    "overallRisk": "MODERATE",
    "summary": "Your retinal scan shows some mild vascular changes that may be related to blood pressure...",
    "recommendations": ["Schedule ophthalmologist visit within 2-4 weeks", "..."],
    "urgency": "SOON",
    "disclaimer": "This is an AI-assisted screening, not a medical diagnosis."
  },
  "pipeline": {
    "totalPasses": 3,
    "passBreakdown": [
      { "pass": 0, "strategy": "triage", "durationMs": 1200, "success": true },
      { "pass": 1, "strategy": "main_analysis", "durationMs": 4800, "success": true },
      { "pass": 99, "strategy": "validation", "durationMs": 2400, "success": true }
    ],
    "backtrackEvents": 0,
    "backtrackLog": []
  }
}
```

---

## Error Response Shape (with Navigation)

When analysis fails, the error includes **structured guidance** so the frontend can tell the user exactly what to fix:

```json
{
  "success": false,
  "type": "fundus_screening",
  "mediaType": "image",
  "processingTimeMs": 3200,
  "error": {
    "error": "SUBJECT_NOT_FOUND",
    "errorCode": "E_NO_SUBJECT",
    "message": "Could not detect a valid fundus subject in the uploaded image. What was detected instead: a face/selfie.",
    "detectedContent": "face",
    "detectedDescription": "The image shows a person's face, not a retinal fundus photograph.",
    "alternativeSubjects": ["face", "general_portrait"],
    "recaptureGuidance": [
      "Position the camera directly in front of the eye, about 2-3 cm away",
      "Use a fundus camera or ophthalmoscope attachment if available",
      "The image should show a circular view of the inner eye, typically orange/red",
      "Avoid flash directly into the eye"
    ],
    "suggestedAction": "RESUBMIT",
    "canRetryAs": null
  },
  "pipeline": {
    "totalPasses": 2,
    "passBreakdown": [
      { "pass": 0, "strategy": "triage", "durationMs": 1100, "success": true },
      { "pass": 1, "strategy": "enhanced_detection", "durationMs": 2100, "success": true }
    ],
    "backtrackEvents": 2,
    "backtrackLog": [
      {
        "trigger": "no_subject_detected",
        "from": "triage",
        "to": "enhanced_detection",
        "reasoning": "Triage could not find a fundus subject: image shows a face"
      },
      {
        "trigger": "enhanced_detection_failed",
        "from": "enhanced_detection",
        "to": "user_guidance",
        "reasoning": "Even with enhanced analysis, the target subject was not found."
      }
    ]
  }
}
```

---

## Error Codes Reference

### Input Errors (HTTP 400)

| Code | Meaning | Frontend Action |
|---|---|---|
| `E_NO_FILE` | No file in multipart form | Show file picker instructions |
| `E_UNSUPPORTED_FORMAT` | Bad MIME type | Show supported formats list |
| `E_VIDEO_TOO_LARGE` | Video exceeds 100MB | Show trim/compress instructions |
| `E_INVALID_IMAGE` | Base64 data too short/invalid | Show encoding instructions |
| `E_INVALID_BODY` | JSON body unparseable | Show request format examples |
| `E_NO_MEDIA` | No `image` or `video` field | Show both input methods |
| `E_NO_QUESTION` | `/general` without context | Prompt user for a question |

### Analysis Errors (HTTP 422)

| Code | Meaning | Frontend Action |
|---|---|---|
| `E_NO_SUBJECT` | Target not found in image/video | Show `recaptureGuidance` + camera tips |
| `E_BAD_QUALITY` | Image/video too poor to analyze | Show lighting/focus instructions |
| `E_ANALYSIS_FAILED` | AI couldn't complete analysis | Offer retry or redirect to `/general` |

### System Errors (HTTP 500)

| Code | Meaning | Frontend Action |
|---|---|---|
| `E_REQUEST_FAILED` | Unexpected server error | Offer retry, show support contact |
| `E_VIDEO_UPLOAD_FAILED` | Gemini File API rejected video | Show format/size requirements |

### Error Fields

Every error includes:

| Field | Type | Always present | Purpose |
|---|---|---|---|
| `error` | string | ✅ | Short error name |
| `errorCode` | string | ✅ | Machine-readable code for switch/case |
| `message` | string | ✅ | Human-readable explanation |
| `recaptureGuidance` | string[] | ✅ | Step-by-step fix instructions for user |
| `suggestedAction` | string | ✅ | `RESUBMIT` / `RETRY` / `ADD_QUESTION` / `FIX_AND_RETRY` |
| `detectedContent` | string | Sometimes | What was actually in the image |
| `canRetryAs` | string\|null | Sometimes | Alternative analysis type to try |

---

## Frontend Error Handling Example

```tsx
function VisionResult({ result }: { result: any }) {
  if (result.success) {
    return <ScreeningCard data={result.screening} />;
  }

  const err = result.error;

  switch (err.errorCode) {
    case "E_NO_SUBJECT":
      return (
        <ErrorCard
          title="We couldn't find what we need"
          message={err.message}
          icon="camera-off"
          tips={err.recaptureGuidance}
          actions={[
            { label: "Retake Photo", action: "retake" },
            err.canRetryAs && {
              label: `Try ${err.canRetryAs} analysis instead`,
              action: "retry_as",
              payload: err.canRetryAs,
            },
          ]}
        />
      );

    case "E_BAD_QUALITY":
      return (
        <ErrorCard
          title="Image quality too low"
          message={err.message}
          icon="image-off"
          tips={err.recaptureGuidance}
          actions={[{ label: "Take a New Photo", action: "retake" }]}
        />
      );

    case "E_VIDEO_TOO_LARGE":
      return (
        <ErrorCard
          title="Video too large"
          message={err.message}
          icon="film"
          tips={err.recaptureGuidance}
          actions={[{ label: "Record Shorter Clip", action: "retake" }]}
        />
      );

    default:
      return (
        <ErrorCard
          title="Something went wrong"
          message={err.message}
          tips={err.recaptureGuidance}
          actions={[{ label: "Try Again", action: "retry" }]}
        />
      );
  }
}
```

---

## Backtrack Log (for debugging / advanced UIs)

The `pipeline.backtrackLog` array shows every time the engine changed strategy:

```json
{
  "trigger": "content_type_mismatch",
  "from": "expected_fundus",
  "to": "detected_skin",
  "reasoning": "User requested fundus analysis but image appears to be: skin photo of forearm."
}
```

You can use this to:
- Show a progress timeline in the UI
- Debug why analysis took a certain path
- Build analytics on common user errors (wrong image type, bad quality, etc.)

---

## Video Analysis Notes

When video is uploaded:

1. **Upload phase**: Video is sent to Gemini's File API and processed server-side (up to 2 min wait)
2. **Frame analysis**: Gemini analyzes ALL frames internally — no manual frame extraction needed
3. **Temporal context**: Findings include `videoTimestamp` noting when features were most visible
4. **Backtracking**: If the target subject (e.g., retina) isn't visible in early frames, the engine asks Gemini to scan ALL frames before giving up

This means a user can:
- Record a 10-second video of their skin condition from different angles
- Upload a fundus video from a portable ophthalmoscope
- The AI will find the best frame(s) automatically

---

## Architecture: How This Fits With Your Stack

```
┌─────────────────────────────────────────────────────────┐
│  Mobile / PWA Frontend                                  │
│  Camera capture → FormData upload → Result rendering    │
└──────────────┬──────────────────────────────────────────┘
               │ POST /api/vision/*
               ▼
┌─────────────────────────────────────────────────────────┐
│  PreventIQ Hono API (Node.js)                           │
│                                                         │
│  vision.ts ──→ vision-engine.ts                         │
│  (routes)      (multi-pass pipeline)                    │
│                    │                                    │
│                    ├── Triage pass (Gemini)              │
│                    ├── Main analysis (Gemini)            │
│                    ├── Validation pass (Gemini)          │
│                    └── Backtracking logic (local)        │
│                                                         │
│  + Health profile enrichment (Prisma → PostgreSQL)      │
│  + Result persistence (→ labResult table)               │
│  + Risk flagging (→ healthProfile.labMetadata)          │
│                                                         │
│  Existing routes: /ai/chat, /clinics, /gait, /auth     │
└─────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Google Gemini 2.5 Flash API                            │
│  • Inline image analysis (base64)                       │
│  • File API for video upload + processing               │
│  • Structured JSON output mode                          │
└─────────────────────────────────────────────────────────┘
```
