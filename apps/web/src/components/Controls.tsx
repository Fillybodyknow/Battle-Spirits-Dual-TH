import { cardLevel, currentBp, opponentOf } from '@bs/engine';
import { cardName, formatEvent, playerLabel } from '../format';
import { actingPlayer, blockCandidates, controls, db, draftDepleting, flashPlayer, isFxBlocking, isInlineChoice, responseOptions, simulateEvolve, useGame } from '../store';
import { CardFace } from './CardFace';
import { ChainTracker, RevealFan } from './Fx';
import { BTN, Modal } from './Modal';
import { TurnBadge } from './StepSelect';
import { MultiSummonDialog } from './MultiSummonDialog';

/**
 * แถบกลางกระดาน: บอกว่าตอนนี้ใครต้องทำอะไร พร้อมปุ่มหลัก
 * การตัดสินใจที่เกี่ยวกับการ์ดบนกระดาน (เลือกเป้าหมาย, ป้องกัน, Evolution, จ่ายคอสต์, ทิ้งการ์ด) ทำบนกระดานโดยตรง
 * แถบนี้แสดงคำถามและปุ่มยืนยัน/ข้าม
 */
export function PromptBar() {
  const state = useGame((s) => s.state);
  const selectedCores = useGame((s) => s.selectedCores);
  const evolveCard = useGame((s) => s.evolveCard);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const truth = useGame((s) => s.truth);
  const { dispatch, clearCores, choose, confirmEvolve, closeEvolve, confirmCores, cancelCores } = useGame.getState();
  const actor = actingPlayer(state);
  const { battle, choice } = state;

  let title: React.ReactNode = '';
  let detail: React.ReactNode = null;
  let highlight = false;
  const buttons: React.ReactNode[] = [];
  /** ปุ่มหลักของ Phase (จบ Main / จบ Attack / Pass Flash): ปุ่มกลมใหญ่ที่ปลายขวาของเส้นกลางกระดาน */
  let phaseBtn: { label: string; sub: string; onClick: () => void } | null = null;
  const add = (key: string, label: string, onClick: () => void, kind: keyof typeof BTN = 'primary', disabled = false) =>
    buttons.push(
      <button key={key} type="button" className={BTN[kind]} onClick={onClick} disabled={disabled}>
        {label}
      </button>,
    );

  const online = useGame((s) => s.online);
  const mine = controls({ online }, actor);
  if (online && online.status !== 'playing') {
    title = 'รอคู่แข่งเข้าห้อง…';
    detail = `ส่งรหัสห้อง ${online.code} ให้เพื่อน`;
  } else if (state.winner && !blocking) {
    title = <span className="text-yellow-300">🏆 {playerLabel(state.winner)} ชนะ!</span>;
  } else if (blocking) {
    // แอนิเมชันเอฟเฟกต์กำลังเล่น: ยังไม่ให้ตัดสินใจ
    title = 'กำลังแสดงเอฟเฟกต์…';
    detail = 'คลิกกระดานเพื่อข้าม';
  } else if (state.awaitingDraw) {
    title = 'Draw Step';
    detail = mine ? 'กดการ์ดที่ลอยขึ้นมาเพื่อจั่ว' : 'รอคู่แข่งจั่วการ์ด…';
  } else if (!mine) {
    // ออนไลน์: ตาของคู่แข่ง
    title = `รอ${actor ? playerLabel(actor) : 'คู่แข่ง'}…`;
    detail = choice ? `กำลังเลือก: ${choice.prompt}` : battle?.flash ? 'Flash Timing ของคู่แข่ง' : battle?.step === 'declareBlock' ? 'คู่แข่งกำลังเลือกการป้องกัน' : 'ตาของคู่แข่ง';
  } else if (evolveCard) {
    // [Evolution]: เลือก Core บนสปิริตอื่นของเรา
    const after = simulateEvolve(state, evolveCard, selectedCores);
    highlight = true;
    title = `[Evolution] ${cardName(state, evolveCard)}`;
    detail = after
      ? `ย้าย Core ${selectedCores.length} ดวง → Lv${cardLevel(after, db, evolveCard)} · BP ${currentBp(after, db, evolveCard).toLocaleString()}`
      : 'คลิก Core บนสปิริตอื่นของเราที่จะย้ายมาวางบนสปิริตนี้';
    add('cancel', 'ยกเลิก', closeEvolve, 'secondary');
    add('ok', `ย้าย ${selectedCores.length} ดวง`, confirmEvolve, 'primary', !after);
  } else if (choice) {
    highlight = true;
    title = choice.prompt;
    const source = `เอฟเฟกต์ของ ${cardName(state, choice.sourceId)}`;
    if (choice.kind === 'order') {
      detail = `${playerLabel(choice.player)} · เอฟเฟกต์ ${choice.effects.length} อันเกิดพร้อมกัน คลิกอันที่จะทำงานก่อน (ผลเกิดทันที แล้วค่อยเลือกอันถัดไป)`;
    } else if (choice.kind === 'option') {
      detail = source;
      choice.options.forEach((label, i) => add(`opt${i}`, label, () => choose(i)));
    } else if (choice.kind === 'payCost') {
      detail = `${source} · คลิก Core ใน Reserve หรือบนการ์ดเพื่อเลือก (เลือกแล้ว ${selectedCores.length}/${choice.cost})`;
      add('skip', 'ไม่จ่าย', () => choose(null), 'secondary');
      add('pay', `จ่าย ${choice.cost}`, () => choose({ pay: selectedCores }), 'primary', selectedCores.length !== choice.cost);
    } else if (choice.kind === 'multiSummon') {
      detail = `${source} · เลือกในหน้าต่าง`;
    } else if (choice.kind === 'placeCores') {
      detail = `${source} · คลิก Core ใน Reserve หรือบนการ์ดในสนามเพื่อเลือก (เลือกแล้ว ${selectedCores.length}, ขั้นต่ำ ${choice.min})`;
      add('place', `วาง ${selectedCores.length} ดวง`, () => choose({ pay: selectedCores }), 'primary', selectedCores.length < choice.min);
    } else if (isInlineChoice(state)) {
      detail = `${source} · คลิกการ์ดที่เรืองแสงสีชมพู`;
      if (choice.optional) add('skip', choice.skipLabel ?? 'ไม่เลือก', () => choose(null), 'secondary');
    } else {
      detail = choice.revealed ? `${source} · คลิกการ์ดที่เรืองแสงจากที่แสดง` : `${source} · เลือกในหน้าต่าง`;
    }
  } else if (battle?.flash) {
    const fp = battle.flash.priority;
    const o = responseOptions(state, fp);
    const attacker = `${cardName(state, battle.attackerId)} (BP ${currentBp(state, db, battle.attackerId).toLocaleString()})`;
    highlight = o.magic.length + o.evolve.length + o.quick.length > 0;
    title =
      battle.step === 'flashBeforeBlock'
        ? fp === state.turnPlayer
          ? 'ก่อนคู่แข่งประกาศป้องกัน ใช้การ์ดหรือเอฟเฟกต์ไหม?'
          : `${attacker} ประกาศโจมตี! ใช้การ์ดหรือเอฟเฟกต์ไหม?`
        : 'ก่อนตัดสินการต่อสู้ ใช้การ์ดหรือเอฟเฟกต์ไหม?';
    const parts = [
      o.magic.length > 0 && `Magic [Flash] บนมือ ${o.magic.length} ใบ`,
      o.quick.length > 0 && `[Quick] บนมือ ${o.quick.length} ใบ`,
      o.evolve.length > 0 && `Evolution บนสนาม ${o.evolve.length} ตัว`,
    ].filter(Boolean);
    detail = parts.length > 0 ? `ใช้ได้: ${parts.join(' · ')} (การ์ดที่ใช้ได้จะเรืองแสง)` : 'ไม่มีการ์ดที่ใช้ได้';
    phaseBtn = { label: 'PASS', sub: 'ไม่ใช้', onClick: () => dispatch({ type: 'passFlash', player: fp }) };
  } else if (battle?.step === 'declareBlock') {
    const candidates = blockCandidates(state);
    highlight = true;
    title =
      battle.blockers.length > 0
        ? 'ป้องกันตัวที่ 2 ด้วยสปิริตตัวไหน?'
        : `${cardName(state, battle.attackerId)} (BP ${currentBp(state, db, battle.attackerId).toLocaleString()}) โจมตี! จะป้องกันด้วยสปิริตตัวไหน?`;
    detail = battle.consecutiveBlade
      ? '[Consecutive Blade] ต้องป้องกัน 2 ตัวถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
      : battle.mustBlock
        ? '[True-Rage] ต้องป้องกันถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
        : 'คลิกสปิริตที่มีกรอบสีฟ้าบนสนามเพื่อป้องกัน';
    // ไม่ป้องกัน = คลิกแผง Life ของฝ่ายป้องกัน (ไม่มีปุ่มแล้ว)
    if (!(battle.mustBlock && candidates.length > 0)) {
      detail += battle.blockers.length > 0 ? ' · คลิกแผง Life = ไม่ป้องกันเพิ่ม' : ' · คลิกแผง Life = ไม่ป้องกัน (รับด้วย Life)';
    }
  } else if (truth && state.phase === 'main') {
    // กำลังจัด Core: ยังไม่สูญสลายจนกว่าจะยืนยัน
    const dying = draftDepleting(truth, state);
    highlight = true;
    title = 'กำลังจัด Core';
    detail =
      dying.length > 0
        ? `ถ้ายืนยันตอนนี้ จะสูญสลาย: ${dying.map((id) => cardName(state, id)).join(', ')} · ย้าย Core กลับมาเพิ่มได้ก่อนยืนยัน`
        : 'ลากย้าย Core ได้อิสระ ยังไม่มีการ์ดสูญสลายจนกว่าจะกดยืนยัน (ทำ action อื่นต่อ = ยืนยันอัตโนมัติ)';
    if (selectedCores.length > 0) add('clear', 'ยกเลิกเลือก Core', clearCores, 'secondary');
    add('cancel', 'ยกเลิกการจัด', cancelCores, 'secondary');
    add('ok', dying.length > 0 ? `ยืนยัน (สูญสลาย ${dying.length})` : 'ยืนยันการจัด Core', confirmCores);
  } else if (state.phase === 'main') {
    title = 'Main Step';
    detail =
      selectedCores.length > 0
        ? `เลือก Core ไว้ ${selectedCores.length} ดวง: ลากไปวาง หรือคลิกการ์ด/Reserve ปลายทาง`
        : 'คลิกการ์ดบนมือเพื่อเล่น · ลาก Core ไปวางบนการ์ดหรือ Reserve (คลิก Core เพื่อเลือกหลายดวง)';
    if (selectedCores.length > 0) add('clear', 'ยกเลิกเลือก Core', clearCores, 'secondary');
  } else if (state.phase === 'attack') {
    title = 'Attack Step';
    detail = 'คลิกสปิริตที่มีกรอบสีเหลืองเพื่อโจมตี';
  }

  const fighter = (id: string) => (
    <span key={id} className="rounded bg-black/40 px-2 py-0.5">
      {cardName(state, id)} <b className="text-yellow-300">{currentBp(state, db, id).toLocaleString()}</b>
    </span>
  );
  const lifePerBlocker = battle ? battle.lifeOnBlockerDestroyed + (battle.consecutiveBlade ? battle.lifeOnBlockerDestroyedByBlade : 0) : 0;

  return (
    <div className="relative">
      {/* แถบบางบรรทัดเดียวบนเส้นกลางกระดาน */}
      <div
        className={`hud-panel flex flex-col gap-1 rounded-xl py-1 pr-1.5 pl-3 ${highlight ? 'ring-1 ring-fuchsia-400/70' : ''}`}
        style={highlight ? { animation: 'fx-choice-glow 1.8s ease-in-out infinite' } : undefined}
      >
        {battle && (
          <div className="flex max-w-[calc(50%-44px)] flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-rose-600 px-2 text-[10px] font-black tracking-wide">BATTLE</span>
            {fighter(battle.attackerId)}
            <span className="text-slate-500">vs</span>
            {battle.blockers.length === 0 ? <span className="text-slate-500">ยังไม่มีผู้ป้องกัน</span> : battle.blockers.map(fighter)}
            {battle.consecutiveBlade && <span className="rounded bg-orange-600 px-1.5 font-bold">Consecutive Blade</span>}
            {battle.mustBlock && !battle.consecutiveBlade && <span className="rounded bg-orange-600 px-1.5 font-bold">True-Rage</span>}
            {battle.endAttackStepAfter && <span className="rounded bg-slate-600 px-1.5">จบ Attack Step หลังการต่อสู้นี้</span>}
            {lifePerBlocker > 0 && <span className="rounded bg-slate-600 px-1.5">ผู้ป้องกันถูกทำลาย → ไลฟ์ −{lifePerBlocker}/ตัว</span>}
          </div>
        )}
        {/* ซ้าย: ใคร/ทำอะไร · กลาง: ป้ายเทิร์น (เว้นช่องไว้) · ขวา: ปุ่ม */}
        <div className="relative flex min-h-8 items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {actor && <span className="player-tag-active shrink-0 rounded-md px-2 py-0.5 text-xs font-black">ตาของ {playerLabel(actor)}</span>}
            <ChainTracker side="self" />
            <div className="flex min-w-0 flex-1 items-baseline gap-2" title={typeof detail === 'string' ? detail : undefined}>
              <span className="shrink-0 truncate text-sm font-black tracking-wide text-white [text-shadow:0_1px_0_#000,0_0_12px_rgba(56,189,248,0.35)]">{title}</span>
              {detail && <span className="min-w-0 truncate text-xs text-slate-400">{detail}</span>}
            </div>
          </div>
          <div className="w-[76px] shrink-0" />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
            {buttons.length > 0 && <div className="btn-row flex shrink-0 flex-wrap justify-end gap-1.5">{buttons}</div>}
            <ChainTracker side="opp" />
            <PhaseButton btn={phaseBtn} />
          </div>
          <TurnBadge />
        </div>
      </div>
    </div>
  );
}

/** ปุ่มจบ Step / Pass ทรงแคปซูล อยู่ปลายขวาในแถบกลาง (ไม่ทับช่องบนกระดาน) — ไม่มีอะไรให้กดก็ไม่แสดง */
function PhaseButton({ btn }: { btn: { label: string; sub: string; onClick: () => void } | null }) {
  if (!btn) return null;
  return (
    <button
      type="button"
      onClick={btn.onClick}
      className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-300 via-amber-500 to-orange-600 pr-4 pl-1.5 font-black text-slate-950 shadow-[0_0_14px_rgba(251,191,36,0.45),inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-110 active:scale-95"
      style={{ animation: 'phase-btn-pulse 2s ease-in-out infinite' }}
    >
      <span className="rounded-full bg-slate-950/85 px-2 py-0.5 text-[10px] leading-none tracking-wider text-amber-200">{btn.label}</span>
      <span className="text-sm leading-none">{btn.sub}</span>
      <span className="text-xs leading-none">▶</span>
    </button>
  );
}

/** Magic [Flash] บนมือของผู้เล่นนี้ที่ใช้ได้ตอนนี้ (ให้การ์ดเรืองแสง) */
export function useFlashUsable(cardId: string): boolean {
  return useGame((s) => {
    const fp = flashPlayer(s.state);
    if (!fp) return false;
    const o = responseOptions(s.state, fp);
    return o.magic.includes(cardId) || o.quick.includes(cardId);
  });
}

/** สีและไอคอนของบรรทัด Log ตามเนื้อหา */
function logStyle(line: string): { icon: string; cls: string } {
  if (line.startsWith('──')) return { icon: '', cls: 'mt-2 border-t border-yellow-400/20 pt-1.5 font-bold text-yellow-300' };
  if (line.includes('ชนะ')) return { icon: '🏆', cls: 'font-bold text-yellow-200' };
  if (line.includes('เสีย Life')) return { icon: '💔', cls: 'text-rose-300' };
  if (line.includes('ถูกทำลาย') || line.includes('สูญสลาย')) return { icon: '💥', cls: 'text-rose-200/90' };
  if (line.includes('ประกาศโจมตี')) return { icon: '⚔', cls: 'text-orange-200' };
  if (line.includes('บล็อก')) return { icon: '🛡', cls: 'text-sky-200' };
  if (line.includes('อัญเชิญ') || line.includes('วาง Nexus')) return { icon: '✦', cls: 'text-emerald-200' };
  if (line.includes('Magic') || line.includes('Burst')) return { icon: '✧', cls: 'text-violet-200' };
  if (line.includes('เอฟเฟกต์') || line.includes('[')) return { icon: '⚡', cls: 'text-amber-100' };
  return { icon: '·', cls: 'text-slate-400' };
}

export function GameLog() {
  const state = useGame((s) => s.state);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  // ยังไม่บอกผลแพ้ชนะใน Log จนกว่าแอนิเมชันจะเล่นจบ
  const lines = state.log
    .filter((e) => !(blocking && e.type === 'gameOver'))
    .map((e) => formatEvent(e, state))
    .filter((l): l is string => l !== null);
  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 text-xs">
      {[...lines].reverse().map((line, i) => {
        const s = logStyle(line);
        return (
          <li key={lines.length - i} className={`flex gap-1.5 ${s.cls}`}>
            {s.icon && <span className="w-4 shrink-0 text-center">{s.icon}</span>}
            <span className="min-w-0">{line}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ErrorToast() {
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  if (!error) return null;
  return (
    <div className="fixed bottom-6 left-[calc((100vw-var(--sidebar))/2)] z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-rose-700 px-4 py-2.5 text-sm shadow-xl">
      <span>⚠ {error}</span>
      <button type="button" onClick={clearError} className="text-rose-200 hover:text-white">
        ✕
      </button>
    </div>
  );
}

/** การ์ดในรายการเลือก: ชี้เพื่อดูรายละเอียดในแผงด้านขวา */
function PickCard({ cardId, disabled, onPick, note }: { cardId: string; disabled?: boolean; onPick?: () => void; note?: React.ReactNode }) {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const c = state.cards[cardId]!;
  return (
    // ไม่ใช้ disabled: ปุ่มที่ disabled ไม่ส่ง mouse event ทำให้ชี้ดูรายละเอียดการ์ดไม่ได้ (เช่นการ์ดใน Trash)
    <button
      type="button"
      aria-disabled={disabled || !onPick}
      onClick={() => !disabled && onPick?.()}
      onMouseEnter={() => hover(cardId)}
      onMouseLeave={() => hover(null)}
      className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${onPick && !disabled ? 'hover:bg-yellow-300/20' : 'cursor-default'} ${disabled ? 'opacity-35' : ''}`}
    >
      <div className="h-44 w-32">
        <CardFace def={db.get(c.cardNo)} />
      </div>
      {note && <span className="text-xs text-slate-300">{note}</span>}
    </button>
  );
}

/** หน้าต่างเลือกการ์ดที่ไม่ได้อยู่บนกระดาน (การ์ดที่เปิดจากเด็ค / ใน Trash) */
export function ChoiceDialog() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const choice = state.choice;
  const mine = useGame((s) => controls(s, s.state.choice?.player));
  if (!mine) return null;
  if (!blocking && choice?.kind === 'order') return <OrderPanel />;
  if (!blocking && choice?.kind === 'multiSummon') return <MultiSummonDialog key={choice.revealed.join()} />;
  if (blocking || !choice || choice.kind !== 'card' || isInlineChoice(state)) return null;
  // การ์ดที่เปิดจากเด็ค: เรียงเป็นพัดบนกระดาน (ทั้งสองฝ่ายเห็น)
  if (choice.revealed) {
    return (
      <RevealFan
        owner={choice.player}
        cardIds={choice.revealed}
        candidates={choice.candidates}
        onPick={(id) => choose(id)}
        title={`${playerLabel(choice.player)} แสดงการ์ดจากเด็ค · ${choice.step.do === 'revealPickRestTrash' ? 'เลือก 1 ใบขึ้นมือ ที่เหลือลง Trash' : choice.prompt}`}
        onSkip={choice.optional ? () => choose(null) : undefined}
      />
    );
  }

  return (
    <Modal title={choice.prompt} subtitle={`${playerLabel(choice.player)} · เอฟเฟกต์ของ ${cardName(state, choice.sourceId)}`} wide>
      <div className="flex flex-wrap gap-1">
        {(choice.revealed ?? choice.candidates).map((id) => (
          <PickCard
            key={id}
            cardId={id}
            disabled={!choice.candidates.includes(id)}
            onPick={() => choose(id)}
            note={playerLabel(state.cards[id]!.owner)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {choice.revealed ? 'การ์ดที่ไม่ได้เลือกจะลง Trash · ' : ''}ชี้การ์ดเพื่ออ่านรายละเอียดในแผงด้านขวา
        </span>
        {choice.optional && (
          <button type="button" className={BTN.secondary} onClick={() => choose(null)}>
            ไม่เลือก
          </button>
        )}
      </div>
    </Modal>
  );
}

/** เอฟเฟกต์หลายอันเกิดพร้อมกัน: แผงให้เจ้าของเลือกว่าอันไหนทำงานก่อน */
function OrderPanel() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const hover = useGame((s) => s.hover);
  const choice = state.choice;
  if (choice?.kind !== 'order') return null;
  // เอฟเฟกต์ที่เหมือนกันทุกอย่างแสดงอันเดียวพร้อมจำนวน (เลือกอันไหนก็ผลเท่ากัน)
  const entries: { eff: (typeof choice.effects)[number]; index: number; count: number }[] = [];
  choice.effects.forEach((eff, index) => {
    const keyOf = (x: typeof eff) => x.key ?? `${x.sourceId}|${x.source}`;
    const key = keyOf(eff);
    const same = entries.find((e) => keyOf(e.eff) === key);
    if (same) same.count++;
    else entries.push({ eff, index, count: 1 });
  });
  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 right-[var(--sidebar)] z-40 flex items-center justify-center bg-black/55">
      <div className="hud-panel pointer-events-auto flex max-w-4xl flex-col gap-3 rounded-xl p-4">
        <div>
          <div className="text-xs text-slate-400">{playerLabel(choice.player)} · เอฟเฟกต์ {choice.effects.length} อันเกิดพร้อมกัน</div>
          <div className="text-lg font-black text-white">เลือกเอฟเฟกต์ที่จะทำงานก่อน</div>
          <div className="text-xs text-slate-400">อันที่เลือกเกิดผลทันที แล้วค่อยเลือกอันถัดไป</div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {entries.map(({ eff, index: i, count }) => {
            const card = state.cards[eff.sourceId]!;
            const def = db.get(card.cardNo);
            const text = eff.source === null ? '' : ((def.effects as { text: string }[])[eff.source]?.text ?? '');
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                onMouseEnter={() => hover(eff.sourceId)}
                onMouseLeave={() => hover(null)}
                className="group flex w-64 cursor-pointer gap-2 rounded-lg bg-slate-900/90 p-2 text-left ring-2 ring-fuchsia-400/60 transition hover:-translate-y-1 hover:ring-fuchsia-300 hover:shadow-[0_0_20px_rgba(232,121,249,0.5)]"
              >
                <div className="h-24 w-[4.3rem] shrink-0">
                  <CardFace def={def} size="xs" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-white">{def.name}</span>
                    {count > 1 && (
                      <span className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[11px] font-black text-slate-900" title={`เกิดขึ้น ${count} ครั้ง`}>
                        ×{count}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-4 text-xs text-slate-300">{text}</span>
                  <span className="mt-auto rounded bg-fuchsia-500 px-1.5 py-0.5 text-center text-xs font-black text-white group-hover:bg-fuchsia-400">ทำงานก่อน</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ดูการ์ดใน Trash */
export function TrashDialog() {
  const state = useGame((s) => s.state);
  const player = useGame((s) => s.trashView);
  const openTrash = useGame((s) => s.openTrash);
  if (!player) return null;
  const cards = state.players[player].trashCards;
  return (
    <Modal title={`Trash ของ${playerLabel(player)}`} subtitle={`${cards.length} ใบ · ชี้การ์ดเพื่อดูรายละเอียด`} onClose={() => openTrash(null)} wide>
      {cards.length === 0 ? (
        <p className="text-sm text-slate-500">ยังไม่มีการ์ดใน Trash</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {[...cards].reverse().map((id) => (
            <PickCard key={id} cardId={id} />
          ))}
        </div>
      )}
    </Modal>
  );
}
