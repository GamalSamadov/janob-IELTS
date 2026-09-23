import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/constants";

/**
 * Makes the site installable as an app (served at /manifest.webmanifest). The icons are rendered
 * from the logo by scripts/generate-app-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Janob IELTS",
    short_name: "Janob IELTS",
    description:
      "Practise the IELTS Speaking test with a real-time AI examiner and get an estimated band score with personal tips.",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
