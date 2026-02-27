'use server';
/**
 * @fileOverview A Genkit flow for generating personalized micro-lessons.
 *
 * - generateMicroLesson - A function that generates a short, culturally relevant health lesson.
 * - PersonalizedMicroLessonInput - The input type for the generateMicroLesson function.
 * - PersonalizedMicroLessonOutput - The return type for the generateMicroLesson function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const UserProfileSchema = z.object({
  age: z.number().optional().describe('Patient age'),
  gender: z.string().optional().describe('e.g. "male", "female"'),
  existingConditions: z.array(z.string()).optional().describe('Known diagnoses'),
  familyHistory: z.array(z.string()).optional().describe('Family medical history'),
  lifestyle: z.object({
    smokingStatus: z.string().optional().describe('e.g. "smoker", "non-smoker", "ex-smoker"'),
    physicalActivityLevel: z.string().optional().describe('e.g. "sedentary", "moderate", "active"'),
    dietType: z.string().optional().describe('e.g. "vegetarian", "mixed", "high-fat"'),
    stressLevel: z.number().min(1).max(10).optional().describe('1 (low) – 10 (high)')
  }).optional(),
  preferredLanguage: z.string().optional().describe('ISO language code'),
}).optional();
export type UserProfile = z.infer<typeof UserProfileSchema>;

const MicroLessonSchema = z.object({
  title: z.string().describe('Catchy lesson title'),
  content: z.string().describe('The lesson body (~120–150 words)'),
  category: z.string().describe('e.g. "Nutrition", "Exercise", "Stress", "Sleep", "Medication"'),
  readTimeSecs: z.number().describe('Estimated read time in seconds'),
  sourceNote: z.string().describe('Brief source attribution'),
});
export type MicroLesson = z.infer<typeof MicroLessonSchema>;

const PersonalizedMicroLessonInputSchema = z.object({
  topic: z.string().optional().describe('If omitted, generates based on userProfile.existingConditions'),
  userProfile: UserProfileSchema.optional().describe('Personalises the lesson to the user\'s conditions'),
});
export type PersonalizedMicroLessonInput = z.infer<typeof PersonalizedMicroLessonInputSchema>;

const PersonalizedMicroLessonOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the request was successful'),
  response: z.string().describe('The AI\'s plain-language reply with the lesson summary'),
  microLesson: MicroLessonSchema.describe('The generated micro-lesson details'),
});
export type PersonalizedMicroLessonOutput = z.infer<typeof PersonalizedMicroLessonOutputSchema>;

const prompt = ai.definePrompt({
  name: 'personalizedMicroLessonPrompt',
  input: { schema: PersonalizedMicroLessonInputSchema },
  output: { schema: PersonalizedMicroLessonOutputSchema },
  prompt: `You are an expert health educator specializing in creating short, practical, and culturally relevant health lessons (under 60 seconds to read).

Generate a micro-lesson based on the provided topic or the user's health profile. If a topic is provided, prioritize it. Otherwise, infer a relevant topic from the user's existing conditions or lifestyle.

Keep the language simple, engaging, and actionable. Ensure the content is approximately 120-150 words.

User Profile:
{{#if userProfile}}
  Age: {{{userProfile.age}}}
  Gender: {{{userProfile.gender}}}
  Existing Conditions: {{#each userProfile.existingConditions}}- {{{this}}}{{/each}}
  Family History: {{#each userProfile.familyHistory}}- {{{this}}}{{/each}}
  Smoking Status: {{{userProfile.lifestyle.smokingStatus}}}
  Physical Activity Level: {{{userProfile.lifestyle.physicalActivityLevel}}}
  Diet Type: {{{userProfile.lifestyle.dietType}}}
  Stress Level: {{{userProfile.lifestyle.stressLevel}}}
  Preferred Language: {{{userProfile.preferredLanguage}}}
{{else}}
  No specific user profile provided.
{{/if}}

Topic: {{{topic}}}

Your output MUST be a JSON object matching the following schema. Populate the 'response' field with a brief summary/introduction to the micro-lesson, and the 'microLesson' field with the detailed lesson.

`,
});

const generateMicroLessonFlow = ai.defineFlow(
  {
    name: 'generateMicroLessonFlow',
    inputSchema: PersonalizedMicroLessonInputSchema,
    outputSchema: PersonalizedMicroLessonOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

export async function generateMicroLesson(input: PersonalizedMicroLessonInput): Promise<PersonalizedMicroLessonOutput> {
  return generateMicroLessonFlow(input);
}
