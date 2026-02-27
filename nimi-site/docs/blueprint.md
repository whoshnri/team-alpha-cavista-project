# **App Name**: PreventIQ Chat

## Core Features:

- Chat Interface: Simple UI for users to interact with the AI, sending messages and receiving responses.
- Conversational Health Q&A: Utilize the `/api/ai/chat` endpoint to provide conversational health Q&A, routing internally to the correct AI pipeline.
- Lab Result Interpretation: Implement a dedicated section to paste raw lab result text and interpret using the `/api/ai/lab` endpoint, displaying structured biomarker data.
- NCD Risk Assessment: Incorporate a risk assessment feature using the `/api/ai/risk` endpoint, calculating and displaying risk scores for diabetes, hypertension, and cardiovascular disease.
- Personalized Micro-Lessons: Enable the generation of short, culturally relevant health lessons using the `/api/ai/lesson` endpoint.
- Emergency Detection: Integrate emergency detection using the `/api/ai/escalate` endpoint to check messages for medical emergency signals, providing immediate assistance when needed. The LLM will act as a tool to improve results of matching.
- User Profile Management: Allow users to input and manage their health profile (age, gender, existing conditions, lifestyle) to personalize AI responses and risk assessments.

## Style Guidelines:

- Primary color: Light grayish-blue (#B0C4DE) to evoke a sense of calm and trustworthiness, reminiscent of a healthcare setting.
- Background color: Very light grayish-blue (#F0F8FF). The background color is visibly of the same hue as the primary color, but heavily desaturated.
- Accent color: Slightly darker blue (#87CEEB). The accent color should be analogous to the primary color and different in saturation and brightness.
- Body and headline font: 'Inter' sans-serif for a modern, machined, objective, neutral look suitable for both headlines and body text
- Use simple, clean icons to represent different features and categories. Use a blue color palette for consistency.
- Design a clean, intuitive layout with clear sections for chat, lab results, risk assessment, and micro-lessons. Prioritize ease of navigation and readability.
- Incorporate subtle animations to provide feedback and enhance user experience, such as loading animations and transitions between sections.