"use client"

import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Activity, Loader2, Sparkles, ShieldAlert, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { API_BASE_URL, API_HEADERS } from "@/lib/api-config"
import { RiskResponse, RiskScores } from "@/types/api"

export function RiskAssessment() {
  const { profile } = useProfile()
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState<RiskScores | null>(null)

  const fetchRisk = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/risk`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ userProfile: profile })
      })
      const data: RiskResponse = await res.json()
      if (data.success) {
        setScores(data.riskScores)
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {!scores && (
        <div className="glass-card p-6 sm:p-12 flex flex-col items-center text-center space-y-6">
          <div className="p-4 bg-[#5E6AD2]/10 rounded-2xl">
            <Activity className="h-12 w-12 text-[#5E6AD2]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Calculate Your NCD Risk</h2>
            <p className="text-[#8A8F98] max-w-md">Our AI analyzes your profile data and current biomarkers to assess risks for cardiovascular disease, diabetes, and other non-communicable diseases.</p>
          </div>
          <button
            onClick={fetchRisk}
            disabled={loading}
            className="h-12 px-8 bg-[#5E6AD2] hover:bg-[#6872D9] text-white font-semibold rounded-xl transition-all -[0_0_20px_rgba(94,106,210,0.3)] flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Assessment"}
          </button>
        </div>
      )}

      {scores && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
              <div className="text-[10px] font-mono tracking-widest text-[#8A8F98] uppercase">Overall Risk Level</div>
              <div className={cn(
                "text-5xl font-black bg-clip-text text-transparent bg-gradient-to-b",
                scores.overallLevel === 'LOW' ? "from-emerald-400 to-emerald-600" :
                  scores.overallLevel === 'MODERATE' ? "from-yellow-400 to-yellow-600" :
                    "from-orange-400 to-red-600"
              )}>
                {scores.overallLevel}
              </div>
              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden -inner max-w-xs mx-auto">
                <div
                  className={cn(
                    "h-full transition-all duration-1000",
                    scores.overallLevel === 'LOW' ? "bg-emerald-500" :
                      scores.overallLevel === 'MODERATE' ? "bg-yellow-500" :
                        "bg-orange-500"
                  )}
                  style={{ width: `${scores.overall * 100}%` }}
                />
              </div>
            </div>

            <div className="glass-card p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#8A8F98] uppercase">
                <TrendingUp className="h-3 w-3" />
                Risk Breakdown
              </div>
              <div className="space-y-5">
                {[
                  { label: "Diabetes", value: scores.diabetes },
                  { label: "Hypertension", value: scores.hypertension },
                  { label: "Cardiovascular", value: scores.cardiovascular }
                ].map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#EDEDEF]">{item.label}</span>
                      <span className="text-xs font-mono text-[#8A8F98]">{Math.round(item.value * 100)}%</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                      <div className="h-full bg-white/20 transition-all duration-1000" style={{ width: `${item.value * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 text-[#8A8F98]">
                <ShieldAlert className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-widest">Contributing Factors</h3>
              </div>
              <div className="space-y-3">
                {scores.topFactors.map((factor, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-[#8A8F98]">
                    <span className="text-[#5E6AD2] mt-1">•</span>
                    {factor}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 text-[#5E6AD2]">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-lg font-bold text-white tracking-tight">AI Recommendations</h3>
              </div>
              <div className="space-y-3">
                {scores.recommendations.map((rec, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-[#8A8F98] leading-relaxed hover:bg-white/[0.05] transition-colors">
                    <div className="h-5 w-5 shrink-0 rounded-full bg-[#5E6AD2]/10 flex items-center justify-center text-[#5E6AD2] font-bold text-[10px]">
                      {i + 1}
                    </div>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
