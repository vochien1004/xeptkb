/**
 * teacherService.ts - Service Quản lý Giáo viên theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/teachers/{teacherId}
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { Teacher } from '../types/timetable';

/**
 * Ràng buộc an toàn: Bắt buộc phải có schoolId hợp lệ
 */
function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Giáo viên!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY DANH SÁCH GIÁO VIÊN TRONG SUB-COLLECTION CỦA TRƯỜNG
 * Collection: /schools/{schoolId}/teachers
 */
export async function fetchTeachersFromFirebase(schoolId: string): Promise<Teacher[]> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'teachers');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const list: Teacher[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const name = (data?.name || '').trim().toLowerCase();
      const code = (data?.code || '').trim().toLowerCase();
      if (d.id === 'init' || d.id === 'INIT' || name.includes('khởi tạo') || name.includes('khoi tao') || code === 'init' || code.includes('khởi tạo') || code.includes('khoi tao')) {
        deleteDoc(d.ref).catch(() => {});
      } else {
        list.push({ id: d.id, ...data } as Teacher);
      }
    });
    return list;
  }
  return [];
}

/**
 * 2. LƯU HOẶC CẬP NHẬT 1 GIÁO VIÊN VÀO SUB-COLLECTION
 * Document: /schools/{schoolId}/teachers/{teacherId}
 */
export async function saveTeacherToFirebase(teacher: Teacher, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!teacher.id) {
    throw new Error('ID Giáo viên không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'teachers', teacher.id);
  await setDoc(
    docRef,
    {
      ...teacher,
      schoolId: sid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

/**
 * 3. LƯU NHIỀU GIÁO VIÊN (BATCH WRITE) VÀO SUB-COLLECTION
 */
export async function saveMultipleTeachersToFirebase(
  teachers: Teacher[],
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (teachers.length === 0) return true;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < teachers.length; i += CHUNK_SIZE) {
    const chunk = teachers.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((t) => {
      const docRef = doc(db, 'schools', sid, 'teachers', t.id);
      batch.set(
        docRef,
        {
          ...t,
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
 * 4. XÓA 1 GIÁO VIÊN KHỎI SUB-COLLECTION
 */
export async function deleteTeacherFromFirebase(teacherId: string, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!teacherId) {
    throw new Error('ID Giáo viên không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'teachers', teacherId);
  await deleteDoc(docRef);
  return true;
}
