/**
 * เสียงประกอบ (SFX)
 * - ค่าเริ่มต้น: สังเคราะห์ด้วย Web Audio API (ไม่ต้องมีไฟล์)
 * - ใช้เสียงของตัวเอง: วางไฟล์ assets/sounds/<ชื่อ>.mp3|wav|ogg (ชื่อตาม SfxName) จะเล่นไฟล์นั้นแทน
 */

export type SfxName =
  | 'click'
  | 'hover'
  | 'core'
  | 'draw'
  | 'place'
  | 'activate'
  | 'magic'
  | 'flash'
  | 'burst'
  | 'turn'
  | 'step'
  | 'tick'
  | 'chain'
  | 'resolve'
  | 'swish'
  | 'whoosh'
  | 'impact'
  | 'shatter'
  | 'fade'
  | 'damage'
  | 'bigdamage'
  | 'buff'
  | 'xrare'
  | 'win'
  | 'error';

const files = import.meta.glob('../../../assets/sounds/*.{mp3,wav,ogg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const FILE: Partial<Record<SfxName, string>> = {};
for (const [path, url] of Object.entries(files)) FILE[path.split('/').pop()!.replace(/\.[^.]+$/, '') as SfxName] = url;

// ---------------------------------------------------------------- settings

const KEY = 'bs-sfx';
function load(): { on: boolean; volume: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (typeof v.on === 'boolean' && typeof v.volume === 'number') return v;
  } catch {
    /* ไม่มีค่าที่บันทึกไว้ */
  }
  return { on: true, volume: 0.6 };
}
const settings = load();
export const sfxSettings = () => ({ ...settings });
export function setSfx(next: Partial<{ on: boolean; volume: number }>) {
  Object.assign(settings, next);
  if (master) master.gain.value = settings.volume;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* บันทึกไม่ได้ก็ไม่เป็นไร */
  }
}

// ---------------------------------------------------------------- audio graph

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const buffers = new Map<string, AudioBuffer>();

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    // compressor กันเสียงหลายอันซ้อนกันแล้วแตก
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// เบราว์เซอร์ให้เริ่มเสียงได้หลังผู้ใช้กด/คลิกครั้งแรก
if (typeof window !== 'undefined') {
  const unlock = () => audio();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

type Osc = OscillatorType;

/** โทนเสียงพร้อม envelope: freq → toFreq ใน dur วินาที */
function tone(at: number, freq: number, dur: number, opts: { type?: Osc; gain?: number; to?: number; attack?: number } = {}) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** เสียงซ่า (noise) ผ่าน filter: ใช้ทำเสียงลม เสียงแตก เสียงกระแทก */
function noise(at: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; attack?: number } = {}) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1200, at);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.05);
}

const SYNTH: Record<SfxName, (t: number) => void> = {
  click: (t) => tone(t, 900, 0.06, { type: 'triangle', gain: 0.12 }),
  hover: (t) => tone(t, 1500, 0.03, { type: 'sine', gain: 0.04 }),
  core: (t) => {
    tone(t, 1800, 0.08, { type: 'triangle', gain: 0.12 });
    tone(t + 0.04, 2600, 0.1, { type: 'sine', gain: 0.07 });
  },
  draw: (t) => noise(t, 0.18, { type: 'highpass', freq: 2500, to: 6000, gain: 0.12 }),
  place: (t) => {
    tone(t, 140, 0.25, { type: 'sine', gain: 0.28, to: 55 });
    noise(t, 0.12, { type: 'lowpass', freq: 900, gain: 0.16 });
  },
  activate: (t) => {
    [880, 1320, 1760].forEach((f, i) => tone(t + i * 0.06, f, 0.5, { type: 'sine', gain: 0.12 }));
    noise(t, 0.4, { type: 'highpass', freq: 5000, gain: 0.05, attack: 0.08 });
  },
  magic: (t) => {
    noise(t, 0.55, { type: 'bandpass', freq: 400, to: 4000, q: 2, gain: 0.2, attack: 0.15 });
    [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.25 + i * 0.05, f, 0.6, { type: 'triangle', gain: 0.1 }));
  },
  flash: (t) => {
    noise(t, 0.35, { type: 'bandpass', freq: 3000, to: 800, q: 3, gain: 0.2 });
    tone(t, 1200, 0.4, { type: 'square', gain: 0.05, to: 2400 });
    tone(t + 0.15, 1800, 0.5, { type: 'sine', gain: 0.1 });
  },
  burst: (t) => {
    tone(t, 90, 0.8, { type: 'sawtooth', gain: 0.15, to: 40 });
    noise(t, 0.9, { type: 'lowpass', freq: 2000, to: 200, gain: 0.22 });
    [392, 523, 784].forEach((f) => tone(t + 0.1, f, 0.9, { type: 'square', gain: 0.035 }));
  },
  turn: (t) => {
    tone(t, 196, 1.2, { type: 'sine', gain: 0.16 });
    tone(t, 392, 1.0, { type: 'triangle', gain: 0.08 });
    noise(t, 0.4, { type: 'highpass', freq: 3000, gain: 0.06 });
  },
  step: (t) => {
    noise(t, 0.3, { type: 'bandpass', freq: 800, to: 3000, q: 1.5, gain: 0.15 });
    tone(t + 0.1, 660, 0.3, { type: 'triangle', gain: 0.1 });
  },
  tick: (t) => {
    tone(t, 1046, 0.12, { type: 'triangle', gain: 0.06 });
    noise(t, 0.08, { type: 'highpass', freq: 3500, gain: 0.03 });
  },
  chain: (t) => {
    // เสียงโซ่โลหะ: ความถี่สูงหลายเสียงไม่เป็นฮาร์โมนิก
    [2400, 3150, 4100].forEach((f, i) => tone(t + i * 0.015, f, 0.22, { type: 'square', gain: 0.04 }));
    noise(t, 0.12, { type: 'highpass', freq: 4000, gain: 0.12 });
  },
  resolve: (t) => {
    noise(t, 0.4, { type: 'bandpass', freq: 600, to: 2500, q: 2, gain: 0.18 });
    tone(t + 0.05, 440, 0.5, { type: 'sawtooth', gain: 0.06, to: 880 });
  },
  swish: (t) => noise(t, 0.2, { type: 'bandpass', freq: 600, to: 2400, q: 1.2, gain: 0.15 }),
  whoosh: (t) => noise(t, 0.35, { type: 'bandpass', freq: 300, to: 3000, q: 0.8, gain: 0.2, attack: 0.15 }),
  impact: (t) => {
    tone(t, 120, 0.4, { type: 'sine', gain: 0.34, to: 35 });
    noise(t, 0.3, { type: 'lowpass', freq: 3000, to: 300, gain: 0.26 });
  },
  shatter: (t) => {
    noise(t, 0.5, { type: 'highpass', freq: 3500, gain: 0.2 });
    [3000, 4300, 5200, 6100].forEach((f, i) => tone(t + i * 0.03, f, 0.15, { type: 'square', gain: 0.03 }));
    tone(t, 200, 0.3, { type: 'sine', gain: 0.2, to: 60 });
  },
  fade: (t) => noise(t, 0.7, { type: 'lowpass', freq: 1500, to: 150, gain: 0.15, attack: 0.1 }),
  damage: (t) => {
    tone(t, 220, 0.35, { type: 'sawtooth', gain: 0.15, to: 110 });
    noise(t, 0.25, { type: 'lowpass', freq: 1800, gain: 0.25 });
  },
  bigdamage: (t) => {
    tone(t, 160, 0.7, { type: 'sawtooth', gain: 0.14, to: 50 });
    tone(t, 80, 0.9, { type: 'sine', gain: 0.26, to: 30 });
    noise(t, 0.6, { type: 'lowpass', freq: 4000, to: 200, gain: 0.25 });
  },
  buff: (t) => [660, 880, 1100].forEach((f, i) => tone(t + i * 0.05, f, 0.25, { type: 'triangle', gain: 0.1 })),
  xrare: (t) => {
    noise(t, 1.0, { type: 'bandpass', freq: 200, to: 5000, q: 1, gain: 0.18, attack: 0.5 });
    [262, 330, 392, 523].forEach((f) => tone(t + 0.45, f, 1.4, { type: 'sawtooth', gain: 0.035 }));
    tone(t + 0.45, 65, 1.2, { type: 'sine', gain: 0.26 });
  },
  win: (t) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(t + i * 0.14, f, 0.5, { type: 'triangle', gain: 0.15 })),
  error: (t) => {
    tone(t, 220, 0.12, { type: 'square', gain: 0.08 });
    tone(t + 0.13, 180, 0.18, { type: 'square', gain: 0.08 });
  },
};

// ---------------------------------------------------------------- play

const timers = new Set<ReturnType<typeof setTimeout>>();

async function playFile(name: SfxName, url: string) {
  const c = audio();
  if (!c) return;
  let buf = buffers.get(url);
  if (!buf) {
    try {
      buf = await c.decodeAudioData(await (await fetch(url)).arrayBuffer());
      buffers.set(url, buf);
    } catch {
      return SYNTH[name](c.currentTime);
    }
  }
  const s = c.createBufferSource();
  s.buffer = buf;
  s.connect(master!);
  s.start();
}

/** เล่นเสียง (delayMs = หน่วงตามไทม์ไลน์แอนิเมชัน) */
export function sfx(name: SfxName, delayMs = 0) {
  if (!settings.on) return;
  const run = () => {
    const c = audio();
    if (!c || c.state !== 'running') return;
    const file = FILE[name];
    if (file) void playFile(name, file);
    else SYNTH[name](c.currentTime + 0.005);
  };
  if (delayMs <= 0) return run();
  const id = setTimeout(() => {
    timers.delete(id);
    run();
  }, delayMs);
  timers.add(id);
}

/** ยกเลิกเสียงที่รอเล่น (กดข้ามแอนิเมชัน) */
export function cancelSfx() {
  timers.forEach(clearTimeout);
  timers.clear();
}
