/** Shared by server and client modules (no "use client" here on purpose). */

export const LANG_COOKIE = "lang";
export const THEME_KEY = "theme";

/** The page background (--bg) of each theme, which the browser and installed-app chrome match. */
export const THEME_COLORS = { light: "#f9f8f6", dark: "#1b1b19" } as const;
/**
 * The theme-color tag that follows the theme chosen in the app rather than the system's. It is
 * put first in <head>, and the first matching theme-color wins over the fallbacks in the layout.
 */
export const THEME_COLOR_ID = "theme-color";

/** Runs in <head> before first paint so there is no light/dark flash. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.setAttribute("data-theme-pref",p);r.style.colorScheme=d?"dark":"light";var m=document.createElement("meta");m.id="${THEME_COLOR_ID}";m.name="theme-color";m.content=d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}";document.head.prepend(m);}catch(e){}})()`;
