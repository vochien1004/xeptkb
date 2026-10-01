/**
 * superAdminService.ts - Các nghiệp vụ chuyên sâu và thống kê quản trị hệ thống dành cho Super Admin
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { School, UserProfile, SchoolStatus, SchoolPlan } from '../types/school';
import {
  getSchoolById,
  deleteSchool,
  SCHOOLS_COLLECTION,
  USERS_COLLECTION,
  deleteLocalUserRegistryByUid,
  getAllSchools,
  getLocalSchoolCache,
  saveLocalSchoolCache,
} from './schoolService';

export interface SystemAnalytics {
  totalSchools: number;
  activeSchools: number;
  trialSchools: number;
  expiredSchools: number;
  expiringIn7Days: number;
  totalUsers: number;
}

/**
 * 1. TRUY VẤN TOÀN BỘ DANH SÁCH TÀI KHOẢN NGƯỜI DÙNG (/users)
 * Tự động phát hiện và loại bỏ các tài khoản của những trường học ĐÃ BỊ XÓA (Cả trên Firebase & Cache)
 */
export async function getSystemUsers(existingSchools?: School[]): Promise<UserProfile[]> {
  try {
    // 1. Xác định danh sách các School ID đang hợp lệ và tồn tại
    let schoolsList = existingSchools;
    if (!schoolsList || schoolsList.length === 0) {
      try {
        schoolsList = await getAllSchools();
      } catch {
        schoolsList = getLocalSchoolCache();
      }
    }
    const validSchoolIdSet = new Set((schoolsList || []).map((s) => s.schoolId));

    const snap = await getDocs(collection(db, USERS_COLLECTION));
    if (snap.empty) return [];

    const activeUsers: UserProfile[] = [];
    const orphanedDocRefs: any[] = [];
    const orphanedUids: string[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      const role = data.role || 'school_admin';
      const schoolId = data.schoolId || undefined;

      // Tài khoản Super Admin không phụ thuộc vào trường
      if (role === 'super_admin') {
        activeUsers.push({
          uid: d.id,
          username: data.username,
          phone: data.phone,
          email: data.email || '',
          displayName: data.displayName || 'Super Administrator',
          role: 'super_admin',
          createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
        } as UserProfile);
        return;
      }

      // Đối với tài khoản trường (school_admin):
      // Nếu trường liên kết đã bị xóa khỏi hệ thống (schoolId không còn trong validSchoolIdSet)
      if (!schoolId || !validSchoolIdSet.has(schoolId)) {
        orphanedDocRefs.push(d.ref);
        orphanedUids.push(d.id);
        return;
      }

      const matchedSchool = (schoolsList || []).find((s) => s.schoolId === schoolId);
      activeUsers.push({
        uid: d.id,
        username: data.username,
        phone: data.phone,
        email: data.email || '',
        displayName: data.displayName || '',
        role,
        schoolId,
        schoolName: data.schoolName || matchedSchool?.schoolName || undefined,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
      } as UserProfile);
    });

    // 2. Tự động xóa vĩnh viễn các tài khoản mồ côi (trường học đã bị xóa) khỏi Firebase và Local Cache
    if (orphanedDocRefs.length > 0) {
      console.log(`🧹 [superAdminService] Phát hiện ${orphanedDocRefs.length} tài khoản gắn với trường đã bị xóa. Đang tự động dọn dẹp...`);
      Promise.allSettled(orphanedDocRefs.map((ref) => deleteDoc(ref))).then(() => {
        console.log(`✅ [superAdminService] Đã xóa thành công ${orphanedDocRefs.length} tài khoản mồ côi khỏi Firestore.`);
      }).catch((e) => console.warn('Lỗi khi xóa tài khoản mồ côi:', e));

      orphanedUids.forEach((uid) => deleteLocalUserRegistryByUid(uid));
    }

    return activeUsers;
  } catch (err: any) {
    console.error('❌ [superAdminService] Lỗi khi lấy danh sách user:', err);
    throw err;
  }
}

/**
 * 1.1 XÓA VĨNH VIỄN 1 TÀI KHOẢN NGƯỜI DÙNG TRÊN FIREBASE VÀ TRONG CHƯƠNG TRÌNH
 */
export async function deleteUserAccount(uid: string): Promise<boolean> {
  if (!uid) throw new Error('Cần cung cấp UID của tài khoản để xóa');
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, uid));
    deleteLocalUserRegistryByUid(uid);
    console.log(`✅ [superAdminService] Đã xóa vĩnh viễn tài khoản /users/${uid} cả trên Firebase và trong chương trình`);
    return true;
  } catch (err: any) {
    console.error(`❌ [superAdminService] Lỗi khi xóa tài khoản ${uid}:`, err);
    throw err;
  }
}

/**
 * 1.2 DỌN DẸP TOÀN BỘ TÀI KHOẢN MỒ CÔI (TÀI KHOẢN CÓ TRƯỜNG ĐÃ BỊ XÓA)
 */
export async function cleanupOrphanedAccounts(existingSchools?: School[]): Promise<{ cleanedCount: number; cleanedUids: string[] }> {
  try {
    let schoolsList = existingSchools;
    if (!schoolsList || schoolsList.length === 0) {
      try {
        schoolsList = await getAllSchools();
      } catch {
        schoolsList = getLocalSchoolCache();
      }
    }
    const validSchoolIdSet = new Set((schoolsList || []).map((s) => s.schoolId));

    const snap = await getDocs(collection(db, USERS_COLLECTION));
    if (snap.empty) return { cleanedCount: 0, cleanedUids: [] };

    const toDeleteRefs: any[] = [];
    const cleanedUids: string[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.role === 'super_admin') return;

      const sid = data.schoolId;
      if (!sid || !validSchoolIdSet.has(sid)) {
        toDeleteRefs.push(d.ref);
        cleanedUids.push(d.id);
      }
    });

    if (toDeleteRefs.length > 0) {
      await Promise.allSettled(toDeleteRefs.map((ref) => deleteDoc(ref)));
      cleanedUids.forEach((uid) => deleteLocalUserRegistryByUid(uid));
      console.log(`✅ [cleanupOrphanedAccounts] Đã dọn dẹp ${cleanedUids.length} tài khoản mồ côi trên Firebase và local.`);
    }

    return { cleanedCount: cleanedUids.length, cleanedUids };
  } catch (error) {
    console.warn('Lỗi khi dọn dẹp tài khoản mồ côi:', error);
    return { cleanedCount: 0, cleanedUids: [] };
  }
}

/**
 * 2. CẬP NHẬT THÔNG TIN TÀI KHOẢN NGƯỜI DÙNG
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<UserProfile> & { status?: string }
): Promise<boolean> {
  if (!uid) throw new Error('Cần cung cấp UID của tài khoản để cập nhật');
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const dataToUpdate: any = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(docRef, dataToUpdate);
    console.log(`✅ [superAdminService] Đã cập nhật thành công tài khoản /users/${uid}`);
    return true;
  } catch (err: any) {
    console.error(`❌ [superAdminService] Lỗi khi cập nhật tài khoản ${uid}:`, err);
    throw err;
  }
}

/**
 * 3. GIA HẠN THỜI HẠN SỬ DỤNG CHO TRƯỜNG HỌC THEO SỐ NGÀY/THÁNG
 */
export async function extendSchoolExpiryByDays(
  schoolId: string,
  days: number,
  packageName?: string
): Promise<boolean> {
  if (!schoolId) throw new Error('Cần cung cấp schoolId để gia hạn');
  try {
    const school = await getSchoolById(schoolId);
    if (!school) throw new Error('Không tìm thấy trường học để gia hạn');

    const currentExpiry = new Date(school.expiredAt);
    const baseDate = (!isNaN(currentExpiry.getTime()) && currentExpiry > new Date())
      ? new Date(currentExpiry.getTime())
      : new Date();
    baseDate.setDate(baseDate.getDate() + days);

    const nowIso = new Date().toISOString();
    const pkgName = packageName || (days >= 365 ? 'Gói 1 năm' : days >= 180 ? 'Gói 6 tháng' : days >= 90 ? 'Gói 3 tháng' : 'Gói 1 tháng');
    const schoolRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(schoolRef, {
      expiredAt: baseDate.toISOString(),
      status: 'active',
      planStatus: 'renewed',
      renewalPackageName: pkgName,
      lastRenewedAt: nowIso,
      updatedAt: serverTimestamp(),
    });

    const localList = getLocalSchoolCache();
    const sc = localList.find((s) => s.schoolId === schoolId);
    if (sc) {
      sc.expiredAt = baseDate.toISOString();
      sc.status = 'active';
      sc.planStatus = 'renewed';
      sc.renewalPackageName = pkgName;
      sc.lastRenewedAt = nowIso;
      saveLocalSchoolCache(sc);
    }

    console.log(`✅ [superAdminService] Đã gia hạn trường ${schoolId} thêm ${days} ngày (${pkgName}). Hạn mới: ${baseDate.toLocaleDateString()}`);
    return true;
  } catch (err: any) {
    console.error(`❌ [superAdminService] Lỗi khi gia hạn trường ${schoolId}:`, err);
    throw err;
  }
}

/**
 * 4. KHÓA / KÍCH HOẠT TRẠNG THÁI TRƯỜNG HỌC
 */
export async function toggleSchoolStatus(
  schoolId: string,
  status: SchoolStatus
): Promise<boolean> {
  if (!schoolId) throw new Error('Cần cung cấp schoolId');
  try {
    const schoolRef = doc(db, SCHOOLS_COLLECTION, schoolId);
    await updateDoc(schoolRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ [superAdminService] Đã cập nhật trạng thái trường ${schoolId} thành ${status}`);
    return true;
  } catch (err: any) {
    console.error(`❌ [superAdminService] Lỗi cập nhật trạng thái trường ${schoolId}:`, err);
    throw err;
  }
}

/**
 * 5. XÓA TRƯỜNG HỌC VÀ TẤT CẢ DỮ LIỆU LIÊN QUAN
 */
export async function deleteSchoolPermanently(schoolId: string): Promise<boolean> {
  if (!schoolId) throw new Error('Cần cung cấp schoolId');
  try {
    // 5.1. Xóa school document chính
    await deleteSchool(schoolId);
    console.log(`✅ [superAdminService] Đã xóa document trường /schools/${schoolId}`);
    return true;
  } catch (err: any) {
    console.error(`❌ [superAdminService] Lỗi khi xóa vĩnh viễn trường ${schoolId}:`, err);
    throw err;
  }
}

/**
 * 6. PHÂN TÍCH VÀ THỐNG KÊ TỔNG QUAN HỆ THỐNG (System Analytics)
 */
export async function getSystemAnalytics(): Promise<SystemAnalytics> {
  try {
    const schoolsSnap = await getDocs(collection(db, SCHOOLS_COLLECTION));
    const usersSnap = await getDocs(collection(db, USERS_COLLECTION));

    const now = new Date();
    const limit7Days = new Date();
    limit7Days.setDate(limit7Days.getDate() + 7);

    let totalSchools = 0;
    let activeSchools = 0;
    let trialSchools = 0;
    let expiredSchools = 0;
    let expiringIn7Days = 0;

    schoolsSnap.docs.forEach((d) => {
      const data = d.data() as School;
      totalSchools++;
      const expiry = new Date(data.expiredAt);

      if (data.status === 'active' && expiry >= now) {
        activeSchools++;
      }
      if (data.plan === 'trial') {
        trialSchools++;
      }
      if (expiry < now) {
        expiredSchools++;
      }
      if (expiry >= now && expiry <= limit7Days) {
        expiringIn7Days++;
      }
    });

    return {
      totalSchools,
      activeSchools,
      trialSchools,
      expiredSchools,
      expiringIn7Days,
      totalUsers: usersSnap.size,
    };
  } catch (err: any) {
    console.error('❌ [superAdminService] Lỗi khi lấy thống kê hệ thống:', err);
    return {
      totalSchools: 0,
      activeSchools: 0,
      trialSchools: 0,
      expiredSchools: 0,
      expiringIn7Days: 0,
      totalUsers: 0,
    };
  }
}
