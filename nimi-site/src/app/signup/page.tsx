"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { CalendarIcon, Loader2, ShieldCheck } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

export default function SignupPage() {
    const router = useRouter()
    const { signup, loading, error, setError } = useAuth()
    const [step, setStep] = useState(1)
    const [formData, setFormData] = useState({
        fullName: "",
        phoneNumber: "",
        password: "",
        dateOfBirth: "",
        gender: "MALE",
    })

    const totalSteps = 3

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const validateStep = () => {
        if (step === 1) {
            return formData.fullName.trim() !== "" && formData.phoneNumber.trim() !== ""
        }
        if (step === 2) {
            return formData.dateOfBirth !== "" && formData.gender !== ""
        }
        if (step === 3) {
            return formData.password.length >= 6
        }
        return true
    }

    const handleNext = () => {
        if (validateStep()) {
            setStep(prev => Math.min(prev + 1, totalSteps))
            setError("")
        } else {
            setError("Please fill in all required fields correctly.")
        }
    }

    const handleBack = () => {
        setStep(prev => Math.max(prev - 1, 1))
        setError("")
    }

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        if (step < totalSteps) {
            handleNext()
            return
        }
        await signup(formData)
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background font-sans">
            <div className="w-full max-w-lg space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-3">
                    <h1 className="text-4xl font-serif font-bold text-text-primary tracking-tight">Create your account</h1>
                    <p className="text-text-secondary text-base">Step {step} of {totalSteps}: {
                        step === 1 ? "Personal Details" :
                            step === 2 ? "Identity & Background" : "Security Setup"
                    }</p>
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
                    <form onSubmit={handleSignup} className="space-y-8">
                        {error && (
                            <div className="error-box">
                                <p className="font-medium">{error}</p>
                            </div>
                        )}

                        <div className="min-h-[200px] flex flex-col justify-center">
                            {step === 1 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <Label htmlFor="fullName" className="section-label">Full Name</Label>
                                        <Input
                                            id="fullName"
                                            placeholder="e.g. John Doe"
                                            value={formData.fullName}
                                            onChange={(e) => handleChange("fullName", e.target.value)}
                                            className="input h-12"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phoneNumber" className="section-label">Phone Number</Label>
                                        <Input
                                            id="phoneNumber"
                                            placeholder="+234..."
                                            value={formData.phoneNumber}
                                            onChange={(e) => handleChange("phoneNumber", e.target.value)}
                                            className="input h-12"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <Label htmlFor="dob" className="section-label">Date of Birth</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    id="dob"
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal h-12 input px-3 border-border bg-transparent",
                                                        !formData.dateOfBirth && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {formData.dateOfBirth ? format(new Date(formData.dateOfBirth), "PPP") : <span className="text-text-muted">Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 border-none" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={formData.dateOfBirth ? new Date(formData.dateOfBirth) : undefined}
                                                    onSelect={(date) => handleChange("dateOfBirth", date ? date.toISOString() : "")}
                                                    initialFocus
                                                    captionLayout="dropdown"
                                                    fromYear={1900}
                                                    toYear={new Date().getFullYear()}
                                                    className="bg-surface border border-border rounded-lg text-text-primary"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="gender" className="section-label">Gender</Label>
                                        <Select
                                            value={formData.gender}
                                            onValueChange={(val) => handleChange("gender", val)}
                                        >
                                            <SelectTrigger className="input flex justify-between items-center h-12 text-base">
                                                <SelectValue placeholder="Select gender" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface border-border text-text-primary font-sans">
                                                <SelectItem value="MALE">Male</SelectItem>
                                                <SelectItem value="FEMALE">Female</SelectItem>
                                                <SelectItem value="OTHER">Other</SelectItem>
                                                <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="section-label">Choose a Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="At least 6 characters"
                                            value={formData.password}
                                            onChange={(e) => handleChange("password", e.target.value)}
                                            className="input h-12"
                                            required
                                        />
                                        <p className="text-[10px] text-text-muted italic">This will be used to secure your health data.</p>
                                    </div>
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
                                    </span>
                                ) : (
                                    step === totalSteps ? "Finish" : "Next"
                                )}
                            </button>
                        </div>

                        <div className="text-sm text-center text-text-muted font-medium pt-2">
                            Already have an account?{" "}
                            <Link href="/login" className="text-accent-blue hover:underline underline-offset-4 transition-all">
                                Sign in here
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
