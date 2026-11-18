import type { CardDef, SymbolColor } from '@bs/cards';
import type { GameEvent, GameState, Phase, PlayerId } from '@bs/engine';
import { db } from './store';

export const COLOR_BG: Record<SymbolColor, string> = {
  red: 'bg-red-600',
  purple: 'bg-purple-600',
  green: 'bg-green-600',
  white: 'bg-slate-200',
  yellow: 'bg-yellow-400',
  blue: 'bg-sky-500',
  ultimate: 'bg-gradient-to-br from-amber-300 via-rose-400 to-indigo-500',
};

export const COLOR_BORDER: Record<SymbolColor, string> = {
  red: 'border-red-500',
  purple: 'border-purple-500',
  green: 'border-green-500',
  white: 'border-slate-300',
  yellow: 'border-yellow-400',
  blue: 'border-sky-400',
  ultimate: 'border-amber-300',
};

export const COLOR_LABEL: Record<SymbolColor, string> = {
  red: 'แดง',
  purple: 'ม่วง',
  green: 'เขียว',
  white: 'ขาว',
  yellow: 'เหลือง',
  blue: 'ฟ้า',
  ultimate: 'Ultimate',
};

export const TYPE_LABEL: Record<CardDef['type'], string> = {
  spirit: 'Spirit',
  ultimate: 'Ultimate',
  brave: 'Brave',
  nexus: 'Nexus',
  magic: 'Magic',
};

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'core', label: 'Core' },
  { id: 'draw', label: 'Draw' },
  { id: 'refresh', label: 'Refresh' },
  { id: 'main', label: 'Main' },
  { id: 'attack', label: 'Attack' },
  { id: 'end', label: 'End' },
];

export const playerLabel = (p: PlayerId) => (p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2');

const END_REASON = { lifeZero: 'Life เป็น 0', deckOut: 'เด็คหมด', concede: 'ยอมแพ้' } as const;

export function cardName(state: GameState, cardId: string): string {
  const card = state.cards[cardId];
  return card ? db.get(card.cardNo).name : cardId;
}

/** แปลง event เป็นข้อความใน log (null = ไม่แสดง) */
export function formatEvent(e: GameEvent, s: GameState): string | null {
  const name = (id: string) => cardName(s, id);
  switch (e.type) {
    case 'gameStarted':
      return `เริ่มเกม: ${playerLabel(e.firstPlayer)} เริ่มก่อน`;
    case 'turnStarted':
      return `── เทิร์น ${e.turn}: ${playerLabel(e.player)} ──`;
    case 'phaseChanged':
    case 'cardDrawn':
    case 'refreshed':
      return null;
    case 'coreGained':
      return `${playerLabel(e.player)} ได้ Core 1 ดวง`;
    case 'summoned':
      if (e.fromTrash) return `${playerLabel(e.player)} อัญเชิญ ${name(e.cardId)} จากแทรช (จ่าย ${e.paid})`;
      if (e.from === 'trash') return `${playerLabel(e.player)} อัญเชิญ ${name(e.cardId)} จากแทรช`;
      if (e.from) return `${playerLabel(e.player)} อัญเชิญ ${name(e.cardId)} โดยไม่จ่ายคอสต์`;
      return `${playerLabel(e.player)} อัญเชิญ ${name(e.cardId)}${e.quick ? ' [Quick]' : ''} (จ่าย ${e.paid})`;
    case 'nexusDeployed':
      return `${playerLabel(e.player)} วาง Nexus ${name(e.cardId)} (จ่าย ${e.paid})`;
    case 'magicUsed':
      return `${playerLabel(e.player)} ใช้ Magic ${name(e.cardId)} [${e.timing === 'main' ? 'Main' : 'Flash'}] (จ่าย ${e.paid})`;
    case 'coresMoved':
      return `${playerLabel(e.player)} ย้าย Core ${e.count} ดวง`;
    case 'burstSet':
      return `${playerLabel(e.player)} เซ็ท Burst${e.replacedCardId ? ' (ใบเก่าลง Trash)' : ''}`;
    case 'burstDiscarded':
      return `${playerLabel(e.player)} ทิ้ง Burst (${name(e.cardId)}) ลง Trash`;
    case 'depleted':
      return `${name(e.cardId)} สูญสลาย`;
    case 'attackDeclared':
      return `${name(e.attackerId)} ประกาศโจมตี`;
    case 'blockDeclared':
      return `${name(e.blockerId)} บล็อก`;
    case 'noBlock':
      return 'ไม่บล็อก';
    case 'flashPassed':
      return `${playerLabel(e.player)} pass Flash`;
    case 'lifeLost':
      return `${playerLabel(e.player)} เสีย Life ${e.amount}`;
    case 'destroyed':
      return e.stays ? `${name(e.cardId)} ถูกทำลาย แต่ยังอยู่บนสนามแบบเสื่อมสภาพ` : `${name(e.cardId)} ถูกทำลาย`;
    case 'battleEnded':
      return null;
    case 'effectResolving':
      return null;
    case 'abilityTriggered':
      return `✦ เอฟเฟกต์ของ ${name(e.cardId)} ทำงาน`;
    case 'staticApplied':
      return `✦ เอฟเฟกต์ถาวรของ ${name(e.cardId)} ทำงาน`;
    case 'bpBuffed':
      return `${name(e.cardId)} BP+${e.amount} ในเทิร์นนี้`;
    case 'mustBlock':
      return `[True-Rage] ${name(e.cardId)}: คู่แข่งต้องป้องกันถ้าทำได้`;
    case 'cardsRevealed':
      return `${playerLabel(e.player)} แสดงการ์ดบนสุดเด็ค: ${e.cardIds.map(name).join(', ')}`;
    case 'cardToHand':
      return `${playerLabel(e.player)} นำ ${name(e.cardId)} จาก${e.from === 'deck' ? 'เด็ค' : 'แทรช'}ขึ้นมือ`;
    case 'milled':
      return `${playerLabel(e.player)} ทิ้ง ${e.cardIds.length} ใบจากเด็คลง Trash`;
    case 'optionChosen':
      return `${playerLabel(e.player)} เลือก: ${e.option}`;
    case 'evolved':
      return `[Evolution] ย้าย Core ${e.count} ดวงมาวางบน ${name(e.cardId)}${e.soul ? ' (มี Soul Core)' : ''}`;
    case 'cardRefreshed':
      return `${name(e.cardId)} ฟื้นสภาพ`;
    case 'discarded':
      return `${playerLabel(e.player)} ทิ้ง ${name(e.cardId)} จากมือ`;
    case 'cardLocked':
      return `${name(e.cardId)} โจมตี/ป้องกันไม่ได้ในเทิร์นนี้`;
    case 'coresPaidToBlock':
      return `${playerLabel(e.player)} ส่งคอร์รีเสิร์ฟ ${e.count} เม็ดลงแทรชเพื่อป้องกัน`;
    case 'burstActivated':
      return `💥 ${playerLabel(e.player)} เปิด Burst: ${name(e.cardId)}`;
    case 'spellResolved':
      return null;
    case 'soulFromTrash':
      return `นำ Soul Core จากแทรชวางบน ${name(e.cardId)}`;
    case 'lifeShield':
      return `ในเทิร์นนี้ ไลฟ์ของ${playerLabel(e.player)}ไม่ได้รับความเสียหายจากการโจมตีของสปิริตคอสต์ ${e.minCost} ขึ้นไป`;
    case 'forcedAttack':
      return `${name(e.cardId)} ต้องโจมตีมาที่ ${name(e.holderId)} เป็นใบแรก`;
    case 'kagemushaChance':
      return `${name(e.targetId)} ตกเป็นเป้า: ${playerLabel(e.player)} ใช้ Kagemusha ได้`;
    case 'lifeGained':
      return `${playerLabel(e.player)} ได้ไลฟ์ +${e.amount}`;
    case 'costPaid':
      return `${playerLabel(e.player)} จ่ายคอสต์ ${e.paid} ให้ ${name(e.cardId)}`;
    case 'soulToTrash':
      return `${name(e.cardId)} ส่ง Soul Core ลงแทรช`;
    case 'consecutiveBlade':
      return `[Consecutive Blade] ${name(e.cardId)}: คู่แข่งต้องป้องกัน 2 ตัวถ้าทำได้`;
    case 'blockerChosen':
      return `ฝ่ายโจมตีเลือก ${name(e.cardId)} เป็นผู้ป้องกัน`;
    case 'exhausted':
      return `${name(e.cardId)} เสื่อมสภาพ`;
    case 'bounced':
      return `${name(e.cardId)} กลับขึ้นมือ${playerLabel(e.player)}`;
    case 'cardShown':
      return `${playerLabel(e.player)} วางแสดง ${name(e.cardId)} นอกมือ (ใช้งานได้เหมือนอยู่ในมือ)`;
    case 'returnedToDeck':
      return `${name(e.cardId)} กลับไปไว้${e.where === 'top' ? 'บนสุด' : 'ใต้สุด'}เด็ค${playerLabel(e.player)}`;
    case 'voidCore':
      return `นำคอร์วอยด์ ${e.count} ดวงวาง${e.cardId ? `บน ${name(e.cardId)}` : `ที่${e.trash ? 'แทรช' : 'รีเสิร์ฟ'}${playerLabel(e.player)}`}`;
    case 'soulToReserve':
      return `${name(e.cardId)} ส่ง Soul Core ไปรีเสิร์ฟ`;
    case 'coresToTrash':
      return `${name(e.cardId)} ส่ง Core ${e.count} ดวงลงแทรช`;
    case 'cardsToDeckBottom':
      return `${playerLabel(e.player)} วาง ${e.cardIds.map(name).join(', ')} ไว้ใต้สุดเด็ค`;
    case 'braved':
      return `[Brave] ${name(e.cardId)} ร่วมร่างกับ ${name(e.hostId)}`;
    case 'braveSeparated':
      return e.stays ? `${name(e.cardId)} แยกร่างและอยู่บนสนามต่อ` : `${name(e.cardId)} ลง Trash พร้อมผู้ร่วมร่าง`;
    case 'catalyze':
      return `[Catalyze] ${name(e.cardId)} สั่งใช้ Soul Burst: ${name(e.burstId)}`;
    case 'attackBanned':
      return `ในเทิร์นนี้ สปิริตของ${playerLabel(e.player)}โจมตีไม่ได้`;
    case 'activated': {
      const ab = db.get(s.cards[e.cardId]!.cardNo).abilities.find((a) => a.kind === 'activated' && a.source === e.source);
      return `${playerLabel(e.player)} ใช้เอฟเฟกต์ [Flash] ของ ${name(e.cardId)}${ab?.kind === 'activated' ? `: ${ab.label}` : ''}`;
    }
    case 'coresRemoved':
      return `${name(e.cardId)} ถูกส่งคอร์ ${e.count} เม็ดไป${e.to === 'trash' ? 'แทรช' : 'รีเสิร์ฟ'}`;
    case 'gameOver':
      return `🏆 ${playerLabel(e.winner)} ชนะ (${END_REASON[e.reason]})`;
  }
}

/** สีป้ายระดับความหายาก (อันดับ 1 = C … 6 = ระดับพิเศษ) */
export const RARITY_BADGE: Record<number, string> = {
  1: 'bg-slate-500 text-white',
  2: 'bg-emerald-500 text-slate-950',
  3: 'bg-sky-400 text-slate-950',
  4: 'bg-gradient-to-r from-violet-400 to-fuchsia-500 text-white',
  5: 'bg-gradient-to-r from-amber-300 to-rose-400 text-slate-950',
  6: 'bg-gradient-to-r from-yellow-200 via-amber-400 to-fuchsia-500 text-slate-950',
};

/** ข้อความเงื่อนไขร่วมร่างของ Brave */
export function braveText(b: { minCost?: number; bp?: number; maxSpirits?: number } | undefined): { cond: string; bonus: string | null } | null {
  if (!b) return null;
  return {
    cond: b.minCost !== undefined ? `ร่วมร่างกับสปิริตคอสต์ตั้งแต่ ${b.minCost} ขึ้นไป` : 'ร่วมร่างกับสปิริตได้',
    bonus: b.bp ? `ผู้ร่วมร่าง BP +${b.bp.toLocaleString()}` : null,
  };
}
