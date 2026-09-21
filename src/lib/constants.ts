/** Shared by server and client modules (no "use client" here on purpose). */

export const LANG_COOKIE = "lang";
export const THEME_KEY = "theme";

/** Runs in <head> before first paint so there is no light/dark flash. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.setAttribute("data-theme-pref",p);r.style.colorScheme=d?"dark":"light";}catch(e){}})()`;
