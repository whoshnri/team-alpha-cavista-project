'use server';
/**
 * @fileOverview A Genkit flow for assessing Non-Communicable Disease (NCD) risks.
 *
 * - ncdRiskAssessor - A function that handles the NCD risk assessment process.
 * - NcdRiskAssessorInput - The input type for the ncdRiskAssessor function.
 * - NcdRiskAssessorOutput - The return type for the ncdRiskAssessor function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const UserProfileLifestyleSchema = z.object({
  smokingStatus: z.string().optional().describe('e.g. "smoker", "non-smoker", "ex-smoker"'),
  physicalActivityLevel: z.string().optional().describe('e.g. "sedentary", "moderate", "active"'),
  dietType: z.string().optional().describe('e.g. "vegetarian", "mixed", "high-fat"'),
  stressLevel: z.number().min(1).max(10).optional().describe('1 (low) – 10 (high)')
}).optional();

const UserProfileSchema = z.object({
  age: z.number().int().positive().optional().describe('Patient age'),
  gender: z.string().optional().describe('e.g. "male", "female"'),
  existingConditions: z.array(z.string()).optional().describe('Known diagnoses'),
  familyHistory: z.array(z.string()).optional().describe('Family medical history'),
  lifestyle: UserProfileLifestyleSchema,
  preferredLanguage: z.string().optional().describe('ISO language code'),
}).optional();

export type UserProfile = z.infer<typeof UserProfileSchema>;

const RiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

const RiskScoresSchema = z.object({
  overall: z.number().min(0.0).max(1.0).describe('0.0 (no risk) – 1.0 (maximum risk)'),
  overallLevel: RiskLevelSchema.describe('Human-readable risk tier'),
  diabetes: z.number().min(0.0).max(1.0).describe('0.0 – 1.0'),
  hypertension: z.number().min(0.0).max(1.0).describe('0.0 – 1.0'),
  cardiovascular: z.number().min(0.0).max(1.0).describe('0.0 – 1.0'),
  topFactors: z.array(z.string()).min(3).max(5).describe('Top 3–5 contributing risk factors'),
  recommendations: z.array(z.string()).min(5).describe('5 prioritised lifestyle / clinical recommendations'),
});
export type RiskScores = z.infer<typeof RiskScoresSchema>;

const NcdRiskAssessorInputSchema = z.object({
  userProfile: UserProfileSchema.describe('The user\'s health profile details.'),
  message: z.string().optional().describe('Additional context or specific request for the risk assessment. Defaults to "Please assess my health risk."'),
});
export type NcdRiskAssessorInput = z.infer<typeof NcdRiskAssessorInputSchema>;

const NcdRiskAssessorOutputSchema = z.object({
  summary: z.string().describe('A summary of the overall health risk level and top risk factors.'),
  riskScores: RiskScoresSchema,
});
export type NcdRiskAssessorOutput = z.infer<typeof NcdRiskAssessorOutputSchema>;

export async function ncdRiskAssessor(input: NcdRiskAssessorInput): Promise<NcdRiskAssessorOutput> {
  return ncdRiskAssessorFlow(input);
}

const ncdRiskAssessorPrompt = ai.definePrompt({
  name: 'ncdRiskAssessorPrompt',
  input: {schema: NcdRiskAssessorInputSchema},
  output: {schema: NcdRiskAssessorOutputSchema},
  prompt: `You are an expert health risk assessor. Your task is to analyze the provided user profile and any additional message to calculate and describe the user's risk for Non-Communicable Diseases (NCDs) like diabetes, hypertension, and cardiovascular disease.

Generate a concise summary of the overall risk and top contributing factors. Then, provide detailed risk scores (from 0.0 to 1.0) and human-readable risk levels for overall, diabetes, hypertension, and cardiovascular risks.

Identify the top 3-5 factors contributing to the user's risk based on their profile and lifestyle. Finally, suggest 5 prioritized, actionable lifestyle or clinical recommendations tailored to reduce their identified risks. Ensure recommendations are practical and health-focused.

User Profile:
{{#if userProfile}}
  Age: {{{userProfile.age}}} years
  Gender: {{{userProfile.gender}}}
  Existing Conditions: {{#if userProfile.existingConditions}}{{userProfile.existingConditions}}{{else}}None{{/if}}
  Family History: {{#if userProfile.familyHistory}}{{userProfile.familyHistory}}{{else}}None{{/if}}
  Lifestyle:
    Smoking Status: {{{userProfile.lifestyle.smokingStatus}}}
    Physical Activity Level: {{{userProfile.lifestyle.physicalActivityLevel}}}
    Diet Type: {{{userProfile.lifestyle.dietType}}}
    Stress Level: {{{userProfile.lifestyle.stressLevel}}}
  Preferred Language: {{{userProfile.preferredLanguage}}}
{{else}}
  No user profile provided.
{{/if}}

Message: {{{message}}}`,
});

const ncdRiskAssessorFlow = ai.defineFlow(
  {
    name: 'ncdRiskAssessorFlow',
    inputSchema: NcdRiskAssessorInputSchema,
    outputSchema: NcdRiskAssessorOutputSchema,
  },
  async (input) => {
    const {output} = await ncdRiskAssessorPrompt(input);
    return output!;
  }
);
