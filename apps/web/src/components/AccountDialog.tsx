/**
 * หน้าบัญชี (เปิดจากป้ายโปรไฟล์หน้าแรก): ล็อกอิน Google / Email · สมัคร · ลืมรหัสผ่าน · ชื่อ + รูปโปรไฟล์ · สถานะซิงก์ · ออกจากระบบ
 * อยู่นอกเกม จึงใช้หน้าต่าง (Modal) ได้
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isXRare } from '@bs/cards';
import { account, playerId, useAccount } from '../account/account';
import { cardArt } from '../assets';
import { db, useGame } from '../store';
import { BTN, Modal } from './Modal';

/** ภาพการ์ดตัดเฉพาะหน้า (รูปโปรไฟล์) */
export function AvatarImg({ cardNo, className = '' }: { cardNo: string; className?: string }) {
  const art = cardArt(cardNo);
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {art ? <img src={art} alt="" draggable={false} className="absolute top-[-18%] left-[-30%] w-[160%] max-w-none" /> : <div className="h-full w-full bg-slate-700" />}
    </div>
  );
}

const time = (t: number) => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/**
 * @param allowSyncNow แสดงปุ่ม "ซิงก์ตอนนี้" (เฉพาะเปิดจากหน้าไตเติล/Login: เจ้าของโปรเจกต์กำหนด · การซิงก์อัตโนมัติทำงานตามปกติทุกหน้า)
 */
export function AccountDialog({ onClose, fallbackAvatar, allowSyncNow }: { onClose: () => void; fallbackAvatar: string; allowSyncNow?: boolean }) {
  const { user, ready, error, avatar, backend } = useAccount();
  const [picking, setPicking] = useState(false);
  const shown = avatar || fallbackAvatar;
  // วางที่ body: ป้ายโปรไฟล์ที่เปิดหน้านี้ใช้ backdrop-blur ซึ่งทำให้ position: fixed ถูกจำกัดอยู่ในกรอบป้าย
  return createPortal(
    <Modal
      title={picking ? 'เลือกรูปโปรไฟล์' : user ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
      subtitle={backend === 'Firebase' ? undefined : 'โหมดทดสอบ: บัญชีจำลองในเครื่อง (ไม่ได้ใช้ Firebase)'}
      onClose={onClose}
    >
      {picking ? (
        <AvatarPicker
          current={shown}
          onPick={(no) => {
            account.setAvatar(no);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <>
          <ProfileEditor avatar={shown} onChangeAvatar={() => setPicking(true)} />
          {!ready ? <div className="text-sm text-slate-400">กำลังตรวจสอบบัญชี…</div> : user ? <SignedIn allowSyncNow={!!allowSyncNow} /> : <SignInForm />}
          {error && <div className="rounded-lg bg-rose-950/60 px-3 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-400/40">{error}</div>}
        </>
      )}
    </Modal>,
    document.body,
  );
}

/** ชื่อ + รูปโปรไฟล์ (ผู้เยี่ยมชมแก้ได้ เก็บแค่ในเครื่อง · ล็อกอินแล้ว = ซิงก์) */
function ProfileEditor({ avatar, onChangeAvatar }: { avatar: string; onChangeAvatar: () => void }) {
  const name = useGame((s) => s.playerName);
  const setName = useGame((s) => s.setPlayerName);
  const [draft, setDraft] = useState(name);
  // ล็อกอินแล้วได้ชื่อจากบัญชี: อัปเดตช่องกรอก
  useEffect(() => setDraft(name), [name]);
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={onChangeAvatar} className="group relative shrink-0" title="เปลี่ยนรูปโปรไฟล์">
        <AvatarImg cardNo={avatar} className="h-20 w-20 rounded-2xl ring-2 ring-yellow-300/80" />
        <span className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-black/70 py-0.5 text-center text-[11px] font-bold text-white opacity-80 group-hover:opacity-100">เปลี่ยนรูป</span>
      </button>
      <form
        className="flex min-w-0 flex-1 flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          setName(draft);
        }}
      >
        <label className="text-xs text-slate-400" htmlFor="acc-name">
          ชื่อผู้เล่น (ไม่เกิน 16 ตัวอักษร)
        </label>
        <div className="flex gap-2">
          <input
            id="acc-name"
            value={draft}
            maxLength={16}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setName(draft)}
            className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 text-base font-bold text-white ring-1 ring-white/15 outline-none focus:ring-yellow-300"
          />
          <button type="submit" className={BTN.secondary} disabled={draft.trim() === name}>
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

function SignedIn({ allowSyncNow }: { allowSyncNow: boolean }) {
  const { user, syncing, lastSync } = useAccount();
  if (!user) return null;
  const rows: [string, React.ReactNode][] = [
    [user.provider === 'google' ? 'Google' : 'อีเมล', <span className="truncate">{user.email ?? '—'}</span>],
    ['Player ID', playerId(user.uid)],
    ['ซิงก์ข้อมูล', <span className={syncing ? 'text-sky-300' : 'text-emerald-300'}>{syncing ? 'กำลังซิงก์…' : lastSync ? `ล่าสุด ${time(lastSync)}` : 'รอซิงก์'}</span>],
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-900/60 px-4 py-3 text-sm ring-1 ring-white/10">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className="min-w-0 truncate font-semibold text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2">
        {allowSyncNow && (
          <button type="button" className={BTN.secondary} onClick={() => void account.syncNow()} disabled={syncing}>
            ซิงก์ตอนนี้
          </button>
        )}
        <button type="button" className={`${BTN.ghost} ml-auto`} onClick={() => void account.signOut()} title="ข้อมูลในเครื่องนี้ยังอยู่">
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

/** ฟอร์มเข้าสู่ระบบ (หน้า Login ใช้ตัวนี้): Google / อีเมล · สมัคร · ลืมรหัสผ่าน */
export function SignInForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const go = async (f: () => Promise<boolean>, done?: string) => {
    setBusy(true);
    setNote(null);
    const ok = await f();
    setBusy(false);
    if (ok && done) setNote(done);
  };
  const mismatch = mode === 'up' && confirm !== '' && confirm !== password;
  const input = 'w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-sky-300';
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-300">ชื่อ รูปโปรไฟล์ เด็คที่จัดไว้ และการตั้งค่า เก็บไว้ในบัญชี ใช้ต่อได้ทุกเครื่อง</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void go(account.signInGoogle)}
        className="flex items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow transition hover:bg-slate-100 disabled:opacity-50"
      >
        <GoogleMark />
        เข้าสู่ระบบด้วย Google
      </button>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-white/10" />
        หรือใช้อีเมล
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex gap-1 rounded-lg bg-slate-900/70 p-1 text-sm font-bold">
        {(['in', 'up'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => (setMode(m), setNote(null))}
            className={`flex-1 rounded-md py-1.5 transition ${mode === m ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}
          >
            {m === 'in' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch) return;
          void go(() => (mode === 'in' ? account.signInEmail(email, password) : account.signUpEmail(email, password)));
        }}
      >
        <input className={input} type="email" autoComplete="email" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className={input}
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={mode === 'in' ? 'รหัสผ่าน' : 'รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'up' ? 6 : undefined}
        />
        {mode === 'up' && (
          <input className={input} type="password" autoComplete="new-password" placeholder="ยืนยันรหัสผ่าน" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        )}
        {mismatch && <div className="text-xs font-semibold text-rose-300">รหัสผ่านทั้งสองช่องไม่ตรงกัน</div>}
        <div className="flex items-center gap-2">
          <button type="submit" className={BTN.primary} disabled={busy || mismatch}>
            {busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
          {mode === 'in' && (
            <button
              type="button"
              className={BTN.ghost}
              disabled={busy}
              onClick={() => (email.trim() ? void go(() => account.resetPassword(email), `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email.trim()} แล้ว`) : setNote('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน"'))}
            >
              ลืมรหัสผ่าน
            </button>
          )}
        </div>
      </form>
      {note && <div className="text-sm text-emerald-300">{note}</div>}
    </div>
  );
}

/** เลือกรูปโปรไฟล์จากภาพการ์ดในเกม (X-Rare ขึ้นก่อน · ค้นหาตามชื่อ) */
function AvatarPicker({ current, onPick, onCancel }: { current: string; onPick: (cardNo: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const all = useMemo(
    () =>
      db
        .all()
        .filter((c) => cardArt(c.cardNo) && c.type !== 'magic')
        .sort((a, b) => Number(isXRare(b)) - Number(isXRare(a))),
    [],
  );
  const list = q.trim() ? all.filter((c) => c.name.includes(q.trim())) : all;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อการ์ด"
          className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-yellow-300"
        />
        <button type="button" className={BTN.ghost} onClick={onCancel}>
          ย้อนกลับ
        </button>
      </div>
      <div className="grid max-h-[50vh] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-7">
        {list.slice(0, 140).map((c) => (
          <button
            key={c.cardNo}
            type="button"
            title={c.name}
            onClick={() => onPick(c.cardNo)}
            className={`rounded-xl transition hover:scale-105 ${c.cardNo === current ? 'ring-2 ring-yellow-300' : 'ring-1 ring-white/10 hover:ring-white/40'}`}
          >
            <AvatarImg cardNo={c.cardNo} className="aspect-square w-full rounded-xl" />
          </button>
        ))}
      </div>
      {list.length === 0 && <div className="text-sm text-slate-400">ไม่พบการ์ดชื่อนี้</div>}
    </div>
  );
}

/** โลโก้ Google แบบ SVG (อีโมจิ/สัญลักษณ์พิเศษเป็นกล่องว่างบน Windows 7) */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
