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
        schoolsList = await getAllSchools(undefined, undefined, true);
      } catch {
        schoolsList = getLocalSchoolCache();
      }
    }

    const snap = await getDocs(collection(db, USERS_COLLECTION));
    if (snap.empty) return [];

    const activeUsers: UserProfile[] = [];

    // RÀO CHẮN AN TOÀN: Nếu danh sách trường đang rỗng hoặc chưa tải xong, TUYỆT ĐỐI không đánh giá mồ côi hay xóa
    const isSchoolsLoaded = Boolean(schoolsList && schoolsList.length > 0);

    const norm = (str?: string) => (str || '').trim().toLowerCase();
    const validSchoolIdSet = new Set<string>();
    const validAdminUids = new Set<string>();
    const validAdminUsernames = new Set<string>();

    if (isSchoolsLoaded && schoolsList) {
      schoolsList.forEach((s) => {
        if (s.schoolId) validSchoolIdSet.add(norm(s.schoolId));
        if (s.adminUid) validAdminUids.add(s.adminUid);
        if (s.adminUsername) validAdminUsernames.add(norm(s.adminUsername));
      });
    }

    snap.docs.forEach((d) => {
      const data = d.data();
      const role = data.role || 'school_admin';
      const rawSchoolId = data.schoolId || undefined;
      const normSchoolId = norm(rawSchoolId);
      const rawUsername = data.username || undefined;
      const normUsername = norm(rawUsername);

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

      // Đối với tài khoản trường (school_admin / teacher):
      let matchedSchool: School | undefined = undefined;
      let isOrphaned = false;

      if (isSchoolsLoaded && schoolsList) {
        matchedSchool = schoolsList.find(
          (s) =>
            (normSchoolId && norm(s.schoolId) === normSchoolId) ||
            (s.adminUid && s.adminUid === d.id) ||
            (normUsername && s.adminUsername && norm(s.adminUsername) === normUsername)
        );

        if (!matchedSchool && normSchoolId && !validSchoolIdSet.has(normSchoolId)) {
          isOrphaned = true;
          console.warn(
            `⚠️ [superAdminService] Cảnh báo: Tài khoản "${rawUsername || d.id}" gắn với mã trường "${rawSchoolId}" không tìm thấy trong danh sách trường hoạt động.`
          );
        }
      }

      activeUsers.push({
        uid: d.id,
        username: data.username,
        phone: data.phone,
        email: data.email || '',
        displayName: data.displayName || '',
        role,
        schoolId: matchedSchool ? matchedSchool.schoolId : rawSchoolId,
        schoolName: data.schoolName || matchedSchool?.schoolName || undefined,
        isOrphaned,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
      } as UserProfile);
    });

    // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG XÓA deleteDoc() Ở ĐÂY!
    // Mọi thao tác xóa tài khoản phải do Super Admin xác nhận thủ công trên giao diện.

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
 * 1.2 DỌN DẸP TOÀN BỘ TÀI KHOẢN MỒ CÔI (TÀI KHOẢN CÓ TRƯỜNG ĐÃ BỊ XÓA - THỦ CÔNG QUA NÚT BẤM CỦA SUPER ADMIN)
 */
export async function cleanupOrphanedAccounts(existingSchools?: School[]): Promise<{ cleanedCount: number; cleanedUids: string[] }> {
  try {
    let schoolsList = existingSchools;
    if (!schoolsList || schoolsList.length === 0) {
      try {
        schoolsList = await getAllSchools(undefined, undefined, true);
      } catch {
        schoolsList = getLocalSchoolCache();
      }
    }

    // RÀO CHẮN AN TOÀN: KHÔNG ĐƯỢC thực hiện dọn dẹp nếu danh sách trường đang rỗng hoặc chưa load xong
    if (!schoolsList || schoolsList.length === 0) {
      console.warn('⚠️ [cleanupOrphanedAccounts] Danh sách trường đang rỗng hoặc chưa tải xong. Hủy lệnh dọn dẹp để bảo vệ dữ liệu.');
      return { cleanedCount: 0, cleanedUids: [] };
    }

    const norm = (str?: string) => (str || '').trim().toLowerCase();
    const validSchoolIdSet = new Set(schoolsList.map((s) => norm(s.schoolId)).filter(Boolean));
    const validAdminUids = new Set(schoolsList.map((s) => s.adminUid).filter(Boolean));
    const validAdminUsernames = new Set(schoolsList.map((s) => norm(s.adminUsername)).filter(Boolean));

    const snap = await getDocs(collection(db, USERS_COLLECTION));
    if (snap.empty) return { cleanedCount: 0, cleanedUids: [] };

    const toDeleteRefs: any[] = [];
    const cleanedUids: string[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.role === 'super_admin') return;

      const normSchoolId = norm(data.schoolId);
      const normUsername = norm(data.username);

      // Nếu có liên kết với trường đang tồn tại qua schoolId, adminUid hoặc adminUsername thì coi là hợp lệ
      if (normSchoolId && validSchoolIdSet.has(normSchoolId)) return;
      if (validAdminUids.has(d.id)) return;
      if (normUsername && validAdminUsernames.has(normUsername)) return;

      toDeleteRefs.push(d.ref);
      cleanedUids.push(d.id);
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
