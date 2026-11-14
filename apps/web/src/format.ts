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
      return `${name(e.cardId)} ถูกทำลาย`;
    case 'battleEnded':
      return null;
    case 'effectResolving':
      return null;
    case 'abilityTriggered':
      return `✦ เอฟเฟกต์ของ ${name(e.cardId)} ทำงาน`;
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
    case 'burstActivated':
      return `💥 ${playerLabel(e.player)} เปิด Burst: ${name(e.cardId)}`;
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
    case 'voidCore':
      return `นำคอร์วอยด์ ${e.count} ดวงวาง${e.cardId ? `บน ${name(e.cardId)}` : `ที่รีเสิร์ฟ${playerLabel(e.player)}`}`;
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
    case 'gameOver':
      return `🏆 ${playerLabel(e.winner)} ชนะ (${END_REASON[e.reason]})`;
  }
}
