"use client"

import { MapPin, Shield, Mic, Camera, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────
// PERMISSION CONFIG — add new tools here
// ─────────────────────────────────────────────

type PermissionType = 'location' | 'microphone' | 'camera'

const PERMISSION_CONFIG: Record<PermissionType, {
    icon: typeof MapPin
    title: string
    description: string
    detail: string
    buttonLabel: string
}> = {
    location: {
        icon: MapPin,
        title: 'Location Access',
        description: 'To find clinics and hospitals near you, PreventIQ needs access to your location.',
        detail: 'Data is used for temporary proximity search and is not stored.',
        buttonLabel: 'Authorize',
    },
    microphone: {
        icon: Mic,
        title: 'Vocal Acquisition',
        description: 'Speech-to-text features require local microphone access.',
        detail: 'Audio stream is transient and processed on-device.',
        buttonLabel: 'Authorize',
    },
    camera: {
        icon: Camera,
        title: 'Visual Diagnostics',
        description: 'Biometric capture and vision tools require camera access.',
        detail: 'Visual data is processed within the secure enclave.',
        buttonLabel: 'Authorize',
    },
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

interface PermissionRequestProps {
    type: PermissionType
    toolReason?: string              // AI's reason for needing this
    onGrant: () => void | Promise<void>
    onDismiss: () => void
    loading?: boolean
    denied?: boolean                 // if permission was already denied by browser
}

export function PermissionRequest({
    type, toolReason, onGrant, onDismiss, loading = false, denied = false
}: PermissionRequestProps) {
    const config = PERMISSION_CONFIG[type]
    const Icon = config.icon

    return (
        <div className="flex flex-col items-start w-full">
            <div className="w-full card bg-background border-border">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 border border-border rounded-lg bg-surface">
                            <Icon className="h-5 w-5 text-text-primary" />
                        </div>
                        <div>
                            <p className="section-label mb-0.5">Permission Required</p>
                            <h4 className="text-sm font-bold text-text-primary uppercase tracking-tight">{config.title}</h4>
                        </div>
                    </div>
                    <button
                        onClick={onDismiss}
                        className="p-1 rounded-md text-text-muted hover:text-text-primary transition-colors hover:bg-surface-raised"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Description */}
                <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    {config.description}
                </p>

                {/* AI reason if provided */}
                {toolReason && (
                    <p className="text-xs text-text-muted font-medium mb-6 pl-4 border-l border-border italic opacity-80">
                        "{toolReason}"
                    </p>
                )}

                {/* Privacy note */}
                <p className="section-label mb-8">
                    {config.detail}
                </p>

                {/* Denied state */}
                {denied ? (
                    <div className="space-y-4">
                        <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
                            <p className="text-xs text-destructive font-medium leading-relaxed">
                                System access blocked. Please enable {type} permissions in browser settings to continue.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onGrant}
                                className="btn-primary flex-1"
                            >
                                Re-initialize
                            </button>
                            <button
                                onClick={onDismiss}
                                className="btn-secondary"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Normal grant / skip buttons */
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onGrant}
                            disabled={loading}
                            className="btn-primary flex-1 h-11"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white loading-pulse" />
                                    Authorizing
                                </span>
                            ) : config.buttonLabel}
                        </button>
                        <button
                            onClick={onDismiss}
                            disabled={loading}
                            className="btn-secondary h-11"
                        >
                            Skip
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// HELPER: request a specific browser permission
// ─────────────────────────────────────────────

export type PermissionResult = { granted: boolean; error?: string }

export async function requestBrowserPermission(type: PermissionType): Promise<PermissionResult> {
    try {
        switch (type) {
            case 'location':
                return new Promise((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        () => resolve({ granted: true }),
                        (err) => resolve({ granted: false, error: err.code === 1 ? 'denied' : err.message }),
                        { enableHighAccuracy: true, timeout: 10000 }
                    )
                })

            case 'microphone':
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    stream.getTracks().forEach(t => t.stop())
                    return { granted: true }
                } catch (err: any) {
                    return { granted: false, error: err.name === 'NotAllowedError' ? 'denied' : err.message }
                }

            case 'camera':
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
                    stream.getTracks().forEach(t => t.stop())
                    return { granted: true }
                } catch (err: any) {
                    return { granted: false, error: err.name === 'NotAllowedError' ? 'denied' : err.message }
                }

            default:
                return { granted: false, error: 'Unknown permission type' }
        }
    } catch (err: any) {
        return { granted: false, error: err.message }
    }
}
