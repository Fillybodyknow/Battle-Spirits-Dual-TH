import { useEffect, useState } from 'react';
import { baseCost, bpOf, levelOf, minCores, payableCost, quickAnyCores, trashSummonRule } from '@bs/engine';
import { cardName, playerLabel } from '../format';
import { db, flashPlayer, layoutRect, useGame, type MagicTiming, type PlayKind } from '../store';
import { CardFace } from './CardFace';
import { Core } from './Core';
import { BTN } from './Modal';

type SoulUse = 'keep' | 'pay' | 'place';

const TITLE: Record<PlayKind, string> = { summon: 'อัญเชิญ', deployNexus: 'วาง Nexus', useMagic: 'ใช้ Magic' };

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
  const { dispatch, closePlay, hover, setPlayCores } = useGame.getState();
  const playCores = useGame((s) => s.playCores);

  const card = state.cards[cardId]!;
  const player = card.owner;
  const p = state.players[player];
  const def = db.get(card.cardNo);
  // [Quick] ใน Flash timing: ใช้ Core จากรีเสิร์ฟเท่านั้น / [Soul Quick]: จ่ายด้วย Soul Core 1 ดวง
  const quickAb = kind === 'summon' && flashPlayer(state) === player ? def.abilities.find((a) => a.kind === 'quick') : undefined;
  const soulQuick = quickAb?.kind === 'quick' && !!quickAb.soul;
  const reserveSoul = p.reserve.find((id) => state.cores[id]!.isSoul);
  // อัญเชิญจากแทรช: คอสต์ตาม "ถือว่ามีคอสต์" ในแทรช และบางเอฟเฟกต์ต้องใช้ Soul Core ร่วมจ่าย
  const fromTrash = p.trashCards.includes(cardId);
  const mustSoul = fromTrash && !!trashSummonRule(state, db, player, cardId)?.soulPayment;
  const base = baseCost(state, db, cardId);
  const cost = soulQuick ? 0 : payableCost(state, db, player, def, base);
  const allowPlace = kind !== 'useMagic' && !braveOnto;
  // [Quick] + ไซเลนท์ฮิล: ใช้คอร์บนการ์ดในสนามได้ด้วย (ใช้คอร์ในรีเสิร์ฟก่อน)
  const fieldPool = quickAb && !soulQuick && quickAnyCores(state, db, player) ? p.field.flatMap((id) => state.cards[id]!.cores) : [];
  const normal = [...p.reserve, ...fieldPool].filter((id) => !state.cores[id]!.isSoul);
  const soul = soulQuick ? undefined : reserveSoul;

  // ตัวเลือกเลเวลที่จะวาง (จำนวน Core บนการ์ด)
  const levelChoices = allowPlace ? def.levels.map((l) => ({ level: l.level, need: l.cores, bp: l.bp })) : [{ level: 0, need: 0, bp: undefined }];
  const affordable = (need: number) => normal.length + (soul ? 1 : 0) >= cost + need;
  const firstOk = levelChoices.findIndex((l) => affordable(l.need));

  const [pick, setPick] = useState(Math.max(0, firstOk));
  const [soulUse, setSoulUse] = useState<SoulUse>(() => {
    const need = levelChoices[Math.max(0, firstOk)]!.need;
    if (mustSoul) return 'pay';
    return normal.length >= cost + need ? 'keep' : cost > 0 ? 'pay' : 'place';
  });
  // ปรับเอง = คลิก Core บนกระดาน (เก็บใน store ให้ Core บนกระดานแสดงวงสีและคลิกได้)
  const manual = !!playCores?.manual;
  const marks = manual ? playCores!.marks : {};

  const chosen = levelChoices[pick]!;
  const auto = autoAssign(normal, soul, cost, chosen.need, soulUse);

  // โหมดปรับเอง
  const manualPay = Object.keys(marks).filter((id) => marks[id] === 'pay');
  const manualPlace = Object.keys(marks).filter((id) => marks[id] === 'place');
  const min = allowPlace ? minCores(def) : 0;
  const payment = manual ? manualPay : auto.pay;
  const placement = manual ? manualPlace : auto.place;
  const soulPaid = payment.some((id) => state.cores[id]!.isSoul);
  const ok = (manual ? manualPay.length === cost && manualPlace.length >= min : auto.ok) && (!mustSoul || soulPaid);
  const level = allowPlace ? levelOf(def, placement.length) : undefined;

  // Core ที่คลิกปรับได้: Reserve + Core บนการ์ดในสนาม ([Quick] ใช้ได้แค่ Reserve เว้นแต่มีเอฟเฟกต์ให้ใช้ Core บนสนาม)
  const pool = quickAb && fieldPool.length === 0 ? p.reserve : [...p.reserve, ...p.field.flatMap((id) => state.cards[id]!.cores)];
  // แบบอัตโนมัติ: แสดง Core ที่จะจ่าย/วางบนกระดานทันที (คลิก Core ไหนก็ได้ = เริ่มปรับเองจากชุดนี้)
  const autoKey = [...auto.pay, '|', ...auto.place, '|', ...pool].join(',');
  useEffect(() => {
    if (manual) return;
    const m: Record<string, 'pay' | 'place'> = {};
    auto.pay.forEach((id) => (m[id] = 'pay'));
    auto.place.forEach((id) => (m[id] = 'place'));
    setPlayCores({ marks: m, manual: false, allowPlace, pool });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, manual]);
  useEffect(() => () => setPlayCores(null), [setPlayCores]);
  const backToAuto = () => playCores && setPlayCores({ ...playCores, manual: false });
  const used = new Set([...payment, ...placement]);
  const depletingNow = p.field.filter((id) => {
    const c = state.cards[id]!;
    const d = db.get(c.cardNo);
    return d.type !== 'nexus' && c.cores.some((core) => used.has(core)) && levelOf(d, c.cores.filter((core) => !used.has(core)).length) === 0;
  });

  const confirm = () => {
    if (kind === 'useMagic') dispatch({ type: 'useMagic', player, cardId, payment, timing });
    else if (braveOnto) dispatch({ type: 'summon', player, cardId, payment, placement: [], braveOnto });
    else if (soulQuick && reserveSoul) dispatch({ type: 'summon', player, cardId, payment: [reserveSoul], placement });
    else dispatch({ type: kind, player, cardId, payment, placement });
  };

  const soulOptions: { id: SoulUse; label: string; show: boolean }[] = [
    { id: 'keep', label: 'เก็บไว้ใน Reserve', show: !mustSoul },
    { id: 'pay', label: 'ใช้จ่ายคอสต์', show: cost > 0 },
    { id: 'place', label: 'วางบนการ์ดนี้', show: !mustSoul && allowPlace && chosen.need > 0 },
  ];

  // มุมสนามของผู้เล่น (เหมือนแผงอัญเชิญด้วยเอฟเฟกต์): ไม่บังกระดาน
  const mat = layoutRect(document.querySelector(`[data-mat="${player}"]`));
  const lower = !mat || mat.y + mat.h / 2 > innerHeight / 2;
  const left = mat ? mat.x + 150 : 16;
  const style = !mat ? { left, bottom: 16 } : lower ? { left, top: mat.y + 12 } : { left, top: mat.y + mat.h - 12, transform: 'translateY(-100%)' };
  const after =
    allowPlace && level !== undefined && level > 0 ? (def.type === 'nexus' ? `Lv${level}` : `Lv${level} · BP ${bpOf(def, placement.length).toLocaleString()}`) : null;

  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 right-[var(--sidebar)] z-[38]">
      <div className="hud-panel pointer-events-auto absolute flex w-[25rem] gap-3 rounded-xl p-3" style={style}>
        <div className="flex w-24 shrink-0 flex-col gap-1">
          <div className="h-34 w-24" onMouseEnter={() => hover(cardId)} onMouseLeave={() => hover(null)}>
            <CardFace def={def} level={level} />
          </div>
          {after && <div className="text-center text-[11px] font-black text-emerald-300">→ {after}</div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-slate-200">
          <div>
            <div className="text-[11px] font-bold text-emerald-300">
              {playerLabel(player)} · {braveOnto ? 'ร่วมร่าง' : TITLE[kind]}
              {timing && <span className="ml-1 text-yellow-300">[{timing === 'main' ? 'Main' : 'Flash'}]</span>}
              {quickAb && <span className="ml-1 text-emerald-200">[{soulQuick ? 'Soul Quick' : 'Quick'}]</span>}
              {fromTrash && <span className="ml-1 text-purple-300">[จากแทรช{mustSoul ? ' · ต้องใช้ Soul Core จ่าย' : ''}]</span>}
            </div>
            <div className="truncate text-sm font-black text-white">{def.name}</div>
            {braveOnto && <div className="truncate text-emerald-300">→ {cardName(state, braveOnto)}</div>}
          </div>
          <div>
            {soulQuick ? (
              <>
                จ่ายด้วย <b className="text-rose-300">Soul Core 1 ดวง</b> จากรีเสิร์ฟ{!reserveSoul && <span className="text-rose-400"> (ไม่มี)</span>}
              </>
            ) : (
              <>
                คอสต์ <b className="text-base text-rose-300">{cost}</b>
                {cost < base && <span className="text-slate-400"> (ลดจาก {base})</span>}
                {cost === base && fromTrash && base !== def.cost && <span className="text-slate-400"> (คอสต์ในแทรช)</span>}
                <span className="ml-2 text-slate-400">Reserve {p.reserve.length} ดวง</span>
              </>
            )}
          </div>

          {!manual && allowPlace && (
            <div className="flex flex-wrap gap-1">
              {levelChoices.map((l, i) => (
                <button
                  key={l.level}
                  type="button"
                  disabled={!affordable(l.need)}
                  onClick={() => setPick(i)}
                  title={`วาง Core ${l.need} ดวง${l.bp !== undefined ? ` · BP ${l.bp.toLocaleString()}` : ''}`}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-black transition disabled:opacity-30 ${i === pick ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                >
                  Lv{l.level} · {l.need}
                </button>
              ))}
            </div>
          )}

          {!manual && soul && (
            <div className="flex flex-wrap items-center gap-1">
              <Core coreId={soul} size="sm" noFlip />
              {soulOptions
                .filter((o) => o.show)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSoulUse(o.id)}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition ${soulUse === o.id ? 'bg-rose-400 text-slate-950' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  >
                    {o.label}
                  </button>
                ))}
            </div>
          )}

          {manual ? (
            <div>
              <span className={manualPay.length === cost ? 'font-bold text-rose-300' : 'text-rose-400'}>
                จ่าย {manualPay.length}/{cost}
              </span>
              {allowPlace && (
                <span className={`ml-2 ${manualPlace.length >= min ? 'font-bold text-emerald-300' : 'text-emerald-500'}`}>
                  วาง {manualPlace.length} (ขั้นต่ำ {min})
                </span>
              )}
            </div>
          ) : (
            !auto.ok && <div className="font-bold text-rose-300">Core ใน Reserve ไม่พอ: เลือก Lv ต่ำลง หรือคลิก Core บนการ์ดในสนามเพื่อดึงมาใช้</div>
          )}
          {depletingNow.length > 0 && <div className="font-bold text-rose-300">{depletingNow.map((id) => cardName(state, id)).join(', ')} จะสูญสลาย</div>}
          <div className="text-slate-400">
            คลิก Core บนกระดานเพื่อปรับ: ว่าง → <span className="text-rose-300">จ่าย</span>
            {allowPlace && (
              <>
                {' '}
                → <span className="text-emerald-300">วาง</span>
              </>
            )}{' '}
            → ว่าง{quickAb && fieldPool.length === 0 ? ' · [Quick] ใช้ได้เฉพาะ Core ใน Reserve' : ''}
          </div>

          <div className="mt-auto flex items-center gap-1.5">
            {manual && (
              <button type="button" onClick={backToAuto} className={`${BTN.ghost} !px-2 !py-1 text-xs`}>
                อัตโนมัติ
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={closePlay} className={`${BTN.secondary} !px-3 !py-1 text-xs`}>
              ยกเลิก
            </button>
            <button type="button" disabled={!ok || (soulQuick && !reserveSoul)} onClick={confirm} className={`${BTN.primary} !px-3 !py-1 text-xs`}>
              {braveOnto ? 'ร่วมร่าง' : TITLE[kind]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
