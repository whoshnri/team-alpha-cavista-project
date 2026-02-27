export type UserProfile = {
    age?: number;
    gender?: string;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
    existingConditions?: string[];
    familyHistory?: string[];
    lifestyle?: {
        smokingStatus?: string;
        physicalActivityLevel?: string;
        dietType?: string;
        stressLevel?: number;
    };
    preferredLanguage?: string;
    notificationsEnabled?: boolean;
};

export type ChatHistoryEntry = {
    user: string;
    bot: string | null;
};

export type Message = ChatHistoryEntry;

export type ParsedBiomarker = {
    name: string;
    value: number;
    unit: string;
    referenceMin?: number;
    referenceMax?: number;
    status: 'NORMAL' | 'BORDERLINE' | 'CONCERNING';
    flagNote: string;
};

export type LabInterpretation = {
    testName: string;
    overallStatus: 'NORMAL' | 'BORDERLINE' | 'CONCERNING';
    biomarkers: ParsedBiomarker[];
    plainSummary: string;
    recommendations: string[];
};

export type RiskScores = {
    overall: number;
    overallLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    diabetes: number;
    hypertension: number;
    cardiovascular: number;
    topFactors: string[];
    recommendations: string[];
};

export type MicroLesson = {
    title: string;
    content: string;
    category: string;
    readTimeSecs: number;
    sourceNote: string;
};

export type EscalationResult = {
    isEmergency: boolean;
    detectedKeywords: string[];
    urgencyMessage: string;
    nearestClinicPrompt: string;
};

export type ToolRequest = {
    tool: "heart_rate_scan" | "nearby_clinics" | "gait_analysis" | "vision_analysis";
    reason: string;
};

export type ApiResponse<T = any> = {
    success: boolean;
    error?: string;
} & T;

export type ChatResponse = ApiResponse<{
    response: string;
    code: number;
    category: string;
    chatHistory: ChatHistoryEntry[];
    labInterpretation?: LabInterpretation;
    riskScores?: RiskScores;
    microLesson?: MicroLesson;
    escalation?: EscalationResult;
    toolRequests?: ToolRequest[];
}>;

export type LabResponse = ApiResponse<{
    summary: string;
    labInterpretation: LabInterpretation;
}>;

export type RiskResponse = ApiResponse<{
    summary: string;
    riskScores: RiskScores;
}>;

export type LessonResponse = ApiResponse<{
    response: string;
    microLesson: MicroLesson;
}>;

export type EscalateResponse = ApiResponse<{
    isEmergency: boolean;
    escalation: EscalationResult;
    response: string;
}>;

// ─────────────────────────────────────────────
// PERSISTED MESSAGE TYPES
// These describe the shapes stored in ChatSession.messages JSON
// ─────────────────────────────────────────────

/** A user message in the chat session JSON */
export type PersistedUserMessage = {
    role: 'user';
    content: string;
    timestamp: string;
};

/** An assistant message — content may contain <!--METADATA:{...}--> with:
 * - toolRequests: ToolRequest[]
 * - lab: LabInterpretation
 * - risk: RiskScores
 * - escalation: EscalationResult
 * - clinics: ClinicResult[] (when nearby_clinics results are embedded)
 * - downloadApp: boolean
 */
export type PersistedAssistantMessage = {
    role: 'assistant';
    content: string; // may contain <!--METADATA:{...}-->
    timestamp: string;
    metadata?: {
        modelUsed?: string;
        wasEscalated?: boolean;
        category?: string;
    };
};

/** A tool result message — persisted when a tool executes (clinic search, heart rate, etc.) */
export type PersistedToolResultMessage = {
    role: 'tool_result';
    tool: 'nearby_clinics' | 'heart_rate_scan' | 'gait_analysis' | 'vision_analysis';
    data: Record<string, any>;
    timestamp: string;
};

/** Union of all possible message types in the chat session JSON */
export type PersistedMessage = PersistedUserMessage | PersistedAssistantMessage | PersistedToolResultMessage;
