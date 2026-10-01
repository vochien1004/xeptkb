/**
 * assignmentService.ts - Service Quản lý Phân công giảng dạy theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/teaching_assignments/{assignmentId}
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
import { TeachingAssignment } from '../types/timetable';

function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Phân công giảng dạy!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY DANH SÁCH PHÂN CÔNG GIẢNG DẠY TRONG SUB-COLLECTION CỦA TRƯỜNG
 * Collection: /schools/{schoolId}/teaching_assignments
 */
export async function fetchAssignmentsFromFirebase(schoolId: string): Promise<TeachingAssignment[]> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'teaching_assignments');
  let snap = await getDocs(colRef);

  if (snap.empty) {
    const legacyRef = collection(db, 'schools', sid, 'teachingAssignments');
    snap = await getDocs(legacyRef);
  }

  if (!snap.empty) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeachingAssignment));
  }
  return [];
}

/**
 * 2. LƯU HOẶC CẬP NHẬT 1 PHÂN CÔNG VÀO SUB-COLLECTION
 * Document: /schools/{schoolId}/teaching_assignments/{assignmentId}
 */
export async function saveAssignmentToFirebase(
  assignment: TeachingAssignment,
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!assignment.id) {
    throw new Error('ID Phân công giảng dạy không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'teaching_assignments', assignment.id);
  await setDoc(
    docRef,
    {
      ...assignment,
      schoolId: sid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

/**
 * 3. LƯU NHIỀU PHÂN CÔNG (BATCH WRITE) VÀO SUB-COLLECTION
 */
export async function saveMultipleAssignmentsToFirebase(
  assignments: TeachingAssignment[],
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (assignments.length === 0) return true;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < assignments.length; i += CHUNK_SIZE) {
    const chunk = assignments.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((a) => {
      const docRef = doc(db, 'schools', sid, 'teaching_assignments', a.id);
      batch.set(
        docRef,
        {
          ...a,
          schoolId: sid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
  return true;
}

/**
 * 4. THAY THẾ TOÀN BỘ PHÂN CÔNG GIẢNG DẠY TRONG SUB-COLLECTION
 */
export async function replaceAllAssignmentsInFirebase(
  assignments: TeachingAssignment[],
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'teaching_assignments');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const deleteBatch = writeBatch(db);
    snap.docs.forEach((d) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

  if (assignments.length > 0) {
    await saveMultipleAssignmentsToFirebase(assignments, sid);
  }
  return true;
}

/**
 * 5. XÓA 1 PHÂN CÔNG KHỎI SUB-COLLECTION
 */
export async function deleteAssignmentFromFirebase(
  assignmentId: string,
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!assignmentId) {
    throw new Error('ID Phân công giảng dạy không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'teaching_assignments', assignmentId);
  await deleteDoc(docRef);
  return true;
}
