"use client"

import { useCallback } from "react"
import { Message, ChatResponse } from "@/types/api"
import axiosInstance from "@/lib/axios-instance"


export function useEndpoints() {
    const sendMessage = useCallback(async (params: {
        message: string,
        chatHistory: Message[],
        sessionId?: string,
        userProfile?: any,
        toolResults?: any[],
        intent?: string,
        signal?: AbortSignal
    }): Promise<ChatResponse> => {
        const headers: Record<string, string> = {};
        if (params.sessionId) {
            headers['x-chat-session-id'] = params.sessionId;
        }

        const res = await axiosInstance.post(`/api/ai/chat`, {
            message: params.message,
            chatHistory: params.chatHistory,
            userProfile: params.userProfile,
            toolResults: params.toolResults,
            intent: params.intent
        }, {
            headers,
            signal: params.signal
        })
        return res.data
    }, [])

    const escalate = useCallback(async (message: string) => {
        const res = await axiosInstance.post(`/api/ai/escalate`, { message })
        return res.data
    }, [])

    const interpretLab = useCallback(async (labText: string) => {
        console.log(`[ENDPOINTS] Interpreting lab data...`);
        const res = await axiosInstance.post(`/api/ai/lab`, { labText })
        return res.data
    }, [])

    const getHealthProfile = useCallback(async () => {
        console.log(`[ENDPOINTS] Fetching health profile...`);
        const res = await axiosInstance.get(`/api/user/health-profile`)
        return res.data
    }, [])

    const getDetailedHealthProfile = useCallback(async () => {
        const res = await axiosInstance.get(`/api/user/health-profile/detailed`)
        return res.data
    }, [])

    const logGaitData = useCallback(async (data: any) => {
        const res = await axiosInstance.post(`/api/gait/log`, data)
        return res.data
    }, [])

    const validateGaitMagicLink = useCallback(async (token: string) => {
        const res = await axiosInstance.get(`/api/gait/validate-magic-link`, {
            params: { token }
        })
        return res.data
    }, [])

    const persistMessage = useCallback(async (content: string, role: 'USER' | 'AI') => {
        try {
            await axiosInstance.post(`/api/user/chats/active/messages`, { content, sender: role })
        } catch { /* silent — persistence is best-effort */ }
    }, [])

    const getNearbyClinics = useCallback(async (lat: number, lng: number, sessionId?: string) => {
        const headers: Record<string, string> = {};
        if (sessionId) {
            headers['x-chat-session-id'] = sessionId;
        }

        const res = await axiosInstance.get(`/api/clinics/nearby`, {
            params: {
                lat: lat.toString(),
                lng: lng.toString(),
                radius: '5000'
            },
            headers
        })
        return res.data
    }, [])

    const getRecentGaitData = useCallback(async (userId: string) => {
        const res = await axiosInstance.get(`/api/gait/${userId}/recent`)
        return res.data
    }, [])

    const getSessionMessages = useCallback(async (sessionId: string) => {
        const res = await axiosInstance.get(`/api/user/chats/${sessionId}`)
        return res.data
    }, [])

    return {
        sendMessage,
        escalate,
        interpretLab,
        getHealthProfile,
        getDetailedHealthProfile,
        logGaitData,
        validateGaitMagicLink,
        persistMessage,
        getNearbyClinics,
        getRecentGaitData,
        getSessionMessages
    }
}
