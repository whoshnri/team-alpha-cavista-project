"use client"

import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"
import { FileText, Loader2, Sparkles, Activity, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { API_BASE_URL, API_HEADERS } from "@/lib/api-config"
import { LabResponse, LabInterpretation, ParsedBiomarker } from "@/types/api"

export function LabInterpreter() {
  const { profile } = useProfile()
  const [labText, setLabText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LabInterpretation | null>(null)

  // another production hook to be added
  const interpretLab = async () => {
    if (!labText.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/lab`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ labText, userProfile: profile })
      })
      const data: LabResponse = await res.json()
      if (data.success) {
        setResult(data.labInterpretation)
      } else {
        console.error(data.error)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'NORMAL': return "border-white text-white"
      case 'BORDERLINE': return "border-[#505050] text-[#505050]"
      case 'CONCERNING': return "border-[#ff4444] text-[#ff4444]"
      default: return "border-border text-[#505050]"
    }
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <div className="card-overhaul bg-black">
        <div className="space-y-4 mb-8">
          <p className="section-label">Input Data Terminal</p>
          <p className="text-xs text-[#a0a0a0] leading-relaxed">Paste raw biomarker strings or laboratory exports for high-resolution processing.</p>
        </div>

        <textarea
          value={labText}
          onChange={(e) => setLabText(e.target.value)}
          placeholder="E.G., HBA1C: 6.5%, CHOLESTEROL: 210 MG/DL..."
          className="w-full h-64 bg-black border border-border p-6 text-sm font-mono focus:border-white transition-all text-white placeholder:text-[#333] resize-none outline-none"
        />

        <div className="pt-8">
          <button
            onClick={interpretLab}
            disabled={loading || !labText.trim()}
            className="button-primary w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-black loading-pulse" />
                Processing
              </span>
            ) : (
              "Analyze Biometrics"
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card-overhaul bg-black">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
              <div className="flex items-center gap-3">
                <div className="p-2 border border-border bg-black">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-tighter">{result.testName}</h3>
              </div>
              <div className={cn(
                "px-3 py-1 text-[10px] font-bold uppercase tracking-widest border",
                getStatusClasses(result.overallStatus)
              )}>
                {result.overallStatus}
              </div>
            </div>

            <div className="border-l-2 border-border pl-6 space-y-4">
              <p className="section-label">Summary</p>
              <p className="text-white text-[13px] leading-relaxed">
                {result.plainSummary}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {result.biomarkers.map((bio, i) => (
              <div key={i} className="card-overhaul bg-black flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-[#505050] uppercase tracking-widest mb-4">Biomarker</div>
                  <div className="text-sm font-bold text-white uppercase tracking-tight mb-6">{bio.name}</div>

                  <div className="flex items-baseline gap-2 mb-2">
                    <div className="text-3xl font-bold text-white font-mono">
                      {bio.value}
                    </div>
                    <div className="section-label">{bio.unit}</div>
                  </div>
                  {bio.referenceMin !== undefined && (
                    <div className="text-[10px] text-[#505050] font-mono mb-6">
                      REF: {bio.referenceMin}-{bio.referenceMax}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-border mt-4">
                  <div className={cn(
                    "inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border mb-4",
                    getStatusClasses(bio.status)
                  )}>
                    {bio.status}
                  </div>

                  <p className="text-[11px] text-[#a0a0a0] leading-relaxed">
                    {bio.flagNote}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="card-overhaul bg-black space-y-8">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">AI Diagnostic Directives</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-6 p-6 border border-border bg-black text-xs text-[#a0a0a0] leading-relaxed">
                  <div className="h-5 w-5 shrink-0 border border-border flex items-center justify-center text-white font-bold text-[10px]">
                    {i + 1}
                  </div>
                  {rec}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
