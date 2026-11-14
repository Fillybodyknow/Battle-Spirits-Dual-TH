/** mulberry32: RNG ที่ seed ได้และเก็บสถานะเป็นตัวเลขเดียว (serialize ได้) */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, nextSeed];
}

/** Fisher–Yates แบบไม่แก้ array เดิม */
export function shuffle<T>(items: readonly T[], seed: number): [result: T[], nextSeed: number] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(s);
    s = next;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return [out, s];
}
