/**
 * Microphone capture for the Gemini Live API.
 * Downsamples the context rate (usually 48 kHz) to 16 kHz mono, converts to
 * 16-bit little-endian PCM and posts ~100 ms chunks together with their RMS level.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.chunk = new Int16Array(1600);
    this.chunkLength = 0;
    this.input = new Float32Array(8192);
    this.inputLength = 0;
    this.position = 0;
    this.sumSquares = 0;
    this.sampleCount = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) this.sumSquares += channel[i] * channel[i];
    this.sampleCount += channel.length;

    if (this.inputLength + channel.length > this.input.length) {
      const grown = new Float32Array((this.inputLength + channel.length) * 2);
      grown.set(this.input.subarray(0, this.inputLength));
      this.input = grown;
    }
    this.input.set(channel, this.inputLength);
    this.inputLength += channel.length;

    // Box-filter decimation: average every input sample that falls inside one output period.
    while (this.position + this.ratio <= this.inputLength) {
      const start = Math.floor(this.position);
      const end = Math.max(start + 1, Math.floor(this.position + this.ratio));
      let sum = 0;
      for (let i = start; i < end; i++) sum += this.input[i];
      const value = Math.max(-1, Math.min(1, sum / (end - start)));
      this.chunk[this.chunkLength++] = value < 0 ? value * 0x8000 : value * 0x7fff;
      this.position += this.ratio;
      if (this.chunkLength === this.chunk.length) this.flush();
    }

    const consumed = Math.floor(this.position);
    if (consumed > 0) {
      this.input.copyWithin(0, consumed, this.inputLength);
      this.inputLength -= consumed;
      this.position -= consumed;
    }
    return true;
  }

  flush() {
    const pcm = this.chunk.slice(0, this.chunkLength);
    const rms = Math.sqrt(this.sumSquares / Math.max(1, this.sampleCount));
    this.sumSquares = 0;
    this.sampleCount = 0;
    this.chunkLength = 0;
    this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer]);
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
