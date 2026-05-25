import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawBot — AI DeFi Butler on Mantle",
  description:
    "ClawBot is an AI-powered DeFi assistant that helps you find the best yield strategies on Mantle Network using natural language.",
  openGraph: {
    title: "ClawBot — AI DeFi Butler",
    description: "Natural language DeFi management on Mantle Network",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
