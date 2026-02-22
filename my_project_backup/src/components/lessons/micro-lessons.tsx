"use client"

import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"
import { BookOpen, Loader2, Clock, Globe, Share2 } from "lucide-react"
import { API_BASE_URL, API_HEADERS } from "@/lib/api-config"
import { LessonResponse, MicroLesson } from "@/types/api"

const TOPICS = [
  "Blood Sugar Control",
  "Salt & Blood Pressure",
  "Stress Management",
  "Effective Exercise",
  "Medication Adherence"
]

export function MicroLessons() {
  const { profile } = useProfile()
  const [loading, setLoading] = useState(false)
  const [lesson, setLesson] = useState<MicroLesson | null>(null)

  const fetchLesson = async (topic?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/lesson`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ topic, userProfile: profile })
      })
      const data: LessonResponse = await res.json()
      if (data.success) {
        setLesson(data.microLesson)
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
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((topic) => (
          <button
            key={topic}
            onClick={() => fetchLesson(topic)}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-[#8A8F98] text-xs font-semibold hover:border-[#5E6AD2]/50 hover:text-white transition-all disabled:opacity-50 shadow-sm"
          >
            {topic}
          </button>
        ))}
      </div>

      {!lesson && !loading && (
        <div className="glass-card p-6 sm:p-12 flex flex-col items-center text-center space-y-6">
          <BookOpen className="h-12 w-12 text-[#5E6AD2]/50" />
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white tracking-tight">Personalized Learning Lab</h3>
            <p className="text-[#8A8F98] max-w-sm">Select a topic above to generate a bite-sized, personalized health lesson tailored to your profile.</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="glass-card p-6 sm:p-12 flex flex-col items-center text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#5E6AD2]" />
          <p className="text-sm font-mono tracking-widest text-[#8A8F98] uppercase animate-pulse">Curating your lesson...</p>
        </div>
      )}

      {lesson && !loading && (
        <div className="glass-card p-6 sm:p-8 lg:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <BookOpen className="h-32 w-32" />
          </div>

          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="px-2 py-0.5 rounded-full bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 text-[10px] font-bold text-[#5E6AD2] uppercase tracking-wider">
                {lesson.category}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8A8F98]">
                <Clock className="h-3 w-3" />
                {Math.ceil(lesson.readTimeSecs / 60)} min read
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
              {lesson.title}
            </h2>
          </div>

          <div className="space-y-6 relative z-10">
            <p className="text-[#EDEDEF]/80 text-base sm:text-lg leading-relaxed font-normal">
              {lesson.content}
            </p>
          </div>

          <footer className="pt-8 border-t border-white/5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/[0.03] rounded-lg">
                <Globe className="h-4 w-4 text-[#8A8F98]" />
              </div>
              <span className="text-xs text-[#8A8F98]">{lesson.sourceNote}</span>
            </div>
            <button className="p-2 text-[#8A8F98] hover:text-white transition-colors">
              <Share2 className="h-4 w-4" />
            </button>
          </footer>
        </div>
      )}
    </div>
  )
}
