import { rarityOf, type CardDef, type SymbolColor, type TextEffect } from '@bs/cards';
import { bpOf, cardLevel, currentBp, payableCost, type GameState } from '@bs/engine';
import { cardArt } from '../assets';
import { COLOR_BG, COLOR_LABEL, RARITY_BADGE, TYPE_LABEL, playerLabel } from '../format';
import { useEffect, useRef } from 'react';
import { actingPlayer, db, useGame, hiddenFrom, resolvingEffect } from '../store';
import { CardBack, CardFace } from './CardFace';
import { CoreRow } from './Core';

type Place = 'hand' | 'field' | 'trash' | 'burst' | 'deck' | 'other';

function whereIs(s: GameState, cardId: string): Place {
  const p = s.players[s.cards[cardId]!.owner];
  if (p.hand.includes(cardId)) return 'hand';
  if (p.field.includes(cardId)) return 'field';
  if (p.trashCards.includes(cardId)) return 'trash';
  if (p.burst === cardId) return 'burst';
  if (p.deck.includes(cardId)) return 'deck';
  return 'other';
}

const PLACE_LABEL: Record<Place, string> = {
  hand: 'บนมือ',
  field: 'บนสนาม',
  trash: 'ใน Trash',
  burst: 'เซ็ทเป็น Burst',
  deck: 'แสดงจากเด็ค',
  other: 'กำลังประมวลผล',
};

const TYPE_ICON: Record<CardDef['type'], string> = { spirit: 'S', ultimate: 'U', brave: 'B', nexus: 'N', magic: 'M' };
const TIMING_LABEL = { main: 'Main', flash: 'Flash', burst: 'Burst' } as const;

/** เน้นคำสำคัญในข้อความเอฟเฟกต์: [คีย์เวิร์ด] และ (โซลคอร์) */
function EffectText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]|\(โซลคอร์\)|โซลคอร์)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\[.+\]$/.test(part) ? (
          <span key={i} className="font-semibold text-orange-300">
            {part}
          </span>
        ) : /โซลคอร์/.test(part) ? (
          <span key={i} className="font-semibold text-rose-300">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Gem({ color }: { color: SymbolColor }) {
  return <span className={`inline-block h-3 w-3 rounded-full border border-white/70 ${COLOR_BG[color]}`} />;
}

function SymbolLine({ map }: { map: CardDef['symbols'] }) {
  const entries = Object.entries(map) as [SymbolColor, number][];
  if (entries.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {entries.map(([c, n]) => (
        <span key={c} className="flex items-center gap-1" title={COLOR_LABEL[c]}>
          <Gem color={c} />×{n}
        </span>
      ))}
    </span>
  );
}

/** แถวค่าสถานะ: ไอคอนกลม + ค่า (แบบแผงข้อมูลการ์ดในเกม) */
function Stat({ icon, iconClass, children, title }: { icon: string; iconClass: string; children: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-inner ${iconClass}`}>{icon}</span>
      <span className="min-w-0 text-lg leading-none font-bold text-white">{children}</span>
    </div>
  );
}

/** แผงรายละเอียดการ์ด: ชี้การ์ดเพื่อดู คลิกเพื่อปักไว้ */
export function CardInspector() {
  const state = useGame((s) => s.state);
  const hovered = useGame((s) => s.hovered);
  const pinned = useGame((s) => s.pinned);
  const cardId = hovered ?? pinned;
  const card = cardId ? state.cards[cardId] : undefined;
  // บรรทัดเอฟเฟกต์ที่กำลังทำงาน: ไฮไลต์สีทอง + เลื่อนให้เห็น
  const resolving = resolvingEffect(state);
  const firing = card && resolving?.cardId === card.id ? resolving.lines : [];
  const firingKey = firing.join(',');
  const firingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (firingKey) firingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [firingKey, cardId]);

  if (!card) {
    return (
      <div className="m-2 flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-sky-400/20 p-6 text-center text-sm text-slate-400">
        <div className="relative h-40 w-28 rotate-[-6deg] opacity-60">
          <div className="absolute inset-0 translate-x-3 rotate-[10deg]">
            <CardBack />
          </div>
          <div className="absolute inset-0">
            <CardBack />
          </div>
        </div>
        <div>
          <div className="font-bold text-slate-200">รายละเอียดการ์ด</div>
          ชี้เมาส์ที่การ์ดเพื่อดู · คลิกเพื่อปักไว้
        </div>
      </div>
    );
  }

  const place = whereIs(state, card.id);
  // ซ่อนมือ/Burst ของฝ่ายที่ไม่ได้ตัดสินใจ (กันการ์ดที่ปักไว้ตั้งแต่เทิร์นก่อนโผล่ให้อีกฝ่ายเห็น)
  if ((place === 'hand' || place === 'burst') && hiddenFrom(useGame.getState(), card.owner)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
        <span className="text-3xl">🂠</span>
        การ์ดคว่ำของ{playerLabel(card.owner)}
      </div>
    );
  }
  const def = db.get(card.cardNo);
  const onField = place === 'field';
  const level = onField ? cardLevel(state, db, card.id) : null;
  const main = def.colors[0] ?? 'white';
  const pay = place === 'hand' ? payableCost(state, db, card.owner, def) : null;
  const spirit = def.type !== 'nexus' && def.type !== 'magic';
  const bpNow = onField && spirit ? currentBp(state, db, card.id) : null;
  const bpBase = onField ? bpOf(def, card.cores.length) : 0;
  const art = cardArt(def.cardNo);
  const scripted = new Set(def.abilities.map((a) => a.source));
  const effects = def.effects as TextEffect[];
  const rarity = rarityOf(def.rarity);
  const typeLine = [TYPE_LABEL[def.type], ...def.family].join(' / ');

  return (
    <div className="m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sky-400/40 bg-gradient-to-b from-slate-800 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      {/* แถบชื่อ */}
      <div className="flex items-center gap-2 border-b border-sky-400/30 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-700 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-white [text-shadow:0_1px_2px_#000]">{def.name}</h2>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/60 text-sm font-black shadow ${COLOR_BG[main]} ${
            main === 'white' || main === 'yellow' ? 'text-slate-900' : 'text-white'
          }`}
          title={TYPE_LABEL[def.type]}
        >
          {TYPE_ICON[def.type]}
        </span>
      </div>

      {/* ภาพ + ค่าสถานะ */}
      <div className="flex gap-3 p-3">
        <div className="w-32 shrink-0">
          {art ? (
            <img src={art} alt={def.name} className="w-full rounded-md shadow-lg" draggable={false} />
          ) : (
            <div className="h-44">
              <CardFace def={def} level={level ?? undefined} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {rarity && (
            <span className={`w-fit rounded px-1.5 text-xs font-black ${RARITY_BADGE[rarity.rank]}`} title={`ระดับความหายาก: ${rarity.label}`}>
              {rarity.code} · {rarity.label}
            </span>
          )}
          <Stat icon="C" iconClass="bg-gradient-to-b from-amber-300 to-amber-600 text-slate-900" title="คอสต์">
            {pay !== null && pay < def.cost ? (
              <>
                <span className="text-emerald-300">{pay}</span> <span className="text-sm text-slate-500 line-through">{def.cost}</span>
              </>
            ) : (
              def.cost
            )}
          </Stat>
          {spirit && (
            <Stat icon="BP" iconClass="bg-gradient-to-b from-sky-300 to-sky-700 text-white" title="BP">
              {bpNow !== null ? (
                <span className={bpNow > bpBase ? 'text-yellow-300' : ''}>{bpNow.toLocaleString()}</span>
              ) : (
                <span className="text-base">{def.levels.map((l) => (l.bp ?? 0) / 1000).join(' / ')}K</span>
              )}
            </Stat>
          )}
          {onField && (
            <Stat icon={`L${level}`} iconClass="bg-gradient-to-b from-yellow-200 to-yellow-500 text-slate-900" title="เลเวลปัจจุบัน">
              <span className="flex items-center gap-1.5 text-sm font-normal">
                <CoreRow cores={card.cores} size="sm" noFlip />
              </span>
            </Stat>
          )}
          <div className="mt-auto flex flex-col gap-1 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0">ลดคอสต์</span>
              <SymbolLine map={def.reduction} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0">Gem</span>
              <SymbolLine map={def.symbols} />
            </div>
          </div>
        </div>
      </div>

      {/* แถบประเภท/เผ่า */}
      <div className="border-y border-sky-400/20 bg-slate-700/70 px-3 py-1 text-sm font-semibold text-slate-100">[{typeLine}]</div>

      {/* สถานะ + ตารางเลเวล */}
      <div className="flex flex-col gap-1.5 px-3 pt-2 text-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span>
            {playerLabel(card.owner)} · {PLACE_LABEL[place]}
            {pinned === card.id && hovered !== card.id && ' · 📌'}
          </span>
          {onField && <span>{card.state === 'exhausted' ? 'เสื่อมสภาพ' : 'ฟื้นสภาพ'}</span>}
        </div>
        {bpNow !== null && bpNow !== bpBase && (
          <div className="text-slate-400">
            BP ตามเลเวล {bpBase.toLocaleString()}
            {card.turnBp > 0 && <> · ในเทิร์นนี้ +{card.turnBp.toLocaleString()}</>}
            {bpNow - bpBase - card.turnBp > 0 && <> · ถาวร +{(bpNow - bpBase - card.turnBp).toLocaleString()}</>}
          </div>
        )}
        {def.levels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {def.levels.map((lv) => (
              <span
                key={lv.level}
                className={`rounded px-1.5 py-0.5 ${lv.level === level ? 'bg-yellow-300 font-bold text-slate-900' : 'bg-slate-800 text-slate-300'}`}
              >
                Lv{lv.level} ●{lv.cores}
                {lv.bp !== undefined && <> · {lv.bp.toLocaleString()}</>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* เอฟเฟกต์ (เลื่อนอ่านได้) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {effects.length === 0 ? (
          <p className="text-sm text-slate-500">ไม่มีเอฟเฟกต์</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {effects.map((e, i) => {
              const active = level === null || !e.levels || e.levels.includes(level);
              const auto = scripted.has(i);
              const hot = firing.includes(i);
              return (
                <div
                  key={i}
                  ref={hot && firing[0] === i ? firingRef : undefined}
                  className={hot ? 'effect-firing -mx-1.5 rounded-lg px-1.5 py-1' : active ? '' : 'opacity-45'}
                >
                  <div className="mb-0.5 flex flex-wrap items-center gap-1">
                    {e.levels?.map((l) => (
                      <span key={l} className={`rounded px-1 text-[10px] font-bold ${level === l ? 'bg-yellow-300 text-slate-900' : 'bg-slate-700 text-slate-200'}`}>
                        Lv{l}
                      </span>
                    ))}
                    {e.timing && (
                      <span className={`rounded px-1 text-[10px] font-bold text-white ${e.timing === 'burst' ? 'bg-orange-600' : 'bg-indigo-600'}`}>
                        {TIMING_LABEL[e.timing]}
                      </span>
                    )}
                    {hot && <span className="rounded bg-amber-400 px-1 text-[10px] font-black text-slate-900">กำลังทำงาน</span>}
                    <span
                      className={`ml-auto rounded px-1 text-[10px] ${auto ? 'text-emerald-300' : 'text-amber-300'}`}
                      title={auto ? 'engine ประมวลผลให้อัตโนมัติ' : 'engine ยังไม่รองรับ ผู้เล่นต้องจัดการเอง'}
                    >
                      {auto ? '● อัตโนมัติ' : '● ทำเอง'}
                    </span>
                  </div>
                  <p className={`text-[15px] leading-relaxed ${hot ? 'font-semibold text-amber-200' : active ? 'text-sky-200' : 'text-slate-300'}`}>
                    <EffectText text={e.text} />
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
