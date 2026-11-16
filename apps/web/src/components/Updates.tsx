/**
 * อัปเดตแอป: แจ้งเตือนเมื่อมีเวอร์ชันใหม่ / หน้าต่าง "มีอะไรใหม่" / ป้ายเวอร์ชันบนหน้าหลัก
 */
import { useEffect, useState } from 'react';
import { APP_VERSION, CHANGELOG, type ChangelogEntry } from '../changelog';
import { useGame } from '../store';
import { applyUpdate, markChangelogSeen, pendingChangelog, useNewVersion } from '../version';
import { BTN, Modal } from './Modal';

/** วันที่แบบไทยสั้น ๆ: 16 พ.ย. 2569 */
function thaiDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="flex flex-col gap-4">
      {entries.map((e) => (
        <section key={e.version} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="rounded-md bg-sky-400 px-2 py-0.5 text-sm font-black text-slate-950">v{e.version}</span>
            {e.version === APP_VERSION && <span className="text-xs font-bold text-emerald-300">เวอร์ชันที่ใช้อยู่</span>}
            <span className="ml-auto text-xs text-slate-400">{thaiDate(e.date)}</span>
          </div>
          <ul className="flex flex-col gap-1 pl-1 text-sm leading-relaxed text-slate-200">
            {e.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** หน้าต่าง Changelog (all = ดูทุกเวอร์ชันจากป้ายเวอร์ชัน) */
export function ChangelogDialog({ entries, onClose, title }: { entries: ChangelogEntry[]; onClose: () => void; title: string }) {
  return (
    <Modal title={title} subtitle={`Battle Spirits Dual TH · เวอร์ชัน ${APP_VERSION}`} onClose={onClose}>
      <ChangelogList entries={entries} />
      <div className="flex justify-end">
        <button type="button" className={BTN.primary} onClick={onClose}>
          เข้าใจแล้ว
        </button>
      </div>
    </Modal>
  );
}

/** เปิดเวอร์ชันใหม่ครั้งแรก: เด้ง "มีอะไรใหม่" (ไม่เด้งกลางเกม รอจนออกจากกระดาน) */
export function WhatsNew() {
  const screen = useGame((s) => s.screen);
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  useEffect(() => {
    void pendingChangelog().then(setEntries);
  }, []);
  if (!entries || entries.length === 0 || screen === 'game') return null;
  return (
    <ChangelogDialog
      title="มีอะไรใหม่"
      entries={entries}
      onClose={() => {
        markChangelogSeen();
        setEntries([]);
      }}
    />
  );
}

/**
 * มีเวอร์ชันใหม่บนเว็บ: ป้ายแจ้งให้อัปเดต (กด "ภายหลัง" = ซ่อนจนกว่าจะมีเวอร์ชันที่ใหม่กว่านี้อีก)
 * กลางเกม: ป้ายเล็กใต้ปุ่มมุมซ้ายบน และถามก่อนโหลดใหม่ (เกมที่เล่นอยู่จะหาย)
 */
export function UpdateNotice() {
  const next = useNewVersion();
  const screen = useGame((s) => s.screen);
  const online = useGame((s) => s.online);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('bs-update-dismissed');
    } catch {
      return null;
    }
  });
  if (!next || dismissed === next) return null;
  const inGame = screen === 'game';
  const update = () => {
    if (inGame && !confirm(online ? 'อัปเดตตอนนี้จะออกจากห้องที่เล่นอยู่ อัปเดตเลยไหม?' : 'อัปเดตตอนนี้เกมที่เล่นค้างอยู่จะหายไป อัปเดตเลยไหม?')) return;
    void applyUpdate();
  };
  const later = () => {
    try {
      sessionStorage.setItem('bs-update-dismissed', next);
    } catch {
      /* ไม่มี storage: ซ่อนแค่ในหน้านี้ */
    }
    setDismissed(next);
  };

  if (inGame) {
    return (
      <div className="fixed top-14 left-2 z-[45] flex items-center gap-1 rounded-full border border-emerald-300/60 bg-slate-950/90 py-1 pr-1 pl-3 text-xs shadow-lg">
        <span className="font-bold text-emerald-200">มีเวอร์ชันใหม่ v{next}</span>
        <button type="button" onClick={update} className="rounded-full bg-emerald-400 px-2.5 py-0.5 font-black text-slate-950 hover:bg-emerald-300">
          อัปเดต
        </button>
        <button type="button" onClick={later} title="ภายหลัง" className="rounded-full px-1.5 text-slate-400 hover:text-white">
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl border-2 border-emerald-300/70 bg-slate-950/95 py-2.5 pr-2.5 pl-4 shadow-[0_10px_40px_rgba(0,0,0,0.6),0_0_24px_rgba(52,211,153,0.35)]">
      <div className="flex flex-col">
        <span className="text-sm font-black text-emerald-200">มีเวอร์ชันใหม่ v{next}</span>
        <span className="text-xs text-slate-300">ตอนนี้ใช้ v{APP_VERSION} · อัปเดตเพื่อเล่นออนไลน์กับเพื่อนได้ราบรื่น</span>
      </div>
      <button type="button" onClick={later} className={BTN.ghost}>
        ภายหลัง
      </button>
      <button type="button" onClick={update} className={BTN.primary}>
        อัปเดตเลย
      </button>
    </div>
  );
}

/** ป้ายเวอร์ชันบนหน้าหลัก: กดดู Changelog ทุกเวอร์ชัน */
export function VersionBadge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs text-slate-300 hover:border-sky-300/50 hover:text-white"
        title="ดูว่าแต่ละเวอร์ชันมีอะไรเปลี่ยนบ้าง"
      >
        v{APP_VERSION} · มีอะไรใหม่
      </button>
      {open && <ChangelogDialog title="บันทึกการเปลี่ยนแปลง" entries={CHANGELOG} onClose={() => setOpen(false)} />}
    </>
  );
}
