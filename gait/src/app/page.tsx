'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, RefreshCw, ChevronDown, ChevronUp, Smartphone, Power } from "lucide-react";
import { CONFIG, startMonitoring, stopMonitoring, attemptSync, getQueue, injectPWA } from "@/lib/vital-thread-engine";
import { cn } from "@/lib/utils";
import { usePWASSE } from "@/hooks/use-pwa-sse";

const API_BASE_URL = "http://localhost:4000";

export default function VitalThread() {
  const [userId, setUserId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const [sensorStatus, setSensorStatus] = useState<'unknown' | 'detected' | 'missing'>('unknown');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  usePWASSE(userId);

  useEffect(() => {
    injectPWA();

    const savedId = localStorage.getItem('vitalthread_user_id');
    const token = localStorage.getItem('vitalthread_token');

    if (savedId && token) {
      setUserId(savedId);
      CONFIG.user_id = savedId;
      setOnboarded(true);
    }

    const interval = setInterval(() => {
      setQueue(getQueue());
    }, 2000);

    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('token');

    const validateMagicLink = async (token: string) => {
      setLoginLoading(true);
      try {
        const res = await fetch(`/api/gait/validate-magic-link?token=${token}`);
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('vitalthread_token', data.token);
          localStorage.setItem('vitalthread_user_id', data.userId);
          setUserId(data.userId);
          CONFIG.user_id = data.userId;
          setOnboarded(true);
          handleToggleMonitoring(data.userId); // Auto-start monitoring
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        console.error("[Magic Link] Validation failed", err);
      } finally {
        setLoginLoading(false);
      }
    };

    if (magicToken) {
      validateMagicLink(magicToken);
    } else if (params.get('action') === 'start' && savedId) {
      handleToggleMonitoring(savedId);
    }

    return () => clearInterval(interval);
  }, []);

  const handleToggleMonitoring = async (uid: string) => {
    if (isMonitoring) {
      stopMonitoring();
      setIsMonitoring(false);
    } else {
      const success = await startMonitoring(uid);
      if (success) {
        setIsMonitoring(true);
        setSensorStatus('detected');
      } else {
        setSensorStatus('missing');
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const formData = new FormData(e.target as HTMLFormElement);
    const phoneNumber = formData.get('phone') as string;
    const password = formData.get('password') as string;

    // will use a hook in production
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, password })
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem('vitalthread_token', data.token);
        localStorage.setItem('vitalthread_user_id', data.user.id);
        setUserId(data.user.id);
        CONFIG.user_id = data.user.id;
        setOnboarded(true);
        console.log(`[VitalThread] Login successful for ${data.user.fullName}`);
      } else {
        setLoginError(data.error || "Login failed");
      }

    } catch (err: any) {
      setLoginError("Connection refused by server");
      console.error("[Login Error]", err);
    } finally {
      setLoginLoading(false);
    }
  };

  const stats = {
    steps: queue.reduce((acc, s) => acc + (s.steps_estimated || 0), 0),
    queued: queue.filter(s => !s.synced).length,
  };

  if (!onboarded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-black">
        <div className="max-w-sm w-full space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-5xl font-black tracking-tighter italic text-white">VitalThread</h1>
            <p className="text-zinc-500">Sign in to start monitoring</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Input name="phone" placeholder="Phone Number" required className="bg-zinc-900 border-none h-12 text-center text-lg text-white" />
              <Input name="password" type="password" placeholder="Password" required className="bg-zinc-900 border-none h-12 text-center text-lg text-white" />
            </div>
            {loginError && <p className="text-red-500 text-xs font-bold uppercase tracking-wider">{loginError}</p>}
            <Button type="submit" disabled={loginLoading} className="w-full h-12 text-lg font-bold bg-white text-black hover:bg-zinc-200">
              {loginLoading ? "Authenticating..." : "Login"}
            </Button>
          </form>
          <div className="pt-12 text-xs text-zinc-600 flex items-center justify-center gap-2">
            <Shield className="w-3 h-3" /> Secure session established
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white p-6">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col items-center justify-center text-center gap-12">
        <button
          onClick={() => handleToggleMonitoring(userId!)}
          className={cn(
            "relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl group",
            isMonitoring
              ? "bg-green-500 animate-pulse-green shadow-green-500/20"
              : "bg-red-600 shadow-red-900/40"
          )}
        >
          <div className="absolute inset-0 rounded-full border-4 border-white/10 group-active:scale-95 transition-transform" />
          <Power className="w-16 h-16 text-white" />
        </button>

        {sensorStatus === 'missing' && (
          <Alert variant="destructive" className="bg-red-950/20 border-red-900/50 max-w-xs">
            <Smartphone className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase">Hardware Required</AlertTitle>
            <AlertDescription className="text-[11px]">
              No motion sensors detected. Please use a smartphone.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="mt-auto pt-8 border-t border-zinc-900">
        <button
          onClick={() => setShowDevConsole(!showDevConsole)}
          className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-700 py-2"
        >
          <span>Developer Console</span>
          {showDevConsole ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        {showDevConsole && (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-zinc-900 border-none text-white">
                <CardContent className="p-3">
                  <p className="text-[9px] uppercase font-bold text-zinc-600 mb-1">Steps Session</p>
                  <p className="text-xl font-black">{stats.steps.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-none text-white">
                <CardContent className="p-3">
                  <p className="text-[9px] uppercase font-bold text-zinc-600 mb-1">Queue Size</p>
                  <p className="text-xl font-black">{stats.queued}</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase text-zinc-600">Raw Queue (Last 2)</span>
                <Button onClick={() => attemptSync()} variant="secondary" size="sm" className="h-6 text-[9px] bg-zinc-800 text-zinc-300">
                  <RefreshCw className="w-2 h-2 mr-1" /> Force Sync
                </Button>
              </div>
              <ScrollArea className="h-48 rounded-lg border border-zinc-900 bg-zinc-950 p-3 font-mono text-[10px]">
                {queue.filter(s => !s.synced).slice(-2).reverse().map(s => (
                  <pre key={s.snapshot_id} className="mb-4 text-green-500/80 border-b border-zinc-900 pb-4">
                    {JSON.stringify(s, null, 2)}
                  </pre>
                ))}
              </ScrollArea>
            </div>

            <div className="flex justify-between items-center text-[9px] text-zinc-700 font-mono">
              <span>USER_ID: {userId}</span>
              <span>v{CONFIG.app_version}</span>
            </div>
          </div>
        )}
      </div>

      {!showDevConsole && (
        <p className="text-[9px] text-zinc-800 text-center mt-4 uppercase tracking-[0.3em] font-medium opacity-50">
          VitalThread • Silent Mode
        </p>
      )}
    </div>
  );
}
