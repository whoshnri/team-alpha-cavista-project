"use client"

import { useState, useEffect, useCallback } from 'react'
import { UserProfile } from '@/types/api'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api-config'
import Cookies from "js-cookie"
import { useRouter } from 'next/navigation'

export type { UserProfile } from '@/types/api'

// Chat session type for sidebar display
export type RecentChat = {
  id: string
  firstMessage: string
  lastMessageAt: string
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>({})
  const [user, setUser] = useState<any>(null)
  const [recentChats, setRecentChats] = useState<RecentChat[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchProfile = useCallback(async () => {
    const token = Cookies.get("preventiq_token")
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.success) {
        const dbUser = data.profile
        const hp = dbUser.healthProfile

        // Compute age from dateOfBirth
        let computedAge: number | undefined
        if (dbUser.dateOfBirth) {
          const dob = new Date(dbUser.dateOfBirth)
          const today = new Date()
          computedAge = today.getFullYear() - dob.getFullYear()
          const m = today.getMonth() - dob.getMonth()
          if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            computedAge--
          }
        }

        // Map DB healthProfile to the UserProfile type used by the AI
        const mappedProfile: UserProfile = {
          age: computedAge,
          gender: dbUser.gender,
          heightCm: hp?.heightCm,
          weightKg: hp?.weightKg,
          bmi: hp?.bmi,
          existingConditions: hp?.existingConditions || [],
          familyHistory: hp?.familyHistory || [],
          lifestyle: {
            smokingStatus: hp?.smokingStatus,
            physicalActivityLevel: hp?.physicalActivityLevel,
            dietType: hp?.dietType,
            stressLevel: hp?.stressLevel,
          },
        }

        setProfile(mappedProfile)
        setUser(dbUser)

        // Save user for instant feedback on refresh
        localStorage.setItem('preventiq_user', JSON.stringify(dbUser))
      }
    } catch (e) {
      console.error("Failed to fetch profile", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRecentChats = useCallback(async () => {
    const token = Cookies.get("preventiq_token")
    if (!token) return

    try {
      const res = await fetch(`${API_BASE_URL}/api/user/chats`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.success) {
        setRecentChats(data.chats || [])
      }
    } catch (e) {
      console.error("Failed to fetch recent chats", e)
    }
  }, [])

  useEffect(() => {
    const savedUser = localStorage.getItem('preventiq_user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }

    fetchProfile()
    fetchRecentChats()
  }, [fetchProfile, fetchRecentChats])

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      })
      const data = await res.json()
      if (data.success) {
        await fetchProfile()
        return true
      }
    } catch (e) {
      console.error("Failed to update profile", e)
    }
    return false
  }

  const logout = () => {
    Cookies.remove("preventiq_token")
    localStorage.removeItem("preventiq_user")
    router.push("/login")
  }

  return { profile, user, recentChats, loading, updateProfile, logout, refreshProfile: fetchProfile }
}