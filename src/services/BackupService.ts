/**
 * BackupService.ts - Dịch vụ Sao lưu và Khôi phục Dữ liệu Toàn hệ thống
 * Ứng dụng: TKB Engine Pro (Multi-tenant)
 * Lưu trữ: Firebase Firestore Sub-collections under /schools/{schoolId}
 */

import {
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  COLLECTIONS,
  getActiveSchoolId,
  getSchoolSubcollectionRef,
  getSchoolSubDocRef,
} from './firebaseClient';
import {
  Teacher,
  SchoolClass,
  Room,
  Subject,
  TeachingAssignment,
  TimetableSlot,
} from '../types/timetable';

export interface BackupMetadata {
  appName: string;
  totalCollections: number;
  schoolId?: string;
  [key: string]: any;
}

export interface BackupDataPayload {
  teachers: Teacher[];
  classes: SchoolClass[];
  rooms: Room[];
  subjects: Subject[];
  teachingAssignments: TeachingAssignment[];
  timetableSlots: TimetableSlot[];
}

export interface BackupPackage {
  version: string;
  exportedAt: string;
  metadata: BackupMetadata;
  data: BackupDataPayload;
}

export type RestoreMode = 'OVERWRITE' | 'MERGE';

export interface RestoreOptions {
  mode: RestoreMode;
}

export interface RestoreStats {
  teachersCount: number;
  classesCount: number;
  roomsCount: number;
  subjectsCount: number;
  assignmentsCount: number;
  slotsCount: number;
  totalDocuments: number;
  mode: RestoreMode;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  stats: RestoreStats;
  restoredData: BackupDataPayload;
}

// Giới hạn batch size tối đa cho Firestore (tiêu chuẩn Firestore là 500, chọn 400 an toàn)
const BATCH_CHUNK_SIZE = 400;

// Giới hạn kích thước file JSON (25MB)
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Loại bỏ các trường undefined để tương thích Firestore
 */
function sanitizeItemForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeItemForFirestore);
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = sanitizeItemForFirestore(v);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * A. SAO LƯU DỮ LIỆU (EXPORT JSON) THEO SUB-COLLECTIONS CỦA TRƯỜNG
 * Đọc toàn bộ dữ liệu từ 6 sub-collections chính dưới /schools/{schoolId}
 */
export async function exportSystemDataToJSON(schoolId?: string): Promise<{
  success: boolean;
  fileName?: string;
  backupPackage?: BackupPackage;
  error?: string;
}> {
  const sid = getActiveSchoolId(schoolId);
  try {
    // 1. Đọc dữ liệu song song từ 6 sub-collections chính
    const [
      teachersSnap,
      classesSnap,
      roomsSnap,
      subjectsSnap,
      assignmentsSnap,
      slotsSnap,
    ] = await Promise.all([
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.TEACHERS, sid)),
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.CLASSES, sid)),
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.ROOMS, sid)),
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.SUBJECTS, sid)),
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.ASSIGNMENTS, sid)),
      getDocs(getSchoolSubcollectionRef(COLLECTIONS.TIMETABLES, sid)),
    ]);

    const teachers = teachersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Teacher[];
    const classes = classesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as SchoolClass[];
    const rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Room[];
    const subjects = subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Subject[];
    const teachingAssignments = assignmentsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as TeachingAssignment[];
    const timetableSlots = slotsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as TimetableSlot[];

    // 2. Đóng gói chuẩn theo định dạng yêu cầu
    const backupPackage: BackupPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        appName: 'TKB Engine Pro',
        totalCollections: 6,
        schoolId: sid,
      },
      data: {
        teachers,
        classes,
        rooms,
        subjects,
        teachingAssignments,
        timetableSlots,
      },
    };

    // 3. Tạo Blob và kích hoạt tải xuống tự động
    const jsonString = JSON.stringify(backupPackage, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Tên file dạng: TKB_ENGINE_BACKUP_{schoolId}_YYYY-MM-DD.json
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const fileName = `TKB_ENGINE_BACKUP_${sid}_${yyyy}-${mm}-${dd}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      fileName,
      backupPackage,
    };
  } catch (error: any) {
    console.error(`Lỗi khi xuất dữ liệu trường ${sid} ra JSON:`, error);
    return {
      success: false,
      error: error?.message || 'Không thể đọc dữ liệu từ Firestore hoặc tạo file tải về.',
    };
  }
}

/**
 * Kiểm tra tính hợp lệ và phân tích cấu trúc file Backup JSON
 */
export async function validateBackupJSONFile(file: File): Promise<{
  isValid: boolean;
  errorMessage?: string;
  parsedPackage?: BackupPackage;
}> {
  // 1. Kiểm tra kích thước file
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      errorMessage: `Dung lượng file (${(file.size / (1024 * 1024)).toFixed(1)}MB) vượt quá giới hạn 25MB cho phép.`,
    };
  }

  // 2. Đọc nội dung text
  let content = '';
  try {
    content = await file.text();
  } catch (e: any) {
    return {
      isValid: false,
      errorMessage: 'Không thể đọc dữ liệu từ file được chọn. Vui lòng kiểm tra lại quyền truy cập file.',
    };
  }

  // 3. Phân tích cú pháp JSON
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e: any) {
    return {
      isValid: false,
      errorMessage: 'File không đúng định dạng JSON hợp lệ (Syntax Error). Vui lòng chọn đúng file sao lưu.',
    };
  }

  // 4. Kiểm tra cấu trúc khung JSON
  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      errorMessage: 'Dữ liệu JSON rỗng hoặc không phải là Object hợp lệ.',
    };
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    return {
      isValid: false,
      errorMessage: 'Thiếu trường "data" bắt buộc chứa dữ liệu các collection trong file sao lưu.',
    };
  }

  const { data } = parsed;

  // Chuẩn hóa và cho phép tương thích nếu các trường có tên đồng nghĩa
  const teachers = Array.isArray(data.teachers) ? data.teachers : [];
  const classes = Array.isArray(data.classes) ? data.classes : [];
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const teachingAssignments = Array.isArray(data.teachingAssignments)
    ? data.teachingAssignments
    : Array.isArray(data.assignments)
    ? data.assignments
    : [];
  const timetableSlots = Array.isArray(data.timetableSlots)
    ? data.timetableSlots
    : Array.isArray(data.slots)
    ? data.slots
    : [];

  const hasValidCollections =
    Array.isArray(data.teachers) ||
    Array.isArray(data.classes) ||
    Array.isArray(data.subjects) ||
    Array.isArray(data.teachingAssignments) ||
    Array.isArray(data.timetableSlots);

  if (!hasValidCollections) {
    return {
      isValid: false,
      errorMessage:
        'Cấu trúc "data" không chứa danh mục hợp lệ (teachers, classes, rooms, subjects, teachingAssignments, timetableSlots).',
    };
  }

  const normalizedPackage: BackupPackage = {
    version: parsed.version || '1.0.0',
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    metadata: {
      appName: parsed.metadata?.appName || 'TKB Engine Pro',
      totalCollections: 6,
      schoolId: parsed.metadata?.schoolId,
      ...parsed.metadata,
    },
    data: {
      teachers,
      classes,
      rooms,
      subjects,
      teachingAssignments,
      timetableSlots,
    },
  };

  return {
    isValid: true,
    parsedPackage: normalizedPackage,
  };
}

/**
 * B. CẬP NHẬT / KHÔI PHỤC DỮ LIỆU (IMPORT/RESTORE JSON) VÀO SUB-COLLECTIONS CỦA TRƯỜNG
 * @param file File JSON sao lưu
 * @param options Chế độ phục hồi: OVERWRITE hoặc MERGE
 * @param schoolId Mã trường học đích cần khôi phục
 */
export async function importSystemDataFromJSON(
  file: File,
  options: RestoreOptions,
  schoolId?: string
): Promise<RestoreResult> {
  const sid = getActiveSchoolId(schoolId);
  const { mode } = options;

  // Bước 1: Validation
  const validation = await validateBackupJSONFile(file);
  if (!validation.isValid || !validation.parsedPackage) {
    throw new Error(validation.errorMessage || 'File sao lưu không hợp lệ.');
  }

  const { data } = validation.parsedPackage;
  const teachers = data.teachers || [];
  const classes = data.classes || [];
  const rooms = data.rooms || [];
  const subjects = data.subjects || [];
  const assignments = data.teachingAssignments || [];
  const slots = data.timetableSlots || [];

  const totalDocuments =
    teachers.length +
    classes.length +
    rooms.length +
    subjects.length +
    assignments.length +
    slots.length;

  const stats: RestoreStats = {
    teachersCount: teachers.length,
    classesCount: classes.length,
    roomsCount: rooms.length,
    subjectsCount: subjects.length,
    assignmentsCount: assignments.length,
    slotsCount: slots.length,
    totalDocuments,
    mode,
  };

  try {
    // Bước 2: Xử lý ghi đè (OVERWRITE)
    if (mode === 'OVERWRITE') {
      const collectionsToClear = [
        COLLECTIONS.TEACHERS,
        COLLECTIONS.CLASSES,
        COLLECTIONS.ROOMS,
        COLLECTIONS.SUBJECTS,
        COLLECTIONS.ASSIGNMENTS,
        COLLECTIONS.TIMETABLES,
      ];

      for (const collName of collectionsToClear) {
        const colRef = getSchoolSubcollectionRef(collName, sid);
        const snap = await getDocs(colRef);
        if (snap.empty) continue;

        let deleteBatch = writeBatch(db);
        let count = 0;

        for (const docSnap of snap.docs) {
          deleteBatch.delete(docSnap.ref);
          count++;
          if (count >= BATCH_CHUNK_SIZE) {
            await deleteBatch.commit();
            deleteBatch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) {
          await deleteBatch.commit();
        }
      }
    }

    // Bước 3: Ghi dữ liệu vào Sub-collections
    const isMerge = mode === 'MERGE';
    const queue: { coll: string; id: string; payload: any }[] = [];

    teachers.forEach((t) => {
      const id = t.id || `T_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.TEACHERS, id, payload: { ...t, id, schoolId: sid } });
    });

    classes.forEach((c) => {
      const id = c.id || `C_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.CLASSES, id, payload: { ...c, id, schoolId: sid } });
    });

    rooms.forEach((r) => {
      const id = r.id || `R_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.ROOMS, id, payload: { ...r, id, schoolId: sid } });
    });

    subjects.forEach((s) => {
      const id = s.id || `S_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.SUBJECTS, id, payload: { ...s, id, schoolId: sid } });
    });

    assignments.forEach((a) => {
      const id = a.id || `ASG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.ASSIGNMENTS, id, payload: { ...a, id, schoolId: sid } });
    });

    slots.forEach((sl) => {
      const id = sl.id || `SLOT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      queue.push({ coll: COLLECTIONS.TIMETABLES, id, payload: { ...sl, id, schoolId: sid } });
    });

    // Thực hiện ghi theo từng lô writeBatch
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const item of queue) {
      const docRef = getSchoolSubDocRef(item.coll, item.id, sid);
      const cleanData = sanitizeItemForFirestore({
        ...item.payload,
        updatedAt: serverTimestamp(),
      });

      batch.set(docRef, cleanData, { merge: isMerge });
      batchCount++;

      if (batchCount >= BATCH_CHUNK_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Sao lưu cục bộ slot vào LocalStorage
    try {
      if (slots.length > 0) {
        localStorage.setItem(`inprogress_timetable_slots_${sid}`, JSON.stringify(slots));
      }
    } catch (e) {
      console.warn('Lưu cache local storage sau restore:', e);
    }

    return {
      success: true,
      message: `Khôi phục thành công ${totalDocuments} bản ghi vào trường [${sid}] (Chế độ: ${
        mode === 'OVERWRITE' ? 'Ghi đè' : 'Hợp nhất'
      })`,
      stats,
      restoredData: {
        teachers,
        classes,
        rooms,
        subjects,
        teachingAssignments: assignments,
        timetableSlots: slots,
      },
    };
  } catch (error: any) {
    console.error(`Lỗi khi khôi phục dữ liệu trường ${sid} từ file JSON:`, error);
    throw new Error(error?.message || 'Có lỗi xảy ra khi ghi dữ liệu vào Firebase Firestore.');
  }
}
