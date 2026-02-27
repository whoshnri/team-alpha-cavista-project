
import { BaseMessage } from "@langchain/core/messages";

// CONVERSATION

export type CookieTurn = {
  user: string;
  bot: string | null;
};

// RISK

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type RiskScores = {
  overall: number;         // 0.0 – 1.0
  overallLevel: RiskLevel;
  diabetes: number;
  hypertension: number;
  cardiovascular: number;
  topFactors: string[];
  recommendations: string[];
};

// LAB RESULT

export type BiomarkerStatus = "NORMAL" | "BORDERLINE" | "CONCERNING";

export type ParsedBiomarker = {
  name: string;
  value: number;
  unit: string;
  referenceMin?: number;
  referenceMax?: number;
  status: BiomarkerStatus;
  flagNote: string;
};

export type LabInterpretation = {
  testName: string;
  overallStatus: BiomarkerStatus;
  biomarkers: ParsedBiomarker[];
  plainSummary: string;
  recommendations: string[];
};


// ESCALATION

export type EscalationResult = {
  isEmergency: boolean;
  detectedKeywords: string[];
  urgencyMessage: string;
  nearestClinicPrompt: string;
};

// TOOL USE (AI ↔ Frontend)

export type ToolRequest = {
  tool: "heart_rate_scan" | "nearby_clinics" | "gait_analysis";
  reason: string;
};

export type ToolResult = {
  tool: "heart_rate_scan" | "nearby_clinics" | "gait_analysis";
  data: Record<string, any>;
};

// MAIN AGENT STATE

export type AgentState = {
  messages: BaseMessage[];
  currQuestion: string;
  currAnswer: string;
  cookie: CookieTurn[];
  category: string;
  code: number;
  labInterpretation: LabInterpretation | null;
  riskScores: RiskScores | null;
  escalation: EscalationResult | null;

  toolRequests: ToolRequest[];
  toolResults: ToolResult[];

  userProfile: UserProfile | null;
  _intent?: string;
};

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
