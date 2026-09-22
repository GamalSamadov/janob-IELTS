"use client";

import { useSyncExternalStore } from "react";
import type { SessionRecord } from "./exam/types";

/** Test history lives in the browser, kept separately for every account that signs in here. */
const KEY = "janob-ielts:sessions:v1";
const MAX_SESSIONS = 50;
const EMPTY: SessionRecord[] = [];

let owner: string | null = null;
let cache: SessionRecord[] | null = null;
const listeners = new Set<() => void>();

const keyFor = (userId: string) => `${KEY}:${userId}`;

/**
 * Points the history at the signed-in account. Runs while the app shell renders, before any
 * history consumer, so it only resets the cache and never notifies subscribers.
 */
export function setHistoryOwner(userId: string) {
  // Module state on the server would be shared between requests; the history is browser-only.
  if (typeof window === "undefined" || owner === userId) return;
  owner = userId;
  cache = null;
  try {
    // Results saved before sign-in existed belong to the first account that opens the app here.
    const legacy = localStorage.getItem(KEY);
    if (legacy !== null) {
      if (localStorage.getItem(keyFor(userId)) === null) localStorage.setItem(keyFor(userId), legacy);
      localStorage.removeItem(KEY);
    }
  } catch {
    // storage unavailable: the history simply starts empty
  }
}

function read(): SessionRecord[] {
  if (!owner) return EMPTY;
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(owner)) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(sessions: SessionRecord[]) {
  if (!owner) return;
  let list = sessions.slice(0, MAX_SESSIONS);
  // Drop the oldest results if the browser storage quota is exceeded.
  while (list.length) {
    try {
      localStorage.setItem(keyFor(owner), JSON.stringify(list));
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
    if (!owner || event.key !== keyFor(owner)) return;
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
