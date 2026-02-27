"use client"

import { MapPin, Phone, Globe, Clock, Star, Navigation, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

type Clinic = {
    place_id: string
    name: string
    address: string
    phone: string | null
    website: string | null
    distance: { meters: number | null; formatted: string | null }
    bearing: { degrees: number; cardinal: string } | null
    rating: { score: number | null; total_reviews: number; display: string }
    status: string
    opening_hours: {
        available: boolean
        open_now: boolean | null
        hours_today: string | null
        next_open: string | null
    }
    navigation: {
        directions_url: string | null
        plus_code: string | null
    }
}

type ClinicResultsProps = {
    clinics: Clinic[]
    userLocation?: { lat: number; lng: number }
}

export function ClinicResultsCard({ clinics, userLocation }: ClinicResultsProps) {
    if (!clinics || clinics.length === 0) {
        return (
            <div className="w-full card bg-background border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2 border border-border rounded-lg bg-surface">
                        <MapPin className="h-5 w-5 text-text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-base text-text-primary uppercase tracking-tight">No clinics found</h4>
                        <p className="section-label">Try expanding your search radius</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                <span className="section-label">
                    Nearby care ({clinics.length})
                </span>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {clinics.map((clinic) => (
                    <div
                        key={clinic.place_id}
                        className="group bg-surface border border-border rounded-lg p-5 transition-colors hover:border-border-hover flex flex-col justify-between"
                    >
                        {/* Top section */}
                        <div>
                            {/* Name + status badge */}
                            <div className="flex items-start justify-between gap-4 mb-2">
                                <h5 className="text-sm font-bold text-text-primary leading-tight line-clamp-2 uppercase tracking-tight">{clinic.name}</h5>
                                {clinic.opening_hours.available && (
                                    <span className={cn(
                                        "text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider flex-shrink-0 mt-0.5 border",
                                        clinic.opening_hours.open_now
                                            ? "border-accent-blue/30 text-accent-blue"
                                            : "border-destructive/30 text-destructive"
                                    )}>
                                        {clinic.opening_hours.open_now ? 'Open' : 'Closed'}
                                    </span>
                                )}
                            </div>

                            {/* Address */}
                            <p className="text-[11px] text-text-secondary line-clamp-2 mb-3 leading-relaxed">{clinic.address}</p>

                            {/* Meta chips */}
                            <div className="flex items-center gap-2 flex-wrap mb-4">
                                {clinic.distance.formatted && (
                                    <span className="inline-flex items-center gap-1.5 text-sm text-text-muted bg-background px-2 py-1 rounded-md border border-border">
                                        <Navigation className="h-2.5 w-2.5" />
                                        <span className="font-mono">{clinic.distance.formatted}</span>
                                        {clinic.bearing && <span className="opacity-50 ml-0.5">{clinic.bearing.cardinal}</span>}
                                    </span>
                                )}
                                {clinic.rating.score && (
                                    <span className="inline-flex items-center gap-1.5 text-sm text-text-primary bg-surface-raised px-2 py-1 rounded-md border border-border">
                                        <Star className="h-2.5 w-2.5 fill-text-primary" />
                                        <span className="font-mono">{clinic.rating.score}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center text-center gap-2 pt-4 border-t border-border">
                            {clinic.navigation.directions_url && (
                                <a
                                    href={clinic.navigation.directions_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary flex-1 text-sm py-2 h-auto"
                                >
                                    Directions
                                </a>
                            )}
                            {clinic.phone && (
                                <a
                                    href={`tel:${clinic.phone}`}
                                    className="btn-secondary flex items-center justify-center gap-2 py-2 px-3 text-sm h-auto"
                                >
                                    Call
                                </a>
                            )}
                            {clinic.website && (
                                <a
                                    href={clinic.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary flex items-center justify-center gap-2 py-2 px-3 text-sm h-auto"
                                >
                                    Web
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
