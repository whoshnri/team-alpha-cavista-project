import type { BaseMessage } from "@langchain/core/messages";
import { messagesStateReducer, MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod"
import { Annotation } from "@langchain/langgraph";
import type { BiomarkerStatus as BiomarkerStatusType, ToolResult } from "../ai/types.js";
import { Tool } from "@langchain/core/tools";


export const BiomarkerSchema = z.object({
  name: z.string().describe("Name of the biomarker"),
  value: z.number().describe("Value of the biomarker"),
  unit: z.string().describe("Unit of the biomarker"),
  referenceMin: z.number().optional().describe("Minimum reference value of the biomarker"),
  referenceMax: z.number().optional().describe("Maximum reference value of the biomarker"),
  status: z.custom<BiomarkerStatusType>().describe("Status of the biomarker"),
  flagNote: z.string().describe("Flag note for the biomarker"),
});


export const BiomarkerStatusSchema = z.enum(["NORMAL", "BORDERLINE", "CONCERNING"]);

export const ToolsSchema = z.enum(["heart_rate_scan", "nearby_clinics", "lab_interpretation"]);


export const ToolRequestSchema = z.object({
  tool: ToolsSchema,
  reason: z.string(),
})

export const LifestyleSchema = z.object({
  smokingStatus: z.string().optional(),
  physicalActivityLevel: z.string().optional(),
  dietType: z.string().optional(),
  stressLevel: z.number().min(1).max(10).optional(),
});

export const UserProfileSchema = z.object({
  age: z.number().optional(),
  gender: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  bmi: z.number().optional(),
  existingConditions: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  lifestyle: LifestyleSchema.optional(),
  preferredLanguage: z.string().optional(),
}).optional();

export const ChatHistorySchema = z.array(
  z.object({
    user: z.string(),
    bot: z.string().nullable(),
  })
).default([]);

export const ToolResultSchema = z.object({
  tool: ToolsSchema,
  data: z.record(z.any()),
});

export const ChatBodySchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  chatHistory: ChatHistorySchema,
  userProfile: UserProfileSchema,
  toolResults: z.array(ToolResultSchema).optional().default([]),
});

export const LabBodySchema = z.object({
  labText: z.string().min(10, "Please provide the lab result text"),
});

export const EscalateBodySchema = z.object({
  message: z.string().min(1, "Message is required"),
});


export const AgentStateSchema = z.object({
  messages: z.custom<BaseMessage[]>().default([]),
  currQuestion: z.string().default(""),
  currAnswer: z.string().default(""),
  cookie: z.array(z.any()).default([]),
  category: z.string().default(""),
  code: z.number().default(0),
  labInterpretation: z.any().nullable().default(null),
  userProfile: z.any().nullable().default(null),
  toolRequests: z.array(ToolRequestSchema).default([]),
  toolResults: z.array(ToolResultSchema).default([]),
});

export const AgentStateGraph = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  currQuestion: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  currAnswer: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  cookie: Annotation<any[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  category: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  code: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  labInterpretation: Annotation<any | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  userProfile: Annotation<any | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  toolRequests: Annotation<any[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  toolResults: Annotation<any[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

export const LabTools = z.array(ToolsSchema.exclude(["lab_interpretation"]))

export const AgentLabState = z.object({
  labReults: z.string().min(10, "Please provide the lab result text"),
  biomarkers: z.array(BiomarkerSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  interpretation: z.string().default(""),
  overallStatus: BiomarkerStatusSchema.default("NORMAL"),
  testName: z.string().default(""),
  toolRequests: z.array(ToolRequestSchema).default([]),
})

export const LabInterpretationSchema = z.object({
  testName: z.string().describe("Name of the lab test"),
  overallStatus: BiomarkerStatusSchema.describe("Overall status of the lab test"),
  biomarkers: z.array(BiomarkerSchema).describe("List of biomarkers"),
  plainSummary: z.string().describe("Plain summary of the lab test"),
  recommendations: z.array(z.string()).describe("List of recommendations"),
  toolRequests: z.array(ToolRequestSchema).default([]).describe("Tools the AI wants the frontend to invoke. Empty if no tools needed."),
});

export const AgentLabStateGraph = Annotation.Root({
  labReults: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  biomarkers: Annotation<any[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  recommendations: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  interpretation: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  overallStatus: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  testName: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  toolRequests: Annotation<any[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
})


export const DiagnosticsSchema = z.object({
  category: z.string().describe("Question category e.g. Cardiology, Nutrition, Hypertension, Diabetes, Mental Health, General"),
  code: z.number().int().describe("1 if definitive answer from knowledge base, 0 if uncertain"),
  answer: z.string().describe("Comprehensive health answer with breakdown and steps. Use markdown formatting."),
  toolRequests: z.array(z.object({
    tool: ToolsSchema,
    reason: z.string().describe("Brief explanation of WHY this tool would help the assessment"),
  })).default([]).describe("Tools the AI wants the frontend to invoke. Empty if no tools needed."),
});


