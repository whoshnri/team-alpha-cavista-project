
"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserProfile, useProfile } from "@/hooks/use-profile"
import { User, ShieldPlus, LogOut, Ruler, Weight, Calculator } from "lucide-react"

export function ProfileDialog() {
  const { profile, user, updateProfile, logout } = useProfile()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<UserProfile>(profile)
  const [saving, setSaving] = useState(false)

  // Sync form data when profile loads from DB
  useEffect(() => {
    if (profile && Object.keys(profile).length > 0) {
      setFormData(profile)
    }
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    const success = await updateProfile(formData)
    if (success) setOpen(false)
    setSaving(false)
  }

  // Auto-compute BMI when height/weight change
  const computedBmi = (formData.heightCm && formData.weightKg)
    ? Number((formData.weightKg / ((formData.heightCm / 100) ** 2)).toFixed(1))
    : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 text-[#505050] hover:text-white group text-left">
          <User className="h-4 w-4" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold uppercase tracking-wide truncate">{user?.fullName || "Personnel Profile"}</div>
            <div className="text-[10px] opacity-60 leading-none mt-1 font-mono">{user?.phoneNumber || "SECURE_ID"}</div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-black border-border text-white rounded-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white uppercase tracking-tighter">
            Health Profile
          </DialogTitle>
        </DialogHeader>

        {/* User info header */}
        {user && (
          <div className="p-6 bg-black border border-border mt-4 mb-2">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 border border-border flex items-center justify-center text-white font-bold text-xl uppercase">
                {user.fullName?.charAt(0) || "?"}
              </div>
              <div className="space-y-1">
                <p className="font-bold text-white uppercase tracking-tight">{user.fullName}</p>
                <p className="text-[10px] text-[#505050] font-mono">{user.phoneNumber}</p>
                <div className="flex gap-2">
                  <span className="section-label">{user.gender}</span>
                  <span className="section-label">{profile.age ? `${profile.age} YRS` : 'AGE_PENDING'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5 py-2">
          {/* Vitals */}
          <div className="space-y-4">
            <Label className="section-label">Biological Metrics</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase tracking-widest font-bold">Height (cm)</Label>
                <Input
                  type="number"
                  value={formData.heightCm || ""}
                  onChange={(e) => setFormData({ ...formData, heightCm: parseFloat(e.target.value) || undefined })}
                  className="bg-black border-border text-white text-sm font-mono h-10 rounded-none focus:border-white transition-all shadow-none"
                  placeholder="170"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase tracking-widest font-bold">Weight (kg)</Label>
                <Input
                  type="number"
                  value={formData.weightKg || ""}
                  onChange={(e) => setFormData({ ...formData, weightKg: parseFloat(e.target.value) || undefined })}
                  className="bg-black border-border text-white text-sm font-mono h-10 rounded-none focus:border-white transition-all shadow-none"
                  placeholder="70"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase tracking-widest font-bold">BMI</Label>
                <div className="h-10 flex items-center px-4 bg-black border border-border text-sm font-mono text-white">
                  {computedBmi || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Lifestyle */}
          <div className="space-y-4">
            <Label className="section-label">Lifestyle Parameters</Label>
            <div className="grid grid-cols-2 gap-4 p-6 border border-border bg-black">
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Activity</Label>
                <Select
                  value={formData.lifestyle?.physicalActivityLevel || ""}
                  onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, physicalActivityLevel: val } })}
                >
                  <SelectTrigger className="bg-black border-border text-white h-9 text-xs rounded-none">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-border text-white">
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Stress (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.lifestyle?.stressLevel || ""}
                  onChange={(e) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, stressLevel: parseInt(e.target.value) } })}
                  className="bg-black border-border text-white h-9 text-xs rounded-none font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Smoking</Label>
                <Select
                  value={formData.lifestyle?.smokingStatus || ""}
                  onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, smokingStatus: val } })}
                >
                  <SelectTrigger className="bg-black border-border text-white h-9 text-xs rounded-none">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-border text-white">
                    <SelectItem value="non-smoker">Non-smoker</SelectItem>
                    <SelectItem value="ex-smoker">Ex-smoker</SelectItem>
                    <SelectItem value="smoker">Smoker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Diet</Label>
                <Select
                  value={formData.lifestyle?.dietType || ""}
                  onValueChange={(val) => setFormData({ ...formData, lifestyle: { ...formData.lifestyle, dietType: val } })}
                >
                  <SelectTrigger className="bg-black border-border text-white h-9 text-xs rounded-none">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-border text-white">
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="high-fat">High-fat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Medical Context */}
          <div className="space-y-4 pt-4">
            <Label className="section-label">Medical History</Label>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Existing Conditions</Label>
                <Input
                  placeholder="e.g. Type 2 Diabetes, Hypertension"
                  value={formData.existingConditions?.join(", ") || ""}
                  onChange={(e) => setFormData({ ...formData, existingConditions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  className="bg-black border-border text-white text-sm rounded-none focus:border-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-[#a0a0a0] uppercase font-bold tracking-widest">Family History</Label>
                <Input
                  placeholder="e.g. Heart disease, Stroke"
                  value={formData.familyHistory?.join(", ") || ""}
                  onChange={(e) => setFormData({ ...formData, familyHistory: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  className="bg-black border-border text-white text-sm rounded-none focus:border-white transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center gap-4 pt-10">
          <div className="flex gap-4">
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-[#505050] hover:text-white uppercase tracking-widest transition-colors"
            >
              Cancel
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="button-primary px-8"
          >
            {saving ? "SYNCING..." : "SAVE"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
