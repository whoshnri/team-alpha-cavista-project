// graph.ts — PreventIQ LangGraph state graph with intent routing

import { StateGraph, END, START } from "@langchain/langgraph";
import type { AgentState, CookieTurn, UserProfile, ToolRequest, ToolResult } from "./types.js";
import {
    makeEscalationNode,
    makeHealthQANode,
    makeLabInterpreterNode,
    makeRiskAssessmentNode,
    makeMicroLessonNode,
} from "./nodes.js";

// ─────────────────────────────────────────────
// INTENT ROUTER
// Decides which node to run after escalation check
// ─────────────────────────────────────────────

type Intent = "lab_result" | "risk_assessment" | "micro_lesson" | "health_qa";

function detectIntent(question: string, forcedIntent?: string): Intent {
    if (forcedIntent) return forcedIntent as Intent;

    const q = question.toLowerCase();

    const labKeywords = ["lab result", "blood test", "result", "haemoglobin", "glucose", "hba1c", "creatinine", "cholesterol", "wbc", "rbc", "platelet", "test result", "my results"];
    // Hidden risk and lesson keywords for now
    // const riskKeywords = ["risk", "risk assessment", "how at risk", "chances of", "likelihood", "assess my health", "health score", "am i at risk"];
    // const lessonKeywords = ["teach me", "lesson", "learn", "explain", "tips", "advice", "how to", "what should i", "micro lesson", "daily tip", "guide me"];

    if (labKeywords.some((k) => q.includes(k))) return "lab_result";
    // We route vision-sounding questions to health_qa now since it handles the tools
    return "health_qa";
}

// ─────────────────────────────────────────────
// GRAPH BUILDER
// ─────────────────────────────────────────────

export function buildPreventIQGraph(apiKey: string) {
    const graph = new StateGraph<AgentState>({
        channels: {
            messages: { value: (a, b) => b ?? a, default: () => [] },
            currQuestion: { value: (a, b) => b ?? a, default: () => "" },
            currAnswer: { value: (a, b) => b ?? a, default: () => "" },
            cookie: { value: (a, b) => b ?? a, default: () => [] },
            category: { value: (a, b) => b ?? a, default: () => "" },
            code: { value: (a, b) => b ?? a, default: () => 0 },
            labInterpretation: { value: (a, b) => b ?? a, default: () => null },
            riskScores: { value: (a, b) => b ?? a, default: () => null },
            escalation: { value: (a, b) => b ?? a, default: () => null },
            microLesson: { value: (a, b) => b ?? a, default: () => null },
            visionResult: { value: (a, b) => b ?? a, default: () => null },
            userProfile: { value: (a, b) => b ?? a, default: () => null },
            toolRequests: { value: (a, b) => b ?? a, default: () => [] },
            toolResults: { value: (a, b) => b ?? a, default: () => [] },
            _intent: { value: (a, b) => b ?? a, default: () => undefined },
        },
    });

    // Register all nodes
    graph.addNode("escalation_check", makeEscalationNode(apiKey));
    graph.addNode("health_qa", makeHealthQANode(apiKey));
    graph.addNode("lab_interpreter", makeLabInterpreterNode(apiKey));
    graph.addNode("risk_assessment", makeRiskAssessmentNode(apiKey));
    graph.addNode("micro_lesson", makeMicroLessonNode(apiKey));

    // Entry point: Route by intent if forced, otherwise run escalation check
    graph.addConditionalEdges(
        START,
        (state: AgentState) => {
            // If we have a forced intent that isn't general chat, we can skip chat escalation logic
            if (state._intent && state._intent !== "health_qa") {
                return state._intent;
            }
            return "escalation_check";
        },
        {
            escalation_check: "escalation_check",
            lab_result: "lab_interpreter",
            risk_assessment: "risk_assessment",
            micro_lesson: "micro_lesson",
            vision_analysis: "health_qa",
        } as any
    );

    // Conditional routing after escalation check
    graph.addConditionalEdges(
        "escalation_check" as any,
        (state: AgentState) => {
            // If emergency detected — short-circuit to END (answer already set by escalation node)
            if (state.escalation?.isEmergency) return "emergency_end";

            // Otherwise route by intent
            return detectIntent(state.currQuestion, state._intent);
        },
        {
            emergency_end: END,
            health_qa: "health_qa",
            lab_result: "lab_interpreter",
            risk_assessment: "risk_assessment",
            micro_lesson: "micro_lesson",
            vision_analysis: "health_qa",
        } as any
    );

    // All feature nodes go to END
    graph.addEdge("health_qa" as any, END);
    graph.addEdge("lab_interpreter" as any, END);
    graph.addEdge("risk_assessment" as any, END);
    graph.addEdge("micro_lesson" as any, END);

    return graph.compile();
}

// ─────────────────────────────────────────────
// PUBLIC RUNNER
// ─────────────────────────────────────────────

export type RunGraphOptions = {
    message: string;
    chatHistory: CookieTurn[];
    userProfile?: UserProfile;
    toolResults?: ToolResult[];
    visionResult?: any;
    intent?: string;
    apiKey: string;
};

export type GraphResult = {
    response: string;
    code: number;
    category: string;
    chatHistory: CookieTurn[];
    labInterpretation: AgentState["labInterpretation"];
    riskScores: AgentState["riskScores"];
    escalation: AgentState["escalation"];
    microLesson: AgentState["microLesson"];
    toolRequests: ToolRequest[];
};

export async function runPreventIQ(opts: RunGraphOptions): Promise<GraphResult> {
    const { message, chatHistory, userProfile, toolResults, visionResult, intent, apiKey } = opts;

    const updatedHistory: CookieTurn[] = [...chatHistory, { user: message, bot: null }];

    const graph = buildPreventIQGraph(apiKey);

    const initialState: AgentState & { _intent?: string } = {
        messages: [],
        currQuestion: message,
        currAnswer: "",
        cookie: updatedHistory,
        category: "",
        code: 0,
        labInterpretation: null,
        riskScores: null,
        escalation: null,
        microLesson: null,
        toolRequests: [],
        toolResults: toolResults ?? [],
        userProfile: userProfile ?? null,
        visionResult: visionResult ?? null,
        _intent: intent,
    };

    const finalState = await graph.invoke(initialState) as AgentState;

    // If emergency — override answer with escalation message + auto-request nearby clinics
    let finalAnswer = finalState.currAnswer;
    let finalToolRequests = finalState.toolRequests ?? [];
    if (finalState.escalation?.isEmergency) {
        finalAnswer = `🚨 ${finalState.escalation.urgencyMessage}\n\n${finalState.escalation.nearestClinicPrompt}`;
        // Always find nearby clinics during emergencies
        const alreadyRequested = finalToolRequests.some(t => t.tool === 'nearby_clinics');
        if (!alreadyRequested) {
            finalToolRequests = [...finalToolRequests, {
                tool: 'nearby_clinics' as const,
                reason: 'Emergency detected — locating nearest healthcare facilities for the patient',
            }];
        }
    }

    return {
        response: finalAnswer,
        code: finalState.code,
        category: finalState.category,
        chatHistory: finalState.cookie,
        labInterpretation: finalState.labInterpretation,
        riskScores: finalState.riskScores,
        escalation: finalState.escalation,
        microLesson: finalState.microLesson,
        toolRequests: finalToolRequests,
    };
}
