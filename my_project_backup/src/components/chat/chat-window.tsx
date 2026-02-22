"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useProfile } from "@/hooks/use-profile"
import { useLocation } from "@/hooks/use-location"
import {
  HeartPulse,
  Send,
  FileText,
  Activity,
  AlertTriangle,
  Loader2,
  Sparkles,
  MapPin,
  X,
  Smartphone,
  CheckCircle2,
  QrCode,
  ExternalLink,
  Camera,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { API_BASE_URL, getAuthHeaders } from "@/lib/api-config"
import { Message, ChatResponse, ToolRequest } from "@/types/api"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { VitalPulseScanner } from "@/components/vital-pulse-scanner"
import { ClinicResultsCard } from "@/components/chat/clinic-results-card"
import { PermissionRequest, requestBrowserPermission } from "@/components/chat/permission-request"
import { useSSE } from "@/hooks/use-sse"
import { QRCodeDialog } from "@/components/chat//qr-code-dialog"
import { useVisionCapture } from "@/hooks/useVisionCapture"
import { VisionCaptureUI } from "@/components/chat/VisionCaptureUI"
import Cookies from "js-cookie"

// ─── CLINIC DATA SERIALIZATION ──────────────
// Clinics are embedded in message content as <!--CLINICS_DATA:{json}-->
// so they persist in the DB and can be re-rendered on load.

const CLINICS_MARKER_RE = /<!--CLINICS_DATA:([\s\S]*?)-->/

function embedClinicsInContent(text: string, clinics: any[]): string {
  return `${text}\n<!--CLINICS_DATA:${JSON.stringify(clinics)}-->`
}

function parseMessageContent(raw: string): { content: string; clinics?: any[] } {
  const match = raw.match(CLINICS_MARKER_RE)
  if (!match) return { content: raw }
  const content = raw.replace(CLINICS_MARKER_RE, '').trim()
  try {
    const clinics = JSON.parse(match[1])
    return { content, clinics }
  } catch {
    return { content }
  }
}

// UI message type with tool support
type UIMessage = {
  role: 'user' | 'bot'
  content: string
  metadata?: {
    lab?: any
    risk?: any
    lesson?: any
    escalation?: any
    toolRequests?: ToolRequest[]
    clinics?: any[]  // clinic results rendered as cards
  }
}

// Tool execution state
type ToolExecutionState = {
  phase: 'prompt' | 'scanning' | 'sending' | 'idle'
  toolRequest: ToolRequest | null
  originalMessage: string
  chatHistory: Message[]
}

// Permission prompt state
type PermissionPromptState = {
  active: boolean
  type: 'location' | 'microphone' | 'camera'
  reason?: string
  denied: boolean
  loading: boolean
  onGranted: () => void
  onDismissed: () => void
}

interface ChatWindowProps {
  sessionId?: string | null
  onNewSession?: (id: string) => void
}

export function ChatWindow({ sessionId, onNewSession }: ChatWindowProps) {
  const { profile, user } = useProfile()
  const location = useLocation()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [clinicLoading, setClinicLoading] = useState(false)
  const [toolState, setToolState] = useState<ToolExecutionState>({
    phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [],
  })
  const [scannerOpen, setScannerOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [magicLink, setMagicLink] = useState("")
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null)
  const [gaitSyncStatus, setGaitSyncStatus] = useState<'idle' | 'pending' | 'synced'>('idle')
  const [pendingGaitData, setPendingGaitData] = useState<{ originalMessage: string, chatHistory: Message[] } | null>(null)

  const welcomeMessage: UIMessage = {
    role: 'bot',
    content: `Hello ${user?.fullName?.split(' ')[0] ?? 'there'}! I'm your PreventIQ health assistant. I can analyze your symptoms, recommend checks, and find nearby clinics. How can I help you today?`
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const buildChatHistory = useCallback((): Message[] => {
    return messages
      .filter((m) => !m.metadata?.toolRequests)
      .map((m, i, arr) => {
        if (m.role === 'user') return { user: m.content, bot: arr[i + 1]?.role === 'bot' ? arr[i + 1].content : null }
        return null
      }).filter(Boolean) as Message[]
  }, [messages, user])

  // Load session when sessionId changes
  useEffect(() => {
    if (prevSessionRef.current === sessionId) return
    prevSessionRef.current = sessionId

    if (!sessionId) {
      setMessages([welcomeMessage])
      return
    }

    const loadSession = async () => {
      setLoadingHistory(true)
      try {
        const res = await fetch(`/api/user/chats/${sessionId}`, { headers: getAuthHeaders() })
        const data = await res.json()
        if (data.success && data.session) {
          const loaded: UIMessage[] = data.session.messages.map((msg: any) => {
            const { content, clinics } = parseMessageContent(msg.content)
            return {
              role: msg.sender === 'USER' ? 'user' : 'bot',
              content,
              ...(clinics ? { metadata: { clinics } } : {})
            }
          })
          setMessages(loaded.length > 0 ? loaded : [welcomeMessage])
        } else {
          setMessages([welcomeMessage])
        }
      } catch { setMessages([welcomeMessage]) }
      finally { setLoadingHistory(false) }
    }
    loadSession()
  }, [sessionId, user, welcomeMessage])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, clinicLoading])

  const token = Cookies.get("preventiq_token") || ""

  const handleAiResponse = useCallback(async (data: ChatResponse, originalMessage?: string) => {
    if (data.success) {
      const botMsg: UIMessage = {
        role: 'bot',
        content: data.response,
        metadata: {
          lab: data.labInterpretation,
          risk: data.riskScores,
          lesson: data.microLesson,
          escalation: data.escalation,
          toolRequests: data.toolRequests,
        }
      }
      setMessages(prev => [...prev, botMsg])

      // Process any tool requests from the AI
      if (data.toolRequests && data.toolRequests.length > 0) {
        const history = buildChatHistory()
        await processToolRequestsRef.current?.(data.toolRequests, originalMessage || "Vision scan complete.", history)
      }
    } else {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I encountered an error: " + data.error }])
    }
  }, [buildChatHistory])

  const visionCapture = useVisionCapture(token, API_BASE_URL, handleAiResponse)

  const { lastEvent, setLastEvent } = useSSE(user?.id)
  const prevSessionRef = useRef<string | null | undefined>(undefined)
  const processToolRequestsRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)



  // ─── PERMISSION PROMPT HELPER ──────────────────

  const showPermissionPrompt = useCallback((type: 'location' | 'microphone' | 'camera', reason?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPermissionPrompt({
        active: true, type, reason, denied: false, loading: false,
        onGranted: () => resolve(true),
        onDismissed: () => resolve(false),
      })
    })
  }, [])

  const handlePermissionGrant = useCallback(async () => {
    if (!permissionPrompt) return
    setPermissionPrompt(prev => prev ? { ...prev, loading: true } : null)

    const result = await requestBrowserPermission(permissionPrompt.type)
    if (result.granted) {
      permissionPrompt.onGranted()
      setPermissionPrompt(null)
    } else {
      setPermissionPrompt(prev => prev ? { ...prev, loading: false, denied: result.error === 'denied' } : null)
    }
  }, [permissionPrompt])

  const handlePermissionDismiss = useCallback(() => {
    if (permissionPrompt) permissionPrompt.onDismissed()
    setPermissionPrompt(null)
  }, [permissionPrompt])

  // ─── AUTO-EXECUTE: NEARBY CLINICS ─────────────

  const executeClinicSearch = useCallback(async (originalMessage: string, chatHistory: Message[]) => {
    setClinicLoading(true)

    // Get location — may need to request
    let lat = location.lat
    let lng = location.lng

    if (!lat || !lng) {
      // Check session storage first
      try {
        const cached = sessionStorage.getItem('preventiq_location')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Date.now() - parsed.ts < 300000) { lat = parsed.lat; lng = parsed.lng }
        }
      } catch { }
    }

    if (!lat || !lng) {
      // Show reusable permission prompt
      const granted = await showPermissionPrompt('location', 'I need your location to find nearby clinics and hospitals')
      if (!granted) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "No problem — I'll skip the clinic search. If you change your mind, just ask me to find nearby clinics and I'll ask again.",
        }])
        setClinicLoading(false)
        return
      }
      // Re-read location after permission was granted
      location.requestLocation()
      await new Promise(r => setTimeout(r, 1500))
      try {
        const cached = sessionStorage.getItem('preventiq_location')
        if (cached) { const parsed = JSON.parse(cached); lat = parsed.lat; lng = parsed.lng }
      } catch { }

      if (!lat || !lng) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "Location permission was granted but I couldn't read your position yet. Please try asking again in a moment.",
        }])
        setClinicLoading(false)
        return
      }
    }

    setMessages(prev => [...prev, {
      role: 'bot',
      content: "📍 Finding clinics and hospitals near you..."
    }])

    // ─── PERSIST TOOL MESSAGES ──────────────────

    const persistToolMessage = (content: string) => {
      // Fire-and-forget: save to the user's active chat session
      fetch(`/api/user/chats/active/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content, sender: 'AI' })
      }).catch(() => { /* silent — persistence is best-effort */ })
    }

    try {
      const params = new URLSearchParams({
        lat: lat.toString(), lng: lng.toString(), radius: '5000'
      })
      const res = await fetch(`/api/clinics/nearby?${params}`, { headers: getAuthHeaders() })
      const data = await res.json()

      if (data.success && data.clinics?.length > 0) {
        const displayText = `I found **${data.clinics.length} healthcare facilities** near you. Here are the closest options:`
        const fullContent = embedClinicsInContent(displayText, data.clinics)

        // Remove the "finding clinics" message and replace with results
        setMessages(prev => {
          const filtered = prev.filter(m => m.content !== "📍 Finding clinics and hospitals near you...")
          return [...filtered, {
            role: 'bot' as const,
            content: fullContent,
            metadata: { clinics: data.clinics }
          }]
        })

        // Persist to DB so it shows in chat history
        persistToolMessage(fullContent)
      } else {
        const noResultsMsg = "I searched for nearby clinics but couldn't find any within 5km. Try expanding your search or checking OpenStreetMap directly."
        setMessages(prev => {
          const filtered = prev.filter(m => m.content !== "📍 Finding clinics and hospitals near you...")
          return [...filtered, {
            role: 'bot' as const,
            content: noResultsMsg,
          }]
        })
        persistToolMessage(noResultsMsg)
      }
    } catch (err: any) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== "📍 Finding clinics and hospitals near you...")
        return [...filtered, {
          role: 'bot' as const,
          content: "Sorry, I had trouble searching for nearby clinics. Please try again later.",
        }]
      })
    } finally {
      setClinicLoading(false)
    }
  }, [location])

  const executeGaitAnalysis = useCallback(async (originalMessage: string, chatHistory: Message[]) => {
    if (!user?.id) return
    setLoading(true)

    setMessages(prev => [...prev, {
      role: 'bot',
      content: "🚶 Analyzing your recent movement and gait activity..."
    }])

    const persistToolMessage = (content: string) => {
      fetch(`/api/user/chats/active/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content, sender: 'AI' })
      }).catch(() => { /* silent */ })
    }

    try {
      const res = await fetch(`/api/gait/${user.id}/recent`, {
        headers: getAuthHeaders()
      })
      const gaitData = await res.json()

      let messagePayload = `[GAIT_DATA] The patient's original concern was: "${originalMessage}".`
      if (gaitData.success && gaitData.logs?.length > 0) {
        messagePayload += `\nRecent gait logs attached:\n${JSON.stringify(gaitData.logs, null, 2)}`
      } else {
        messagePayload += `\n(No recent gait activity data found in the 30-minute window)`
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const aiRes = await fetch(`/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          message: messagePayload,
          userProfile: profile,
          chatHistory,
          toolResults: gaitData.success ? [{ tool: 'gait_analysis', data: gaitData }] : []
        })
      })
      clearTimeout(timeoutId)

      const data: ChatResponse = await aiRes.json()
      // Remove the "analyzing" status
      setMessages(prev => prev.filter(m => m.content !== "🚶 Analyzing your recent movement and gait activity..."))
      await handleAiResponse(data, originalMessage)
    } catch (err: any) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== "🚶 Analyzing your recent movement and gait activity...")
        return [...filtered, {
          role: 'bot',
          content: "I tried to analyze your recent movement data but hit an error. Please try again soon.",
        }]
      })
    } finally {
      setLoading(false)
    }
  }, [user, profile])

  // ─── PROCESS TOOL REQUESTS ────────────────────

  const processToolRequests = useCallback(async (
    toolRequests: ToolRequest[], originalMessage: string, chatHistory: Message[]
  ) => {
    for (const req of toolRequests) {
      if (req.tool === 'heart_rate_scan' || req.tool === 'nearby_clinics' || req.tool === 'vision_analysis') {
        // These tools require explicit user consent / action
        setToolState({ phase: 'prompt', toolRequest: req, originalMessage, chatHistory })
      } else if (req.tool === 'gait_analysis') {
        if (gaitSyncStatus === 'synced') {
          await executeGaitAnalysis(originalMessage, chatHistory)
          return
        }

        setPendingGaitData({ originalMessage, chatHistory })

        if (gaitSyncStatus === 'idle' && user?.id) {
          setGaitSyncStatus('pending')
          interface PingResponse {
            success: boolean;
            message: string;
            magicLink?: string;
          }

          try {
            const pingRes = await fetch(`/api/gait/ping/${user.id}`, {
              method: 'POST',
              headers: getAuthHeaders()
            })
            const pingData: PingResponse = await pingRes.json()

            const pwaUrl = pingData.magicLink || ""
            setMagicLink(pwaUrl)

            if (!pingData.success) {
              setMessages(prev => [
                ...prev.filter(m => !m.content.includes("Your Gait PWA doesn't seem to be active")),
                {
                  role: 'bot',
                  content: "📡 Your Gait PWA doesn't seem to be active. Please open it to ensure I have your latest data."
                }
              ])
            }
          } catch (err) {
            console.error("[Ping] Failed to ping PWA", err)
            setMagicLink("")
          }
        }
      }
    }
  }, [executeGaitAnalysis, user, gaitSyncStatus])

  // Set ref for circular dependency
  useEffect(() => {
    processToolRequestsRef.current = processToolRequests
  }, [processToolRequests])

  // Handle SSE Events
  useEffect(() => {
    if (lastEvent?.event === 'PONG_PWA') {
      setGaitSyncStatus('synced')
      setMessages(prev => [
        ...prev.filter(m => !m.content.includes("Waiting for PWA") && !m.content.includes("Attempting to wake up")),
        { role: 'bot', content: "✅ Gait PWA is now active and syncing!" }
      ])
      setQrOpen(false)
      setLastEvent(null)

      if (pendingGaitData) {
        executeGaitAnalysis(pendingGaitData.originalMessage, pendingGaitData.chatHistory)
        setPendingGaitData(null)
      }
    }

    if (lastEvent?.event === 'capture_request') {
      visionCapture.handleCaptureRequest(lastEvent.data, lastEvent.data._toolCallId || `tc_${Date.now()}`, sessionId || "default")
      setLastEvent(null)
    }
  }, [lastEvent, pendingGaitData, executeGaitAnalysis, visionCapture, sessionId, setLastEvent])

  const handleManualVerification = (isSkip = false) => {
    setGaitSyncStatus('synced')
    setMessages(prev => [
      ...prev.filter(m => !m.content.includes("Waiting for PWA") && !m.content.includes("Attempting to wake up") && !m.content.includes("Your Gait PWA doesn't seem to be active")),
      {
        role: 'bot',
        content: isSkip ? "Skipping PWA check. Proceeding with analysis..." : "Verified! Proceeding with gait analysis..."
      }
    ])
    if (pendingGaitData) {
      executeGaitAnalysis(pendingGaitData.originalMessage, pendingGaitData.chatHistory)
      setPendingGaitData(null)
    }
  }

  // ─── SEND MESSAGE ─────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMsg: UIMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    const currentInput = input
    setInput("")
    setLoading(true)

    try {
      const chatHistory = buildChatHistory()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const res = await fetch(`/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        signal: controller.signal,
        body: JSON.stringify({ message: currentInput, userProfile: profile, chatHistory })
      })
      clearTimeout(timeoutId)

      const data: ChatResponse = await res.json()
      await handleAiResponse(data, currentInput)
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I encountered an error: " + err.message }])
    } finally {
      setLoading(false)
    }
  }

  // ─── HEART RATE SCAN HANDLERS ─────────────────

  const handleAcceptToolUse = () => {
    if (toolState.toolRequest?.tool === 'heart_rate_scan') {
      setToolState(prev => ({ ...prev, phase: 'scanning' }))
      setScannerOpen(true)
    } else if (toolState.toolRequest?.tool === 'nearby_clinics') {
      executeClinicSearch(toolState.originalMessage, toolState.chatHistory)
      setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    } else if (toolState.toolRequest?.tool === 'vision_analysis') {
      fileInputRef.current?.click()
    }
  }

  const handleDeclineToolUse = () => {
    const declineMsg = "No problem! I'll skip that for now. Let me know if you change your mind."
    setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    setMessages(prev => [...prev, { role: 'bot', content: declineMsg }])

    // Cleanup message after 3 seconds
    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.content !== declineMsg))
    }, 3000)
  }

  const handleScanComplete = useCallback(async (results: any) => {
    setScannerOpen(false)
    setToolState(prev => ({ ...prev, phase: 'sending' }))
    setLoading(true)

    setMessages(prev => [...prev, {
      role: 'bot', content: "✅ Heart rate data collected. Analyzing your vitals alongside your symptoms..."
    }])

    try {
      const toolResults = [{
        tool: "heart_rate_scan",
        data: {
          bpm: results.heart_rate.bpm,
          signal_quality: results.heart_rate.signal_quality,
          confidence: results.heart_rate.confidence,
          median_ibi_ms: results.heart_rate.median_ibi_ms,
          ibi_std_dev_ms: results.heart_rate.ibi_std_dev_ms,
          peaks_detected: results.heart_rate.peaks_detected,
        }
      }]

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const res = await fetch(`/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          message: `[TOOL_RESULTS] The patient's original concern was: "${toolState.originalMessage}". Heart rate data has been collected. Please provide your comprehensive assessment incorporating these vitals.`,
          userProfile: profile,
          chatHistory: toolState.chatHistory,
          toolResults,
        })
      })
      clearTimeout(timeoutId)

      const data: ChatResponse = await res.json()
      await handleAiResponse(data, toolState.originalMessage)
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'bot', content: "I received your vitals data but had trouble analyzing it. Please try again."
      }])
    } finally {
      setLoading(false)
      setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    }
  }, [toolState, profile, processToolRequests])

  const executeVisionAnalysis = useCallback(async (base64: string, originalMessage: string, chatHistory: Message[]) => {
    setLoading(true)
    setMessages(prev => [...prev, {
      role: 'bot', content: "📸 Image received. Analyzing the photo along with your symptoms..."
    }])

    try {
      const toolResults = [{
        tool: "vision_analysis",
        data: {
          image: base64,
          mimeType: base64.split(';')[0].split(':')[1]
        }
      }]

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const res = await fetch(`/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          message: `[VISION_DATA] I have uploaded a photo for analysis related to my concern: "${originalMessage}".`,
          userProfile: profile,
          chatHistory: chatHistory,
          toolResults,
          intent: "vision_analysis"
        })
      })
      clearTimeout(timeoutId)

      const data: ChatResponse = await res.json()
      await handleAiResponse(data, originalMessage)
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'bot', content: "I received your photo but had trouble analyzing it. Please try again."
      }])
    } finally {
      setLoading(false)
      setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    }
  }, [profile, processToolRequests])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setToolState(prev => ({ ...prev, phase: 'sending' }))
    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result as string
      await executeVisionAnalysis(base64, toolState.originalMessage, toolState.chatHistory)
    }
    reader.readAsDataURL(file)
  }

  // ─── RENDER TOOL PROMPT (heart rate only) ─────

  const renderToolPrompt = (toolRequest: ToolRequest) => {
    const isClinics = toolRequest.tool === 'nearby_clinics'
    const isVision = toolRequest.tool === 'vision_analysis'
    const title = isClinics ? "Nearby Clinics Recommended" :
      isVision ? "Photo Analysis Requested" : "Health Check Recommended"
    const typeLabel = isClinics ? "Location Search" :
      isVision ? "AI Vision Diagnostic" : "AI-Requested Diagnostic"
    const Icon = isClinics ? MapPin : isVision ? Camera : HeartPulse
    const actionLabel = isClinics ? "Allow Clinic Search" :
      isVision ? "Upload & Analyze Photo" : "Run Heart Check"

    return (
      <div className="flex flex-col items-start w-full">
        <div className="w-full card-overhaul">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 border border-border rounded-lg bg-black">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="section-label mb-0.5">{typeLabel}</p>
              <h4 className="text-sm font-bold text-white">{title}</h4>
            </div>
          </div>
          <p className="text-sm text-[#a0a0a0] leading-relaxed mb-8">{toolRequest.reason}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAcceptToolUse}
              className="button-primary flex-1 flex items-center justify-center gap-2"
            >
              {actionLabel}
            </button>
            <button
              onClick={handleDeclineToolUse}
              className="button-secondary"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── RENDER ───────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-black w-full mx-auto">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-12 space-y-12 scrollbar-hide md:px-0">
        {loadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="w-full h-full bg-white loading-pulse" />
            </div>
            <p className="section-label">Restoring session</p>
          </div>
        ) : (
          <div className="flex flex-col gap-12 max-w-[640px] mx-auto w-full">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-400",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "max-w-[100%] sm:max-w-[90%] px-0 py-0 text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "text-white font-medium text-right"
                    : "text-[#a0a0a0]"
                )}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/<!--CLINICS_DATA:[\s\S]*?-->/g, '')
                      .trim()
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/^### (.*$)/gm, '<h3 class="text-white font-bold text-sm tracking-tight mt-6 mb-2">$1</h3>')
                      .replace(/^## (.*$)/gm, '<h2 class="text-white font-bold text-xl tracking-tight mt-8 mb-3">$1</h2>')
                      .replace(/^- (.*$)/gm, '<span class="block pl-4 border-l border-white/20 my-2">$1</span>')
                  }} />
                </div>

                {/* Lab interpretation card */}
                {msg.metadata?.lab && (
                  <div className="mt-6 w-full card-overhaul">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="h-4 w-4 text-white" />
                      <span className="section-label">Lab Interpretation</span>
                    </div>
                    <p className="text-sm text-[#a0a0a0] leading-relaxed">{msg.metadata.lab.summary || msg.metadata.lab.plainSummary}</p>
                  </div>
                )}

                {/* Emergency escalation */}
                {msg.metadata?.escalation?.isEmergency && (
                  <div className="mt-6 w-full p-6 border border-[#ff4444]/20 bg-[#ff4444]/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-4 text-[#ff4444]">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em]">Emergency Alert</span>
                    </div>
                    <p className="text-sm text-[#ff4444] font-medium leading-relaxed">{msg.metadata.escalation.urgencyMessage}</p>
                  </div>
                )}

                {/* Clinic results card — full width */}
                {msg.metadata?.clinics && msg.metadata.clinics.length > 0 && (
                  <div className="mt-8">
                    <ClinicResultsCard clinics={msg.metadata.clinics} />
                  </div>
                )}
              </div>
            ))}

            {/* Heart rate tool prompt card */}
            {toolState.phase === 'prompt' && toolState.toolRequest && renderToolPrompt(toolState.toolRequest)}

            {/* Reusable permission request card */}
            {permissionPrompt?.active && (
              <PermissionRequest
                type={permissionPrompt.type}
                toolReason={permissionPrompt.reason}
                onGrant={handlePermissionGrant}
                onDismiss={handlePermissionDismiss}
                loading={permissionPrompt.loading}
                denied={permissionPrompt.denied}
              />
            )}

            {/* Scanning/sending status */}
            {(toolState.phase === 'scanning' || toolState.phase === 'sending') && (
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white loading-pulse" />
                <p className="section-label">
                  {toolState.phase === 'scanning' ? 'Pulse acquisition' : 'Analyzing vitals'}
                </p>
              </div>
            )}

            {/* Clinic loading indicator */}
            {clinicLoading && !permissionPrompt?.active && (
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white loading-pulse" />
                <p className="section-label">Locating clinics</p>
              </div>
            )}

            {loading && !clinicLoading && toolState.phase === 'idle' && (
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white loading-pulse" />
                <p className="section-label">Assistant analyzing</p>
              </div>
            )}

            {gaitSyncStatus === 'pending' && pendingGaitData && (
              <div className="flex flex-col items-start w-full">
                <div className="w-full card-overhaul">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 border border-border rounded-lg bg-black">
                      <Smartphone className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="section-label mb-0.5">Verification required</p>
                      <h4 className="text-sm font-bold text-white uppercase tracking-tight">Gait PWA Sync</h4>
                    </div>
                  </div>

                  <p className="text-sm text-[#a0a0a0] leading-relaxed mb-8">
                    Ensure the <strong className="text-white">Gait PWA</strong> is active. Launch it directly, scan the QR code, or skip to proceed without new data.
                  </p>

                  <div className="flex flex-col gap-4">
                    <button
                      onClick={() => handleManualVerification(false)}
                      className="button-primary w-full h-11 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Verify connection
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          if (magicLink) {
                            window.open(magicLink, '_blank')
                          } else {
                            alert("Magic link not available. Please try again.")
                          }
                        }}
                        className="button-secondary h-10 flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Launch
                      </button>
                      <button
                        onClick={() => setQrOpen(true)}
                        className="button-secondary h-10 flex items-center justify-center gap-2"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR Code
                      </button>
                    </div>

                    <button
                      onClick={() => handleManualVerification(true)}
                      className="text-[11px] font-bold text-[#505050] hover:text-[#ff4444] transition-colors uppercase tracking-widest pt-2"
                    >
                      Skip verification
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Input area */}
      <div className="pb-12 pt-4 px-6 md:px-0 bg-black">
        <div className="max-w-[640px] mx-auto relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Type your health question..."
            className="w-full input-overhaul min-h-[56px] py-4 pr-14 resize-none"
            rows={1}
          />
          <div className="absolute right-3 top-3">
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="p-2 text-[#505050] hover:text-white disabled:opacity-30 transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-[#505050] mt-6 tracking-[0.05em] uppercase font-medium">
          AI may provide inaccurate data. Cross-verify with professionals.
        </p>
      </div>

      {/* VitalPulse Scanner Dialog */}
      <Dialog open={scannerOpen} onOpenChange={(open) => {
        if (!open && toolState.phase === 'scanning') {
          setScannerOpen(false)
          setToolState(prev => ({ ...prev, phase: 'idle' }))
          setMessages(prev => [...prev, { role: 'bot', content: "Heart rate scan was cancelled. I'll work with the information I have." }])
        }
      }}>
        <DialogContent className="max-w-none w-auto p-0 bg-transparent border-none shadow-none flex items-center justify-center">
          <VitalPulseScanner onComplete={handleScanComplete} />
        </DialogContent>
      </Dialog>

      <QRCodeDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={magicLink}
        onVerified={() => handleManualVerification(false)}
      />

      <VisionCaptureUI
        captureState={visionCapture.captureState}
        onAccept={visionCapture.acceptCapture}
        onDecline={visionCapture.declineCapture}
        onSubmit={visionCapture.submitCapture}
        onRetry={visionCapture.retryCapture}
        onDismiss={visionCapture.dismissCapture}
      />
    </div>
  )
}
