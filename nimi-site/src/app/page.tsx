"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { ChatWindow } from "@/components/chat/chat-window"

import { SettingsView } from "@/components/profile/settings-view"
import { HealthProfileView } from "@/components/profile/health-profile-view"
import { useProfile } from "@/hooks/use-profile"
import { Sidebar } from "@/components/layout/sidebar"
import { Navbar } from "@/components/layout/navbar"
import { MessageSquare, Activity, FileText, Settings, BookOpen } from "lucide-react"
export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-background animate-pulse" />}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const { user, profile, recentChats, chatsLoading, logout } = useProfile()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const initialSessionId = searchParams.get('sid')
  const [activeTab, setActiveTab] = useState("chat")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessionId)

  // Sync state with URL when searchParams change (e.g. back button)
  useEffect(() => {
    const sid = searchParams.get('sid')
    if (sid !== activeSessionId) {
      setActiveSessionId(sid)
    }
  }, [searchParams])

  // Sync URL with state when activeSessionId changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (activeSessionId) {
      params.set('sid', activeSessionId)
    } else {
      params.delete('sid')
    }

    const queryString = params.toString()
    const url = queryString ? `${pathname}?${queryString}` : pathname
    router.replace(url)
  }, [activeSessionId])


  const navItems = [
    { id: 'chat', label: 'Assistant', icon: MessageSquare, description: 'Health Q&A' },
    { id: 'profile_detailed', label: 'Health Profile', icon: Activity, description: 'Neural Baseline' },

    { id: 'settings', label: 'Settings', icon: Settings, description: 'Session Configuration' },
  ]

  const navTools = navItems.filter(item => item.id !== 'chat')

  return (
    <div className="flex h-screen overflow-hidden bg-transparent font-serif">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        recentChats={recentChats}
        isLoading={chatsLoading}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
      />

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10 transition-all duration-300">
        <Navbar onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="flex-1 overflow-hidden relative">
          <div className="h-full w-full">
            {activeTab === 'chat' && (
              <div className="h-full flex flex-col">
                <div className="h-full relative z-10">
                  <ChatWindow sessionId={activeSessionId} onNewSession={(id) => setActiveSessionId(id)} />
                </div>
              </div>
            )}
            {activeTab !== 'chat' && (
              <div className="h-full overflow-y-auto px-4 py-8 lg:p-12 animate-in fade-in slide-in-from-left duration-300">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-12 text-center lg:text-left">
                    <h2 className="text-3xl font-serif tracking-tight text-text-primary mb-3">
                      {navItems.find((i: any) => i.id === activeTab)?.label}
                    </h2>
                    <p className="text-text-secondary text-sm leading-relaxed font-sans max-w-xl">
                      {navItems.find((i: any) => i.id === activeTab)?.description} interface. Breathable, professional, and reliable health diagnostics.
                    </p>
                  </div>
                  {activeTab === 'profile_detailed' && <HealthProfileView />}

                  {activeTab === 'settings' && <SettingsView />}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// Helper to show relative time (can be exported if needed elsewhere)
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