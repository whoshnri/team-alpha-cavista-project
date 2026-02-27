"use client"

import { Smartphone, Download } from "lucide-react"
import {SiGoogleplay, SiAppstore} from "react-icons/si"

export function DownloadAppEmbedded() {
    return (
        <div className="w-full card p-6 bg-surface border-border/60 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-lg">
            <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-accent-blue/10 border border-border rounded-lg">
                    <Smartphone className="w-6 h-6 text-accent-blue" />
                </div>
                <div>
                    <h4 className="text-base font-serif font-base text-text-primary tracking-tight">
                        Get the Nimi Mobile App
                    </h4>
                    <p className="text-xs text-text-secondary font-sans mt-0.5">
                        Unlock advanced movement & gait signatures
                    </p>
                </div>
            </div>

            <p className="text-sm text-text-secondary leading-relaxed mb-6 font-sans">
                For deep gait analysis and daily biometric tracking, use our mobile application. It leverages your device's advanced sensors for medical-grade precision.
            </p>

            <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-surface-raised transition-all text-[11px] font-bold uppercase tracking-widest text-text-primary group">
                    <SiAppstore className="w-4 h-4 text-text-primary group-hover:text-accent-blue transition-colors" />
                    App Store
                </button>
                <button className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-surface-raised transition-all text-[11px] font-bold uppercase tracking-widest text-text-primary group">
                    <SiGoogleplay className="w-4 h-4 text-text-primary group-hover:text-accent-blue transition-colors" />
                    Play Store
                </button>
            </div>

            <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-all text-sm font-bold shadow-lg shadow-accent-blue/20">
                <Download className="w-4 h-4" />
                One-Tap Install
            </button>
        </div>
    )
}
