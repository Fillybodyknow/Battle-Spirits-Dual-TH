/**
 * หน้าตาของ "ดาวน์โหลดข้อมูลเกมทั้งหมด" (ระบบอยู่ที่ src/gameData.ts)
 *  - GameDataTab: แท็บ "ข้อมูลเกม" ในหน้าต่างตั้งค่า
 *  - GameDataAsk: การ์ดชวนดาวน์โหลดครั้งแรก (หน้าหลัก)
 *  - GameDataPill: ป้ายความคืบหน้าเล็ก ๆ ระหว่างโหลด (เล่นต่อได้ระหว่างนั้น)
 */
import { useState } from 'react';
import {
  clearGameData,
  dismissGameDataAsk,
  downloadGameData,
  formatBytes,
  pauseGameData,
  shouldAskGameData,
  useGameData,
  type GameData,
} from '../gameData';
import { useGame } from '../store';
import { Icon } from './Icon';
import { BTN } from './Modal';

const pct = (s: GameData) => (s.total ? Math.floor((s.have / s.total) * 100) : 0);

function Bar({ s }: { s: GameData }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${s.status === 'complete' ? 'bg-emerald-400' : 'bg-sky-400'}`}
        style={{ width: `${pct(s)}%` }}
      />
    </div>
  );
}

export function GameDataTab() {
  const s = useGameData();
  const [confirmClear, setConfirmClear] = useState(false);
  if (s.status === 'unsupported') {
    return (
      <p className="py-3 text-sm text-slate-400">
        เบราว์เซอร์นี้ (หรือโหมดทดสอบ) ดาวน์โหลดข้อมูลเกมเก็บไว้ไม่ได้ · เกมจะโหลดภาพและเสียงทีละไฟล์ตอนใช้งานตามปกติ
      </p>
    );
  }
  const left = Math.max(0, s.total - s.have);
  const statusText =
    s.status === 'checking'
      ? 'กำลังตรวจสอบ...'
      : s.status === 'complete'
        ? 'ดาวน์โหลดครบแล้ว · เล่นออฟไลน์ได้'
        : s.status === 'downloading'
          ? `กำลังดาวน์โหลด ${pct(s)}%`
          : s.status === 'paused'
            ? 'หยุดไว้ชั่วคราว'
            : s.status === 'error'
              ? 'ดาวน์โหลดไม่สำเร็จ'
              : s.have > 0
                ? 'โหลดไว้บางส่วน (ภาพที่เคยเปิดดู)'
                : 'ยังไม่ได้ดาวน์โหลด';
  return (
    <div className="flex flex-col gap-4 py-3">
      <section className="flex flex-col gap-2 rounded-lg bg-black/25 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-slate-100">ข้อมูลเกมทั้งหมด</span>
          <span className="font-mono text-xs text-slate-300">
            {formatBytes(s.have)} / {formatBytes(s.total)}
          </span>
        </div>
        <Bar s={s} />
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={s.status === 'error' ? 'text-rose-300' : s.status === 'complete' ? 'text-emerald-300' : 'text-slate-400'}>
            {statusText}
            {s.status !== 'complete' && s.total > 0 && ` · ${s.haveFiles}/${s.files} ไฟล์`}
          </span>
        </div>
        {s.error && <span className="text-xs text-rose-300">{s.error}</span>}
        <p className="text-xs text-slate-400">
          ภาพการ์ดทุกใบ เสียง และเพลง เก็บไว้ในเครื่อง ({formatBytes(s.total)}) → เปิดการ์ดไหนก็ขึ้นทันที และเล่นแบบไม่ต่อเน็ตได้ (ยกเว้นออนไลน์)
          · เวอร์ชันใหม่มีการ์ดเพิ่ม จะโหลดเฉพาะส่วนที่เพิ่มให้เอง · แนะนำใช้ Wi-Fi
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {s.status === 'downloading' ? (
            <button type="button" className={BTN.secondary} onClick={pauseGameData}>
              หยุดชั่วคราว
            </button>
          ) : (
            s.status !== 'complete' &&
            s.status !== 'checking' && (
              <button type="button" className={`${BTN.primary} inline-flex items-center gap-1.5`} onClick={() => void downloadGameData()}>
                <Icon name="download" />
                {s.status === 'paused' || s.status === 'error' || (s.optIn && s.have > 0) ? 'ดาวน์โหลดต่อ' : `ดาวน์โหลด (${formatBytes(left)})`}
              </button>
            )
          )}
        </div>
      </section>
      <section className="flex flex-col gap-1 rounded-lg bg-black/25 p-3 text-xs text-slate-400">
        <span className="text-sm font-bold text-slate-100">ที่เก็บข้อมูล</span>
        {s.free !== null && <span>พื้นที่ที่เว็บนี้ใช้ได้อีก ~{formatBytes(s.free)}</span>}
        <span>
          {s.persisted
            ? 'เบราว์เซอร์จะเก็บข้อมูลไว้ถาวร (ไม่ลบเองตอนเครื่องที่เก็บข้อมูลใกล้เต็ม)'
            : 'เบราว์เซอร์อาจลบข้อมูลที่โหลดไว้เองถ้าเครื่องที่เก็บข้อมูลใกล้เต็ม (ติดตั้งเป็นแอปช่วยให้เก็บได้นานขึ้น) · ถูกลบก็แค่โหลดใหม่'}
        </span>
        {(s.have > 0 || s.optIn) && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {confirmClear ? (
              <>
                <span className="text-rose-200">ลบข้อมูลที่โหลดไว้ทั้งหมด?</span>
                <button type="button" className={BTN.ghost} onClick={() => setConfirmClear(false)}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`${BTN.secondary} text-rose-200`}
                  onClick={() => {
                    setConfirmClear(false);
                    void clearGameData();
                  }}
                >
                  ลบ
                </button>
              </>
            ) : (
              <button type="button" className={BTN.ghost} onClick={() => setConfirmClear(true)}>
                ลบข้อมูลที่ดาวน์โหลด
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** ชวนดาวน์โหลดครั้งแรก (มุมขวาล่างของหน้าหลัก ไม่บังเมนู) */
export function GameDataAsk() {
  const s = useGameData();
  const [hidden, setHidden] = useState(false);
  if (hidden || !shouldAskGameData(s)) return null;
  const close = () => {
    dismissGameDataAsk();
    setHidden(true);
  };
  return (
    <div className="fixed right-3 bottom-3 z-[60] flex w-[300px] flex-col gap-2 rounded-xl bg-slate-900/95 p-3 shadow-2xl ring-1 ring-sky-400/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-black text-sky-200">
        <Icon name="download" />
        ดาวน์โหลดข้อมูลเกม
      </div>
      <p className="text-xs text-slate-300">
        โหลดภาพการ์ด เสียง และเพลงทั้งหมด ({formatBytes(Math.max(0, s.total - s.have))}) เก็บไว้ในเครื่อง → การ์ดขึ้นทันที เล่นออฟไลน์ได้ ·
        เล่นต่อได้ระหว่างโหลด · แนะนำใช้ Wi-Fi
      </p>
      <p className="text-[11px] text-slate-500">ทำทีหลังได้ที่ ตั้งค่า → ข้อมูลเกม</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN.ghost} onClick={close}>
          ภายหลัง
        </button>
        <button
          type="button"
          className={BTN.primary}
          onClick={() => {
            setHidden(true);
            void downloadGameData();
          }}
        >
          ดาวน์โหลด
        </button>
      </div>
    </div>
  );
}

/** ป้ายความคืบหน้าระหว่างดาวน์โหลด (ไม่แสดงในเกม: กันบังกระดาน) */
export function GameDataPill() {
  const s = useGameData();
  const inGame = useGame((g) => g.screen === 'game');
  if (inGame || s.status !== 'downloading') return null;
  return (
    <div className="pointer-events-none fixed bottom-2 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-sky-200 shadow-lg ring-1 ring-sky-400/30">
      <Icon name="download" />
      ดาวน์โหลดข้อมูลเกม {pct(s)}%
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700">
        <span className="block h-full bg-sky-400" style={{ width: `${pct(s)}%` }} />
      </span>
    </div>
  );
}
