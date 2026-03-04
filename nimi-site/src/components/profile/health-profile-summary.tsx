"use client"

import { useEffect, useState } from "react"
import { useEndpoints } from "@/hooks/use-endpoints"
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { VitalDetailModal } from "./vital-detail-modal"

export function HealthProfileSummary() {
    const { getHealthTrends } = useEndpoints()
    const [trends, setTrends] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedTrend, setSelectedTrend] = useState<any | null>(null)

    useEffect(() => {
        const fetchTrends = async () => {
            try {
                const res = await getHealthTrends({ fresh: false })
                if (res.success) {
                    setTrends([...res.anomalous, ...res.normal])
                }
            } catch (err) {
                console.error("[HealthProfileSummary] Failed to load trends", err)
            } finally {
                setLoading(false)
            }
        }
        fetchTrends()
    }, [getHealthTrends])

    if (loading) return null
    if (trends.length === 0) return null

    return (
        <div className="w-full space-y-4 mb-8">
            <h2 className="text-xl font-bold tracking-tight text-text-primary uppercase flex items-center gap-2">
                Vital Trends
            </h2>

            <div className="grid grid-cols-3 gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {trends.map((trend, i) => {
                    const isAnomalous = trend.isAnomalous
                    const isImproving = trend.trend === 'improving'
                    const isDeclining = trend.trend === 'declining'

                    let arrowColorClass = "text-text-muted"
                    if (isImproving) arrowColorClass = "text-accent-blue"
                    if (isDeclining) arrowColorClass = "text-destructive"

                    return (
                        <div
                            key={i}
                            className={cn(
                                "flex-none w-full p-4 rounded-lg border bg-surface flex flex-col gap-3 transition-colors cursor-pointer hover:border-text-muted/30",
                                isAnomalous ? "border-destructive/40" : "border-border"
                            )}
                            onClick={() => setSelectedTrend(trend)}
                        >
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-text-muted uppercase tracking-wide line-clamp-1">{trend.label}</span>
                                {isAnomalous && <AlertTriangle className="h-4 w-4 text-destructive" />}
                            </div>

                            <div>
                                <span className="text-2xl font-mono font-bold text-text-primary mr-1">
                                    {trend.current % 1 === 0 ? trend.current : trend.current.toFixed(1)}
                                </span>
                                <span className="text-xs text-text-muted">{trend.unit}</span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-auto">
                                {trend.direction === 'up' && <ArrowUp className={cn("h-4 w-4", arrowColorClass)} />}
                                {trend.direction === 'down' && <ArrowDown className={cn("h-4 w-4", arrowColorClass)} />}
                                {trend.direction === 'flat' && <Minus className={cn("h-4 w-4", arrowColorClass)} />}
                                <span className={cn("text-xs font-bold tracking-widest", arrowColorClass)}>
                                    {trend.skewPercent > 0 ? '+' : ''}{trend.skewPercent.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            <VitalDetailModal
                trend={selectedTrend}
                isOpen={!!selectedTrend}
                onClose={() => setSelectedTrend(null)}
            />
        </div>
    )
}
