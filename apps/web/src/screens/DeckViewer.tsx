import { useState } from 'react';
import { rarityOf, type TextEffect } from '@bs/cards';
import { braveText, COLOR_LABEL, RARITY_BADGE, TYPE_LABEL } from '../format';
import { db, useGame, type DeckId } from '../store';
import { deckChoices, deckInfo } from '../decks';
import { BackButton, CardArt, DeckTile, deckSize } from './shared';
import { CardDetail } from '../components/CardDetail';

/** ดูการ์ดในเด็ค: รายการเด็คทางซ้าย, การ์ดทั้งหมดตรงกลาง, รายละเอียดการ์ดทางขวา */
export function DeckViewer() {
  const setScreen = useGame((s) => s.setScreen);
  const deckView = useGame((s) => s.deckView);
  const [deck, setDeck] = useState<DeckId>(deckView);
  const entries = deckInfo(deck).entries;
  const copies = entries.flatMap((e) => Array.from({ length: e.count }, (_, k) => ({ cardNo: e.cardNo, foil: e.foils?.[k] ?? null })));
  const [focus, setFocus] = useState<string>(entries[0]?.cardNo ?? '');
  const [focusIdx, setFocusIdx] = useState(0);
  const ids = deckChoices();

  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      <header className="flex items-center gap-6 pt-6">
        <BackButton onClick={() => setScreen('home')} />
        <div>
          <div className="text-xs tracking-[0.4em] text-sky-300">DECK</div>
          <div className="text-3xl font-black text-white italic">{deckInfo(deck).label}</div>
        </div>
        <span className="text-sm text-slate-400">
          {deckSize(deck)} ใบ · {entries.length} ชนิด
        </span>
        <button
          type="button"
          className="ml-auto mr-6 rounded-lg bg-sky-600/80 px-4 py-2 text-sm font-bold text-white ring-1 ring-sky-300/50 hover:bg-sky-500"
          onClick={() => {
            // Starter Deck: เปิดหน้าจัดเด็คแบบคัดลอก / เด็คที่จัดเอง: แก้ไขเด็คนั้น
            useGame.setState({ deckView: deck });
            setScreen('builder');
          }}
        >
          {deckInfo(deck).custom ? 'แก้ไขเด็ค' : 'จัดเด็คใหม่'}
        </button>
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
                setFocus(deckInfo(id).entries[0]?.cardNo ?? '');
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

        {focus ? <CardDetail cardNo={focus} /> : <aside className="w-[360px] shrink-0" />}
      </div>
    </div>
  );
}
