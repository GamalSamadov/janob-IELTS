"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Chromium's offer to install the site as an app; it is not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

/** How the app can be installed from here: the browser's own dialog, Safari's share sheet, or not. */
export type InstallMethod = "prompt" | "ios" | null;

let installPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// Chromium makes its offer once per page load, often before anything has mounted, so it is caught
// as soon as this module loads: the root layout imports it on every page, the login screen too.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    installPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    notify();
  });
}

/** Registers public/sw.js, which shows an offline screen instead of the browser's error page. */
export function RegisterServiceWorker() {
  useEffect(() => {
    // Production only: a worker registered on localhost would outlive this project's dev server.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // The site works the same without it, only without the offline screen.
    });
  }, []);
  return null;
}

function currentMethod(): InstallMethod {
  const installed =
    matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);
  if (installed) return null;
  if (installPrompt) return "prompt";
  // Safari has no install event: there it is "Add to Home Screen" in the share sheet. iPads
  // introduce themselves as Macs, but Macs have no touch screen.
  const agent = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(agent) || (agent.includes("Macintosh") && navigator.maxTouchPoints > 1) ? "ios" : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallMethod(): InstallMethod {
  return useSyncExternalStore(subscribe, currentMethod, () => null);
}

/** Opens the browser's install dialog. Must run inside the click that asked for it. */
export function promptInstall() {
  const offer = installPrompt;
  // An offer can be shown only once; the browser makes a new one on a later visit if declined.
  installPrompt = null;
  notify();
  offer?.prompt().catch(() => {
    // Withdrawn by the browser in the meantime: nothing left to show.
  });
}
