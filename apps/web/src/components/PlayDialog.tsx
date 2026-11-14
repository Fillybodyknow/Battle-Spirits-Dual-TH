import { useState } from 'react';
import { bpOf, levelOf, minCores, payableCost } from '@bs/engine';
import { cardName, playerLabel } from '../format';
import { db, flashPlayer, useGame, type MagicTiming, type PlayKind } from '../store';
import { CardFace } from './CardFace';
import { Core } from './Core';
import { BTN, Modal } from './Modal';

export type Mark = 'pay' | 'place';
type SoulUse = 'keep' | 'pay' | 'place';

const TITLE: Record<PlayKind, string> = { summon: 'อัญเชิญ', deployNexus: 'วาง Nexus', useMagic: 'ใช้ Magic' };

/** แถวการ์ดบนสนามที่ดึง Core มาได้: ภาพการ์ด + ชื่อ + เลเวลตอนนี้ → หลังดึง */
export function SourceCard({ cardId, marks, onCore }: { cardId: string; marks: Record<string, Mark>; onCore: (id: string) => void }) {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const now = levelOf(def, card.cores.length);
  const left = card.cores.filter((c) => !marks[c]).length;
  const after = levelOf(def, left);
  const taking = left < card.cores.length;
  const nexus = def.type === 'nexus';
  const dies = taking && !nexus && after === 0;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg p-1.5 ${dies ? 'bg-rose-900/40 ring-1 ring-rose-500/60' : taking ? 'bg-amber-900/20 ring-1 ring-amber-400/40' : 'bg-black/25'}`}
      onMouseEnter={() => hover(cardId)}
      onMouseLeave={() => hover(null)}
    >
      <div className={`h-16 w-11 shrink-0 ${card.state === 'exhausted' ? 'opacity-70' : ''}`} title={def.name}>
        <CardFace def={def} size="sm" level={now} />
      </div>
      <div className="w-32 shrink-0 leading-tight">
        <div className="truncate text-sm font-semibold text-slate-100">{def.name}</div>
        <div className="text-xs text-slate-400">
          {nexus ? 'Nexus' : 'Spirit'} · Lv{now}
          {!nexus && <> · BP {bpOf(def, card.cores.length).toLocaleString()}</>}
        </div>
        {taking && (
          <div className={`text-xs font-bold ${dies ? 'text-rose-300' : 'text-amber-300'}`}>
            {dies ? 'จะสูญสลาย!' : after === now ? `ยังเป็น Lv${after}` : `→ Lv${after}${nexus ? '' : ` · BP ${bpOf(def, left).toLocaleString()}`}`}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {card.cores.map((id) => (
          <Core key={id} coreId={id} size="lg" mark={marks[id] ?? null} onClick={() => onCore(id)} />
        ))}
      </div>
    </div>
  );
}

export function PlayDialog() {
  const play = useGame((s) => s.play);
  if (!play) return null;
  return <PlayDialogInner key={play.cardId + (play.braveOnto ?? '')} cardId={play.cardId} kind={play.kind} timing={play.timing} braveOnto={play.braveOnto} />;
}

/** จัด Core จาก Reserve อัตโนมัติ: Core ธรรมดาก่อน, Soul Core ตามที่เลือก */
function autoAssign(normal: string[], soul: string | undefined, cost: number, need: number, soulUse: SoulUse) {
  const pool = [...normal];
  const pay: string[] = [];
  const place: string[] = [];
  if (soul && soulUse === 'pay' && cost > 0) pay.push(soul);
  if (soul && soulUse === 'place' && need > 0) place.push(soul);
  while (pay.length < cost && pool.length > 0) pay.push(pool.shift()!);
  while (place.length < need && pool.length > 0) place.push(pool.shift()!);
  return { pay, place, ok: pay.length === cost && place.length === need };
}

function PlayDialogInner({ cardId, kind, timing, braveOnto }: { cardId: string; kind: PlayKind; timing?: MagicTiming; braveOnto?: string }) {
  const state = useGame((s) => s.state);
  const { dispatch, closePlay, hover } = useGame.getState();

  const card = state.cards[cardId]!;
  const player = card.owner;
  const p = state.players[player];
  const def = db.get(card.cardNo);
  // [Quick] ใน Flash timing: ใช้ Core จากรีเสิร์ฟเท่านั้น / [Soul Quick]: จ่ายด้วย Soul Core 1 ดวง
  const quickAb = kind === 'summon' && flashPlayer(state) === player ? def.abilities.find((a) => a.kind === 'quick') : undefined;
  const soulQuick = quickAb?.kind === 'quick' && !!quickAb.soul;
  const reserveSoul = p.reserve.find((id) => state.cores[id]!.isSoul);
  const cost = soulQuick ? 0 : payableCost(state, db, player, def);
  const allowPlace = kind !== 'useMagic' && !braveOnto;
  const normal = p.reserve.filter((id) => !state.cores[id]!.isSoul);
  const soul = soulQuick ? undefined : reserveSoul;

  // ตัวเลือกเลเวลที่จะวาง (จำนวน Core บนการ์ด)
  const levelChoices = allowPlace ? def.levels.map((l) => ({ level: l.level, need: l.cores, bp: l.bp })) : [{ level: 0, need: 0, bp: undefined }];
  const affordable = (need: number) => normal.length + (soul ? 1 : 0) >= cost + need;
  const firstOk = levelChoices.findIndex((l) => affordable(l.need));

  const [pick, setPick] = useState(Math.max(0, firstOk));
  const [soulUse, setSoulUse] = useState<SoulUse>(() => {
    const need = levelChoices[Math.max(0, firstOk)]!.need;
    return normal.length >= cost + need ? 'keep' : cost > 0 ? 'pay' : 'place';
  });
  const [manual, setManual] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const chosen = levelChoices[pick]!;
  const auto = autoAssign(normal, soul, cost, chosen.need, soulUse);

  // โหมดปรับเอง
  const manualPay = Object.keys(marks).filter((id) => marks[id] === 'pay');
  const manualPlace = Object.keys(marks).filter((id) => marks[id] === 'place');
  const min = allowPlace ? minCores(def) : 0;
  const payment = manual ? manualPay : auto.pay;
  const placement = manual ? manualPlace : auto.place;
  const ok = manual ? manualPay.length === cost && manualPlace.length >= min : auto.ok;
  const level = allowPlace ? levelOf(def, placement.length) : undefined;

  const startManual = () => {
    const init: Record<string, Mark> = {};
    auto.pay.forEach((id) => (init[id] = 'pay'));
    auto.place.forEach((id) => (init[id] = 'place'));
    setMarks(init);
    setManual(true);
  };
  const cycle = (id: string) =>
    setMarks((m) => {
      const next = { ...m };
      const cur = m[id];
      if (!cur) next[id] = 'pay';
      else if (cur === 'pay' && allowPlace) next[id] = 'place';
      else delete next[id];
      return next;
    });
  const depleting = p.field.filter((id) => {
    const c = state.cards[id]!;
    const d = db.get(c.cardNo);
    return d.type !== 'nexus' && levelOf(d, c.cores.filter((core) => !marks[core]).length) === 0;
  });

  const confirm = () => {
    if (kind === 'useMagic') dispatch({ type: 'useMagic', player, cardId, payment, timing });
    else if (braveOnto) dispatch({ type: 'summon', player, cardId, payment, placement: [], braveOnto });
    else if (soulQuick && reserveSoul) dispatch({ type: 'summon', player, cardId, payment: [reserveSoul], placement });
    else dispatch({ type: kind, player, cardId, payment, placement });
  };

  const soulOptions: { id: SoulUse; label: string; show: boolean }[] = [
    { id: 'keep', label: 'เก็บไว้ใน Reserve', show: true },
    { id: 'pay', label: 'ใช้จ่ายคอสต์', show: cost > 0 },
    { id: 'place', label: 'วางบนการ์ดนี้', show: allowPlace && chosen.need > 0 },
  ];

  return (
    <Modal
      onClose={closePlay}
      subtitle={playerLabel(player)}
      title={
        <>
          {braveOnto ? 'ร่วมร่าง' : TITLE[kind]} {def.name}
          {timing && <span className="ml-2 text-base text-yellow-300">[{timing === 'main' ? 'Main' : 'Flash'}]</span>}
          {quickAb && <span className="ml-2 text-base text-emerald-300">[{soulQuick ? 'Soul Quick' : 'Quick'}]</span>}
          {braveOnto && <span className="ml-2 text-base text-emerald-300">→ {cardName(state, braveOnto)}</span>}
        </>
      }
    >
      <div className="flex gap-5">
        <div className="h-52 w-38 shrink-0" onMouseEnter={() => hover(cardId)} onMouseLeave={() => hover(null)}>
          <CardFace def={def} level={level} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="text-sm">
            {soulQuick ? (
              <>
                จ่ายคอสต์ทั้งหมดด้วย <b className="text-rose-300">Soul Core 1 ดวง</b> จากรีเสิร์ฟ{!reserveSoul && <span className="text-rose-400"> (ไม่มี Soul Core ในรีเสิร์ฟ)</span>}
              </>
            ) : (
              <>
                คอสต์ที่ต้องจ่าย <b className="text-lg text-rose-300">{cost}</b>
                {cost < def.cost && <span className="text-slate-400"> (ลดจาก {def.cost})</span>}
              </>
            )}
            <span className="ml-3 text-slate-400">Reserve มี {p.reserve.length} ดวง</span>
          </div>

          {!manual && allowPlace && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-400">วางที่เลเวล</div>
              <div className="flex flex-wrap gap-2">
                {levelChoices.map((l, i) => (
                  <button
                    key={l.level}
                    type="button"
                    disabled={!affordable(l.need)}
                    onClick={() => setPick(i)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-30 ${
                      i === pick ? 'border-yellow-300 bg-yellow-300 text-slate-900' : 'border-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <div className="font-bold">Lv{l.level}</div>
                    <div className="text-xs">
                      Core {l.need}
                      {l.bp !== undefined && <> · BP {l.bp.toLocaleString()}</>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!manual && soul && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Core coreId={soul} size="sm" /> Soul Core
              </div>
              <div className="flex flex-wrap gap-2">
                {soulOptions
                  .filter((o) => o.show)
                  .map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSoulUse(o.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        soulUse === o.id ? 'border-rose-300 bg-rose-400/25 text-rose-100' : 'border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {!manual && (
            <div className={`rounded-lg p-2.5 text-sm ${auto.ok ? 'bg-slate-800' : 'bg-rose-900/40 text-rose-200'}`}>
              {auto.ok ? (
                <>
                  จ่าย {auto.pay.length} ดวง{allowPlace && <> · วางบนการ์ด {auto.place.length} ดวง</>} · Reserve เหลือ{' '}
                  {p.reserve.length - auto.pay.length - auto.place.length} ดวง
                  {allowPlace && def.type !== 'nexus' && level !== undefined && level > 0 && (
                    <span className="ml-2 font-bold text-emerald-300">
                      → Lv{level} BP {bpOf(def, placement.length).toLocaleString()}
                    </span>
                  )}
                </>
              ) : (
                'Core ใน Reserve ไม่พอ ลองเลือกเลเวลต่ำลง ใช้ Soul Core หรือปรับเองเพื่อดึง Core จากการ์ดบนสนาม'
              )}
            </div>
          )}

          {manual && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-4 text-sm">
                <span className={manualPay.length === cost ? 'text-rose-300' : 'text-rose-500'}>
                  จ่าย {manualPay.length}/{cost}
                </span>
                {allowPlace && (
                  <span className={manualPlace.length >= min ? 'text-emerald-300' : 'text-emerald-600'}>
                    วาง {manualPlace.length} (ขั้นต่ำ {min})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                คลิก Core เพื่อสลับ: ว่าง → <span className="text-rose-300">จ่าย</span>
                {allowPlace && (
                  <>
                    {' '}→ <span className="text-emerald-300">วางบนการ์ด</span>
                  </>
                )}{' '}
                → ว่าง
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-black/25 p-1.5">
                <span className="w-44 shrink-0 text-sm font-semibold text-slate-300">Reserve</span>
                <div className="flex flex-wrap gap-1">
                  {p.reserve.map((id) => (
                    <Core key={id} coreId={id} size="lg" mark={marks[id] ?? null} onClick={() => cycle(id)} />
                  ))}
                </div>
              </div>
              {p.field
                .filter((id) => state.cards[id]!.cores.length > 0)
                .map((id) => (
                  <SourceCard key={id} cardId={id} marks={marks} onCore={cycle} />
                ))}
              {depleting.length > 0 && <p className="text-sm text-amber-400">จะสูญสลาย: {depleting.map((id) => cardName(state, id)).join(', ')}</p>}
            </div>
          )}

          <div className="mt-auto flex items-center gap-2">
            {quickAb ? (
              <span className="text-xs text-emerald-300">[Quick]: ใช้ได้เฉพาะ Core จากรีเสิร์ฟ</span>
            ) : (
              <button type="button" onClick={manual ? () => setManual(false) : startManual} className={BTN.ghost}>
                {manual ? '← กลับไปแบบอัตโนมัติ' : 'ปรับ Core เอง…'}
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={closePlay} className={BTN.secondary}>
              ยกเลิก
            </button>
            <button type="button" disabled={!ok || (soulQuick && !reserveSoul)} onClick={confirm} className={BTN.primary}>
              ยืนยัน{braveOnto ? 'ร่วมร่าง' : TITLE[kind]}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
