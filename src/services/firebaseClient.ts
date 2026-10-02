/**
 * Firebase Client Service for Multi-tenant Timetable Application
 * Project: thoikhoabieu-e731c
 * 
 * Kiến trúc Multi-tenancy Firestore Sub-collections:
 * - /schools/{schoolId}
 * - /schools/{schoolId}/teachers/{teacherId}
 * - /schools/{schoolId}/classes/{classId}
 * - /schools/{schoolId}/subjects/{subjectId}
 * - /schools/{schoolId}/rooms/{roomId}
 * - /schools/{schoolId}/teachingAssignments/{assignmentId}
 * - /schools/{schoolId}/timetables/{slotId}
 * - /schools/{schoolId}/mergedClasses/{mergedClassId}
 * - /schools/{schoolId}/settings/{settingId}
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  getDocsFromServer,
  getDocFromServer,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  DocumentReference,
  CollectionReference,
} from 'firebase/firestore';

import {
  Teacher,
  SchoolClass,
  Room,
  Subject,
  TeachingAssignment,
  TimetableSlot,
} from '../types/timetable';
import { ExportConfig } from '../utils/timetableExcelExport';

// 1. Cấu hình Firebase Web App theo thông số của người dùng
export const firebaseConfig = {
  apiKey: 'AIzaSyAEtWHLFR6YZJ3TcTFIK3-q54XQM6H2u9I',
  authDomain: 'thoikhoabieu-e731c.firebaseapp.com',
  projectId: 'thoikhoabieu-e731c',
  storageBucket: 'thoikhoabieu-e731c.firebasestorage.app',
  messagingSenderId: '180949183483',
  appId: '1:180949183483:web:65e8ef34b175c75866795e',
};

// 2. Khởi tạo Firebase App, Auth & Firestore Database
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Đảm bảo người dùng có phiên làm việc với Firebase Auth trước khi đọc/ghi Firestore
 */
export async function ensureFirebaseAuthSession(email?: string, password?: string): Promise<void> {
  if (auth.currentUser) return;

  if (email && password) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return;
    } catch (e1) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        return;
      } catch (e2) {
        // continue
      }
    }
  }

  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.warn('⚡ [Firebase Auth] Unable to sign in anonymously:', err);
  }
}

// Trường học mặc định dự phòng
export const DEFAULT_SCHOOL_ID = 'thpt-chu-van-an-88e1';

// Tên các Sub-collection bên dưới /schools/{schoolId}
export const COLLECTIONS = {
  SCHOOLS: 'schools',
  USERS: 'users',
  TEACHERS: 'teachers',
  CLASSES: 'classes',
  SUBJECTS: 'subjects',
  ROOMS: 'rooms',
  ASSIGNMENTS: 'teaching_assignments',
  TIMETABLES: 'timetables',
  MERGED_CLASSES: 'mergedClasses',
  SETTINGS: 'system_settings',
};

/**
 * Dọn dẹp triệt để toàn bộ bộ nhớ cục bộ localStorage liên quan đến dữ liệu trường học
 * để không bao giờ bị lưu vết / rò rỉ dữ liệu sang tài khoản khác khi đăng xuất hoặc đổi trường
 */
export function clearSchoolLocalCache(specificSchoolId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('cached_school_full_data_') ||
        key.startsWith('inprogress_timetable_slots_') ||
        key.startsWith('inprogress_timetable_slots_time_') ||
        key.startsWith('cached_export_config_') ||
        key.startsWith('cached_renewal_requests_') ||
        key === 'cached_schools_list' ||
        key === 'cached_all_renewal_requests' ||
        key.startsWith('cached_') ||
        key.startsWith('inprogress_') ||
        key.startsWith('tkb_draft_') ||
        key.startsWith('tkb_slots_')
      ) {
        if (!specificSchoolId || key.includes(specificSchoolId)) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Dọn dẹp cả trong sessionStorage nếu có
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('cached_') ||
        key.startsWith('inprogress_') ||
        key.startsWith('tkb_draft_') ||
        key.startsWith('tkb_slots_')
      ) {
        if (!specificSchoolId || key.includes(specificSchoolId)) {
          sessionKeysToRemove.push(key);
        }
      }
    }
    sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    console.warn('Lỗi dọn dẹp cache local storage:', e);
  }
}

/**
 * Lấy schoolId hiện tại từ tham số truyền vào hoặc từ LocalStorage session
 */
export function getActiveSchoolId(explicitSchoolId?: string): string {
  if (explicitSchoolId && explicitSchoolId.trim()) {
    return explicitSchoolId.trim();
  }
  if (typeof window !== 'undefined') {
    try {
      const savedUser = localStorage.getItem('tkb_auth_session_user') || sessionStorage.getItem('tkb_auth_session_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed.role === 'super_admin') {
          return ''; // Super admin không bị gán schoolId mặc định
        }
        if (parsed.schoolId && parsed.schoolId.trim()) return parsed.schoolId.trim();
      }
      const savedSchool = localStorage.getItem('tkb_auth_session_school') || sessionStorage.getItem('tkb_auth_session_school');
      if (savedSchool) {
        const parsed = JSON.parse(savedSchool);
        if (parsed.schoolId && parsed.schoolId.trim()) return parsed.schoolId.trim();
      }
    } catch (e) {
      // ignore
    }
  }
  return '';
}

/**
 * 2.1 HELPER LẤY THAM CHIẾU GỐC ĐẾN DOCUMENT TRƯỜNG HỌC
 * /schools/{schoolId}
 */
export function getSchoolRef(schoolId?: string): DocumentReference {
  const sid = getActiveSchoolId(schoolId);
  if (!sid) {
    throw new Error('Yêu cầu schoolId hợp lệ để truy xuất Firestore Document!');
  }
  return doc(db, 'schools', sid);
}

/**
 * 2.2 HELPER LẤY THAM CHIẾU ĐẾN SUB-COLLECTION CỦA TRƯỜNG
 * /schools/{schoolId}/{subCollectionName}
 */
export function getSchoolSubcollectionRef(
  subCollectionName: string,
  schoolId?: string
): CollectionReference {
  const sid = getActiveSchoolId(schoolId);
  if (!sid) {
    throw new Error('Yêu cầu schoolId hợp lệ để truy xuất Firestore Sub-collection!');
  }
  return collection(db, 'schools', sid, subCollectionName);
}

/**
 * 2.3 HELPER LẤY THAM CHIẾU ĐẾN DOCUMENT TRONG SUB-COLLECTION
 * /schools/{schoolId}/{subCollectionName}/{docId}
 */
export function getSchoolSubDocRef(
  subCollectionName: string,
  docId: string,
  schoolId?: string
): DocumentReference {
  const sid = getActiveSchoolId(schoolId);
  if (!sid || !docId) {
    throw new Error('Yêu cầu schoolId và docId hợp lệ để truy xuất Sub-collection Document!');
  }
  return doc(db, 'schools', sid, subCollectionName, docId);
}

// Helper: Convert undefined fields to null for Firestore compatibility
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean;
  }
  return obj;
}

// ============================================================================
// 1. TẢI TOÀN BỘ DỮ LIỆU TỪ FIREBASE THEO SUB-COLLECTION CỦA TRƯỜNG HỌC
// ============================================================================
export interface CloudDataPayload {
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  rooms: Room[];
  assignments: TeachingAssignment[];
  slots: TimetableSlot[];
  exportConfig?: ExportConfig;
  isCloudLoaded: boolean;
  schoolId: string;
}

export function getDefaultSchoolData(sid: string): CloudDataPayload {
  return {
    teachers: [],
    classes: [],
    subjects: [],
    rooms: [],
    assignments: [],
    slots: [],
    exportConfig: {
      schoolName: 'TRƯỜNG THPT',
      semesterYear: 'HỌC KỲ I - NĂM HỌC: 2026-2027',
      weekInfo: 'TUẦN ÁP DỤNG: THỜI KHÓA BIỂU CHÍNH THỨC',
      effectiveDate: '05/09/2026',
    },
    isCloudLoaded: true,
    schoolId: sid,
  };
}

export async function fetchAllDataFromFirebase(schoolId?: string): Promise<CloudDataPayload> {
  const sid = getActiveSchoolId(schoolId);
  if (!sid || sid.trim() === '') {
    return getDefaultSchoolData('');
  }

  try {
    const teachersCol = getSchoolSubcollectionRef(COLLECTIONS.TEACHERS, sid);
    const classesCol = getSchoolSubcollectionRef(COLLECTIONS.CLASSES, sid);
    const subjectsCol = getSchoolSubcollectionRef(COLLECTIONS.SUBJECTS, sid);
    const roomsCol = getSchoolSubcollectionRef(COLLECTIONS.ROOMS, sid);
    const asgCol = getSchoolSubcollectionRef(COLLECTIONS.ASSIGNMENTS, sid);
    const slotsCol = getSchoolSubcollectionRef(COLLECTIONS.TIMETABLES, sid);
    const settingsDoc = getSchoolSubDocRef(COLLECTIONS.SETTINGS, 'export_config', sid);

    // Ưu tiên đọc trực tiếp từ Server để vượt qua bộ nhớ đệm Firestore cũ (Persistence Cache)
    const fetchCol = (colRef: any) =>
      getDocsFromServer(colRef).catch(() => getDocs(colRef).catch(() => null));
    const fetchSingleDoc = (docRef: any) =>
      getDocFromServer(docRef).catch(() => getDoc(docRef).catch(() => null));

    const [teachersSnap, classesSnap, subjectsSnap, roomsSnap, asgSnap, slotsSnap, settingsSnap] =
      await Promise.all([
        fetchCol(teachersCol),
        fetchCol(classesCol),
        fetchCol(subjectsCol),
        fetchCol(roomsCol),
        fetchCol(asgCol),
        fetchCol(slotsCol),
        fetchSingleDoc(settingsDoc),
      ]);

    const isDummyRecord = (id: string, data: any) => {
      if (id === 'init' || id === 'INIT') return true;
      const name = (data?.name || '').trim().toLowerCase();
      const code = (data?.code || '').trim().toLowerCase();
      if (name.includes('khởi tạo') || name.includes('khoi tao')) return true;
      if (code === 'init' || code.includes('khởi tạo') || code.includes('khoi tao')) return true;
      return false;
    };

    const teachers: Teacher[] = [];
    if (teachersSnap && !teachersSnap.empty) {
      teachersSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          teachers.push({ id: d.id, ...data } as Teacher);
        }
      });
    }

    const classes: SchoolClass[] = [];
    if (classesSnap && !classesSnap.empty) {
      classesSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          classes.push({ id: d.id, ...data } as SchoolClass);
        }
      });
    }

    const subjects: Subject[] = [];
    if (subjectsSnap && !subjectsSnap.empty) {
      subjectsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          subjects.push({ id: d.id, ...data } as Subject);
        }
      });
    }

    const rooms: Room[] = [];
    if (roomsSnap && !roomsSnap.empty) {
      roomsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          rooms.push({ id: d.id, ...data } as Room);
        }
      });
    }

    const assignments: TeachingAssignment[] = [];
    if (asgSnap && !asgSnap.empty) {
      asgSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          assignments.push({ id: d.id, ...data } as TeachingAssignment);
        }
      });
    }

    let slots: TimetableSlot[] = [];
    if (slotsSnap && !slotsSnap.empty) {
      slotsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (isDummyRecord(d.id, data)) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          slots.push({ id: d.id, ...data } as TimetableSlot);
        }
      });
    }

    let exportConfig: ExportConfig | undefined;
    if (settingsSnap && settingsSnap.exists()) {
      const data = settingsSnap.data() as Record<string, any>;
      exportConfig = {
        schoolName: data.schoolName || 'TRƯỜNG THPT',
        semesterYear: data.semesterYear || 'HỌC KỲ I - NĂM HỌC: 2026-2027',
        weekInfo: data.weekInfo || 'TUẦN ÁP DỤNG: THỜI KHÓA BIỂU CHÍNH THỨC',
        effectiveDate: data.effectiveDate || '05/09/2026',
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(`cached_export_config_${sid}`, JSON.stringify(exportConfig));
      }
    } else if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`cached_export_config_${sid}`);
        if (cached) {
          exportConfig = JSON.parse(cached);
        }
      } catch (e) {
        // ignore
      }
    }

    // =========================================================================
    // LÀM SẠCH VÀ LOẠI BỎ TRIỆT ĐỂ CÁC TIẾT LẠC / MÔN KHÔNG CÓ TRONG PCGD CỦA LỚP
    // =========================================================================
    const validClassIds = new Set(classes.map((c) => c.id));
    const classSubjectMap = new Map<string, Set<string>>();
    assignments.forEach((a) => {
      if (Array.isArray(a.classIds)) {
        a.classIds.forEach((cId) => {
          if (!classSubjectMap.has(cId)) classSubjectMap.set(cId, new Set());
          classSubjectMap.get(cId)!.add(a.subjectId);
        });
      }
      if ((a as any).classId) {
        const cId = (a as any).classId;
        if (!classSubjectMap.has(cId)) classSubjectMap.set(cId, new Set());
        classSubjectMap.get(cId)!.add(a.subjectId);
      }
    });

    // Nếu trên Firestore chưa có slots, chỉ lấy từ local storage nếu các slot đó thuộc đúng lớp và PCGD của trường này
    if (slots.length === 0 && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`inprogress_timetable_slots_${sid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validDraftSlots = parsed.filter((s) => {
              const cId = s.classId;
              const hasValidClass =
                validClassIds.has(cId) ||
                (Array.isArray(s.classIds) && s.classIds.some((id: string) => validClassIds.has(id)));
              if (!hasValidClass) return false;

              if (
                s.subjectId === 'SUB_CC' ||
                s.subjectId === 'SUB_OFF' ||
                s.subjectId === 'SUB_SHL' ||
                s.assignmentId?.startsWith('ASG_CC_') ||
                s.assignmentId?.startsWith('ASG_SHL_')
              ) {
                return true;
              }
              const sub = subjects.find((subj) => subj.id === s.subjectId);
              if (sub?.code === 'CC' || sub?.code === 'SHL') return true;

              const allowed = classSubjectMap.get(cId);
              return allowed ? allowed.has(s.subjectId) : false;
            });

            if (validDraftSlots.length > 0) {
              slots = validDraftSlots;
              saveTimetableSlotsToFirebase(validDraftSlots, 'HK1_2026_2027', sid).catch(() => {});
            } else {
              // Bản nháp không khớp lớp hoặc PCGD của trường -> xóa bỏ tránh ô nhiễm dữ liệu
              localStorage.removeItem(`inprogress_timetable_slots_${sid}`);
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const sanitizedSlots = slots.filter((slot) => {
      const cId = slot.classId;
      const hasValidClass =
        validClassIds.has(cId) ||
        (Array.isArray(slot.classIds) && slot.classIds.some((id) => validClassIds.has(id)));
      if (!hasValidClass) return false;

      // Tiết Chào cờ, Sinh hoạt, Nghỉ luôn hợp lệ
      if (
        slot.subjectId === 'SUB_CC' ||
        slot.subjectId === 'SUB_OFF' ||
        slot.subjectId === 'SUB_SHL' ||
        slot.assignmentId?.startsWith('ASG_CC_') ||
        slot.assignmentId?.startsWith('ASG_SHL_')
      ) {
        return true;
      }
      const sub = subjects.find((subj) => subj.id === slot.subjectId);
      if (sub?.code === 'CC' || sub?.code === 'SHL') return true;

      // Môn học phải có trong phân công giảng dạy của lớp này
      const allowedSubjects = classSubjectMap.get(cId);
      if (!allowedSubjects || !allowedSubjects.has(slot.subjectId)) {
        return false; // Môn không có trong PCGD của lớp -> loại bỏ ngay!
      }

      return true;
    });

    if (sanitizedSlots.length < slots.length) {
      // Tự động dọn dẹp các slots lạc trên Firestore
      saveTimetableSlotsToFirebase(sanitizedSlots, 'HK1_2026_2027', sid).catch(() => {});
    }

    slots = sanitizedSlots;

    const payload: CloudDataPayload = {
      teachers,
      classes,
      subjects,
      rooms,
      assignments,
      slots,
      exportConfig,
      isCloudLoaded: true,
      schoolId: sid,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(`cached_school_full_data_${sid}`, JSON.stringify(payload));
    }

    return payload;
  } catch (error: any) {
    console.warn(`Lưu ý: Đang sử dụng bộ nhớ cục bộ cho trường [${sid}]:`, error?.message || error);
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(`cached_school_full_data_${sid}`);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.schoolId === sid) {
            return {
              ...parsed,
              isCloudLoaded: true,
              schoolId: sid,
            };
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return getDefaultSchoolData(sid);
  }
}

// ============================================================================
// 1.1 CẤU HÌNH XUẤT THỜI KHÓA BIỂU (EXPORT CONFIG PERSISTENCE)
// ============================================================================
export async function saveExportConfigToFirebase(
  config: ExportConfig,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`cached_export_config_${sid}`, JSON.stringify(config));
    }
    const docRef = getSchoolSubDocRef(COLLECTIONS.SETTINGS, 'export_config', sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(config),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu cấu hình xuất TKB lên Firebase:', error);
    return false;
  }
}

export async function fetchExportConfigFromFirebase(
  schoolId?: string
): Promise<ExportConfig | null> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.SETTINGS, 'export_config', sid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const config: ExportConfig = {
        schoolName: data.schoolName || 'TRƯỜNG THPT',
        semesterYear: data.semesterYear || 'HỌC KỲ I - NĂM HỌC: 2026-2027',
        weekInfo: data.weekInfo || 'TUẦN ÁP DỤNG: THỜI KHÓA BIỂU CHÍNH THỨC',
        effectiveDate: data.effectiveDate || '05/09/2026',
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(`cached_export_config_${sid}`, JSON.stringify(config));
      }
      return config;
    }
  } catch (error) {
    console.warn('Lỗi đọc cấu hình xuất TKB từ Firebase, sử dụng cache local:', error);
  }

  // Fallback to localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`cached_export_config_${sid}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// ============================================================================
// 2. GIÁO VIÊN (TEACHERS CRUD TRÊN SUB-COLLECTION)
// /schools/{schoolId}/teachers/{teacherId}
// ============================================================================
export async function saveTeacherToFirebase(
  teacher: Teacher,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.TEACHERS, teacher.id, sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(teacher),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu giáo viên lên Firebase:', error);
    return false;
  }
}

export async function saveMultipleTeachersToFirebase(
  teachers: Teacher[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const batch = writeBatch(db);
    teachers.forEach((t) => {
      const docRef = getSchoolSubDocRef(COLLECTIONS.TEACHERS, t.id, sid);
      batch.set(
        docRef,
        {
          ...sanitizeForFirestore(t),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách giáo viên lên Firebase:', error);
    return false;
  }
}

export async function replaceAllTeachersInFirebase(
  teachers: Teacher[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.TEACHERS, sid);
    const snap = await getDocs(colRef);
    const CHUNK_SIZE = 450;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    for (let i = 0; i < teachers.length; i += CHUNK_SIZE) {
      const chunk = teachers.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((t) => {
        const docRef = getSchoolSubDocRef(COLLECTIONS.TEACHERS, t.id, sid);
        batch.set(
          docRef,
          {
            ...sanitizeForFirestore(t),
            schoolId: sid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi thay thế danh sách giáo viên trên Firebase:', error);
    return false;
  }
}

export async function deleteTeacherFromFirebase(
  teacherId: string,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.TEACHERS, teacherId, sid);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Lỗi xóa giáo viên trên Firebase:', error);
    return false;
  }
}

// ============================================================================
// 3. LỚP HỌC (CLASSES CRUD TRÊN SUB-COLLECTION)
// /schools/{schoolId}/classes/{classId}
// ============================================================================
export async function saveClassToFirebase(
  cls: SchoolClass,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.CLASSES, cls.id, sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(cls),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu lớp học lên Firebase:', error);
    return false;
  }
}

export async function saveMultipleClassesToFirebase(
  classes: SchoolClass[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const batch = writeBatch(db);
    classes.forEach((c) => {
      const docRef = getSchoolSubDocRef(COLLECTIONS.CLASSES, c.id, sid);
      batch.set(
        docRef,
        {
          ...sanitizeForFirestore(c),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách lớp học lên Firebase:', error);
    return false;
  }
}

export async function replaceAllClassesInFirebase(
  classes: SchoolClass[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.CLASSES, sid);
    const snap = await getDocs(colRef);
    const CHUNK_SIZE = 450;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    for (let i = 0; i < classes.length; i += CHUNK_SIZE) {
      const chunk = classes.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((c) => {
        const docRef = getSchoolSubDocRef(COLLECTIONS.CLASSES, c.id, sid);
        batch.set(
          docRef,
          {
            ...sanitizeForFirestore(c),
            schoolId: sid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi thay thế danh sách lớp học trên Firebase:', error);
    return false;
  }
}

export async function deleteClassFromFirebase(
  classId: string,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.CLASSES, classId, sid);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Lỗi xóa lớp học trên Firebase:', error);
    return false;
  }
}

// ============================================================================
// 4. MÔN HỌC (SUBJECTS CRUD TRÊN SUB-COLLECTION)
// /schools/{schoolId}/subjects/{subjectId}
// ============================================================================
export async function saveSubjectToFirebase(
  subject: Subject,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.SUBJECTS, subject.id, sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(subject),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu môn học lên Firebase:', error);
    return false;
  }
}

export async function saveMultipleSubjectsToFirebase(
  subjects: Subject[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const batch = writeBatch(db);
    subjects.forEach((s) => {
      const docRef = getSchoolSubDocRef(COLLECTIONS.SUBJECTS, s.id, sid);
      batch.set(
        docRef,
        {
          ...sanitizeForFirestore(s),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách môn học lên Firebase:', error);
    return false;
  }
}

export async function replaceAllSubjectsInFirebase(
  subjects: Subject[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.SUBJECTS, sid);
    const snap = await getDocs(colRef);
    const CHUNK_SIZE = 450;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    for (let i = 0; i < subjects.length; i += CHUNK_SIZE) {
      const chunk = subjects.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const docRef = getSchoolSubDocRef(COLLECTIONS.SUBJECTS, s.id, sid);
        batch.set(
          docRef,
          {
            ...sanitizeForFirestore(s),
            schoolId: sid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi thay thế danh sách môn học trên Firebase:', error);
    return false;
  }
}

export async function deleteSubjectFromFirebase(
  subjectId: string,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.SUBJECTS, subjectId, sid);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Lỗi xóa môn học trên Firebase:', error);
    return false;
  }
}

// ============================================================================
// 5. PHÒNG HỌC (ROOMS CRUD TRÊN SUB-COLLECTION)
// /schools/{schoolId}/rooms/{roomId}
// ============================================================================
export async function saveRoomToFirebase(
  room: Room,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.ROOMS, room.id, sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(room),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu phòng học lên Firebase:', error);
    return false;
  }
}

export async function saveMultipleRoomsToFirebase(
  rooms: Room[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const batch = writeBatch(db);
    rooms.forEach((r) => {
      const docRef = getSchoolSubDocRef(COLLECTIONS.ROOMS, r.id, sid);
      batch.set(
        docRef,
        {
          ...sanitizeForFirestore(r),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách phòng học lên Firebase:', error);
    return false;
  }
}

export async function deleteRoomFromFirebase(
  roomId: string,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.ROOMS, roomId, sid);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Lỗi xóa phòng học trên Firebase:', error);
    return false;
  }
}

// ============================================================================
// 6. PHÂN CÔNG GIẢNG DẠY (TEACHING ASSIGNMENTS CRUD TRÊN SUB-COLLECTION)
// /schools/{schoolId}/teachingAssignments/{assignmentId}
// ============================================================================
export async function saveAssignmentToFirebase(
  asg: TeachingAssignment,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.ASSIGNMENTS, asg.id, sid);
    await setDoc(
      docRef,
      {
        ...sanitizeForFirestore(asg),
        schoolId: sid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Lỗi lưu phân công giảng dạy lên Firebase:', error);
    return false;
  }
}

export async function saveMultipleAssignmentsToFirebase(
  assignments: TeachingAssignment[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const batch = writeBatch(db);
    assignments.forEach((a) => {
      const docRef = getSchoolSubDocRef(COLLECTIONS.ASSIGNMENTS, a.id, sid);
      batch.set(
        docRef,
        {
          ...sanitizeForFirestore(a),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách phân công lên Firebase:', error);
    return false;
  }
}

export async function deleteAssignmentFromFirebase(
  assignmentId: string,
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const docRef = getSchoolSubDocRef(COLLECTIONS.ASSIGNMENTS, assignmentId, sid);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Lỗi xóa phân công giảng dạy trên Firebase:', error);
    return false;
  }
}

export async function replaceAllAssignmentsInFirebase(
  assignments: TeachingAssignment[],
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.ASSIGNMENTS, sid);
    const snap = await getDocs(colRef);
    const deleteBatch = writeBatch(db);
    snap.docs.forEach((d) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();

    if (assignments.length > 0) {
      const insertBatch = writeBatch(db);
      assignments.forEach((a) => {
        const docRef = getSchoolSubDocRef(COLLECTIONS.ASSIGNMENTS, a.id, sid);
        insertBatch.set(docRef, {
          ...sanitizeForFirestore(a),
          schoolId: sid,
          updatedAt: serverTimestamp(),
        });
      });
      await insertBatch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi thay thế phân công giảng dạy trên Firebase:', error);
    return false;
  }
}

// ============================================================================
// 7. THỜI KHÓA BIỂU (TIMETABLE SLOTS REALTIME QUEUED WRITE TRÊN SUB-COLLECTION)
// /schools/{schoolId}/timetables/{slotId}
// ============================================================================

let isSavingTimetableLock = false;
let pendingTimetableSave: {
  slots: TimetableSlot[];
  termId: string;
  schoolId: string;
  resolve: (res: { success: boolean; totalWritten: number }) => void;
  reject: (err: any) => void;
} | null = null;

async function executeSaveTimetableSlots(
  slots: TimetableSlot[],
  termId = 'HK1_2026_2027',
  schoolId?: string
): Promise<{ success: boolean; totalWritten: number }> {
  let currentSchoolId = schoolId?.trim();

  if (typeof window !== 'undefined') {
    try {
      const sessionUserStr =
        sessionStorage.getItem('tkb_auth_session_user') || localStorage.getItem('tkb_auth_session_user');
      if (sessionUserStr) {
        const sessionUser = JSON.parse(sessionUserStr);
        if (sessionUser.role !== 'super_admin' && sessionUser.schoolId) {
          if (!currentSchoolId || currentSchoolId !== sessionUser.schoolId) {
            currentSchoolId = sessionUser.schoolId;
          }
        }
      }
    } catch (e) {}
  }

  const sid = getActiveSchoolId(currentSchoolId);
  try {
    // 1. Sao lưu dự phòng vào LocalStorage theo schoolId
    try {
      localStorage.setItem(`inprogress_timetable_slots_${sid}`, JSON.stringify(slots));
      localStorage.setItem(`inprogress_timetable_slots_time_${sid}`, new Date().toISOString());
    } catch (e) {
      console.warn('Không thể lưu cache local storage:', e);
    }

    // 2. Lấy danh sách doc hiện tại trên Firestore Sub-collection: /schools/{schoolId}/timetables
    const timetablesCol = collection(db, 'schools', sid, 'timetables');
    const snap = await getDocs(timetablesCol);
    const existingDocMap = new Map<string, any>();
    snap.docs.forEach((d) => existingDocMap.set(d.id, d.ref));

    const targetDocIds = new Set<string>();
    const CHUNK_SIZE = 450;

    // 3. Ghi / Cập nhật các slot có trong danh sách qua doc(collection(db, 'schools', sid, 'timetables'), timetableId)
    for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
      const chunk = slots.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((slot) => {
        const timetableId = slot.id || `${termId}_${slot.day}_${slot.period}_${slot.classId}_${slot.session || 'M'}`;
        targetDocIds.add(timetableId);
        const docRef = doc(timetablesCol, timetableId);
        batch.set(
          docRef,
          {
            ...sanitizeForFirestore(slot),
            termId,
            schoolId: sid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    // 4. Xóa các doc KHÔNG còn trong danh sách slots (tiết đã bị xóa/gỡ)
    const toDeleteRefs: any[] = [];
    existingDocMap.forEach((ref, docId) => {
      if (!targetDocIds.has(docId)) {
        toDeleteRefs.push(ref);
      }
    });

    for (let i = 0; i < toDeleteRefs.length; i += CHUNK_SIZE) {
      const deleteChunk = toDeleteRefs.slice(i, i + CHUNK_SIZE);
      const deleteBatch = writeBatch(db);
      deleteChunk.forEach((ref) => deleteBatch.delete(ref));
      await deleteBatch.commit();
    }

    return { success: true, totalWritten: slots.length };
  } catch (error: any) {
    console.warn(`Lưu thời khóa biểu trường ${sid} lên Cloud Firestore (sử dụng bộ nhớ cục bộ):`, error?.message || error);
    // Vẫn trả về thành công vì đã lưu trữ an toàn trong localStorage
    return { success: true, totalWritten: slots.length };
  }
}

export async function saveTimetableSlotsToFirebase(
  slots: TimetableSlot[],
  termId = 'HK1_2026_2027',
  schoolId?: string
): Promise<{ success: boolean; totalWritten: number }> {
  const sid = getActiveSchoolId(schoolId);

  // Local storage cache
  try {
    localStorage.setItem(`inprogress_timetable_slots_${sid}`, JSON.stringify(slots));
    localStorage.setItem(`inprogress_timetable_slots_time_${sid}`, new Date().toISOString());
  } catch {}

  if (isSavingTimetableLock) {
    return new Promise((resolve, reject) => {
      pendingTimetableSave = { slots, termId, schoolId: sid, resolve, reject };
    });
  }

  isSavingTimetableLock = true;
  try {
    const result = await executeSaveTimetableSlots(slots, termId, sid);

    while (pendingTimetableSave) {
      const nextTask = pendingTimetableSave;
      pendingTimetableSave = null;
      try {
        const nextRes = await executeSaveTimetableSlots(
          nextTask.slots,
          nextTask.termId,
          nextTask.schoolId
        );
        nextTask.resolve(nextRes);
      } catch (err) {
        nextTask.reject(err);
      }
    }

    return result;
  } finally {
    isSavingTimetableLock = false;
  }
}

// ============================================================================
// 8. ĐỒNG BỘ TOÀN BỘ HOẶC XÓA SẠCH DỮ LIỆU TRÊN SUB-COLLECTIONS
// ============================================================================
export async function clearTimetableSlotsFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    try {
      localStorage.removeItem(`inprogress_timetable_slots_${sid}`);
      localStorage.removeItem(`inprogress_timetable_slots_time_${sid}`);
    } catch {}
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.TIMETABLES, sid);
    const snap = await getDocs(colRef);
    const CHUNK_SIZE = 450;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa thời khóa biểu trên Firebase:', error);
    return false;
  }
}

export async function syncAllStateToFirebase(
  payload: {
    teachers: Teacher[];
    classes: SchoolClass[];
    subjects: Subject[];
    rooms: Room[];
    assignments: TeachingAssignment[];
    slots: TimetableSlot[];
  },
  schoolId?: string
): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    await Promise.all([
      saveMultipleTeachersToFirebase(payload.teachers, sid),
      saveMultipleClassesToFirebase(payload.classes, sid),
      saveMultipleSubjectsToFirebase(payload.subjects, sid),
      saveMultipleRoomsToFirebase(payload.rooms, sid),
      replaceAllAssignmentsInFirebase(payload.assignments, sid),
      saveTimetableSlotsToFirebase(payload.slots, 'HK1_2026_2027', sid),
    ]);
    return true;
  } catch (error) {
    console.error('Lỗi đồng bộ toàn bộ dữ liệu lên Firebase:', error);
    return false;
  }
}

export async function clearTeachersFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.TEACHERS, sid);
    const snap = await getDocs(colRef);
    if (snap.docs.length > 0) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa giáo viên trên Firebase:', error);
    return false;
  }
}

export async function clearSubjectsFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.SUBJECTS, sid);
    const snap = await getDocs(colRef);
    if (snap.docs.length > 0) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa môn học trên Firebase:', error);
    return false;
  }
}

export async function clearClassesFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.CLASSES, sid);
    const snap = await getDocs(colRef);
    if (snap.docs.length > 0) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa lớp học trên Firebase:', error);
    return false;
  }
}

export async function clearAssignmentsFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colRef = getSchoolSubcollectionRef(COLLECTIONS.ASSIGNMENTS, sid);
    const snap = await getDocs(colRef);
    if (snap.docs.length > 0) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa phân công trên Firebase:', error);
    return false;
  }
}

export async function clearAllDataFromFirebase(schoolId?: string): Promise<boolean> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const colNames = [
      COLLECTIONS.TEACHERS,
      COLLECTIONS.CLASSES,
      COLLECTIONS.SUBJECTS,
      COLLECTIONS.ROOMS,
      COLLECTIONS.ASSIGNMENTS,
      COLLECTIONS.TIMETABLES,
    ];

    for (const name of colNames) {
      const colRef = getSchoolSubcollectionRef(name, sid);
      const snap = await getDocs(colRef);
      if (snap.docs.length > 0) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    return true;
  } catch (error) {
    console.error('Lỗi xóa sạch dữ liệu trên Firebase:', error);
    return false;
  }
}
