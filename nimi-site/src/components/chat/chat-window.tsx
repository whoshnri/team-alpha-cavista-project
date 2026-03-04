"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useProfile } from "@/hooks/use-profile"
import { useLocation } from "@/hooks/use-location"
import {
  Send,
  FileText,
  Activity,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  PenToolIcon,
  Settings2Icon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Message, ChatResponse, ToolRequest, PersistedMessage } from "@/types/api"
import { ClinicResultsCard } from "@/components/chat/clinic-results-card"
import { PermissionRequest, requestBrowserPermission } from "@/components/chat/permission-request"
import { DownloadAppEmbedded } from "@/components/chat/download-app-embedded"
import { useEndpoints } from "@/hooks/use-endpoints"
import { renderToolPrompt } from "./renderTool"
import { LabUploadInline } from "./lab-upload-inline"

const METADATA_MARKER_RE = /<!--(METADATA|RECOMMENDATIONS|OVERALL_STATUS):([\s\S]*?)-!>/g

function embedMetadata(text: string, metadata: any): string {
  if (!metadata || Object.keys(metadata).length === 0) return text
  return `${text}\n<!--METADATA:${JSON.stringify(metadata)}-!>`
}

function parseMessageContent(raw: string): { content: string; metadata?: any } {
  const matches = [...raw.matchAll(METADATA_MARKER_RE)]
  if (matches.length === 0) return { content: raw }

  const content = raw.replace(METADATA_MARKER_RE, '').trim()
  const metadata: any = {}

  for (const match of matches) {
    try {
      const type = match[1]
      const data = JSON.parse(match[2])

      if (type === 'METADATA') {
        Object.assign(metadata, data)
      } else if (type === 'RECOMMENDATIONS') {
        if (!metadata.lab) metadata.lab = {}
        metadata.lab.recommendations = data
      } else if (type === 'OVERALL_STATUS') {
        if (!metadata.lab) metadata.lab = {}
        metadata.lab.overallStatus = data
      }
    } catch (e) {
      // Ignore parsing errors for individual blocks
    }
  }

  return { metadata: Object.keys(metadata).length > 0 ? metadata : undefined, content }
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
    downloadApp?: boolean
    utilizedTool?: string
  }
}

// Tool execution state
type ToolExecutionState = {
  phase: 'prompt' | 'executing' | 'scanning' | 'sending' | 'idle'
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
  const {
    sendMessage,
    getNearbyClinics,
    getSessionMessages
  } = useEndpoints()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [clinicLoading, setClinicLoading] = useState(false)
  const [toolState, setToolState] = useState<ToolExecutionState>({
    phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [],
  })
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null)


  const prevSessionRef = useRef<string | null | undefined>(undefined)
  const processToolRequestsRef = useRef<Function | null>(null)

  const welcomeMessage: UIMessage = {
    role: 'bot',
    content: `Hello ${user?.fullName?.split(' ')[0] ?? 'there'}! How can I help you today?`
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const buildChatHistory = useCallback((): Message[] => {
    // Strip <!--METADATA:{...}-!> from bot content before sending to API
    const stripMetadata = (text: string) => {
      const idx = text.indexOf('<!--METADATA:')
      return idx === -1 ? text : text.substring(0, idx).trim()
    }

    return messages
      .map((m, i, arr) => {
        if (m.role === 'user') {
          const nextBot = arr[i + 1]?.role === 'bot' ? stripMetadata(arr[i + 1].content) : null
          return { user: m.content, bot: nextBot }
        }
        return null
      }).filter(Boolean) as Message[]
  }, [messages])

  const showPermissionPrompt = useCallback((type: 'location' | 'microphone' | 'camera', reason: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPermissionPrompt({
        active: true,
        type,
        reason,
        denied: false,
        loading: false,
        onGranted: () => resolve(true),
        onDismissed: () => resolve(false),
      })
    })
  }, [])

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

      // If the server created/used a session, update the frontend session ID
      if ((data as any).sessionId && onNewSession) {
        onNewSession((data as any).sessionId)
      }

      // Process any tool requests from the AI
      if (data.toolRequests && data.toolRequests.length > 0) {
        const history = buildChatHistory()
        await processToolRequestsRef.current?.(data.toolRequests, originalMessage || "Vision scan complete.", history)
      }
    } else {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I encountered an error: " + data.error }])
    }
  }, [buildChatHistory, onNewSession])

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
        const data = await getSessionMessages(sessionId)
        if (data.success && data.session) {
          const executedTools = new Set<string>()
          const loaded: UIMessage[] = []

          for (const msg of data.session.messages) {
            // Handle tool_result messages (clinic searches, heart rate scans, etc.)
            if (msg.sender === 'TOOL_RESULT' || (msg as any).role === 'tool_result') {
              const rawMsg = msg as any
              const tool = rawMsg.tool || rawMsg.content?.tool
              const toolData = rawMsg.data || rawMsg.content?.data

              if (tool) executedTools.add(tool)

              if (tool === 'nearby_clinics' && toolData?.clinics?.length > 0) {
                loaded.push({
                  role: 'bot',
                  content: `I found **${toolData.clinics.length} healthcare facilities** near you.`,
                  metadata: { clinics: toolData.clinics, utilizedTool: 'nearby_clinics' }
                })
              }
              // Other tool results (heart_rate_scan, gait_analysis, etc.) can be handled here
              continue
            }

            // Handle regular user/assistant messages
            const { content, metadata } = parseMessageContent(msg.content)

            // If a past bot message has lab results in its metadata, we consider the tool executed
            if (msg.sender !== 'USER' && metadata?.lab) {
              executedTools.add('lab_interpretation')
              metadata.utilizedTool = 'lab_interpretation'
            }

            loaded.push({
              role: msg.sender === 'USER' ? 'user' : 'bot',
              content,
              metadata
            })
          }

          // Strip toolRequests from all messages if they have already been executed
          const finalMessages = loaded.map((m) => {
            if (m.role === 'bot' && (m.metadata as any)?.toolRequests?.length) {
              const unresolvedTools = (m.metadata as any).toolRequests.filter((req: any) => !executedTools.has(req.tool))
              const { toolRequests, ...restMeta } = (m.metadata as any)

              if (unresolvedTools.length > 0) {
                return { ...m, metadata: { ...restMeta, toolRequests: unresolvedTools } }
              } else {
                return { ...m, metadata: Object.keys(restMeta).length > 0 ? restMeta : undefined }
              }
            }
            return m
          })

          // Find the last bot message index that still has unresolved toolRequests
          const lastBotWithToolIdx = finalMessages.reduce((acc, m, i) =>
            m.role === 'bot' && (m.metadata as any)?.toolRequests?.length ? i : acc, -1)

          // We explicitly keep unresolved toolRequests ONLY on the last message
          const veryFinalMessages = finalMessages.map((m, i) => {
            if (m.role === 'bot' && (m.metadata as any)?.toolRequests?.length && i !== lastBotWithToolIdx) {
              const { toolRequests, ...restMeta } = (m.metadata as any)
              return { ...m, metadata: Object.keys(restMeta).length > 0 ? restMeta : undefined }
            }
            return m
          })

          setMessages(veryFinalMessages.length > 0 ? veryFinalMessages : [welcomeMessage])

          // Re-trigger tool prompt for the last bot message with pending toolRequests
          if (lastBotWithToolIdx >= 0) {
            const lastToolMsg = veryFinalMessages[lastBotWithToolIdx]
            const lastUserMsg = veryFinalMessages.slice(0, lastBotWithToolIdx).reverse().find(m => m.role === 'user')
            processToolRequestsRef.current?.(
              (lastToolMsg.metadata as any)!.toolRequests,
              lastUserMsg?.content || '',
              []
            )
          }
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

    // Get current state location
    let lat = location.lat
    let lng = location.lng

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
      try {
        const coords = await location.requestLocation()
        lat = coords.lat
        lng = coords.lng
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "Location permission was granted but I'm still having trouble reading your precise position. Please try asking again in a moment.",
        }])
        setClinicLoading(false)
        return
      }
    }

    setMessages(prev => [...prev, {
      role: 'bot',
      content: "Finding clinics and hospitals near you..."
    }])

    try {
      const data = await getNearbyClinics(lat, lng, sessionId ?? undefined)

      if (data.success && data.clinics?.length > 0) {
        const displayText = `I found **${data.clinics.length} healthcare facilities** near you. Here are the closest options:`
        const metadata = { clinics: data.clinics, utilizedTool: 'nearby_clinics' }
        const fullContent = embedMetadata(displayText, metadata)

        // Remove the "finding clinics" message and replace with results
        setMessages(prev => {
          const filtered = prev.filter(m => m.content !== "Finding clinics and hospitals near you...")
          return [...filtered, {
            role: 'bot' as const,
            content: displayText,
            metadata
          }]
        })
      } else {
        const noResultsMsg = "I searched for nearby clinics but couldn't find any within 5km. Try expanding your search or checking OpenStreetMap directly."
        setMessages(prev => {
          const filtered = prev.filter(m => m.content !== "Finding clinics and hospitals near you...")
          return [...filtered, {
            role: 'bot' as const,
            content: noResultsMsg,
          }]
        })
      }
    } catch (err: any) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== "Finding clinics and hospitals near you...")
        return [...filtered, {
          role: 'bot' as const,
          content: "Sorry, I had trouble searching for nearby clinics. Please try again later.",
        }]
      })
    } finally {
      setClinicLoading(false)
    }
  }, [location, getNearbyClinics, showPermissionPrompt])

  const processToolRequests = useCallback(async (
    toolRequests: ToolRequest[], originalMessage: string, chatHistory: Message[]
  ) => {
    const firstName = user?.fullName?.split(' ')[0] || 'Friend'

    for (const req of toolRequests) {
      if (req.tool === 'nearby_clinics') {
        setToolState({ phase: 'prompt', toolRequest: req, originalMessage, chatHistory })
      } else if (req.tool === 'heart_rate_scan' || req.tool === 'gait_analysis' || req.tool === 'vision_analysis') {
        const toolName = req.tool === 'heart_rate_scan' ? 'Heart Rate Scan' :
          req.tool === 'gait_analysis' ? 'Gait Analysis' : 'Vision Analysis'

        const appMsg = `Please use the Nimi mobile app, ${firstName}! `
        const metadata = { downloadApp: true }

        setMessages(prev => [...prev, {
          role: 'bot',
          content: appMsg,
          metadata
        }])
      } else if (req.tool === 'lab_interpretation') {
        setToolState({ phase: 'prompt', toolRequest: req, originalMessage, chatHistory })
      }
    }
  }, [user])

  // Set ref for circular dependency
  useEffect(() => {
    processToolRequestsRef.current = processToolRequests
  }, [processToolRequests])

  // Handle SSE Events


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

      const data = await sendMessage({
        message: currentInput,
        userProfile: profile,
        chatHistory,
        sessionId: sessionId || undefined,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      await handleAiResponse(data, currentInput)
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I encountered an error: " + err.message }])
    } finally {
      setLoading(false)
    }
  }

  // ─── HEART RATE SCAN HANDLERS ─────────────────

  const handleAcceptToolUse = () => {
    if (toolState.toolRequest?.tool === 'nearby_clinics') {
      executeClinicSearch(toolState.originalMessage, toolState.chatHistory)
      setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    } else if (toolState.toolRequest?.tool === 'lab_interpretation') {
      setToolState(prev => ({ ...prev, phase: 'executing' }))
    }
  }

  const handleDeclineToolUse = () => {
    const declineMsg = "No problem! I'll skip that for now. Let me know if you change your mind."
    setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
    setMessages(prev => [...prev, { role: 'bot', content: declineMsg }])

    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.content !== declineMsg))
    }, 3000)
  }




  // ─── RENDER ───────────────────────────────────

  const isEmpty = messages.length <= 1 && !loadingHistory

  return (
    <div className="flex flex-col h-full bg-background w-full mx-auto relative">
      <div ref={scrollRef} className={cn(
        "flex-1 overflow-y-auto px-6 py-6 scrollbar-hide md:px-0",
        isEmpty ? "flex items-center justify-center pt-0" : "pb-24 space-y-8"
      )}>
        {loadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
            <p className="section-label">Restoring session</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-700 max-w-[640px] w-full">
            <h1 className="text-4xl md:text-4xl font-serif text-text-primary mb-12 tracking-tight">
              How are you feeling <span className="text-accent-blue">{user?.fullName?.split(' ')[0] || 'friend'}</span> ?
            </h1>

            <div className="w-full relative group">
              <input
                className="input py-4 px-6 text-base font-sans rounded-lg border-border/60 focus:border-accent-blue bg-surface/50 shadow-xl transition-all"
                placeholder="Describe your symptoms or ask a health question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 btn-primary p-2.5 h-10 w-10 flex items-center justify-center rounded-lg shadow-lg hover:shadow-accent-blue/20 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

          </div>
        ) : (
          <div className="flex flex-col gap-7 max-w-[640px] mx-auto w-full">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col animate-in fade-in slide-in-from-left duration-500",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "px-2 py-2 text-sm leading-relaxed",
                  msg.role === 'user' ? "bubble-user" : "bubble-ai"
                )}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/<!--METADATA:[\s\S]*?-!>/g, '')
                      .replace(/<!--RECOMMENDATIONS:[\s\S]*?-!>/g, '')
                      .replace(/<!--OVERALL_STATUS:[\s\S]*?-!>/g, '')
                      .trim()
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/^### (.*$)/gm, '<h3 class="text-text-primary font-bold text-sm tracking-tight mt-6 mb-2">$1</h3>')
                      .replace(/^## (.*$)/gm, '<h2 class="text-text-primary font-bold text-xl tracking-tight mt-8 mb-3">$1</h2>')
                      .replace(/^- (.*$)/gm, '<span class="block pl-4 border-l border-border my-2">$1</span>')
                  }} />
                  {msg.metadata?.utilizedTool && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue">
                        <Settings2Icon className="h-4 w-4 text-accent-blue" />
                        <span className="text-xs font-medium text-accent-blue uppercase tracking-wider">
                          Utilized {msg.metadata.utilizedTool.replace('_', ' ')} Tool
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lab interpretation card */}
                {msg.metadata?.lab && (
                  <div className="mt-2 w-full card border-l-4 border-l-accent-blue">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-accent-blue" />
                        <span className="text-sm font-bold text-text-primary">Lab Interpretation</span>
                      </div>
                      {msg.metadata.lab.overallStatus && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
                          msg.metadata.lab.overallStatus === 'NORMAL' ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                            msg.metadata.lab.overallStatus === 'BORDERLINE' ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                              "bg-red-500/10 text-red-500 border border-red-500/20"
                        )}>
                          {msg.metadata.lab.overallStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed mb-4">{msg.metadata.lab.summary || msg.metadata.lab.plainSummary || msg.metadata.lab.interpretation}</p>

                    {msg.metadata.lab.recommendations && msg.metadata.lab.recommendations.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-border">
                        <p className="text-sm text-text-muted uppercase tracking-tight">Recommendations</p>
                        <ul className="space-y-3">
                          {msg.metadata.lab.recommendations.map((rec: string, idx: number) => (
                            <li key={idx} className="flex gap-3 items-baseline text-sm text-text-secondary leading-relaxed">
                              <span className="h-5 w-5 shrink-0 rounded-full border border-border flex items-center justify-center text-[8px] font-bold text-text-primary">{idx + 1}</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Risk assessment card */}
                {msg.metadata?.risk && (
                  <div className="mt-2 w-full card border-l-4 border-l-accent-blue">
                    <div className="flex items-center gap-2 mb-6">
                      <Activity className="h-4 w-4 text-accent-blue" />
                      <span className="section-label">Risk Assessment</span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <div className="space-y-1">
                        <p className="text-[10px] text-text-muted uppercase tracking-tight">Overall Risk</p>
                        <p className={cn(
                          "text-lg font-bold tracking-tighter",
                          msg.metadata.risk.overallLevel === 'CRITICAL' ? 'text-destructive' :
                            msg.metadata.risk.overallLevel === 'HIGH' ? 'text-warning' : 'text-accent-blue'
                        )}>
                          {msg.metadata.risk.overall}%
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-text-muted uppercase tracking-tight">Diabetes</p>
                        <p className="text-lg font-bold text-text-primary tracking-tighter">{msg.metadata.risk.diabetes}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-text-muted uppercase tracking-tight">HTN</p>
                        <p className="text-lg font-bold text-text-primary tracking-tighter">{msg.metadata.risk.hypertension}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-text-muted uppercase tracking-tight">CVD</p>
                        <p className="text-lg font-bold text-text-primary tracking-tighter">{msg.metadata.risk.cardiovascular}%</p>
                      </div>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-border">
                      <p className="text-[10px] text-text-muted uppercase tracking-tight">Recommendations</p>
                      <ul className="space-y-3">
                        {msg.metadata.risk.recommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="flex gap-3 text-xs text-text-secondary leading-relaxed">
                            <span className="h-4 w-4 shrink-0 rounded-full border border-border flex items-center justify-center text-[8px] font-bold text-text-primary">{idx + 1}</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Emergency escalation */}
                {msg.metadata?.escalation?.isEmergency && (
                  <div className="mt-2 w-full p-6 error-box">
                    <div className="flex items-center gap-2 mb-4 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em]">Emergency Alert</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{msg.metadata.escalation.urgencyMessage}</p>
                  </div>
                )}

                {/* Clinic results card — full width */}
                {msg.metadata?.clinics && msg.metadata.clinics.length > 0 && (
                  <div className="mt-1">
                    <ClinicResultsCard clinics={msg.metadata.clinics} />
                  </div>
                )}

                {/* App Download Embedded */}
                {msg.metadata?.downloadApp && (
                  <div className="mt-1 w-full rounded-lg max-w-xl">
                    <DownloadAppEmbedded />
                  </div>
                )}
              </div>
            ))}

            {/* Tool prompt card */}
            {toolState.phase === 'prompt' && toolState.toolRequest && renderToolPrompt(
              toolState.toolRequest,
              handleAcceptToolUse,
              handleDeclineToolUse,
              () => { }, // No image upload handler needed anymore
              null // No file input ref needed
            )}

            {/* Inline Lab Upload (Replaces Modal) */}
            {toolState.phase === 'executing' && toolState.toolRequest?.tool === 'lab_interpretation' && (
              <div className="mt-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                <LabUploadInline
                  onClose={() => setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })}
                  onSuccess={(result) => {
                    const { content: parsedContent, metadata: parsedMetadata } = parseMessageContent(
                      result.result || "I have analyzed your lab results."
                    );

                    const botMsg: UIMessage = {
                      role: 'bot',
                      content: parsedContent,
                      metadata: {
                        ...(parsedMetadata || {}),
                        lab: {
                          interpretation: parsedContent,
                          ...(parsedMetadata?.lab || {}),
                          ...result
                        },
                        utilizedTool: 'lab_interpretation'
                      }
                    }
                    setMessages(prev => [...prev, botMsg])
                    setToolState({ phase: 'idle', toolRequest: null, originalMessage: '', chatHistory: [] })
                  }}
                  sessionId={sessionId!}
                />
              </div>
            )}

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

            {/* Clinic loading indicator */}
            {clinicLoading && !permissionPrompt?.active && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-3 h-3 text-accent-blue animate-spin" />
                <p className="section-label text-sm lowercase italic">Locating clinics...</p>
              </div>
            )}

            {loading && !clinicLoading && toolState.phase === 'idle' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-3 h-3 text-accent-blue animate-spin" />
                <p className="section-label text-sm lowercase italic">Nimi is thinking...</p>
              </div>
            )}

          </div>
        )}
      </div>


      {/* Chat input bar (hidden when empty) */}
      {!isEmpty && (
        <div className="flex flex-col gap-2 p-4 bg-background/80 backdrop-blur-md sticky bottom-0 z-10 border-t border-border">
          <div className="max-w-[640px] mx-auto w-full relative flex items-center gap-2">
            <input
              className="input py-3 px-4 text-sm font-sans rounded-lg border-border/60 focus:border-accent-blue/50 bg-surface/50 shadow-sm"
              placeholder="How can Nimi help you today?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="absolute right-2 btn-primary p-2 h-9 w-9 flex items-center justify-center rounded-lg shadow-lg hover:shadow-accent-blue/20 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
