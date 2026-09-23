"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLOR_ID, THEME_COLORS, THEME_KEY } from "./constants";

export type ThemePref = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The address bar, and an installed app's status or title bar, take the page's colour. */
function paintBrowserChrome(theme: "light" | "dark") {
  let meta = document.getElementById(THEME_COLOR_ID) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = THEME_COLOR_ID;
    meta.name = "theme-color";
    document.head.prepend(meta);
  }
  meta.content = THEME_COLORS[theme];
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  const theme = resolve(pref);
  // Switch instantly instead of cross-fading every transitioned element.
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = theme;
  paintBrowserChrome(theme);
  void getComputedStyle(root).color;
  requestAnimationFrame(() => freeze.remove());
  for (const listener of listeners) listener();
}

function getPref(): ThemePref {
  const value = document.documentElement.getAttribute("data-theme-pref");
  return value === "light" || value === "dark" ? value : "system";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getPref() === "system") apply("system");
  };
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onChange);
  };
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage unavailable: still apply for this page view
  }
  apply(pref);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getPref, () => "system");
}
