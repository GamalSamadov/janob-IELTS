/** Browser audio plumbing for the live exam: one AudioContext for capture and playback. */

export function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Must be called synchronously inside a user gesture (click), otherwise browsers keep it suspended. */
export function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor({ latencyHint: "interactive" });
  void ctx.resume();
  return ctx;
}

/** Streams 16 kHz PCM chunks from the microphone via an AudioWorklet. */
export class MicCapture {
  level = 0;
  onChunk: ((pcm: ArrayBuffer) => void) | null = null;
  private nodes: AudioNode[] = [];

  constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
  ) {}

  async start() {
    await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const source = this.ctx.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(this.ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    // A muted sink keeps the worklet in the rendering graph without echoing the mic.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    source.connect(worklet).connect(sink).connect(this.ctx.destination);
    worklet.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      const target = Math.min(1, event.data.rms * 5);
      this.level = target > this.level ? target : this.level * 0.7 + target * 0.3;
      this.onChunk?.(event.data.pcm);
    };
    this.nodes = [source, worklet, sink];
  }

  stop() {
    for (const node of this.nodes) node.disconnect();
    this.nodes = [];
    this.onChunk = null;
  }
}

/** Gapless playback of the examiner's 24 kHz PCM stream. */
export class PcmPlayer {
  onStart: (() => void) | null = null;
  onDrain: (() => void) | null = null;
  private output: GainNode;
  private analyser: AnalyserNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private scratch: Float32Array<ArrayBuffer>;

  constructor(private ctx: AudioContext) {
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.scratch = new Float32Array(this.analyser.fftSize);
    this.output.connect(this.analyser).connect(ctx.destination);
  }

  get playing() {
    return this.sources.size > 0;
  }

  enqueue(base64: string, sampleRate = 24000) {
    if (this.ctx.state !== "running") {
      // Blocked by autoplay rules or interrupted by the OS: skip the audio rather than
      // stall the test (the examiner's words are still shown as text).
      void this.ctx.resume().catch(() => {});
      return;
    }
    const bytes = bytesFromBase64(base64);
    const samples = Math.floor(bytes.length / 2);
    if (samples === 0) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
    const buffer = this.ctx.createBuffer(1, samples, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    const now = this.ctx.currentTime;
    // A small lead at the start of each burst absorbs network jitter.
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.08;
    source.start(this.nextTime);
    this.nextTime += buffer.duration;

    const wasPlaying = this.playing;
    this.sources.add(source);
    source.onended = () => {
      if (this.sources.delete(source) && this.sources.size === 0) this.onDrain?.();
    };
    if (!wasPlaying) this.onStart?.();
  }

  /** Stops everything immediately (barge-in or end of test). */
  interrupt() {
    const active = [...this.sources];
    this.sources.clear();
    for (const source of active) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.nextTime = 0;
    if (active.length) this.onDrain?.();
  }

  level(): number {
    if (!this.playing) return 0;
    this.analyser.getFloatTimeDomainData(this.scratch);
    let sum = 0;
    for (const v of this.scratch) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.scratch.length) * 4);
  }
}

const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Records only the candidate's turns (paused while the examiner speaks or during preparation),
 * so the evaluator hears a compact recording of the answers.
 */
export class AnswerRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private activeSince: number | null = null;
  private activeMs = 0;

  start(stream: MediaStream) {
    if (typeof MediaRecorder === "undefined") return;
    const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    try {
      this.recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    } catch {
      this.recorder = null;
      return;
    }
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
    this.recorder.pause();
  }

  setActive(active: boolean) {
    const recorder = this.recorder;
    if (!recorder) return;
    if (active && recorder.state === "paused") {
      recorder.resume();
      this.activeSince = performance.now();
    } else if (!active && recorder.state === "recording") {
      recorder.pause();
      this.commitActive();
    }
  }

  /** Seconds the recorder was capturing the candidate. */
  get activeSeconds(): number {
    const running = this.activeSince === null ? 0 : performance.now() - this.activeSince;
    return (this.activeMs + running) / 1000;
  }

  stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    const build = () => (this.chunks.length ? new Blob(this.chunks, { type: recorder?.mimeType || "audio/webm" }) : null);
    if (!recorder || recorder.state === "inactive") return Promise.resolve(build());
    this.commitActive();
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(build());
      try {
        recorder.stop();
      } catch {
        resolve(build());
      }
    });
  }

  private commitActive() {
    if (this.activeSince !== null) this.activeMs += performance.now() - this.activeSince;
    this.activeSince = null;
  }
}
