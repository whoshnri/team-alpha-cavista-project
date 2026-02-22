import type { HeartRateResult } from "./types";

// --- Utility Functions ---

const calculateMean = (data: number[]): number => {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
};

const calculateStdDev = (data: number[], mean: number): number => {
    if (data.length < 2) return 0;
    return Math.sqrt(
        data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) /
        (data.length - 1)
    );
};

const calculateVariance = (data: number[]): number => {
    if (data.length < 2) return 0;
    const mean = calculateMean(data);
    return data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (data.length - 1);
};

const calculateMedian = (data: number[]): number => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
};


// --- DSP Signal Processing Functions ---

// 1. Detrending by subtracting a rolling mean
const detrend = (data: number[], windowSize: number): number[] => {
    const rollingMean: number[] = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
        const window = data.slice(start, end);
        rollingMean.push(calculateMean(window));
    }
    return data.map((val, i) => val - rollingMean[i]);
};

// 2. FIR Bandpass Filter (Windowed Sinc)
const bandpassFilter = (
    data: number[],
    options: {
        sampleRate: number;
        lowCutoff: number;
        highCutoff: number;
        taps: number;
    }
): number[] => {
    const { sampleRate, lowCutoff, highCutoff, taps } = options;
    const f1 = lowCutoff / sampleRate;
    const f2 = highCutoff / sampleRate;
    const M = taps - 1;

    // Generate bandpass filter coefficients using a windowed sinc function
    const coeffs: number[] = [];
    for (let i = 0; i <= M; i++) {
        const n = i - M / 2;
        // Sinc function for bandpass
        const h_n = n === 0
            ? 2 * (f2 - f1)
            : (2 * f2 * Math.sin(2 * Math.PI * f2 * n)) / (2 * Math.PI * f2 * n) -
            (2 * f1 * Math.sin(2 * Math.PI * f1 * n)) / (2 * Math.PI * f1 * n);

        // Hamming window
        const w_n = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / M);
        coeffs.push(h_n * w_n);
    }

    // Normalize coefficients
    const sum = coeffs.reduce((a, b) => a + b, 0);
    const normalizedCoeffs = coeffs.map(c => c / sum);

    // Apply filter via convolution
    const result = new Array(data.length).fill(0);
    for (let i = 0; i < data.length; i++) {
        let y = 0;
        for (let j = 0; j < normalizedCoeffs.length; j++) {
            if (i - j >= 0) {
                y += normalizedCoeffs[j] * data[i - j];
            }
        }
        result[i] = y;
    }
    return result;
};

// 3. Normalization to -1 to 1 range
const normalize = (data: number[]): number[] => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    if (max === min) return data.map(() => 0);
    return data.map(val => 2 * ((val - min) / (max - min)) - 1);
};


// 4. Stricter Peak Detection
const findPeaks = (
    data: number[],
    options: {
        sampleRate: number;
        minPeakDistanceMs: number;
        maxPeakIntervalMs: number;
    }
): number[] => {
    if (data.length === 0) return [];

    const { sampleRate, minPeakDistanceMs, maxPeakIntervalMs } = options;
    const mean = calculateMean(data);
    const stdDev = calculateStdDev(data, mean);
    const threshold = mean + 1.2 * stdDev;

    const minPeakDistanceSamples = Math.floor(minPeakDistanceMs / (1000 / sampleRate));

    const peaks: number[] = [];

    for (let i = 1; i < data.length - 1; i++) {
        const currentValue = data[i];

        // Check if it's a local maximum above the threshold
        if (currentValue > threshold && currentValue > data[i - 1] && currentValue > data[i + 1]) {
            if (peaks.length === 0) {
                peaks.push(i);
                continue;
            }

            const lastPeakIndex = peaks[peaks.length - 1];
            const distance = i - lastPeakIndex;

            // Enforce refractory period
            if (distance >= minPeakDistanceSamples) {
                peaks.push(i);
            }
        }
    }
    return peaks;
};


// --- Main BCG Processing Function ---

export const processMotionData = (
    motionData: { x: number[]; y: number[]; z: number[] },
    frequency: number
): HeartRateResult['heart_rate'] => {
    const SAMPLES_TO_ANALYZE_AXIS = frequency * 3; // First 3 seconds
    const SAMPLES_TO_DISCARD = frequency * 4; // First 4 seconds

    if (motionData.z.length < SAMPLES_TO_DISCARD + frequency) { // Need at least 5s total
        return { bpm: 0, signal_quality: 'poor' as const, peaks_detected: 0, peaks_after_outlier_rejection: 0, median_ibi_ms: 0, ibi_std_dev_ms: 0, confidence: 0, dominant_axis: 'none' as const, method: 'BCG_accelerometer' as const };
    }

    // 1. Dynamically select the axis with the highest variance
    const xVar = calculateVariance(motionData.x.slice(0, SAMPLES_TO_ANALYZE_AXIS));
    const yVar = calculateVariance(motionData.y.slice(0, SAMPLES_TO_ANALYZE_AXIS));
    const zVar = calculateVariance(motionData.z.slice(0, SAMPLES_TO_ANALYZE_AXIS));

    let dominantAxis: 'x' | 'y' | 'z' = 'z';
    let rawSignal = motionData.z;

    if (xVar > yVar && xVar > zVar) {
        dominantAxis = 'x';
        rawSignal = motionData.x;
    } else if (yVar > xVar && yVar > zVar) {
        dominantAxis = 'y';
        rawSignal = motionData.y;
    }

    // 2. Signal Pre-processing Pipeline
    const detrendedSignal = detrend(rawSignal, frequency); // Use 1-second window
    const filteredSignal = bandpassFilter(detrendedSignal, {
        sampleRate: frequency,
        lowCutoff: 0.8, // 48 BPM
        highCutoff: 3.5, // 210 BPM
        taps: 31,
    });
    const normalizedSignal = normalize(filteredSignal);

    // 3. Stricter Peak Detection (start after discarding initial samples)
    const analysisSignal = normalizedSignal.slice(SAMPLES_TO_DISCARD);
    const peakIndices = findPeaks(analysisSignal, {
        sampleRate: frequency,
        minPeakDistanceMs: 333, // ~180 BPM max
        maxPeakIntervalMs: 1500, // ~40 BPM min
    });

    const totalPeaksDetected = peakIndices.length;
    if (totalPeaksDetected < 5) {
        return { bpm: 0, signal_quality: 'poor' as const, peaks_detected: totalPeaksDetected, peaks_after_outlier_rejection: 0, median_ibi_ms: 0, ibi_std_dev_ms: 0, confidence: 0.1, dominant_axis: dominantAxis, method: 'BCG_accelerometer' as const };
    }

    // 4. Inter-Beat Interval (IBI) calculation and Outlier Rejection
    const sampleIntervalMs = 1000 / frequency;
    const ibis = peakIndices.slice(1).map((peak, i) => (peak - peakIndices[i]) * sampleIntervalMs);

    const medianIbi = calculateMedian(ibis);
    const lowerBound = medianIbi * 0.8;
    const upperBound = medianIbi * 1.2;
    const cleanIbis = ibis.filter(ibi => ibi >= lowerBound && ibi <= upperBound);

    const peaksAfterOutlierRejection = cleanIbis.length + 1;
    if (cleanIbis.length < 4) {
        return { bpm: 0, signal_quality: 'poor' as const, peaks_detected: totalPeaksDetected, peaks_after_outlier_rejection: peaksAfterOutlierRejection, median_ibi_ms: Math.round(medianIbi), ibi_std_dev_ms: 0, confidence: 0.2, dominant_axis: dominantAxis, method: 'BCG_accelerometer' as const };
    }

    // 5. Final BPM from clean median IBI
    const finalMedianIbi = calculateMedian(cleanIbis);

    if (finalMedianIbi <= 0) {
        return { bpm: 0, signal_quality: 'poor' as const, peaks_detected: totalPeaksDetected, peaks_after_outlier_rejection: peaksAfterOutlierRejection, median_ibi_ms: Math.round(finalMedianIbi), ibi_std_dev_ms: 0, confidence: 0.3, dominant_axis: dominantAxis, method: 'BCG_accelerometer' as const };
    }

    const bpm = 60000 / finalMedianIbi;

    // 6. Meaningful Confidence Score
    const ibiMean = calculateMean(cleanIbis);
    const ibiStdDev = calculateStdDev(cleanIbis, ibiMean);

    const peakCountFactor = Math.min(1.0, totalPeaksDetected / 20);
    const ibiConsistencyFactor = Math.max(0, 1 - (ibiStdDev / ibiMean));
    const signalQualityFactor = totalPeaksDetected > 0 ? cleanIbis.length / ibis.length : 0;

    const confidence = (peakCountFactor + ibiConsistencyFactor + signalQualityFactor) / 3;

    const signal_quality = (confidence > 0.65 ? 'good' : confidence > 0.4 ? 'fair' : 'poor') as 'good' | 'fair' | 'poor';

    return {
        bpm: Math.round(bpm),
        signal_quality,
        peaks_detected: totalPeaksDetected,
        peaks_after_outlier_rejection: peaksAfterOutlierRejection,
        dominant_axis: dominantAxis,
        median_ibi_ms: Math.round(finalMedianIbi),
        ibi_std_dev_ms: Math.round(ibiStdDev),
        confidence: Math.round(confidence * 100) / 100,
        method: 'BCG_accelerometer' as const,
    };
};
