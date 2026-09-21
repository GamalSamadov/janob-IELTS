"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE } from "./constants";
import type { Lang } from "./exam/types";
import { DICTIONARIES, type DictKey } from "./i18n-dict";

type Translate = (key: DictKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      const template = DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key;
      return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")) : template;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

/** Localised language name for a BCP-47 code, e.g. "uz" → "o‘zbek" / "Uzbek". */
export function languageName(code: string, uiLang: Lang): string {
  try {
    const name = new Intl.DisplayNames([uiLang], { type: "language" }).of(code.split("-")[0]);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
