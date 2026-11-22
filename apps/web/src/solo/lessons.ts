/**
 * บทเรียนประจำด่านฝึกซ้อมของโหมด Story: สอนจุดเด่น/ลูกเล่นของเด็คสีนั้นบนกระดานจริง (ใช้ตัวรันบทเรียนเดียวกับ TUTORIAL)
 * โหนด practice ที่มี `lesson: '<id>'` ใน solo/gates.ts = เล่นบทเรียนนี้แทนการดวลกับบอท · จบบท = ผ่านโหนด
 * เขียนบทใหม่: ดูรูปแบบขั้น (TutorialStep) ที่หัวไฟล์ tutorial/lessons.ts
 */
import type { GameState } from '@bs/engine';
import { act, card, field, game, hand, handCard, PLAY, put, SWORD, type Lesson } from '../tutorial/lessons';

// ---------------------------------------------------------------- ป่าวายุ: เด็ควายุนินจา
const HOPPA = () => card('นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ'); // ถ้ามีโซลคอร์ BP+3000
const SHINOBIRIKA = () => card('มารสายลม ชิโนบิริกะ'); // นินจามีโซลคอร์โจมตี = นำสปิริตเสื่อมสภาพของคู่แข่งกลับขึ้นมือ
const TOKKURI = () => card('นินจาผีเสื้อราตรีสวมเกราะ ทคคุริวอสพ์'); // ถูกอัญเชิญ = ได้คอร์วอยด์ 1 เม็ด
const EARTH = () => card('เคล็ดวิชาปลดปล่อยพสุธา'); // [Flash] เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว
const BLINK = () => card('เคล็ดวิชาเคลื่อนย้ายในพริบตา'); // [Flash] ฟื้นสภาพวายุนินจา 1 ตัว
const NOMIKAGE = () => card('นินจาผีเสื้อราตรีสวมเกราะ โนมิคาเงะ');
const DARIU = () => card('มุฉะดาริว');

const flashMine = (s: GameState) => s.battle?.flash?.priority === 'p1';

export const STORY_LESSONS: Lesson[] = [
  {
    id: 'wind-ninja',
    title: 'วิถีแห่งสายลม',
    sub: 'เด็ควายุนินจา: ทำให้คู่แข่งเสื่อมสภาพ · โซลคอร์ปลุกพลังนินจา · ฟื้นสภาพแล้วโจมตีซ้ำ',
    passed: (s) => s.winner === 'p1',
    setup: () => {
      let s = game([TOKKURI(), EARTH(), BLINK(), NOMIKAGE(), NOMIKAGE()], { firstPlayerSkipsAttackStep: false, initialReserve: 8 });
      s = act(s, { type: 'drawStep', player: 'p1' });
      s = structuredClone(s);
      const shinobi = put(s, 'p1', SHINOBIRIKA(), 1);
      const hoppa = put(s, 'p1', HOPPA(), 0);
      // โซลคอร์ของเราย้ายจากรีเสิร์ฟไปวางบนฮ็อปปะ (Lv1 + BP+3000)
      const soul = s.players.p1.reserve.find((c) => s.cores[c]!.isSoul)!;
      s.players.p1.reserve = s.players.p1.reserve.filter((c) => c !== soul);
      s.cards[hoppa]!.cores.push(soul);
      // คู่แข่ง: ตัวที่โจมตีมาเมื่อเทิร์นก่อน (เสื่อมสภาพ) + ตัวป้องกัน · เหลือ Life 3
      const tired = put(s, 'p2', DARIU(), 1);
      s.cards[tired]!.state = 'exhausted';
      const guard = put(s, 'p2', DARIU(), 3);
      s.players.p2.life = s.players.p2.life.slice(0, 3);
      return { state: s, ids: { shinobi, hoppa, tired, guard, tokkuri: handCard(s, TOKKURI()), earth: handCard(s, EARTH()), blink: handCard(s, BLINK()) } };
    },
    // คู่แข่งป้องกันทุกครั้งที่ยังมีตัวป้องกันที่ฟื้นสภาพอยู่
    bot: (s, ids) =>
      s.battle?.step === 'declareBlock' && s.players.p2.field.includes(ids.guard!) && s.cards[ids.guard!]!.state === 'refresh'
        ? { type: 'declareBlock', player: 'p2', blockerId: ids.guard! }
        : null,
    steps: [
      {
        text: 'เด็ควายุนินจา: นินจาตัวเล็กราคาถูก ลงสนามได้เร็ว แล้วรุมโจมตีก่อนคู่แข่งตั้งตัว\nบทนี้จะพาดูลูกเล่น 3 อย่างของเด็คนี้ แล้วปิดเกมให้ได้ในเทิร์นเดียว',
      },
      {
        text: 'ลูกเล่นที่ 1: โซลคอร์ปลุกพลังนินจา\nฮ็อปปะ (BP 1,000) มีโซลคอร์วางอยู่ จึงได้ BP+3,000 เป็น 4,000\nนินจาหลายใบเก่งขึ้นเมื่อมีโซลคอร์ จึงควรวางโซลคอร์ไว้บนนินจาตัวสำคัญ',
        focus: (ids) => [field(ids.hoppa!)],
      },
      {
        text: 'มารสายลม ชิโนบิริกะ: ในแอทแท็คสเต็ปของเรา เมื่อวายุนินจาที่มีโซลคอร์โจมตี\nจะนำสปิริตที่เสื่อมสภาพของคู่แข่งกลับขึ้นมือ 1 ตัว\nสปิริตคู่แข่งตัวที่นอนอยู่ (โจมตีมาเมื่อเทิร์นก่อน) คือเป้าหมาย',
        focus: (ids) => [field(ids.shinobi!), field(ids.tired!)],
      },
      {
        text: 'ลูกเล่นที่ 2: นินจาได้คอร์ฟรี\nทคคุริวอสพ์: เมื่อถูกอัญเชิญ นำคอร์วอยด์ (คอร์จากนอกเกม) 1 เม็ดมาวางบนตัวเอง\nคลิกการ์ด → อัญเชิญ → กดยืนยันที่แผงด้านขวา',
        focus: (ids) => [hand(ids.tokkuri!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'summon' && a.cardId === ids.tokkuri,
        until: (s, ids) => s.players.p1.field.includes(ids.tokkuri!) && !s.choice,
      },
      {
        text: 'ทคคุริวอสพ์ได้คอร์เพิ่มฟรี 1 เม็ด (เลเวลขึ้นโดยไม่ต้องใช้คอร์ของเรา)\nเด็คนี้มีนินจาที่ได้คอร์วอยด์หลายใบ จึงมีคอร์ใช้มากกว่าคู่แข่ง',
        focus: (ids) => [field(ids.tokkuri!)],
      },
      {
        text: 'ไป Attack Step: กดป้ายสเต็ปกลางจอ แล้วเลือก "Attack"',
        focus: () => ['[data-tutorial="turn-badge"]', '[data-tutorial="step-attack"]'],
        expect: (a) => a.type === 'endMain',
        until: (s) => s.phase === 'attack',
      },
      {
        text: 'โจมตีด้วยฮ็อปปะ (มีโซลคอร์) · คลิกสปิริต แล้วกดปุ่มดาบ',
        focus: (ids) => [field(ids.hoppa!), SWORD],
        expect: (a, ids) => a.type === 'declareAttack' && a.attackerId === ids.hoppa,
        until: (s) => s.choice?.kind === 'card' || flashMine(s),
      },
      {
        text: 'ชิโนบิริกะทำงาน! เลือกสปิริตที่เสื่อมสภาพของคู่แข่ง เพื่อนำกลับขึ้นมือ',
        focus: (ids) => [field(ids.tired!)],
        expect: (a, ids) => a.type === 'choose' && a.pick === ids.tired,
        until: (s) => flashMine(s),
      },
      {
        text: 'ลูกเล่นที่ 3: ทำให้คู่แข่งเสื่อมสภาพ = ป้องกันไม่ได้\nคู่แข่งเหลือตัวป้องกัน BP 6,000 ที่ชนะฮ็อปปะได้\nใช้ เคล็ดวิชาปลดปล่อยพสุธา [Flash]: เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว · คลิกการ์ด → ใช้ [Flash] → กดยืนยัน',
        focus: (ids) => [hand(ids.earth!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'useMagic' && a.cardId === ids.earth,
        until: (s) => s.choice?.kind === 'card',
      },
      {
        text: 'เลือกสปิริตป้องกันของคู่แข่งที่จะทำให้เสื่อมสภาพ',
        focus: (ids) => [field(ids.guard!)],
        expect: (a, ids) => a.type === 'choose' && a.pick === ids.guard,
        until: (s) => flashMine(s),
      },
      {
        text: 'ตัวป้องกันนอนลงแล้ว ป้องกันไม่ได้! กด PASS เพื่อให้การโจมตีดำเนินต่อ',
        focus: () => ['[data-tutorial="phase-btn"]'],
        expect: (a) => a.type === 'passFlash' && a.player === 'p1',
        until: (s) => !s.battle,
      },
      {
        text: 'โจมตีเข้า Life ได้! คู่แข่งเหลือ Life 2\nต่อไปโจมตีด้วยทคคุริวอสพ์ · คลิกสปิริต แล้วกดปุ่มดาบ',
        focus: (ids) => [field(ids.tokkuri!), SWORD],
        expect: (a, ids) => a.type === 'declareAttack' && a.attackerId === ids.tokkuri,
        until: (s) => flashMine(s),
      },
      {
        text: 'ฮ็อปปะที่โจมตีไปแล้วนอนอยู่ ใช้ เคล็ดวิชาเคลื่อนย้ายในพริบตา [Flash]: ฟื้นสภาพวายุนินจา 1 ตัว\nคลิกการ์ด → ใช้ [Flash] → กดยืนยัน',
        focus: (ids) => [hand(ids.blink!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'useMagic' && a.cardId === ids.blink,
        until: (s) => s.choice?.kind === 'card',
      },
      {
        text: 'เลือกฮ็อปปะ เพื่อฟื้นสภาพให้โจมตีได้อีกครั้ง',
        focus: (ids) => [field(ids.hoppa!)],
        expect: (a, ids) => a.type === 'choose' && a.pick === ids.hoppa,
        until: (s) => flashMine(s),
      },
      {
        text: 'ฮ็อปปะลุกขึ้นแล้ว! กด PASS ให้ทคคุริวอสพ์โจมตีต่อ',
        focus: () => ['[data-tutorial="phase-btn"]'],
        expect: (a) => a.type === 'passFlash' && a.player === 'p1',
        until: (s) => !s.battle,
      },
      {
        text: 'คู่แข่งเหลือ Life 1 · โจมตีปิดเกมด้วยฮ็อปปะที่ฟื้นสภาพแล้ว',
        focus: (ids) => [field(ids.hoppa!), SWORD],
        free: true,
        until: (s) => !!s.winner,
      },
      {
        text: (s) =>
          s.winner === 'p1'
            ? 'ชนะในเทิร์นเดียว! นี่คือวิถีของวายุนินจา\n· โซลคอร์บนนินจาปลดล็อกเอฟเฟกต์\n· ทำให้คู่แข่งเสื่อมสภาพ (ป้องกันไม่ได้ และชิโนบิริกะนำกลับขึ้นมือได้)\n· ฟื้นสภาพนินจาเพื่อโจมตีซ้ำ\nในเด็คยังมีคุวากะสเลเยอร์ (อัญเชิญนินจาจากเด็คฟรี) และคิริคาเงะ (อัญเชิญด้วยโซลคอร์เม็ดเดียว) ลองใช้ในการดวลจริงดู!'
            : 'Life ของเราหมดก่อน… ลองใหม่อีกครั้ง',
      },
    ],
  },
];
