import { useState } from 'react';
import type { TextEffect } from '@bs/cards';
import { COLOR_LABEL, TYPE_LABEL } from '../format';
import { DECKS, db, useGame, type DeckId } from '../store';
import { BackButton, CardArt, DeckTile, deckSize } from './shared';

/** ดูการ์ดในเด็ค: รายการเด็คทางซ้าย, การ์ดทั้งหมดตรงกลาง, รายละเอียดการ์ดทางขวา */
export function DeckViewer() {
  const setScreen = useGame((s) => s.setScreen);
  const deckView = useGame((s) => s.deckView);
  const [deck, setDeck] = useState<DeckId>(deckView);
  const entries = DECKS[deck].entries;
  const [focus, setFocus] = useState<string>(entries[0]!.cardNo);
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
              }}
            />
          ))}
        </aside>

        <main className="grid min-w-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4">
          {entries.map((e) => (
            <button
              key={e.cardNo}
              type="button"
              onMouseEnter={() => setFocus(e.cardNo)}
              onClick={() => setFocus(e.cardNo)}
              className={`relative rounded-xl transition hover:-translate-y-1 ${focus === e.cardNo ? 'ring-2 ring-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.5)]' : ''}`}
            >
              <CardArt cardNo={e.cardNo} className="aspect-[0.686] w-full" />
              <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-slate-950 px-2 py-0.5 text-sm font-black text-yellow-300 ring-1 ring-yellow-300/60">×{e.count}</span>
              {db.get(e.cardNo).rarity === 'X-Rare' && (
                <span className="absolute -top-1.5 -left-1.5 rounded bg-gradient-to-r from-amber-300 to-rose-400 px-1.5 text-[10px] font-black text-slate-950">X-RARE</span>
              )}
            </button>
          ))}
        </main>

        <aside className="hud-panel flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto rounded-xl p-4">
          <CardArt cardNo={focus} className="mx-auto w-60 shadow-2xl" />
          <div>
            <div className="text-xl font-black text-white">{def.name}</div>
            <div className="text-xs text-slate-400">
              {TYPE_LABEL[def.type]} · {def.colors.map((c) => COLOR_LABEL[c]).join('/')} · คอสต์ {def.cost}
              {def.family.length > 0 && <> · {def.family.join(' / ')}</>}
            </div>
          </div>
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
