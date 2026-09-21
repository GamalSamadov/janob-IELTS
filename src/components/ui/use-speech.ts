"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctor();
  }
  return sharedContext;
}

export class SpeechError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Plays generated speech (voice previews, model answers).
 * Web Audio is unlocked synchronously on click, so playback still works
 * after a slow TTS request (Safari otherwise blocks it).
 */
export function useSpeechPlayer() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const requestRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current++;
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    setPlayingKey(null);
    setLoadingKey(null);
  }, []);

  const play = useCallback(
    async (key: string, load: () => Promise<Response>) => {
      stop();
      const ctx = audioContext();
      void ctx.resume();
      const request = ++requestRef.current;
      setLoadingKey(key);
      try {
        const response = await load();
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new SpeechError(data.error ?? "upstream");
        }
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (request !== requestRef.current) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          if (request === requestRef.current) setPlayingKey(null);
        };
        source.start();
        sourceRef.current = source;
        setPlayingKey(key);
      } finally {
        if (request === requestRef.current) setLoadingKey(null);
      }
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { playingKey, loadingKey, play, stop };
}
