"use client"

import { useState, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { User, ShieldPlus, LogOut, Ruler, Weight, Calculator, Bell, Trash2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function SettingsView() {
    const { profile, user, updateProfile, deleteAccount, logout } = useProfile()
    const [formData, setFormData] = useState(profile)
    const [saving, setSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Sync form data when profile loads from DB
    useEffect(() => {
        if (profile && Object.keys(profile).length > 0) {
            setFormData(profile)
        }
    }, [profile])

    const handleSave = async () => {
        setSaving(true)
        await updateProfile(formData)
        setSaving(false)
    }

    const handleDeleteAccount = async () => {
        await deleteAccount()
    }

    // Auto-compute BMI when height/weight change
    const computedBmi = (formData.heightCm && formData.weightKg)
        ? Number((formData.weightKg / ((formData.heightCm / 100) ** 2)).toFixed(1))
        : undefined

    return (
        <div className="space-y-12 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* User Header */}
            <section className="card bg-background">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="h-20 w-20 border border-border flex items-center justify-center text-text-primary font-base text-3xl capitalize rounded-2xl bg-surface shadow-sm">
                        {user?.fullName?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h3 className="text-2xl font-serif text-text-primary ">{user?.fullName || "Agent Profile"}</h3>
                        <div className="flex flex-wrap justify-center md:justify-start gap-3">
                            <span className="section-label bg-surface border-border text-text-muted">{user?.phoneNumber}</span>
                            <span className="section-label bg-accent-blue/5 border-accent-blue/20 text-accent-blue font-base">{user?.gender?.toUpperCase()}</span>
                            <span className="section-label border-border text-text-muted font-bold">{profile.age ? `${profile.age} YEARS` : 'AGE PENDING'}</span>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Left Column: Metrics & Health */}
                <div className="lg:col-span-2 space-y-12">
                    {/* Vitals */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2">

                            <Label className="text-lg font-bold text-text-primary capitalize ">Biological Metrics</Label>
                        </div>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Height (cm)</Label>
                                <Input
                                    type="number"
                                    value={formData.heightCm || ""}
                                    onChange={(e) => setFormData({ ...formData, heightCm: parseFloat(e.target.value) || undefined })}
                                    className="bg-surface border-border text-text-primary h-12 rounded-lg font-mono focus:border-accent-blue transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Weight (kg)</Label>
                                <Input
                                    type="number"
                                    value={formData.weightKg || ""}
                                    onChange={(e) => setFormData({ ...formData, weightKg: parseFloat(e.target.value) || undefined })}
                                    className="bg-surface border-border text-text-primary h-12 rounded-lg font-mono focus:border-accent-blue transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Computed BMI</Label>
                                <div className="h-12 flex items-center px-4 bg-surface-raised border border-border text-sm font-mono text-text-primary rounded-lg opacity-60">
                                    {computedBmi || "—"}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Lifestyle */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2">

                            <Label className="text-lg font-bold text-text-primary capitalize ">Lifestyle Tuning</Label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-surface rounded-2xl">
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Activity Level</Label>
                                <Select
                                    value={formData.lifestyle?.physicalActivityLevel || ""}
                                    onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, physicalActivityLevel: val } })}
                                >
                                    <SelectTrigger className="bg-background border-border text-text-primary h-10 rounded-lg">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface border-border text-text-primary">
                                        <SelectItem value="sedentary">Sedentary</SelectItem>
                                        <SelectItem value="moderate">Moderate</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Stress Tolerance (1-10)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={formData.lifestyle?.stressLevel || ""}
                                    onChange={(e) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, stressLevel: parseInt(e.target.value) } })}
                                    className="bg-background border-border text-text-primary h-10 rounded-lg font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Tobacco Usage</Label>
                                <Select
                                    value={formData.lifestyle?.smokingStatus || ""}
                                    onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, smokingStatus: val } })}
                                >
                                    <SelectTrigger className="bg-background border-border text-text-primary h-10 rounded-lg">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface border-border text-text-primary">
                                        <SelectItem value="non-smoker">Non-smoker</SelectItem>
                                        <SelectItem value="ex-smoker">Ex-smoker</SelectItem>
                                        <SelectItem value="smoker">Smoker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Nutrition Type</Label>
                                <Select
                                    value={formData.lifestyle?.dietType || ""}
                                    onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, dietType: val } })}
                                >
                                    <SelectTrigger className="bg-background border-border text-text-primary h-10 rounded-lg">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface border-border text-text-primary">
                                        <SelectItem value="mixed">Mixed</SelectItem>
                                        <SelectItem value="vegetarian">Vegetarian</SelectItem>
                                        <SelectItem value="high-fat">High-fat</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </section>

                    {/* Medical History */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2">

                            <Label className="text-lg font-bold text-text-primary capitalize ">Clinical Background</Label>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Current Conditions</Label>
                                <Input
                                    placeholder="e.g. Type 2 Diabetes, Hypertension"
                                    value={formData.existingConditions?.join(", ") || ""}
                                    onChange={(e) => setFormData({ ...formData, existingConditions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                                    className="bg-surface border-border text-text-primary h-12 rounded-lg focus:border-accent-blue transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-text-muted capitalize font-base ">Familial Predispositions</Label>
                                <Input
                                    placeholder="e.g. Cardiovascular history"
                                    value={formData.familyHistory?.join(", ") || ""}
                                    onChange={(e) => setFormData({ ...formData, familyHistory: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                                    className="bg-surface border-border text-text-primary h-12 rounded-lg focus:border-accent-blue transition-all"
                                />
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: App Settings & Actions */}
                <div className="space-y-12">
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Label className="text-sm font-bold text-text-primary capitalize ">Security & Management</Label>
                        </div>
                        <button
                            className="w-full flex items-center justify-between p-4 border border-border bg-surface hover:bg-destructive/5 hover:border-destructive/20 transition-all rounded-xl group"
                        >

                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm font-bold capitalize tracking-wide cursor-pointer" htmlFor="notif-toggle">Recieve Notifications</Label>
                                </div>
                            </div>
                            <Switch
                                id="notif-toggle"
                                className="bg-text-muted"
                                checked={formData.notificationsEnabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, notificationsEnabled: checked })}
                            />

                        </button>
                        <div className="space-y-4">
                            {showDeleteConfirm ? (
                                <div className="p-6 border border-destructive bg-destructive/5 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 transition-all">
                                    <div className="flex items-center gap-2 text-destructive">
                                        <AlertCircle className="w-4 h-4" />
                                        <span className="text-sm font-bold capitalize ">Permanent Deletion</span>
                                    </div>
                                    <p className="text-sm text-destructive leading-relaxed">This action is irreversible. All health logs and diagnostic history will be cleared.</p>
                                    <div className="flex gap-2">
                                        <Button variant="destructive" className="flex-1 h-9 text-sm capitalize font-bold" onClick={handleDeleteAccount}>Confirm Delete</Button>
                                        <Button variant="outline" className="flex-1 h-9 text-sm capitalize font-bold border-border bg-background" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full flex items-center justify-between p-4 border border-border bg-surface hover:bg-destructive/5 hover:border-destructive/20 transition-all rounded-xl group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Trash2 className="w-4 h-4 text-text-muted group-hover:text-destructive transition-colors" />
                                        <span className="text-sm font-bold capitalize  text-text-secondary group-hover:text-destructive transition-colors">Delete Account</span>
                                    </div>
                                </button>
                            )}

                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-between p-4 border border-border bg-surface hover:bg-surface-raised transition-all rounded-xl group"
                            >
                                <div className="flex items-center gap-3">
                                    <LogOut className="w-4 h-4 text-text-muted" />
                                    <span className="text-sm font-bold capitalize  text-text-secondary">Logout</span>
                                </div>
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
