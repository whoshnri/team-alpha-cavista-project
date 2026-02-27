import { Bree_Serif, Inter } from 'next/font/google'
import './globals.css';
import type { Metadata } from 'next';

const breeSerif = Bree_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: '--font-serif',
})

const inter = Inter({
  subsets: ["latin"],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Nimi | Personalized Health Assistant',
  description: 'AI-Powered Health Assistant for Lab Interpretation, NCD Risk Assessment, and Personalized Micro-Lessons.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${breeSerif.variable} ${inter.variable} dark`} suppressHydrationWarning>
      <body className="bg-background text-text-primary antialiased font-serif">
        {children}
      </body>
    </html>
  );
}