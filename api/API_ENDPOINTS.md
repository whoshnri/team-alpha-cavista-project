# PreventIQ AI API — Frontend Integration Guide

**Base URL**: `http://localhost:3000`
**All endpoints are prefixed with** `/api/ai`

---

## Shared Types

### `UserProfile` (optional on all endpoints)

```json
{
  "age": 35,
  "gender": "male",
  "existingConditions": ["type 2 diabetes", "hypertension"],
  "familyHistory": ["heart disease", "stroke"],
  "lifestyle": {
    "smokingStatus": "non-smoker",
    "physicalActivityLevel": "moderate",
    "dietType": "mixed",
    "stressLevel": 6
  },
  "preferredLanguage": "en"
}
```

| Field | Type | Notes |
|---|---|---|
| `age` | `number?` | Patient age |
| `gender` | `string?` | e.g. `"male"`, `"female"` |
| `existingConditions` | `string[]?` | Known diagnoses |
| `familyHistory` | `string[]?` | Family medical history |
| `lifestyle.smokingStatus` | `string?` | e.g. `"smoker"`, `"non-smoker"`, `"ex-smoker"` |
| `lifestyle.physicalActivityLevel` | `string?` | e.g. `"sedentary"`, `"moderate"`, `"active"` |
| `lifestyle.dietType` | `string?` | e.g. `"vegetarian"`, `"mixed"`, `"high-fat"` |
| `lifestyle.stressLevel` | `number?` | `1` (low) – `10` (high) |
| `preferredLanguage` | `string?` | ISO language code |

### `ChatHistoryEntry`

```json
{ "user": "What causes hypertension?", "bot": "Hypertension is caused by..." }
```

| Field | Type | Notes |
|---|---|---|
| `user` | `string` | The user's message |
| `bot` | `string \| null` | The bot's reply (`null` for the latest unanswered turn) |

---

## Error Shape (all endpoints)

On failure, every endpoint returns **HTTP 500** with:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## 1. `POST /api/ai/chat` — Conversational Health Q&A

The main chat endpoint. Auto-detects user intent and routes internally to the correct AI pipeline (general Q&A, lab interpretation, risk assessment, or micro-lesson). Supports multi-turn conversation via `chatHistory`.

### Request Body

```json
{
  "message": "What foods should I avoid if I have high blood pressure?",
  "chatHistory": [
    { "user": "Hello", "bot": "Hi! How can I help you today?" }
  ],
  "userProfile": { ... }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | `string` | ✅ | Min 1 character |
| `chatHistory` | `ChatHistoryEntry[]` | No | Defaults to `[]`. Send previous turns for context. |
| `userProfile` | `UserProfile` | No | Personalises responses |

### Response (200)

```json
{
  "success": true,
  "response": "To manage high blood pressure, try reducing your salt intake...",
  "code": 1,
  "category": "Nutrition",
  "chatHistory": [
    { "user": "Hello", "bot": "Hi! How can I help you today?" },
    { "user": "What foods should I avoid...", "bot": "To manage high blood pressure..." }
  ],
  "labInterpretation": { ... },
  "riskScores": { ... },
  "microLesson": { ... },
  "escalation": { ... }
}
```

| Field | Type | Notes |
|---|---|---|
| `response` | `string` | The AI's plain-language reply |
| `code` | `number` | `1` = confident answer from knowledge base, `0` = uncertain |
| `category` | `string` | Detected topic: `"Nutrition"`, `"Diabetes"`, `"Hypertension"`, `"Mental Health"`, `"General"`, etc. |
| `chatHistory` | `ChatHistoryEntry[]` | Updated history — **store and send back on next call** |
| `labInterpretation?` | `LabInterpretation` | Present only if the intent was detected as a lab result |
| `riskScores?` | `RiskScores` | Present only if the intent was detected as a risk assessment |
| `microLesson?` | `MicroLesson` | Present only if the intent was detected as a lesson request |
| `escalation?` | `EscalationResult` | Present only if a medical emergency was detected |

---

## 2. `POST /api/ai/lab` — Lab Result Interpreter

Dedicated endpoint for interpreting raw lab result text. Returns structured biomarker data with a traffic-light status system.

### Request Body

```json
{
  "labText": "Haemoglobin: 10.2 g/dL, WBC: 11,500 /µL, Platelets: 180,000 /µL, Fasting Glucose: 126 mg/dL",
  "userProfile": { ... }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `labText` | `string` | ✅ | Min 10 characters. Paste the raw lab result text. |
| `userProfile` | `UserProfile` | No | Adds patient context to the interpretation |

### Response (200)

```json
{
  "success": true,
  "summary": "Your blood count looks mostly normal, but your fasting glucose is elevated...",
  "labInterpretation": {
    "testName": "Complete Blood Count + Metabolic Panel",
    "overallStatus": "BORDERLINE",
    "biomarkers": [
      {
        "name": "Haemoglobin",
        "value": 10.2,
        "unit": "g/dL",
        "referenceMin": 12.0,
        "referenceMax": 17.5,
        "status": "CONCERNING",
        "flagNote": "Below normal range — could indicate anaemia."
      },
      {
        "name": "Fasting Glucose",
        "value": 126,
        "unit": "mg/dL",
        "referenceMin": 70,
        "referenceMax": 100,
        "status": "CONCERNING",
        "flagNote": "Above normal — this meets the threshold for diabetes diagnosis."
      }
    ],
    "plainSummary": "Your blood count looks mostly normal...",
    "recommendations": [
      "See your doctor about the elevated glucose level",
      "Consider an HbA1c test for a long-term blood sugar picture",
      "Increase iron-rich foods like beans, spinach, and liver"
    ]
  }
}
```

#### `LabInterpretation` shape

| Field | Type | Notes |
|---|---|---|
| `testName` | `string` | e.g. `"Complete Blood Count"` |
| `overallStatus` | `"NORMAL" \| "BORDERLINE" \| "CONCERNING"` | Traffic-light status |
| `biomarkers` | `ParsedBiomarker[]` | Array of individual biomarker results (see below) |
| `plainSummary` | `string` | 2–3 sentence non-medical summary |
| `recommendations` | `string[]` | 3–5 actionable next steps |

#### `ParsedBiomarker` shape

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Biomarker name |
| `value` | `number` | Measured value |
| `unit` | `string` | Unit of measurement |
| `referenceMin?` | `number` | Lower bound of normal range |
| `referenceMax?` | `number` | Upper bound of normal range |
| `status` | `"NORMAL" \| "BORDERLINE" \| "CONCERNING"` | Traffic-light status |
| `flagNote` | `string` | Plain-language explanation |

---

## 3. `POST /api/ai/risk` — NCD Risk Assessment

Calculates risk scores for diabetes, hypertension, and cardiovascular disease based on the user's health profile.

### Request Body

```json
{
  "userProfile": {
    "age": 45,
    "gender": "male",
    "existingConditions": ["obesity"],
    "familyHistory": ["diabetes", "heart disease"],
    "lifestyle": {
      "smokingStatus": "ex-smoker",
      "physicalActivityLevel": "sedentary",
      "dietType": "high-fat",
      "stressLevel": 8
    }
  },
  "message": "I've been having frequent headaches recently"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `userProfile` | `UserProfile` | No | The more profile data, the more accurate the assessment |
| `message` | `string` | No | Defaults to `"Please assess my health risk."`. Additional context. |

### Response (200)

```json
{
  "success": true,
  "summary": "Your overall health risk level is **HIGH** (score: 72%). Your top risk factors are: sedentary lifestyle, family history of diabetes, obesity.",
  "riskScores": {
    "overall": 0.72,
    "overallLevel": "HIGH",
    "diabetes": 0.78,
    "hypertension": 0.65,
    "cardiovascular": 0.70,
    "topFactors": [
      "Sedentary lifestyle",
      "Family history of diabetes and heart disease",
      "Obesity",
      "High stress levels",
      "High-fat diet"
    ],
    "recommendations": [
      "Start with 30 minutes of brisk walking 5 days a week",
      "Reduce fried food and increase vegetables like ugu, ewedu, and waterleaf",
      "Schedule a fasting blood sugar test and lipid panel",
      "Practice stress-relief techniques like deep breathing",
      "Monitor blood pressure weekly at a nearby pharmacy"
    ]
  }
}
```

#### `RiskScores` shape

| Field | Type | Notes |
|---|---|---|
| `overall` | `number` | `0.0` (no risk) – `1.0` (maximum risk) |
| `overallLevel` | `"LOW" \| "MODERATE" \| "HIGH" \| "CRITICAL"` | Human-readable risk tier |
| `diabetes` | `number` | `0.0` – `1.0` |
| `hypertension` | `number` | `0.0` – `1.0` |
| `cardiovascular` | `number` | `0.0` – `1.0` |
| `topFactors` | `string[]` | Top 3–5 contributing risk factors |
| `recommendations` | `string[]` | 5 prioritised lifestyle / clinical recommendations |

---

## 4. `POST /api/ai/lesson` — Personalised Micro-Lesson

Generates a short, culturally relevant health lesson (under 60 seconds to read).

### Request Body

```json
{
  "topic": "managing blood sugar through diet",
  "userProfile": { ... }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `topic` | `string` | No | If omitted, generates based on `userProfile.existingConditions` |
| `userProfile` | `UserProfile` | No | Personalises the lesson to the user's conditions |

### Response (200)

```json
{
  "success": true,
  "response": "📚 **Swap Your Swallow, Save Your Sugar**\n\nInstead of pounded yam...",
  "microLesson": {
    "title": "Swap Your Swallow, Save Your Sugar",
    "content": "Instead of pounded yam or eba every day, try swapping one meal for amala made from unripe plantain flour...",
    "category": "Nutrition",
    "readTimeSecs": 45,
    "sourceNote": "Based on WHO NCD guidelines 2023 and Nigerian Dietetic Association recommendations"
  }
}
```

#### `MicroLesson` shape

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | Catchy lesson title |
| `content` | `string` | The lesson body (~120–150 words) |
| `category` | `string` | e.g. `"Nutrition"`, `"Exercise"`, `"Stress"`, `"Sleep"`, `"Medication"` |
| `readTimeSecs` | `number` | Estimated read time in seconds |
| `sourceNote` | `string` | Brief source attribution |

---

## 5. `POST /api/ai/escalate` — Emergency Detection

Checks a message for medical emergency signals. The escalation node runs on **every** `/chat` call automatically, but this endpoint lets you run a standalone check.

### Request Body

```json
{
  "message": "I'm having severe chest pains and difficulty breathing"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | `string` | ✅ | Min 1 character |

### Response (200)

```json
{
  "success": true,
  "isEmergency": true,
  "escalation": {
    "isEmergency": true,
    "detectedKeywords": ["chest pain", "difficulty breathing"],
    "urgencyMessage": "I can see you're experiencing chest pain and difficulty breathing. These could be signs of a serious condition. Please stay calm — help is available.",
    "nearestClinicPrompt": "Please call LASAMBUS (Lagos) at 112 or 767 immediately, or go to your nearest emergency room. If someone is with you, ask them to drive you."
  },
  "response": "🚨 I can see you're experiencing chest pain..."
}
```

#### `EscalationResult` shape

| Field | Type | Notes |
|---|---|---|
| `isEmergency` | `boolean` | `true` if emergency signals were detected |
| `detectedKeywords` | `string[]` | Emergency phrases found in the message |
| `urgencyMessage` | `string` | Empathetic message urging immediate action |
| `nearestClinicPrompt` | `string` | Instructions to find nearest clinic / call emergency services |

---

## Quick Reference

| Endpoint | Method | Primary Use Case |
|---|---|---|
| `/api/ai/chat` | POST | Main conversational interface (auto-routes by intent) |
| `/api/ai/lab` | POST | Paste & interpret lab results |
| `/api/ai/risk` | POST | Get NCD risk scores from health profile |
| `/api/ai/lesson` | POST | Generate a short health lesson |
| `/api/ai/escalate` | POST | Check for medical emergency signals |
