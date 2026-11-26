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
import bs05 from '../data/bs05.json';
import { BS05_SCRIPTS } from '../data/bs05-scripts';
import bs06 from '../data/bs06.json';
import { BS06_SCRIPTS } from '../data/bs06-scripts';
import bs07 from '../data/bs07.json';
import { BS07_SCRIPTS } from '../data/bs07-scripts';
import bs08 from '../data/bs08.json';
import { BS08_SCRIPTS } from '../data/bs08-scripts';
import bs09 from '../data/bs09.json';
import { BS09_SCRIPTS } from '../data/bs09-scripts';
import bs10 from '../data/bs10.json';
import { BS10_SCRIPTS } from '../data/bs10-scripts';
import bs11 from '../data/bs11.json';
import { BS11_SCRIPTS } from '../data/bs11-scripts';
import bs12 from '../data/bs12.json';
import { BS12_SCRIPTS } from '../data/bs12-scripts';
import bs13 from '../data/bs13.json';
import { BS13_SCRIPTS } from '../data/bs13-scripts';
import bs14 from '../data/bs14.json';
import { BS14_SCRIPTS } from '../data/bs14-scripts';
import bs15 from '../data/bs15.json';
import { BS15_SCRIPTS } from '../data/bs15-scripts';
import bs16 from '../data/bs16.json';
import { BS16_SCRIPTS } from '../data/bs16-scripts';
import bs17 from '../data/bs17.json';
import { BS17_SCRIPTS } from '../data/bs17-scripts';
import bsc01 from '../data/bsc01.json';
import { BSC01_SCRIPTS } from '../data/bsc01-scripts';
import bsc02 from '../data/bsc02.json';
import { BSC02_SCRIPTS } from '../data/bsc02-scripts';
import bsc03 from '../data/bsc03.json';
import { BSC03_SCRIPTS } from '../data/bsc03-scripts';
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
/** การ์ดเสมือน "สปิริตร่างแยก" (Bunshin): การ์ดคว่ำบนสนามใช้ข้อมูลนี้แทนการ์ดจริง (ขึ้นต้น SMP = ไม่แสดงในหน้าจัดเด็ค) */
export const CLONE_CARD_NO = 'SMP-BUNSHIN';
const CLONE_DEF = {
  cardNo: CLONE_CARD_NO,
  name: 'สปิริตร่างแยก',
  type: 'spirit',
  cost: 0,
  colors: ['green'],
  reduction: {},
  symbols: { green: 1 },
  family: ['ร่างแยก'],
  teams: [],
  magicTypes: [],
  levels: [{ level: 1, cores: 1, bp: 3000 }],
  burst: false,
  effects: [],
  abilities: [],
};

export function loadAllCards(): CardDatabase {
  return createCardDatabase([
    CLONE_DEF,
    ...loadSD01Cards().all(),
    ...loadSD02Cards().all(),
    ...loadSD03Cards().all(),
    ...loadSD04Cards().all(),
    ...loadBS01Cards().all(),
    ...loadBS02Cards().all(),
    ...loadBS03Cards().all(),
    ...loadBS04Cards().all(),
    ...loadBS05Cards().all(),
    ...loadBS06Cards().all(),
    ...loadBS07Cards().all(),
    ...loadBS08Cards().all(),
    ...loadBS09Cards().all(),
    ...loadBS10Cards().all(),
    ...loadBS11Cards().all(),
    ...loadBS12Cards().all(),
    ...loadBS13Cards().all(),
    ...loadBS14Cards().all(),
    ...loadBS15Cards().all(),
    ...loadBSC01Cards().all(),
    ...loadBSC02Cards().all(),
    ...loadBS16Cards().all(),
    ...loadBS17Cards().all(),
    ...loadBSC03Cards().all(),
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

/** การ์ดชุด Booster Set 06 (การ์ด "ชุด: BS06" ใน assets/files/cards/ + data/bs06-scripts.ts) */
export function loadBS06Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs06, BS06_SCRIPTS));
}

/** การ์ดชุด Booster Set 07 (การ์ด "ชุด: BS07" ใน assets/files/cards/ + data/bs07-scripts.ts) */
export function loadBS07Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs07, BS07_SCRIPTS));
}

/** การ์ดชุด Booster Set 08 (การ์ด "ชุด: BS08" ใน assets/files/cards/ + data/bs08-scripts.ts) */
export function loadBS08Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs08, BS08_SCRIPTS));
}

/** การ์ดชุด Booster Set 09 (การ์ด "ชุด: BS09" ใน assets/files/cards/ + data/bs09-scripts.ts) */
export function loadBS09Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs09, BS09_SCRIPTS));
}

/** การ์ดชุด Booster Set 10 (การ์ด "ชุด: BS10" ใน assets/files/cards/ + data/bs10-scripts.ts) */
export function loadBS10Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs10, BS10_SCRIPTS));
}

/** การ์ดชุด Booster Set 13 (การ์ด "ชุด: BS13" ใน assets/files/cards/ + data/bs13-scripts.ts) */
export function loadBS13Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs13, BS13_SCRIPTS));
}

/** การ์ดชุด Booster Set 14 (การ์ด "ชุด: BS14" ใน assets/files/cards/ + data/bs14-scripts.ts) */
export function loadBS14Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs14, BS14_SCRIPTS));
}

/** การ์ดชุด Booster Set 15 (การ์ด "ชุด: BS15" ใน assets/files/cards/ + data/bs15-scripts.ts) */
export function loadBS15Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs15, BS15_SCRIPTS));
}

/** การ์ดชุด Booster Set 16 (การ์ด "ชุด: BS16" = BS25 แดง/ขาว/ม่วง ใน assets/files/cards/ + data/bs16-scripts.ts) */
export function loadBS16Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs16, BS16_SCRIPTS));
}

/** การ์ดชุด Booster Set 17 (การ์ด "ชุด: BS17" = BS25 เขียว/เหลือง/ฟ้า ใน assets/files/cards/ + data/bs17-scripts.ts) */
export function loadBS17Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs17, BS17_SCRIPTS));
}

/** การ์ดชุด BSC01 (การ์ด "ชุด: BSC01" = ต้นรหัส BSC15 ใน assets/files/cards/ + data/bsc01-scripts.ts) */
export function loadBSC01Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bsc01, BSC01_SCRIPTS));
}

/** การ์ดชุด BSC02 (การ์ด "ชุด: BSC02" = ต้นรหัส BSC16 ใน assets/files/cards/ + data/bsc02-scripts.ts) */
export function loadBSC02Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bsc02, BSC02_SCRIPTS));
}

/** การ์ดชุด BSC03 (การ์ด "ชุด: BSC03" = ต้นรหัส BSC17 ใน assets/files/cards/ + data/bsc03-scripts.ts) */
export function loadBSC03Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bsc03, BSC03_SCRIPTS));
}

/** การ์ดชุด Booster Set 12 (การ์ด "ชุด: BS12" ใน assets/files/cards/ + data/bs12-scripts.ts) */
export function loadBS12Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs12, BS12_SCRIPTS));
}

/** การ์ดชุด Booster Set 11 (การ์ด "ชุด: BS11" ใน assets/files/cards/ + data/bs11-scripts.ts) */
export function loadBS11Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs11, BS11_SCRIPTS));
}

/** การ์ดชุด Booster Set 05 (การ์ด "ชุด: BS05" ใน assets/files/cards/ + data/bs05-scripts.ts) */
export function loadBS05Cards(): CardDatabase {
  return createCardDatabase(attachScripts(bs05, BS05_SCRIPTS));
}

/** การ์ดชุด Booster Set 01 (การ์ด "ชุด: BS01" ใน assets/files/cards/ + data/bs01-scripts.ts) */
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
