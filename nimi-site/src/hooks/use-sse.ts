"use client"

import { useEffect, useState, useCallback } from "react"
import { API_BASE_URL } from "@/lib/api-config"

type SSEEvent = {
    event: string
    data: any
}

export function useSSE(userId: string | undefined) {
    const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null)

    useEffect(() => {
        if (!userId) return

        const url = `/api/sse?userId=${userId}`
        const eventSource = new EventSource(url)

        eventSource.onmessage = (event) => {
            // Heartbeats etc
        }

        eventSource.addEventListener("capture_request", (event) => {
            try {
                const data = JSON.parse(event.data)
                setLastEvent({ event: "capture_request", data })
            } catch (err) {
                console.error("[SSE] Failed to parse capture_request data", err)
            }
        })

        eventSource.addEventListener("PING_PWA", (event) => {
            try {
                const data = JSON.parse(event.data)
                setLastEvent({ event: "PING_PWA", data })
            } catch (err) {
                console.error("[SSE] Failed to parse PING_PWA data", err)
            }
        })

        eventSource.onerror = (err) => {
            console.error("[SSE] Connection error:", err)
            eventSource.close()
        }

        return () => {
            eventSource.close()
        }
    }, [userId])

    return { lastEvent, setLastEvent }
}
