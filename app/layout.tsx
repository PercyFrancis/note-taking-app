import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "katex/dist/katex.min.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Note Taking App",
  description: "Note taking app by Percy",
};

const appearanceScript = `
try {
  const stored = JSON.parse(localStorage.getItem("note-taking-app:settings") || "null");
  const theme = stored?.theme || "original";
  const accent = stored?.accent || "blue";
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
} catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script id="appearance-settings" strategy="beforeInteractive">
          {appearanceScript}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider afterSignOutUrl="/">{children}</ClerkProvider>
      </body>
    </html>
  );
}
