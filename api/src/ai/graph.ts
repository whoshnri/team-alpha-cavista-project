// graph are here
import { END, START, StateGraph } from "@langchain/langgraph";
import type { CookieTurn, UserProfile, ToolRequest, ToolResult, AgentState, AgentLabState } from "./types.js";
import {
    makeHealthQANode,
    makeLabQANode
} from "./nodes.js";
import { AgentLabStateGraph, AgentStateGraph } from "../lib/schemas.js";

export function buildQAGraph(apiKey: string) {
    const graph = new StateGraph(AgentStateGraph);

    // Register nodes
    graph.addNode("health_qa", makeHealthQANode(apiKey))

    // Entry point: simple linear graph
    graph.addEdge(START, "health_qa" as any);
    graph.addEdge("health_qa" as any, END);

    return graph.compile();
}


export function buildLabGraph(apiKey: string){
    const graph = new StateGraph(AgentLabStateGraph)

    graph.addNode("lab_qa", makeLabQANode(apiKey))

    graph.addEdge(START, "lab_qa" as any)
    graph.addEdge("lab_qa" as any, END)

    return graph.compile()
}

export type RunChatGraphOptions = {
    message: string;
    chatHistory: CookieTurn[];
    userProfile?: UserProfile;
    toolResults?: ToolResult[];
    intent?: string;
    apiKey: string;
};

export type RunLabGraphOptions = {
    message: string;
    userProfile?: UserProfile;
    chatSessionId: string;
    apiKey: string;
};

export type GraphResult = {
    response: string;
    code: number;
    category: string;
    chatHistory: CookieTurn[];
    labInterpretation: AgentState["labInterpretation"];
    toolRequests: ToolRequest[];
};

export async function runChat(opts: RunChatGraphOptions): Promise<GraphResult> {
    const { message, chatHistory, userProfile, toolResults, intent, apiKey } = opts;

    const updatedHistory: CookieTurn[] = [...chatHistory, { user: message, bot: null }];

    const graph = buildQAGraph(apiKey);

    const initialState: AgentState = {
        messages: [],
        currQuestion: message,
        currAnswer: "",
        cookie: updatedHistory,
        category: "",
        code: 0,
        labInterpretation: null,
        toolRequests: [],
        toolResults: toolResults ?? [],
        userProfile: userProfile ?? null,
    };

    const finalState = await graph.invoke(initialState) as AgentState;

    let finalAnswer = finalState.currAnswer;
    let finalToolRequests = finalState.toolRequests ?? [];
    

    return {
        response: finalAnswer,
        code: finalState.code,
        category: finalState.category,
        chatHistory: finalState.cookie,
        labInterpretation: finalState.labInterpretation,
        toolRequests: finalToolRequests,
    };
}


export async function runLab(opts: RunLabGraphOptions): Promise<AgentLabState> {
    const { message, userProfile, chatSessionId, apiKey } = opts;

    const graph = buildLabGraph(apiKey);

    const initialState: AgentLabState = {
        labReults: message,
        biomarkers: [],
        recommendations: [],
        interpretation: "",
        overallStatus: "NORMAL",
        testName: "",
        toolRequests: [],
    };

    const finalState = await graph.invoke(initialState) as AgentLabState;

    return finalState;
}
