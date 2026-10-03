/**
 * renewalService.ts - Service quản lý yêu cầu gia hạn bản quyền trường học (/renewal_requests)
 * Cơ chế Offline-First + Auto-Sync Đám mây Firestore NoSQL & Realtime Snapshot & Polling
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
const PENDING_SYNC_KEY = 'pending_sync_renewal_requests';

/**
 * CẤU HÌNH NGÂN HÀNG & BẢNG GIÁ GIA HẠN BẢN QUYỀN
 */
export const BANK_CONFIG = {
  BANK_ID: 'VBA',
  BANK_NAME: 'Agribank (Ngân hàng Nông nghiệp & PTNT Việt Nam)',
  ACCOUNT_NO: '5105205024485',
  ACCOUNT_NAME: 'VÕ CHIẾN',
};

export const RENEWAL_PRICING: Record<number, { price: number; label: string; sub: string }> = {
  3: { price: 199000, label: '3 Tháng', sub: 'Gói 3 tháng' },
  6: { price: 399000, label: '6 Tháng', sub: 'Gói 6 tháng' },
  12: { price: 599000, label: '12 Tháng', sub: 'Gói 1 Năm' },
};

export function calculateRenewalMemo(schoolId: string, months: number): string {
  return `GIAHAN ${String(schoolId || '').trim()} ${months}T`;
}

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
 * Thêm một yêu cầu vào hàng đợi đồng bộ ngầm khi chưa đẩy lên được Firestore
 */
function queueForBackgroundSync(req: RenewalRequest) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const queue: RenewalRequest[] = raw ? JSON.parse(raw) : [];
    if (!queue.some((item) => item.id === req.id)) {
      queue.push(req);
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    }
  } catch (e) {
    // ignore
  }
}

/**
 * ĐỒNG BỘ CÁC YÊU CẦU ĐANG CHỜ LÊN FIRESTORE ĐÁM MÂY
 */
export async function syncPendingRenewalRequests(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const rawQueue = localStorage.getItem(PENDING_SYNC_KEY);
    if (!rawQueue) return;
    const queue: RenewalRequest[] = JSON.parse(rawQueue);
    if (!queue || queue.length === 0) return;

    await ensureFirebaseAuthSession();
    const remainingQueue: RenewalRequest[] = [];

    for (const item of queue) {
      try {
        const docRef = doc(collection(db, RENEWAL_REQUESTS_COLLECTION), item.id);
        await setDoc(docRef, {
          schoolId: String(item.schoolId || '').trim(),
          schoolName: String(item.schoolName || 'Trường chưa đặt tên').trim(),
          adminEmail: String(item.adminEmail || '').trim().toLowerCase(),
          adminUsername: String(item.adminUsername || '').trim(),
          months: Number(item.months) || 12,
          packageName: String(item.packageName || 'Gói gia hạn').trim(),
          price: typeof item.price === 'number' ? item.price : RENEWAL_PRICING[item.months]?.price || 0,
          memo: String(item.memo || calculateRenewalMemo(item.schoolId, item.months)).trim(),
          phone: String(item.phone || '').trim(),
          notes: String(item.notes || '').trim(),
          status: item.status || 'pending',
          responseMessage: String(item.responseMessage || '').trim(),
          adminNotes: String(item.adminNotes || '').trim(),
          createdAt: item.createdAt || new Date().toISOString(),
          serverCreatedAt: serverTimestamp(),
        });
        console.log(`✅ [syncPendingRenewalRequests] Đã đồng bộ yêu cầu gia hạn ${item.id} lên Firestore!`);
      } catch (e) {
        remainingQueue.push(item);
      }
    }

    if (remainingQueue.length > 0) {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remainingQueue));
    } else {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }
  } catch (err) {
    // ignore
  }
}

/**
 * 1. GỬI YÊU CẦU GIA HẠN MỚI TỪ ADMIN TRƯỜNG
 * Chuẩn hóa 100% dữ liệu (loại bỏ hoàn toàn undefined) + Lưu Local + Đẩy Firestore + Hàng đợi tự động đồng bộ
 */
export async function submitRenewalRequest(payload: {
  schoolId: string;
  schoolName: string;
  adminEmail: string;
  adminUsername?: string;
  months: number;
  price?: number;
  memo?: string;
  phone: string;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const schoolId = String(payload.schoolId || '').trim();
    const schoolName = String(payload.schoolName || 'Trường chưa đặt tên').trim();
    const adminEmail = String(payload.adminEmail || '').trim().toLowerCase();
    const adminUsername = String(payload.adminUsername || '').trim();
    const phone = String(payload.phone || '').trim();
    const notes = String(payload.notes || '').trim();
    const months = Number(payload.months) || 12;
    const price = typeof payload.price === 'number' ? payload.price : RENEWAL_PRICING[months]?.price || 0;
    const memo = String(payload.memo || calculateRenewalMemo(schoolId, months)).trim();

    if (!schoolId) {
      return { success: false, error: 'Thiếu thông tin Mã Trường (School ID)' };
    }
    if (!phone) {
      return { success: false, error: 'Vui lòng nhập số điện thoại liên hệ xác nhận' };
    }

    const packageName =
      months === 3
        ? 'Gói 3 tháng'
        : months === 6
        ? 'Gói 6 tháng'
        : months === 12
        ? 'Gói 12 tháng (1 năm)'
        : `Gói ${months} tháng`;

    const nowIso = new Date().toISOString();

    // Tạo ID tài liệu mới duy nhất
    const colRef = collection(db, RENEWAL_REQUESTS_COLLECTION);
    const newDocRef = doc(colRef);
    const docId = newDocRef.id;

    const fullRecord: RenewalRequest = {
      id: docId,
      schoolId,
      schoolName,
      adminEmail,
      adminUsername,
      months,
      packageName,
      price,
      memo,
      phone,
      notes,
      status: 'pending',
      responseMessage: '',
      adminNotes: '',
      createdAt: nowIso,
    };

    // 1. Lưu ngay lập tức vào LocalStorage Cache để hiển thị tức thì trên UI
    saveLocalRenewalCache(fullRecord, schoolId);

    // 2. Thử đẩy trực tiếp lên Cloud Firestore
    let isSavedToCloud = false;
    try {
      await ensureFirebaseAuthSession();
      await setDoc(newDocRef, {
        schoolId,
        schoolName,
        adminEmail,
        adminUsername,
        months,
        packageName,
        price,
        memo,
        phone,
        notes,
        status: 'pending',
        responseMessage: '',
        adminNotes: '',
        createdAt: nowIso,
        serverCreatedAt: serverTimestamp(),
      });
      isSavedToCloud = true;
      console.log('✅ [submitRenewalRequest] Đã lưu yêu cầu trực tiếp lên Firestore:', docId);
    } catch (fsErr) {
      console.warn('⚠️ [submitRenewalRequest] Không thể ghi Firestore ngay lúc này, đưa vào hàng đợi tự động đồng bộ:', fsErr);
      queueForBackgroundSync(fullRecord);
    }

    // 3. Phát sự kiện cập nhật giao diện các Tab / Màn hình
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('renewal_request_updated', { detail: fullRecord }));
    }

    // 4. Kích hoạt đồng bộ ngầm
    setTimeout(() => {
      syncPendingRenewalRequests();
    }, 1000);

    return { success: true, id: docId };
  } catch (err: any) {
    console.error('❌ [submitRenewalRequest] Lỗi không xác định:', err);
    return { success: false, error: err.message || 'Có lỗi xảy ra khi tạo yêu cầu gia hạn' };
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
        const m = Number(data.months) || 12;
        remoteList.push({
          id: d.id,
          schoolId: String(data.schoolId || schoolId).trim(),
          schoolName: String(data.schoolName || '').trim(),
          adminEmail: String(data.adminEmail || '').trim(),
          adminUsername: String(data.adminUsername || '').trim(),
          months: m,
          packageName: String(data.packageName || `${m} tháng`).trim(),
          price: typeof data.price === 'number' ? data.price : RENEWAL_PRICING[m]?.price,
          memo: data.memo || calculateRenewalMemo(data.schoolId || schoolId, m),
          phone: String(data.phone || '').trim(),
          notes: String(data.notes || '').trim(),
          status: data.status || 'pending',
          responseMessage: String(data.responseMessage || '').trim(),
          adminNotes: String(data.adminNotes || '').trim(),
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
    console.warn('⚠️ [fetchSchoolRenewalRequests] Lỗi đọc Firestore, dùng local cache:', err);
  }

  // Luôn thử đồng bộ các request chưa được ghi lên cloud
  syncPendingRenewalRequests();

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
        const m = Number(data.months) || 12;
        remoteList.push({
          id: d.id,
          schoolId: String(data.schoolId || '').trim(),
          schoolName: String(data.schoolName || '').trim(),
          adminEmail: String(data.adminEmail || '').trim(),
          adminUsername: String(data.adminUsername || '').trim(),
          months: m,
          packageName: String(data.packageName || `${m} tháng`).trim(),
          price: typeof data.price === 'number' ? data.price : RENEWAL_PRICING[m]?.price,
          memo: data.memo || calculateRenewalMemo(data.schoolId, m),
          phone: String(data.phone || '').trim(),
          notes: String(data.notes || '').trim(),
          status: data.status || 'pending',
          responseMessage: String(data.responseMessage || '').trim(),
          adminNotes: String(data.adminNotes || '').trim(),
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
    console.warn('⚠️ [fetchAllRenewalRequests] Lỗi đọc Firestore, dùng local cache:', err);
  }

  syncPendingRenewalRequests();

  return localList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 4. REALTIME SUBSCRIPTION + POLLING FALLBACK CHO YÊU CẦU GIA HẠN
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
            const m = Number(data.months) || 12;
            list.push({
              id: d.id,
              schoolId: String(data.schoolId || '').trim(),
              schoolName: String(data.schoolName || '').trim(),
              adminEmail: String(data.adminEmail || '').trim(),
              adminUsername: String(data.adminUsername || '').trim(),
              months: m,
              packageName: String(data.packageName || `${m} tháng`).trim(),
              price: typeof data.price === 'number' ? data.price : RENEWAL_PRICING[m]?.price,
              memo: data.memo || calculateRenewalMemo(data.schoolId, m),
              phone: String(data.phone || '').trim(),
              notes: String(data.notes || '').trim(),
              status: data.status || 'pending',
              responseMessage: String(data.responseMessage || '').trim(),
              adminNotes: String(data.adminNotes || '').trim(),
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
          console.warn('⚠️ [subscribeToRenewalRequestsRealtime] Lỗi snapshot, chuyển sang polling:', err);
          callback(getLocalRenewalCache(schoolId));
        }
      );
    } catch (err) {
      console.warn('⚠️ [subscribeToRenewalRequestsRealtime] Exception snapshot:', err);
      callback(getLocalRenewalCache(schoolId));
    }
  };

  runSubscribe();

  // Polling HTTP định kỳ 3 giây làm giải pháp bổ trợ đồng bộ
  const pollingInterval = setInterval(async () => {
    if (isUnsubscribed) return;
    try {
      await syncPendingRenewalRequests();
      const latest = schoolId
        ? await fetchSchoolRenewalRequests(schoolId)
        : await fetchAllRenewalRequests();
      if (latest && latest.length > 0) {
        callback(latest);
      }
    } catch (e) {
      // ignore
    }
  }, 3000);

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
        const docRef = doc(collection(db, RENEWAL_REQUESTS_COLLECTION), request.id);
        const updates: Record<string, any> = {
          status: newStatus,
          reviewedAt: nowIso,
          reviewedBy: String(adminEmail || '').trim(),
          updatedAt: serverTimestamp(),
        };
        if (responseMessage && responseMessage.trim()) {
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

    // Nếu duyệt -> Cộng dồn số ngày vào thời hạn sử dụng trường
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

    try {
      const docRef = doc(collection(db, RENEWAL_REQUESTS_COLLECTION), request.id);
      await updateDoc(docRef, {
        responseMessage: String(responseMessage || '').trim(),
        reviewedBy: String(adminEmail || '').trim(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('⚠️ [sendRenewalResponse] Lỗi Firestore:', e);
    }

    const updatedReq: RenewalRequest = {
      ...request,
      responseMessage: String(responseMessage || '').trim(),
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
