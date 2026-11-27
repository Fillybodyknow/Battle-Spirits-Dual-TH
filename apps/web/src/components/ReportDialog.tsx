/**
 * แจ้งปัญหา / ข้อเสนอแนะ → ห้องใน Discord ผ่าน Webhook (ตั้งตอน build: ห้องละ 1 ตัว)
 *   VITE_REPORT_WEBHOOK_BUG = ห้อง "แจ้งบั๊ก" · VITE_REPORT_WEBHOOK_CARD = ห้อง "การ์ดทำงานผิด" · VITE_REPORT_WEBHOOK_IDEA = ห้อง "ข้อเสนอแนะ"
 *   (ประเภทที่ไม่ได้ตั้ง webhook = ไม่แสดงให้เลือก · ไม่ตั้งเลย = ซ่อนปุ่ม)
 * เว็บนี้ไม่มีเซิร์ฟเวอร์: URL ของ webhook อยู่ในโค้ดหน้าเว็บ → ปิดการ @ ทุกแบบ + จำกัดความถี่ต่อเครื่อง (โดนสแปม = ลบ webhook แล้วสร้างใหม่)
 * ห้องแบบ Forum: แต่ละรายงานเป็นกระทู้ของตัวเอง (thread_name) · ห้องข้อความธรรมดา: ส่งซ้ำโดยไม่ใส่ thread_name
 * ในเกม: แนบไฟล์สถานะเกม (game-state.json) ให้เปิดกระดานเดียวกันซ้ำได้
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { APP_VERSION } from '../changelog';
import { playerId, useAccount } from '../account/account';
import { formatEvent } from '../format';
import { useGame } from '../store';
import { Icon } from './Icon';
import { BTN, Modal } from './Modal';

const env = import.meta.env;
const ALL_CATEGORIES = ['แจ้งบั๊ก', 'การ์ดทำงานผิด', 'ข้อเสนอแนะ'] as const;
type Category = (typeof ALL_CATEGORIES)[number];
/** webhook ของแต่ละห้อง (ตรงกับห้องในหมวด "แจ้งปัญหา" ของ Discord) */
const WEBHOOKS: Record<Category, string> = {
  'แจ้งบั๊ก': (env.VITE_REPORT_WEBHOOK_BUG as string | undefined) ?? '',
  'การ์ดทำงานผิด': (env.VITE_REPORT_WEBHOOK_CARD as string | undefined) ?? '',
  'ข้อเสนอแนะ': (env.VITE_REPORT_WEBHOOK_IDEA as string | undefined) ?? '',
};
const CATEGORIES = ALL_CATEGORIES.filter((c) => WEBHOOKS[c].startsWith('https://'));
/** มี webhook ให้ส่งไหม (ไม่ตั้งเลย = ซ่อนปุ่ม) */
export const reportAvailable = CATEGORIES.length > 0;
const HINT: Record<Category, string> = {
  'แจ้งบั๊ก': 'หน้าเว็บค้าง / กดไม่ได้ / ภาพผิดปกติ / ออนไลน์หลุด',
  'การ์ดทำงานผิด': 'เอฟเฟกต์ไม่ทำงาน / ทำงานไม่ตรงข้อความการ์ด',
  'ข้อเสนอแนะ': 'อยากให้เพิ่มหรือปรับอะไร',
};
const COLOR: Record<Category, number> = { 'แจ้งบั๊ก': 0xfb923c, 'การ์ดทำงานผิด': 0xf87171, 'ข้อเสนอแนะ': 0x60a5fa };

/**
 * รหัสแท็กของห้อง Forum ใน Discord (ติดให้โพสต์ใหม่อัตโนมัติ · webhook รับเฉพาะรหัส ไม่รับชื่อ)
 * ว่าง = ไม่ติดแท็กนั้น · รหัสผิด/ลบแท็กไปแล้ว = ส่งใหม่แบบไม่ติดแท็ก (ไม่ให้แจ้งปัญหาไม่ได้เพราะแท็ก)
 */
const TAGS: Record<Category, { pending?: string; mobile?: string; online?: string }> = {
  // ห้อง "🐞┃แจ้งบั๊ก": รอตรวจ / มือถือ / ออนไลน์ (กำลังแก้ 1575758376762216579 · แก้แล้ว 1575758416411107398 = ทีมงานติดเอง)
  'แจ้งบั๊ก': { pending: '1575755883676311562', mobile: '1575758448782606417', online: '1575758485260472531' },
  // ห้อง "🃏┃การ์ดทำงานผิด": รอตรวจ (แก้แล้ว 1575759195851202560 · ตามกติกาแล้ว 1575759228512247958 = ทีมงานติดเอง)
  'การ์ดทำงานผิด': { pending: '1575759158236676208' },
  'ข้อเสนอแนะ': {},
};
const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
/** แท็กของโพสต์นี้: รอตรวจ + มือถือ (ส่งจากมือถือ/แท็บเล็ต) + ออนไลน์ (ส่งระหว่างเกมออนไลน์) */
function tagsFor(category: Category): string[] {
  const t = TAGS[category];
  const out = [t.pending, isMobile() ? t.mobile : undefined, useGame.getState().online ? t.online : undefined];
  return out.filter((x): x is string => !!x).slice(0, 5);
}
const MAX_TEXT = 1500;
/** ส่งได้ครั้งละห่างกันเท่านี้ต่อเครื่อง (ms) */
const COOLDOWN = 60_000;
const LAST_KEY = 'bs-report-at';

function lastSent(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** ข้อมูลเกมตอนนี้สำหรับแนบ (สถานะ + บันทึกเกมล่าสุด) */
function gameAttachment(): { json: string; summary: string } | null {
  const g = useGame.getState();
  if (g.screen !== 'game') return null;
  const s = g.state;
  const mode = g.online ? `ออนไลน์ ${g.online.code} (${g.online.me}${g.online.spectator ? ' ผู้ชม' : ''})` : g.botSeat ? 'ดวลกับบอท' : 'เครื่องเดียว';
  const log = s.log
    .slice(-80)
    .map((e) => formatEvent(e, s))
    .filter((x): x is string => !!x);
  const json = JSON.stringify({ version: APP_VERSION, at: new Date().toISOString(), mode, state: s }, null, 0);
  const summary = `${mode} · เทิร์น ${s.turn} · ${s.phase} · ตาของ ${s.turnPlayer}`;
  return { json: json + '\n', summary: summary + (log.length ? `\n\nบันทึกล่าสุด:\n${log.slice(-12).join('\n')}` : '') };
}

/** ข้อมูลแจ้งปัญหาแบบข้อความ (ปุ่ม "คัดลอกข้อมูลแจ้งปัญหา": ไว้วางในโพสต์ที่ผู้เล่นตั้งเองใน Discord พร้อมรูป/คลิป) */
function reportInfoText(): string {
  const user = useAccount.getState().user;
  const g = useGame.getState();
  const game = gameAttachment();
  return [
    `เวอร์ชัน: ${APP_VERSION}`,
    `ผู้เล่น: ${g.playerName || '-'}${user ? ` · ID ${playerId(user.uid)}` : ''}`,
    `อุปกรณ์: ${navigator.userAgent} · จอ ${window.innerWidth}×${window.innerHeight}`,
    ...(game ? [`เกม: ${game.summary.split('\n')[0]}`] : []),
  ].join('\n');
}

async function sendReport(category: Category, text: string, attachGame: boolean): Promise<void> {
  const user = useAccount.getState().user;
  const name = useGame.getState().playerName;
  const game = attachGame ? gameAttachment() : null;
  const firstLine = text.split('\n')[0]!.trim().slice(0, 60) || category;
  const embed = {
    title: `[${category}] ${firstLine}`.slice(0, 250),
    description: text.slice(0, MAX_TEXT),
    color: COLOR[category],
    fields: [
      { name: 'ผู้เล่น', value: `${name || '-'}${user ? ` · ID ${playerId(user.uid)}` : ''}`.slice(0, 1000), inline: true },
      { name: 'เวอร์ชัน', value: APP_VERSION, inline: true },
      { name: 'อุปกรณ์', value: `${navigator.userAgent.slice(0, 200)}\nจอ ${window.innerWidth}×${window.innerHeight}`, inline: false },
      ...(game ? [{ name: 'เกม', value: game.summary.slice(0, 1000), inline: false }] : []),
    ],
    timestamp: new Date().toISOString(),
  };
  const tags = tagsFor(category);
  const post = async (forum: boolean, withTags = true) => {
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        username: 'แจ้งปัญหา · Battle Spirits Dual TH',
        embeds: [embed],
        allowed_mentions: { parse: [] },
        ...(forum ? { thread_name: `[${category}] ${firstLine}`.slice(0, 100) } : {}),
        ...(forum && withTags && tags.length ? { applied_tags: tags } : {}),
      }),
    );
    if (game) form.append('files[0]', new Blob([game.json], { type: 'application/json' }), 'game-state.json');
    return fetch(`${WEBHOOKS[category]}?wait=true`, { method: 'POST', body: form });
  };
  let res = await post(true);
  // แท็กใช้ไม่ได้ (รหัสผิด / ถูกลบ): ส่งใหม่แบบไม่ติดแท็ก
  if (res.status === 400 && tags.length) res = await post(true, false);
  // ห้องข้อความธรรมดาไม่รับ thread_name: ส่งใหม่แบบไม่มี
  if (res.status === 400) res = await post(false);
  if (!res.ok) throw new Error(`Discord ตอบ ${res.status}`);
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    /* จำไม่ได้ก็ไม่เป็นไร */
  }
}

/** หน้าต่างแจ้งปัญหา */
export function ReportDialog({ onClose }: { onClose: () => void }) {
  const inGame = useGame((s) => s.screen === 'game');
  const [category, setCategory] = useState<Category>(() => {
    const want: Category = inGame ? 'การ์ดทำงานผิด' : 'แจ้งบั๊ก';
    return CATEGORIES.includes(want) ? want : CATEGORIES[0]!;
  });
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(inGame);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const copyInfo = async () => {
    try {
      await navigator.clipboard.writeText(reportInfoText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus('error');
      setErr('คัดลอกไม่ได้ (เบราว์เซอร์ไม่อนุญาต)');
    }
  };
  const wait = Math.ceil((COOLDOWN - (Date.now() - lastSent())) / 1000);
  const send = async () => {
    if (wait > 0) {
      setStatus('error');
      setErr(`ส่งได้อีกครั้งใน ${wait} วินาที`);
      return;
    }
    setStatus('sending');
    try {
      await sendReport(category, text.trim(), attach && inGame);
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setErr(`ส่งไม่สำเร็จ (${(e as Error).message}) · ลองใหม่อีกครั้ง หรือแจ้งใน Discord โดยตรง`);
    }
  };
  if (status === 'sent') {
    return (
      <Modal front title="ส่งเรื่องแล้ว ขอบคุณครับ" onClose={onClose}>
        <p className="text-sm text-slate-300">เรื่องนี้ขึ้นในห้อง "{category}" ใน Discord ของเกมแล้ว ถ้าอยากติดตามหรือคุยเพิ่ม เข้าไปที่ Discord ได้เลย</p>
        <div className="flex justify-end">
          <button type="button" className={BTN.primary} onClick={onClose}>
            ปิด
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal front title="แจ้งปัญหา / ข้อเสนอแนะ" subtitle="ส่งเข้าห้องแจ้งปัญหาใน Discord ของเกม" onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-sm font-bold transition ${
              category === c ? 'border-amber-300 bg-amber-400/20 text-amber-100' : 'border-white/20 bg-black/30 text-slate-300 hover:border-white/40'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="-mt-2 text-xs text-slate-400">{HINT[category]}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
        rows={6}
        autoFocus
        placeholder={category === 'การ์ดทำงานผิด' ? 'การ์ดใบไหน ทำอะไรอยู่ แล้วผลที่ได้ต่างจากที่ควรเป็นยังไง' : 'เล่าสิ่งที่เจอ ทำอะไรอยู่ตอนนั้น'}
        className="w-full resize-none rounded-lg border border-white/15 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none focus:border-sky-400"
      />
      <div className="flex items-center justify-between text-xs text-slate-400">
        {inGame ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            แนบสถานะเกมตอนนี้ (ช่วยให้แก้บั๊กได้เร็ว)
          </label>
        ) : (
          <span />
        )}
        <span>
          {text.length}/{MAX_TEXT}
        </span>
      </div>
      <p className="text-xs text-slate-500">ข้อมูลที่ส่งไปด้วย: ชื่อผู้เล่น, Player ID, เวอร์ชันแอป, ชนิดเบราว์เซอร์และขนาดจอ{inGame && attach ? ', สถานะเกมและบันทึกเกมล่าสุด' : ''}</p>
      {status === 'error' && <p className="text-sm text-rose-300">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        {/* โพสต์เองใน Discord (แนบรูป/คลิปได้): คัดลอกเวอร์ชัน อุปกรณ์ Player ID ไปวาง */}
        <button type="button" className={`${BTN.secondary} mr-auto`} onClick={() => void copyInfo()} title="สำหรับโพสต์เองใน Discord พร้อมรูปหรือคลิป">
          {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อมูลแจ้งปัญหา'}
        </button>
        <button type="button" className={BTN.ghost} onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className={BTN.primary} disabled={!text.trim() || status === 'sending'} onClick={() => void send()}>
          {status === 'sending' ? 'กำลังส่ง…' : 'ส่ง'}
        </button>
      </div>
    </Modal>
  );
}

/** ปุ่มแจ้งปัญหา (ซ่อนถ้าไม่ได้ตั้งค่า webhook) */
export function ReportButton({ className, label }: { className: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!reportAvailable) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="แจ้งปัญหา / ข้อเสนอแนะ">
        <Icon name="flag" className={label ? 'text-base' : undefined} />
        {label}
      </button>
      {/* portal ไป body: ปุ่มอยู่ในแถบเครื่องมือในเกม (fixed z-[45]) ถ้าไม่ย้ายออก หน้าต่างจะอยู่ใต้หน้าจั่ว/เอฟเฟกต์ */}
      {open && createPortal(<ReportDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
