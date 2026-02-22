// VisionCaptureUI.tsx — Real-time camera capture with guided overlays
// Renders inline in the chat when the AI triggers a capture tool call

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { CaptureState, CaptureRequest, CaptureGuidance } from "./useVisionCapture";

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
  const urgencyColors = {
    routine: "#6B7280",
    recommended: "#2563EB",
    important: "#DC2626",
  };

  return (
    <div style={styles.promptCard}>
      <div style={{ ...styles.urgencyBadge, backgroundColor: urgencyColors[request.urgency] }}>
        {request.urgency.toUpperCase()}
      </div>

      <h3 style={styles.promptTitle}>{request.guidance.title}</h3>
      <p style={styles.promptReason}>{request.reason}</p>

      <div style={styles.instructionsList}>
        {request.guidance.instructions.map((inst, i) => (
          <div key={i} style={styles.instructionItem}>
            <span style={styles.instructionNumber}>{i + 1}</span>
            <span>{inst}</span>
          </div>
        ))}
      </div>

      <div style={styles.captureInfo}>
        {request.guidance.captureMode === "video" ? "📹" : "📷"}
        {" "}
        {request.guidance.captureMode === "video"
          ? `Video capture (${request.guidance.duration || 10}s)`
          : "Photo capture"}
      </div>

      <div style={styles.buttonRow}>
        <button onClick={onDecline} style={styles.declineButton}>
          Not now
        </button>
        <button onClick={onAccept} style={styles.acceptButton}>
          Open Camera
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const isVideo = guidance.captureMode === "video";
  const maxDuration = guidance.duration || 10;

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

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingTime((t) => {
        if (t + 1 >= maxDuration) {
          stopRecording();
          return maxDuration;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording, maxDuration]);

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

  // ── VIDEO RECORDING ──
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `capture_${Date.now()}.webm`, { type: "video/webm" });
      stream.getTracks().forEach((t) => t.stop());
      onCapture(file);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(1000); // Collect in 1s chunks
    setIsRecording(true);
    setRecordingTime(0);
  }, [onCapture]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleCancel = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current?.stop();
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

        {/* Guide overlay */}
        <CaptureOverlay type={guidance.overlay} />

        {/* Recording indicator */}
        {isRecording && (
          <div style={styles.recordingIndicator}>
            <span style={styles.recordingDot} />
            REC {recordingTime}s / {maxDuration}s
          </div>
        )}

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

        {isVideo ? (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            style={{
              ...styles.captureButton,
              backgroundColor: isRecording ? "#DC2626" : "#fff",
            }}
            disabled={!cameraReady}
          >
            <div style={{
              width: isRecording ? 20 : 16,
              height: isRecording ? 20 : 16,
              borderRadius: isRecording ? 4 : 20,
              backgroundColor: isRecording ? "#fff" : "#DC2626",
            }} />
          </button>
        ) : (
          <button
            onClick={capturePhoto}
            style={styles.captureButton}
            disabled={!cameraReady}
          >
            <div style={styles.captureButtonInner} />
          </button>
        )}

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
          <rect width="400" height="400" fill="rgba(0,0,0,0.5)" mask="url(#fundus-mask)" />
          <circle cx="200" cy="200" r="130" fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="8 4" />
          <text x="200" y="370" textAnchor="middle" fill="#22C55E" fontSize="14" fontFamily="sans-serif">
            Align eye within circle
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
          <rect width="400" height="400" fill="rgba(0,0,0,0.4)" mask="url(#skin-mask)" />
          <rect x="60" y="100" width="280" height="200" rx="12" fill="none" stroke="#3B82F6" strokeWidth="2" />
          {/* Corner markers */}
          <path d="M60 120 L60 100 L80 100" fill="none" stroke="#3B82F6" strokeWidth="3" />
          <path d="M320 100 L340 100 L340 120" fill="none" stroke="#3B82F6" strokeWidth="3" />
          <path d="M340 280 L340 300 L320 300" fill="none" stroke="#3B82F6" strokeWidth="3" />
          <path d="M80 300 L60 300 L60 280" fill="none" stroke="#3B82F6" strokeWidth="3" />
          <text x="200" y="370" textAnchor="middle" fill="#3B82F6" fontSize="14" fontFamily="sans-serif">
            Center affected area in frame
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
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflow: "auto",
  },
  promptCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 24,
    color: "#fff",
  },
  urgencyBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: "#fff",
    marginBottom: 16,
  },
  promptTitle: {
    margin: "0 0 8px",
    fontSize: 22,
    fontWeight: 700,
  },
  promptReason: {
    margin: "0 0 20px",
    fontSize: 15,
    color: "#A0A0B8",
    lineHeight: 1.5,
  },
  instructionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 20,
  },
  instructionItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 14,
    color: "#D0D0E0",
    lineHeight: 1.4,
  },
  instructionNumber: {
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
  },
  captureInfo: {
    padding: "10px 14px",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    fontSize: 14,
    color: "#A0A0B8",
    marginBottom: 20,
    textAlign: "center",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#3B82F6",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  declineButton: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "transparent",
    color: "#A0A0B8",
    fontSize: 16,
    cursor: "pointer",
  },
  cameraContainer: {
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
  },
  viewfinder: {
    position: "relative",
    width: "100%",
    aspectRatio: "3/4",
    backgroundColor: "#111",
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
  recordingIndicator: {
    position: "absolute",
    top: 16,
    left: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 20,
    backgroundColor: "rgba(220,38,38,0.9)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "#fff",
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    // Note: animation needs CSS keyframes — add to your stylesheet:
    // @keyframes spin { to { transform: rotate(360deg) } }
    // animation: "spin 0.8s linear infinite",
  },
  instructionBar: {
    padding: "12px 16px",
    backgroundColor: "#1a1a2e",
    color: "#A0A0B8",
    fontSize: 13,
    textAlign: "center",
  },
  controlBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 40px",
    backgroundColor: "#000",
  },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.2)",
    backgroundColor: "transparent",
    color: "#fff",
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
    border: "3px solid #fff",
    backgroundColor: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    border: "2px solid #333",
  },
  statusCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    color: "#fff",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  statusTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  statusSubtitle: {
    margin: 0,
    fontSize: 14,
    color: "#A0A0B8",
    lineHeight: 1.5,
  },
  pipelineInfo: {
    margin: 0,
    fontSize: 12,
    color: "#666",
  },
  cameraErrorCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    color: "#fff",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  cameraErrorText: {
    fontSize: 14,
    color: "#A0A0B8",
    lineHeight: 1.5,
    margin: 0,
  },
  pulse: {
    // Add to stylesheet: @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
    // animation: "pulse 1.5s ease-in-out infinite",
  },
};

export default VisionCaptureUI;
