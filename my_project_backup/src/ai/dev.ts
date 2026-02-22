import { config } from 'dotenv';
config();

import '@/ai/flows/ncd-risk-assessor.ts';
import '@/ai/flows/personalized-micro-lesson-generator.ts';
import '@/ai/flows/emergency-health-detector.ts';
import '@/ai/flows/lab-result-interpreter-flow.ts';
import '@/ai/flows/conversational-health-qa-flow.ts';