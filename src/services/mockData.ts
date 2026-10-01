/**
 * Mock Data - Đã xóa toàn bộ dữ liệu mẫu theo yêu cầu.
 * Tất cả dữ liệu Môn học, Lớp học, Phòng học, Giáo viên và Phân công giảng dạy
 * sẽ được nhập thực tế và lưu/tải 100% từ Firestore Sub-collections (/schools/{schoolId}/...).
 */

import {
  Teacher,
  SchoolClass,
  Room,
  Subject,
  TeachingAssignment,
} from '../types/timetable';

export const MOCK_SUBJECTS: Subject[] = [];
export const MOCK_CLASSES: SchoolClass[] = [];
export const MOCK_ROOMS: Room[] = [];
export const MOCK_TEACHERS: Teacher[] = [];
export const MOCK_ASSIGNMENTS: TeachingAssignment[] = [];
