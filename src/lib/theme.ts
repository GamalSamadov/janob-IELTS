"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./constants";

export type ThemePref = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
