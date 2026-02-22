// VisionCaptureUI.tsx — Real-time camera capture with guided overlays
// Renders inline in the chat when the AI triggers a capture tool call

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { CaptureState, CaptureRequest, CaptureGuidance } from "../../hooks/useVisionCapture";

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
    <div style={styles.overlay}>
      <div style={styles.container}>
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
    <div style={styles.promptCard}>
      <div style={styles.urgencyBadge}>
        {request.urgency === 'routine' ? 'Standard' : request.urgency === 'recommended' ? 'Priority' : 'Critical'}
      </div>

      <h3 style={styles.promptTitle}>{request.guidance.title}</h3>
      <p style={styles.promptReason}>{request.reason}</p>

      <div style={styles.instructionsList}>
        {request.guidance.instructions.map((inst: string, i: number) => (
          <div key={i} style={styles.instructionItem}>
            <span style={styles.instructionNumber}>{i + 1}</span>
            <span>{inst}</span>
          </div>
        ))}
      </div>

      <div style={styles.buttonRow}>
        <button onClick={onDecline} style={styles.declineButton}>
          Dismiss
        </button>
        <button onClick={onAccept} style={styles.acceptButton}>
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
      <div style={styles.cameraErrorCard}>
        <span style={{ fontSize: 40 }}>📷</span>
        <p style={styles.cameraErrorText}>{cameraError}</p>
        <button onClick={handleCancel} style={styles.declineButton}>Go Back</button>
      </div>
    );
  }

  return (
    <div style={styles.cameraContainer}>
      {/* Video feed */}
      <div style={styles.viewfinder}>
        <video
          ref={videoRef}
          style={styles.videoElement}
          playsInline
          muted
          autoPlay
        />

        {/* Photo overlay */}
        <CaptureOverlay type={guidance.overlay} />

        {/* Loading overlay */}
        {!cameraReady && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner} />
            <p>Starting camera...</p>
          </div>
        )}
      </div>

      {/* Instruction bar */}
      <div style={styles.instructionBar}>
        {guidance.instructions[0]}
      </div>

      {/* Controls */}
      <div style={styles.controlBar}>
        <button onClick={handleCancel} style={styles.cancelButton}>
          ✕
        </button>

        <button
          onClick={capturePhoto}
          style={styles.captureButton}
          disabled={!cameraReady}
        >
          <div style={styles.captureButtonInner} />
        </button>

        <div style={{ width: 44 }} /> {/* Spacer for alignment */}
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
      <div style={styles.overlayContainer}>
        <svg width="100%" height="100%" viewBox="0 0 400 400" style={styles.overlaySvg}>
          {/* Dark corners, clear circle in center */}
          <defs>
            <mask id="fundus-mask">
              <rect width="400" height="400" fill="white" />
              <circle cx="200" cy="200" r="130" fill="black" />
            </mask>
          </defs>
          <rect width="400" height="400" fill="rgba(0,0,0,0.8)" mask="url(#fundus-mask)" />
          <circle cx="200" cy="200" r="130" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="4 4" />
          <text x="200" y="370" textAnchor="middle" fill="#ffffff" fontSize="11" fontFamily="inherit" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Position subject in frame
          </text>
        </svg>
      </div>
    );
  }

  if (type === "skin_guide") {
    return (
      <div style={styles.overlayContainer}>
        <svg width="100%" height="100%" viewBox="0 0 400 400" style={styles.overlaySvg}>
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
          <text x="200" y="370" textAnchor="middle" fill="#ffffff" fontSize="11" fontFamily="inherit" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Center focus area
          </text>
        </svg>
      </div>
    );
  }

  // General guide — simple crosshair
  return (
    <div style={styles.overlayContainer}>
      <svg width="100%" height="100%" viewBox="0 0 400 400" style={styles.overlaySvg}>
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
    <div style={styles.statusCard}>
      <span style={{ fontSize: 48, ...(showPulse ? styles.pulse : {}) }}>{icon}</span>
      <h3 style={styles.statusTitle}>{title}</h3>
      <p style={styles.statusSubtitle}>{subtitle}</p>
    </div>
  );
}

function CompleteView({ result, onDismiss }: { result: any; onDismiss: () => void }) {
  const isError = !result.success;

  return (
    <div style={styles.statusCard}>
      <span style={{ fontSize: 48 }}>{isError ? "⚠️" : "✅"}</span>
      <h3 style={styles.statusTitle}>
        {isError ? "Analysis Issue" : "Analysis Complete"}
      </h3>
      <p style={styles.statusSubtitle}>
        {isError
          ? result.error?.message || "The analysis encountered an issue"
          : "Results have been sent to the AI. Check the chat for interpretation."}
      </p>
      {result.pipeline && (
        <p style={styles.pipelineInfo}>
          {result.pipeline.totalPasses} analysis passes
          {result.pipeline.backtrackEvents > 0 &&
            ` · ${result.pipeline.backtrackEvents} corrections`}
          {" · "}
          {(result.processingTimeMs / 1000).toFixed(1)}s
        </p>
      )}
      <button onClick={onDismiss} style={styles.acceptButton}>
        Back to Chat
      </button>
    </div>
  );
}

function ErrorView({ error, request, onRetry, onDismiss }: {
  error: string; request: CaptureRequest; onRetry: () => void; onDismiss: () => void;
}) {
  return (
    <div style={styles.statusCard}>
      <span style={{ fontSize: 48 }}>📷</span>
      <h3 style={styles.statusTitle}>Capture Failed</h3>
      <p style={styles.statusSubtitle}>{error}</p>
      <div style={styles.buttonRow}>
        <button onClick={onDismiss} style={styles.declineButton}>Cancel</button>
        <button onClick={onRetry} style={styles.acceptButton}>Try Again</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES (inline for portability — swap with your design system)
// ─────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.95)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "Inter, sans-serif",
  },
  container: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflow: "auto",
  },
  promptCard: {
    backgroundColor: "#000",
    borderRadius: 8,
    border: "1px solid #1a1a1a",
    padding: 32,
    color: "#fff",
  },
  urgencyBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    backgroundColor: "#1a1a1a",
    color: "#a0a0a0",
    marginBottom: 24,
    border: "1px solid #333",
  },
  promptTitle: {
    margin: "0 0 12px",
    fontSize: 20,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "-0.02em",
  },
  promptReason: {
    margin: "0 0 24px",
    fontSize: 14,
    color: "#a0a0a0",
    lineHeight: 1.6,
  },
  instructionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 32,
  },
  instructionItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    fontSize: 13,
    color: "#a0a0a0",
    lineHeight: 1.5,
  },
  instructionNumber: {
    flexShrink: 0,
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#1a1a1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 600,
    color: "#fff",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#fff",
    color: "#000",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    cursor: "pointer",
  },
  declineButton: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: 6,
    border: "1px solid #1a1a1a",
    backgroundColor: "transparent",
    color: "#505050",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    cursor: "pointer",
  },
  cameraContainer: {
    backgroundColor: "#000",
    borderRadius: 8,
    border: "1px solid #1a1a1a",
    overflow: "hidden",
  },
  viewfinder: {
    position: "relative",
    width: "100%",
    aspectRatio: "3/4",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  videoElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  overlayContainer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  overlaySvg: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    color: "#fff",
    gap: 16,
  },
  spinner: {
    width: 24,
    height: 24,
    border: "2px solid #1a1a1a",
    borderTopColor: "#fff",
    borderRadius: "50%",
  },
  instructionBar: {
    padding: "16px",
    backgroundColor: "#000",
    color: "#a0a0a0",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    textAlign: "center",
    borderTop: "1px solid #1a1a1a",
  },
  controlBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 48px",
    backgroundColor: "#000",
    borderTop: "1px solid #1a1a1a",
  },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    border: "1px solid #1a1a1a",
    backgroundColor: "transparent",
    color: "#505050",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    border: "2px solid #fff",
    backgroundColor: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  statusCard: {
    backgroundColor: "#000",
    borderRadius: 8,
    border: "1px solid #1a1a1a",
    padding: 48,
    color: "#fff",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  statusTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  statusSubtitle: {
    margin: 0,
    fontSize: 13,
    color: "#a0a0a0",
    lineHeight: 1.6,
  },
  pipelineInfo: {
    margin: 0,
    fontSize: 10,
    color: "#505050",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  cameraErrorCard: {
    backgroundColor: "#000",
    borderRadius: 8,
    border: "1px solid #1a1a1a",
    padding: 40,
    color: "#fff",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
  },
  cameraErrorText: {
    fontSize: 13,
    color: "#a0a0a0",
    lineHeight: 1.6,
    margin: 0,
  },
  pulse: {
    // handled by loading-pulse in globals.css if needed, 
    // but here we use monochrome icons
  },
};

export default VisionCaptureUI;
