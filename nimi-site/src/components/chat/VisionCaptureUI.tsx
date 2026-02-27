// VisionCaptureUI.tsx — Real-time camera capture with guided overlays
// Renders inline in the chat when the AI triggers a capture tool call

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { CaptureState, CaptureRequest, CaptureGuidance } from "../../hooks/useVisionCapture";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────

interface VisionCaptureUIProps {
  captureState: CaptureState;
  onAccept: () => void;
  onDecline: () => void;
  onSubmit: (file: File) => void;
  onRetry: () => void;
  onDismiss: () => void;
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export function VisionCaptureUI({
  captureState,
  onAccept,
  onDecline,
  onSubmit,
  onRetry,
  onDismiss,
}: VisionCaptureUIProps) {
  if (captureState.status === "idle") return null;

  return (
    <div className="fixed inset-0 bg-background/95 z-[1000] flex items-center justify-center p-6 backdrop-blur-sm">
      <div className="w-full max-w-[420px] max-h-[90vh] overflow-auto">
        {captureState.status === "requested" && (
          <CapturePrompt
            request={captureState.request}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        )}

        {captureState.status === "capturing" && (
          <CameraView
            guidance={captureState.request.guidance}
            onCapture={onSubmit}
            onCancel={onDecline}
          />
        )}

        {captureState.status === "uploading" && (
          <StatusView
            icon="⬆️"
            title="Uploading..."
            subtitle="Sending your capture for analysis"
          />
        )}

        {captureState.status === "analyzing" && (
          <StatusView
            icon="🔬"
            title="Analyzing..."
            subtitle="The AI is examining your capture with multi-pass verification"
            showPulse
          />
        )}

        {captureState.status === "complete" && (
          <CompleteView result={captureState.result} onDismiss={onDismiss} />
        )}

        {captureState.status === "error" && (
          <ErrorView
            error={captureState.error}
            request={captureState.request}
            onRetry={onRetry}
            onDismiss={onDismiss}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CAPTURE PROMPT — "The AI wants to look at something"
// ─────────────────────────────────────────────

function CapturePrompt({
  request,
  onAccept,
  onDecline,
}: {
  request: CaptureRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="card max-w-md w-full p-8 bg-background border-border">
      <div className="inline-block px-3 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase bg-surface border border-border text-text-muted mb-6">
        {request.urgency === 'routine' ? 'Standard' : request.urgency === 'recommended' ? 'Priority' : 'Critical'}
      </div>

      <h3 className="text-xl font-bold uppercase tracking-tight text-text-primary mb-3">{request.guidance.title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed mb-8">{request.reason}</p>

      <div className="flex flex-col gap-3 mb-8">
        {request.guidance.instructions.map((inst: string, i: number) => (
          <div key={i} className="flex items-start gap-3 text-[13px] text-text-secondary leading-normal">
            <span className="flex-shrink-0 w-5 h-5 rounded-md bg-surface flex items-center justify-center text-[10px] font-bold text-text-primary border border-border">
              {i + 1}
            </span>
            <span>{inst}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={onDecline} className="btn-secondary flex-1">
          Dismiss
        </button>
        <button onClick={onAccept} className="btn-primary flex-1">
          Initialize Camera
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CAMERA VIEW — Live viewfinder with guide overlays
// ─────────────────────────────────────────────

function CameraView({
  guidance,
  onCapture,
  onCancel,
}: {
  guidance: CaptureGuidance;
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start camera
  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        // Prefer rear camera for medical imaging
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch (err: any) {
        if (mounted) {
          setCameraError(
            err.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access and try again."
              : err.name === "NotFoundError"
                ? "No camera found. Please connect a camera and try again."
                : `Camera error: ${err.message}`
          );
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // No recording timer needed for photo-only

  // ── PHOTO CAPTURE ──
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onCapture(file);
        }
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture]);

  // Video functions removed

  const handleCancel = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }, [onCancel]);

  if (cameraError) {
    return (
      <div className="card max-w-md w-full p-10 flex flex-col items-center text-center gap-6 bg-background">
        <span className="text-4xl">📷</span>
        <p className="text-sm text-text-secondary leading-relaxed">{cameraError}</p>
        <button onClick={handleCancel} className="btn-secondary w-full">Go Back</button>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden bg-background p-0 border-border">
      {/* Video feed */}
      <div className="relative w-full aspect-[3/4] bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Photo overlay */}
        <CaptureOverlay type={guidance.overlay} />

        {/* Loading overlay */}
        {!cameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4 text-white">
            <div className="w-6 h-6 border-2 border-border border-t-white rounded-full animate-spin" />
            <p className="text-sm font-medium">Starting camera...</p>
          </div>
        )}
      </div>

      {/* Instruction bar */}
      <div className="p-4 bg-surface text-text-secondary text-[10px] font-bold uppercase tracking-widest text-center border-t border-border">
        {guidance.instructions[0]}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-12 py-6 bg-background border-t border-border">
        <button onClick={handleCancel} className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-text-primary transition-colors">
          ✕
        </button>

        <button
          onClick={capturePhoto}
          className="w-18 h-18 rounded-full border-2 border-text-primary flex items-center justify-center p-0 disabled:opacity-50"
          disabled={!cameraReady}
        >
          <div className="w-14 h-14 rounded-full bg-text-primary" />
        </button>

        <div className="w-11" /> {/* Spacer for alignment */}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OVERLAY GUIDES
// ─────────────────────────────────────────────

function CaptureOverlay({ type }: { type: string }) {
  if (type === "fundus_guide") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 400 400" className="w-full h-full">
          {/* Dark corners, clear circle in center */}
          <defs>
            <mask id="fundus-mask">
              <rect width="400" height="400" fill="white" />
              <circle cx="200" cy="200" r="130" fill="black" />
            </mask>
          </defs>
          <rect width="400" height="400" fill="rgba(0,0,0,0.8)" mask="url(#fundus-mask)" />
          <circle cx="200" cy="200" r="130" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="4 4" />
          <text x="200" y="370" textAnchor="middle" fill="#ffffff" fontSize="11" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Position subject in frame
          </text>
        </svg>
      </div>
    );
  }

  if (type === "skin_guide") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 400 400" className="w-full h-full">
          <defs>
            <mask id="skin-mask">
              <rect width="400" height="400" fill="white" />
              <rect x="60" y="100" width="280" height="200" rx="12" fill="black" />
            </mask>
          </defs>
          <rect width="400" height="400" fill="rgba(0,0,0,0.8)" mask="url(#skin-mask)" />
          <rect x="60" y="100" width="280" height="200" rx="4" fill="none" stroke="#ffffff" strokeWidth="1" />
          {/* Corner markers */}
          <path d="M60 120 L60 100 L80 100" fill="none" stroke="#ffffff" strokeWidth="2" />
          <path d="M320 100 L340 100 L340 120" fill="none" stroke="#ffffff" strokeWidth="2" />
          <path d="M340 280 L340 300 L320 300" fill="none" stroke="#ffffff" strokeWidth="2" />
          <path d="M80 300 L60 300 L60 280" fill="none" stroke="#ffffff" strokeWidth="2" />
          <text x="200" y="370" textAnchor="middle" fill="#ffffff" fontSize="11" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Center focus area
          </text>
        </svg>
      </div>
    );
  }

  // General guide — simple crosshair
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width="100%" height="100%" viewBox="0 0 400 400" className="w-full h-full">
        <line x1="200" y1="160" x2="200" y2="190" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <line x1="200" y1="210" x2="200" y2="240" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <line x1="160" y1="200" x2="190" y2="200" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <line x1="210" y1="200" x2="240" y2="200" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <circle cx="200" cy="200" r="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// STATUS / COMPLETE / ERROR VIEWS
// ─────────────────────────────────────────────

function StatusView({ icon, title, subtitle, showPulse }: {
  icon: string; title: string; subtitle: string; showPulse?: boolean;
}) {
  return (
    <div className="card max-w-sm w-full p-12 flex flex-col items-center text-center gap-6 bg-background">
      <span className={cn("text-5xl", showPulse && "animate-pulse")}>{icon}</span>
      <h3 className="text-lg font-bold uppercase tracking-widest text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{subtitle}</p>
    </div>
  );
}

function CompleteView({ result, onDismiss }: { result: any; onDismiss: () => void }) {
  const isError = !result.success;

  return (
    <div className="card max-w-sm w-full p-12 flex flex-col items-center text-center gap-6 bg-background">
      <span className="text-5xl">{isError ? "⚠️" : "✅"}</span>
      <h3 className="text-lg font-bold uppercase tracking-widest text-text-primary">
        {isError ? "Analysis Issue" : "Analysis Complete"}
      </h3>
      <p className="text-sm text-text-secondary leading-relaxed">
        {isError
          ? result.error?.message || "The analysis encountered an issue"
          : "Results have been sent to the AI. Check the chat for interpretation."}
      </p>
      {result.pipeline && (
        <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
          {result.pipeline.totalPasses} analysis passes
          {result.pipeline.backtrackEvents > 0 &&
            ` · ${result.pipeline.backtrackEvents} corrections`}
          {" · "}
          {(result.processingTimeMs / 1000).toFixed(1)}s
        </p>
      )}
      <button onClick={onDismiss} className="btn-primary w-full mt-4">
        Back to Chat
      </button>
    </div>
  );
}

function ErrorView({ error, request, onRetry, onDismiss }: {
  error: string; request: CaptureRequest; onRetry: () => void; onDismiss: () => void;
}) {
  return (
    <div className="card max-w-sm w-full p-12 flex flex-col items-center text-center gap-6 bg-background">
      <span className="text-5xl">📷</span>
      <h3 className="text-lg font-bold uppercase tracking-widest text-text-primary">Capture Failed</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{error}</p>
      <div className="flex gap-3 w-full">
        <button onClick={onDismiss} className="btn-secondary flex-1">Cancel</button>
        <button onClick={onRetry} className="btn-primary flex-1">Try Again</button>
      </div>
    </div>
  );
}

export default VisionCaptureUI;
