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
import { HealthProfileSummary } from "./health-profile-summary"

export function HealthProfileView() {
    const { data, loading, error } = useDetailedProfile()

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

    const p = data


    return (
        <div className="relative space-y-8 pb-20">
            {/* Header Section */}
            <div className="flex  md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-4xl font-bold tracking-tight text-text-primary uppercase">
                        {p?.user?.name || "Profile Pending"}
                    </h1>
                    <p className="text-text-secondary text-xs mt-1 uppercase tracking-wide">
                        {p?.user?.gender || "N/A"} • {p?.user?.age || "—"} Years Old • ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                    </p>
                </div>

                <div className="flex wfit items-center gap-3 px-4 py-3 bg-surface border border-border rounded-lg">
                    <div className="flex flex-col items-end">
                        {/* <span className="text-xs text-text-muted font-bold capitalize">
                            Profile confidence
                        </span> */}
                        <span className="text-xl font-mono font-bold text-text-primary">
                            {Math.round((p?.confidence || 0) * 100)}%
                        </span>
                    </div>
                    <div className="h-10 w-[2px] bg-border" />
                    <Activity className="h-6 w-6 text-text-primary opacity-40" />
                </div>
            </div>

            {/* AI Synchronization Visual Cue */}
            <div className="p-6 bg-surface border border-border rounded-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="h-24 w-24 text-text-primary" />
                </div>
                <div className="flex items-start gap-4 relative z-10">
                    <div className="space-y-1">
                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-tight">AI Autonomous Sync</h4>
                        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
                            PreventIQ AI algorithms continuously recalibrate this profile based on your latest vitals, scans, and chat interactions. This profile is your dynamic digital twin, ensuring diagnostics are always current.
                        </p>
                    </div>
                </div>
            </div>

            <HealthProfileSummary />

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Physical Build */}
                <HealthSection
                    icon={<User className="h-4 w-4" />}
                    title={p?.summary?.physical?.label || "Physical Build"}
                    description={p?.summary?.physical?.description || "Awaiting scan data"}
                >
                    <div className="grid grid-cols-1 gap-4">
                        {p?.summary?.physical?.metrics?.length ? p?.summary.physical.metrics.map((m: any, i: number) => (
                            <MetricRow key={i} label={m.label} value={m.value} note={m.note} />
                        )) : (
                            <div className="text-xs text-text-muted italic py-2">No physical metrics recorded.</div>
                        )}
                    </div>
                </HealthSection>

                {/* Heart & Circulation */}
                <HealthSection
                    icon={<Heart className="h-4 w-4" />}
                    title={p?.summary?.vitals?.label || "Heart & Circulation"}
                    description={p?.summary?.vitals?.description || "Awaiting vital signs monitoring"}
                >
                    <div className="grid grid-cols-1 gap-4">
                        {p?.summary?.vitals?.metrics?.length ? p?.summary.vitals.metrics.map((m: any, i: number) => (
                            <MetricRow key={i} label={m.label} value={m.value} note={m.note} />
                        )) : (
                            <div className="text-xs text-text-muted italic py-2">No active vitals recorded.</div>
                        )}
                    </div>
                </HealthSection>

                {/* Preventative Insights */}
                <HealthSection
                    icon={<ShieldAlert className="h-4 w-4" />}
                    title={p?.summary?.risks?.label || "Preventative Insights"}
                    description={p?.summary?.risks?.description || "Awaiting risk analysis"}
                >
                    <div className="space-y-4">
                        {p?.summary?.risks?.indicators?.length ? p?.summary.risks.indicators.map((ind: any, i: number) => (
                            <div key={i} className="p-3 bg-surface border border-border rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wide">{ind.label}</span>
                                    <Badge className={cn(
                                        "text-[9px] uppercase font-bold border-none",
                                        ind.color === 'green' ? "bg-accent-blue/20 text-accent-blue" : "bg-warning/20 text-warning"
                                    )}>
                                        {ind.value || ind.status}
                                    </Badge>
                                </div>
                                {ind.description && <p className="text-[11px] text-text-muted">{ind.description}</p>}
                            </div>
                        )) : (
                            <div className="text-xs text-text-muted italic py-2">Insufficient data to generate insights.</div>
                        )}
                    </div>
                </HealthSection>

                {/* Health Background */}
                <HealthSection
                    icon={<History className="h-4 w-4" />}
                    title={p?.summary?.history?.label || "Health Background"}
                    description={p?.summary?.history?.description || "Awaiting history log"}
                >
                    <div className="space-y-4">
                        {p?.summary?.history?.data?.length ? p?.summary.history.data.map((item: any, i: number) => (
                            <div key={i}>
                                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wide block mb-2">{item.label}</span>
                                <div className="flex flex-wrap gap-2">
                                    {item.values && item.values.length > 0 ? item.values.map((v: any, vi: number) => (
                                        <Badge key={vi} variant="outline" className="text-[10px] bg-surface border-border text-text-muted px-2 py-0.5">
                                            {v}
                                        </Badge>
                                    )) : item.items ? item.items.map((it: any, iti: number) => (
                                        <Badge key={iti} variant="outline" className="text-[10px] bg-surface border-border text-text-muted px-2 py-0.5">
                                            {it}
                                        </Badge>
                                    )) : (
                                        <span className="text-[11px] text-text-muted opacity-50 italic font-mono lowercase">None disclosed</span>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="text-xs text-text-muted italic py-2">No historical health records found.</div>
                        )}
                    </div>
                </HealthSection>

            </div>

            <div className="pt-8 text-center border-t border-border">
                <p className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">
                    Profile last recalibrated: {p?.lastUpdated ? new Date(p?.lastUpdated).toLocaleString() : "—"}
                </p>
            </div>
        </div >
    )
}

function HealthSection({ icon, title, description, children }: { icon: React.ReactNode, title: string, description: string, children: React.ReactNode }) {
    return (
        <Card className="bg-surface border-border overflow-hidden group hover:border-border-hover transition-all duration-300 shadow-none">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-1.5 bg-background border border-border rounded-md text-text-muted group-hover:text-text-primary transition-colors">
                        {icon}
                    </div>
                    <CardTitle className="text-lg font-bold text-text-primary uppercase tracking-tight">{title}</CardTitle>
                </div>
                <CardDescription className="text-text-secondary text-xs font-normal">
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
                <span className="text-[12px] font-bold text-text-muted group-hover/row:text-text-primary transition-colors uppercase tracking-wide">
                    {label}
                </span>
                <span className="text-[13px] font-mono font-bold text-text-primary tracking-widest">
                    {value}
                </span>
            </div>
            {note && (
                <div className="flex items-start gap-1.5 mt-0.5">
                    <Info className="h-3 w-3 text-text-muted opacity-40 mt-0.5" />
                    <p className="text-[10px] text-text-muted italic leading-tight">{note}</p>
                </div>
            )}
        </div>
    )
}
