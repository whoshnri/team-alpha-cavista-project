export type HeartRateResult = {
    scan_id: string;
    timestamp: string;
    duration_seconds: number;
    heart_rate: {
        bpm: number;
        signal_quality: 'good' | 'fair' | 'poor';
        peaks_detected: number;
        peaks_after_outlier_rejection: number;
        dominant_axis: 'x' | 'y' | 'z' | 'none';
        median_ibi_ms: number;
        ibi_std_dev_ms: number;
        confidence: number;
        method: 'BCG_accelerometer';
    };
    device_info: {
        sensor_available: boolean;
        user_agent: string;
    };
};
