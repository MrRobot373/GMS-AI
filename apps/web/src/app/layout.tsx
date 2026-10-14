import { GeistMono } from "geist/font/mono";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { themeBootScript } from "@/lib/theme";
import { Providers } from "./providers";
import "@fontsource-variable/inter";
// Devanagari for Hindi (and names in it): fetched only when such text is on the page.
import "@fontsource-variable/noto-sans-devanagari";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aatmiq: your own AI", template: "%s · Aatmiq" },
  description:
    "Aatmiq is a private AI workplace for your organization: chat, agents and code, running on your own servers with open-source models.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language is a cookie, so pages arrive in it (and screen readers know it from the start).
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : "en";
  return (
    <html lang={locale} data-theme="dark" className={GeistMono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
