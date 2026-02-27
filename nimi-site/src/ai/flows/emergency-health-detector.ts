'use server';
/**
 * - emergencyHealthDetector - A function that handles emergency detection.
 * - EmergencyHealthDetectorInput - The input type for the emergencyHealthDetector function.
 * - EmergencyHealthDetectorOutput - The return type for the emergencyHealthDetector function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const EmergencyHealthDetectorInputSchema = z.object({
  message: z.string().min(1).describe("The user's message describing their symptoms."),
});
export type EmergencyHealthDetectorInput = z.infer<typeof EmergencyHealthDetectorInputSchema>;

const EmergencyHealthDetectorOutputSchema = z.object({
  isEmergency: z.boolean().describe("True if emergency signals were detected in the message."),
  detectedKeywords: z.array(z.string()).describe("A list of emergency phrases or keywords found in the message."),
  urgencyMessage: z.string().describe("An empathetic message urging immediate action."),
  nearestClinicPrompt: z.string().describe("Instructions for seeking immediate medical help, e.g., calling emergency services or going to the nearest clinic."),
});
export type EmergencyHealthDetectorOutput = z.infer<typeof EmergencyHealthDetectorOutputSchema>;

export async function emergencyHealthDetector(input: EmergencyHealthDetectorInput): Promise<EmergencyHealthDetectorOutput> {
  return emergencyHealthDetectorFlow(input);
}

const emergencyHealthDetectorPrompt = ai.definePrompt({
  name: 'emergencyHealthDetectorPrompt',
  input: { schema: EmergencyHealthDetectorInputSchema },
  output: { schema: EmergencyHealthDetectorOutputSchema },
  prompt: `You are an AI medical emergency detector. Your primary goal is to determine if the user's message describes symptoms that indicate a medical emergency and provide immediate, actionable advice if it does.

Analyze the following user message for critical medical symptoms and generate a structured response. If an emergency is detected, set 'isEmergency' to true, list relevant 'detectedKeywords', craft an 'urgencyMessage' to convey the severity and empathy, and provide a 'nearestClinicPrompt' with clear instructions for seeking emergency medical help (e.g., call 911, go to an emergency room, call a local emergency number).

If no emergency is detected, set 'isEmergency' to false, and provide a neutral 'urgencyMessage' and empty 'detectedKeywords' and 'nearestClinicPrompt'. Do NOT provide medical advice or diagnosis. Always err on the side of caution.

User message: "{{{message}}}"`,
});

const emergencyHealthDetectorFlow = ai.defineFlow(
  {
    name: 'emergencyHealthDetectorFlow',
    inputSchema: EmergencyHealthDetectorInputSchema,
    outputSchema: EmergencyHealthDetectorOutputSchema,
  },
  async (input) => {
    const { output } = await emergencyHealthDetectorPrompt(input);
    if (!output) {
      throw new Error('Failed to get emergency detection output.');
    }
    return output;
  }
);
