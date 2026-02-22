"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Loader2, ArrowRight, UserPlus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { API_BASE_URL, API_HEADERS } from "@/lib/api-config"
import Cookies from "js-cookie"
import { normalizePhoneNumber } from "@/lib/phone-utils"

export default function SignupPage() {
    const router = useRouter()
    const [formData, setFormData] = useState({
        fullName: "",
        phoneNumber: "",
        password: "",
        dateOfBirth: "",
        gender: "MALE",
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
                method: "POST",
                headers: API_HEADERS,
                body: JSON.stringify({
                    ...formData,
                    phoneNumber: normalizePhoneNumber(formData.phoneNumber)
                }),
            })

            const data = await res.json()

            if (data.success) {
                Cookies.set("preventiq_token", data.token, { expires: 7 })
                localStorage.setItem("preventiq_user", JSON.stringify(data.user))
                router.push("/onboarding")
                router.refresh()
            } else {
                setError(data.error || "Registration failed. Please try again.")
            }
        } catch (err: any) {
            setError("An error occurred. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white uppercase">New Registration</h1>
                    <p className="section-label">Personnel Enlistment Protocol</p>
                </div>

                <div className="card-overhaul bg-black">
                    <div className="p-2 mb-8">
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">Create Account</h4>
                        <p className="text-[#a0a0a0] text-xs leading-relaxed mt-1">Initialize your security credentials</p>
                    </div>
                    <form onSubmit={handleSignup}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {error && (
                                <div className="col-span-full p-4 bg-[#ff4444]/10 border border-[#ff4444]/20 rounded-lg">
                                    <p className="text-xs text-[#ff4444] font-medium leading-relaxed">{error}</p>
                                </div>
                            )}
                            <div className="space-y-3">
                                <Label htmlFor="fullName" className="section-label">Full Name</Label>
                                <Input
                                    id="fullName"
                                    placeholder="John Doe"
                                    value={formData.fullName}
                                    onChange={(e) => handleChange("fullName", e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all rounded text-sm text-white"
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="phoneNumber" className="section-label">Phone Number</Label>
                                <Input
                                    id="phoneNumber"
                                    placeholder="+234..."
                                    value={formData.phoneNumber}
                                    onChange={(e) => handleChange("phoneNumber", e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all rounded text-sm text-white"
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="password" className="section-label">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => handleChange("password", e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all rounded text-sm text-white"
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="dob" className="section-label">Date of Birth</Label>
                                <Input
                                    id="dob"
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                                    className="bg-black border-border focus:border-white transition-all rounded text-sm text-white invert"
                                    required
                                />
                            </div>
                            <div className="space-y-3 col-span-full sm:col-span-1">
                                <Label htmlFor="gender" className="section-label">Gender</Label>
                                <Select
                                    value={formData.gender}
                                    onValueChange={(val) => handleChange("gender", val)}
                                >
                                    <SelectTrigger className="bg-black border-border focus:border-white rounded text-sm text-white">
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-black border-border text-white">
                                        <SelectItem value="MALE">Male</SelectItem>
                                        <SelectItem value="FEMALE">Female</SelectItem>
                                        <SelectItem value="OTHER">Other</SelectItem>
                                        <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                                    </SelectContent>
                                </Select>
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
                                        Processing
                                    </span>
                                ) : (
                                    "Create Account"
                                )}
                            </button>
                            <div className="text-[11px] text-center text-[#505050] font-bold uppercase tracking-widest">
                                Registered Personnel:{" "}
                                <Link href="/login" className="text-white hover:opacity-70 transition-opacity">
                                    Login here
                                </Link>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
