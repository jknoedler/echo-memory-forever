// Client-side audio visualizations.
//
// The model can't hear. Workaround: render the audio as images the
// vision model CAN read.
//   1. Waveform (peaks per pixel column)  -> dynamics, structure, silence
//   2. Spectrogram (STFT, log-magnitude)  -> frequency balance, brightness,
//      vocal vs. instrument distribution, mix issues
// Both are returned as PNG File objects so they ride the normal attachment
// path and get sent as image parts in the next chat message.
//
// Decoding uses OfflineAudioContext so we don't have to play the file.
// STFT uses a tiny iterative radix-2 FFT — good enough for a 1024-pt
// window. We cap total analysis at ~6 minutes of audio so a long upload
// doesn't lock the tab; the cap is wide enough for any single song.

const MAX_SECONDS = 360;
const FFT_SIZE = 1024;
const HOP = 512;
const SPEC_W = 1024;
const SPEC_H = 256;
const WAVE_W = 1024;
const WAVE_H = 220;

export type AudioVizResult = {
  waveform: File;
  spectrogram: File;
  durationSec: number;
  sampleRate: number;
};

export async function buildAudioViz(file: File): Promise<AudioVizResult> {
  const buf = await file.arrayBuffer();
  const tmpCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(buf.slice(0));
  } finally {
    void tmpCtx.close();
  }

  // Downmix to mono Float32 and clip duration.
  const sampleRate = decoded.sampleRate;
  const totalFrames = Math.min(decoded.length, Math.floor(MAX_SECONDS * sampleRate));
  const mono = new Float32Array(totalFrames);
  const channels = decoded.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < totalFrames; i++) mono[i] += ch[i];
  }
  if (channels > 1) for (let i = 0; i < totalFrames; i++) mono[i] /= channels;

  const durationSec = totalFrames / sampleRate;

  const waveform = await renderWaveform(mono, durationSec, file.name);
  const spectrogram = await renderSpectrogram(mono, sampleRate, durationSec, file.name);

  return { waveform, spectrogram, durationSec, sampleRate };
}

// ---------- Waveform ----------

async function renderWaveform(
  samples: Float32Array,
  durationSec: number,
  baseName: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = WAVE_W;
  canvas.height = WAVE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, WAVE_W, WAVE_H);

  // Center line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(0, WAVE_H / 2);
  ctx.lineTo(WAVE_W, WAVE_H / 2);
  ctx.stroke();

  const step = Math.max(1, Math.floor(samples.length / WAVE_W));
  const grad = ctx.createLinearGradient(0, 0, 0, WAVE_H);
  grad.addColorStop(0, "#ff8a3d");
  grad.addColorStop(1, "#c2410c");
  ctx.fillStyle = grad;

  for (let x = 0; x < WAVE_W; x++) {
    const start = x * step;
    const end = Math.min(samples.length, start + step);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = (1 - max) * 0.5 * WAVE_H;
    const y2 = (1 - min) * 0.5 * WAVE_H;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }

  drawTimeAxis(ctx, durationSec, WAVE_W, WAVE_H);
  drawLabel(ctx, `WAVEFORM · ${baseName} · ${durationSec.toFixed(1)}s`);

  return canvasToFile(canvas, `waveform-${stripExt(baseName)}.png`);
}

// ---------- Spectrogram ----------

async function renderSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  durationSec: number,
  baseName: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = SPEC_W;
  canvas.height = SPEC_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SPEC_W, SPEC_H);

  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }

  const frameCount = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP));
  const colStep = Math.max(1, Math.floor(frameCount / SPEC_W));
  const bins = FFT_SIZE / 2;

  // Pre-compute log-bin mapping so high freqs aren't squashed.
  const rowToBin = new Int32Array(SPEC_H);
  const minBin = 1;
  const maxBin = bins - 1;
  for (let y = 0; y < SPEC_H; y++) {
    const norm = y / (SPEC_H - 1); // 0 = top (high freq)
    const f = Math.exp(Math.log(minBin) + (1 - norm) * (Math.log(maxBin) - Math.log(minBin)));
    rowToBin[y] = Math.min(maxBin, Math.max(minBin, Math.round(f)));
  }

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const img = ctx.createImageData(SPEC_W, SPEC_H);

  for (let x = 0; x < SPEC_W; x++) {
    const frameIdx = Math.min(frameCount - 1, x * colStep);
    const offset = frameIdx * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (samples[offset + i] ?? 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    // Magnitude per bin, in dB.
    for (let y = 0; y < SPEC_H; y++) {
      const b = rowToBin[y];
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      // Normalize: 0 dB ~= -80, clip range.
      const db = 20 * Math.log10(mag + 1e-9);
      const norm = Math.min(1, Math.max(0, (db + 80) / 80));
      const [r, g, b2] = magma(norm);
      const idx = (y * SPEC_W + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b2;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  drawTimeAxis(ctx, durationSec, SPEC_W, SPEC_H);
  drawFreqAxis(ctx, sampleRate, SPEC_H);
  drawLabel(ctx, `SPECTROGRAM · ${baseName} · ${(sampleRate / 1000).toFixed(1)}kHz · log freq`);

  return canvasToFile(canvas, `spectrogram-${stripExt(baseName)}.png`);
}

// ---------- Iterative radix-2 FFT (in-place) ----------

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit reversal
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const tabStep = (2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = -tabStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tre = re[i + k + half] * cos - im[i + k + half] * sin;
        const tim = re[i + k + half] * sin + im[i + k + half] * cos;
        re[i + k + half] = re[i + k] - tre;
        im[i + k + half] = im[i + k] - tim;
        re[i + k] += tre;
        im[i + k] += tim;
      }
    }
  }
}

// ---------- Colormap (magma-ish, compact) ----------

function magma(t: number): [number, number, number] {
  // 5-stop interpolation: black -> purple -> magenta -> orange -> yellow
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0, 0, 4]],
    [0.25, [80, 18, 123]],
    [0.5, [183, 55, 121]],
    [0.75, [251, 136, 97]],
    [1.0, [252, 253, 191]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * u),
        Math.round(c0[1] + (c1[1] - c0[1]) * u),
        Math.round(c0[2] + (c1[2] - c0[2]) * u),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ---------- Axis / label helpers ----------

function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  durationSec: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "10px ui-monospace, monospace";
  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const x = (i / ticks) * w;
    const t = (i / ticks) * durationSec;
    const label = `${t.toFixed(1)}s`;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x, h - 12, 1, 6);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(label, Math.min(w - 28, Math.max(2, x + 2)), h - 2);
  }
}

function drawFreqAxis(ctx: CanvasRenderingContext2D, sampleRate: number, h: number) {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "10px ui-monospace, monospace";
  const nyquist = sampleRate / 2;
  const stops = [100, 500, 1000, 4000, 10000];
  for (const f of stops) {
    if (f >= nyquist) continue;
    // Inverse of the log mapping used above.
    const minBin = 1;
    const maxBin = (FFT_SIZE / 2) - 1;
    const bin = (f / nyquist) * (FFT_SIZE / 2);
    const norm =
      1 - (Math.log(bin) - Math.log(minBin)) / (Math.log(maxBin) - Math.log(minBin));
    const y = Math.round(norm * (h - 1));
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, y, 6, 1);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const label = f >= 1000 ? `${(f / 1000).toFixed(0)}k` : `${f}`;
    ctx.fillText(label, 8, y + 3);
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, ctx.canvas.width, 16);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(text, 6, 11);
}

// ---------- File helpers ----------

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas → PNG failed"));
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

function stripExt(name: string) {
  return name.replace(/\.[^./\\]+$/, "");
}
