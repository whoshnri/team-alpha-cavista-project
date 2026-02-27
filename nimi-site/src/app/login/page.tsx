"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ShieldCheck } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

export default function LoginPage() {
    const router = useRouter()
    const { login, loading, error, setError } = useAuth()
    const [step, setStep] = useState(1)
    const [phoneNumber, setPhoneNumber] = useState("")
    const [password, setPassword] = useState("")

    const totalSteps = 2

    const handleNext = () => {
        if (phoneNumber.trim() !== "") {
            setStep(2)
            setError("")
        } else {
            setError("Please enter your phone number.")
        }
    }

    const handleBack = () => {
        setStep(1)
        setError("")
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (step === 1) {
            handleNext()
            return
        }
        await login(phoneNumber, password)
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background font-sans">
            <div className="w-full max-w-md space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-3">
                    <h1 className="text-4xl font-serif font-bold text-text-primary tracking-tight">Welcome back</h1>
                    <p className="text-text-secondary text-base">Step {step} of {totalSteps}: {step === 1 ? "Identify yourself" : "Security check"}</p>
                </div>

                {/* Progress Bar */}
                <div className="w-full px-2">
                    <div className="progress-track">
                        <div
                            className="progress-fill"
                            style={{ width: `${(step / totalSteps) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="card shadow-sm">
                    <form onSubmit={handleLogin} className="space-y-8">
                        {error && (
                            <div className="error-box">
                                <p className="font-medium">{error}</p>
                            </div>
                        )}

                        <div className="min-h-[120px] flex flex-col justify-center">
                            {step === 1 && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <Label htmlFor="phoneNumber" className="section-label">Phone Number</Label>
                                    <Input
                                        id="phoneNumber"
                                        placeholder="+234..."
                                        type="text"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        className="input h-12"
                                        required
                                    />
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <Label htmlFor="password" className="section-label">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Enter your security key"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="input h-12"
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 pt-4">
                            {step > 1 && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="btn-secondary flex-1 h-12 font-bold tracking-tight"
                                    disabled={loading}
                                >
                                    Back
                                </button>
                            )}
                            <button
                                type="submit"
                                className="btn-primary flex-[2] h-12 text-base font-bold tracking-tight shadow-md transition-all active:scale-[0.98]"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                                        {step === totalSteps ? "Verifying..." : "Next..."}
                                    </span>
                                ) : (
                                    step === totalSteps ? "Sign In" : "Next"
                                )}
                            </button>
                        </div>

                        <div className="text-sm text-center text-text-muted font-medium pt-2">
                            Don't have an account?{" "}
                            <Link href="/signup" className="text-accent-blue hover:underline underline-offset-4 transition-all">
                                Create one here
                            </Link>
                        </div>
                    </form>
                </div>

                <div className="flex items-center justify-center gap-2 opacity-40 grayscale pointer-events-none">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Secure Health Portal</span>
                </div>
            </div>
        </div>
    )
}
