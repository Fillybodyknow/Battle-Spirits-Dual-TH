/** เลือกช่วงเพลง (BGM) ตามสถานการณ์ในเกม แล้วเปลี่ยนให้ตรงจังหวะแอนิเมชัน */
import { useEffect } from 'react';
import { PLAYERS, opponentOf, type GameState } from '@bs/engine';
import { isXRare } from '@bs/cards';
import { playBgm, reshuffleBgm, type BgmTrack } from './bgm';
import { CUTIN_MS, CUTIN_SLAM, db, useGame } from './store';

type Store = ReturnType<typeof useGame.getState>;

/** มีการ์ด X-Rare ขึ้นไปบนสนาม (รวม Brave ที่ร่วมร่างอยู่) */
function aceOnField(st: GameState): boolean {
  return PLAYERS.some((p) =>
    st.players[p].field.some((id) => [id, ...(st.cards[id]?.braves ?? [])].some((c) => {
      const card = st.cards[c];
      return !!card && isXRare(db.get(card.cardNo));
    })),
  );
}

const inIntro = (s: Store) => s.fx.some((f) => f.kind === 'intro');

/** pinch: เริ่มเมื่อ Life ฝ่ายใดฝ่ายหนึ่ง ≤ PINCH_IN · เริ่มแล้วเล่นต่อจนกว่า Life ทั้งสองฝ่ายกลับมา ≥ PINCH_OUT (หรือจบเกม) */
const PINCH_IN = 2;
const PINCH_OUT = 4;

function decide(s: Store, last: BgmTrack | null): BgmTrack | null {
  // หน้าอื่น / ฉากเปิดเกม (โยนเหรียญ ฯลฯ) / จบเกมแล้ว = ไม่มีเพลง
  if (s.screen !== 'game' || s.state.winner || inIntro(s) || (s.pregame && !s.pregame.chosen)) return null;
  const st = s.state;
  // Life ของผู้เล่นฝ่ายใดก็ได้ (ทั้งเราและคู่แข่งได้ยินเพลงเดียวกันเมื่อเกมเข้าช่วงตึงเครียด)
  const rivals = PLAYERS;
  const limit = last === 'pinch' ? PINCH_OUT - 1 : PINCH_IN;
  if (rivals.some((p) => st.players[p].life.length <= limit)) return 'pinch';
  return aceOnField(st) ? 'ace' : 'duel';
}

/** เวลาที่ควรเปลี่ยนเพลง (ms นับจากตอนนี้) ให้ตรงกับแอนิเมชันที่เพิ่งเริ่ม */
function delayFor(s: Store, track: BgmTrack | null): number {
  for (const f of s.fx) {
    // เพลง ace เริ่มตรงจังหวะทุบของ Cut-in
    if (track === 'ace' && f.kind === 'summon') return f.delay + Math.round((f.special ? CUTIN_MS.special : CUTIN_MS.normal) * CUTIN_SLAM);
    // เพลง pinch เริ่มตอน Life ลดจริง
    if (track === 'pinch' && f.kind === 'damage') return f.delay;
    // จบเกม: เพลงจางลงตอน Final Blow
    if (track === null && s.state.winner && f.kind === 'finalBlow') return f.delay;
  }
  return 0;
}

/** ใช้ครั้งเดียวที่ App */
export function useBgmDirector() {
  useEffect(() => {
    let last: BgmTrack | null = null;
    const check = (s: Store, prev?: Store) => {
      // เริ่มเกมใหม่ = สุ่มเพลงใหม่
      if (inIntro(s) && !(prev && inIntro(prev))) reshuffleBgm();
      const t = decide(s, last);
      if (t === last) return;
      last = t;
      playBgm(t, delayFor(s, t));
    };
    check(useGame.getState());
    const off = useGame.subscribe((s, prev) => check(s, prev));
    return () => {
      off();
      playBgm(null);
    };
  }, []);
}
