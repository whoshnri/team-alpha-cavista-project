"use client"

import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"
import { FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { LabInterpretation } from "@/types/api"
import { useEndpoints } from "@/hooks/use-endpoints"

export function LabInterpreter() {
  const { profile } = useProfile()
  const { interpretLab } = useEndpoints()
  const [labText, setLabText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LabInterpretation | null>(null)


  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'NORMAL': return "border-accent-blue text-accent-blue"
      case 'BORDERLINE': return "border-warning text-warning"
      case 'CONCERNING': return "border-destructive text-destructive"
      default: return "border-border text-text-muted"
    }
  }

  const handleInterprete = async () => {
    if (!labText.trim()) return
    setLoading(true)
    try {
      const data = await interpretLab(labText)
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

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <div className="card bg-background">

        <textarea
          value={labText}
          onChange={(e) => setLabText(e.target.value)}
          placeholder="Paste your lab results here..."
          className="w-full h-64 bg-surface border border-border p-6 text-sm font-mono focus:border-accent-blue transition-all text-text-primary placeholder:text-text-muted opacity-80 resize-none outline-none rounded-lg"
        />

        <div className="pt-8">
          <button
            onClick={handleInterprete}
            disabled={loading || !labText.trim()}
            className="btn-primary w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 text-white animate-spin" />
                Analyzing...
              </span>
            ) : (
              "Analyze Biometrics"
            )}
          </button>
        </div>
        <p className="text-xs text-text-secondary mt-4 p-3 bg-yellow-500/10 rounded-lg">We use your lab results to improve your personalized health profile. This makes us better at providing you with personalized health insights and recommendations.</p>
      </div>

      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card bg-background">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
              <div className="flex items-center gap-3">
                <div className="p-2 border border-border bg-surface rounded-lg">
                  <FileText className="h-5 w-5 text-text-primary" />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-tighter">{result.testName}</h3>
              </div>
              <div className={cn(
                "px-3 py-1 text-[10px] font-bold uppercase tracking-widest border rounded-md",
                getStatusClasses(result.overallStatus)
              )}>
                {result.overallStatus}
              </div>
            </div>

            <div className="border-l-2 border-border pl-6 space-y-4">
              <p className="section-label">Summary</p>
              <p className="text-text-primary text-[13px] ">
                {result.plainSummary}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {result.biomarkers.map((bio, i) => (
              <div key={i} className="card bg-background flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">Biomarker</div>
                  <div className="text-sm font-bold text-text-primary uppercase tracking-tight mb-6">{bio.name}</div>

                  <div className="flex items-baseline gap-2 mb-2">
                    <div className="text-3xl font-bold text-text-primary font-mono">
                      {bio.value}
                    </div>
                    <div className="section-label">{bio.unit}</div>
                  </div>
                  {bio.referenceMin !== undefined && (
                    <div className="text-[10px] text-text-muted font-mono mb-6">
                      REF: {bio.referenceMin}-{bio.referenceMax}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-border mt-4">
                  <div className={cn(
                    "inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border mb-4 rounded-md",
                    getStatusClasses(bio.status)
                  )}>
                    {bio.status}
                  </div>

                  <p className="text-[11px] text-text-secondary ">
                    {bio.flagNote}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="card bg-background space-y-8">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">AI Diagnostic Directives</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-6 p-6 border border-border bg-surface text-xs text-text-secondary  rounded-lg">
                  <div className="h-5 w-5 shrink-0 border border-border flex items-center justify-center text-text-primary font-bold text-[10px] rounded-md">
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
