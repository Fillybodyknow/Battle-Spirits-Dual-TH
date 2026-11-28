import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { cardColors, cardFamilies, cardLevel, createGame, currentBp, effectsNegated, extraSymbols, fieldSymbols, freezeForCache, payableCost, type GameState, type PlayerId } from '../src';
import { maxLevelAllySource, statCopySource } from '../src/rules';

/**
 * แคชผลคำนวณของหน้าเว็บ (freezeForCache): state ที่ประกาศแล้วต้องให้ผลเหมือนคำนวณสด ๆ ทุกค่า
 * สุ่มกระดานจากการ์ดทุกชุด (เน้นการ์ดที่มีความสามารถถาวรซ้อนกัน) แล้วเทียบ state ที่แคช กับสำเนาที่ไม่แคช
 */
const db = loadAllCards();
const all = db.all().filter((c) => c.type === 'spirit' || c.type === 'nexus' || c.type === 'ultimate' || c.type === 'brave');
// เด็คผู้เป็นนาย (ตราแห่งเพลิงรบ / ปราสาทฮนมารุ / สมรภูมิชี้ชะตา / ฮาคุไร / ไทคูน ฯลฯ)
const DECK = ['BS32-X04', 'BS34-X04', 'BS32-X05', 'BS31-U040', 'BS34-U061', 'BS33-R061', 'BS32-U002', 'BS31-R043', 'BS32-C031', 'BS33-C026', 'BS32-U054', 'BS31-R087'];

function rng(seed: number) {
  let x = seed * 2654435761 || 1;
  return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
}

function board(seed: number): GameState {
  const r = rng(seed);
  const filler = all[0]!.cardNo;
  const s = createGame({ db, decks: { p1: Array(40).fill(filler), p2: Array(40).fill(filler) }, seed, firstPlayer: 'p1', shuffleDecks: false, config: { initialReserve: 12 } }).state;
  let n = 0;
  const pick = () => (seed % 3 === 0 && r() < 0.7 ? DECK[Math.floor(r() * DECK.length)]! : all[Math.floor(r() * all.length)]!.cardNo);
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const count = 4 + Math.floor(r() * 7);
    for (let i = 0; i < count; i++) {
      const id = `m-${seed}-${++n}`;
      const cores = Array.from({ length: Math.floor(r() * 5) }, (_, j) => {
        const c = `mc-${seed}-${++n}`;
        s.cores[c] = { id: c, owner: p, isSoul: j === 0 && r() < 0.4 };
        return c;
      });
      s.cards[id] = { id, cardNo: pick(), owner: p, state: r() < 0.3 ? 'exhausted' : 'refresh', cores, turnBp: 0, usedThisTurn: [], braves: [] };
      s.players[p].field.push(id);
    }
    for (let i = 0; i < 6; i++) {
      const id = `mh-${seed}-${++n}`;
      s.cards[id] = { id, cardNo: pick(), owner: p, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
      s.players[p].hand.push(id);
    }
  }
  if (r() < 0.5) s.phase = 'attack';
  return s;
}

function snapshot(s: GameState) {
  const out: Record<string, unknown> = {};
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    out[`sym-${p}`] = fieldSymbols(s, db, p);
    for (const id of s.players[p].field) {
      out[id] = {
        lv: cardLevel(s, db, id),
        bp: currentBp(s, db, id),
        neg: effectsNegated(s, db, id),
        col: cardColors(s, db, id),
        fam: cardFamilies(s, db, id),
        sym: extraSymbols(s, db, id),
        max: maxLevelAllySource(s, db, id),
        copy: statCopySource(s, db, id),
      };
    }
    for (const id of s.players[p].hand) out[id] = payableCost(s, db, p, db.get(s.cards[id]!.cardNo));
  }
  return out;
}

describe('แคชผลคำนวณ (freezeForCache)', () => {
  // กระดานสุ่มบางแบบ (เช่น BS32-X02 + คาราเวล โกเล็ม) คำนวณสดช้ามาก: เผื่อเวลา (ตัวอย่างเปลี่ยนเมื่อเพิ่มการ์ด)
  it('state ที่แคชให้ผลเหมือนคำนวณสด ทุกค่า (สุ่ม 60 กระดาน)', { timeout: 180000 }, () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = board(seed);
      const fresh = snapshot(structuredClone(s));
      freezeForCache(s);
      // เรียกสองรอบ: รอบแรกเติมแคช รอบสองอ่านจากแคช
      expect(snapshot(s), `seed ${seed}`).toEqual(fresh);
      expect(snapshot(s), `seed ${seed} (จากแคช)`).toEqual(fresh);
    }
  });

  it('ตราแห่งเพลิงรบ Lv2: ไทคูน (ผู้เป็นนาย สีขาว) + ไซอุน (ข้ารับใช้ สีขาว) = Lv สูงสุด ทั้งแคชและไม่แคช', () => {
    const s = board(1);
    // สนามสุ่มจาก db.all(): ล้างทั้งสองฝั่ง (การ์ดสุ่มฝั่งคู่แข่งอาจมีเอฟเฟกต์เลเวล ทำให้ผลขึ้นกับลำดับการ์ดใน data/)
    s.players.p1.field = [];
    s.players.p2.field = [];
    let n = 0;
    const put = (cardNo: string, cores: number) => {
      const id = `ff-${++n}`;
      const cs = Array.from({ length: cores }, () => {
        const c = `ffc-${++n}`;
        s.cores[c] = { id: c, owner: 'p1', isSoul: false };
        return c;
      });
      s.cards[id] = { id, cardNo, owner: 'p1', state: 'refresh', cores: cs, turnBp: 0, usedThisTurn: [], braves: [] };
      s.players.p1.field.push(id);
      return id;
    };
    put('BS34-U061', 1); // ตราแห่งเพลิงรบ Lv2
    const tycoon = put('BS32-X04', 1); // ไทคูน Lv1 → ถือว่า Lv4
    const neko = put('BS32-X05', 1); // คาฉะเนโกะ สีเหลือง: ไม่มีข้ารับใช้สีเดียวกัน → Lv1
    put('BS31-U040', 1); // ไซอุน ข้ารับใช้ สีขาว
    const fresh = { t: cardLevel(structuredClone(s), db, tycoon), k: cardLevel(structuredClone(s), db, neko) };
    expect(fresh).toEqual({ t: 4, k: 1 });
    freezeForCache(s);
    // ลำดับการเรียกต่างกัน (ไซอุน/สีก่อน) ก็ต้องได้ค่าเดิม
    for (const id of s.players.p1.field) cardColors(s, db, id);
    expect({ t: cardLevel(s, db, tycoon), k: cardLevel(s, db, neko) }).toEqual(fresh);
    expect(currentBp(s, db, tycoon)).toBe(currentBp(structuredClone(s), db, tycoon));
  });

  it('แก้ค่าที่ได้คืนมา ไม่ทำให้แคชเพี้ยน', () => {
    const s = board(3);
    freezeForCache(s);
    const id = s.players.p1.field[0]!;
    const col = cardColors(s, db, id);
    const before = [...col];
    col.push('red');
    expect(cardColors(s, db, id)).toEqual(before);
    const sym = fieldSymbols(s, db, 'p1');
    const symBefore = { ...sym };
    sym.red = 99;
    expect(fieldSymbols(s, db, 'p1')).toEqual(symBefore);
  });
});
