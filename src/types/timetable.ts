/**
 * TKB Engine Pro - Định nghĩa Data Schema và Type System
 * Chuẩn NoSQL Firebase Firestore & Thuật toán Xếp Thời Khóa Biểu
 */

// Các ngày trong tuần (Thứ 2 đến Thứ 7)
export type DayOfWeek = 2 | 3 | 4 | 5 | 6 | 7;

export const DAYS_OF_WEEK: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 2, label: 'Thứ Hai', short: 'T2' },
  { key: 3, label: 'Thứ Ba', short: 'T3' },
  { key: 4, label: 'Thứ Tư', short: 'T4' },
  { key: 5, label: 'Thứ Năm', short: 'T5' },
  { key: 6, label: 'Thứ Sáu', short: 'T6' },
  { key: 7, label: 'Thứ Bảy', short: 'T7' },
];

// Các tiết học trong ngày (1 - 5: Buổi sáng; 6 - 10: Buổi chiều)
export type PeriodOfDay = 1 | 2 | 3 | 4 | 5;

export const PERIODS: { period: PeriodOfDay; time: string; name: string }[] = [
  { period: 1, time: '07:00 - 07:45', name: 'Tiết 1' },
  { period: 2, time: '07:50 - 08:35', name: 'Tiết 2' },
  { period: 3, time: '08:50 - 09:35', name: 'Tiết 3' },
  { period: 4, time: '09:40 - 10:25', name: 'Tiết 4' },
  { period: 5, time: '10:30 - 11:15', name: 'Tiết 5' },
];

/**
 * 1. Khung giờ không thể dạy (Bận lịch, họp chuyên môn, lịch công tác)
 */
export interface TimeSlot {
  day: DayOfWeek;
  period: PeriodOfDay;
  session?: 'MORNING' | 'AFTERNOON';
}

/**
 * 2. Giáo viên (Collection: `teachers`)
 */
export interface Teacher {
  id: string;
  name: string; // Họ và tên giáo viên (VD: Thầy Trần Văn Nam)
  shortName?: string; // Tên GV viết tắt (VD: Nam, T.Nam, C.Hương)
  code: string; // Mã giáo viên (VD: GV01, GV_TOAN_01)
  phone?: string;
  email: string;
  subjects: string[]; // Môn giảng dạy
  maxPeriodsPerDay: number; // Tối đa tiết dạy trong 1 ngày (tránh quá tải)
  maxPeriodsPerWeek: number; // Tối đa số tiết/tuần
  unavailableSlots: TimeSlot[]; // Các tiết GV báo bận (Ràng buộc cứng)
  preferredSlots?: TimeSlot[]; // Tiết mong muốn dạy (Ràng buộc mềm)
  color?: string; // Mã màu hiển thị trên lưới TKB
}

/**
 * 3. Lớp học (Collection: `classes`)
 */
export interface SchoolClass {
  id: string;
  code?: string; // Mã lớp học (VD: 10A, 10A1, 11B)
  name: string;
  grade: 10 | 11 | 12;
  studentCount: number; // Sĩ số học sinh (để kiểm tra sức chứa phòng/sân)
  homeroomTeacherId?: string; // GV chủ nhiệm
  shift: 'MORNING' | 'AFTERNOON'; // Ca học
}

/**
 * 4. Phòng học / Sân bãi (Collection: `rooms`)
 */
export type RoomType = 'THEORY' | 'COMPUTER_LAB' | 'SCIENCE_LAB' | 'STADIUM' | 'HALL';

export interface Room {
  id: string;
  code?: string; // Mã phòng học (VD: P101, LAB_TIN)
  name: string;
  roomType: RoomType;
  capacity: number; // Sức chứa tối đa (HS)
  building?: string;
}

/**
 * 5. Môn học (Collection: `subjects`)
 */
export interface Subject {
  id: string;
  code: string; // Mã môn học (VD: TOAN, VAN, ANH)
  name: string; // Tên đầy đủ môn học (VD: Toán Học, Ngữ Văn)
  shortName?: string; // Tên viết tắt (VD: Toán, Văn, TAnh, Tin, Lý, Hóa)
  isHeavy: boolean; // Môn nặng (không >2 tiết/ngày)
  preferredShift?: 'MORNING' | 'AFTERNOON' | 'ANY'; // Phân loại môn học: Buổi Sáng / Chiều / Cả hai
  defaultRoomType?: RoomType;
}

/**
 * 6. Phân công giảng dạy - PCGD (Collection: `teaching_assignments`)
 * Hỗ trợ mạnh mẽ Tiết ghép (Merged Classes) và Co-teaching (Dạy chung nhóm GV)
 */
export interface TeachingAssignment {
  id: string;
  subjectId: string;
  teacherIds: string[]; // Mảng support 1 hoặc nhiều GV (Co-teaching)
  classIds: string[];   // Mảng support 1 hoặc nhiều lớp (Dạy ghép)
  periodsPerWeek: number; // Tổng số tiết cần xếp trong tuần
  requiredRoomType?: RoomType; // Yêu cầu phòng học đặc thù
  isMerged: boolean;    // Cờ đánh dấu tiết ghép N lớp
  doublePeriodsAllowed: boolean; // Có cho phép tiết kép (2 tiết liền nhau) không
  preferredDay?: DayOfWeek; // Ưu tiên ngày trong tuần (nếu có)
  priorityLevel?: number; // Cấp độ ưu tiên (tiết ghép ưu tiên số 1)
}

/**
 * 7. Đơn vị Slot lưu trữ kết quả TKB (Collection: `timetables` hoặc `timetable_slots`)
 * Đại diện cho 1 tiết học cụ thể trên thời khóa biểu
 */
export interface TimetableSlot {
  id: string;
  day: DayOfWeek;
  period: PeriodOfDay;
  session?: 'MORNING' | 'AFTERNOON'; // Buổi Sáng hoặc Buổi Chiều
  classId: string;
  teacherId: string; // Trong trường hợp co-teaching, mỗi bản ghi gắn với 1 GV hoặc lưu teacherIds
  teacherIds?: string[]; // Danh sách toàn bộ GV phụ trách (khi co-teaching)
  classIds?: string[];   // Danh sách toàn bộ lớp tham gia (khi ghép lớp)
  roomId: string;
  assignmentId: string;
  subjectId: string;
  isMerged: boolean;
  isCoTeaching: boolean;
}

/**
 * Kết quả kiểm tra xung đột
 */
export interface ConflictRecord {
  type: 'TEACHER_DOUBLE_BOOKING' | 'CLASS_DOUBLE_BOOKING' | 'ROOM_OVERFLOW' | 'TEACHER_UNAVAILABLE' | 'SHIFT_VIOLATION';
  day: DayOfWeek;
  period: PeriodOfDay;
  message: string;
  severity: 'CRITICAL' | 'WARNING';
  entities: {
    teacherIds?: string[];
    classIds?: string[];
    roomId?: string;
    subjectId?: string;
  };
}

/**
 * Kết quả so sánh thừa thiếu tiết so với PCGD
 */
export interface VolumeDiscrepancy {
  assignmentId: string;
  subjectName: string;
  classNames: string[];
  teacherNames: string[];
  expectedPeriods: number;
  actualPeriods: number;
  status: 'EXACT' | 'DEFICIT' | 'SURPLUS';
  difference: number;
}

/**
 * Điểm đánh giá Soft Constraints (Fitness Score)
 */
export interface FitnessMetrics {
  totalPenalty: number;
  fitnessScore: number; // 0 - 100
  breakdown: {
    teacherGaps: { count: number; penalty: number; details: string[] };
    heavySubjectClustering: { count: number; penalty: number; details: string[] };
    teacherPreferenceViolations: { count: number; penalty: number; details: string[] };
    isolatedSinglePeriods: { count: number; penalty: number; details: string[] };
  };
}

/**
 * Cấu hình tham số cho Solver
 */
export interface SolverConfig {
  maxBacktrackSteps: number;
  useMRV: boolean; // Minimum Remaining Values heuristic
  useDegreeHeuristic: boolean; // Ưu tiên biến có nhiều ràng buộc nhất
  enforceNoTeacherGaps: boolean; // Tránh tiết lủng
  geneticPopulationSize: number;
  geneticGenerations: number;
  mutationRate: number;
}

/**
 * Helper nhận diện tiết Chào cờ hoặc Sinh hoạt lớp
 * (Các tiết này không tính vào số tiết được phân công trong PCGD theo yêu cầu)
 */
export function isSpecialDutySubject(
  subjectId?: string,
  subject?: Subject,
  assignmentId?: string
): boolean {
  if (assignmentId) {
    const aUpper = assignmentId.toUpperCase();
    if (
      aUpper.includes('SHL') ||
      aUpper.includes('ASG_CC') ||
      aUpper.includes('SLOT_CC') ||
      aUpper.includes('CHAO_CO') ||
      aUpper.includes('SINH_HOAT')
    ) {
      return true;
    }
  }
  if (!subjectId) return false;
  const sUpper = subjectId.toUpperCase();
  if (
    sUpper === 'SUB_CC' ||
    sUpper === 'SUB_SHL' ||
    sUpper === 'CC' ||
    sUpper === 'SHL' ||
    sUpper.includes('CHAO_CO') ||
    sUpper.includes('SINH_HOAT')
  ) {
    return true;
  }
  if (subject) {
    const code = (subject.code || '').toUpperCase();
    if (code === 'CC' || code === 'SHL') return true;
    const name = (subject.name || '').toLowerCase();
    if (name.includes('chào cờ') || name.includes('sinh hoạt')) return true;
    const short = (subject.shortName || '').toLowerCase();
    if (short.includes('chào cờ') || short.includes('sinh hoạt')) return true;
  }
  return false;
}

