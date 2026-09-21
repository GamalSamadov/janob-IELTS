"use client";

import { useSyncExternalStore } from "react";
import type { SessionRecord } from "./exam/types";

/** Test history lives in the browser (no account needed). */
const KEY = "janob-ielts:sessions:v1";
const MAX_SESSIONS = 50;
const EMPTY: SessionRecord[] = [];

let cache: SessionRecord[] | null = null;
const listeners = new Set<() => void>();

function read(): SessionRecord[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(sessions: SessionRecord[]) {
  let list = sessions.slice(0, MAX_SESSIONS);
  // Drop the oldest results if the browser storage quota is exceeded.
  while (list.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      break;
    } catch {
      list = list.slice(0, -1);
    }
  }
  cache = list;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const sessionStore = {
  add(record: SessionRecord) {
    write([record, ...read().filter((s) => s.id !== record.id)]);
  },
  remove(id: string) {
    write(read().filter((s) => s.id !== id));
  },
};

export function useSessions(): SessionRecord[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** `undefined` while hydrating, `null` when the id is unknown. */
export function useSession(id: string): SessionRecord | null | undefined {
  const sessions = useSyncExternalStore(subscribe, read, () => null);
  if (sessions === null) return undefined;
  return sessions.find((s) => s.id === id) ?? null;
}
