/**
 * firebaseIntegration.ts - FIREBASE FIRESTORE SCHEMA DESIGN & API INTEGRATION
 * Kiến trúc Multi-tenancy Firestore Sub-collections:
 * - /schools/{schoolId}/teachers
 * - /schools/{schoolId}/classes
 * - /schools/{schoolId}/subjects
 * - /schools/{schoolId}/rooms
 * - /schools/{schoolId}/teaching_assignments
 * - /schools/{schoolId}/timetables
 * - /schools/{schoolId}/system_settings
 */

import {
  Teacher,
  SchoolClass,
  Room,
  TeachingAssignment,
  TimetableSlot,
} from '../types/timetable';
import { fetchTeachersFromFirebase } from './teacherService';
import { fetchClassesFromFirebase } from './classService';
import { fetchAssignmentsFromFirebase } from './assignmentService';
import { saveTimetableSlotsToFirebase } from './timetableService';
import { getActiveSchoolId } from './firebaseClient';

export interface FirebaseInputPayload {
  teachers: Teacher[];
  classes: SchoolClass[];
  rooms: Room[];
  assignments: TeachingAssignment[];
}

/**
 * 1. Hàm lấy toàn bộ dữ liệu đầu vào từ Firestore Sub-collections
 */
export async function fetchInputDataFromFirebase(
  schoolId?: string
): Promise<FirebaseInputPayload> {
  const sid = getActiveSchoolId(schoolId);
  try {
    const [teachers, classes, assignments] = await Promise.all([
      fetchTeachersFromFirebase(sid),
      fetchClassesFromFirebase(sid),
      fetchAssignmentsFromFirebase(sid),
    ]);

    if (teachers.length > 0 || classes.length > 0 || assignments.length > 0) {
      return {
        teachers,
        classes,
        rooms: [],
        assignments,
      };
    }
  } catch (e) {
    console.warn('Lỗi khi fetchInputDataFromFirebase:', e);
  }

  return {
    teachers: [],
    classes: [],
    rooms: [],
    assignments: [],
  };
}

/**
 * 2. Hàm lưu Thời khóa biểu vào Firestore Sub-collection dạng BATCH WRITE
 */
export async function saveTimetableToFirebase(
  slots: TimetableSlot[],
  termId = 'HK1_2026_2027',
  schoolId?: string
): Promise<{ success: boolean; totalWritten: number; batchesCount: number }> {
  const sid = getActiveSchoolId(schoolId);
  const res = await saveTimetableSlotsToFirebase(slots, sid, termId);
  return {
    success: res.success,
    totalWritten: res.totalWritten,
    batchesCount: Math.ceil(slots.length / 450) || 1,
  };
}

/**
 * 3. Nội dung file cấu hình firestore.rules khuyến nghị theo mô hình Sub-collections
 */
export const FIRESTORE_SECURITY_RULES_SAMPLE = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Hàm tiện ích xác thực Role
    function isAuthenticated() {
      return request.auth != null;
    }

    // 1. Root Collection: /users/{userId}
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }

    // 2. Root Collection: /schools/{schoolId} & Sub-collections
    match /schools/{schoolId} {
      allow read: if true;
      allow write: if isAuthenticated();

      // Sub-collections bên trong từng trường học:
      match /teachers/{teacherId} {
        allow read, write: if isAuthenticated();
      }
      match /classes/{classId} {
        allow read, write: if isAuthenticated();
      }
      match /subjects/{subjectId} {
        allow read, write: if isAuthenticated();
      }
      match /teaching_assignments/{assignmentId} {
        allow read, write: if isAuthenticated();
      }
      match /timetables/{slotId} {
        allow read, write: if isAuthenticated();
      }
      match /system_settings/{settingId} {
        allow read, write: if isAuthenticated();
      }
      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated();
      }
    }
  }
}
`.trim();

/**
 * 4. Composite Indexes khuyến nghị cho Firestore Sub-collections
 */
export const FIRESTORE_INDEXES_RECOMMENDATION = `
{
  "indexes": [
    {
      "collectionGroup": "timetables",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "schoolId", "order": "ASCENDING" },
        { "fieldPath": "classId", "order": "ASCENDING" },
        { "fieldPath": "day", "order": "ASCENDING" },
        { "fieldPath": "period", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "teaching_assignments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "schoolId", "order": "ASCENDING" },
        { "fieldPath": "teacherId", "order": "ASCENDING" }
      ]
    }
  ]
}
`.trim();
