
import { BaseMessage } from "@langchain/core/messages";
import type { AgentStateSchema, ToolResultSchema, ToolRequestSchema, AgentLabState, BiomarkerStatusSchema } from "../lib/schemas.js";
import type z from "zod";

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

export type BiomarkerStatus = z.infer<typeof BiomarkerStatusSchema>;

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

export type ToolRequest = z.infer<typeof ToolRequestSchema>

export type ToolResult = z.infer<typeof ToolResultSchema>

// MAIN AGENT STATE
export type AgentState = z.infer<typeof AgentStateSchema>;

export type AgentLabState = z.infer<typeof AgentLabState>;
 
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
