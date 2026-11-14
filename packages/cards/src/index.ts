export * from './schema';
export * from './database';
export * from './deck';
export * from './text-format';
export * from './abilities';
export * from './rarity';

import sampleSet from '../data/sample-set.json';
import sd01 from '../data/sd01.json';
import sd01Deck from '../data/sd01-deck.json';
import { SD01_SCRIPTS } from '../data/sd01-scripts';
import sd02 from '../data/sd02.json';
import sd02Deck from '../data/sd02-deck.json';
import { SD02_SCRIPTS } from '../data/sd02-scripts';
import sd03 from '../data/sd03.json';
import sd03Deck from '../data/sd03-deck.json';
import { SD03_SCRIPTS } from '../data/sd03-scripts';
import { attachScripts } from './abilities';
import { createCardDatabase, type CardDatabase } from './database';
import type { DeckEntry } from './deck';

/** ชุดการ์ดตัวอย่างที่ออกแบบเอง ใช้ทดสอบ engine (ไม่ใช่การ์ดจริง) */
export function loadSampleCards(): CardDatabase {
  return createCardDatabase(sampleSet);
}

/**
 * การ์ดชุด Starter Deck 01 (สร้างจาก assets/files/SD1.text ด้วย `npm run cards`)
 * เอฟเฟกต์ที่มีสคริปต์ใน data/sd01-scripts.ts จะทำงานใน engine
 */
export function loadSD01Cards(): CardDatabase {
  return createCardDatabase(attachScripts(sd01, SD01_SCRIPTS));
}

/** การ์ดชุด Starter Deck 02 (assets/files/SD2.text + data/sd02-scripts.ts) */
export function loadSD02Cards(): CardDatabase {
  return createCardDatabase(attachScripts(sd02, SD02_SCRIPTS));
}

/** การ์ดชุด Starter Deck 03 (assets/files/SD3.text + data/sd03-scripts.ts) */
export function loadSD03Cards(): CardDatabase {
  return createCardDatabase(attachScripts(sd03, SD03_SCRIPTS));
}

/** การ์ด Starter Deck ทุกชุดในฐานข้อมูลเดียว (ใช้เล่นข้ามชุด) */
export function loadStarterCards(): CardDatabase {
  return createCardDatabase([...loadSD01Cards().all(), ...loadSD02Cards().all(), ...loadSD03Cards().all()]);
}

/** รายการการ์ดในกล่อง Starter Deck 01 (40 ใบ) */
export const SD01_DECK: readonly DeckEntry[] = sd01Deck;
/** รายการการ์ดในกล่อง Starter Deck 02 (40 ใบ) */
export const SD02_DECK: readonly DeckEntry[] = sd02Deck;
/** รายการการ์ดในกล่อง Starter Deck 03 (40 ใบ) */
export const SD03_DECK: readonly DeckEntry[] = sd03Deck;
