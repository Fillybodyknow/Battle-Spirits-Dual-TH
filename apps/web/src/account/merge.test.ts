import { describe, expect, it } from 'vitest';
import { mergeDecks, mergeSettings, settingsHash } from './merge';

const d = (id: string, updated: number, code = `c:${id}|SD01-001*3`) => ({ id, code, updated });

describe('mergeDecks', () => {
  it('ล็อกอินครั้งแรก: เด็คในเครื่องขึ้นคลาวด์ทั้งหมด + เด็คบนคลาวด์ลงเครื่อง (ไม่มีอะไรหาย)', () => {
    const r = mergeDecks([d('a', 10)], { b: { code: 'c:b|SD01-001*3', updated: 5 } }, {}, 100);
    expect(r.local.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(Object.keys(r.push)).toEqual(['a']);
    expect(r.known).toEqual({ a: 10, b: 5 });
  });

  it('แก้ในเครื่องใหม่กว่า = ส่งขึ้น · คลาวด์ใหม่กว่า = ใช้ของคลาวด์', () => {
    const r = mergeDecks([d('a', 20), d('b', 5)], { a: { code: 'old', updated: 10 }, b: { code: 'new', updated: 9 } }, { a: 10, b: 5 }, 100);
    expect(r.push.a).toEqual({ code: d('a', 20).code, updated: 20 });
    expect(r.local.find((x) => x.id === 'b')).toEqual({ id: 'b', code: 'new', updated: 9 });
    expect(r.push.b).toBeUndefined();
  });

  it('ลบในเครื่องนี้หลังซิงก์ = ส่งเครื่องหมายลบขึ้นคลาวด์', () => {
    const r = mergeDecks([], { a: { code: 'x', updated: 10 } }, { a: 10 }, 100);
    expect(r.local).toEqual([]);
    expect(r.push.a).toEqual({ deleted: true, updated: 100 });
  });

  it('ลบในเครื่องนี้ แต่เครื่องอื่นแก้หลังจากนั้น = เก็บของเครื่องอื่นไว้', () => {
    const r = mergeDecks([], { a: { code: 'edited', updated: 50 } }, { a: 10 }, 100);
    expect(r.local).toEqual([{ id: 'a', code: 'edited', updated: 50 }]);
    expect(r.push).toEqual({});
  });

  it('ลบจากเครื่องอื่น (หลังแก้ล่าสุดในเครื่องนี้) = ลบในเครื่องนี้ด้วย · แก้ในเครื่องนี้ทีหลัง = ได้คืน', () => {
    const gone = mergeDecks([d('a', 10)], { a: { deleted: true, updated: 30 } }, { a: 10 }, 100);
    expect(gone.local).toEqual([]);
    const back = mergeDecks([d('a', 40)], { a: { deleted: true, updated: 30 } }, { a: 10 }, 100);
    expect(back.local.map((x) => x.id)).toEqual(['a']);
    expect(back.push.a).toEqual({ code: d('a', 40).code, updated: 40 });
  });
});

describe('mergeSettings', () => {
  const local = { 'bs-sfx': '{"on":true}' };
  const cloud = { values: { 'bs-sfx': '{"on":false}' }, updated: 50 };

  it('ล็อกอินครั้งแรก: บัญชีมีการตั้งค่าแล้ว = ใช้ของบัญชี · ยังไม่มี = ส่งของเครื่องนี้ขึ้น', () => {
    expect(mergeSettings(local, cloud, null, 100).apply).toEqual(cloud.values);
    const first = mergeSettings(local, null, null, 100);
    expect(first.apply).toBeNull();
    expect(first.push).toEqual({ values: local, updated: 100 });
  });

  it('แก้ในเครื่อง = ส่งขึ้น · ไม่ได้แก้แต่คลาวด์ใหม่กว่า = ใช้ของคลาวด์ · ไม่มีอะไรเปลี่ยน = ไม่ทำอะไร', () => {
    const synced = { hash: settingsHash(cloud.values), updated: 50 };
    const changed = mergeSettings(local, cloud, synced, 100);
    expect(changed.push).toEqual({ values: local, updated: 100 });
    const newer = mergeSettings(cloud.values, { values: { 'bs-sfx': 'x' }, updated: 80 }, synced, 100);
    expect(newer.apply).toEqual({ 'bs-sfx': 'x' });
    const same = mergeSettings(cloud.values, cloud, synced, 100);
    expect(same.apply).toBeNull();
    expect(same.push).toBeNull();
  });
});
