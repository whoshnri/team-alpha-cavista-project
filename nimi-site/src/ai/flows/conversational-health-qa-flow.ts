
'use server';
/**
 * chat endpoint schema declaration
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
    stressLevel: z.number().optional().describe('1 (low) – 10 (high)'),
  }).optional(),
  preferredLanguage: z.string().optional().describe('ISO language code'),
}).optional();
export type UserProfile = z.infer<typeof UserProfileSchema>;

const ChatHistoryEntrySchema = z.object({
  user: z.string().describe("The user's message"),
  bot: z.string().nullable().describe("The bot's reply"),
});
export type ChatHistoryEntry = z.infer<typeof ChatHistoryEntrySchema>;

const ChatRequestSchema = z.object({
  message: z.string().min(1).describe('The user\'s current message'),
  chatHistory: z.array(ChatHistoryEntrySchema).optional().default([]).describe('Previous turns for context'),
  userProfile: UserProfileSchema,
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

const ChatResponseSchema = z.object({
  success: z.boolean().describe('Always true on success'),
  response: z.string().describe("The AI's plain-language reply"),
  code: z.number().describe('1 = confident answer, 0 = uncertain'),
  category: z.string().describe('Detected topic'),
  chatHistory: z.array(ChatHistoryEntrySchema).describe('Updated history'),
  labInterpretation: z.any().optional(),
  riskScores: z.any().optional(),
  microLesson: z.any().optional(),
  escalation: z.any().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

const chatPrompt = ai.definePrompt({
  name: 'conversationalHealthQandAPrompt',
  input: {
    schema: z.object({
      historyText: z.string().describe('The formatted conversation history.'),
      currentMessage: z.string().describe('The user\'s current message.'),
      profileSummary: z.string().describe('A summary of the user profile.'),
    }),
  },
  output: {
    schema: ChatResponseSchema.omit({ chatHistory: true, success: true }),
  },
  prompt: `You are a friendly health assistant named PreventIQ.

User Profile:
{{{profileSummary}}}

Conversation History:
{{{historyText}}}

User's current message: "{{{currentMessage}}}"

Analyze the intent and provide a helpful response in JSON format.`,
});

const conversationalHealthQandAFlow = ai.defineFlow(
  {
    name: 'conversationalHealthQandAFlow',
    inputSchema: ChatRequestSchema,
    outputSchema: ChatResponseSchema,
  },
  async (input) => {
    const { message, chatHistory: prevChatHistory, userProfile } = input;

    const historyText = prevChatHistory.map(entry => {
      let text = `User: ${entry.user}`;
      if (entry.bot) text += `\nAssistant: ${entry.bot}`;
      return text;
    }).join('\n');

    const profileSummary = userProfile 
      ? `Age: ${userProfile.age}, Gender: ${userProfile.gender}, Conditions: ${userProfile.existingConditions?.join(', ') || 'None'}`
      : 'No profile provided.';

    const { output } = await chatPrompt({
      historyText,
      currentMessage: message,
      profileSummary,
    });

    if (!output) throw new Error('AI model did not return an output.');

    return {
      success: true,
      ...output,
      chatHistory: [...prevChatHistory, { user: message, bot: output.response }],
    };
  }
);

export async function chat(input: ChatRequest): Promise<ChatResponse> {
  return conversationalHealthQandAFlow(input);
}
