import type { ToolRequest, ToolResult, UserProfile } from "../ai/types.js";

export const buildProfileBlock = (profile: UserProfile | null) => {
    return profile ? `
### Patient Profile
- **Gender**: ${profile.gender ?? "Not specified"}
- **Age**: ${profile.age ?? "Not specified"}
- **Height**: ${profile.heightCm ? profile.heightCm + " cm" : "Not recorded"}
- **Weight**: ${profile.weightKg ? profile.weightKg + " kg" : "Not recorded"}
- **BMI**: ${profile.bmi ? profile.bmi.toFixed(1) : "Not calculated"}
- **Existing Conditions**: ${profile.existingConditions?.length ? profile.existingConditions.join(", ") : "None reported"}
- **Family History**: ${profile.familyHistory?.length ? profile.familyHistory.join(", ") : "None reported"}
- **Smoking**: ${profile.lifestyle?.smokingStatus ?? "Unknown"}
- **Physical Activity**: ${profile.lifestyle?.physicalActivityLevel ?? "Unknown"}
- **Diet**: ${profile.lifestyle?.dietType ?? "Unknown"}
- **Stress Level (1–10)**: ${profile.lifestyle?.stressLevel ?? "Unknown"}
    `.trim() : "No patient profile data available.";
}


export const buildToolResultsBlock = (toolResults: ToolResult[] | null) => {
    const hasToolResults = toolResults && toolResults.length > 0;
    return hasToolResults ? `
### Real-Time Vitals (Just Collected)
The patient just completed a heart rate scan. Here is the data:
${JSON.stringify(toolResults, null, 2)}

IMPORTANT: Use this real-time vital data to enhance your assessment. Factor the heart rate, signal quality, and confidence into your analysis. Compare against the patient's profile and conditions.
    `.trim() : "";
}