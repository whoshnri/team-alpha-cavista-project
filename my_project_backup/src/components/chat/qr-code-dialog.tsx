"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Smartphone, ExternalLink, X } from "lucide-react"

interface QRCodeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    url: string
    onVerified: () => void
}

export function QRCodeDialog({ open, onOpenChange, url, onVerified }: QRCodeDialogProps) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-black border-border text-white rounded-lg p-10">
                <DialogHeader className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        <span className="section-label">Device Activation</span>
                    </div>
                    <DialogTitle className="text-xl font-bold uppercase tracking-tight">
                        Gait PWA Sync
                    </DialogTitle>
                    <DialogDescription className="text-[#a0a0a0] text-sm leading-relaxed">
                        Motion analysis requires a persistent active connection. Scan with your smartphone to initiate the secure sensor bridge.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-10 gap-8">
                    <div className="p-6 bg-white rounded-lg">
                        <img
                            src={qrUrl}
                            alt="Scan to open PWA"
                            className="w-[180px] h-[180px]"
                        />
                    </div>

                    <div className="w-full flex flex-col gap-4">
                        <p className="section-label text-center">Bridge Link</p>
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 px-4 bg-white/5 border border-border rounded flex items-center justify-between text-[11px] font-mono transition-opacity hover:opacity-80"
                        >
                            <span className="truncate max-w-[200px] text-[#505050]">{url}</span>
                            <ExternalLink className="h-3.5 w-3.5 text-white" />
                        </a>
                    </div>
                </div>

                <button
                    onClick={() => {
                        onOpenChange(false)
                        onVerified?.()
                    }}
                    className="button-primary w-full"
                >
                    Acknowledge
                </button>
            </DialogContent>
        </Dialog>
    )
}
