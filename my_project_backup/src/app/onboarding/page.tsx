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
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl space-y-8 animate-in fade-in duration-700">
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-[#8A8F98]">
                        <span className="font-medium">Step {step} of {totalSteps}</span>
                        <span className="font-medium text-[#5E6AD2] capitalize">{["Welcome", "Vitals", "History", "Lifestyle"][step - 1]}</span>
                    </div>
                    <Progress value={progress} className="h-1.5 bg-white/5" />
                </div>

                <Card className="glass-card border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                    {/* Decorative gradients */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#5E6AD2]/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

                    {step === 1 && (
                        <div className="animate-in slide-in-from-right-4 duration-500">
                            <CardHeader className="text-center space-y-4 pt-8">
                                <div className="mx-auto w-16 h-16 bg-[#5E6AD2]/10 rounded-2xl flex items-center justify-center mb-2">
                                    <Sparkles className="h-8 w-8 text-[#5E6AD2]" />
                                </div>
                                <CardTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                                    Welcome to PreventIQ
                                </CardTitle>
                                <CardDescription className="text-lg max-w-md mx-auto">
                                    Let's personalize your experience. We'll ask a few questions to understand your health profile.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                                <div className="grid grid-cols-1 gap-4">
                                    {[
                                        { icon: HeartPulse, title: "Personalized Insights", desc: "Get advice tailored to your specific metrics." },
                                        { icon: Activity, title: "Risk Monitoring", desc: "Track potential health risks before they develop." },
                                        { icon: Stethoscope, title: "Lab Support", desc: "Understand your blood tests in plain language." },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                                            <div className="mt-1 p-2 bg-white/5 rounded-lg text-[#5E6AD2]">
                                                <item.icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-white">{item.title}</h4>
                                                <p className="text-sm text-[#8A8F98]">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in slide-in-from-right-4 duration-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Scale className="h-5 w-5 text-[#5E6AD2]" />
                                    Physical Metrics
                                </CardTitle>
                                <CardDescription>Enter your current height and weight for BMI calculations.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8 pt-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <Label htmlFor="height" className="text-lg font-medium">Height (cm)</Label>
                                        <div className="relative">
                                            <Input
                                                id="height"
                                                type="number"
                                                placeholder="175"
                                                value={formData.heightCm || ""}
                                                onChange={(e) => setFormData(prev => ({ ...prev, heightCm: Number(e.target.value) }))}
                                                className="bg-white/5 border-white/10 h-16 text-2xl px-6 rounded-2xl focus:ring-[#5E6AD2]/50"
                                            />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm text-[#8A8F98] uppercase">cm</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <Label htmlFor="weight" className="text-lg font-medium">Weight (kg)</Label>
                                        <div className="relative">
                                            <Input
                                                id="weight"
                                                type="number"
                                                placeholder="70"
                                                value={formData.weightKg || ""}
                                                onChange={(e) => setFormData(prev => ({ ...prev, weightKg: Number(e.target.value) }))}
                                                className="bg-white/5 border-white/10 h-16 text-2xl px-6 rounded-2xl focus:ring-[#5E6AD2]/50"
                                            />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm text-[#8A8F98] uppercase">kg</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in slide-in-from-right-4 duration-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Stethoscope className="h-5 w-5 text-[#5E6AD2]" />
                                    Health History
                                </CardTitle>
                                <CardDescription>Select any existing conditions or family history.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium uppercase tracking-wider text-[#8A8F98]">Existing Conditions</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {conditionsOptions.map((cond) => (
                                            <button
                                                key={cond}
                                                onClick={() => toggleCondition(cond)}
                                                className={`p-4 rounded-xl border text-sm font-medium transition-all text-left flex items-center justify-between group ${formData.existingConditions.includes(cond)
                                                    ? "bg-[#5E6AD2] border-[#5E6AD2] text-white"
                                                    : "bg-white/5 border-white/10 text-[#8A8F98] hover:border-white/20"
                                                    }`}
                                            >
                                                {cond}
                                                {formData.existingConditions.includes(cond) && <CheckCircle2 className="h-4 w-4" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="animate-in slide-in-from-right-4 duration-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-[#5E6AD2]" />
                                    Lifestyle & Goals
                                </CardTitle>
                                <CardDescription>Help us understand your day-to-day habits.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Physical Activity</Label>
                                        <Select
                                            value={formData.lifestyle.physicalActivityLevel}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, physicalActivityLevel: v } }))}
                                        >
                                            <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0A0A0B] border-white/10">
                                                <SelectItem value="SEDENTARY">Sedentary (Office worker)</SelectItem>
                                                <SelectItem value="MODERATE">Moderate (Active daily)</SelectItem>
                                                <SelectItem value="ATHLETIC">Athletic (Regular Sports)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Stress Level (1-10)</Label>
                                        <div className="flex items-center gap-4">
                                            <Input
                                                type="range"
                                                min="1"
                                                max="10"
                                                value={formData.lifestyle.stressLevel}
                                                onChange={(e) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, stressLevel: Number(e.target.value) } }))}
                                                className="h-1.5 flex-1 appearance-none bg-white/10 rounded-lg"
                                            />
                                            <span className="w-8 text-center font-bold text-[#5E6AD2]">{formData.lifestyle.stressLevel}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Diet Type</Label>
                                        <Select
                                            value={formData.lifestyle.dietType}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, dietType: v } }))}
                                        >
                                            <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0A0A0B] border-white/10">
                                                <SelectItem value="BALANCED">Balanced</SelectItem>
                                                <SelectItem value="VEGETARIAN">Vegetarian</SelectItem>
                                                <SelectItem value="VEGAN">Vegan</SelectItem>
                                                <SelectItem value="KETO">Keto / Low Carb</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Smoking Status</Label>
                                        <Select
                                            value={formData.lifestyle.smokingStatus}
                                            onValueChange={(v) => setFormData(p => ({ ...p, lifestyle: { ...p.lifestyle, smokingStatus: v } }))}
                                        >
                                            <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0A0A0B] border-white/10">
                                                <SelectItem value="NEVER">Never</SelectItem>
                                                <SelectItem value="FORMER">Former smoker</SelectItem>
                                                <SelectItem value="CURRENT">Current smoker</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    )}

                    <CardFooter className="flex justify-between items-center bg-white/[0.02] p-6 border-t border-white/5 rounded-b-2xl">
                        <Button
                            variant="ghost"
                            onClick={prevStep}
                            disabled={step === 1 || loading}
                            className="text-[#8A8F98] hover:text-white"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>

                        {step < totalSteps ? (
                            <Button
                                onClick={nextStep}
                                className="bg-[#5E6AD2] hover:bg-[#6872D9] text-white px-8 rounded-xl h-12 group shadow-lg shadow-[#5E6AD2]/10"
                            >
                                Continue
                                <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleComplete}
                                disabled={loading}
                                className="bg-[#5E6AD2] hover:bg-[#6872D9] text-white px-8 rounded-xl h-12 shadow-lg shadow-[#5E6AD2]/10"
                            >
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Complete Setup"}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
