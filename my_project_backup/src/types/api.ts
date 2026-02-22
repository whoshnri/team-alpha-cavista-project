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
