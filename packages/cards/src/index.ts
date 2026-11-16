export * from './schema';
export * from './database';
export * from './deck';
export * from './text-format';
export * from './abilities';
export * from './rarity';
export * from './legacy-card-no';

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
import sd04 from '../data/sd04.json';
import sd04Deck from '../data/sd04-deck.json';
import { SD04_SCRIPTS } from '../data/sd04-scripts';
import bs01 from '../data/bs01.json';
import { BS01_SCRIPTS } from '../data/bs01-scripts';
import bs02 from '../data/bs02.json';
import { BS02_SCRIPTS } from '../data/bs02-scripts';
import bs03 from '../data/bs03.json';
import { BS03_SCRIPTS } from '../data/bs03-scripts';
import bs04 from '../data/bs04.json';
import { BS04_SCRIPTS } from '../data/bs04-scripts';
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

/** การ์ดชุด Starter Deck 04 (assets/files/SD4.text + data/sd04-scripts.ts) */
export function loadSD04Cards(): CardDatabase {
  return createCardDatabase(attachScripts(sd04, SD04_SCRIPTS));
}

/**
 * การ์ดทุกชุดในฐานข้อมูลเดียว (Starter Deck + Booster Set)
 * ใช้เล่นจริง: รายการเด็คของชุดหนึ่งอาจมีการ์ดที่เขียนไว้ในอีกชุด
 */
export function loadAllCards(): CardDatabase {
  return createCardDatabase([
    ...loadSD01Cards().all(),
    ...loadSD02Cards().all(),
    ...loadSD03Cards().all(),
    ...loadSD04Cards().all(),
    ...loadBS01Cards().all(),
    ...loadBS02Cards().all(),
    ...loadBS03Cards().all(),
    ...loadBS04Cards().all(),
  ]);
}

/** การ์ดชุด Booster Set 02 / 03 (การ์ดใหม่ยังไม่มีสคริปต์เอฟเฟกต์) */
export function loadBS02Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs02, BS02_SCRIPTS));
}
export function loadBS03Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs03, BS03_SCRIPTS));
}
/** การ์ดชุด Booster Set 04 (การ์ดของ SD04 เขียนเต็มไว้ที่นี่) */
export function loadBS04Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs04, BS04_SCRIPTS));
}

/** การ์ดชุด Booster Set 01 (assets/files/BS01/*.text + data/bs01-scripts.ts) */
export function loadBS01Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs01, BS01_SCRIPTS));
}

/** @deprecated ใช้ loadAllCards (ชื่อเดิม ก่อนมี Booster Set) */
export const loadStarterCards = loadAllCards;

/** รายการการ์ดในกล่อง Starter Deck 01 (40 ใบ) */
export const SD01_DECK: readonly DeckEntry[] = sd01Deck as readonly DeckEntry[];
/** รายการการ์ดในกล่อง Starter Deck 02 (40 ใบ) */
export const SD02_DECK: readonly DeckEntry[] = sd02Deck as readonly DeckEntry[];
/** รายการการ์ดในกล่อง Starter Deck 03 (40 ใบ) */
export const SD03_DECK: readonly DeckEntry[] = sd03Deck as readonly DeckEntry[];
/** รายการการ์ดในกล่อง Starter Deck 04 (40 ใบ) */
export const SD04_DECK: readonly DeckEntry[] = sd04Deck as readonly DeckEntry[];
