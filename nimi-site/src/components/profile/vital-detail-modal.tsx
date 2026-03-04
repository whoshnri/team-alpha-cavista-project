"use client"

import React, { useState, useEffect } from "react"
import { useEndpoints } from "@/hooks/use-endpoints"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ArrowUp, ArrowDown, Minus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Area,
    AreaChart,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from "recharts"

interface VitalDetailModalProps {
    trend: any | null
    isOpen: boolean
    onClose: () => void
}

export function VitalDetailModal({ trend, isOpen, onClose }: VitalDetailModalProps) {
    const { getVitalInsight } = useEndpoints()
    const [insight, setInsight] = useState<string | null>(null)
    const [loadingInsight, setLoadingInsight] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [isClosing, setIsClosing] = useState(false)

    const handleClose = () => {
        setIsClosing(true)
        setTimeout(() => {
            setIsClosing(false)
            onClose()
        }, 400) // match your transition duration
    }
    useEffect(() => {
        if (isOpen && !isClosing) {
            requestAnimationFrame(() => setMounted(true))
        } else {
            setMounted(false)
        }
    }, [isOpen, isClosing])

    useEffect(() => {
        if (trend) {
            setInsight(null)
            setError(null)
        }
    }, [trend])

    const fetchInsight = async (fresh = false) => {
        if (!trend) return
        setLoadingInsight(true)
        setError(null)
        try {
            const res = await getVitalInsight({ vital_key: trend.label, fresh })
            if (res.success) {
                setInsight(res.insight)
            } else {
                setError(res.error || "Failed to analyze vital")
            }
        } catch (err) {
            setError("Error generating insight. Try again.")
        } finally {
            setLoadingInsight(false)
        }
    }

    if (!trend) return null

    const { label, baseline, current, skewPercent, skew, direction, isAnomalous, stdDev, unit } = trend

    const isImproving = trend.trend === 'improving'
    const isDeclining = trend.trend === 'declining'

    // Always green for the chart line itself
    // Trend color for text/arrows stays semantic
    const chartColor = '#22c55e'
    const chartColorSubtle = '#22c55e08'

    const trendColor = isImproving ? '#0070f3' : isDeclining ? '#ff4444' : '#888888'

    const chartData = [
        { name: 'Start', value: Number(baseline.toFixed(2)) },
        { name: '', value: Number((baseline + skew * 0.2).toFixed(2)) },
        { name: '', value: Number((baseline + skew * 0.5).toFixed(2)) },
        { name: '', value: Number((baseline + skew * 0.8).toFixed(2)) },
        { name: 'Now', value: Number(current.toFixed(2)) },
    ]

    const yMin = Math.min(baseline, current) * 0.95
    const yMax = Math.max(baseline, current) * 1.05
    const gradientId = `gradient-${label.replace(/\s+/g, '')}`

    const renderMarkdown = (text: string) => {
        if (!text) return null
        return text.split('\n').map((line, i) => {
            if (line.startsWith('##')) {
                return (
                    <h3 key={i} className="text-sm font-bold text-text-primary mt-5 mb-2">
                        {line.replace(/^#+\s*/, '').trim()}
                    </h3>
                )
            }
            if (line.startsWith('-') || line.startsWith('*')) {
                return (
                    <div key={i} className="flex flex-row items-start mb-2 pl-3 border-l-2" style={{ borderColor: chartColor }}>
                        <span className="text-text-secondary leading-6 flex-1 text-sm">
                            {line.replace(/^[-*]\s*/, '').trim()}
                        </span>
                    </div>
                )
            }
            if (line.trim() === '') return <div key={i} className="h-1.5" />
            return (
                <p key={i} className="text-text-secondary leading-6 mb-1.5 text-sm">
                    {line.trim()}
                </p>
            )
        })
    }

    const CustomDot = (props: any) => {
        const { cx, cy, index } = props
        if (index === 0) {
            return (
                <circle
                    cx={cx} cy={cy} r={5}
                    fill="var(--background)"
                    stroke={chartColor}
                    strokeWidth={2}
                />
            )
        }
        if (index === chartData.length - 1) {
            return <circle cx={cx} cy={cy} r={6} fill={chartColor} />
        }
        return null
    }

    return (
        <Sheet open={isOpen && !isClosing}
            onOpenChange={(open) => !open && handleClose()}>
            <SheetContent
                side="bottom"
                className="sm:max-w-none w-full sm:w-[52vw] mx-auto bg-background border-t border-border max-h-[80vh] overflow-y-auto px-5 sm:px-8 py-6"
                style={{
                    scrollbarWidth: 'none',
                    transform: mounted ? 'translateY(0)' : 'translateY(100%)',
                    transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                }}
            >
                <div
                    style={{
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'translateY(0)' : 'translateY(12px)',
                        transition: 'opacity 300ms ease, transform 300ms ease',
                        transitionDelay: '100ms',
                    }}
                >
                    <div className="max-w-2xl mx-auto flex flex-col">

                        {/* Header */}
                        <SheetHeader className="mb-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <SheetTitle className="text-xl font-bold text-text-primary">
                                        {label}
                                    </SheetTitle>
                                    <SheetDescription className="text-text-muted text-xs mt-0.5">
                                        Baseline vs latest recalibrated value
                                    </SheetDescription>
                                </div>
                                {isAnomalous && (
                                    <div
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold"
                                        style={{
                                            backgroundColor: '#ff444410',
                                            borderColor: '#ff444430',
                                            color: '#ff4444'
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                                        Anomaly
                                    </div>
                                )}
                            </div>
                        </SheetHeader>

                        <div className="space-y-5 pb-6">

                            {/* Value annotations */}
                            <div className="flex items-end justify-between px-1">
                                <div>
                                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Baseline</p>
                                    <p className="text-sm font-mono text-text-muted">
                                        {baseline.toFixed(1)} <span className="text-[10px]">{unit}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Current</p>
                                    <p className="text-base font-mono font-bold" style={{ color: chartColor }}>
                                        {current.toFixed(1)} <span className="text-[10px] font-normal">{unit}</span>
                                    </p>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="w-full h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                                                <stop offset="100%" stopColor={chartColor} stopOpacity={1} />
                                            </linearGradient>
                                            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={chartColor} stopOpacity={0.12} />
                                                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis domain={[yMin, yMax]} hide />
                                        <XAxis
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--text-muted))', fontSize: 11, fontWeight: 600 }}
                                            dy={8}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={`url(#${gradientId})`}
                                            strokeWidth={2.5}
                                            fill={`url(#${gradientId}-fill)`}
                                            dot={<CustomDot />}
                                            activeDot={{ r: 4, fill: chartColor, strokeWidth: 0 }}
                                            animationDuration={900}
                                            animationEasing="ease-out"
                                            isAnimationActive={true}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center justify-center gap-8 py-3">
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                        Shift
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-base font-bold font-mono" style={{ color: trendColor }}>
                                            {skewPercent > 0 ? '+' : ''}{skewPercent.toFixed(1)}%
                                        </span>
                                        {direction === 'up' && <ArrowUp className="h-4 w-4" style={{ color: trendColor }} />}
                                        {direction === 'down' && <ArrowDown className="h-4 w-4" style={{ color: trendColor }} />}
                                        {direction === 'flat' && <Minus className="h-4 w-4" style={{ color: trendColor }} />}
                                    </div>
                                    <span className="text-[10px] text-text-muted">
                                        ({skew > 0 ? '+' : ''}{skew.toFixed(1)} {unit})
                                    </span>
                                </div>

                                <div className="w-px h-10 bg-border" />

                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                        Std Dev
                                    </span>
                                    <span className="text-base font-bold font-mono text-text-primary">
                                        ±{stdDev?.toFixed(1) ?? '—'}
                                    </span>
                                    <span className="text-[10px] text-text-muted">Typical var.</span>
                                </div>
                            </div>

                            <div className="h-px bg-border text-left" />

                            {/* AI Insight */}
                            <div>

                                {!insight && !loadingInsight && (
                                    <div className="flex flex-col items-center gap-4 py-4">
                                        <p className="text-sm text-text-muted text-left w-full">
                                            Generate a personalised insight on this shift and what it means for you.
                                        </p>
                                        <Button
                                            className="w-full h-11 text-sm font-medium rounded-md text-white"
                                            style={{ backgroundColor: chartColor }}
                                            onClick={() => fetchInsight(false)}
                                        >
                                            Get AI Insight
                                        </Button>
                                    </div>
                                )}

                                {loadingInsight && (
                                    <div className="flex items-center justify-center gap-1.5 py-10">
                                        {[0, 1, 2].map(i => (
                                            <span
                                                key={i}
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{
                                                    backgroundColor: chartColor,
                                                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {insight && !loadingInsight && (
                                    <div
                                        style={{
                                            opacity: insight ? 1 : 0,
                                            transform: insight ? 'translateY(0)' : 'translateY(8px)',
                                            transition: 'opacity 200ms ease, transform 200ms ease'
                                        }}
                                    >
                                        <div className="leading-relaxed">
                                            {renderMarkdown(insight)}
                                        </div>
                                        <button
                                            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mt-4"
                                            onClick={() => fetchInsight(true)}
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Refresh insight
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <p className="text-xs text-destructive text-center mt-3">{error}</p>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}