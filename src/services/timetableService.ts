/**
 * timetableService.ts - Service Quản lý Thời khóa biểu theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/timetables/{slotId}
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { TimetableSlot } from '../types/timetable';

function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Thời khóa biểu!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY DANH SÁCH TIẾT THỜI KHÓA BIỂU TRONG SUB-COLLECTION CỦA TRƯỜNG
 * Collection: /schools/{schoolId}/timetables
 */
export async function fetchTimetableSlotsFromFirebase(
  schoolId: string,
  termId = 'HK1_2026_2027'
): Promise<TimetableSlot[]> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'timetables');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableSlot));
  }
  return [];
}

/**
 * 2. LƯU HOẶC ĐỒNG BỘ TOÀN BỘ TIẾT THỜI KHÓA BIỂU VÀO SUB-COLLECTION
 * Đường dẫn chính xác: collection(db, 'schools', sid, 'timetables')
 */
export async function saveTimetableSlotsToFirebase(
  slots: TimetableSlot[],
  schoolId: string,
  termId = 'HK1_2026_2027'
): Promise<{ success: boolean; totalWritten: number }> {
  const sid = assertValidSchoolId(schoolId);

  const timetablesCollection = collection(db, 'schools', sid, 'timetables');
  const snap = await getDocs(timetablesCollection);
  const existingDocMap = new Map<string, any>();
  snap.docs.forEach((d) => existingDocMap.set(d.id, d.ref));

  const targetDocIds = new Set<string>();
  const CHUNK_SIZE = 450;

  // Ghi các slot hiện có trực tiếp lên Firestore
  for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
    const chunk = slots.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((slot) => {
      const timetableId = slot.id || `${termId}_${slot.day}_${slot.period}_${slot.classId}_${slot.session || 'M'}`;
      targetDocIds.add(timetableId);

      const docRef = doc(timetablesCollection, timetableId);
      batch.set(
        docRef,
        {
          ...slot,
          termId,
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  // Xóa các doc không còn tồn tại trong danh sách
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
}

// Alias hỗ trợ tương thích
export const saveTimetable = saveTimetableSlotsToFirebase;

/**
 * 3. XÓA SẠCH THỜI KHÓA BIỂU KHỎI SUB-COLLECTION
 */
export async function clearTimetableSlotsFromFirebase(schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'timetables');
  const snap = await getDocs(colRef);
  const CHUNK_SIZE = 450;
  for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
    const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return true;
}
