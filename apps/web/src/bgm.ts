/**
 * เพลงประกอบ (BGM)
 * - วางไฟล์ assets/sounds/music/<ชื่อ>.mp3|ogg|m4a|wav (หลายเพลงต่อช่วง: <ชื่อ>-1.mp3, <ชื่อ>-2.mp3 … สุ่มทีละเกม)
 *   duel  = ระหว่างดวลปกติ
 *   ace   = มีการ์ดระดับ X-Rare ขึ้นไปอยู่บนสนาม (เริ่มตรงจังหวะทุบของ Cut-in)
 *   pinch = Life ของคู่แข่งเหลือไม่เกิน 2 (เล่นเครื่องเดียว / ผู้ชม = ฝ่ายใดก็ได้) · เริ่มแล้วเล่นต่อจนกว่า Life คู่แข่งกลับมา 4 ขึ้นไป
 * - ไม่มีไฟล์ของช่วงไหน = ใช้เพลงของช่วงก่อนหน้า (pinch → ace → duel) · ไม่มีไฟล์เลย = เงียบ
 * - เล่นวนซ้ำ เปลี่ยนเพลงแบบ crossfade · ความดังแยกจาก SFX
 */
import { audioContext } from './sfx';

export type BgmTrack = 'duel' | 'ace' | 'pinch';

const files = import.meta.glob('../../../assets/sounds/music/*.{mp3,ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const FILES: Partial<Record<BgmTrack, string[]>> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/-\d+$/, '') as BgmTrack;
  (FILES[name] ??= []).push(url);
}
const FALLBACK: Record<BgmTrack, BgmTrack | null> = { pinch: 'ace', ace: 'duel', duel: null };

/** เพลงที่จะเล่นจริงของช่วงนี้ (เลือกสุ่มครั้งเดียวต่อเกม) */
const picked = new Map<BgmTrack, string>();
function urlFor(track: BgmTrack | null): string | null {
  for (let t = track; t; t = FALLBACK[t]) {
    const list = FILES[t];
    if (!list?.length) continue;
    if (!picked.has(t)) picked.set(t, list[Math.floor(Math.random() * list.length)]!);
    return picked.get(t)!;
  }
  return null;
}
/** เริ่มเกมใหม่: สุ่มเพลงใหม่ */
export function reshuffleBgm() {
  picked.clear();
}

// ---------------------------------------------------------------- settings

const KEY = 'bs-bgm';
function load(): { on: boolean; volume: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (typeof v.on === 'boolean' && typeof v.volume === 'number') return v;
  } catch {
    /* ไม่มีค่าที่บันทึกไว้ */
  }
  return { on: true, volume: 0.45 };
}
const settings = load();
export const bgmSettings = () => ({ ...settings });
export const hasBgm = () => Object.keys(FILES).length > 0;
export function setBgmSettings(next: Partial<{ on: boolean; volume: number }>) {
  Object.assign(settings, next);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* บันทึกไม่ได้ก็ไม่เป็นไร */
  }
  if (bus) bus.gain.value = settings.volume;
  apply();
}

// ---------------------------------------------------------------- player

const FADE = 1.2;
let bus: GainNode | null = null;
interface Voice {
  url: string;
  el: HTMLAudioElement;
  gain: GainNode;
}
let current: Voice | null = null;
let want: string | null = null;
let hidden = false;

function voice(url: string): Voice | null {
  const c = audioContext();
  if (!c) return null;
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = settings.volume;
    bus.connect(c.destination);
  }
  const el = new Audio(url);
  el.loop = true;
  el.preload = 'auto';
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  c.createMediaElementSource(el).connect(gain).connect(bus);
  return { url, el, gain };
}

function fadeOut(v: Voice) {
  const c = audioContext();
  if (!c) return v.el.pause();
  const g = v.gain.gain;
  g.cancelScheduledValues(c.currentTime);
  g.setValueAtTime(Math.max(g.value, 0.0001), c.currentTime);
  g.exponentialRampToValueAtTime(0.0001, c.currentTime + FADE);
  setTimeout(() => {
    v.el.pause();
    v.el.src = '';
  }, FADE * 1000 + 100);
}

function fadeIn(v: Voice) {
  const c = audioContext();
  if (!c) return;
  const g = v.gain.gain;
  g.cancelScheduledValues(c.currentTime);
  g.setValueAtTime(0.0001, c.currentTime);
  g.exponentialRampToValueAtTime(1, c.currentTime + FADE);
  // เบราว์เซอร์ยังไม่ให้เล่น (ยังไม่เคยแตะจอ) → ลองใหม่ตอนแตะครั้งถัดไป
  v.el.play().catch(() => window.addEventListener('pointerdown', () => current === v && void v.el.play().catch(() => {}), { once: true }));
}

/** ทำให้เพลงที่เล่นอยู่ตรงกับ want / ตั้งค่า / แท็บที่ซ่อน */
function apply() {
  const target = settings.on && !hidden ? want : null;
  if ((current?.url ?? null) === target) {
    if (current && current.el.paused && target) fadeIn(current);
    return;
  }
  if (current) fadeOut(current);
  current = target ? voice(target) : null;
  if (current) fadeIn(current);
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** เปลี่ยนช่วงเพลง (null = หยุด) · delayMs = รอให้ตรงจังหวะแอนิเมชัน */
export function playBgm(track: BgmTrack | null, delayMs = 0) {
  if (timer) clearTimeout(timer);
  timer = null;
  const run = () => {
    timer = null;
    want = urlFor(track);
    apply();
  };
  if (delayMs > 0) timer = setTimeout(run, delayMs);
  else run();
}

// พับแอป / สลับแท็บ: หยุดเพลงไว้ แล้วเล่นต่อเมื่อกลับมา
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden && current) {
      current.el.pause();
      return;
    }
    apply();
  });
}
