import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { cookies } from "next/headers";
import { LANG_COOKIE, THEME_SCRIPT } from "@/lib/constants";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: { default: "Janob IELTS — AI Speaking examiner", template: "%s · Janob IELTS" },
  description:
    "Practise the IELTS Speaking test with a real-time AI examiner powered by Google Gemini and get an estimated band score with personal tips.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b19" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = (await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : "uz";

  return (
    <html
      lang={lang}
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ClerkProvider signInUrl="/login" signUpUrl="/login" afterSignOutUrl="/login">
          <I18nProvider initialLang={lang}>{children}</I18nProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
