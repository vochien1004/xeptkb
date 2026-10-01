/**
 * settingService.ts - Service Quản lý Cấu hình hệ thống theo mô hình Firestore Sub-collections
 * Đường dẫn: /schools/{schoolId}/system_settings/{settingId}
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';

function assertValidSchoolId(schoolId?: string): string {
  if (!schoolId || !schoolId.trim()) {
    throw new Error('Cần có schoolId để thực hiện thao tác với Cấu hình hệ thống!');
  }
  return schoolId.trim();
}

/**
 * 1. LẤY CẤU HÌNH TRƯỜNG HỌC TỪ SUB-COLLECTION
 * Collection: /schools/{schoolId}/system_settings
 */
export async function fetchSchoolSettings(schoolId: string): Promise<Record<string, any>> {
  const sid = assertValidSchoolId(schoolId);
  const colRef = collection(db, 'schools', sid, 'system_settings');
  const snap = await getDocs(colRef);
  const settings: Record<string, any> = {};
  snap.docs.forEach((d) => {
    settings[d.id] = d.data();
  });
  return settings;
}

/**
 * 2. LƯU CẤU HÌNH TRƯỜNG HỌC VÀO SUB-COLLECTION
 * Document: /schools/{schoolId}/system_settings/{settingId}
 */
export async function saveSchoolSetting(
  settingId: string,
  data: any,
  schoolId: string
): Promise<boolean> {
  const sid = assertValidSchoolId(schoolId);
  if (!settingId) {
    throw new Error('Setting ID không được để trống!');
  }

  const docRef = doc(db, 'schools', sid, 'system_settings', settingId);
  await setDoc(
    docRef,
    {
      ...data,
      schoolId: sid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}
