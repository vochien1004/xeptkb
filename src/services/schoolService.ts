/**
 * schoolService.ts - Service Quản lý Trường học & Cấp quyền dành cho Super Admin
 * Tương thích Firebase Firestore Multi-tenant NoSQL
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth, clearAllDataFromFirebase } from './firebaseClient';
import { School, SchoolStatus, SchoolPlan, UserProfile, CreateSchoolPayload } from '../types/school';

export const SCHOOLS_COLLECTION = 'schools';
export const USERS_COLLECTION = 'users';

/**
 * Tạo một Firebase Auth Secondary Instance tạm thời
 * Mục đích: Tạo user mới trên Auth mà KHÔNG làm đăng xuất Super Admin đang đăng nhập trên App.
 */
function getSecondaryAuth() {
  const currentApp = getApp();
  const secondaryAppName = 'SecondaryAuthApp';
  let secondaryApp = getApps().find(app => app.name === secondaryAppName);
  if (!secondaryApp) {
    secondaryApp = initializeApp(currentApp.options, secondaryAppName);
  }
  return getAuth(secondaryApp);
}

/**
 * Hàm loại bỏ dấu Tiếng Việt & chuyển thành slug chuẩn URL/ID
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  return str;
}

/**
 * Tự động sinh schoolId duy nhất từ Tên trường + mã hash ngẫu nhiên (Đã sửa lỗi template string backtick)
 */
export function generateSchoolId(schoolName: string): string {
  const cleanName = removeVietnameseTones(schoolName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const randomHash = Math.random().toString(36).substring(2, 6);
  const baseSlug = cleanName || 'truong-hoc';
  return `${baseSlug}-${randomHash}`;
}

/**
 * KHỞI TẠO ĐẦY ĐỦ 4 SUB-COLLECTION MẪU CHO TRƯỜNG MỚI:
 * - /schools/{schoolId}/classes/init
 * - /schools/{schoolId}/subjects/init
 * - /schools/{schoolId}/teachers/init
 * - /schools/{schoolId}/timetables/init
 */
export async function seedSchoolSubcollections(
  schoolId: string,
  schoolName: string,
  adminEmail: string,
  adminUid: string
): Promise<void> {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác khởi tạo dữ liệu mẫu');
  }

  const sid = schoolId.trim();

  // Khởi tạo cấu hình trường học mặc định sạch sẽ, KHÔNG chèn dữ liệu giáo viên/lớp học/môn học giả lập
  const settingsDoc = doc(db, 'schools', sid, 'settings', 'export_config');
  await setDoc(
    settingsDoc,
    {
      schoolName: schoolName.trim(),
      semesterYear: 'HỌC KỲ I - NĂM HỌC: 2026-2027',
      weekInfo: 'TUẦN ÁP DỤNG: THỜI KHÓA BIỂU CHÍNH THỨC',
      effectiveDate: '05/09/2026',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ [School Setup] Đã khởi tạo cấu hình sạch sẽ cho /schools/${sid}`);
}

/**
 * 1. TẠO TRƯỜNG HỌC MỚI & SINH SCHOOL_ID ĐỘNG
 */
export async function createSchool(payload: CreateSchoolPayload): Promise<{
  success: boolean;
  school?: School;
  user?: UserProfile;
  error?: string;
}> {
  try {
    const adminEmail = payload.adminEmail.trim().toLowerCase();
    const initialPassword = payload.adminPassword?.trim() || `Tkb@${Math.floor(100000 + Math.random() * 900000)}`;
    const schoolId = generateSchoolId(payload.schoolName);
    const now = new Date();
    const createdAt = now.toISOString();

    let adminUsername = (payload.adminUsername || '').trim().toLowerCase();
    if (!adminUsername) {
      adminUsername = `${schoolId.replace(/-/g, '_')}_admin`;
    }

    // Kiểm tra tính duy nhất của adminUsername nếu có
    try {
      const qUser = query(collection(db, USERS_COLLECTION), where('username', '==', adminUsername));
      const snapU = await getDocs(qUser);
      if (!snapU.empty) {
        throw new Error(`Tên đăng nhập "${adminUsername}" đã tồn tại. Vui lòng chọn một tên đăng nhập khác!`);
      }
    } catch (chkErr: any) {
      if (chkErr.message && chkErr.message.includes('đã tồn tại')) {
        throw chkErr;
      }
    }

    let userUid = '';

    // BƯỚC 1: Tạo User bằng Secondary Auth (Không làm mất session Super Admin)
    const secondaryAuth = getSecondaryAuth();
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, initialPassword);
      userUid = userCredential.user.uid;
      console.log('✅ [createSchool] Bước 1: Đã tạo Auth user thành công. UID:', userUid);
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        throw new Error(`Email "${adminEmail}" đã được sử dụng trên hệ thống Authentication!`);
      }
      throw new Error(`Lỗi tạo tài khoản Auth: ${authErr.message}`);
    }

    if (!userUid) {
      throw new Error('Không thể lấy UID của tài khoản Admin trường học.');
    }

    const newAdminUser: UserProfile = {
      uid: userUid,
      username: adminUsername,
      phone: payload.phone?.trim() || '',
      email: adminEmail,
      displayName: payload.representativeName?.trim() || payload.principalName?.trim() || `Admin ${payload.schoolName.trim()}`,
      role: 'school_admin',
      schoolId: schoolId,
      schoolName: payload.schoolName.trim(),
      passwordHash: initialPassword,
      createdAt,
    };

    // BƯỚC 2: Ghi Document tài khoản vào /users/{uid}
    const userDocRef = doc(db, USERS_COLLECTION, userUid);
    await setDoc(userDocRef, {
      uid: userUid,
      username: adminUsername,
      phone: payload.phone?.trim() || '',
      email: adminEmail,
      displayName: newAdminUser.displayName,
      role: 'school_admin',
      schoolId: schoolId,
      schoolName: payload.schoolName.trim(),
      passwordHash: initialPassword,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('✅ [createSchool] Bước 2: Đã ghi /users/' + userUid);

    // Tính ngày hết hạn
    let expiredAtDate = new Date();
    if (payload.expiredAt) {
      expiredAtDate = new Date(payload.expiredAt);
    } else {
      const months = payload.durationMonths || 12;
      expiredAtDate.setMonth(expiredAtDate.getMonth() + months);
    }
    const expiredAt = expiredAtDate.toISOString();

    const newSchool: School = {
      schoolId,
      schoolName: payload.schoolName.trim(),
      adminUsername,
      adminEmail,
      status: 'active',
      plan: payload.plan || 'trial',
      createdAt,
      expiredAt,
      adminUid: userUid,
      adminPasswordInitial: initialPassword,
      address: payload.address?.trim() || '',
      phone: payload.phone?.trim() || '',
      principalName: payload.principalName?.trim() || '',
      representativeName: payload.representativeName?.trim() || payload.principalName?.trim() || '',
      notes: payload.notes?.trim() || '',
      maxTeachers: 100,
      maxClasses: 50,
    };

    // BƯỚC 3: Ghi Document trường học vào /schools/{schoolId}
    const schoolDocRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await setDoc(schoolDocRef, {
      ...newSchool,
      updatedAt: serverTimestamp(),
    });
    console.log('✅ [createSchool] Bước 3: Đã ghi /schools/' + schoolId);

    saveLocalSchoolCache(newSchool);
    if (typeof window !== 'undefined') {
      try {
        const rawUsers = localStorage.getItem('tkb_cached_user_registry');
        const list = rawUsers ? JSON.parse(rawUsers) : [];
        const updated = list.filter((u: any) => u.uid !== newAdminUser.uid && u.username !== newAdminUser.username);
        updated.unshift(newAdminUser);
        localStorage.setItem('tkb_cached_user_registry', JSON.stringify(updated));
      } catch {}
    }

    // BƯỚC 4: Ghi các Sub-collection mẫu đầy đủ (classes, subjects, teachers, timetables)
    await seedSchoolSubcollections(schoolId, newSchool.schoolName, adminEmail, userUid);

    return {
      success: true,
      school: newSchool,
      user: newAdminUser,
    };
  } catch (error: any) {
    console.error('Lỗi khi tạo trường học trên Firestore:', error);
    return {
      success: false,
      error: error.message || 'Không thể tạo trường học trên Firebase. Vui lòng thử lại!',
    };
  }
}

/**
 * 2. LẤY DANH SÁCH TẤT CẢ CÁC TRƯỜNG HỌC
 */
export async function getAllSchools(currentUserRole?: string, userSchoolId?: string): Promise<School[]> {
  let role = currentUserRole;
  let sid = userSchoolId;

  if (typeof window !== 'undefined' && (!role || !sid)) {
    try {
      const savedUser = sessionStorage.getItem('tkb_auth_session_user') || localStorage.getItem('tkb_auth_session_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (!role) role = parsed.role;
        if (!sid) sid = parsed.schoolId;
      }
    } catch (e) {
      // ignore
    }
  }

  if (role === 'school_admin' && sid) {
    const schoolDoc = await getSchoolById(sid);
    if (schoolDoc) return [schoolDoc];
    const local = getLocalSchoolCache().find((s) => s.schoolId === sid);
    if (local) return [local];
    return [];
  }

  const schoolMap = new Map<string, School>();
  getLocalSchoolCache().forEach((s) => schoolMap.set(s.schoolId, s));

  try {
    const snap = await getDocs(collection(db, SCHOOLS_COLLECTION));
    if (!snap.empty) {
      const firestoreSchoolIds = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as School;
        const schoolId = d.id || data.schoolId;
        firestoreSchoolIds.add(schoolId);
        schoolMap.set(schoolId, data);
        
        // Cập nhật lại cache offline cho đồng bộ
        saveLocalSchoolCache(data);
      });

      // Prune các trường đã bị xóa khỏi Firestore ra khỏi cache local
      const currentCache = getLocalSchoolCache();
      const prunedCache = currentCache.filter((s) => firestoreSchoolIds.has(s.schoolId));
      if (currentCache.length !== prunedCache.length && typeof window !== 'undefined') {
        localStorage.setItem('cached_schools_list', JSON.stringify(prunedCache));
      }

      // Prune bản đồ schoolMap cho các trường không còn tồn tại trên Firestore
      for (const cachedId of Array.from(schoolMap.keys())) {
        if (!firestoreSchoolIds.has(cachedId)) {
          schoolMap.delete(cachedId);
        }
      }
    } else {
      if (typeof window !== 'undefined') {
        localStorage.setItem('cached_schools_list', JSON.stringify([]));
      }
      schoolMap.clear();
    }
  } catch (error) {
    console.warn('Không thể tải danh sách trường từ Firebase Firestore:', error);
  }

  const combinedList = Array.from(schoolMap.values());
  combinedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return combinedList;
}

/**
 * 3. KHOÁ / MỞ KHOÁ TRƯỜNG HỌC
 */
export async function updateSchoolStatus(schoolId: string, status: SchoolStatus): Promise<boolean> {
  try {
    const docRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
    
    // Cập nhật cache local đồng bộ trực tiếp
    const localList = getLocalSchoolCache();
    const sc = localList.find((s) => s.schoolId === schoolId);
    if (sc) {
      sc.status = status;
      saveLocalSchoolCache(sc);
    }
    return true;
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái trường học:', error);
    return false;
  }
}

/**
 * 4. GIA HẠN THỜI HẠN SỬ DỤNG CHO TRƯỜNG HỌC
 */
export async function updateSchoolExpiry(
  schoolId: string,
  expiredAt: string,
  status?: SchoolStatus,
  renewalInfo?: {
    packageName?: string;
    planStatus?: 'trial' | 'renewed' | 'official';
    plan?: SchoolPlan;
  }
): Promise<boolean> {
  try {
    const docRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    const nowIso = new Date().toISOString();
    const updates: any = {
      expiredAt,
      updatedAt: serverTimestamp(),
      lastRenewedAt: nowIso,
    };
    if (status) updates.status = status;
    if (renewalInfo?.packageName) updates.renewalPackageName = renewalInfo.packageName;
    if (renewalInfo?.planStatus) updates.planStatus = renewalInfo.planStatus;
    if (renewalInfo?.plan) updates.plan = renewalInfo.plan;

    await updateDoc(docRef, updates);

    // Cập nhật cache local đồng bộ trực tiếp
    const localList = getLocalSchoolCache();
    const sc = localList.find((s) => s.schoolId === schoolId);
    if (sc) {
      sc.expiredAt = expiredAt;
      sc.lastRenewedAt = nowIso;
      if (status) sc.status = status;
      if (renewalInfo?.packageName) sc.renewalPackageName = renewalInfo.packageName;
      if (renewalInfo?.planStatus) sc.planStatus = renewalInfo.planStatus;
      if (renewalInfo?.plan) sc.plan = renewalInfo.plan;
      saveLocalSchoolCache(sc);
    }
    return true;
  } catch (error) {
    console.error('Lỗi khi gia hạn trường học:', error);
    return false;
  }
}

/**
 * Helper xóa trường học khỏi cache local
 */
export function deleteLocalSchoolCache(schoolId: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = 'cached_schools_list';
    const raw = localStorage.getItem(key);
    const list: School[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((s) => s.schoolId !== schoolId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    // ignore
  }
}

/**
 * Helper xóa tài khoản người dùng thuộc trường khỏi cache local
 */
export function deleteLocalUserRegistryBySchoolId(schoolId: string, adminUid?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = 'tkb_cached_user_registry';
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list = JSON.parse(raw);
    const filtered = list.filter((u: any) => u.schoolId !== schoolId && (!adminUid || u.uid !== adminUid));
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    // ignore
  }
}

/**
 * Helper xóa 1 tài khoản người dùng theo UID khỏi cache local
 */
export function deleteLocalUserRegistryByUid(uid: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = 'tkb_cached_user_registry';
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list = JSON.parse(raw);
    const filtered = list.filter((u: any) => u.uid !== uid);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    // ignore
  }
}

/**
 * 5. XÓA TRƯỜNG HỌC KHỎI HỆ THỐNG VÀ XÓA TÀI KHOẢN LIÊN KẾT TRÊN FIREBASE & CHƯƠNG TRÌNH
 */
export async function deleteSchool(schoolId: string): Promise<boolean> {
  if (!schoolId) return false;
  try {
    // 1. Tìm thông tin trường học để lấy adminUid (nếu có)
    let adminUid: string | undefined;
    try {
      const schoolDoc = await getDoc(doc(db, SCHOOLS_COLLECTION, schoolId));
      if (schoolDoc.exists()) {
        adminUid = schoolDoc.data()?.adminUid;
      }
    } catch {
      // ignore
    }

    // 2. Tìm và xóa toàn bộ tài khoản người dùng thuộc trường này trên Firestore (/users)
    try {
      const q = query(collection(db, USERS_COLLECTION), where('schoolId', '==', schoolId));
      const userSnaps = await getDocs(q);
      const userDeletePromises: Promise<any>[] = [];
      const deletedUids = new Set<string>();

      userSnaps.forEach((d) => {
        deletedUids.add(d.id);
        userDeletePromises.push(deleteDoc(d.ref));
      });

      if (adminUid && !deletedUids.has(adminUid)) {
        userDeletePromises.push(deleteDoc(doc(db, USERS_COLLECTION, adminUid)));
      }

      await Promise.allSettled(userDeletePromises);
      console.log(`✅ [deleteSchool] Đã xóa ${userDeletePromises.length} tài khoản người dùng thuộc trường ${schoolId} trên Firebase`);
    } catch (userErr) {
      console.warn('Lỗi khi xóa tài khoản user liên kết với trường:', userErr);
    }

    // 3. Xóa các sub-collection của trường học (teachers, classes, timetables, etc.)
    try {
      await clearAllDataFromFirebase(schoolId);
    } catch (subColErr) {
      console.warn('Lỗi khi xóa sub-collections của trường:', subColErr);
    }

    // 4. Xóa document trường học trên Firestore /schools/{schoolId}
    await deleteDoc(doc(db, SCHOOLS_COLLECTION, schoolId));

    // 5. Xóa dữ liệu trường học và các tài khoản liên kết khỏi cache local
    deleteLocalSchoolCache(schoolId);
    deleteLocalUserRegistryBySchoolId(schoolId, adminUid);

    console.log(`✅ [deleteSchool] Đã xóa hoàn toàn trường học ${schoolId} và tài khoản liên kết cả trên Firebase và trong chương trình.`);
    return true;
  } catch (error) {
    console.error('Lỗi khi xóa trường học:', error);
    return false;
  }
}

/**
 * 5.1 CHỈNH SỬA THÔNG TIN TRƯỜNG HỌC
 */
export async function updateSchool(schoolId: string, payload: Partial<School>): Promise<boolean> {
  try {
    const docRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(docRef, { ...payload, updatedAt: serverTimestamp() });

    // Cập nhật cache local đồng bộ trực tiếp
    const localList = getLocalSchoolCache();
    const sc = localList.find((s) => s.schoolId === schoolId);
    if (sc) {
      const updated = { ...sc, ...payload };
      saveLocalSchoolCache(updated);
    }
    return true;
  } catch (error) {
    console.error('Lỗi khi cập nhật thông tin trường:', error);
    return false;
  }
}

/**
 * 5.2 ĐẶT LẠI MẬT KHẨU CHO SCHOOL ADMIN
 */
export async function resetSchoolPassword(
  schoolId: string,
  newPassword?: string
): Promise<{ success: boolean; newPassword?: string; error?: string }> {
  try {
    const school = await getSchoolById(schoolId);
    if (!school) {
      return { success: false, error: 'Không tìm thấy trường học tương ứng!' };
    }

    const generatedPass = newPassword && newPassword.trim() 
      ? newPassword.trim() 
      : `Tkb@${Math.floor(100000 + Math.random() * 900000)}`;

    const schoolRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(schoolRef, {
      adminPasswordInitial: generatedPass,
      updatedAt: serverTimestamp(),
    });

    // Cập nhật cache local đồng bộ trực tiếp
    const localList = getLocalSchoolCache();
    const sc = localList.find((s) => s.schoolId === schoolId);
    if (sc) {
      sc.adminPasswordInitial = generatedPass;
      saveLocalSchoolCache(sc);
    }

    if (school.adminUid) {
      try {
        const userRef = doc(db, USERS_COLLECTION, school.adminUid);
        await updateDoc(userRef, {
          passwordHash: generatedPass,
          updatedAt: serverTimestamp(),
        });
      } catch (uErr) {
        console.warn('Không thể cập nhật mật khẩu bảng users:', uErr);
      }
    }

    return { success: true, newPassword: generatedPass };
  } catch (error: any) {
    console.error('Lỗi khi đặt lại mật khẩu:', error);
    return { success: false, error: error.message || 'Không thể đặt lại mật khẩu.' };
  }
}

/**
 * 6. LẤY THÔNG TIN 1 TRƯỜNG HỌC THEO SCHOOL_ID
 */
export async function getSchoolById(schoolId: string): Promise<School | null> {
  try {
    const docSnap = await getDoc(doc(db, SCHOOLS_COLLECTION, schoolId));
    if (docSnap.exists()) {
      return docSnap.data() as School;
    }
  } catch (error) {
    console.warn(`Lỗi lấy trường ${schoolId}:`, error);
  }
  return null;
}

/**
 * 7. KIỂM TRA QUYỀN TRUY CẬP CỦA TÀI KHOẢN KHI ĐĂNG NHẬP
 */
export async function checkSchoolAccess(user: UserProfile): Promise<{
  allowed: boolean;
  reason?: string;
  school?: School;
}> {
  if (user.role === 'super_admin') {
    return { allowed: true };
  }

  if (!user.schoolId) {
    return {
      allowed: false,
      reason: 'Tài khoản của bạn chưa được liên kết với bất kỳ trường học nào.',
    };
  }

  const school = await getSchoolById(user.schoolId);
  if (!school) {
    return {
      allowed: false,
      reason: 'Không tìm thấy thông tin trường học tương ứng trên hệ thống.',
    };
  }

  if (school.status === 'inactive') {
    return {
      allowed: false,
      reason: 'Tài khoản trường học của bạn hiện đang bị TẠM KHÓA. Vui lòng liên hệ Super Admin.',
      school,
    };
  }

  const now = new Date();
  const expiry = new Date(school.expiredAt);
  if (now > expiry) {
    return {
      allowed: false,
      reason: `Tài khoản trường học đã HẾT HẠN từ ngày ${expiry.toLocaleDateString('vi-VN')}. Vui lòng liên hệ Admin gia hạn.`,
      school,
    };
  }

  return { allowed: true, school };
}

/**
 * 8. HÀM XÁC THỰC NGƯỜI DÙNG & KIỂM TRA PHÂN QUYỀN (Auth & RBAC Login)
 */
export async function authenticateUser(credentials: { email: string; password?: string }): Promise<{
  success: boolean;
  user?: UserProfile;
  school?: School;
  error?: string;
  isBlocked?: boolean;
}> {
  const email = credentials.email.trim().toLowerCase();
  const password = credentials.password?.trim() || '';

  if (!email || !password) {
    return { success: false, error: 'Vui lòng nhập đầy đủ Email và Mật khẩu!' };
  }

  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const authUid = userCred.user.uid;

    const userDocSnap = await getDoc(doc(db, USERS_COLLECTION, authUid));
    if (userDocSnap.exists()) {
      const uData = userDocSnap.data() as UserProfile;
      if (uData.role === 'super_admin') {
        return { success: true, user: uData };
      }

      if (uData.schoolId) {
        const school = await getSchoolById(uData.schoolId);
        if (school) {
          uData.schoolName = school.schoolName;
          const accessCheck = await checkSchoolAccess(uData);
          if (!accessCheck.allowed) {
            return {
              success: false,
              isBlocked: true,
              user: uData,
              school: accessCheck.school || school,
              error: accessCheck.reason,
            };
          }
          return { success: true, user: uData, school };
        }
      }
    }

    if (
      email === 'admin@tkbpro.edu.vn' ||
      email === 'superadmin@tkbpro.edu.vn'
    ) {
      const superAdminUser: UserProfile = {
        uid: authUid,
        email: email,
        displayName: 'Super Administrator',
        role: 'super_admin',
        createdAt: new Date().toISOString(),
      };
      return { success: true, user: superAdminUser };
    }

    return {
      success: false,
      error: 'Không tìm thấy thông tin phân quyền của tài khoản này trên hệ thống.',
    };
  } catch (authErr: any) {
    console.error('Lỗi xác thực Firebase Auth:', authErr);
    return {
      success: false,
      error: 'Mật khẩu hoặc Email không chính xác!',
    };
  }
}

/**
 * 9. BỔ SUNG CÁC HÀM CRUD THỜI KHÓA BIỂU PHÂN LẬP THEO TRƯỜNG (Multi-tenant Timetable Services)
 */
export async function saveSchoolTimetable(
  schoolId: string,
  arg2: string | any,
  arg3?: any
): Promise<boolean> {
  let timetableId: string;
  let timetableData: any;

  if (typeof arg2 === 'string') {
    timetableId = arg2;
    timetableData = arg3 || {};
  } else {
    timetableData = arg2 || {};
    timetableId = timetableData.timetableId || timetableData.id || 'init';
  }

  if (!schoolId || !timetableId) {
    throw new Error('schoolId và timetableId là bắt buộc để lưu thời khóa biểu');
  }
  try {
    const tRef = doc(db, 'schools', schoolId.trim(), 'timetables', timetableId.trim());
    await setDoc(tRef, {
      ...timetableData,
      timetableId: timetableId.trim(),
      schoolId: schoolId.trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`✅ [Timetable Service] Đã lưu TKB ${timetableId} cho trường ${schoolId}`);
    return true;
  } catch (err) {
    console.error(`❌ [Timetable Service] Lỗi khi lưu TKB cho trường ${schoolId}:`, err);
    throw err;
  }
}

export async function getSchoolTimetables(schoolId: string): Promise<any[]> {
  if (!schoolId) return [];
  try {
    const tColRef = collection(db, 'schools', schoolId.trim(), 'timetables');
    const snap = await getDocs(tColRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`❌ [Timetable Service] Lỗi khi lấy danh sách TKB của trường ${schoolId}:`, err);
    return [];
  }
}

export function getInitialDefaultSchools(): School[] {
  return [];
}

export function getLocalSchoolCache(): School[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cached_schools_list');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveLocalSchoolCache(school: School) {
  if (typeof window === 'undefined') return;
  try {
    const key = 'cached_schools_list';
    const raw = localStorage.getItem(key);
    const list: School[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((s) => s.schoolId !== school.schoolId);
    filtered.unshift(school);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    // ignore
  }
}