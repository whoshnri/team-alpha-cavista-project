'use client';

/**
 * VitalThread Engine
 * Backend logic for motion collection, signal processing, and synchronization.
 */

export const CONFIG = {
  user_id: null as string | null,
  endpoint: "/api/gait/log",
  sync_interval_ms: 5000,
  snapshot_interval_ms: 120000, 
  max_local_snapshots: 720,
  sampling_rate_hz: 10,
  app_version: "1.2.0"
};

let sampleBuffer: any[] = [];
let previousSnapshots: any[] = [];
let snapshotInterval: NodeJS.Timeout | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let isCollecting = false;
let wakeLock: any = null;
let motionPermissionGranted = false;

const MAX_BUFFER_SIZE = 1200;
const QUEUE_KEY = 'vitalthread_queue';
const SYNCED_KEY = 'vitalthread_synced';

// --- Step 1: Permission Handling ---
export async function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
    typeof (DeviceMotionEvent as any).requestPermission === 'function') {
    try {
      const permission = await (DeviceMotionEvent as any).requestPermission();
      motionPermissionGranted = permission === 'granted';
      return motionPermissionGranted;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  if (typeof DeviceMotionEvent !== 'undefined') {
    motionPermissionGranted = true;
    return true;
  }

  return false;
}

// --- Step 2 & 16: Monitoring Control ---
export async function startMonitoring(userId: string) {
  CONFIG.user_id = userId;
  localStorage.setItem('vitalthread_user_id', userId);

  const permitted = await requestMotionPermission();
  if (!permitted) return false;

  await requestWakeLock();
  startCollection();
  startSyncWorker();
  return true;
}

export function stopMonitoring() {
  stopCollection();
  stopSyncWorker();
  releaseWakeLock();
}

function startCollection() {
  if (!motionPermissionGranted || isCollecting) return;

  isCollecting = true;
  sampleBuffer = [];

  window.addEventListener('devicemotion', onDeviceMotion);

  snapshotInterval = setInterval(() => {
    // Analysis triggers every 2 minutes
    if (sampleBuffer.length >= 100) {
      const snapshot = processSnapshot();
      if (snapshot) {
        saveToLocalStorage(snapshot);
        sampleBuffer = [];
      }
    }
  }, CONFIG.snapshot_interval_ms);
}

function stopCollection() {
  isCollecting = false;
  window.removeEventListener('devicemotion', onDeviceMotion);
  if (snapshotInterval) clearInterval(snapshotInterval);
  sampleBuffer = [];
}

function onDeviceMotion(event: DeviceMotionEvent) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  const sample = {
    t: Date.now(),
    x: acc.x ?? 0,
    y: acc.y ?? 0,
    z: acc.z ?? 0
  };

  sampleBuffer.push(sample);
  if (sampleBuffer.length > MAX_BUFFER_SIZE) {
    sampleBuffer.shift();
  }
}

// --- Step 3: Math Utilities ---
function mean(arr: number[]) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const v = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
  return Math.sqrt(v);
}

function variance(arr: number[]) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
}

function magnitude(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

function rollingMean(arr: number[], windowSize: number) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = arr.slice(start, i + 1);
    return mean(window);
  });
}

function detrend(arr: number[]) {
  const rolling = rollingMean(arr, 20);
  return arr.map((val, i) => val - rolling[i]);
}

function normalize(arr: number[]) {
  const max = Math.max(...arr.map(Math.abs));
  if (max === 0) return arr;
  return arr.map(v => v / max);
}

function getSampleRate(timestamps: number[]) {
  if (timestamps.length < 2) return 10;
  const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
  return timestamps.length / duration;
}

function rejectVibrationPeaks(peaks: any[], minIntervalMs: number, sampleRateHz: number) {
  if (peaks.length < 2) return peaks;
  const minSamples = Math.round((minIntervalMs / 1000) * sampleRateHz);
  const filtered = [peaks[0]];
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i].index - filtered[filtered.length - 1].index >= minSamples) {
      filtered.push(peaks[i]);
    }
  }
  return filtered;
}

function applyBandpassFilter(signal: number[], low?: number, high?: number, fs?: number) {
  const coefficients = [
    -0.0029, -0.0051, -0.0057, -0.0030, 0.0038, 0.0131,
    0.0218, 0.0259, 0.0218, 0.0083, -0.0131, -0.0381,
    -0.0580, -0.0660, -0.0534, 0.0000, 0.0677, 0.1430,
    0.2093, 0.2561, 0.2750, 0.2561, 0.2093, 0.1430,
    0.0677, 0.0000, -0.0534, -0.0660, -0.0580, -0.0381,
    -0.0131
  ];

  const output = new Array(signal.length).fill(0);
  for (let i = 0; i < signal.length; i++) {
    for (let j = 0; j < coefficients.length; j++) {
      if (i - j >= 0) {
        output[i] += coefficients[j] * signal[i - j];
      }
    }
  }
  return output;
}

const bandpassFilter = applyBandpassFilter;

function detectPeaks(signal: number[], options: any = {}) {
  const {
    minDistanceMs = 333,
    threshold = 1.2,
    sampleRateMs = 100
  } = options;

  const minDistanceSamples = Math.floor(minDistanceMs / sampleRateMs);
  const signalMean = mean(signal);
  const signalStd = stdDev(signal);
  const peakThreshold = signalMean + threshold * signalStd;

  const peaks = [];
  let lastPeakIndex = -minDistanceSamples;

  for (let i = 1; i < signal.length - 1; i++) {
    const isPeak = signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] > peakThreshold;

    if (isPeak && (i - lastPeakIndex) >= minDistanceSamples) {
      peaks.push({ index: i, value: signal[i], timeMs: i * sampleRateMs });
      lastPeakIndex = i;
    }
  }
  return peaks;
}

function getDominantAxis(samples: any[]) {
  const slice = samples.slice(0, 30);
  const xVar = variance(slice.map(s => s.x));
  const yVar = variance(slice.map(s => s.y));
  const zVar = variance(slice.map(s => s.z));

  if (xVar >= yVar && xVar >= zVar) return 'x';
  if (yVar >= xVar && yVar >= zVar) return 'y';
  return 'z';
}

function classifyActivity(magnitudes: number[]) {
  const m = mean(magnitudes);
  const s = stdDev(magnitudes);

  if (m >= 9.5 && m <= 10.1 && s < 0.15) return 'stationary';
  if (s >= 0.15 && s < 0.8) return 'fidgeting';
  if (s >= 0.8 && s <= 2.5) return 'walking';
  if (s > 2.5) return 'active';
  return 'unknown';
}

function calculateGaitRegularity(peaks: any[]) {
  if (peaks.length < 3) return 100;
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i].timeMs - peaks[i - 1].timeMs);
  }
  const intervalStd = stdDev(intervals);
  const score = Math.max(0, Math.round(100 - (intervalStd * 20)));
  return peaks?.length > 2 && score === 0 ? 10 : score;
}

function estimateCalories(activityClassification: string, durationMinutes: number, weightKg = 70) {
  const MET: Record<string, number> = {
    stationary: 1.0,
    fidgeting: 1.5,
    walking: 3.5,
    active: 5.0,
    unknown: 1.2
  };
  const met = MET[activityClassification] || 1.2;
  return parseFloat((met * 0.0175 * weightKg * durationMinutes).toFixed(2));
}

function detectAnomalies(activity: string, stdDevMag: number, gaitScore: number | null) {
  return {
    prolonged_stillness: activity === 'stationary' && stdDevMag < 0.05,
    high_variability: stdDevMag > 4.0,
    irregular_gait: activity === 'walking' && gaitScore !== null && gaitScore < 50
  };
}

// --- Step 12: Master Processor ---
function processSnapshot(): any {
  const samples = [...sampleBuffer];
  if (samples.length < 50) return null;

  const timestamps = samples.map(s => s.t);
  const xArr = samples.map(s => s.x);
  const yArr = samples.map(s => s.y);
  const zArr = samples.map(s => s.z);
  const magnitudes = samples.map(s => magnitude(s.x, s.y, s.z));

  const magnitudeStdDev = stdDev(magnitudes);
  const isMoving = magnitudeStdDev > 0.15;
  const activity = classifyActivity(magnitudes);
  const fs = getSampleRate(timestamps);
  const dominantAxis = getDominantAxis(samples);

  let stepsEstimated = 0;
  let gaitScore: number | null = null;
  let gaitFiltered: number[] = [];

  if (isMoving) {
    gaitFiltered = applyBandpassFilter(detrend(magnitudes), 0.5, 4.0, fs);
    const gaitNormalized = normalize(gaitFiltered);
    const magnitudePeaks = detectPeaks(gaitNormalized, {
      minDistanceMs: 250,
      threshold: 0.25
    });
    const cleanPeaks = rejectVibrationPeaks(magnitudePeaks, 300, fs);
    stepsEstimated = cleanPeaks.length;
    gaitScore = calculateGaitRegularity(cleanPeaks);
  }

  const windowDurationMinutes = samples.length / (CONFIG.sampling_rate_hz * 60);
  const estimatedCalories = estimateCalories(activity, windowDurationMinutes);
  const anomalyFlags = detectAnomalies(activity, magnitudeStdDev, gaitScore);

  const snapshot = {
    snapshot_id: crypto.randomUUID(),
    user_id: CONFIG.user_id,
    timestamp: new Date().toISOString(),
    window_duration_seconds: Math.round(samples.length / 10),
    sample_count: samples.length,
    activity_classification: activity,
    steps_estimated: stepsEstimated,
    dominant_axis: dominantAxis,
    mean_magnitude: parseFloat(mean(magnitudes).toFixed(4)),
    std_dev_magnitude: parseFloat(magnitudeStdDev.toFixed(4)),
    gait_regularity_score: gaitScore,
    fatigue_index: gaitScore !== null ? Math.round((100 - gaitScore) / 4) : 0,
    estimated_calories: estimatedCalories,
    anomaly_flags: anomalyFlags,
    raw_summary: {
      x_mean: parseFloat(mean(xArr).toFixed(4)),
      y_mean: parseFloat(mean(yArr).toFixed(4)),
      z_mean: parseFloat(mean(zArr).toFixed(4)),
      x_variance: parseFloat(variance(xArr).toFixed(4)),
      y_variance: parseFloat(variance(yArr).toFixed(4)),
      z_variance: parseFloat(variance(zArr).toFixed(4))
    },
    synced: false,
    sync_attempts: 0,
    last_sync_attempt: null
  };

  if (isMoving) {
    console.log('GAIT DEBUG', {
      totalSamples: magnitudes.length,
      sampleRateHz: fs.toFixed(1),
      rawStdDev: magnitudeStdDev.toFixed(3),
      filteredStdDev: stdDev(gaitFiltered).toFixed(3),
      isMoving,
      estimatedSteps: stepsEstimated,
      gaitScore: gaitScore
    });
  }

  previousSnapshots.unshift(snapshot);
  if (previousSnapshots.length > 3) previousSnapshots.pop();

  return snapshot;
}

// --- Step 13: LocalStorage Manager ---
function saveToLocalStorage(snapshot: any) {
  if (!snapshot || !snapshot.snapshot_id) return;
  const queue = getQueue();
  queue.push(snapshot);
  if (queue.length > CONFIG.max_local_snapshots) {
    const syncedIdx = queue.findIndex((s: any) => s.synced);
    if (syncedIdx > -1) queue.splice(syncedIdx, 1);
    else queue.shift();
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  console.log(`[VitalThread] Stashed snapshot: ${snapshot.snapshot_id} (Queue size: ${queue.length})`);
}

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function markAsSynced(snapshotIds: string[]) {
  let queue = getQueue();
  queue = queue.map((s: any) => snapshotIds.includes(s.snapshot_id) ? { ...s, synced: true } : s);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

  let synced = [];
  try { synced = JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]'); } catch { synced = []; }
  synced.push(...snapshotIds);
  localStorage.setItem(SYNCED_KEY, JSON.stringify(synced.slice(-50)));
}

function incrementSyncAttempts(snapshotIds: string[]) {
  let queue = getQueue();
  queue = queue.map((s: any) => snapshotIds.includes(s.snapshot_id) ? {
    ...s,
    sync_attempts: (s.sync_attempts || 0) + 1,
    last_sync_attempt: new Date().toISOString()
  } : s);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// --- Step 14 & 15: Workers & Wake Lock ---
function startSyncWorker() {
  syncInterval = setInterval(attemptSync, CONFIG.sync_interval_ms);
  window.addEventListener('online', attemptSync);
}

function stopSyncWorker() {
  if (syncInterval) clearInterval(syncInterval);
  window.removeEventListener('online', attemptSync);
}

export async function attemptSync() {
  if (!navigator.onLine) return;
  const unsynced = getQueue().filter((s: any) => !s.synced && (s.sync_attempts || 0) <= 10);
  if (unsynced.length === 0) return;

  const batch = unsynced.slice(0, 5);
  const batchIds = batch.map((s: any) => s.snapshot_id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const token = localStorage.getItem('vitalthread_token');
    const res = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ user_id: CONFIG.user_id, batch }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log(`[VitalThread] Sync successful: ${batch.length} logs sent.`);
      markAsSynced(batchIds);
    }
    else {
      console.warn(`[VitalThread] Sync failed: Status ${res.status}`);
      incrementSyncAttempts(batchIds);
    }
  } catch (err) {
    clearTimeout(timeout);
    incrementSyncAttempts(batchIds);
    registerBackgroundSync();
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await (navigator as any).wakeLock.request('screen'); }
  catch (err) { console.warn('Wake lock failed'); }
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

export async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) await (reg as any).sync.register('sync-motion-logs');
  } catch (err) { }
}

export function injectPWA() {
  injectMetaTags();
  injectManifest();
  registerServiceWorker();
}

function injectMetaTags() {
  const tags = [
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'theme-color', content: '#00ff88' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
  ];
  tags.forEach(({ name, content }) => {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  });
}

function injectManifest() {
  const manifest = {
    name: "VitalThread",
    short_name: "VitalThread",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#00ff88",
    icons: [{ src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='24' fill='%230a0a0a'/><circle cx='96' cy='96' r='60' fill='none' stroke='%2300ff88' stroke-width='8'/></svg>", sizes: "192x192", type: "image/svg+xml" }]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = url;
  document.head.appendChild(link);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(() => {
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data.type === 'TRIGGER_SYNC') attemptSync();
      });
    })
    .catch(err => {
      console.error('ServiceWorker registration failed:', err);
    });
}
