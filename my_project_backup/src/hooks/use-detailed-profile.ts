"use client"

import { useState, useEffect, useCallback } from 'react'
import {  getAuthHeaders } from '@/lib/api-config'
import Cookies from "js-cookie"

export interface DetailedProfile {
    user: {
        name: string
        age: number | null
        gender: string
    }
    summary: {
        physical: {
            label: string
            description: string
            metrics: Array<{ label: string; value: string; note?: string }>
        }
        vitals: {
            label: string
            description: string
            metrics: Array<{ label: string; value: string; note?: string }>
        }
        risks: {
            label: string
            description: string
            indicators: Array<{ label: string; value: string; status?: string; color?: string; description?: string }>
        }
        history: {
            label: string
            description: string
            data: Array<{ label: string; values?: string[]; items?: string[] }>
        }
    }
    confidence: number
    lastUpdated: string
}

export function useDetailedProfile() {
    const [data, setData] = useState<DetailedProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchDetailedProfile = useCallback(async () => {
        const token = Cookies.get("preventiq_token")
        if (!token) {
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            const res = await fetch(`/api/user/health-profile/detailed`, {
                headers: getAuthHeaders()
            })
            const result = await res.json()
            if (result.success) {
                setData(result.data)
            } else {
                setError(result.error || "Failed to fetch detailed profile")
            }
        } catch (e) {
            console.error("Failed to fetch detailed profile", e)
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchDetailedProfile()
    }, [fetchDetailedProfile])

    return { data, loading, error, refetch: fetchDetailedProfile }
}
