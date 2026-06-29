// Tiny mic recorder using WebAudio → 16kHz mono WAV blob.
// Avoids MediaRecorder timeslice fragmentation; produces a complete file
// every time so STT cannot reject it with "corrupted or unsupported".

export type MicRecorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
};

export async function startMicRecorder(): Promise<MicRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally supported; AudioWorklet
  // would be nicer but requires a separate module file.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(node);
  node.connect(ctx.destination);

  let stopped = false;
  function cleanup() {
    if (stopped) return;
    stopped = true;
    try { node.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  }

  return {
    cancel: cleanup,
    stop: async () => {
      const sampleRate = ctx.sampleRate;
      cleanup();
      return encodeWav(chunks, sampleRate, 16000);
    },
  };
}

function encodeWav(chunks: Float32Array[], inputRate: number, targetRate: number): Blob {
  const flat = flatten(chunks);
  const samples = inputRate === targetRate ? flat : downsample(flat, inputRate, targetRate);
  const pcm = floatTo16BitPCM(samples);
  const wav = wrapWavHeader(pcm, targetRate);
  return new Blob([wav], { type: "audio/wav" });
}

function flatten(chunks: Float32Array[]): Float32Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.floor(buffer.length / ratio);
  const out = new Float32Array(newLen);
  let pos = 0;
  let i = 0;
  while (pos < newLen) {
    const next = Math.floor((pos + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = i; j < next && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    out[pos] = count > 0 ? sum / count : 0;
    pos++;
    i = next;
  }
  return out;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function wrapWavHeader(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) view.setInt16(off, pcm[i], true);
  return buffer;
}

function writeStr(v: DataView, off: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}
