"use client"

import { Menu, MoreHorizontal } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"

interface NavbarProps {
    onOpenSidebar: () => void
}

export function Navbar({ onOpenSidebar }: NavbarProps) {
    return (
        <header className="h-14 flex items-center justify-between 
                       px-4 border-b border-border bg-background
                       sticky top-0 z-40">
            <div className="flex items-center gap-3">
                <button className="btn-ghost p-1.5 lg:hidden" onClick={onOpenSidebar}>
                    <Menu className="w-4 h-4" />
                </button>
                <span className="text-sm font-base tracking-tight text-text-primary">nimi</span>
            </div>
            <div className="flex items-center gap-1">
                <ThemeToggle />
                <button className="btn-ghost p-1.5">
                    <MoreHorizontal className="w-4 h-4" />
                </button>
            </div>
        </header>
    )
}
