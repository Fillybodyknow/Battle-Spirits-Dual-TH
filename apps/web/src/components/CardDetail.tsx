import { rarityOf, type TextEffect } from '@bs/cards';
import { braveText, COLOR_LABEL, RARITY_BADGE, TYPE_LABEL } from '../format';
import { db } from '../store';
import { CardArt } from '../screens/shared';

/** แผงรายละเอียดการ์ด (ภาพ, ระดับ, ประเภท/สี/คอสต์, เลเวล, เอฟเฟกต์) ใช้ในหน้าดูเด็คและหน้าจัดเด็ค */
export function CardDetail({ cardNo, className = 'w-[360px]' }: { cardNo: string; className?: string }) {
  const def = db.get(cardNo);
  const focus = cardNo;
  return (
    <aside className={`hud-panel flex ${className} shrink-0 flex-col gap-3 overflow-y-auto rounded-xl p-4`}>
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
              {e.whileBraved && <span className="text-teal-300">[ร่วมร่าง]</span>}
              {e.levels ? e.levels.map((l) => `[Lv${l}]`).join('') : e.timing === 'burst' ? '[Burst]' : e.keyword ? `Flash [${e.keyword}]` : e.flash ? '[Flash]' : e.timing ? `[${e.timing === 'main' ? 'Main' : 'Flash'}]` : ''}
            </span>
            {e.text}
          </p>
        ))}
      </div>
    </aside>
  );
}
