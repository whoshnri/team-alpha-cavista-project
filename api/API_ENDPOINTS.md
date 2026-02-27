# NIMI API Documentation 🏥

**Base URL**: `http://localhost:3000`  
**Authentication**: All protected endpoints require a **Bearer Token** in the `Authorization` header.

---

## 🔐 1. Authentication (`/api/auth`)

### Register User
`POST /api/auth/signup`
- **Headers**:
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "fullName": "Chidi Okeke",
  "phoneNumber": "08012345678",
  "password": "securepassword123",
  "dateOfBirth": "1990-05-15",
  "gender": "MALE"
}
```
- **Response**:
```json
{
  "success": true,
  "token": "eyJhbG...",
  "user": { "id": "u123", "fullName": "Chidi Okeke", "phoneNumber": "+2348012345678" }
}
```

### Login
`POST /api/auth/login`
- **Headers**:
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "phoneNumber": "08012345678",
  "password": "securepassword123"
}
```
- **Response**:
```json
{
  "success": true,
  "token": "eyJhbG...",
  "user": { "id": "u123", "fullName": "Chidi Okeke" }
}
```

---

## 👤 2. User & Chat History (`/api/user`)

### Get Profile
`GET /api/user/profile`
- **Headers**:
  - `Authorization: Bearer <token>`
- **Response**:
```json
{
  "success": true,
  "profile": {
    "fullName": "Chidi Okeke",
    "healthProfile": {
      "heightCm": 175,
      "weightKg": 70,
      "bmi": 22.9,
      "existingConditions": ["None"],
      "familyHistory": ["Hypertension"]
    }
  }
}
```

### Update Health Profile
`PATCH /api/user/profile`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "heightCm": 175,
  "weightKg": 75,
  "existingConditions": ["Type 2 Diabetes"],
  "lifestyle": {
    "physicalActivityLevel": "moderate",
    "stressLevel": 4
  }
}
```

### List Recent Chats
`GET /api/user/chats`
- **Headers**:
  - `Authorization: Bearer <token>`
- **Response**:
```json
{
  "success": true,
  "chats": [
    { "id": "c123", "firstMessage": "I've been feeling dizzy...", "lastMessageAt": "2024-03-20T10:00:00Z" }
  ]
}
```

### Get Detailed Chat History
`GET /api/user/chats/:id`
- **Headers**:
  - `Authorization: Bearer <token>`
- **Response**: Messages can be one of 3 types based on the `sender` field:

| `sender`       | Description                                       | Key Fields              |
|----------------|---------------------------------------------------|-------------------------|
| `USER`         | A user message                                    | `content`               |
| `AI`           | An assistant reply (may contain `<!--METADATA:{}-->` in `content`) | `content`               |
| `TOOL_RESULT`  | A tool execution result (clinic search, heart rate scan, etc.)     | `tool`, `data`          |

**Example**:
```json
{
  "success": true,
  "session": {
    "id": "c123",
    "messages": [
      { "id": "msg_0", "sender": "USER", "content": "I've been feeling dizzy.", "createdAt": "..." },
      { "id": "msg_1", "sender": "AI", "content": "I'm sorry to hear that...\n<!--METADATA:{\"toolRequests\":[{\"tool\":\"nearby_clinics\",\"reason\":\"...\"}]}-->", "createdAt": "..." },
      { "id": "msg_2", "sender": "TOOL_RESULT", "tool": "nearby_clinics", "data": { "clinics": [...], "total_found": 3 }, "content": "", "createdAt": "..." }
    ]
  }
}
```

> **Frontend Rendering Guide:**
> - `USER` → Render as a user chat bubble.
> - `AI` → Strip `<!--METADATA:{}-->`, render as bot bubble. Parse metadata to render lab cards, risk panels, escalation alerts, and tool request prompts.
> - `TOOL_RESULT` → Render based on `tool` field. For `nearby_clinics`, render clinic result cards using `data.clinics`. For `heart_rate_scan`, render vital signs.

---

## 🥗 3. Health & Risk Profile (`/api/user`)

### Basic Health Summary
`GET /api/user/health-profile`
- **Headers**:
  - `Authorization: Bearer <token>`
- **Response**:
```json
{
  "success": true,
  "interpretation": {
    "heartRate": "72 BPM baseline",
    "risks": ["Elevated resting heart rate"],
    "confidence": "85% — 12 readings collected"
  }
}
```

### Detailed Health Dashboard Data
`GET /api/user/health-profile/detailed`
- **Headers**:
  - `Authorization: Bearer <token>`
- **Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "physical": { "label": "Physical Build", "metrics": [...] },
      "vitals": { "label": "Heart & Circulation", "metrics": [...] },
      "risks": { "label": "Preventative Insights", "indicators": [...] }
    },
    "confidence": 0.85
  }
}
```

---

## 🤖 4. AI Health Assistant (`/api/ai`)

### Conversational Chat & Diagnostics
`POST /api/ai/chat`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
  - `x-chat-session-id: <session_id>` (optional, links chat to existing session)
- **Request Body**:
```json
{
  "message": "I've been feeling dizzy lately after eating.",
  "chatHistory": [
    { "user": "Hello", "bot": "Hi! I'm NIMI. How can I help?" }
  ]
}
```
- **Response**:
```json
{
  "success": true,
  "response": "Dizziness after meals can sometimes be related to blood sugar changes...",
  "category": "Diabetes",
  "code": 1,
  "chatHistory": [...],
  "toolRequests": [
    { "tool": "heart_rate_scan", "reason": "Check your vitals while sitting." }
  ]
}
```

### Lab Interpreter
`POST /api/ai/lab`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "labText": "Fasting Glucose: 115 mg/dL, HbA1c: 6.2%"
}
```

### Emergency Detection (Stand-alone)
`POST /api/ai/escalate`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "message": "My chest hurts and I can't breathe"
}
```

---

## 🏥 5. Clinical Services (`/api/clinics`)

### Find Nearby Clinics
`GET /api/clinics/nearby?lat=6.5244&lng=3.3792&radius=5000`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `x-chat-session-id: <session_id>` (optional — if provided, clinic results are auto-saved as a `TOOL_RESULT` message in the chat session)

---

## 🚶 6. Gait & PWA Sync (`/api/gait`)

### Log Gait Data
`POST /api/gait/log`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`

### Sync PWA Magic Link
`GET /api/gait/validate-magic-link?token=ENCRYPTED_PX_TOKEN`
- **Headers**:
  - `Authorization: Bearer <token>`

---
<!-- 
## 📡 7. Real-time Events (`/api/sse`)

Connect to `GET /api/sse` to receive real-time updates:
- **Headers**:
  - `Authorization: Bearer <token>`
- **Events**:
  - `capture_request`: AI-requested VitScan/Heart checks.
  - `PING_PWA`: Server-initiated wake-up call for the PWA. -->
