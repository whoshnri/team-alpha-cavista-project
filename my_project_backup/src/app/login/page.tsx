"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2, ArrowRight, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { API_BASE_URL, API_HEADERS } from "@/lib/api-config"
import Cookies from "js-cookie"
import { normalizePhoneNumber } from "@/lib/phone-utils"

export default function LoginPage() {
    const router = useRouter()
    const [phoneNumber, setPhoneNumber] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const res = await fetch(`/api/auth/login`, {
                method: "POST",
                headers: API_HEADERS,
                body: JSON.stringify({
                    phoneNumber: normalizePhoneNumber(phoneNumber),
                    password
                }),
            })

            const data = await res.json()

            if (data.success) {
                // Store token in cookies for middleware
                Cookies.set("preventiq_token", data.token, { expires: 7 })
                // Store user info in localStorage for useProfile
                localStorage.setItem("preventiq_user", JSON.stringify(data.user))
                router.push("/")
                router.refresh()
            } else {
                setError(data.error || "Invalid phone number or password")
            }
        } catch (err: any) {
            setError("An error occurred. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white uppercase">Initialize Access</h1>
                    <p className="section-label">Identity Verification Required</p>
                </div>

                <div className="card-overhaul bg-black">
                    <div className="p-2 mb-8">
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">Login</h4>
                        <p className="text-[#a0a0a0] text-xs leading-relaxed mt-1">Authorized health personnel only</p>
                    </div>
                    <form onSubmit={handleLogin}>
                        <div className="space-y-6">
                            {error && (
                                <div className="p-4 bg-[#ff4444]/10 border border-[#ff4444]/20 rounded-lg">
                                    <p className="text-xs text-[#ff4444] font-medium leading-relaxed">{error}</p>
                                </div>
                            )}
                            <div className="space-y-4">
                                <Label htmlFor="phoneNumber" className="section-label">Terminal ID (Phone)</Label>
                                <Input
                                    id="phoneNumber"
                                    placeholder="+234..."
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all px-4 h-11 rounded text-sm text-white"
                                    required
                                />
                            </div>
                            <div className="space-y-4">
                                <Label htmlFor="password" className="section-label">Security Key</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all px-4 h-11 rounded text-sm text-white"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex flex-col space-y-6 pt-10">
                            <button
                                type="submit"
                                className="button-primary w-full"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-black loading-pulse" />
                                        Verifying
                                    </span>
                                ) : (
                                    "Sign In"
                                )}
                            </button>
                            <div className="text-[11px] text-center text-[#505050] font-bold uppercase tracking-widest">
                                Unregistered Link:{" "}
                                <Link href="/signup" className="text-white hover:opacity-70 transition-opacity">
                                    Create Account
                                </Link>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
