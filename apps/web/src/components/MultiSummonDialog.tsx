import { useState } from 'react';
import { bpOf, levelOf, minCores, type SummonPick } from '@bs/engine';
import { cardName, playerLabel } from '../format';
import { db, useGame } from '../store';
import { CardFace } from './CardFace';
import { Core } from './Core';
import { BTN, Modal } from './Modal';
import { SourceCard, type Mark } from './PlayDialog';

/** วิธีลงสนามของการ์ดที่เลือก: สปิริต (Core ตามที่วาง) หรือ Brave ร่วมร่าง */
type Plan = { mode: 'spirit' } | { mode: 'brave'; host: string };

/**
 * อัญเชิญการ์ดที่แสดงจากเด็คไม่จ่ายคอสต์ (คุวากะสเลเยอร์ / ชูริคาบุโตะ): เลือกทุกใบทีเดียว แล้วลงสนามพร้อมกัน
 * คลิกการ์ดเป้าหมาย แล้วคลิก Core จากรีเสิร์ฟหรือบนการ์ดในสนามเพื่อวางบนใบนั้น (คลิกซ้ำ = เอาออก)
 */
export function MultiSummonDialog() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const hover = useGame((s) => s.hover);
  const choice = state.choice;
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  /** Core → การ์ดเป้าหมายที่วาง */
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  if (choice?.kind !== 'multiSummon') return null;

  const player = choice.player;
  const p = state.players[player];
  const chosen = choice.revealed.filter((id) => plans[id]);
  const coresOf = (id: string) => Object.keys(assign).filter((c) => assign[c] === id);
  const free = () => {
    // Core ว่างในรีเสิร์ฟ: Core ธรรมดาก่อน Soul Core
    return [...p.reserve].filter((c) => !assign[c]).sort((a, b) => Number(state.cores[a]!.isSoul) - Number(state.cores[b]!.isSoul));
  };

  /** ปรับจำนวน Core บนเป้าหมายให้ได้ n ดวง: เพิ่มจากรีเสิร์ฟ / เอาที่วางทีหลังออก */
  const fill = (id: string, n: number, base = assign) => {
    const next = { ...base };
    const mine = Object.keys(next).filter((c) => next[c] === id);
    for (const c of mine.slice(n)) delete next[c];
    const pool = [...p.reserve].filter((c) => !next[c]).sort((a, b) => Number(state.cores[a]!.isSoul) - Number(state.cores[b]!.isSoul));
    for (let i = mine.length; i < n && pool.length > 0; i++) next[pool.shift()!] = id;
    return next;
  };

  const toggleCard = (id: string) => {
    if (!choice.candidates.includes(id)) return;
    if (plans[id]) {
      const next = { ...plans };
      delete next[id];
      setPlans(next);
      setAssign((a) => Object.fromEntries(Object.entries(a).filter(([, t]) => t !== id)));
      if (active === id) setActive(chosen.find((c) => c !== id) ?? null);
      return;
    }
    if (choice.max !== null && chosen.length >= choice.max) return;
    setPlans({ ...plans, [id]: { mode: 'spirit' } });
    setAssign((a) => fill(id, minCores(db.get(state.cards[id]!.cardNo)), a));
    setActive(id);
  };

  const clickCore = (coreId: string) => {
    if (!active || plans[active]?.mode !== 'spirit') return;
    setAssign((a) => {
      const next = { ...a };
      if (next[coreId] === active) delete next[coreId];
      else next[coreId] = active;
      return next;
    });
  };

  // เครื่องหมายบน Core: วางบนใบที่เลือกอยู่ = เขียว, วางบนใบอื่น = แดง
  const marks: Record<string, Mark> = {};
  for (const [c, t] of Object.entries(assign)) marks[c] = t === active ? 'place' : 'pay';

  const hostsFor = (braveId: string) => {
    const min = db.get(state.cards[braveId]!.cardNo).braveCondition?.minCost ?? 0;
    const taken = new Set(chosen.flatMap((id) => (id !== braveId && plans[id]!.mode === 'brave' ? [(plans[id] as { host: string }).host] : [])));
    return p.field.filter((id) => {
      const c = state.cards[id]!;
      const d = db.get(c.cardNo);
      return d.type === 'spirit' && d.cost >= min && c.braves.length === 0 && !taken.has(id);
    });
  };

  const valid = chosen.every((id) => plans[id]!.mode === 'brave' || coresOf(id).length >= minCores(db.get(state.cards[id]!.cardNo)));
  const confirm = () => {
    const summons: SummonPick[] = chosen.map((id) => {
      const pl = plans[id]!;
      return pl.mode === 'brave' ? { cardId: id, braveOnto: pl.host } : { cardId: id, cores: coresOf(id) };
    });
    choose({ summons });
  };
  const activeDef = active ? db.get(state.cards[active]!.cardNo) : null;
  const sources = p.field.filter((id) => state.cards[id]!.cores.length > 0);

  return (
    <Modal
      wide
      title="อัญเชิญไม่จ่ายคอสต์"
      subtitle={`${playerLabel(player)} · เอฟเฟกต์ของ ${cardName(state, choice.sourceId)} · ${choice.max === null ? 'เลือกได้กี่ใบก็ได้' : `เลือกได้สูงสุด ${choice.max} ใบ`} · ลงสนามพร้อมกัน`}
    >
      {/* การ์ดที่แสดงจากเด็ค: คลิกเพื่อเลือก/ยกเลิก */}
      <div className="flex flex-wrap justify-center gap-3">
        {choice.revealed.map((id) => {
          const can = choice.candidates.includes(id);
          const on = !!plans[id];
          return (
            <button
              key={id}
              type="button"
              disabled={!can}
              onClick={() => toggleCard(id)}
              onMouseEnter={() => hover(id)}
              onMouseLeave={() => hover(null)}
              className={`relative h-40 w-28 rounded-lg transition ${can ? 'cursor-pointer hover:-translate-y-1' : 'cursor-not-allowed'} ${
                on ? 'ring-4 ring-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.6)]' : can ? 'ring-2 ring-fuchsia-400/70' : ''
              }`}
            >
              <CardFace def={db.get(state.cards[id]!.cardNo)} />
              {!can && <div className="absolute inset-0 flex items-end justify-center rounded-lg bg-slate-950/65 pb-2 text-xs font-bold text-slate-300">ไม่ตรงเงื่อนไข</div>}
              {on ? (
                <div className="absolute inset-x-2 -top-2.5 rounded bg-yellow-300 py-0.5 text-center text-xs font-black text-slate-900">อัญเชิญ ✓</div>
              ) : (
                can && <div className="absolute inset-x-2 -bottom-2.5 rounded bg-fuchsia-500 py-0.5 text-center text-[11px] font-bold text-white">คลิกเพื่อเลือก</div>
              )}
            </button>
          );
        })}
      </div>

      {/* การ์ดที่จะอัญเชิญ: คลิกเพื่อเลือกเป็นเป้าหมายที่จะวาง Core */}
      {chosen.length > 0 && (
        <div className="flex flex-col gap-2">
          {chosen.map((id) => {
            const def = db.get(state.cards[id]!.cardNo);
            const pl = plans[id]!;
            const mine = coresOf(id);
            const lv = levelOf(def, mine.length);
            const min = minCores(def);
            const hosts = def.type === 'brave' ? hostsFor(id) : [];
            const isActive = active === id && pl.mode === 'spirit';
            return (
              <div
                key={id}
                onClick={() => setActive(id)}
                className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-lg p-2 transition ${
                  isActive ? 'bg-emerald-900/40 ring-2 ring-emerald-400' : 'bg-black/30 ring-1 ring-white/10 hover:ring-white/30'
                }`}
              >
                <div className="h-14 w-10 shrink-0">
                  <CardFace def={def} size="xs" level={pl.mode === 'spirit' ? lv : undefined} />
                </div>
                <div className="w-40 leading-tight">
                  <div className="truncate text-sm font-bold text-slate-100">{def.name}</div>
                  {pl.mode === 'spirit' ? (
                    <div className={`text-xs font-bold ${lv > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {lv > 0 ? `Lv${lv} · BP ${bpOf(def, mine.length).toLocaleString()}` : `ต้องวาง Core อย่างน้อย ${min} ดวง`}
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-300">ร่วมร่าง · ไม่วาง Core</div>
                  )}
                </div>
                {(hosts.length > 0 || pl.mode === 'brave') && (
                  <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <Choice
                      on={pl.mode === 'spirit'}
                      onClick={() => {
                        setPlans({ ...plans, [id]: { mode: 'spirit' } });
                        setAssign((a) => fill(id, min, a));
                        setActive(id);
                      }}
                    >
                      ลงเป็นสปิริต
                    </Choice>
                    {hosts.map((h) => (
                      <Choice
                        key={h}
                        on={pl.mode === 'brave' && pl.host === h}
                        onClick={() => {
                          setPlans({ ...plans, [id]: { mode: 'brave', host: h } });
                          setAssign((a) => Object.fromEntries(Object.entries(a).filter(([, t]) => t !== id)));
                        }}
                      >
                        ร่วมร่างกับ {cardName(state, h)}
                      </Choice>
                    ))}
                  </div>
                )}
                {pl.mode === 'spirit' && (
                  <>
                    <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
                      {mine.length === 0 ? (
                        <span className="text-[11px] text-slate-500">ยังไม่มี Core</span>
                      ) : (
                        mine.map((c) => <Core key={c} coreId={c} size="sm" onClick={() => setAssign((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== c)))} />)
                      )}
                    </div>
                    <div className="ml-auto flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                      {def.levels.map((l) => (
                        <Choice key={l.level} on={lv === l.level} onClick={() => (setAssign((a) => fill(id, l.cores, a)), setActive(id))}>
                          Lv{l.level}
                        </Choice>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* แหล่ง Core: รีเสิร์ฟ + การ์ดบนสนามของเรา */}
      {chosen.some((id) => plans[id]!.mode === 'spirit') && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-400">
            {activeDef && plans[active!]?.mode === 'spirit' ? (
              <>
                คลิก Core เพื่อวางบน <b className="text-emerald-300">{activeDef.name}</b> · คลิกซ้ำเพื่อเอาออก ·{' '}
                <span className="text-emerald-300">เขียว</span> = ใบนี้, <span className="text-rose-300">แดง</span> = ใบอื่น (คลิกเพื่อย้ายมาใบนี้)
              </>
            ) : (
              'คลิกแถวการ์ดด้านบนเพื่อเลือกใบที่จะวาง Core'
            )}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-black/25 p-1.5">
            <span className="w-24 shrink-0 text-sm font-semibold text-slate-300">Reserve</span>
            <div className="flex flex-wrap gap-1">
              {p.reserve.length === 0 && <span className="text-xs text-slate-500">ว่าง</span>}
              {p.reserve.map((c) => (
                <Core key={c} coreId={c} size="lg" mark={marks[c] ?? null} onClick={() => clickCore(c)} />
              ))}
            </div>
            <span className="ml-auto text-xs text-slate-400">เหลือ {free().length} ดวง</span>
          </div>
          {sources.map((id) => (
            <SourceCard key={id} cardId={id} marks={marks} onCore={clickCore} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {!valid && <span className="text-sm text-rose-300">ทุกใบที่ลงเป็นสปิริตต้องมี Core ถึงเลเวลต่ำสุด</span>}
        <span className="flex-1" />
        <span className="text-xs text-slate-400">ใบที่ไม่ได้เลือกไว้ใต้สุดเด็ค</span>
        <button type="button" disabled={!valid} onClick={confirm} className={BTN.primary}>
          {chosen.length > 0 ? `อัญเชิญ ${chosen.length} ใบ` : 'ไม่อัญเชิญ'}
        </button>
      </div>
    </Modal>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs transition ${on ? 'border-yellow-300 bg-yellow-300 font-bold text-slate-900' : 'border-slate-600 text-slate-300 hover:border-slate-400'}`}
    >
      {children}
    </button>
  );
}
