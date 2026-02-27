// vision-engine.ts — Multi-pass Gemini analysis engine with backtracking
// Supports: images, video, multi-frame analysis, intelligent error recovery

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type MediaInput = {
  data: string;          // base64 for images
  mimeType: string;
};

export type AnalysisPass = {
  passNumber: number;
  strategy: string;
  result: any | null;
  error: string | null;
  durationMs: number;
};

export type BacktrackEvent = {
  trigger: string;       // What caused the backtrack
  from: string;          // What we tried
  to: string;            // What we're trying next
  reasoning: string;     // Why we're changing strategy
};

export type AnalysisPipeline = {
  success: boolean;
  finalResult: any;
  passes: AnalysisPass[];
  backtrackLog: BacktrackEvent[];
  totalDurationMs: number;
};

// ─────────────────────────────────────────────
// GEMINI CLIENT FACTORY
// ─────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function getGenAI() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

function getModel(temperature = 0.2) {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });
}

// Video functions removed for performance and privacy.

// ─────────────────────────────────────────────
// TRIAGE PASS — What are we even looking at?
// Runs BEFORE the main analysis to validate input
// ─────────────────────────────────────────────

const TRIAGE_PROMPT = `
You are a medical image triage system. Examine this media and determine:

1. What type of content is this? (fundus image, skin photo, wound, lab report, face, non-medical, etc.)
2. Is a human body part or medical subject clearly visible?
3. What is the image/video quality?
4. Are there multiple subjects or frames of interest?

Return ONLY this JSON:
{
  "contentType": "fundus" | "skin" | "wound" | "lab_report" | "face" | "body_part" | "non_medical" | "unclear",
  "subjectDetected": true | false,
  "subjectDescription": "What was detected or why nothing was found",
  "quality": "GOOD" | "ACCEPTABLE" | "POOR" | "UNUSABLE",
  "qualityIssues": ["Array of specific issues: blurry, dark, overexposed, too far, obstructed, etc."],
  "multipleSubjects": true | false,
  "framesOfInterest": "For video: description of key moments. For image: N/A",
  "suggestedAnalysis": "fundus_screen" | "skin_screen" | "wound_assessment" | "general_medical" | "resubmit_needed",
  "resubmitGuidance": "If resubmit_needed: specific instructions for the user to get a better capture. null otherwise."
}
`.trim();

async function triageMedia(
  mediaParts: any[]
): Promise<{ triage: any; pass: AnalysisPass }> {
  const start = Date.now();
  const model = getModel(0.1);

  try {
    const result = await model.generateContent([
      { text: TRIAGE_PROMPT },
      ...mediaParts,
    ]);

    const text = result.response.text();
    const parsed = safeJsonParse(text);
    return {
      triage: parsed,
      pass: { passNumber: 0, strategy: "triage", result: parsed, error: null, durationMs: Date.now() - start },
    };
  } catch (err: any) {
    return {
      triage: null,
      pass: { passNumber: 0, strategy: "triage", result: null, error: err.message, durationMs: Date.now() - start },
    };
  }
}

// ─────────────────────────────────────────────
// MULTI-PASS ANALYSIS ENGINE
// ─────────────────────────────────────────────

export type AnalysisConfig = {
  analysisType: "fundus" | "skin" | "general";
  profileBlock: string;
  additionalContext?: string;
  forceType?: boolean; // If true, skip triage and go straight to analysis
};

export async function runAnalysisPipeline(
  media: MediaInput,
  config: AnalysisConfig
): Promise<AnalysisPipeline> {
  const pipelineStart = Date.now();
  const passes: AnalysisPass[] = [];
  const backtrackLog: BacktrackEvent[] = [];

  // ── Step 0: Prepare media parts for Gemini ──────────
  const mediaParts = [{ inlineData: { mimeType: media.mimeType, data: media.data } }];

  // ── Step 1: Triage — What are we looking at? ──────────
  if (!config.forceType) {
    const { triage, pass: triagePass } = await triageMedia(mediaParts);
    passes.push(triagePass);

    if (!triage) {
      // Triage itself failed — backtrack to direct analysis
      backtrackLog.push({
        trigger: "triage_failed",
        from: "triage",
        to: "direct_analysis",
        reasoning: "Could not classify the input. Proceeding with requested analysis type directly.",
      });
    } else if (!triage.subjectDetected) {
      // ── BACKTRACK: No subject found ──────────
      backtrackLog.push({
        trigger: "no_subject_detected",
        from: "triage",
        to: "enhanced_detection",
        reasoning: `Triage could not find a ${config.analysisType} subject: ${triage.subjectDescription}`,
      });

      // Pass 1B: Enhanced detection — ask Gemini to look harder
      const enhancedResult = await runEnhancedDetection(mediaParts, config, triage);
      passes.push(enhancedResult.pass);

      if (!enhancedResult.found) {
        // ── BACKTRACK: Still nothing — provide guidance ──────────
        backtrackLog.push({
          trigger: "enhanced_detection_failed",
          from: "enhanced_detection",
          to: "user_guidance",
          reasoning: "Even with enhanced analysis, the target subject was not found.",
        });

        return {
          success: false,
          finalResult: buildSubjectNotFoundResult(config.analysisType, triage),
          passes,
          backtrackLog,
          totalDurationMs: Date.now() - pipelineStart,
        };
      }
    } else if (triage.quality === "UNUSABLE") {
      // ── BACKTRACK: Image too poor ──────────
      backtrackLog.push({
        trigger: "unusable_quality",
        from: "triage",
        to: "quality_recovery",
        reasoning: `Image quality is unusable: ${triage.qualityIssues?.join(", ")}`,
      });

      // Try quality recovery pass
      const recoveryResult = await runQualityRecovery(mediaParts, config, triage);
      passes.push(recoveryResult.pass);

      if (!recoveryResult.usable) {
        return {
          success: false,
          finalResult: buildQualityErrorResult(triage),
          passes,
          backtrackLog,
          totalDurationMs: Date.now() - pipelineStart,
        };
      }

      backtrackLog.push({
        trigger: "quality_partially_recovered",
        from: "quality_recovery",
        to: "main_analysis_with_caveats",
        reasoning: "Some usable data was extracted despite quality issues. Proceeding with caveats.",
      });
    } else if (triage.contentType !== config.analysisType && triage.suggestedAnalysis !== `${config.analysisType}_screen`) {
      // ── BACKTRACK: Wrong type of image ──────────
      backtrackLog.push({
        trigger: "content_type_mismatch",
        from: `expected_${config.analysisType}`,
        to: `detected_${triage.contentType}`,
        reasoning: `User requested ${config.analysisType} analysis but image appears to be: ${triage.contentType}. ${triage.subjectDescription}`,
      });

      // Auto-reroute if we can
      if (triage.suggestedAnalysis && triage.suggestedAnalysis !== "resubmit_needed") {
        const rerouted = mapSuggestionToType(triage.suggestedAnalysis);
        if (rerouted && rerouted !== config.analysisType) {
          backtrackLog.push({
            trigger: "auto_reroute",
            from: config.analysisType,
            to: rerouted,
            reasoning: `Auto-rerouting to ${rerouted} analysis based on detected content.`,
          });
          config.analysisType = rerouted as any;
        }
      }
    }
  }

  // ── Step 2: Main analysis ──────────
  const mainPrompt = buildMainPrompt(config);
  const mainResult = await runMainAnalysis(mediaParts, mainPrompt, 1);
  passes.push(mainResult.pass);

  if (!mainResult.result) {
    // ── BACKTRACK: Main analysis failed ──────────
    backtrackLog.push({
      trigger: "main_analysis_failed",
      from: "main_analysis",
      to: "simplified_analysis",
      reasoning: `Primary analysis returned no result: ${mainResult.error}`,
    });

    // Retry with simplified prompt
    const simplifiedPrompt = buildSimplifiedPrompt(config);
    const retryResult = await runMainAnalysis(mediaParts, simplifiedPrompt, 2);
    passes.push(retryResult.pass);

    if (!retryResult.result) {
      return {
        success: false,
        finalResult: buildAnalysisFailedResult(config.analysisType),
        passes,
        backtrackLog,
        totalDurationMs: Date.now() - pipelineStart,
      };
    }

    return {
      success: true,
      finalResult: retryResult.result,
      passes,
      backtrackLog,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  // ── Step 3: Validation pass — sanity-check the findings ──────────
  const validation = await runValidationPass(mediaParts, mainResult.result, config);
  passes.push(validation.pass);

  let finalResult = mainResult.result;

  if (validation.corrections?.length > 0) {
    backtrackLog.push({
      trigger: "validation_corrections",
      from: "main_analysis",
      to: "corrected_result",
      reasoning: `Validation found ${validation.corrections.length} issue(s): ${validation.corrections.join("; ")}`,
    });
    finalResult = validation.correctedResult ?? finalResult;
  }

  return {
    success: true,
    finalResult,
    passes,
    backtrackLog,
    totalDurationMs: Date.now() - pipelineStart,
  };
}

// ─────────────────────────────────────────────
// PASS RUNNERS
// ─────────────────────────────────────────────

async function runEnhancedDetection(
  mediaParts: any[],
  config: AnalysisConfig,
  triage: any
): Promise<{ found: boolean; pass: AnalysisPass }> {
  const start = Date.now();
  const model = getModel(0.3);

  const targetDescriptions: Record<string, string> = {
    fundus: "a retinal fundus photograph — the circular image of the back of the eye showing blood vessels, optic disc, and macula. It may be dark, red/orange, or have a circular vignette.",
    skin: "a photograph of human skin showing a condition, lesion, rash, discoloration, or wound. Look for ANY area of skin even if partially visible.",
    general: "any health-related or medical subject matter including body parts, medical devices, lab reports, medications, etc.",
  };

  const prompt = `
The initial scan did not detect the expected subject. Look MORE CAREFULLY at this image.

We are looking for: ${targetDescriptions[config.analysisType]}

The initial scan said: "${triage?.subjectDescription}"

Please re-examine. Consider:
- The subject might be partially visible, cropped, or at an unusual angle
- The lighting may make the subject hard to see
- There may be medical equipment or context clues

Return JSON:
{
  "found": true | false,
  "confidence": 0.0-1.0,
  "description": "What you found or why you still cannot find the target",
  "alternativeSubjects": ["Other medical subjects detected, if any"]
}
  `.trim();

  try {
    const result = await model.generateContent([{ text: prompt }, ...mediaParts]);
    const parsed = safeJsonParse(result.response.text());
    return {
      found: parsed?.found === true && (parsed?.confidence ?? 0) > 0.3,
      pass: { passNumber: 1, strategy: "enhanced_detection", result: parsed, error: null, durationMs: Date.now() - start },
    };
  } catch (err: any) {
    return {
      found: false,
      pass: { passNumber: 1, strategy: "enhanced_detection", result: null, error: err.message, durationMs: Date.now() - start },
    };
  }
}

async function runQualityRecovery(
  mediaParts: any[],
  config: AnalysisConfig,
  triage: any
): Promise<{ usable: boolean; pass: AnalysisPass }> {
  const start = Date.now();
  const model = getModel(0.2);

  const prompt = `
The image quality was flagged as UNUSABLE with these issues: ${triage.qualityIssues?.join(", ")}.

Despite the poor quality, try to extract ANY useful clinical information. Even partial observations are valuable.

Focus on the highest-quality region.

Return JSON:
{
  "usable": true | false,
  "partialFindings": "Whatever you could observe despite quality issues",
  "confidenceReduction": 0.0-1.0,
  "specificIssues": ["Exactly what makes this hard to analyze"],
  "recaptureInstructions": [
    "Step-by-step instructions for the user to take a better photo/video"
  ]
}
  `.trim();

  try {
    const result = await model.generateContent([{ text: prompt }, ...mediaParts]);
    const parsed = safeJsonParse(result.response.text());
    return {
      usable: parsed?.usable === true,
      pass: { passNumber: 1, strategy: "quality_recovery", result: parsed, error: null, durationMs: Date.now() - start },
    };
  } catch (err: any) {
    return {
      usable: false,
      pass: { passNumber: 1, strategy: "quality_recovery", result: null, error: err.message, durationMs: Date.now() - start },
    };
  }
}

async function runMainAnalysis(
  mediaParts: any[],
  prompt: string,
  passNumber: number
): Promise<{ result: any; error: string | null; pass: AnalysisPass }> {
  const start = Date.now();
  const model = getModel(0.2);

  try {
    const result = await model.generateContent([{ text: prompt }, ...mediaParts]);
    const text = result.response.text();
    const parsed = safeJsonParse(text);

    if (!parsed) {
      return {
        result: null,
        error: "Model returned unparseable response",
        pass: { passNumber, strategy: "main_analysis", result: null, error: "JSON parse failed", durationMs: Date.now() - start },
      };
    }

    return {
      result: parsed.screeningResult ?? parsed,
      error: null,
      pass: { passNumber, strategy: passNumber === 1 ? "main_analysis" : "simplified_retry", result: parsed, error: null, durationMs: Date.now() - start },
    };
  } catch (err: any) {
    return {
      result: null,
      error: err.message,
      pass: { passNumber, strategy: "main_analysis", result: null, error: err.message, durationMs: Date.now() - start },
    };
  }
}

async function runValidationPass(
  mediaParts: any[],
  mainResult: any,
  config: AnalysisConfig
): Promise<{ corrections: string[]; correctedResult: any | null; pass: AnalysisPass }> {
  const start = Date.now();
  const model = getModel(0.1);

  const prompt = `
You are a medical AI quality reviewer. Another AI pass produced the following analysis. Cross-check it against the actual image/video.

Previous analysis:
${JSON.stringify(mainResult, null, 2)}

Verify:
1. Are the findings consistent with what's actually visible?
2. Are severity levels appropriate (not over- or under-stated)?
3. Are there any findings the first pass MISSED?

Return JSON:
{
  "validated": true | false,
  "corrections": ["Array of specific corrections needed, empty if analysis is solid"],
  "missedFindings": ["Anything the first pass missed"],
  "overstatements": ["Anything that was rated too severely"],
  "understatements": ["Anything that was rated too mildly"],
  "correctedResult": null
}

If corrections are needed, include the full corrected screening result in "correctedResult" using the same schema as the original. If no corrections needed, set correctedResult to null.
  `.trim();

  try {
    const result = await model.generateContent([{ text: prompt }, ...mediaParts]);
    const parsed = safeJsonParse(result.response.text());
    return {
      corrections: parsed?.corrections ?? [],
      correctedResult: parsed?.correctedResult ?? null,
      pass: { passNumber: 99, strategy: "validation", result: parsed, error: null, durationMs: Date.now() - start },
    };
  } catch (err: any) {
    return {
      corrections: [],
      correctedResult: null,
      pass: { passNumber: 99, strategy: "validation", result: null, error: err.message, durationMs: Date.now() - start },
    };
  }
}

// ─────────────────────────────────────────────
// PROMPT BUILDERS
// ─────────────────────────────────────────────

function buildMainPrompt(config: AnalysisConfig): string {
  const mediaInstruction = "";

  if (config.analysisType === "fundus") {
    return buildFundusPrompt(config, mediaInstruction);
  } else if (config.analysisType === "skin") {
    return buildSkinPrompt(config, mediaInstruction);
  }
  return buildGeneralPrompt(config, mediaInstruction);
}

function buildFundusPrompt(config: AnalysisConfig, mediaInstruction: string): string {
  return `
You are a clinical ophthalmology screening assistant for NIMI, a preventive health platform serving urban Nigerians.

${mediaInstruction}

${config.profileBlock}
${config.additionalContext ? `Patient reports: "${config.additionalContext}"` : ""}

ANALYZE the retinal fundus and return a JSON object:

{
  "screeningResult": {
    "imageQuality": "GOOD" | "ACCEPTABLE" | "POOR",
    "qualityNote": "string",
    "mediaType": "${config.analysisType === "fundus" ? "fundus" : "skin"}",
    "findings": [
      {
        "finding": "Name",
        "location": "Where in the retina",
        "severity": "NORMAL" | "MILD" | "MODERATE" | "SEVERE",
        "description": "Plain-language explanation",
        "videoTimestamp": "If video: approximate moment this was clearest. null for images."
      }
    ],
    "riskIndicators": {
      "hypertensiveRetinopathy": { "risk": "LOW"|"MODERATE"|"HIGH", "confidence": 0.0-1.0, "evidence": "string" },
      "diabeticRetinopathy": { "risk": "LOW"|"MODERATE"|"HIGH", "confidence": 0.0-1.0, "evidence": "string" },
      "glaucomaIndicators": { "risk": "LOW"|"MODERATE"|"HIGH", "confidence": 0.0-1.0, "evidence": "string" },
      "macularAbnormality": { "risk": "LOW"|"MODERATE"|"HIGH", "confidence": 0.0-1.0, "evidence": "string" }
    },
    "overallRisk": "LOW" | "MODERATE" | "HIGH",
    "summary": "2-3 sentences, speak directly to the patient using you/your",
    "recommendations": ["3-5 specific next steps"],
    "urgency": "ROUTINE" | "SOON" | "URGENT",
    "disclaimer": "This is an AI-assisted screening, not a medical diagnosis. Please consult an ophthalmologist."
  }
}

RULES:
- Factor existing conditions and family history into risk sensitivity.
- Hypertension/diabetes in profile = increase sensitivity to vascular changes.
- Be culturally appropriate for Nigerian audience.
- Never diagnose. Always recommend professional follow-up for MODERATE+.
  `.trim();
}

function buildSkinPrompt(config: AnalysisConfig, mediaInstruction: string): string {
  return `
You are a dermatology screening assistant for NIMI, serving urban Nigerians.

${mediaInstruction}

${config.profileBlock}
${config.additionalContext ? `Patient describes: "${config.additionalContext}"` : ""}

ANALYZE the skin and return JSON:

{
  "screeningResult": {
    "imageQuality": "GOOD" | "ACCEPTABLE" | "POOR",
    "qualityNote": "string",
    "mediaType": "skin",
    "bodyRegion": "Detected body region",
    "skinType": "Estimated Fitzpatrick type (IV-VI common in Nigeria)",
    "observations": [
      {
        "feature": "Name of skin feature",
        "morphology": "Shape, border, color, texture, size",
        "distribution": "Localized, scattered, symmetric, etc.",
        "severity": "MILD" | "MODERATE" | "SEVERE",
        "videoTimestamp": "If video: when best visible. null for images."
      }
    ],
    "possibleConditions": [
      {
        "condition": "Name",
        "likelihood": "LOW" | "MODERATE" | "HIGH",
        "reasoning": "Visual evidence",
        "commonInRegion": true | false
      }
    ],
    "redFlags": ["Concerning signs needing urgent attention, empty if none"],
    "overallConcern": "LOW" | "MODERATE" | "HIGH",
    "summary": "2-3 sentences, speak directly to the patient",
    "recommendations": ["3-5 specific next steps"],
    "urgency": "ROUTINE" | "SOON" | "URGENT",
    "disclaimer": "This is an AI-assisted screening, not a medical diagnosis. Please consult a dermatologist."
  }
}

RULES:
- Consider tropical/Nigerian conditions: fungal infections, eczema, keloids, tinea, contact dermatitis.
- Account for darker skin tones (Fitzpatrick IV-VI). Erythema appears darker/purple, not red.
- Diabetes in profile = increased infection risk.
- Signs of skin cancer (asymmetry, irregular borders, color variation, >6mm, evolution) = URGENT.
- Never prescribe medication.
  `.trim();
}

function buildGeneralPrompt(config: AnalysisConfig, mediaInstruction: string): string {
  return `
You are a health-focused visual analysis assistant for NIMI.

${mediaInstruction}

${config.profileBlock}
${config.additionalContext ? `Patient asks: "${config.additionalContext}"` : ""}

Analyze and return JSON:
{
  "screeningResult": {
    "imageQuality": "GOOD" | "ACCEPTABLE" | "POOR",
    "mediaType": "general",
    "detectedContent": "What you see",
    "answer": "Comprehensive plain-language analysis. Speak directly to the user.",
    "confidence": 0.0-1.0,
    "category": "Dermatology | Ophthalmology | Wound Care | Nutrition | General",
    "findings": [{ "finding": "string", "severity": "MILD"|"MODERATE"|"SEVERE", "description": "string" }],
    "actionNeeded": true | false,
    "recommendations": ["Next steps"],
    "urgency": "ROUTINE" | "SOON" | "URGENT",
    "disclaimer": "AI-assisted assessment, not medical advice."
  }
}
  `.trim();
}

function buildSimplifiedPrompt(config: AnalysisConfig): string {
  return `
Analyze this medical image for ${config.analysisType} screening.
${config.profileBlock}
${config.additionalContext ?? ""}

Provide a simple JSON screening result with: imageQuality, findings (array), overallRisk or overallConcern (LOW/MODERATE/HIGH), summary (speak to patient directly), recommendations (array), urgency (ROUTINE/SOON/URGENT), disclaimer.
  `.trim();
}

// ─────────────────────────────────────────────
// ERROR RESULT BUILDERS
// ─────────────────────────────────────────────

function buildSubjectNotFoundResult(
  analysisType: string,
  triage: any
): any {
  const guidance: Record<string, string[]> = {
    fundus: [
      "Position the camera directly in front of the eye, about 2-3 cm away",
      "Use a fundus camera or ophthalmoscope attachment if available",
      "Ensure the retina (back of the eye) is visible — you should see blood vessels and the optic disc",
      "The image should show a circular view of the inner eye, typically orange/red in color",
      "Avoid flash directly into the eye. Use the device's built-in illumination",
    ].filter(Boolean),
    skin: [
      "Position the camera 10-15 cm from the affected skin area",
      "Ensure good, even lighting — natural daylight works best",
      "The skin condition (rash, lesion, discoloration) should fill most of the frame",
      "Include some surrounding normal skin for comparison",
      "Avoid shadows falling across the affected area",
    ].filter(Boolean),
    general: [
      "Ensure the health-related subject is clearly visible and in focus",
      "Use good lighting and hold the camera steady",
    ].filter(Boolean),
  };

  const detectedInstead = triage?.contentType && triage.contentType !== "unclear"
    ? `What was detected instead: ${triage.subjectDescription ?? triage.contentType}.`
    : "";

  return {
    error: "SUBJECT_NOT_FOUND",
    errorCode: "E_NO_SUBJECT",
    message: `Could not detect a valid ${analysisType} subject in the uploaded image. ${detectedInstead}`,
    detectedContent: triage?.contentType ?? "unknown",
    detectedDescription: triage?.subjectDescription ?? "Unable to classify content",
    alternativeSubjects: triage?.alternativeSubjects ?? [],
    recaptureGuidance: guidance[analysisType] ?? guidance.general,
    suggestedAction: triage?.suggestedAnalysis === "resubmit_needed"
      ? "RESUBMIT"
      : triage?.suggestedAnalysis
        ? `TRY_${triage.suggestedAnalysis.toUpperCase()}`
        : "RESUBMIT",
    canRetryAs: triage?.suggestedAnalysis && triage.suggestedAnalysis !== "resubmit_needed"
      ? mapSuggestionToType(triage.suggestedAnalysis)
      : null,
  };
}

function buildQualityErrorResult(triage: any): any {
  return {
    error: "QUALITY_UNUSABLE",
    errorCode: "E_BAD_QUALITY",
    message: `The image quality is too poor for reliable analysis.`,
    qualityIssues: triage?.qualityIssues ?? ["Unspecified quality issues"],
    recaptureGuidance: [
      "Ensure good lighting — natural daylight or a bright room light",
      "Hold the camera steady or use a tripod/stand",
      "Make sure the subject is in sharp focus before capturing",
      "Avoid extreme close-ups that cause blur",
      "Clean the camera lens",
      "Use the highest resolution camera setting available",
    ],
    suggestedAction: "RESUBMIT",
  };
}

function buildAnalysisFailedResult(analysisType: string): any {
  return {
    error: "ANALYSIS_FAILED",
    errorCode: "E_ANALYSIS_FAILED",
    message: `The AI was unable to complete the ${analysisType} analysis after multiple attempts.`,
    recaptureGuidance: [
      "Try uploading a clearer image or video",
      "Ensure the subject is well-lit and in focus",
      "If the issue persists, try the general analysis endpoint instead",
    ],
    suggestedAction: "RETRY_OR_GENERAL",
  };
}

function buildErrorResult(code: string, message: string, guidance: string[]): any {
  return {
    error: code,
    errorCode: `E_${code}`,
    message,
    recaptureGuidance: guidance,
    suggestedAction: "RESUBMIT",
  };
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapSuggestionToType(suggestion: string): string | null {
  const map: Record<string, string> = {
    fundus_screen: "fundus",
    skin_screen: "skin",
    wound_assessment: "skin",
    general_medical: "general",
  };
  return map[suggestion] ?? null;
}
