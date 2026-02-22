"use client"

import { useState } from "react"
import { ChatWindow } from "@/components/chat/chat-window"
import { LabInterpreter } from "@/components/lab/lab-interpreter"
import { RiskAssessment } from "@/components/risk/risk-assessment"
import { MicroLessons } from "@/components/lessons/micro-lessons"
import { ProfileDialog } from "@/components/profile/profile-dialog"
import { HealthProfileView } from "@/components/profile/health-profile-view"
import { useProfile } from "@/hooks/use-profile"
import {
  MessageSquare,
  FileText,
  Activity,
  BookOpen,
  HeartPulse,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function Home() {
  const { user, profile, recentChats, logout } = useProfile()
  const [activeTab, setActiveTab] = useState("chat")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const navItems = [
    { id: 'chat', label: 'Assistant', icon: MessageSquare, description: 'Health Q&A' },
    { id: 'profile_detailed', label: 'Health Profile', icon: Activity, description: 'Neural Baseline' },
    { id: 'lab', label: 'Lab Reports', icon: FileText, description: 'Interpretation' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on lg+, toggle on mobile */}
      <aside
        className="fixed inset-y-0 left-0 z-50 w-72 bg-black border-r border-border transition-transform duration-300 ease-in-out lg:static lg:z-auto"
        style={{
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
        // On mobile (< lg), hide by default. On desktop, always visible via lg:static.
        // We use a data attribute + CSS to avoid tailwind-merge conflicts.
        data-open={sidebarOpen}
      >
        <style jsx>{`
          aside {
            transform: translateX(-100%);
          }
          aside[data-open="true"] {
            transform: translateX(0);
          }
          @media (min-width: 1024px) {
            aside {
              transform: none !important;
            }
          }
        `}</style>
        <div className="flex flex-col h-full">
          <div className="p-8 pb-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 border border-border rounded-lg bg-black">
                <HeartPulse className="text-white h-5 w-5" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white uppercase">
                PreventIQ
              </span>
            </div>
            {/* Close button — mobile only */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-muted-foreground hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="px-4 py-4 space-y-1">
            <div className="px-3 mb-6">
              <span className="section-label">Core Infrastructure</span>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id)
                    if (window.innerWidth < 1024) setSidebarOpen(false)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group text-left",
                    isActive
                      ? "bg-white text-black font-bold"
                      : "text-[#505050] hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="text-[13px] uppercase tracking-wide">{item.label}</div>
                  </div>
                  {isActive && <ChevronRight className="h-3 w-3 opacity-40" />}
                </button>
              )
            })}
          </nav>

          {/* Recent Chats */}
          <div className="flex-1 px-4 py-8 overflow-y-auto border-t border-border mt-4">
            <div className="px-3 mb-6 flex items-center justify-between">
              <span className="section-label">Recent History</span>
              <button
                onClick={() => {
                  setActiveSessionId(null)
                  setActiveTab('chat')
                  if (window.innerWidth < 1024) setSidebarOpen(false)
                }}
                className="text-[10px] text-white font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
              >
                New
              </button>
            </div>
            {recentChats && recentChats.length > 0 ? (
              <div className="space-y-1">
                {recentChats.slice(0, 8).map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveSessionId(chat.id)
                      setActiveTab('chat')
                      if (window.innerWidth < 1024) setSidebarOpen(false)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all group",
                      activeSessionId === chat.id
                        ? "bg-white/[0.06] text-white"
                        : "text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.03]"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-50 group-hover:opacity-80" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-tight truncate">{chat.firstMessage}</p>
                      <p className="text-[10px] text-[#505050] font-mono mt-0.5">
                        {formatTimeAgo(chat.lastMessageAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-10 text-center">
                <p className="section-label opacity-30">No active history</p>
              </div>
            )}
          </div>

          <footer className="p-4 border-t border-border space-y-2">
            <ProfileDialog />
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-sm font-bold text-[#505050] hover:text-[#ff4444] transition-colors uppercase tracking-widest"
            >
              Logout
            </button>
          </footer>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-30 p-2 text-muted-foreground hover:text-white transition-colors lg:hidden bg-[#050506]/60 backdrop-blur-md rounded-lg border border-white/10"
          title="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-hidden">
          <div className="h-full w-full">
            {activeTab === 'chat' && <div className="h-full"><ChatWindow sessionId={activeSessionId} onNewSession={(id) => setActiveSessionId(id)} /></div>}
            {activeTab !== 'chat' && (
              <div className="h-full overflow-y-auto px-4 py-8 lg:p-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-8">
                    <h2 className="text-3xl font-bold tracking-tight text-white mb-2 uppercase">
                      {navItems.find(i => i.id === activeTab)?.label}
                    </h2>
                    <p className="text-[#a0a0a0] text-sm leading-relaxed">
                      {navItems.find(i => i.id === activeTab)?.description} interface powered by PreventIQ High-Resolution Vision.
                    </p>
                  </div>
                  {activeTab === 'profile_detailed' && <HealthProfileView />}
                  {activeTab === 'lab' && <LabInterpreter />}
                  {activeTab === 'risk' && <RiskAssessment />}
                  {activeTab === 'lessons' && <MicroLessons />}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// Helper to show relative time
function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString()
  } catch {
    return ''
  }
}