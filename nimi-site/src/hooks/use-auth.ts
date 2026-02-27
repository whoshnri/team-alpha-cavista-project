"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"
import axiosInstance from "@/lib/axios-instance"
import { normalizePhoneNumber } from "@/lib/phone-utils"

export function useAuth() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const login = async (phoneNumber: string, securityKey: string) => {
        console.log(`[AUTH] Initiating login for: ${phoneNumber}`);
        setLoading(true)
        setError("")
        try {
            const res = await axiosInstance.post("/api/auth/login", {
                phoneNumber: normalizePhoneNumber(phoneNumber),
                password: securityKey
            })

            const data = res.data
            if (data.success) {
                console.log(`[AUTH] Login successful for: ${phoneNumber}`);
                Cookies.set("nimi_token", data.token, { expires: 7 })
                localStorage.setItem("nimi_user", JSON.stringify(data.user))
                router.push("/")
                router.refresh()
                return true
            } else {
                setError(data.error || "Invalid phone number or security key")
                return false
            }
        } catch (err: any) {
            setError(err.response?.data?.error || "An error occurred during authentication")
            return false
        } finally {
            setLoading(false)
        }
    }

    const signup = async (formData: any) => {
        console.log(`[AUTH] Initiating signup for: ${formData.phoneNumber}`);
        setLoading(true)
        setError("")
        try {
            const res = await axiosInstance.post("/api/auth/signup", {
                ...formData,
                phoneNumber: normalizePhoneNumber(formData.phoneNumber)
            })

            const data = res.data
            if (data.success) {
                console.log(`[AUTH] Signup successful for: ${formData.phoneNumber}`);
                Cookies.set("nimi_token", data.token, { expires: 7 })
                localStorage.setItem("nimi_user", JSON.stringify(data.user))
                router.push("/onboarding")
                router.refresh()
                return true
            } else {
                setError(data.error || "Registration failed. Please try again.")
                return false
            }
        } catch (err: any) {
            setError(err.response?.data?.error || "An error occurred during registration")
            return false
        } finally {
            setLoading(false)
        }
    }

    const logout = () => {
        Cookies.remove("nimi_token")
        localStorage.removeItem("nimi_user")
        router.push("/login")
        router.refresh()
    }

    return {
        login,
        signup,
        logout,
        loading,
        error,
        setError
    }
}
