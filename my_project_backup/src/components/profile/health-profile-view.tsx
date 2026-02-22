"use client"

import { useDetailedProfile, DetailedProfile } from "@/hooks/use-detailed-profile"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Activity,
    User,
    Heart,
    ShieldAlert,
    History,
    Sparkles,
    Info
} from "lucide-react"
import { cn } from "@/lib/utils"

export function HealthProfileView() {
    const { data: profile, loading, error } = useDetailedProfile()

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-1/3 bg-white/5" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-48 w-full bg-white/5" />
                    ))}
                </div>
            </div>
        )
    }

    if (error || !profile) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                <ShieldAlert className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-bold text-white uppercase tracking-tight">Profile Not Found</h3>
                <p className="text-sm text-[#505050] mt-2 max-w-xs mx-auto">
                    We couldn't load your full health profile. Please ensure you have completed your initial onboarding or health scan.
                </p>
            </div>
        )
    }

    return (
        <div className="relative space-y-8 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-white/20 text-white/60 px-2 py-0">
                            Verified Profile
                        </Badge>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight text-white uppercase">
                        {profile.user.name}
                    </h1>
                    <p className="text-[#a0a0a0] text-sm mt-1 uppercase tracking-wide">
                        {profile.user.gender} • {profile.user.age} Years Old • ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                    </p>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl backdrop-blur-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-[#505050] font-bold uppercase tracking-widest">
                            Profile confidence
                        </span>
                        <span className="text-xl font-mono font-bold text-white">
                            {Math.round(profile.confidence * 100)}%
                        </span>
                    </div>
                    <div className="h-10 w-[2px] bg-white/10" />
                    <Activity className="h-6 w-6 text-white opacity-40" />
                </div>
            </div>

            {/* AI Synchronization Visual Cue */}
            <div className="p-6 bg-gradient-to-r from-white/[0.05] to-transparent border border-white/10 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="h-24 w-24 text-white" />
                </div>
                <div className="flex items-start gap-4 relative z-10">
                    <div className="p-2.5 bg-white text-black rounded-lg">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">AI Autonomous Sync</h4>
                        <p className="text-sm text-[#a0a0a0] leading-relaxed max-w-2xl">
                            PreventIQ AI algorithms continuously recalibrate this profile based on your latest vitals, scans, and chat interactions. This profile is your dynamic digital twin, ensuring diagnostics are always current.
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Physical Build */}
                <HealthSection
                    icon={<User className="h-4 w-4" />}
                    title={profile.summary.physical.label}
                    description={profile.summary.physical.description}
                >
                    <div className="grid grid-cols-1 gap-4">
                        {profile.summary.physical.metrics.map((m, i) => (
                            <MetricRow key={i} label={m.label} value={m.value} note={m.note} />
                        ))}
                    </div>
                </HealthSection>

                {/* Heart & Circulation */}
                <HealthSection
                    icon={<Heart className="h-4 w-4" />}
                    title={profile.summary.vitals.label}
                    description={profile.summary.vitals.description}
                >
                    <div className="grid grid-cols-1 gap-4">
                        {profile.summary.vitals.metrics.map((m, i) => (
                            <MetricRow key={i} label={m.label} value={m.value} note={m.note} />
                        ))}
                    </div>
                </HealthSection>

                {/* Preventative Insights */}
                <HealthSection
                    icon={<ShieldAlert className="h-4 w-4" />}
                    title={profile.summary.risks.label}
                    description={profile.summary.risks.description}
                >
                    <div className="space-y-4">
                        {profile.summary.risks.indicators.map((ind, i) => (
                            <div key={i} className="p-3 bg-white/[0.03] border border-white/5 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold text-[#808080] uppercase tracking-wide">{ind.label}</span>
                                    <Badge className={cn(
                                        "text-[9px] uppercase font-bold border-none",
                                        ind.color === 'green' ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
                                    )}>
                                        {ind.value || ind.status}
                                    </Badge>
                                </div>
                                {ind.description && <p className="text-[11px] text-[#505050]">{ind.description}</p>}
                            </div>
                        ))}
                    </div>
                </HealthSection>

                {/* Health Background */}
                <HealthSection
                    icon={<History className="h-4 w-4" />}
                    title={profile.summary.history.label}
                    description={profile.summary.history.description}
                >
                    <div className="space-y-4">
                        {profile.summary.history.data.map((item, i) => (
                            <div key={i}>
                                <span className="text-[11px] font-bold text-[#808080] uppercase tracking-wide block mb-2">{item.label}</span>
                                <div className="flex flex-wrap gap-2">
                                    {item.values && item.values.length > 0 ? item.values.map((v, vi) => (
                                        <Badge key={vi} variant="outline" className="text-[10px] bg-white/[0.03] border-white/10 text-white/50 px-2 py-0.5">
                                            {v}
                                        </Badge>
                                    )) : item.items ? item.items.map((it, iti) => (
                                        <Badge key={iti} variant="outline" className="text-[10px] bg-white/[0.03] border-white/10 text-white/50 px-2 py-0.5">
                                            {it}
                                        </Badge>
                                    )) : (
                                        <span className="text-[11px] text-[#404040] italic font-mono lowercase">None disclosed</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </HealthSection>

            </div>

            <div className="pt-8 text-center border-t border-white/5">
                <p className="text-[10px] text-[#303030] font-mono uppercase tracking-[0.2em]">
                    Profile last recalibrated: {new Date(profile.lastUpdated).toLocaleDateString()} {new Date(profile.lastUpdated).toLocaleTimeString()}
                </p>
            </div>
        </div>
    )
}

function HealthSection({ icon, title, description, children }: { icon: React.ReactNode, title: string, description: string, children: React.ReactNode }) {
    return (
        <Card className="bg-black border-white/10 shadow-2xl overflow-hidden group hover:border-white/20 transition-all duration-300">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-1.5 bg-white/5 border border-white/10 rounded-md text-white/50 group-hover:text-white transition-colors">
                        {icon}
                    </div>
                    <CardTitle className="text-lg font-bold text-white uppercase tracking-tight">{title}</CardTitle>
                </div>
                <CardDescription className="text-[#a0a0a0] text-xs font-normal">
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                {children}
            </CardContent>
        </Card>
    )
}

function MetricRow({ label, value, note }: { label: string, value: string, note?: string }) {
    return (
        <div className="flex flex-col gap-1 py-1 group/row">
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#808080] group-hover/row:text-white transition-colors uppercase tracking-wide">
                    {label}
                </span>
                <span className="text-[13px] font-mono font-bold text-white tracking-widest">
                    {value}
                </span>
            </div>
            {note && (
                <div className="flex items-start gap-1.5 mt-0.5">
                    <Info className="h-3 w-3 text-[#404040] mt-0.5" />
                    <p className="text-[10px] text-[#505050] italic leading-tight">{note}</p>
                </div>
            )}
        </div>
    )
}
