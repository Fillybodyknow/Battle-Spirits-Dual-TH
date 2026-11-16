/**
 * หน้าต่างตั้งค่าแบบเกม PC: แท็บ กราฟิก / เสียง / การเล่น
 * เปิดได้ทั้งจากหน้าหลักและในเกม · ของที่ใช้เฉพาะในเกม (เลือกเด็ค, seed, ออกจากห้อง) ส่งเข้ามาทาง playExtra
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resetGfx, setComfort, setEffect, setQuality, useGfx, type Quality } from '../gfx';
import { setSfx, sfx, sfxSettings } from '../sfx';
import { useGame, type CutInMode } from '../store';
import { setPrefs, usePrefs, type HandLayout, type HandSort, type PlayMode } from '../prefs';
import { BTN, Modal } from './Modal';

type Tab = 'graphics' | 'sound' | 'play';
const TABS: { id: Tab; label: string }[] = [
  { id: 'graphics', label: 'กราฟิก' },
  { id: 'sound', label: 'เสียง' },
  { id: 'play', label: 'การเล่น' },
];

/** ปุ่มเลือกแบบแบ่งช่อง */
function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={`flex shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1 text-xs font-bold transition ${o.v === value ? 'bg-sky-400 text-slate-950' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** แถวตัวเลือก: ชื่อ + คำอธิบาย + ผลต่อความลื่น ทางซ้าย ตัวเลือกทางขวา */
function Row({ title, hint, cost, children }: { title: string; hint?: string; cost?: 'สูง' | 'กลาง' | 'ต่ำ'; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-sm text-slate-100">
          {title}
          {cost && (
            <span
              title="ผลต่อความลื่นของเครื่อง (ปิด/ลดตัวที่ผลสูงก่อน ถ้าเครื่องกระตุก)"
              className={`rounded px-1.5 text-[10px] font-bold ${cost === 'สูง' ? 'bg-rose-500/25 text-rose-200' : cost === 'กลาง' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-600/40 text-slate-300'}`}
            >
              กินเครื่อง: {cost}
            </span>
          )}
        </span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="mb-1 text-xs font-black tracking-widest text-sky-300/90">{title}</h3>
      <div className="rounded-lg bg-black/25 px-3">{children}</div>
    </section>
  );
}

const QUALITY: { v: Quality; label: string }[] = [
  { v: 'auto', label: 'อัตโนมัติ' },
  { v: 'low', label: 'ต่ำ' },
  { v: 'medium', label: 'กลาง' },
  { v: 'high', label: 'สูง' },
  { v: 'custom', label: 'กำหนดเอง' },
];

function GraphicsTab() {
  const { settings, effects, autoPreset } = useGfx();
  const animations = useGame((s) => s.animations);
  const cutIn = useGame((s) => s.cutIn);
  const { toggleAnimations, setCutIn } = useGame.getState();
  const qualityHint =
    settings.quality === 'auto'
      ? `เลือกให้ตามความแรงเครื่อง · ตอนนี้ใช้ชุด "${autoPreset === 'low' ? 'ต่ำ' : 'สูง'}"`
      : settings.quality === 'custom'
        ? 'ตั้งแต่ละตัวเลือกเอง'
        : 'ชุดสำเร็จ · แก้ตัวเลือกด้านล่างเมื่อไหร่ = กำหนดเอง';
  return (
    <div className="flex flex-col gap-4">
      <Section title="คุณภาพกราฟิก">
        <Row title="ชุดคุณภาพ" hint={qualityHint}>
          <Segmented value={settings.quality} options={QUALITY} onChange={setQuality} />
        </Row>
      </Section>

      <Section title="เอฟเฟกต์ตกแต่ง">
        <Row title="ฉากหลังเคลื่อนไหว" hint="แสงออโรร่าและอนุภาคลอยด้านหลังกระดาน" cost="สูง">
          <Segmented value={effects.bgMotion ? 'on' : 'off'} options={[{ v: 'on', label: 'เปิด' }, { v: 'off', label: 'นิ่ง' }]} onChange={(v) => setEffect('bgMotion', v === 'on')} />
        </Row>
        <Row title="กรอบสนามตาผู้เล่น" hint="แสงวิ่งรอบสนามฝั่งที่ถือเทิร์น และแสงกวาดบนสนาม" cost="กลาง">
          <Segmented value={effects.matMotion ? 'on' : 'off'} options={[{ v: 'on', label: 'เคลื่อนไหว' }, { v: 'off', label: 'นิ่ง' }]} onChange={(v) => setEffect('matMotion', v === 'on')} />
        </Row>
        <Row title="แสงเรืองและปุ่มกระพริบ" hint="การ์ดที่ใช้ได้/เป้าหมาย/ปุ่มหลัก · นิ่ง = แสงยังอยู่แต่ไม่กระพริบ" cost="สูง">
          <Segmented value={effects.glowPulse ? 'on' : 'off'} options={[{ v: 'on', label: 'กระพริบ' }, { v: 'off', label: 'นิ่ง' }]} onChange={(v) => setEffect('glowPulse', v === 'on')} />
        </Row>
        <Row title="ฟอยการ์ด" hint="ประกายบนการ์ดฟอยในหน้าดูเด็ค/จัดเด็ค" cost="กลาง">
          <Segmented
            value={effects.foil}
            options={[
              { v: 'anim', label: 'เคลื่อนไหว' },
              { v: 'static', label: 'นิ่ง' },
              { v: 'off', label: 'ปิด' },
            ]}
            onChange={(v) => setEffect('foil', v)}
          />
        </Row>
        <Row title="เบลอพื้นหลังหน้าต่าง" hint="หน้าต่าง/แผงที่ลอยอยู่เบลอสิ่งที่อยู่ข้างหลัง" cost="สูง">
          <Segmented value={effects.blur ? 'on' : 'off'} options={[{ v: 'on', label: 'เปิด' }, { v: 'off', label: 'ปิด' }]} onChange={(v) => setEffect('blur', v === 'on')} />
        </Row>
      </Section>

      <Section title="แอนิเมชันเกม">
        <Row title="แอนิเมชันเกม" hint="ป้ายสเต็ป, cut-in อัญเชิญ, ป๊อปอัปเอฟเฟกต์, ฉากต่อสู้">
          <Segmented value={animations ? 'on' : 'off'} options={[{ v: 'on', label: 'เปิด' }, { v: 'off', label: 'ปิด' }]} onChange={(v) => v === 'on' !== animations && toggleAnimations()} />
        </Row>
        <Row title="Cut-in การ์ด X" hint="ฉากเต็มจอตอนอัญเชิญการ์ดระดับ X">
          <Segmented
            value={cutIn}
            disabled={!animations}
            options={[
              { v: 'first' as CutInMode, label: 'ครั้งแรก' },
              { v: 'always' as CutInMode, label: 'ทุกครั้ง' },
              { v: 'off' as CutInMode, label: 'ปิด' },
            ]}
            onChange={setCutIn}
          />
        </Row>
        <Row title="จอสั่น" hint="ตอนการ์ดลงสนาม การ์ดปะทะ และ Final Blow">
          <Segmented
            value={settings.shake}
            options={[
              { v: 'on', label: 'ปกติ' },
              { v: 'light', label: 'เบา' },
              { v: 'off', label: 'ปิด' },
            ]}
            onChange={(v) => setComfort({ shake: v })}
          />
        </Row>
        <Row title="แสงวาบเต็มจอ" hint="ลดความจ้าของแสงวาบ (สบายตา / ไวต่อแสง)">
          <Segmented value={settings.flash} options={[{ v: 'on', label: 'ปกติ' }, { v: 'low', label: 'ลด' }]} onChange={(v) => setComfort({ flash: v })} />
        </Row>
      </Section>

      <Section title="หน้าจอ">
        <Row title="แสดง FPS" hint="ตัวเลขเฟรมต่อวินาทีที่ขอบขวาของจอ (ใช้บอกอาการกระตุก)">
          <Segmented value={settings.showFps ? 'on' : 'off'} options={[{ v: 'off', label: 'ปิด' }, { v: 'on', label: 'เปิด' }]} onChange={(v) => setComfort({ showFps: v === 'on' })} />
        </Row>
      </Section>

      <div className="flex justify-end">
        <button type="button" className={BTN.ghost} onClick={() => confirm('คืนค่ากราฟิกทั้งหมดเป็นค่าเริ่มต้น?') && resetGfx()}>
          คืนค่าเริ่มต้น
        </button>
      </div>
    </div>
  );
}

function SoundTab() {
  const [sound, setSound] = useState(sfxSettings());
  const update = (next: Partial<typeof sound>) => {
    setSfx(next);
    setSound(sfxSettings());
  };
  return (
    <Section title="เสียง">
      <Row title="เสียงประกอบ (SFX)">
        <Segmented value={sound.on ? 'on' : 'off'} options={[{ v: 'on', label: 'เปิด' }, { v: 'off', label: 'ปิด' }]} onChange={(v) => update({ on: v === 'on' })} />
      </Row>
      <Row title="ความดัง" hint={`${Math.round(sound.volume * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sound.volume}
          disabled={!sound.on}
          onChange={(e) => update({ volume: Number(e.target.value) })}
          onPointerUp={() => sfx('activate')}
          className="w-44 accent-sky-400 disabled:opacity-40"
          aria-label="ความดังเสียง"
        />
      </Row>
    </Section>
  );
}

function PlayTab({ extra }: { extra?: React.ReactNode }) {
  const online = useGame((s) => s.online);
  const autoPass = useGame((s) => s.autoPass);
  const hideIdleHand = useGame((s) => s.hideIdleHand);
  const fixedView = useGame((s) => s.fixedView);
  const { toggleAutoPass, toggleHideIdleHand, toggleFixedView } = useGame.getState();
  const p = usePrefs();
  const onOff = [
    { v: 'on', label: 'เปิด' },
    { v: 'off', label: 'ปิด' },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      {!online && (
        <Section title="เล่นเครื่องเดียว">
          <Row title="Auto Pass" hint="Pass/ไม่ป้องกันให้เองเมื่อไม่มีการ์ดหรือสปิริตที่ใช้ได้">
            <Segmented value={autoPass ? 'on' : 'off'} options={[...onOff]} onChange={(v) => v === 'on' !== autoPass && toggleAutoPass()} />
          </Row>
          <Row title="ซ่อนมือฝ่ายที่ไม่ได้ตัดสินใจ" hint="คว่ำมือของคนที่ไม่ได้ถึงตา (เล่นสองคนเครื่องเดียว)">
            <Segmented value={hideIdleHand ? 'on' : 'off'} options={[...onOff]} onChange={(v) => v === 'on' !== hideIdleHand && toggleHideIdleHand()} />
          </Row>
          <Row title="มุมมองคงที่" hint="ผู้เล่น 1 อยู่ด้านล่างเสมอ (ปิด = ฝั่งที่ถือเทิร์นอยู่ล่าง)">
            <Segmented value={fixedView ? 'on' : 'off'} options={[...onOff]} onChange={(v) => v === 'on' !== fixedView && toggleFixedView()} />
          </Row>
        </Section>
      )}
      <Section title="การโจมตี">
        <Row title="ยืนยันก่อนโจมตี" hint='กดสปิริตแล้วถามก่อน · กด "โจมตี" หรือคลิกสปิริตตัวเดิมอีกครั้งเพื่อยืนยัน'>
          <Segmented value={p.confirmAttack ? 'on' : 'off'} options={[...onOff]} onChange={(v) => setPrefs({ confirmAttack: v === 'on' })} />
        </Row>
      </Section>
      <Section title="การ์ดในมือ">
        <Row title="เรียงการ์ด" hint="จัดเอง = ลากการ์ดไปวางบนใบอื่นในมือ (หรือปุ่มย้ายในเมนูการ์ด)">
          <Segmented
            value={p.handSort}
            options={[
              { v: 'draw' as HandSort, label: 'ตามที่ได้มา' },
              { v: 'cost' as HandSort, label: 'คอสต์' },
              { v: 'color' as HandSort, label: 'สี' },
              { v: 'type' as HandSort, label: 'ประเภท' },
              { v: 'manual' as HandSort, label: 'จัดเอง' },
            ]}
            onChange={(v) => setPrefs({ handSort: v })}
          />
        </Row>
        <Row title="การจับการ์ด" hint="พัด = เอียงโค้ง · แถวตรง = เรียงซ้อนกัน · กาง = ไม่ซ้อน เห็นทั้งใบ (มือยาวเลื่อนซ้าย/ขวาได้)">
          <Segmented
            value={p.handLayout}
            options={[
              { v: 'fan' as HandLayout, label: 'พัด' },
              { v: 'row' as HandLayout, label: 'แถวตรง' },
              { v: 'spread' as HandLayout, label: 'กาง' },
            ]}
            onChange={(v) => setPrefs({ handLayout: v })}
          />
        </Row>
        <Row title="หยิบการ์ดไปเล่น" hint="คลิกเดียว = เปิดแผงเล่นการ์ดทันทีถ้ามีทางเล่นทางเดียว · ลากไปที่สนามได้ทุกแบบ">
          <Segmented
            value={p.playMode}
            options={[
              { v: 'menu' as PlayMode, label: 'คลิกเปิดเมนู' },
              { v: 'direct' as PlayMode, label: 'คลิกเดียว' },
            ]}
            onChange={(v) => setPrefs({ playMode: v })}
          />
        </Row>
      </Section>
      {extra}
      {online && !extra && <p className="text-sm text-slate-400">ตั้งค่าห้องออนไลน์อยู่ในห้อง</p>}
    </div>
  );
}

export function SettingsDialog({ onClose, playExtra }: { onClose: () => void; playExtra?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('graphics');
  const body = useRef<HTMLDivElement>(null);
  // ห้ามคืนค่าจาก effect: scrollTo ในเบราว์เซอร์ใหม่คืน Promise ซึ่ง React จะเอาไปเรียกเป็นฟังก์ชันเก็บกวาดแล้วพัง
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab]);
  // วาดที่ body ชั้นบนสุด: ปุ่มที่เปิดอยู่ในแถบเครื่องมือ (z ต่ำกว่าการ์ดจั่ว/แอนิเมชัน) ไม่ให้ถูกทับ
  return createPortal(
    <div className="relative z-[95]">
    <Modal title="ตั้งค่า" onClose={onClose}>
      <div className="-mt-2 flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition ${t.id === tab ? 'border-sky-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div ref={body} className="flex flex-col">
        {tab === 'graphics' && <GraphicsTab />}
        {tab === 'sound' && <SoundTab />}
        {tab === 'play' && <PlayTab extra={playExtra} />}
      </div>
      <div className="flex justify-end">
        <button type="button" className={BTN.primary} onClick={onClose}>
          เสร็จ
        </button>
      </div>
    </Modal>
    </div>,
    document.body,
  );
}

/** ตัวนับ FPS (ตั้งค่า → กราฟิก → แสดง FPS) */
export function FpsMeter() {
  const { settings } = useGfx();
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    if (!settings.showFps) return;
    let raf = 0;
    let frames = 0;
    let start = performance.now();
    const tick = (t: number) => {
      frames++;
      if (t - start >= 500) {
        setFps(Math.round((frames * 1000) / (t - start)));
        frames = 0;
        start = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settings.showFps]);
  if (!settings.showFps || fps === null) return null;
  return (
    <div
      className={`pointer-events-none fixed top-1/2 right-1 z-[80] -translate-y-1/2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs font-bold ${
        fps >= 50 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-rose-300'
      }`}
    >
      {fps} FPS
    </div>
  );
}
