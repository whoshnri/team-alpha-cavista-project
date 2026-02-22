"use client"

import { useEffect, useState } from "react"

const API_BASE_URL = "http://localhost:4000"

export function usePWASSE(userId: string | null) {
    useEffect(() => {
        if (!userId) return

        const url = `${API_BASE_URL}/api/sse?userId=${userId}`
        const eventSource = new EventSource(url)

        eventSource.addEventListener("PING_PWA", async (event) => {
            console.log("[PWA SSE] Received PING_PWA")
            try {
                const token = localStorage.getItem('vitalthread_token')
                if (!token) return

                await fetch(`${API_BASE_URL}/api/gait/pong/${userId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                })
                console.log("[PWA SSE] Sent PONG")
            } catch (err) {
                console.error("[PWA SSE] Failed to send PONG", err)
            }
        })

        eventSource.onerror = (err) => {
            console.error("[PWA SSE] Connection error:", err)
            eventSource.close()
        }

        return () => {
            eventSource.close()
        }
    }, [userId])
}
