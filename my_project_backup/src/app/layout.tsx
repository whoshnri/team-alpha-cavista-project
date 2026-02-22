import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PreventIQ Chat',
  description: 'AI-Powered Health Assistant for Lab Interpretation, NCD Risk Assessment, and Personalized Micro-Lessons.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-black text-white">
        <div className="relative z-0">
          {children}
        </div>
      </body>
    </html>
  );
}