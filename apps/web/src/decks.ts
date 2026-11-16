/**
 * เด็คที่เล่นได้: Starter Deck (ตายตัว) + เด็คที่ผู้เล่นจัดเอง (เก็บในเครื่อง)
 *
 * รหัสเด็ค (DeckId) เป็นข้อความ:
 *  - "sd01" …            Starter Deck
 *  - "u:<id>"            เด็คที่จัดเองซึ่งบันทึกไว้ในเครื่องนี้ (ใช้ตอนเลือกในเครื่อง)
 *  - "c:<ชื่อ>|<การ์ด>"   เด็คที่จัดเองแบบมีรายการการ์ดในตัว (ส่งให้อีกเครื่องตอนเล่นออนไลน์)
 */
import { currentCardNo, SD01_DECK, SD02_DECK, SD03_DECK, SD04_DECK, type DeckEntry, type Foil } from '@bs/cards';

/**
 * แปลงรหัสการ์ดเดิม (เช่น SD04-001 ก่อนย้ายไป BS04) เป็นรหัสปัจจุบัน
 * ถ้าหลายรายการกลายเป็นการ์ดใบเดียวกัน: รวมจำนวนและฟอยเข้าด้วยกัน
 */
export function migrateEntries(entries: DeckEntry[]): DeckEntry[] {
  const out: DeckEntry[] = [];
  for (const e of entries) {
    const cardNo = currentCardNo(e.cardNo);
    const same = out.find((x) => x.cardNo === cardNo);
    if (!same) {
      out.push({ ...e, cardNo });
      continue;
    }
    same.count += e.count;
    if (e.foils?.length || same.foils?.length) same.foils = [...(same.foils ?? []), ...(e.foils ?? [])];
  }
  return out;
}

export const STARTER_DECKS: Record<string, { label: string; entries: DeckEntry[] }> = {
  sd01: { label: 'Starter Deck 01', entries: [...SD01_DECK] },
  sd02: { label: 'Starter Deck 02', entries: [...SD02_DECK] },
  sd03: { label: 'Starter Deck 03', entries: [...SD03_DECK] },
  sd04: { label: 'Starter Deck 04', entries: [...SD04_DECK] },
};

export type DeckId = string;

export interface SavedDeck {
  id: string;
  name: string;
  entries: DeckEntry[];
  updated: number;
}

// ---------------------------------------------------------------- เก็บในเครื่อง

const KEY = 'bs-my-decks';

export function loadMyDecks(): SavedDeck[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedDeck[];
    return Array.isArray(list)
      ? list.filter((d) => d && typeof d.id === 'string' && Array.isArray(d.entries)).map((d) => ({ ...d, entries: migrateEntries(d.entries) }))
      : [];
  } catch {
    return [];
  }
}

function writeMyDecks(list: SavedDeck[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* เก็บไม่ได้ (โหมดส่วนตัว / พื้นที่เต็ม) */
  }
}

export function saveMyDeck(deck: SavedDeck): void {
  const list = loadMyDecks().filter((d) => d.id !== deck.id);
  writeMyDecks([{ ...deck, updated: Date.now() }, ...list]);
}

export function deleteMyDeck(id: string): void {
  writeMyDecks(loadMyDecks().filter((d) => d.id !== id));
}

export const newDeckId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------- รหัสเด็คแบบมีรายการการ์ดในตัว

const FOIL_CODE: Record<Foil, string> = { rainbow: 'r', white: 'w' };

export function encodeDeck(name: string, entries: DeckEntry[]): string {
  const cards = entries.map((e) => {
    const foils = e.foils?.length ? '~' + e.foils.map((f) => (f ? FOIL_CODE[f] : '-')).join('') : '';
    return `${e.cardNo}*${e.count}${foils}`;
  });
  return `c:${encodeURIComponent(name)}|${cards.join(',')}`;
}

export function decodeDeck(token: string): { label: string; entries: DeckEntry[] } | null {
  const bar = token.indexOf('|');
  if (!token.startsWith('c:') || bar < 0) return null;
  const label = decodeURIComponent(token.slice(2, bar));
  const entries: DeckEntry[] = [];
  for (const part of token.slice(bar + 1).split(',').filter(Boolean)) {
    const m = part.match(/^([A-Z0-9-]+)\*(\d+)(?:~([rw-]+))?$/i);
    if (!m) return null;
    const foils = m[3] ? [...m[3]].map((c) => (c === 'r' ? 'rainbow' : c === 'w' ? 'white' : null)) : undefined;
    entries.push({ cardNo: m[1]!, count: Number(m[2]), ...(foils ? { foils } : {}) });
  }
  return { label, entries: migrateEntries(entries) };
}

// ---------------------------------------------------------------- ใช้งาน

const FALLBACK = STARTER_DECKS.sd01!;

/** ชื่อและรายการการ์ดของเด็ค (เด็คที่หาไม่เจอ = Starter Deck 01) */
export function deckInfo(id: DeckId): { label: string; entries: DeckEntry[]; custom: boolean } {
  const starter = STARTER_DECKS[id];
  if (starter) return { ...starter, custom: false };
  if (id.startsWith('u:')) {
    const saved = loadMyDecks().find((d) => d.id === id.slice(2));
    if (saved) return { label: saved.name, entries: saved.entries, custom: true };
  }
  if (id.startsWith('c:')) {
    const decoded = decodeDeck(id);
    if (decoded) return { ...decoded, custom: true };
  }
  return { ...FALLBACK, custom: false };
}

/** รหัสเด็คที่ส่งให้อีกเครื่องได้ (เด็คที่บันทึกในเครื่อง → รหัสที่มีรายการการ์ดในตัว) */
export function deckToken(id: DeckId): DeckId {
  if (!id.startsWith('u:')) return id;
  const info = deckInfo(id);
  return encodeDeck(info.label, info.entries);
}

/** เด็คทั้งหมดที่เลือกเล่นได้ในเครื่องนี้ */
export function deckChoices(): DeckId[] {
  return [...Object.keys(STARTER_DECKS), ...loadMyDecks().map((d) => `u:${d.id}`)];
}

export const deckSizeOf = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.count, 0);

// ---------------------------------------------------------------- ของตกแต่งเด็ค (เก็บในเครื่อง)

/**
 * ของตกแต่งของเด็คแต่ละเด็ค (คีย์ = DeckId ของเครื่องนี้ เช่น "sd01" / "u:<id>")
 * case: สีกล่องเด็ค (hex) / 'art' = ภาพการ์ดเด่นใบแรก / ไม่มี = สีหลักของเด็ค
 * main: การ์ดเด่น 3 ใบ (cardNo) ที่โผล่จากกล่อง · ไม่มี = เลือกให้อัตโนมัติ
 */
export interface DeckAccessories {
  case?: string;
  main?: string[];
}

const ACC_KEY = 'bs-deck-acc';

function readAcc(): Record<string, DeckAccessories> {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY) ?? '{}') as Record<string, DeckAccessories>;
  } catch {
    return {};
  }
}

export function loadDeckAcc(id: DeckId): DeckAccessories {
  return readAcc()[id] ?? {};
}

export function saveDeckAcc(id: DeckId, acc: DeckAccessories): void {
  try {
    localStorage.setItem(ACC_KEY, JSON.stringify({ ...readAcc(), [id]: acc }));
  } catch {
    /* เก็บไม่ได้ก็ไม่เป็นไร */
  }
}
