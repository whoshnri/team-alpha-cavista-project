"use client"

import { ToolRequest } from "@/types/api"
import { MapPin, Camera, HeartPulse, FileText } from "lucide-react"
import type { RefObject, Ref } from "react"

export const renderToolPrompt = (toolRequest: ToolRequest, onYesClick: (req: any) => void, onNoClick: (req: any) => void, onChange: (req: any) => void, ref: Ref<HTMLInputElement> | null) => {
  const isClinics = toolRequest.tool === 'nearby_clinics'
  const isVision = toolRequest.tool === 'vision_analysis'
  const isLab = toolRequest.tool === 'lab_interpretation'
  const title = isClinics ? "Nearby Clinics Recommended" :
    isVision ? "Photo Analysis Requested" :
      isLab ? "Lab Interpretation" : "Health Check Recommended"
  const typeLabel = isClinics ? "Location Search" :
    isVision ? "AI Vision Diagnostic" :
      isLab ? "Biometric Analysis" : "AI-Requested Diagnostic"
  const Icon = isClinics ? MapPin : isVision ? Camera : isLab ? FileText : HeartPulse
  const actionLabel = isClinics ? "Allow Clinic Search" :
    isVision ? "Upload & Analyze Photo" :
      isLab ? "Enter Lab Results" : "Run Heart Check"

  return (
    <div className="flex flex-col items-start w-full">
      <div className="w-full card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 border border-border rounded-lg bg-background">
            <Icon className="h-5 w-5 text-text-primary" />
          </div>
          <div>
            <p className="section-label mb-0.5">{typeLabel}</p>
            <h4 className="text-sm font-bold text-text-primary">{title}</h4>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed mb-8">{toolRequest.reason}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onYesClick}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {actionLabel}
          </button>
          <button
            onClick={onNoClick}
            className="btn-secondary"
          >
            Skip
          </button>
        </div>
      </div>
      <input
        type="file"
        ref={ref}
        className="hidden"
        accept="image/*"
        onChange={onChange}
      />
    </div>
  )
}
