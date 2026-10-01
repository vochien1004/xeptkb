/**
 * subjectService.ts - Service Quản lý Môn học theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/subjects/{subjectId}
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
import { Subject } from '../types/timetable';

function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Môn học!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY DANH SÁCH MÔN HỌC TRONG SUB-COLLECTION CỦA TRƯỜNG
 * Collection: /schools/{schoolId}/subjects
 */
export async function fetchSubjectsFromFirebase(schoolId: string): Promise<Subject[]> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'subjects');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const list: Subject[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const name = (data?.name || '').trim().toLowerCase();
      const code = (data?.code || '').trim().toLowerCase();
      if (d.id === 'init' || d.id === 'INIT' || name.includes('khởi tạo') || name.includes('khoi tao') || code === 'init' || code.includes('khởi tạo') || code.includes('khoi tao')) {
        deleteDoc(d.ref).catch(() => {});
      } else {
        list.push({ id: d.id, ...data } as Subject);
      }
    });
    return list;
  }
  return [];
}

/**
 * 2. LƯU HOẶC CẬP NHẬT 1 MÔN HỌC VÀO SUB-COLLECTION
 * Document: /schools/{schoolId}/subjects/{subjectId}
 */
export async function saveSubjectToFirebase(subject: Subject, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!subject.id) {
    throw new Error('ID Môn học không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'subjects', subject.id);
  await setDoc(
    docRef,
    {
      ...subject,
      schoolId: sid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

/**
 * 3. LƯU NHIỀU MÔN HỌC (BATCH WRITE) VÀO SUB-COLLECTION
 */
export async function saveMultipleSubjectsToFirebase(
  subjects: Subject[],
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (subjects.length === 0) return true;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < subjects.length; i += CHUNK_SIZE) {
    const chunk = subjects.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((s) => {
      const docRef = doc(db, 'schools', sid, 'subjects', s.id);
      batch.set(
        docRef,
        {
          ...s,
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
 * 4. XÓA 1 MÔN HỌC KHỎI SUB-COLLECTION
 */
export async function deleteSubjectFromFirebase(subjectId: string, schoolId: string): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!subjectId) {
    throw new Error('ID Môn học không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'subjects', subjectId);
  await deleteDoc(docRef);
  return true;
}
