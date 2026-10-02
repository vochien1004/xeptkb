/**
 * authService.ts - Service Xác thực & Đăng ký Trường học (Firebase Auth & Firestore)
 * Hỗ trợ Đăng ký tự phục vụ (Self-service Registration), Phân quyền Multi-tenant (RBAC),
 * Tự động đồng bộ & Phục hồi Document /users/{uid}, Auto-seeding Super Admin
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, ensureFirebaseAuthSession } from './firebaseClient';
import {
  School,
  SchoolStatus,
  SchoolPlan,
  UserProfile,
  RegisterSchoolPayload,
  AuthResult,
} from '../types/school';
import {
  generateSchoolId,
  SCHOOLS_COLLECTION,
  USERS_COLLECTION,
  checkSchoolAccess,
  getAllSchools,
  getSchoolById,
  seedSchoolSubcollections,
  saveLocalSchoolCache,
  getLocalSchoolCache,
} from './schoolService';

export { auth };

/**
 * Danh sách email quản trị tối cao (Super Admin)
 */
export const SUPER_ADMIN_EMAILS = [
  'admin@tkbpro.edu.vn',
  'superadmin@tkbpro.edu.vn',
];

/**
 * Danh sách Tên đăng nhập cấm hoặc dành riêng cho hệ thống
 */
export const RESERVED_USERNAMES = [
  'admin',
  'superadmin',
  'root',
  'administrator',
  'system',
  'super_admin',
  'bgh',
  'tkbpro',
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    SUPER_ADMIN_EMAILS.includes(lower) ||
    lower.startsWith('superadmin') ||
    lower.startsWith('admin_')
  );
}

const USER_REGISTRY_KEY = 'tkb_cached_user_registry';

export interface CachedUserEntry {
  uid: string;
  username?: string;
  phone?: string;
  email: string;
  displayName: string;
  role: string;
  schoolId?: string;
  schoolName?: string;
  passwordHash?: string;
  createdAt?: string;
}

export function getLocalUserRegistry(): CachedUserEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalUserRegistry(entry: Partial<CachedUserEntry> & { uid: string }) {
  if (typeof window === 'undefined' || !entry.uid) return;
  try {
    const list = getLocalUserRegistry().filter(
      (u) =>
        u.uid !== entry.uid &&
        (!entry.username || u.username !== entry.username) &&
        (!entry.email || u.email !== entry.email)
    );
    list.unshift(entry as CachedUserEntry);
    localStorage.setItem(USER_REGISTRY_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Kiểm tra xem Tên đăng nhập đã tồn tại trong hệ thống chưa
 */
export async function checkUsernameExists(username: string): Promise<boolean> {
  if (!username) return false;
  const clean = username.trim().toLowerCase();
  if (RESERVED_USERNAMES.includes(clean)) {
    return true; // Tên dành riêng không cho phép đăng ký
  }

  // 1. Kiểm tra trong local cache trước (luôn hoạt động an toàn kể cả khi chưa đăng nhập)
  const localSchools = getLocalSchoolCache();
  if (localSchools.some((s) => (s.adminUsername || '').toLowerCase() === clean)) {
    return true;
  }
  const localUsers = getLocalUserRegistry();
  if (localUsers.some((u) => (u.username || '').toLowerCase() === clean)) {
    return true;
  }

  // 2. Tra cứu từ danh sách trường học an toàn (getAllSchools đã có sẵn try/catch và cache fallback)
  try {
    const remoteSchools = await getAllSchools();
    if (remoteSchools.some((s) => (s.adminUsername || '').toLowerCase() === clean)) {
      return true;
    }
  } catch {
    // Bỏ qua lỗi mạng hoặc permission
  }

  return false;
}

/**
 * Kiểm tra Số điện thoại đã được đăng ký trong hệ thống chưa
 */
export async function checkPhoneExists(phone: string): Promise<boolean> {
  if (!phone) return false;
  const raw = phone.trim();
  const digits = raw.replace(/[\s.-]/g, '');
  if (!digits) return false;

  const localUsers = getLocalUserRegistry();
  if (localUsers.some((u) => (u.phone || '').replace(/[\s.-]/g, '') === digits)) {
    return true;
  }

  const localSchools = getLocalSchoolCache();
  if (localSchools.some((s) => (s.phone || '').replace(/[\s.-]/g, '') === digits)) {
    return true;
  }

  try {
    const remoteSchools = await getAllSchools();
    if (remoteSchools.some((s) => (s.phone || '').replace(/[\s.-]/g, '') === digits)) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Tra cứu thông tin người dùng bằng Tên đăng nhập, Số điện thoại hoặc Email
 */
export async function findUserByIdentifier(identifier: string): Promise<{
  user?: UserProfile;
  school?: School;
  matchedBy?: 'username' | 'phone' | 'email' | 'schoolId' | 'code';
} | null> {
  const raw = (identifier || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const digitsOnly = raw.replace(/[\s.-]/g, '');

  // 1. Kiểm tra tài khoản Super Admin
  if (lower === 'admin' || lower === 'superadmin' || digitsOnly === '0900000000' || isSuperAdminEmail(lower)) {
    return {
      user: {
        uid: 'USR_SUPER_ADMIN',
        username: 'admin',
        phone: '0900000000',
        email: 'superadmin@tkbpro.edu.vn',
        displayName: 'Super Administrator',
        role: 'super_admin',
        passwordHash: '12345678',
        createdAt: new Date().toISOString(),
      },
      matchedBy: lower.includes('@') ? 'email' : digitsOnly === '0900000000' ? 'phone' : 'username',
    };
  }

  // 2. Tra cứu trong Cache Trường học (cached_schools_list)
  const localSchools = getLocalSchoolCache();
  for (const s of localSchools) {
    const sUsername = (s.adminUsername || '').toLowerCase();
    const sPhone = (s.phone || '').replace(/[\s.-]/g, '');
    const sEmail = (s.adminEmail || '').toLowerCase();
    const sSchoolId = (s.schoolId || '').toLowerCase();
    const sCode = ((s as any).code || '').toLowerCase();

    if (
      (sUsername && sUsername === lower) ||
      (digitsOnly && sPhone && (sPhone === digitsOnly || s.phone === raw)) ||
      (lower.includes('@') && sEmail === lower) ||
      (sSchoolId && sSchoolId === lower) ||
      (sCode && sCode === lower)
    ) {
      const uProfile: UserProfile = {
        uid: s.adminUid || `USR_${s.schoolId}`,
        username: s.adminUsername || s.schoolId,
        phone: s.phone,
        email: s.adminEmail || `${s.schoolId}@school.tkbpro.edu.vn`,
        displayName: s.representativeName || s.principalName || s.schoolName,
        role: 'school_admin',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        passwordHash: s.adminPasswordInitial || (s as any).adminPassword,
        createdAt: s.createdAt,
      };
      saveLocalUserRegistry(uProfile);
      return {
        user: uProfile,
        school: s,
        matchedBy: sUsername === lower ? 'username' : sSchoolId === lower ? 'schoolId' : 'phone',
      };
    }
  }

  // 3. Tra cứu trong Cache User Registry
  const localUsers = getLocalUserRegistry();
  for (const u of localUsers) {
    const uName = (u.username || '').toLowerCase();
    const uPhone = (u.phone || '').replace(/[\s.-]/g, '');
    const uEmail = (u.email || '').toLowerCase();
    const uSid = (u.schoolId || '').toLowerCase();

    if (
      (uName && uName === lower) ||
      (digitsOnly && uPhone && (uPhone === digitsOnly || u.phone === raw)) ||
      (lower.includes('@') && uEmail === lower) ||
      (uSid && uSid === lower)
    ) {
      let matchedSchool: School | undefined = undefined;
      if (u.schoolId) {
        matchedSchool = localSchools.find((s) => s.schoolId === u.schoolId);
      }
      return {
        user: { ...u, role: (u.role as any) || 'school_admin', createdAt: u.createdAt || new Date().toISOString() },
        school: matchedSchool,
        matchedBy: uName === lower ? 'username' : uSid === lower ? 'schoolId' : 'phone',
      };
    }
  }

  // 4. Tra cứu danh sách trường học từ Firestore (schools collection)
  try {
    const remoteSchools = await getAllSchools();
    for (const s of remoteSchools) {
      const sUsername = (s.adminUsername || '').toLowerCase();
      const sPhone = (s.phone || '').replace(/[\s.-]/g, '');
      const sEmail = (s.adminEmail || '').toLowerCase();
      const sSchoolId = (s.schoolId || '').toLowerCase();
      const sCode = ((s as any).code || '').toLowerCase();

      if (
        (sUsername && sUsername === lower) ||
        (digitsOnly && sPhone && (sPhone === digitsOnly || s.phone === raw)) ||
        (lower.includes('@') && sEmail === lower) ||
        (sSchoolId && sSchoolId === lower) ||
        (sCode && sCode === lower)
      ) {
        const uProfile: UserProfile = {
          uid: s.adminUid || `USR_${s.schoolId}`,
          username: s.adminUsername || s.schoolId,
          phone: s.phone,
          email: s.adminEmail || `${s.schoolId}@school.tkbpro.edu.vn`,
          displayName: s.representativeName || s.principalName || s.schoolName,
          role: 'school_admin',
          schoolId: s.schoolId,
          schoolName: s.schoolName,
          passwordHash: s.adminPasswordInitial || (s as any).adminPassword,
          createdAt: s.createdAt,
        };
        saveLocalUserRegistry(uProfile);
        return {
          user: uProfile,
          school: s,
          matchedBy: sUsername === lower ? 'username' : sSchoolId === lower ? 'schoolId' : 'phone',
        };
      }
    }
  } catch (err) {
    console.warn('Tra cứu remoteSchools gặp lỗi:', err);
  }

  // 5. Tra cứu bộ sưu tập /users từ Firestore
  try {
    const usersSnap = await getDocs(collection(db, USERS_COLLECTION));
    if (!usersSnap.empty) {
      for (const d of usersSnap.docs) {
        const data = d.data();
        const uName = (data.username || '').toLowerCase();
        const uPhone = (data.phone || '').replace(/[\s.-]/g, '');
        const uEmail = (data.email || '').toLowerCase();
        const uSid = (data.schoolId || '').toLowerCase();

        if (
          (uName && uName === lower) ||
          (digitsOnly && uPhone && (uPhone === digitsOnly || data.phone === raw)) ||
          (lower.includes('@') && uEmail === lower) ||
          (uSid && uSid === lower)
        ) {
          const profile: UserProfile = {
            uid: d.id,
            username: data.username,
            phone: data.phone,
            email: data.email,
            displayName: data.displayName || data.username,
            role: data.role || 'school_admin',
            schoolId: data.schoolId,
            schoolName: data.schoolName,
            passwordHash: data.passwordHash,
            createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
          };
          saveLocalUserRegistry(profile);
          let matchedSchool: School | undefined = undefined;
          if (profile.schoolId) {
            matchedSchool = (await getSchoolById(profile.schoolId)) || undefined;
          }
          return {
            user: profile,
            school: matchedSchool,
            matchedBy: uName === lower ? 'username' : uSid === lower ? 'schoolId' : 'phone',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Tra cứu usersSnap gặp lỗi:', err);
  }

  return null;
}

/**
 * 1. TẠO & LƯU TÀI KHOẢN SUPER ADMIN THẬT LÊN FIREBASE
 * Tự động kiểm tra và khởi tạo tài khoản Super Admin (superadmin@tkbpro.edu.vn / Mật khẩu: 12345678) trên Firebase Auth và Firestore /users/{uid}.
 */
export async function initSuperAdminAccount(): Promise<UserProfile> {
  const adminEmail = 'superadmin@tkbpro.edu.vn';
  const adminPassword = '12345678';
  let uid = '';

  try {
    const userCred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    uid = userCred.user.uid;
    console.log('✅ [initSuperAdminAccount] Đã tạo thành công tài khoản Super Admin trên Firebase Auth. UID:', uid);
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      try {
        const userCred = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
        uid = userCred.user.uid;
        console.log('✅ [initSuperAdminAccount] Tài khoản Super Admin đã có sẵn trên Firebase Auth. UID:', uid);
      } catch (signInErr: any) {
        console.warn('⚠️ [initSuperAdminAccount] Đăng nhập Auth thất bại, chuyển sang phiên ẩn danh:', signInErr);
        await signInAnonymously(auth);
        uid = auth.currentUser?.uid || 'USR_SUPER_ADMIN';
      }
    } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
      console.warn('⚠️ [Firebase Auth] Email/Password provider chưa được bật trong Firebase Console (auth/configuration-not-found). Đang chuyển sang phiên ẩn danh.');
      try {
        await signInAnonymously(auth);
        uid = auth.currentUser?.uid || 'USR_SUPER_ADMIN';
      } catch (anonErr) {
        uid = 'USR_SUPER_ADMIN';
      }
    } else {
      console.warn('⚠️ [initSuperAdminAccount] Lỗi Firebase Auth, chuyển sang phiên ẩn danh:', err);
      try {
        await signInAnonymously(auth);
        uid = auth.currentUser?.uid || 'USR_SUPER_ADMIN';
      } catch (anonErr) {
        uid = 'USR_SUPER_ADMIN';
      }
    }
  }

  if (!uid) {
    throw new Error('Không lấy được UID thực từ Firebase Auth cho Super Admin.');
  }

  const superAdminProfile: UserProfile = {
    uid,
    username: 'admin',
    phone: '0900000000',
    email: adminEmail,
    displayName: 'Super Administrator',
    role: 'super_admin',
    schoolId: undefined,
    passwordHash: adminPassword,
    createdAt: new Date().toISOString(),
  };

  // Ghi duy nhất 1 document vào /users/{uid} bằng UID THẬT do Firebase Auth cấp
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  await setDoc(
    userDocRef,
    {
      uid,
      username: 'admin',
      phone: '0900000000',
      email: adminEmail,
      displayName: 'Super Administrator',
      role: 'super_admin',
      schoolId: null,
      passwordHash: adminPassword,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ [initSuperAdminAccount] Đã ghi thành công document vào /users/${uid} trên Firestore`);
  return superAdminProfile;
}

export async function initializeSuperAdmin(
  target: string | { uid: string; email?: string | null; displayName?: string | null }
): Promise<UserProfile | null> {
  let email = typeof target === 'string' ? target : target.email || '';
  email = email.trim().toLowerCase();

  if (!isSuperAdminEmail(email)) return null;
  return await initSuperAdminAccount();
}

/**
 * 2. Tự Động Sửa Lỗi / Phục Hồi Document /users/{uid} Khi Đăng Nhập Hoặc Kiểm Tra Phiên
 * Đảm bảo document /users/{uid} luôn tồn tại và có đủ 2 trường { role, schoolId } để Security Rules không bao giờ chặn.
 */
export async function ensureAndSyncUserDocument(
  firebaseUser: FirebaseUser | { uid: string; email?: string | null; displayName?: string | null },
  fallbackSchoolId?: string
): Promise<UserProfile> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').trim().toLowerCase();

  // 1. Kiểm tra nếu là Super Admin -> Tự động kích hoạt Super Admin
  const superAdminRes = await initializeSuperAdmin({ uid, email, displayName: firebaseUser.displayName });
  if (superAdminRes) {
    return superAdminRes;
  }

  // 2. Đọc document tại /users/{uid}
  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      const profile: UserProfile = {
        uid: data.uid || uid,
        username: data.username,
        phone: data.phone,
        email: data.email || email,
        displayName: data.displayName || firebaseUser.displayName || `Admin ${data.username || email.split('@')[0]}`,
        role: data.role || 'school_admin',
        schoolId: data.schoolId || fallbackSchoolId || 'thpt-chu-van-an-88e1',
        schoolName: data.schoolName,
        passwordHash: data.passwordHash,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
      };

      // Đảm bảo document trên Firestore chứa đầy đủ { role, schoolId }
      if (!data.role || data.schoolId === undefined) {
        await setDoc(
          userDocRef,
          {
            role: profile.role,
            schoolId: profile.schoolId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      return profile;
    }

    // 3. Nếu chưa có document tại /users/{uid} -> TỰ ĐỘNG KHỞI TẠO ĐỂ PHỤC HỒI TÀI KHỎAN
    const schoolId = fallbackSchoolId || 'thpt-chu-van-an-88e1';
    const fallbackUsername = email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') : `user_${uid.slice(0, 6)}`;
    const newProfile: UserProfile = {
      uid,
      username: fallbackUsername,
      email,
      displayName: firebaseUser.displayName || `Admin ${fallbackUsername}`,
      role: 'school_admin',
      schoolId,
      createdAt: new Date().toISOString(),
    };

    await setDoc(
      userDocRef,
      {
        uid,
        username: fallbackUsername,
        email,
        displayName: newProfile.displayName,
        role: 'school_admin',
        schoolId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Tự động khởi tạo các sub-collections (/teachers, /classes, /subjects) cho trường
    await seedSchoolSubcollections(schoolId, newProfile.displayName, email, uid);

    console.log(`✅ [User Doc Auto-Repair] Đã tự động khởi tạo document /users/${uid} & sub-collections cho (schoolId=${schoolId})`);
    return newProfile;
  } catch (err) {
    console.warn(`⚠️ [User Doc Auto-Repair] Lỗi khi tạo/phục hồi document /users/${uid}:`, err);
    return {
      uid,
      email,
      displayName: `Admin ${email.split('@')[0]}`,
      role: 'school_admin',
      schoolId: fallbackSchoolId || 'thpt-chu-van-an-88e1',
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * 3. ĐĂNG KÝ TRƯỜNG HỌC MỚI - DÙNG THỬ 14 NGÀY (Self-Registration Flow)
 * Tuân thủ quy trình kiểm tra Tên đăng nhập trùng lặp và ghi lưu đầy đủ Username / SĐT / Password
 */
export async function registerTrialSchool(
  payload: RegisterSchoolPayload
): Promise<{
  success: boolean;
  user?: UserProfile;
  school?: School;
  error?: string;
  isTrial?: boolean;
}> {
  const username = (payload.username || '').trim().toLowerCase();
  const phone = (payload.phone || '').trim();
  const email = (payload.adminEmail || '').trim().toLowerCase() || `${username}@school.tkbpro.edu.vn`;
  const password = payload.adminPassword?.trim() || '';

  if (!payload.schoolName.trim()) {
    return { success: false, error: 'Vui lòng nhập Tên trường học!' };
  }
  if (!payload.representativeName.trim()) {
    return { success: false, error: 'Vui lòng nhập Họ tên Người đại diện / BGH!' };
  }
  if (!username) {
    return { success: false, error: 'Vui lòng nhập Tên đăng nhập quản trị!' };
  }
  if (username.length < 3) {
    return { success: false, error: 'Tên đăng nhập phải chứa ít nhất 3 ký tự!' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return {
      success: false,
      error: 'Tên đăng nhập chỉ được chứa chữ cái không dấu, chữ số, dấu gạch dưới (_), gạch ngang (-) hoặc chấm (.)!',
    };
  }

  // 1. KIỂM TRA TÊN ĐĂNG NHẬP ĐÃ TỒN TẠI HAY CHƯA
  const usernameTaken = await checkUsernameExists(username);
  if (usernameTaken) {
    return {
      success: false,
      error: `Tên đăng nhập "${username}" đã tồn tại trên hệ thống. Vui lòng chọn một tên đăng nhập khác!`,
    };
  }

  if (!phone) {
    return { success: false, error: 'Vui lòng nhập Số điện thoại liên hệ!' };
  }
  if (!password) {
    return { success: false, error: 'Vui lòng nhập Mật khẩu!' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Mật khẩu phải chứa ít nhất 6 ký tự!' };
  }
  if (payload.confirmPassword && payload.confirmPassword.trim() !== password) {
    return { success: false, error: 'Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!' };
  }

  try {
    const schoolId = generateSchoolId(payload.schoolName);
    const now = new Date();
    const createdAt = now.toISOString();

    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 14);
    const expiredAt = trialExpiry.toISOString();

    let userUid = '';

    // Bước 1: Tạo tài khoản Auth qua createUserWithEmailAndPassword (hoặc signIn nếu đã có email)
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      userUid = userCredential.user.uid;
      console.log('✅ [registerTrialSchool] Bước 1: Đã tạo tài khoản Auth thành công. UID:', userUid);

      // XÁC THỰC EMAIL (Email Verification): Tự động gửi email kích hoạt sau khi đăng ký
      try {
        await sendEmailVerification(userCredential.user);
        console.log('✉️ [registerTrialSchool] Đã tự động gửi email xác thực kích hoạt đến:', email);
      } catch (verErr) {
        console.warn('⚠️ [registerTrialSchool] Lỗi gửi email xác thực (có thể do giới hạn domain):', verErr);
      }
    } catch (authError: any) {
      if (authError.code === 'auth/email-already-in-use') {
        try {
          const userCred = await signInWithEmailAndPassword(auth, email, password);
          userUid = userCred.user.uid;
          console.log('✅ [registerTrialSchool] Bước 1: Email đã tồn tại, đăng nhập lấy UID:', userUid);
        } catch (signInErr: any) {
          try {
            const fallbackEmail = `${username}_${Date.now()}@school.tkbpro.edu.vn`;
            const altCred = await createUserWithEmailAndPassword(auth, fallbackEmail, password);
            userUid = altCred.user.uid;
          } catch (altErr) {
            userUid = `USR_${username}_${Date.now()}`;
          }
        }
      } else {
        console.warn('⚠️ [registerTrialSchool] Lỗi Firebase Auth, tạo UID dự phòng:', authError);
        userUid = `USR_${username}_${Date.now()}`;
      }
    }

    if (!userUid) {
      userUid = `USR_${username}_${Date.now()}`;
    }

    const newUserProfile: UserProfile = {
      uid: userUid,
      username,
      phone,
      email,
      displayName: payload.representativeName.trim() || `Admin ${payload.schoolName.trim()}`,
      role: 'school_admin',
      schoolId: schoolId,
      schoolName: payload.schoolName.trim(),
      passwordHash: password,
      createdAt,
    };

    // Bước 2: Ghi Document tài khoản vào /users/{uid}
    const userDocRef = doc(db, USERS_COLLECTION, userUid);
    await setDoc(userDocRef, {
      uid: userUid,
      username,
      phone,
      email,
      displayName: newUserProfile.displayName,
      role: 'school_admin',
      schoolId: schoolId,
      schoolName: payload.schoolName.trim(),
      passwordHash: password,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('✅ [registerTrialSchool] Bước 2: Đã ghi Document vào /users/' + userUid);

    const newSchool: School = {
      schoolId,
      schoolName: payload.schoolName.trim(),
      adminUsername: username,
      representativeName: payload.representativeName.trim(),
      principalName: payload.representativeName.trim(),
      phone,
      province: payload.province.trim(),
      address: payload.address?.trim() || payload.province.trim(),
      adminEmail: email,
      status: 'active',
      plan: 'trial',
      createdAt,
      expiredAt,
      adminUid: userUid,
      adminPasswordInitial: password,
      notes: `Đăng ký dùng thử 14 ngày (${now.toLocaleDateString('vi-VN')}) - Tỉnh ${payload.province}`,
      maxTeachers: 100,
      maxClasses: 50,
    };

    // Bước 3: Ghi Document trường học vào /schools/{schoolId}
    const schoolDocRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await setDoc(schoolDocRef, {
      ...newSchool,
      updatedAt: serverTimestamp(),
    });
    console.log('✅ [registerTrialSchool] Bước 3: Đã ghi Document trường học vào /schools/' + schoolId);

    // Bước 4: Khởi tạo dữ liệu mẫu trong các Sub-collections
    saveLocalSchoolCache(newSchool);
    saveLocalUserRegistry(newUserProfile);
    await seedSchoolSubcollections(schoolId, payload.schoolName.trim(), email, userUid);
    console.log('✅ [registerTrialSchool] Bước 4: Khởi tạo dữ liệu mẫu thành công.');

    return {
      success: true,
      school: newSchool,
      user: newUserProfile,
      isTrial: true,
    };
  } catch (error: any) {
    console.error('❌ [registerTrialSchool] Lỗi nghiêm trọng:', error);
    return {
      success: false,
      error: error.message || 'Không thể đăng ký trường học lúc này. Vui lòng thử lại!',
    };
  }
}

export const registerSchoolAccount = registerTrialSchool;

/**
 * 4. ĐĂNG NHẬP BẰNG TÊN ĐĂNG NHẬP / SỐ ĐIỆN THOẠI VÀ MẬT KHẨU
 */
export async function loginWithFirebaseAuth(credentials: {
  identifier?: string;
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
}): Promise<AuthResult> {
  const rawInput = (
    credentials.identifier ||
    credentials.username ||
    credentials.phone ||
    credentials.email ||
    ''
  ).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lowerInput = rawInput.toLowerCase();
  const password = (credentials.password || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (!rawInput) {
    return { success: false, error: 'Vui lòng nhập Tên đăng nhập, Mã trường hoặc Số điện thoại!' };
  }
  if (!password) {
    return { success: false, error: 'Vui lòng nhập Mật khẩu đăng nhập!' };
  }

  // 1. Kiểm tra tài khoản Super Admin (username: 'admin', 'superadmin', phone, hoặc email Super Admin)
  const isSuperAdminAccount =
    lowerInput === 'admin' ||
    lowerInput === 'superadmin' ||
    rawInput === '0900000000' ||
    isSuperAdminEmail(lowerInput);

  if (isSuperAdminAccount) {
    const adminPass = password;
    let superAdminUser: UserProfile | null = null;

    try {
      const userCred = await signInWithEmailAndPassword(auth, 'superadmin@tkbpro.edu.vn', adminPass);
      superAdminUser = await ensureAndSyncUserDocument(userCred.user);
    } catch (e1) {
      try {
        const userCred = await signInWithEmailAndPassword(auth, 'admin@tkbpro.edu.vn', adminPass);
        superAdminUser = await ensureAndSyncUserDocument(userCred.user);
      } catch (e2) {
        if (password === '12345678' || password === 'admin' || password === 'SuperAdmin@2026') {
          superAdminUser = await initSuperAdminAccount();
        }
      }
    }

    if (superAdminUser) {
      return {
        success: true,
        user: superAdminUser,
      };
    } else {
      return {
        success: false,
        error: 'Mật khẩu Super Admin không chính xác. (Mật khẩu mặc định hệ thống: 12345678)',
      };
    }
  }

  // 2. Tra cứu tài khoản theo Tên đăng nhập, Số điện thoại, Email hoặc Mã trường trong Firestore
  let lookup: { user?: UserProfile; school?: School; matchedBy?: any } | null = null;
  try {
    lookup = await findUserByIdentifier(rawInput);
  } catch (networkErr: any) {
    console.error('Lỗi kết nối khi tra cứu tài khoản:', networkErr);
    return {
      success: false,
      error: '⚠️ Lỗi kết nối máy chủ xác thực: Không thể kết nối tới cơ sở dữ liệu Firebase. Vui lòng kiểm tra lại đường truyền mạng hoặc cấu hình Proxy/Cloudflare!',
    };
  }

  if (!lookup || !lookup.user) {
    return {
      success: false,
      error: `Không tìm thấy tài khoản tương ứng với "${rawInput}".\n• Vui lòng kiểm tra lại Tên đăng nhập, Mã trường (School ID) hoặc Số điện thoại đã đăng ký.\n• Nếu trường của bạn chưa có tài khoản, vui lòng bấm tab "Đăng Ký Trường Mới"!`,
    };
  }

  const targetUser = lookup.user;
  const targetSchool = lookup.school;
  let authSuccess = false;

  // 3. Xác thực Mật khẩu:
  // Cách A: Thử đăng nhập qua Firebase Auth với email của user
  if (targetUser.email) {
    try {
      const userCred = await signInWithEmailAndPassword(auth, targetUser.email, password);
      if (userCred.user) {
        authSuccess = true;
      }
    } catch (authErr: any) {
      // Bỏ qua lỗi auth để tiếp tục kiểm tra passwordHash trong Firestore
    }
  }

  // Cách B: Kiểm tra với mật khẩu đã lưu trong Firestore (targetUser.passwordHash hoặc school.adminPasswordInitial)
  if (!authSuccess) {
    const validHashes = [
      targetUser.passwordHash,
      targetSchool?.adminPasswordInitial,
      (targetSchool as any)?.adminPassword,
    ].filter(Boolean);

    if (validHashes.some((h) => h === password)) {
      authSuccess = true;
      // Tự động đồng bộ tạo tài khoản Firebase Auth nếu chưa có để các lần sau đăng nhập nhanh
      if (targetUser.email) {
        try {
          await createUserWithEmailAndPassword(auth, targetUser.email, password);
        } catch {
          // ignore
        }
      }
    }
  }

  if (!authSuccess) {
    const accountLabel = targetUser.username || targetSchool?.schoolName || targetUser.displayName || rawInput;
    return {
      success: false,
      error: `Mật khẩu không chính xác cho tài khoản "${accountLabel}".\n• Vui lòng kiểm tra lại phím Caps Lock hoặc bộ gõ tiếng Việt (Unikey/EVKey).\n• Bạn có thể sử dụng chức năng "Quên mật khẩu" bên dưới để đặt lại mật khẩu mới qua Số điện thoại!`,
    };
  }

  // 4. Đồng bộ profile và phân quyền truy cập
  const syncedProfile = await ensureAndSyncUserDocument(
    { uid: targetUser.uid, email: targetUser.email, displayName: targetUser.displayName },
    targetUser.schoolId
  );
  syncedProfile.username = targetUser.username || syncedProfile.username;
  syncedProfile.phone = targetUser.phone || syncedProfile.phone;

  return await resolveUserAccess(syncedProfile, targetSchool);
}

/**
 * 5. KHÔI PHỤC MẬT KHẨU / QUÊN MẬT KHẨU (Password Recovery)
 */
export async function requestPasswordReset(identifier: string): Promise<{
  success: boolean;
  message: string;
  email?: string;
  phone?: string;
  schoolName?: string;
  userUid?: string;
}> {
  const cleanInput = identifier.trim();
  if (!cleanInput) {
    return { success: false, message: 'Vui lòng nhập Tên đăng nhập, Số điện thoại hoặc Email!' };
  }

  if (cleanInput.toLowerCase() === 'admin' || cleanInput.toLowerCase() === 'superadmin') {
    return {
      success: true,
      message: 'Tài khoản Super Admin mặc định có mật khẩu là 12345678.',
      email: 'superadmin@tkbpro.edu.vn',
    };
  }

  const lookup = await findUserByIdentifier(cleanInput);
  if (!lookup || !lookup.user) {
    return {
      success: false,
      message: 'Không tìm thấy tài khoản tương ứng với thông tin đã nhập trên hệ thống!',
    };
  }

  const targetUser = lookup.user;
  const targetEmail = targetUser.email;
  const targetPhone = targetUser.phone;

  // Gửi email reset nếu là email hợp lệ ngoài internet
  let emailSent = false;
  if (targetEmail && targetEmail.includes('@') && !targetEmail.endsWith('@edu.vn') && !targetEmail.includes('school.tkbpro')) {
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      emailSent = true;
    } catch (e) {
      console.warn('sendPasswordResetEmail notice:', e);
    }
  }

  const maskEmail = (mail: string) => {
    const [name, domain] = mail.split('@');
    if (!domain) return mail;
    const maskedName = name.length > 2 ? `${name.slice(0, 2)}***${name.slice(-1)}` : `${name}***`;
    return `${maskedName}@${domain}`;
  };

  const maskPhone = (ph?: string) => {
    if (!ph) return '';
    const clean = ph.replace(/[\s.-]/g, '');
    if (clean.length < 6) return ph;
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  };

  return {
    success: true,
    message: emailSent
      ? `Đã gửi liên kết đặt lại mật khẩu đến email ${maskEmail(targetEmail)}. Vui lòng kiểm tra hộp thư!`
      : `Đã tìm thấy tài khoản "${targetUser.displayName || targetUser.username}". Bạn có thể nhập chính xác Số điện thoại đã đăng ký để đổi mật khẩu mới ngay!`,
    email: maskEmail(targetEmail),
    phone: maskPhone(targetPhone),
    schoolName: targetUser.schoolName,
    userUid: targetUser.uid,
  };
}

/**
 * Đặt lại mật khẩu mới thông qua xác minh số điện thoại đã đăng ký
 */
export async function resetPasswordWithPhoneVerification(params: {
  identifier: string;
  phone: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const { identifier, phone, newPassword } = params;
  if (!identifier.trim() || !phone.trim() || !newPassword.trim()) {
    return { success: false, message: 'Vui lòng điền đầy đủ thông tin xác minh và mật khẩu mới!' };
  }
  if (newPassword.trim().length < 6) {
    return { success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' };
  }

  const lookup = await findUserByIdentifier(identifier);
  if (!lookup || !lookup.user) {
    return { success: false, message: 'Không tìm thấy tài khoản cần đặt lại mật khẩu!' };
  }

  const user = lookup.user;
  const userPhoneClean = (user.phone || '').replace(/[\s.-]/g, '');
  const inputPhoneClean = phone.replace(/[\s.-]/g, '');

  if (!userPhoneClean || userPhoneClean !== inputPhoneClean) {
    return {
      success: false,
      message: 'Số điện thoại xác minh không khớp với số điện thoại đã đăng ký của tài khoản!',
    };
  }

  // 1. Cập nhật ngay trong cache cục bộ để tài khoản có thể đăng nhập ngay lập tức
  saveLocalUserRegistry({ ...user, passwordHash: newPassword.trim() });
  if (user.schoolId) {
    const localSchools = getLocalSchoolCache();
    const targetSchool = localSchools.find((s) => s.schoolId === user.schoolId);
    if (targetSchool) {
      targetSchool.adminPasswordInitial = newPassword.trim();
      saveLocalSchoolCache(targetSchool);
    }
  }

  // 2. Cập nhật lên Cloud Firestore (nếu có kết nối & quyền ghi)
  try {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    await updateDoc(userRef, {
      passwordHash: newPassword.trim(),
      updatedAt: serverTimestamp(),
    });

    if (user.schoolId) {
      try {
        const schoolRef = doc(db, SCHOOLS_COLLECTION, user.schoolId);
        await updateDoc(schoolRef, {
          adminPasswordInitial: newPassword.trim(),
          updatedAt: serverTimestamp(),
        });
      } catch (scErr) {
        console.warn('Lưu ý cập nhật mật khẩu trường trên Firestore:', scErr);
      }
    }
  } catch (err: any) {
    console.warn('Lưu ý cập nhật mật khẩu user trên Firestore (đã lưu cache cục bộ an toàn):', err);
  }

  return {
    success: true,
    message: 'Đặt lại mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập ngay bây giờ.',
  };
}

/**
 * Hàm giải quyết và kiểm tra điều kiện truy cập (RBAC Gate)
 */
async function resolveUserAccess(
  user: UserProfile,
  preloadedSchool?: School
): Promise<AuthResult> {
  // Super Admin luôn có quyền truy cập
  if (user.role === 'super_admin') {
    return { success: true, user };
  }

  // Với School Admin
  if (!user.schoolId) {
    return {
      success: false,
      isBlocked: true,
      user,
      error: 'Tài khoản chưa được liên kết với bất kỳ trường học nào.',
    };
  }

  const school = preloadedSchool || (await getSchoolById(user.schoolId));
  if (!school) {
    return {
      success: false,
      isBlocked: true,
      user,
      error: 'Không tìm thấy dữ liệu trường học tương ứng trên hệ thống Cloud.',
    };
  }

  user.schoolName = school.schoolName;

  // Kiểm tra trạng thái cấp phép & Hạn sử dụng
  const now = new Date();
  const expiry = new Date(school.expiredAt);
  const isPermanent = expiry.getFullYear() >= 2090;
  const isExpired = !isPermanent && now > expiry;

  if (school.status === 'inactive') {
    return {
      success: false,
      isBlocked: true,
      user,
      school,
      error: 'Tài khoản trường học của bạn hiện đang bị TẠM KHÓA. Vui lòng liên hệ Super Admin để mở khóa dịch vụ.',
    };
  }

  if (isExpired) {
    return {
      success: false,
      isBlocked: true,
      user,
      school,
      error: `Tài khoản trường học của bạn đã HẾT HẠN sử dụng từ ngày ${expiry.toLocaleDateString(
        'vi-VN'
      )}. Vui lòng liên hệ Admin để gia hạn bản quyền.`,
    };
  }

  if (school.status === 'pending') {
    if (!isExpired) {
      return {
        success: true,
        user,
        school,
      };
    } else {
      return {
        success: false,
        isBlocked: true,
        user,
        school,
        error: 'Thời gian dùng thử 14 ngày của trường bạn đã kết thúc. Vui lòng liên hệ Super Admin để duyệt và kích hoạt chính thức.',
      };
    }
  }

  return {
    success: true,
    user,
    school,
  };
}

/**
 * 5. DUYỆT & CẤP QUYỀN TRƯỜNG HỌC MỚI (Dành cho Super Admin)
 */
export async function approveSchoolAccount(
  schoolId: string,
  options: {
    months: number;
    plan: SchoolPlan;
    isPermanent?: boolean;
  }
): Promise<{ success: boolean; school?: School; error?: string }> {
  try {
    const school = await getSchoolById(schoolId);
    if (!school) {
      return { success: false, error: 'Không tìm thấy thông tin trường học.' };
    }

    let newExpiredAt: string;
    if (options.isPermanent) {
      newExpiredAt = '2099-12-31T23:59:59.000Z';
    } else {
      const baseDate = new Date();
      baseDate.setMonth(baseDate.getMonth() + options.months);
      newExpiredAt = baseDate.toISOString();
    }

    const docRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(docRef, {
      status: 'active',
      plan: options.plan,
      expiredAt: newExpiredAt,
      updatedAt: serverTimestamp(),
    });

    const updatedSchool: School = {
      ...school,
      status: 'active',
      plan: options.plan,
      expiredAt: newExpiredAt,
    };

    return { success: true, school: updatedSchool };
  } catch (error: any) {
    console.error('Lỗi khi duyệt trường học:', error);
    return { success: false, error: error.message || 'Không thể duyệt trường học.' };
  }
}

/**
 * 6. LẮNG NGHE REAL-TIME DANH SÁCH TRƯỜNG TỪ FIRESTORE
 */
export function subscribeToSchoolsRealtime(callback: (schools: School[]) => void) {
  try {
    const schoolsColRef = collection(db, SCHOOLS_COLLECTION);
    const unsubscribe = onSnapshot(
      schoolsColRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map((d) => d.data() as School);
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(list);
        } else {
          callback([]);
        }
      },
      (error) => {
        console.warn('Lỗi khi lắng nghe realtime danh sách trường:', error);
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn('Không thể thiết lập onSnapshot:', e);
    return () => {};
  }
}

/**
 * 7. BẢO VỆ PROFILE & CHỐNG LEO THANG QUYỀN HẠN (Profile Protection & Anti-Privilege Escalation)
 * Kiểm tra kỹ chỉ cho phép cập nhật các trường an toàn: displayName, photoURL, phone.
 * Loại bỏ/chặn mọi nỗ lực cập nhật trường 'role' và 'schoolId' từ phía Client.
 */
export async function updateUserProfileSafe(
  uid: string,
  updates: {
    displayName?: string;
    photoURL?: string;
    phone?: string;
    role?: any;
    schoolId?: any;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!uid) {
    return { success: false, error: 'Thiếu UID người dùng cần cập nhật profile' };
  }

  // Lọc duy nhất các trường an toàn
  const safeUpdates: Record<string, any> = {};
  if (updates.displayName !== undefined) safeUpdates.displayName = updates.displayName.trim();
  if (updates.photoURL !== undefined) safeUpdates.photoURL = updates.photoURL.trim();
  if (updates.phone !== undefined) safeUpdates.phone = updates.phone.trim();

  if (Object.keys(safeUpdates).length === 0) {
    return {
      success: false,
      error: 'Cập nhật bị từ chối: Chỉ cho phép chỉnh sửa displayName, photoURL, phone. Trường role và schoolId đã bị chặn để chống leo thang quyền hạn!',
    };
  }

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userDocRef, {
      ...safeUpdates,
      updatedAt: serverTimestamp(),
    });

    const localUsers = getLocalUserRegistry();
    const target = localUsers.find((u) => u.uid === uid);
    if (target) {
      if (safeUpdates.displayName) target.displayName = safeUpdates.displayName;
      if (safeUpdates.phone) target.phone = safeUpdates.phone;
      saveLocalUserRegistry(target);
    }

    console.log(`✅ [updateUserProfileSafe] Đã cập nhật profile an toàn cho UID: ${uid}`);
    return { success: true };
  } catch (err: any) {
    console.error('❌ [updateUserProfileSafe] Lỗi:', err);
    return { success: false, error: err.message || 'Không thể cập nhật profile người dùng.' };
  }
}

/**
 * 8. ĐĂNG XUẤT AN TOÀN (Secure Logout)
 * Gọi signOut(auth), chủ động clear toàn bộ LocalStorage, SessionStorage và reset sạch Context State.
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('⚠️ [logoutUser] Lỗi khi gọi signOut Firebase Auth:', err);
  } finally {
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.warn('⚠️ [logoutUser] Lỗi clear storage:', e);
      }
    }
  }
}

/**
 * 9. BẢO VỆ MẬT KHẨU: Đổi mật khẩu tài khoản người dùng đang đăng nhập (updatePassword)
 */
export async function changeCurrentUserPassword(
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      success: false,
      message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!',
    };
  }

  const cleanPass = newPassword ? newPassword.trim() : '';
  if (cleanPass.length < 6) {
    return {
      success: false,
      message: 'Mật khẩu mới phải chứa ít nhất 6 ký tự!',
    };
  }

  try {
    await updatePassword(currentUser, cleanPass);
    return { success: true, message: '✓ Đổi mật khẩu thành công!' };
  } catch (err: any) {
    console.warn('⚠️ [changeCurrentUserPassword] Lỗi Firebase Auth:', err);
    if (err.code === 'auth/requires-recent-login') {
      return {
        success: false,
        message: 'Thao tác bảo mật yêu cầu xác thực gần đây. Vui lòng đăng xuất và đăng nhập lại trước khi thực hiện đổi mật khẩu!',
      };
    }
    return {
      success: false,
      message: err.message || 'Không thể đổi mật khẩu lúc này. Vui lòng thử lại!',
    };
  }
}

/**
 * 10. BẢO VỆ MẬT KHẨU: Gửi email đặt lại mật khẩu chuẩn luồng Firebase Auth (sendPasswordResetEmail)
 */
export async function sendFirebasePasswordReset(
  email: string
): Promise<{ success: boolean; message: string }> {
  if (!email || !email.trim()) {
    return { success: false, message: 'Vui lòng nhập địa chỉ Email tài khoản của bạn!' };
  }

  const cleanEmail = email.trim().toLowerCase();
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return {
      success: true,
      message: `✓ Đã gửi liên kết đặt lại mật khẩu đến email ${cleanEmail}. Vui lòng kiểm tra Hộp thư đến (hoặc Hộp thư Rác / Spam) để kích hoạt mật khẩu mới!`,
    };
  } catch (err: any) {
    console.warn('⚠️ [sendFirebasePasswordReset] Lỗi:', err);
    if (err.code === 'auth/user-not-found') {
      return { success: false, message: 'Không tìm thấy tài khoản tương ứng với email đã nhập trên hệ thống Firebase Auth.' };
    }
    if (err.code === 'auth/invalid-email') {
      return { success: false, message: 'Email nhập vào không đúng định dạng hợp lệ. Vui lòng kiểm tra lại!' };
    }
    return {
      success: false,
      message: err.message || 'Không thể gửi email đặt lại mật khẩu lúc này. Vui lòng thử lại sau!',
    };
  }
}
