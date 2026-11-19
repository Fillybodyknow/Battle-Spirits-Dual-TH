/**
 * หน้ารายการบทเรียน (เมนู TUTORIAL ในหน้าหลัก) + ป้ายชวนเล่นสำหรับ ID ใหม่ (กดข้ามได้)
 */
import { useAccount } from '../account/account';
import { BTN, Modal } from '../components/Modal';
import { sfx } from '../sfx';
import { LESSONS } from './lessons';
import { markPrompted, startTutorial, useTutorial } from './tutorial';

/** บัญชีที่สร้างตั้งแต่วันที่มีบทเรียน = ID ใหม่ (ชวนเล่นครั้งเดียว) · บัญชีเก่าเข้าเล่นเองได้จากเมนู */
const TUTORIAL_SINCE = Date.parse('2026-11-19T00:00:00+07:00');

export function TutorialMenu({ onClose }: { onClose: () => void }) {
  const done = useTutorial((s) => s.progress.done);
  return (
    <Modal title="บทเรียนพื้นฐาน" subtitle="TUTORIAL · เรียนวิธีเล่นบนกระดานจริง ทีละขั้น" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {LESSONS.map((l, i) => {
          const ok = done.includes(l.id);
          return (
            <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-800/70 p-3 ring-1 ring-white/10">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black ${ok ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>{ok ? '✓' : i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="font-black text-white">{l.title}</div>
                <div className="text-xs text-slate-400">{l.sub}</div>
              </div>
              <button
                type="button"
                className={`${ok ? BTN.secondary : BTN.primary} px-5`}
                onClick={() => {
                  sfx('click');
                  if (!startTutorial(l.id)) return;
                  markPrompted();
                  onClose();
                }}
              >
                {ok ? 'เล่นอีกครั้ง' : 'เริ่ม'}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** ID ใหม่ที่ยังไม่เคยถูกชวนเล่นบทเรียน (ชวนที่ฉากวาร์ปตอนเข้าเกม · หน้าหลักเป็นทางสำรอง) */
export function useNeedsWelcome(): boolean {
  const user = useAccount((s) => s.user);
  const prompted = useTutorial((s) => s.progress.prompted);
  const anyDone = useTutorial((s) => s.progress.done.length > 0);
  const isNew = !!user && (user.createdAt === undefined || user.createdAt >= TUTORIAL_SINCE);
  return isNew && !prompted && !anyDone;
}

/** ป้ายต้อนรับ ID ใหม่ในหน้าหลัก (ทางสำรอง: ปกติชวนที่ฉากวาร์ปแล้ว) */
export function TutorialWelcome() {
  if (!useNeedsWelcome()) return null;
  return (
    <Modal title="ยินดีต้อนรับนักดวลหน้าใหม่!" subtitle="WELCOME">
      <p className="text-sm leading-relaxed text-slate-200">
        เล่นบทเรียนพื้นฐานไหม? พาดูสนาม อัญเชิญสปิริต และโจมตีจนชนะ บนกระดานจริงทีละขั้น ใช้เวลาไม่กี่นาที
        <br />
        <span className="text-slate-400">กลับมาเล่นได้ทุกเมื่อจากเมนู TUTORIAL ในหน้าหลัก</span>
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN.secondary} onClick={() => (sfx('click'), markPrompted())}>
          ข้าม
        </button>
        <button
          type="button"
          className={`${BTN.primary} px-8`}
          onClick={() => {
            sfx('click');
            markPrompted();
            startTutorial(LESSONS[0]!.id);
          }}
        >
          เริ่มบทเรียน
        </button>
      </div>
    </Modal>
  );
}
