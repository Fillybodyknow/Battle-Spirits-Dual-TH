/**
 * บัญชีผู้ใช้ผ่าน Firebase Auth + Realtime Database
 * เครื่องที่ยังไม่ล็อกอินใช้ Anonymous Auth อยู่แล้ว (ห้องออนไลน์): ล็อกอิน Google / สมัคร Email = "ผูก" เข้ากับ uid เดิม
 * ต้องเปิด Google และ Email/Password ใน Firebase Console → Authentication → Sign-in method
 */
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import { database, firebaseApp } from '../online/firebase';
import { AccountError, type CloudBackend, type CloudData, type CloudDeck, type CloudUser } from './cloud';

const auth = (): Auth => getAuth(firebaseApp());

function toUser(u: User | null): CloudUser | null {
  if (!u || u.isAnonymous) return null;
  const google = u.providerData.some((p) => p.providerId === 'google.com');
  return { uid: u.uid, email: u.email, provider: google ? 'google' : 'password' };
}

/** ข้อความภาษาไทยของข้อผิดพลาดที่ผู้เล่นเจอบ่อย */
function thai(e: unknown): AccountError {
  const code = (e as { code?: string })?.code ?? '';
  const msg: Record<string, string> = {
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/missing-password': 'กรอกรหัสผ่านด้วย',
    'auth/weak-password': 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร',
    'auth/email-already-in-use': 'อีเมลนี้สมัครไว้แล้ว: กด "เข้าสู่ระบบ" แทน',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/wrong-password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีอีเมลนี้: กด "สมัครสมาชิก" ก่อน',
    'auth/too-many-requests': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
    'auth/popup-closed-by-user': 'ปิดหน้าต่างล็อกอินก่อนเสร็จ',
    'auth/cancelled-popup-request': 'ปิดหน้าต่างล็อกอินก่อนเสร็จ',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิดวิธีล็อกอินนี้ใน Firebase Console',
    'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Console (Authorized domains)',
  };
  return new AccountError(msg[code] ?? `ล็อกอินไม่สำเร็จ (${code || (e as Error)?.message || 'ไม่ทราบสาเหตุ'})`);
}

/** แอปที่ติดตั้งบนมือถือ (PWA) มักบล็อกป๊อปอัป: ใช้แบบเปลี่ยนหน้าแทน */
const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/** บัญชี Google นี้ผูกกับ uid อื่นไว้แล้ว (ล็อกอินเครื่องที่สอง): สลับไปใช้บัญชีนั้น */
async function signInExisting(e: unknown): Promise<boolean> {
  if ((e as { code?: string })?.code !== 'auth/credential-already-in-use') return false;
  const cred = GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
  if (!cred) return false;
  await signInWithCredential(auth(), cred);
  return true;
}

export const firebaseCloud: CloudBackend = {
  name: 'Firebase',

  onUser(cb) {
    const a = auth();
    // กลับมาจากล็อกอินแบบเปลี่ยนหน้า: จัดการกรณีบัญชี Google ผูกกับ uid อื่นไว้แล้ว
    getRedirectResult(a).catch((e) => signInExisting(e).catch(() => {}));
    return onAuthStateChanged(a, (u) => cb(toUser(u)));
  },

  async signInGoogle() {
    const a = auth();
    const provider = new GoogleAuthProvider();
    const cur = a.currentUser;
    try {
      if (standalone()) {
        await (cur?.isAnonymous ? linkWithRedirect(cur, provider) : signInWithRedirect(a, provider));
        return;
      }
      if (cur?.isAnonymous) await linkWithPopup(cur, provider);
      else await signInWithPopup(a, provider);
    } catch (e) {
      if (await signInExisting(e)) return;
      if ((e as { code?: string })?.code === 'auth/popup-blocked') {
        await (cur?.isAnonymous ? linkWithRedirect(cur, provider) : signInWithRedirect(a, provider));
        return;
      }
      throw thai(e);
    }
  },

  async signInEmail(email, password) {
    try {
      await signInWithEmailAndPassword(auth(), email.trim(), password);
    } catch (e) {
      throw thai(e);
    }
  },

  async signUpEmail(email, password) {
    const a = auth();
    try {
      const cur = a.currentUser;
      // เครื่องนี้ล็อกอินแบบไม่ระบุตัวอยู่: ผูกอีเมลเข้ากับ uid เดิม (ห้องออนไลน์ที่ใช้ uid นี้ไม่สะดุด)
      if (cur?.isAnonymous) await linkWithCredential(cur, EmailAuthProvider.credential(email.trim(), password));
      else await createUserWithEmailAndPassword(a, email.trim(), password);
    } catch (e) {
      throw thai(e);
    }
  },

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth(), email.trim());
    } catch (e) {
      throw thai(e);
    }
  },

  async signOut() {
    await signOut(auth());
  },

  async load(uid) {
    const db = database();
    const [user, profile] = await Promise.all([get(ref(db, `users/${uid}`)), get(ref(db, `profiles/${uid}`))]);
    const u = (user.val() ?? {}) as { decks?: Record<string, CloudDeck>; settings?: CloudData['settings'] };
    const p = profile.val() as CloudData['profile'];
    return {
      profile: p && typeof p.name === 'string' ? p : null,
      decks: u.decks ?? {},
      settings: u.settings && typeof u.settings.updated === 'number' ? { values: u.settings.values ?? {}, updated: u.settings.updated } : null,
    };
  },

  async saveProfile(uid, profile) {
    await set(ref(database(), `profiles/${uid}`), profile);
  },

  async saveDeck(uid, id, deck) {
    await set(ref(database(), `users/${uid}/decks/${id}`), deck.deleted ? { deleted: true, updated: deck.updated } : { code: deck.code ?? '', updated: deck.updated });
  },

  async saveSettings(uid, settings) {
    await set(ref(database(), `users/${uid}/settings`), settings);
  },
};
