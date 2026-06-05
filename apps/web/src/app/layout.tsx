import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arago — AI-Powered Assessment Platform",
  description: "Help teachers create assessments, analyze learning outcomes, and provide personalized support.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}