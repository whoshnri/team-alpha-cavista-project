"use client"

import { HeartPulse, X, MessageSquare, Activity, FileText, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProfile } from "@/hooks/use-profile"
import { Skeleton } from "@/components/ui/skeleton"

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
    recentChats: any[]
    isLoading?: boolean
    activeSessionId: string | null
    setActiveSessionId: (id: string | null) => void
    activeTab: string
    setActiveTab: (tab: string) => void
    user: any
}

export function Sidebar({
    isOpen,
    onClose,
    recentChats,
    isLoading = false,
    activeSessionId,
    setActiveSessionId,
    activeTab,
    setActiveTab,
    user
}: SidebarProps) {
    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border transition-transform duration-300 ease-in-out lg:static lg:z-auto"
                style={{
                    transform: isOpen ? 'translateX(0)' : undefined,
                }}
                data-open={isOpen}
            >
                <style jsx>{`
          aside { transform: translateX(-100%); }
          aside[data-open="true"] { transform: translateX(0); }
          @media (min-width: 1024px) { aside { transform: none !important; } }
        `}</style>
                <div className="flex flex-col h-full">
                    <div className="p-8 pb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 border border-border rounded-lg bg-background">
                                <HeartPulse className="text-accent-blue h-5 w-5" />
                            </div>
                            <span className="font-base text-lg tracking-tight text-text-primary">
                                nimi
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-text-secondary hover:text-text-primary lg:hidden"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="px-4 pb-4 space-y-2">
                        <button
                            onClick={() => {
                                setActiveSessionId(null)
                                setActiveTab('chat')
                                if (window.innerWidth < 1024) onClose()
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-lg bg-surface hover:bg-surface-raised transition-colors text-sm font-base uppercase text-text-primary shadow-sm"
                        >
                            New Chat
                        </button>

                    </div>

                    {/* Recent Chats Section */}
                    <div className="flex-1 px-4 overflow-y-auto mt-2">
                        <div className="px-3 mb-4 flex items-center justify-between">
                            <span className="section-label">History</span>
                        </div>

                        {isLoading ? (
                            <div className="space-y-2 px-3">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-7 w-full bg-surface-raised rounded-lg" />
                                    </div>
                                ))}
                            </div>
                        ) : recentChats && recentChats.length > 0 ? (
                            <div className="space-y-2">
                                {recentChats.slice(0, 15).map((chat) => (
                                    <button
                                        key={chat.id}
                                        onClick={() => {
                                            setActiveSessionId(chat.id)
                                            setActiveTab('chat')
                                            if (window.innerWidth < 1024) onClose()
                                        }}
                                        className={cn(
                                            "list-row group px-3 rounded-md w-full border-none py-1",
                                            activeSessionId === chat.id
                                                ? "bg-surface-raised text-text-primary"
                                                : "text-text-secondary hover:text-text-primary hover:bg-surface-raised"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 text-left">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-base capitalize truncate">{chat.firstMessage || 'Empty Session'}</p>
                                                <p className="text-xs text-text-muted font-sans">
                                                    {formatTimeAgo(chat.lastMessageAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="px-3 py-10 text-center space-y-3">
                                <div className="p-3 bg-surface rounded-full w-fit mx-auto opacity-20 border border-border">
                                    <MessageSquare className="h-5 w-5" />
                                </div>
                                <p className="section-label opacity-30 text-center">No active history</p>
                            </div>
                        )}
                    </div>

                    <footer className="p-4 border-t border-border">
                        <button
                            onClick={() => {
                                setActiveTab('settings')
                                if (window.innerWidth < 1024) onClose()
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group text-left",
                                activeTab === 'settings' ? "bg-accent-blue/5 text-accent-blue" : "text-text-secondary hover:text-text-primary hover:bg-surface-raised"
                            )}
                        >
                            <div className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center font-base uppercase border transition-colors",
                                activeTab === 'settings' ? "bg-accent-blue border-accent-blue text-white" : "bg-surface border-border text-text-primary group-hover:border-text-secondary"
                            )}>
                                {user?.fullName?.charAt(0) || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-base uppercase tracking-wide truncate">{user?.fullName || "Personnel Profile"}</div>
                                <div className="text-xs opacity-60 leading-none mt-1">Config & Settings</div>
                            </div>
                        </button>
                    </footer>
                </div>
            </aside>
        </>
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
