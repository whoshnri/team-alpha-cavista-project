"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    HeartPulse,
    Copy,
    Check,
    AlertTriangle,
    Smartphone,
    Info,
    ChevronRight,
    Activity,
    Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { VitalPulseLogo } from "@/components/pulse-print-logo";
import {
    ResponsiveContainer,
    RadialBarChart,
    PolarAngleAxis,
    RadialBar,
} from "recharts";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import type { HeartRateResult } from "@/lib/types";
import { processMotionData } from "@/lib/sensor-utils";
import { useIsMobile } from "@/hooks/use-mobile";

type AppState = "idle" | "scanning" | "permission_denied" | "unsupported" | "complete";

interface GenericAccelerometer {
    start: () => void;
    stop: () => void;
    addEventListener: (event: 'reading' | 'error', listener: (event?: any) => void) => void;
    removeEventListener: (event: 'reading' | 'error', listener: (event?: any) => void) => void;
    x?: number;
    y?: number;
    z?: number;
}

interface VitalPulseScannerProps {
    onComplete?: (results: HeartRateResult) => void;
}

export function VitalPulseScanner({ onComplete }: VitalPulseScannerProps) {
    const [appState, setAppState] = useState<AppState>("idle");
    const [results, setResults] = useState<HeartRateResult | null>(null);
    const [countdown, setCountdown] = useState(30);
    const [isCopied, setIsCopied] = useState(false);
    const [errorMessages, setErrorMessages] = useState<string[]>([]);

    const isMobile = useIsMobile();
    const motionData = useRef<{ x: number[], y: number[], z: number[] }>({ x: [], y: [], z: [] });
    const sensorRef = useRef<GenericAccelerometer | null>(null);
    const { toast } = useToast();

    const SENSOR_FREQUENCY = 60;

    const cleanupSensors = useCallback(() => {
        if (sensorRef.current) {
            try {
                sensorRef.current.stop();
            } catch (e) {
                console.warn("Sensor already stopped or failed to stop:", e);
            }
            sensorRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => cleanupSensors();
    }, [cleanupSensors]);

    const startScan = async () => {
        setCountdown(30);
        motionData.current = { x: [], y: [], z: [] };
        setErrorMessages([]);

        let permissionGranted = false;

        // iOS/iPadOS specific permission request
        // @ts-ignore
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                // @ts-ignore
                const permissionState = await DeviceMotionEvent.requestPermission();
                if (permissionState === 'granted') {
                    permissionGranted = true;
                } else {
                    setErrorMessages(['On iOS, permission to access motion sensors is required. Please grant permission in Safari settings and refresh the page.']);
                    setAppState('permission_denied');
                    return;
                }
            } catch (error) {
                console.error("Error requesting iOS motion permissions:", error);
                setErrorMessages(['An error occurred while requesting sensor permissions. Please try again.']);
                setAppState('permission_denied');
                return;
            }
        } else if ('permissions' in navigator) {
            try {
                // @ts-ignore
                const permissionStatus = await navigator.permissions.query({ name: 'accelerometer' });
                if (permissionStatus.state === 'granted') {
                    permissionGranted = true;
                } else if (permissionStatus.state === 'denied') {
                    setErrorMessages(['Permission to access motion sensors was denied. Please enable it in your browser settings and refresh the page.']);
                    setAppState('permission_denied');
                    return;
                } else {
                    permissionGranted = true;
                }
            } catch (e) {
                permissionGranted = true;
            }
        } else {
            permissionGranted = true;
        }

        if (!permissionGranted) {
            setErrorMessages(['Could not obtain permission for motion sensors.']);
            setAppState('permission_denied');
            return;
        }

        try {
            if (!('Accelerometer' in window)) {
                setErrorMessages(["Your browser does not support the required motion sensor API. Please use a modern browser like Chrome or Safari."]);
                setAppState("unsupported");
                return;
            }

            setAppState("scanning");

            // @ts-ignore
            const sensor = new Accelerometer({ frequency: SENSOR_FREQUENCY });
            sensorRef.current = sensor;

            sensor.addEventListener('error', (event: any) => {
                console.error('Accelerometer error:', event.error);
                if (event.error.name === 'NotAllowedError') {
                    setErrorMessages(["Permission to access motion sensors was denied. Please enable it in your browser settings and refresh the page."]);
                } else if (event.error.name === 'NotReadableError') {
                    setErrorMessages(["The motion sensor is currently unavailable. Another application or tab might be using it."]);
                } else {
                    setErrorMessages([`Sensor Error: ${event.error.name}. Try refreshing the page.`]);
                }
                setAppState('permission_denied');
                cleanupSensors();
            });

            sensor.addEventListener('reading', () => {
                if (sensorRef.current) {
                    motionData.current.x.push(sensorRef.current.x || 0);
                    motionData.current.y.push(sensorRef.current.y || 0);
                    motionData.current.z.push(sensorRef.current.z || 0);
                }
            });

            sensor.start();

            const SCAN_DURATION = 30000;
            const countdownTimer = setInterval(() => {
                setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);

            setTimeout(() => {
                clearInterval(countdownTimer);
                cleanupSensors();

                if (motionData.current.z.length < SENSOR_FREQUENCY * 5) {
                    setErrorMessages(["Failed to collect enough data from the motion sensor. Please ensure your phone was held still."]);
                    setAppState("permission_denied");
                    return;
                }

                const heartRateData = processMotionData(motionData.current, SENSOR_FREQUENCY);

                const finalResults: HeartRateResult = {
                    scan_id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    duration_seconds: 30,
                    heart_rate: heartRateData,
                    device_info: {
                        sensor_available: true,
                        user_agent: navigator.userAgent,
                    },
                };

                // If onComplete callback is provided, send data back silently
                if (onComplete) {
                    onComplete(finalResults);
                    return;
                }

                setResults(finalResults);
                setAppState("complete");
            }, SCAN_DURATION);

        } catch (error: any) {
            console.error("Sensor initialization failed:", error);
            let errorMessage = "An unknown error occurred while trying to access the motion sensor.";
            let finalState: AppState = "permission_denied";

            if (error.name === 'SecurityError') {
                errorMessage = "Access to motion sensors is blocked. This feature requires a secure connection (HTTPS).";
            } else if (error.name === 'ReferenceError' || error.name === 'TypeError') {
                errorMessage = "This browser does not support the required motion sensor API.";
                finalState = "unsupported";
            } else {
                errorMessage = `An unexpected error occurred: ${error.name}. Please try again.`;
            }
            setErrorMessages([errorMessage]);
            setAppState(finalState);
            cleanupSensors();
        }
    };

    const handleCopy = () => {
        if (results) {
            navigator.clipboard.writeText(JSON.stringify(results, null, 2));
            setIsCopied(true);
            toast({ title: "Copied!", description: "Raw data copied to clipboard." });
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleScanAgain = () => {
        setAppState("idle");
        setResults(null);
        setErrorMessages([]);
    };

    const renderIdle = () => (
        <div className="flex flex-col items-center justify-center h-full w-full">
            <div className="space-y-8 flex flex-col items-center">
                <div className="w-12 h-12 border border-border flex items-center justify-center rounded-lg">
                    <HeartPulse className="w-6 h-6 text-white" />
                </div>
                <button
                    className="button-primary w-48"
                    onClick={startScan}
                    disabled={appState !== 'idle' || isMobile === false}
                >
                    Initialize Scan
                </button>
            </div>
            {isMobile === false && (
                <p className="section-label mt-8 text-[#ff4444]">
                    Smartphone Required
                </p>
            )}
        </div>
    );

    const renderScanning = () => {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full gap-12">
                <div className="relative flex items-center justify-center">
                    <div className="absolute w-44 h-44 rounded-full border border-white/5 loading-pulse" />
                    <span className="text-8xl font-bold tabular-nums text-white tracking-tighter metric-value">
                        {countdown}
                    </span>
                </div>

                <div className="space-y-3 text-center">
                    <h2 className="text-xl font-bold tracking-tight text-white uppercase">
                        Stay Still
                    </h2>
                    <p className="section-label">
                        Pulse acquisition active
                    </p>
                </div>
            </div>
        );
    };

    const renderPermissionDenied = () => (
        <div className="flex flex-col items-center text-center gap-6 p-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-4 bg-red-500/10 rounded-full">
                <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
                    Sensor Access Denied
                </h1>
                <div className="bg-white/5 border border-white/10 p-3 rounded-lg space-y-2">
                    {errorMessages.map((msg, i) => (
                        <p key={i} className="text-[11px] text-[#8A8F98] leading-relaxed">{msg}</p>
                    ))}
                </div>
            </div>
            <Button
                onClick={handleScanAgain}
                className="bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl px-8"
            >
                Try Again
            </Button>
        </div>
    );

    const renderUnsupported = () => (
        <div className="flex flex-col items-center text-center gap-6 p-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-4 bg-[#5E6AD2]/10 rounded-full">
                <Smartphone className="w-12 h-12 text-[#5E6AD2]" />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                    Device Not Supported
                </h1>
                <div className="bg-white/5 border border-white/10 p-3 rounded-lg">
                    {errorMessages.map((msg, i) => (
                        <p key={i} className="text-[11px] text-[#8A8F98]">{msg}</p>
                    ))}
                </div>
            </div>
            <Button
                onClick={handleScanAgain}
                className="bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl px-8"
            >
                Go Back
            </Button>
        </div>
    );


    const renderComplete = () => {
        if (!results) return renderIdle();
        const { heart_rate } = results;

        return (
            <div className="flex flex-col items-center text-center gap-8 w-full max-w-sm">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-white uppercase">Scan Complete</h1>
                    <p className="section-label">Preliminary health data acquisition</p>
                </div>

                <div className="w-full card-overhaul p-8">
                    <div className="flex flex-col items-center gap-2 mb-8">
                        <span className="section-label">Heart Rate (BPM)</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-8xl font-bold text-white tracking-tighter metric-value leading-none">
                                {heart_rate.bpm > 0 ? heart_rate.bpm : '--'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-t border-border pt-8">
                        <div>
                            <p className="section-label mb-2">Confidence</p>
                            <p className="text-2xl font-bold text-white tracking-tight metric-value">
                                {Math.round(heart_rate.confidence * 100)}%
                            </p>
                        </div>
                        <div>
                            <p className="section-label mb-2">Signal</p>
                            <div className="flex items-center justify-center gap-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    heart_rate.signal_quality === 'good' ? "bg-white" :
                                        heart_rate.signal_quality === 'fair' ? "bg-white/40" : "bg-[#ff4444]"
                                )} />
                                <p className="text-sm font-bold text-white uppercase tracking-wider">
                                    {heart_rate.signal_quality}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center">
                        <span className="section-label mb-1">Median IBI</span>
                        <span className="text-lg font-bold text-white metric-value">{heart_rate.median_ibi_ms}ms</span>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center">
                        <span className="section-label mb-1">Peak Count</span>
                        <span className="text-lg font-bold text-white metric-value">{heart_rate.peaks_after_outlier_rejection}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4 w-full mt-4">
                    <button
                        onClick={handleScanAgain}
                        className="button-primary w-full"
                    >
                        New Acquisition
                    </button>

                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1" className="border-none">
                            <AccordionTrigger className="section-label py-4 hover:no-underline border-t border-border justify-center gap-2">
                                System Diagnostics
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="bg-black border border-border rounded-lg p-4 text-left relative group">
                                    <button
                                        className="absolute top-3 right-3 p-1.5 text-[#505050] hover:text-white transition-colors"
                                        onClick={handleCopy}
                                    >
                                        {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                    </button>
                                    <pre className="text-[10px] text-[#505050] whitespace-pre-wrap break-words font-mono overflow-y-auto max-h-32 custom-scrollbar">
                                        {JSON.stringify(results, null, 2)}
                                    </pre>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>
        );
    };


    const renderContent = () => {
        switch (appState) {
            case "scanning":
                return renderScanning();
            case "complete":
                return renderComplete();
            case "permission_denied":
                return renderPermissionDenied();
            case "unsupported":
                return renderUnsupported();
            case "idle":
            default:
                return renderIdle();
        }
    };

    return (
        <div className="relative w-full max-w-[420px] aspect-[9/14] bg-black border border-border rounded-lg overflow-hidden flex flex-col items-center justify-between p-12 select-none">
            <div className="flex-1 w-full flex flex-col items-center justify-center">
                {renderContent()}
            </div>
        </div>
    );
}
