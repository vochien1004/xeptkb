/**
 * renewalService.ts - Service quản lý yêu cầu gia hạn bản quyền trường học (/renewal_requests)
 * Đồng bộ hai chiều đám mây Firebase Firestore NoSQL & Realtime Snapshot & Polling & Local Storage Cache
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, ensureFirebaseAuthSession } from './firebaseClient';
import { RenewalRequest, RenewalStatus } from '../types/school';
import { extendSchoolExpiryByDays } from './superAdminService';

export const RENEWAL_REQUESTS_COLLECTION = 'renewal_requests';

function getLocalRenewalCache(schoolId?: string): RenewalRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = schoolId ? `cached_renewal_requests_${schoolId}` : 'cached_all_renewal_requests';
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalRenewalCache(req: RenewalRequest, schoolId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = schoolId ? `cached_renewal_requests_${schoolId}` : 'cached_all_renewal_requests';
    const list = getLocalRenewalCache(schoolId);
    const existingIndex = list.findIndex((r) => r.id === req.id);
    let updated: RenewalRequest[];
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = req;
    } else {
      updated = [req, ...list];
    }
    localStorage.setItem(key, JSON.stringify(updated));

    // Cập nhật cả cache tổng
    if (schoolId) {
      const globalList = getLocalRenewalCache();
      const gIndex = globalList.findIndex((r) => r.id === req.id);
      let gUpdated: RenewalRequest[];
      if (gIndex >= 0) {
        gUpdated = [...globalList];
        gUpdated[gIndex] = req;
      } else {
        gUpdated = [req, ...globalList];
      }
      localStorage.setItem('cached_all_renewal_requests', JSON.stringify(gUpdated));
    }
  } catch (e) {
    // ignore
  }
}

/**
 * 1. GỬI YÊU CẦU GIA HẠN MỚI TỪ ADMIN TRƯỜNG
 * Đảm bảo ghi trực tiếp vào Firestore trên đám mây để Super Admin ở thiết bị khác nhận được
 */
export async function submitRenewalRequest(payload: {
  schoolId: string;
  schoolName: string;
  adminEmail: string;
  adminUsername?: string;
  months: number;
  phone: string;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (!payload.schoolId || !payload.schoolId.trim()) {
      return { success: false, error: 'Thiếu thông tin School ID của trường học' };
    }
    if (!payload.phone || !payload.phone.trim()) {
      return { success: false, error: 'Vui lòng nhập số điện thoại liên hệ xác nhận' };
    }

    // 1. Đảm bảo phiên phiên làm việc Auth sẵn sàng trước khi truy vấn Firestore
    await ensureFirebaseAuthSession();

    const packageName =
      payload.months === 3
        ? 'Gói 3 tháng'
        : payload.months === 6
        ? 'Gói 6 tháng'
        : payload.months === 12
        ? 'Gói 12 tháng (1 năm)'
        : `Gói ${payload.months} tháng`;

    const now = new Date();
    const createdAt = now.toISOString();

    const newRequestData: Omit<RenewalRequest, 'id'> = {
      schoolId: payload.schoolId.trim(),
      schoolName: payload.schoolName.trim(),
      adminEmail: payload.adminEmail.trim().toLowerCase(),
      adminUsername: payload.adminUsername?.trim() || '',
      months: payload.months,
      packageName,
      phone: payload.phone.trim(),
      notes: payload.notes?.trim() || '',
      status: 'pending',
      createdAt,
    };

    // Tạo Reference trực tiếp với ID tự động từ Firestore
    const colRef = collection(db, RENEWAL_REQUESTS_COLLECTION);
    const newDocRef = doc(colRef);
    const docId = newDocRef.id;

    const fullRecord: RenewalRequest = {
      id: docId,
      ...newRequestData,
    };

    let isFirestoreSaved = false;

    // Thử ghi trực tiếp vào Firestore
    try {
      await setDoc(newDocRef, {
        ...newRequestData,
        serverCreatedAt: serverTimestamp(),
      });
      isFirestoreSaved = true;
    } catch (fsErr) {
      console.warn('⚠️ [submitRenewalRequest] Lỗi lần 1 ghi Firestore, thử khởi tạo phiên Auth và lưu lại...', fsErr);
      try {
        await ensureFirebaseAuthSession();
        await setDoc(newDocRef, {
          ...newRequestData,
          serverCreatedAt: serverTimestamp(),
        });
        isFirestoreSaved = true;
      } catch (retryErr) {
        console.error('❌ [submitRenewalRequest] Không thể lưu yêu cầu lên Firestore đám mây:', retryErr);
      }
    }

    // Luôn lưu cache local dự phòng
    saveLocalRenewalCache(fullRecord, payload.schoolId);

    // Phát sự kiện nội bộ để cập nhật UI ngay lập tức trên các Tab/Component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('renewal_request_updated', { detail: fullRecord }));
    }

    if (!isFirestoreSaved) {
      return {
        success: false,
        error: 'Không thể kết nối đến máy chủ dữ liệu đám mây. Vui lòng kiểm tra mạng và thử lại!',
      };
    }

    return { success: true, id: docId };
  } catch (err: any) {
    console.error('❌ [submitRenewalRequest] Lỗi:', err);
    return { success: false, error: err.message || 'Có lỗi xảy ra khi gửi yêu cầu' };
  }
}

/**
 * 2. LẤY LỊCH SỬ CÁC YÊU CẦU GIA HẠN CỦA 1 TRƯỜNG HỌC
 */
export async function fetchSchoolRenewalRequests(schoolId: string): Promise<RenewalRequest[]> {
  if (!schoolId) return [];
  const localList = getLocalRenewalCache(schoolId);

  try {
    await ensureFirebaseAuthSession();
    const colRef = collection(db, RENEWAL_REQUESTS_COLLECTION);
    const q = query(colRef, where('schoolId', '==', schoolId.trim()));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const remoteList: RenewalRequest[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        remoteList.push({
          id: d.id,
          schoolId: data.schoolId || schoolId,
          schoolName: data.schoolName || '',
          adminEmail: data.adminEmail || '',
          adminUsername: data.adminUsername || '',
          months: data.months || 12,
          packageName: data.packageName || `${data.months || 12} tháng`,
          phone: data.phone || '',
          notes: data.notes || '',
          status: data.status || 'pending',
          responseMessage: data.responseMessage || '',
          adminNotes: data.adminNotes || '',
          createdAt: data.createdAt || new Date().toISOString(),
          reviewedAt: data.reviewedAt,
          reviewedBy: data.reviewedBy,
        });
      });

      remoteList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (typeof window !== 'undefined') {
        localStorage.setItem(`cached_renewal_requests_${schoolId}`, JSON.stringify(remoteList));
      }
      return remoteList;
    }
  } catch (err) {
    console.warn('⚠️ [fetchSchoolRenewalRequests] Lỗi đọc Firestore, sử dụng cache:', err);
  }

  return localList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 3. LẤY TOÀN BỘ YÊU CẦU GIA HẠN CHO SUPER ADMIN
 */
export async function fetchAllRenewalRequests(): Promise<RenewalRequest[]> {
  const localList = getLocalRenewalCache();

  try {
    await ensureFirebaseAuthSession();
    const colRef = collection(db, RENEWAL_REQUESTS_COLLECTION);
    const snap = await getDocs(colRef);

    if (!snap.empty) {
      const remoteList: RenewalRequest[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        remoteList.push({
          id: d.id,
          schoolId: data.schoolId || '',
          schoolName: data.schoolName || '',
          adminEmail: data.adminEmail || '',
          adminUsername: data.adminUsername || '',
          months: data.months || 12,
          packageName: data.packageName || `${data.months || 12} tháng`,
          phone: data.phone || '',
          notes: data.notes || '',
          status: data.status || 'pending',
          responseMessage: data.responseMessage || '',
          adminNotes: data.adminNotes || '',
          createdAt: data.createdAt || new Date().toISOString(),
          reviewedAt: data.reviewedAt,
          reviewedBy: data.reviewedBy,
        });
      });

      remoteList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (typeof window !== 'undefined') {
        localStorage.setItem('cached_all_renewal_requests', JSON.stringify(remoteList));
      }
      return remoteList;
    }
  } catch (err) {
    console.warn('⚠️ [fetchAllRenewalRequests] Lỗi đọc Firestore, sử dụng cache:', err);
  }

  return localList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 4. REALTIME SUBSCRIPTION + POLLING FALLBACK CHO YÊU CẦU GIA HẠN
 * Đảm bảo trên Cloudflare Super Admin nhận được dữ liệu realtime tức thì
 */
export function subscribeToRenewalRequestsRealtime(
  callback: (requests: RenewalRequest[]) => void,
  schoolId?: string
): () => void {
  let isUnsubscribed = false;
  let unsubscribeSnapshot: (() => void) | null = null;

  const runSubscribe = async () => {
    try {
      await ensureFirebaseAuthSession();
      if (isUnsubscribed) return;

      const colRef = collection(db, RENEWAL_REQUESTS_COLLECTION);
      const q = schoolId
        ? query(colRef, where('schoolId', '==', schoolId.trim()))
        : colRef;

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          if (isUnsubscribed) return;
          const list: RenewalRequest[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              schoolId: data.schoolId || '',
              schoolName: data.schoolName || '',
              adminEmail: data.adminEmail || '',
              adminUsername: data.adminUsername || '',
              months: data.months || 12,
              packageName: data.packageName || `${data.months || 12} tháng`,
              phone: data.phone || '',
              notes: data.notes || '',
              status: data.status || 'pending',
              responseMessage: data.responseMessage || '',
              adminNotes: data.adminNotes || '',
              createdAt: data.createdAt || new Date().toISOString(),
              reviewedAt: data.reviewedAt,
              reviewedBy: data.reviewedBy,
            });
          });

          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (typeof window !== 'undefined') {
            const cacheKey = schoolId
              ? `cached_renewal_requests_${schoolId}`
              : 'cached_all_renewal_requests';
            localStorage.setItem(cacheKey, JSON.stringify(list));
          }

          callback(list);
        },
        (err) => {
          console.warn('⚠️ [subscribeToRenewalRequestsRealtime] Lỗi snapshot, chuyển sang polling HTTP:', err);
          callback(getLocalRenewalCache(schoolId));
        }
      );
    } catch (err) {
      console.warn('⚠️ [subscribeToRenewalRequestsRealtime] Lỗi khởi tạo snapshot:', err);
      callback(getLocalRenewalCache(schoolId));
    }
  };

  runSubscribe();

  // Bổ sung cơ chế Polling HTTP định kỳ 4 giây làm dự phòng cho Cloudflare Edge / Firewall
  const pollingInterval = setInterval(async () => {
    if (isUnsubscribed) return;
    try {
      const latest = schoolId
        ? await fetchSchoolRenewalRequests(schoolId)
        : await fetchAllRenewalRequests();
      if (latest && latest.length > 0) {
        callback(latest);
      }
    } catch (e) {
      // ignore
    }
  }, 4000);

  // Bổ sung EventListener nhận thông báo nội bộ thiết bị
  const handleLocalEvent = async () => {
    if (isUnsubscribed) return;
    const items = schoolId
      ? await fetchSchoolRenewalRequests(schoolId)
      : await fetchAllRenewalRequests();
    callback(items);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('renewal_request_updated', handleLocalEvent);
  }

  return () => {
    isUnsubscribed = true;
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    clearInterval(pollingInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('renewal_request_updated', handleLocalEvent);
    }
  };
}

/**
 * 5. DUYỆT HOẶC TỪ CHỐI YÊU CẦU GIA HẠN DÀNH CHO SUPER ADMIN
 * Cập nhật Firestore + gia hạn ngày dùng trường + cập nhật local cache + phát sự kiện đồng bộ
 */
export async function reviewRenewalRequest(
  request: RenewalRequest,
  action: 'approve' | 'reject',
  adminEmail: string,
  responseMessage?: string,
  customMonths?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureFirebaseAuthSession();
    const newStatus: RenewalStatus = action === 'approve' ? 'approved' : 'rejected';
    const nowIso = new Date().toISOString();
    const monthsToApply = customMonths || request.months || 12;

    const packageName =
      monthsToApply === 3
        ? 'Gói 3 tháng'
        : monthsToApply === 6
        ? 'Gói 6 tháng'
        : monthsToApply === 12
        ? 'Gói 12 tháng (1 năm)'
        : `Gói ${monthsToApply} tháng`;

    if (request.id) {
      try {
        const docRef = doc(db, RENEWAL_REQUESTS_COLLECTION, request.id);
        const updates: any = {
          status: newStatus,
          reviewedAt: nowIso,
          reviewedBy: adminEmail,
          updatedAt: serverTimestamp(),
        };
        if (responseMessage !== undefined) {
          updates.responseMessage = responseMessage.trim();
        }
        if (customMonths) {
          updates.months = customMonths;
          updates.packageName = packageName;
        }
        await updateDoc(docRef, updates);
      } catch (e) {
        console.warn('⚠️ [reviewRenewalRequest] Lỗi updateDoc Firestore:', e);
      }
    }

    // Nếu duyệt (approve) -> Tự động gia hạn thời gian cho Trường học trong Firestore
    if (action === 'approve') {
      const days = monthsToApply * 30;
      await extendSchoolExpiryByDays(request.schoolId, days, packageName);
    }

    const updatedReq: RenewalRequest = {
      ...request,
      months: monthsToApply,
      packageName,
      status: newStatus,
      responseMessage: responseMessage !== undefined ? responseMessage.trim() : request.responseMessage,
      reviewedAt: nowIso,
      reviewedBy: adminEmail,
    };

    saveLocalRenewalCache(updatedReq, request.schoolId);

    // Phát sự kiện toàn cục để UI các trường nhận thông tin xét duyệt tức thì
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('renewal_request_updated', { detail: updatedReq }));
      window.dispatchEvent(new CustomEvent('school_data_updated'));
    }

    return { success: true };
  } catch (err: any) {
    console.error('❌ [reviewRenewalRequest] Lỗi:', err);
    return { success: false, error: err.message || 'Lỗi khi xử lý yêu cầu' };
  }
}

/**
 * 6. GỬI TIN NHẮN PHẢN HỒI CHO YÊU CẦU GIA HẠN (SUPER ADMIN)
 */
export async function sendRenewalResponse(
  request: RenewalRequest,
  responseMessage: string,
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!request.id) {
      return { success: false, error: 'Thiếu Request ID' };
    }
    await ensureFirebaseAuthSession();
    const nowIso = new Date().toISOString();

    try {
      const docRef = doc(db, RENEWAL_REQUESTS_COLLECTION, request.id);
      await updateDoc(docRef, {
        responseMessage: responseMessage.trim(),
        reviewedBy: adminEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('⚠️ [sendRenewalResponse] Lỗi Firestore:', e);
    }

    const updatedReq: RenewalRequest = {
      ...request,
      responseMessage: responseMessage.trim(),
      reviewedBy: adminEmail,
    };

    saveLocalRenewalCache(updatedReq, request.schoolId);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('renewal_request_updated', { detail: updatedReq }));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi gửi phản hồi' };
  }
}
