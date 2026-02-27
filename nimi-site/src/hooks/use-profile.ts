"use client"

import { useState, useEffect, useCallback } from 'react'
import { UserProfile } from '@/types/api'
import axiosInstance from '@/lib/axios-instance'
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
  const [chatsLoading, setChatsLoading] = useState(true)
  const router = useRouter()

  const fetchProfile = useCallback(async () => {
    const token = Cookies.get("nimi_token")
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const res = await axiosInstance.get(`/api/user/profile`)
      const data = res.data
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
        localStorage.setItem('nimi_user', JSON.stringify(dbUser))
      }
    } catch (e) {
      console.error("Failed to fetch profile", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRecentChats = useCallback(async () => {
    const token = Cookies.get("nimi_token")
    if (!token) {
      setChatsLoading(false)
      return
    }

    setChatsLoading(true)
    try {
      const res = await axiosInstance.get(`/api/user/chats`)
      const data = res.data
      if (data.success) {
        setRecentChats(data.chats || [])
      }
    } catch (e) {
      console.error("Failed to fetch recent chats", e)
    } finally {
      setChatsLoading(false)
    }
  }, [])

  useEffect(() => {
    const savedUser = localStorage.getItem('nimi_user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }

    fetchProfile()
    fetchRecentChats()
  }, [fetchProfile, fetchRecentChats])

  const updateProfile = async (updates: Partial<UserProfile>) => {
    console.log(`[PROFILE] Updating profile with:`, updates);
    try {
      const res = await axiosInstance.patch(`/api/user/profile`, updates)
      const data = res.data
      if (data.success) {
        console.log(`[PROFILE] Profile update successful`);
        await fetchProfile()
        return true
      }
    } catch (e) {
      console.error("Failed to update profile", e)
    }
    return false
  }

  const deleteAccount = async () => {
    try {
      const res = await axiosInstance.delete(`/api/user/profile`)
      const data = res.data
      if (data.success) {
        logout()
        return true
      }
    } catch (e) {
      console.error("Failed to delete account", e)
    }
    return false
  }

  const logout = () => {
    Cookies.remove("nimi_token")
    localStorage.removeItem("nimi_user")
    router.push("/login")
  }

  return { profile, user, recentChats, loading, chatsLoading, updateProfile, deleteAccount, logout, refreshProfile: fetchProfile }
}