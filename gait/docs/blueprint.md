# **App Name**: VitalThread

## Core Features:

- User Onboarding: Simple onboarding screen with user_id input and data collection consent. Persist user ID in local storage.
- Motion Data Collection: Collect accelerometer data at 10Hz, storing it in a rolling buffer.
- Activity Classification: Classify user activity (stationary, fidgeting, walking, active) based on accelerometer data analysis.
- Step Estimation: Estimate the number of steps taken within each 5-minute window using peak detection logic.
- Local Storage Logging: Log processed motion snapshots to localStorage, including activity, step count, and anomaly flags.
- Anomaly Detection: Detect anomalies such as prolonged stillness, high variability, and irregular gait. Implement tool usage in identifying irregular_gait cases by comparing current data with historical patterns and biomechanical constraints to determine validity. Requires tool to assess potential musculoskeletal impacts, suggesting physiotherapy guidance when indicated.
- PWA Persistence: Implement background persistence using Service Worker and Wake Lock API.
- Endpoint Sync: Periodically sync unsynced snapshots from localStorage to a REST API endpoint.

## Style Guidelines:

- Primary color: Vibrant green (#00FF88), drawing from the prompt’s suggestion of theme_color for a lively, technological feel.
- Background color: Dark gray (#0A0A0A), closely related to the primary hue but highly desaturated, to provide high contrast against UI elements.
- Accent color: Cyan (#00FFFF), a lighter hue near green in the color wheel, intended to highlight interactive elements on the active screen.
- Body and headline font: 'Inter', a sans-serif typeface providing a modern, objective feel. The fonts works well as both headlines and body text, ideal for readability.
- Simple, geometric icons to represent activity types and anomaly flags.
- Minimalist dark dashboard layout with key metrics prominently displayed.
- Subtle pulsing animation on the 'Monitoring Active' indicator.