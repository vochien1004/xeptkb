/**
 * classService.ts - Service Quản lý Lớp học theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/classes/{classId}
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
import { SchoolClass } from '../types/timetable';

function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Lớp học!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY DANH SÁCH LỚP HỌC TRONG SUB-COLLECTION CỦA TRƯỜNG
 * Collection: /schools/{schoolId}/classes
 */
export async function fetchClassesFromFirebase(schoolId: string): Promise<SchoolClass[]> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'classes');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const list: SchoolClass[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const name = (data?.name || '').trim().toLowerCase();
      const code = (data?.code || '').trim().toLowerCase();
      if (d.id === 'init' || d.id === 'INIT' || name.includes('khởi tạo') || name.includes('khoi tao') || code === 'init' || code.includes('khởi tạo') || code.includes('khoi tao')) {
        deleteDoc(d.ref).catch(() => {});
      } else {
        list.push({ id: d.id, ...data } as SchoolClass);
      }
    });
    return list;
  }
  return [];
}

/**
 * 2. LƯU HOẶC CẬP NHẬT 1 LỚP HỌC VÀO SUB-COLLECTION
 * Document: /schools/{schoolId}/classes/{classId}
 */
export async function saveClassToFirebase(cls: SchoolClass, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!cls.id) {
    throw new Error('ID Lớp học không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'classes', cls.id);
  await setDoc(
    docRef,
    {
      ...cls,
      schoolId: sid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

/**
 * 3. LƯU NHIỀU LỚP HỌC (BATCH WRITE) VÀO SUB-COLLECTION
 */
export async function saveMultipleClassesToFirebase(
  classes: SchoolClass[],
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (classes.length === 0) return true;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < classes.length; i += CHUNK_SIZE) {
    const chunk = classes.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((c) => {
      const docRef = doc(db, 'schools', sid, 'classes', c.id);
      batch.set(
        docRef,
        {
          ...c,
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
 * 4. XÓA 1 LỚP HỌC KHỎI SUB-COLLECTION
 */
export async function deleteClassFromFirebase(classId: string, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!classId) {
    throw new Error('ID Lớp học không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'classes', classId);
  await deleteDoc(docRef);
  return true;
}
