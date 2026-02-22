'use server';
/**
 * @fileOverview This flow provides an AI agent for interpreting raw lab results.
 * It parses the lab text, identifies biomarkers, their status, and provides
 * a plain-language summary with recommendations.
 *
 * - interpretLabResults - A function that handles the lab result interpretation process.
 * - LabResultInterpreterInput - The input type for the interpretLabResults function.
 * - LabResultInterpreterOutput - The return type for the interpretLabResults function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
// import {UserProfileSchema} from '@/ai/types.js';


const UserProfileSchema = z.object({
  age: z.number().optional(),
  gender: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  bmi: z.number().optional(),
  existingConditions: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  lifestyle: z.object({
    smokingStatus: z.string().optional(),
    physicalActivityLevel: z.string().optional(),
    dietType: z.string().optional(),
    stressLevel: z.number().optional(),
  }).optional(),
  preferredLanguage: z.string().optional(),
});

const ParsedBiomarkerStatusSchema = z.union([
  z.literal('NORMAL'),
  z.literal('BORDERLINE'),
  z.literal('CONCERNING'),
]);

const ParsedBiomarkerSchema = z.object({
  name: z.string().describe('Biomarker name, e.g., "Haemoglobin"'),
  value: z.number().describe('Measured value of the biomarker'),
  unit: z.string().describe('Unit of measurement, e.g., "g/dL", "mg/dL"'),
  referenceMin: z
    .number()
    .optional()
    .describe('Lower bound of the normal reference range'),
  referenceMax: z
    .number()
    .optional()
    .describe('Upper bound of the normal reference range'),
  status: ParsedBiomarkerStatusSchema.describe('Traffic-light status of the biomarker'),
  flagNote: z
    .string()
    .describe('Plain-language explanation of the biomarker status'),
});
export type ParsedBiomarker = z.infer<typeof ParsedBiomarkerSchema>;

const LabInterpretationOverallStatusSchema = z.union([
  z.literal('NORMAL'),
  z.literal('BORDERLINE'),
  z.literal('CONCERNING'),
]);

const LabInterpretationSchema = z.object({
  testName: z.string().describe('Name of the lab test, e.g., "Complete Blood Count"'),
  overallStatus: LabInterpretationOverallStatusSchema.describe(
    'Overall traffic-light status for the entire lab report'
  ),
  biomarkers: z
    .array(ParsedBiomarkerSchema)
    .describe('Array of individual biomarker results'),
  plainSummary: z
    .string()
    .describe('2–3 sentence non-medical summary of the lab results'),
  recommendations: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe('3–5 actionable next steps or recommendations'),
});
export type LabInterpretation = z.infer<typeof LabInterpretationSchema>;

const LabResultInterpreterInputSchema = z.object({
  labText: z
    .string()
    .min(10, 'Lab text must be at least 10 characters long.')
    .describe('Raw lab result text to be interpreted'),
  userProfile: UserProfileSchema.optional().describe('Patient context for personalization'),
});
export type LabResultInterpreterInput = z.infer<
  typeof LabResultInterpreterInputSchema
>;

const LabResultInterpreterOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful'),
  summary: z
    .string()
    .describe(
      'A concise summary of the lab interpretation, suitable for direct display.'
    ),
  labInterpretation: LabInterpretationSchema.describe('Detailed interpretation of the lab results'),
});
export type LabResultInterpreterOutput = z.infer<
  typeof LabResultInterpreterOutputSchema
>;

const labResultInterpreterPrompt = ai.definePrompt({
  name: 'labResultInterpreterPrompt',
  input: {schema: LabResultInterpreterInputSchema},
  output: {schema: LabResultInterpreterOutputSchema},
  prompt: `You are an expert medical assistant specializing in interpreting lab results for patients.\nYour goal is to provide a clear, easy-to-understand interpretation of raw lab results, along with actionable recommendations.\nConsider the patient's context for personalization.\n\nRaw Lab Results:\n{{{labText}}}\n\n{{#if userProfile}}\nPatient Profile:\nAge: {{{userProfile.age}}}\n{{#if userProfile.gender}}Gender: {{{userProfile.gender}}}\n{{/if}}{{#if userProfile.existingConditions.length}}Existing Conditions: {{#each userProfile.existingConditions}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}\n{{/if}}{{#if userProfile.familyHistory.length}}Family History: {{#each userProfile.familyHistory}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}\n{{/if}}{{#if userProfile.lifestyle}}\nLifestyle:\n  {{#if userProfile.lifestyle.smokingStatus}}Smoking Status: {{{userProfile.lifestyle.smokingStatus}}}\n{{/if}}  {{#if userProfile.lifestyle.physicalActivityLevel}}Physical Activity Level: {{{userProfile.lifestyle.physicalActivityLevel}}}\n{{/if}}  {{#if userProfile.lifestyle.dietType}}Diet Type: {{{userProfile.lifestyle.dietType}}}\n{{/if}}  {{#if userProfile.lifestyle.stressLevel}}Stress Level: {{{userProfile.lifestyle.stressLevel}}}\n{{/if}}{{/if}}{{#if userProfile.preferredLanguage}}Preferred Language: {{{userProfile.preferredLanguage}}}\n{{/if}}\n{{/if}}\n\nProvide the interpretation in a JSON format that strictly adheres to the following schema definition. Ensure all fields are populated accurately and comprehensively.\nFor each biomarker, accurately extract its name, value, and unit. If reference ranges are explicitly mentioned or can be reasonably inferred from common medical knowledge, include them; otherwise, omit them. Determine the 'status' (NORMAL, BORDERLINE, or CONCERNING) for each biomarker based on its value relative to the reference range or general medical guidelines. Provide a concise 'flagNote' that explains the status in plain language.\nThe 'overallStatus' should reflect the most concerning biomarker status present, or 'NORMAL' if all are normal.\nThe 'plainSummary' should be a 2–3 sentence non-medical overview.\nThe 'recommendations' should be 3-5 actionable next steps that are relevant and easy for a patient to understand.\nThe 'summary' field in the root object should be a very concise, direct statement about the overall findings, e.g., "Your blood count looks mostly normal, but your fasting glucose is elevated...".\nThe 'success' field must always be true if the interpretation is successfully generated.\n`,
});

const labResultInterpreterFlow = ai.defineFlow(
  {
    name: 'labResultInterpreterFlow',
    inputSchema: LabResultInterpreterInputSchema,
    outputSchema: LabResultInterpreterOutputSchema,
  },
  async (input) => {
    const {output} = await labResultInterpreterPrompt(input);
    if (!output) {
      throw new Error('Failed to generate lab interpretation.');
    }
    return output;
  }
);

export async function interpretLabResults(
  input: LabResultInterpreterInput
): Promise<LabResultInterpreterOutput> {
  return labResultInterpreterFlow(input);
}
