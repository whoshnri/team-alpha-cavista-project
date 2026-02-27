"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { useProfile } from "@/hooks/use-profile"
import {
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    Activity,
    Scale,
    Stethoscope,
    HeartPulse,
    ChevronRight,
    Sparkles,
    Loader2
} from "lucide-react"

export default function OnboardingPage() {
    const router = useRouter()
    const { updateProfile, loading: profileLoading } = useProfile()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState({
        heightCm: 0,
        weightKg: 0,
        existingConditions: [] as string[],
        familyHistory: [] as string[],
        lifestyle: {
            physicalActivityLevel: "MODERATE",
            smokingStatus: "NEVER",
            stressLevel: 5,
            dietType: "BALANCED"
        }
    })

    const totalSteps = 4
    const progress = (step / totalSteps) * 100

    const conditionsOptions = [
        "Diabetes", "Hypertension", "Asthma", "Heart Disease", "High Cholesterol", "None"
    ]

    const toggleCondition = (condition: string) => {
        if (condition === "None") {
            setFormData(prev => ({ ...prev, existingConditions: ["None"] }))
            return
        }
        setFormData(prev => {
            const filtered = prev.existingConditions.filter(c => c !== "None")
            if (filtered.includes(condition)) {
                return { ...prev, existingConditions: filtered.filter(c => c !== condition) }
            } else {
                return { ...prev, existingConditions: [...filtered, condition] }
            }
        })
    }

    const nextStep = () => setStep(s => Math.min(s + 1, totalSteps))
    const prevStep = () => setStep(s => Math.max(s - 1, 1))

    const handleComplete = async () => {
        setLoading(true)
        const success = await updateProfile(formData)
        if (success) {
            router.push("/")
        } else {
            setLoading(false)
            alert("Failed to save profile. Please try again.")
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background font-sans">
            <div className="w-full max-w-2xl space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="space-y-6">
                    <div className="flex items-center justify-between text-base font-medium">
                        <span className="text-text-secondary">Step {step} of {totalSteps}</span>
                        <span className="text-accent-blue font-bold tracking-tight uppercase text-xs">{["Welcome", "Vitals", "History", "Lifestyle"][step - 1]}</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full">
                        <div className="progress-track">
                            <div
                                className="progress-fill"
                                style={{ width: `${(step / totalSteps) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card shadow-sm relative overflow-hidden">
                    {/* Subtle decorative accents */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent-blue/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

                    {step === 1 && (
                        <div className="animate-in slide-in-from-right-4 duration-500">
                            <div className="text-center space-y-4 pt-4 pb-8">
                                <div className="mx-auto w-16 h-16 bg-accent-blue/10 rounded-2xl flex items-center justify-center mb-2">
                                    <Sparkles className="h-8 w-8 text-accent-blue" />
                                </div>
                                <h2 className="text-4xl font-serif font-bold text-text-primary tracking-tight">
                                    Welcome to Nimi
                                </h2>
                                <p className="text-lg text-text-secondary max-w-md mx-auto">
                                    Let's personalize your experience. We'll ask a few questions to understand your health profile.
                                </p>
                            </div>
                            <div className="space-y-6 pt-4 px-2">
                                <div className="grid grid-cols-1 gap-4">
                                    {[
                                        { icon: HeartPulse, title: "Personalized Insights", desc: "Get advice tailored to your specific metrics." },
                                        { icon: Activity, title: "Risk Monitoring", desc: "Track potential health risks before they develop." },
                                        { icon: Stethoscope, title: "Lab Support", desc: "Understand your blood tests in plain language." },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-start gap-4 p-5 rounded-xl bg-surface-raised border border-border hover:border-accent-blue/30 transition-colors">
                                            <div className="mt-1 p-2 bg-accent-blue/10 rounded-lg border border-border text-accent-blue">
                                                <item.icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-text-primary">{item.title}</h4>
                                                <p className="text-sm text-text-secondary">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8 pb-4">
                            <div className="space-y-2">
                                <h2 className="text-2xl font-serif font-bold text-text-primary flex items-center gap-2">
                                    <Scale className="h-6 w-6 text-accent-blue" />
                                    Physical Metrics
                                </h2>
                                <p className="text-text-secondary">Enter your current height and weight for BMI calculations.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-2">
                                <div className="space-y-3">
                                    <Label htmlFor="height" className="section-label">Height (cm)</Label>
                                    <div className="relative">
                                        <Input
                                            id="height"
                                            type="number"
                                            placeholder="175"
                                            value={formData.heightCm || ""}
                                            onChange={(e) => setFormData(prev => ({ ...prev, heightCm: Number(e.target.value) }))}
                                            className="input h-14 text-2xl font-bold px-6"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted uppercase tracking-widest">cm</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="weight" className="section-label">Weight (kg)</Label>
                                    <div className="relative">
                                        <Input
                                            id="weight"
                                            type="number"
                                            placeholder="70"
                                            value={formData.weightKg || ""}
                                            onChange={(e) => setFormData(prev => ({ ...prev, weightKg: Number(e.target.value) }))}
                                            className="input h-14 text-2xl font-bold px-6"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted uppercase tracking-widest">kg</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8 pb-4">
                            <div className="space-y-2">
                                <h2 className="text-2xl font-serif font-bold text-text-primary flex items-center gap-2">
                                    <Stethoscope className="h-6 w-6 text-accent-blue" />
                                    Health History
                                </h2>
                                <p className="text-text-secondary">Select any existing conditions or family history.</p>
                            </div>
                            <div className="space-y-6 px-2">
                                <div className="space-y-4">
                                    <Label className="section-label">Existing Conditions</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {conditionsOptions.map((cond) => (
                                            <button
                                                key={cond}
                                                onClick={() => toggleCondition(cond)}
                                                className={`p-5 rounded-xl border text-sm font-bold transition-all text-left flex items-center justify-between group active:scale-[0.98] ${formData.existingConditions.includes(cond)
                                                    ? "bg-accent-blue border-accent-blue text-white shadow-md shadow-accent-blue/20"
                                                    : "bg-surface-raised border-border text-text-secondary hover:border-text-muted"
                                                    }`}
                                            >
                                                {cond}
                                                {formData.existingConditions.includes(cond) && <CheckCircle2 className="h-4 w-4" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8 pb-4">
                            <div className="space-y-2">
                                <h2 className="text-2xl font-serif font-bold text-text-primary flex items-center gap-2">
                                    <Activity className="h-6 w-6 text-accent-blue" />
                                    Lifestyle & Goals
                                </h2>
                                <p className="text-text-secondary">Help us understand your day-to-day habits.</p>
                            </div>
                            <div className="space-y-8 px-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <Label className="section-label">Physical Activity</Label>
                                        <Select
                                            value={formData.lifestyle.physicalActivityLevel}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, physicalActivityLevel: v } }))}
                                        >
                                            <SelectTrigger className="input h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface border-border text-text-primary">
                                                <SelectItem value="SEDENTARY">Sedentary (Office worker)</SelectItem>
                                                <SelectItem value="MODERATE">Moderate (Active daily)</SelectItem>
                                                <SelectItem value="ATHLETIC">Athletic (Regular Sports)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="section-label">Stress Level (1-10)</Label>
                                        <div className="flex items-center gap-6 pt-2">
                                            <input
                                                type="range"
                                                min="1"
                                                max="10"
                                                value={formData.lifestyle.stressLevel}
                                                onChange={(e) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, stressLevel: Number(e.target.value) } }))}
                                                className="h-1.5 flex-1 appearance-none bg-border rounded-lg accent-accent-blue cursor-pointer"
                                            />
                                            <span className="w-10 h-10 flex items-center justify-center rounded-lg bg-accent-blue/10 font-bold text-accent-blue text-lg">{formData.lifestyle.stressLevel}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="section-label">Diet Type</Label>
                                        <Select
                                            value={formData.lifestyle.dietType}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, dietType: v } }))}
                                        >
                                            <SelectTrigger className="input h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface border-border text-text-primary">
                                                <SelectItem value="BALANCED">Balanced</SelectItem>
                                                <SelectItem value="VEGETARIAN">Vegetarian</SelectItem>
                                                <SelectItem value="VEGAN">Vegan</SelectItem>
                                                <SelectItem value="KETO">Keto / Low Carb</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="section-label">Smoking Status</Label>
                                        <Select
                                            value={formData.lifestyle.smokingStatus}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, smokingStatus: v } }))}
                                        >
                                            <SelectTrigger className="input h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface border-border text-text-primary">
                                                <SelectItem value="NEVER">Never</SelectItem>
                                                <SelectItem value="FORMER">Former smoker</SelectItem>
                                                <SelectItem value="CURRENT">Current smoker</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center px-4 py-8 border-t border-border mt-8">
                        <button
                            type="button"
                            onClick={prevStep}
                            disabled={step === 1 || loading}
                            className="btn-secondary flex items-center justify-center h-12 px-6 disabled:opacity-30 disabled:pointer-events-none"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </button>

                        {step < totalSteps ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="btn-primary flex items-center justify-center h-12 px-10 group shadow-lg active:scale-[0.98]"
                            >
                                Continue
                                <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleComplete}
                                disabled={loading}
                                className="btn-primary flex items-center justify-center h-12 px-10 shadow-lg active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Complete Setup"}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
    </div >
    )
}
