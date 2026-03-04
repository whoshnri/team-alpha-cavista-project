"use client"

import { useState } from "react"
import { X, FileText, Loader2 } from "lucide-react"
import { useEndpoints } from "@/hooks/use-endpoints"

interface LabUploadInlineProps {
    onClose: () => void
    onSuccess: (response: any) => void
    sessionId: string
}

export function LabUploadInline({ onClose, onSuccess, sessionId }: LabUploadInlineProps) {
    const [labText, setLabText] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!sessionId) {
        setError("Please refresh the page and try again.")
    }

    const { interpretLab } = useEndpoints()

    const handleSubmit = async () => {
        if (!labText.trim()) return
        setError(null)
        setLoading(true)

        try {
            const response = await interpretLab(labText, sessionId)
            if (response.response?.success) {
                onSuccess(response.response)
            } else {
                setError(response.error || "Failed to analyze lab results.")
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || "An error occurred.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-surface border border-border rounded-lg shadow-md w-full overflow-hidden mt-0">
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2 border border-border rounded-lg bg-background">
                        <FileText className="h-4 w-4 text-accent-blue" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary">Lab Results</h3>
                        <p className="text-xs text-text-secondary">Paste your lab report text here</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-raised transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {error && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">
                        {error}
                    </div>
                )}

                <textarea
                    value={labText}
                    onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSubmit()
                        }
                    }}
                    onChange={(e) => setLabText(e.target.value)}
                    placeholder="e.g. Total Cholesterol: 180 mg/dL, HDL: 45 mg/dL..."
                    className="w-full h-32 input p-3 text-sm font-sans rounded-lg border-border/60 focus:border-accent-blue/50 bg-background resize-none"
                    disabled={loading}
                />
            </div>

            <div className="flex items-center justify-end gap-2 p-3 border-t border-border bg-surface-raised/30">
                <button
                    onClick={onClose}
                    className="btn-secondary text-xs px-3 py-1.5"
                    disabled={loading}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!labText.trim() || loading}
                    className="btn-primary flex items-center justify-center text-xs px-4 py-1.5 min-w-[100px]"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        "Analyze"
                    )}
                </button>
            </div>
        </div>
    )
}
