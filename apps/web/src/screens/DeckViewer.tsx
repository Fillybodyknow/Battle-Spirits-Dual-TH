import { useState } from 'react';
import { rarityOf, type TextEffect } from '@bs/cards';
import { braveText, COLOR_LABEL, RARITY_BADGE, TYPE_LABEL } from '../format';
import { DECKS, db, useGame, type DeckId } from '../store';
import { BackButton, CardArt, DeckTile, deckSize } from './shared';

/** ดูการ์ดในเด็ค: รายการเด็คทางซ้าย, การ์ดทั้งหมดตรงกลาง, รายละเอียดการ์ดทางขวา */
export function DeckViewer() {
  const setScreen = useGame((s) => s.setScreen);
  const deckView = useGame((s) => s.deckView);
  const [deck, setDeck] = useState<DeckId>(deckView);
  const entries = DECKS[deck].entries;
  const copies = entries.flatMap((e) => Array.from({ length: e.count }, (_, k) => ({ cardNo: e.cardNo, foil: e.foils?.[k] ?? null })));
  const [focus, setFocus] = useState<string>(entries[0]!.cardNo);
  const [focusIdx, setFocusIdx] = useState(0);
  const def = db.get(focus);
  const ids = Object.keys(DECKS) as DeckId[];

  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      <header className="flex items-center gap-6 pt-6">
        <BackButton onClick={() => setScreen('home')} />
        <div>
          <div className="text-xs tracking-[0.4em] text-sky-300">DECK</div>
          <div className="text-3xl font-black text-white italic">{DECKS[deck].label}</div>
        </div>
        <span className="text-sm text-slate-400">
          {deckSize(deck)} ใบ · {entries.length} ชนิด
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-5 p-6">
        <aside className="flex w-40 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
          {ids.map((id) => (
            <DeckTile
              key={id}
              id={id}
              small
              selected={deck === id}
              onClick={() => {
                setDeck(id);
                setFocus(DECKS[id].entries[0]!.cardNo);
                setFocusIdx(0);
              }}
            />
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3">
          {/* แสดงการ์ดทุกใบแยกกันแบบเรียงชิด (ไม่รวมเป็น ×N) */}
          <div className="grid grid-cols-10 gap-1.5">
            {copies.map(({ cardNo, foil }, i) => {
              const r = rarityOf(db.get(cardNo).rarity);
              const pick = () => {
                setFocus(cardNo);
                setFocusIdx(i);
              };
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={pick}
                  onClick={pick}
                  className={`relative rounded-md transition hover:z-10 hover:-translate-y-0.5 ${focusIdx === i ? 'z-10 ring-2 ring-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.55)]' : ''}`}
                >
                  <CardArt cardNo={cardNo} foil={foil} className="aspect-[0.686] w-full" />
                  {r && (
                    <span className={`absolute top-0.5 left-0.5 rounded px-1 text-[9px] leading-tight font-black shadow ${RARITY_BADGE[r.rank]}`} title={r.label}>
                      {r.code}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </main>

        <aside className="hud-panel flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto rounded-xl p-4">
          <CardArt cardNo={focus} className="mx-auto w-60 shadow-2xl" />
          <div>
            <div className="text-xl font-black text-white">{def.name}</div>
            {(() => {
              const r = rarityOf(def.rarity);
              return r ? <span className={`my-1 inline-block rounded px-1.5 text-xs font-black ${RARITY_BADGE[r.rank]}`}>{r.code} · {r.label}</span> : null;
            })()}
            <div className="text-xs text-slate-400">
              {TYPE_LABEL[def.type]} · {def.colors.map((c) => COLOR_LABEL[c]).join('/')} · คอสต์ {def.cost}
              {def.family.length > 0 && <> · {def.family.join(' / ')}</>}
            </div>
          </div>
          {(() => {
          const bt = braveText(def.braveCondition);
          if (!bt) return null;
          return (
            <div className="rounded-lg bg-teal-900/30 px-3 py-2 ring-1 ring-teal-400/30">
              <div className="mb-0.5 flex items-center gap-1">
                <span className="rounded bg-teal-600 px-1 text-[10px] font-bold text-white">Brave</span>
                <span className="text-[11px] font-bold text-teal-200">เงื่อนไขร่วมร่าง</span>
              </div>
              <p className="text-[15px] leading-relaxed text-teal-100">{bt.cond}</p>
              {bt.bonus && <p className="text-[15px] leading-relaxed text-sky-200">เอฟเฟกต์ติดตัวที่ให้ผู้ร่วมร่าง: {bt.bonus}</p>}
            </div>
          );
        })()}
          {def.levels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {def.levels.map((l) => (
                <span key={l.level} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                  Lv{l.level} · Core {l.cores}
                  {l.bp !== undefined && <> · BP {l.bp.toLocaleString()}</>}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {(def.effects as TextEffect[]).map((e, i) => (
              <p key={i} className="rounded-lg bg-black/30 p-2 text-sm leading-relaxed text-slate-200">
                <span className="mr-1 text-xs font-bold text-yellow-300">
                  {e.levels ? e.levels.map((l) => `[Lv${l}]`).join('') : e.timing === 'burst' ? '[Burst]' : e.keyword ? `Flash [${e.keyword}]` : e.timing ? `[${e.timing === 'main' ? 'Main' : 'Flash'}]` : ''}
                </span>
                {e.text}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
