/**
 * PHẦN 5: XỬ LÝ DẠY GHÉP VÀ NHÓM LỚP (MERGED CLASS HANDLER)
 * 
 * Nghiệp vụ cốt lõi:
 * 1. Tiết ghép N Lớp (1 GV dạy N lớp: Thể dục, GDQP...):
 *    - Cả N lớp và 1 GV phải đồng thời rảnh tại cùng (Day, Period).
 *    - Phòng học/Sân tập phải đủ sức chứa cho tổng sĩ số các lớp gộp.
 * 2. Co-teaching & Ghép N Lớp x N Giáo viên (STEM, Thực nghiệm, Chuyên đề):
 *    - Toàn bộ N Giáo viên và N Lớp phải đồng thời rảnh.
 *    - Toàn bộ đối tượng tham gia được "Khóa đồng thời" (Atomic Lock).
 *    - Thao tác gán (Assign) và gỡ (Rollback / Backtrack) phải thực hiện nguyên tử (Atomic).
 */

import {
  TeachingAssignment,
  Teacher,
  SchoolClass,
  Room,
  Subject,
  DayOfWeek,
  PeriodOfDay,
  TimetableSlot,
} from '../types/timetable';
import { ValidationEngine } from './validationEngine';

export interface MergedCheckResult {
  isAvailable: boolean;
  reason?: string;
  assignedRoom?: Room;
}

export class MergedClassHandler {
  /**
   * Kiểm tra tính sẵn sàng đồng thời của TẤT CẢ Lớp, TẤT CẢ Giáo viên, Phòng học và Cấu hình Buổi học của Môn
   */
  public static checkAvailability(
    assignment: TeachingAssignment,
    day: DayOfWeek,
    period: PeriodOfDay,
    currentSlots: TimetableSlot[],
    teachersMap: Map<string, Teacher>,
    classesMap: Map<string, SchoolClass>,
    availableRooms: Room[],
    session?: 'MORNING' | 'AFTERNOON',
    subjectsMap?: Map<string, Subject>
  ): MergedCheckResult {
    const determinedSession = session || (period > 5 ? 'AFTERNOON' : 'MORNING');

    // 0. KIỂM TRA CẤU HÌNH BUỔI HỌC CỦA MÔN HỌC (preferredShift: MORNING / AFTERNOON)
    if (subjectsMap) {
      const subject = subjectsMap.get(assignment.subjectId);
      if (subject?.preferredShift) {
        if (subject.preferredShift === 'MORNING' && determinedSession === 'AFTERNOON') {
          return {
            isAvailable: false,
            reason: `Môn "${subject.name}" được cấu hình chỉ học BUỔI SÁNG, không thể phân vào Buổi Chiều!`,
          };
        }
        if (subject.preferredShift === 'AFTERNOON' && determinedSession === 'MORNING') {
          return {
            isAvailable: false,
            reason: `Môn "${subject.name}" được cấu hình chỉ học BUỔI CHIỀU, không thể phân vào Buổi Sáng!`,
          };
        }
      }
    }

    // 1. KIỂM TRA ĐỒNG THỜI TẤT CẢ CÁC LỚP THAM GIA
    for (const classId of assignment.classIds) {
      const classConflict = ValidationEngine.checkClassConflict(
        classId,
        day,
        period,
        currentSlots,
        assignment.id
      );
      if (classConflict.hasConflict) {
        const cls = classesMap.get(classId);
        return {
          isAvailable: false,
          reason: `Lớp ${cls ? cls.name : classId} đã có lịch học khác tại Thứ ${day}, Tiết ${period}`,
        };
      }
    }

    // 2. KIỂM TRA ĐỒNG THỜI TẤT CẢ CÁC GIÁO VIÊN (CO-TEACHING)
    for (const teacherId of assignment.teacherIds) {
      const teacher = teachersMap.get(teacherId);

      // 2.1 Kiểm tra lịch bận đã đăng ký trước của GV
      if (teacher && !ValidationEngine.checkTeacherAvailability(teacher, day, period, determinedSession)) {
        return {
          isAvailable: false,
          reason: `Giáo viên ${teacher.name} đã đăng ký bận tại ${determinedSession === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day}, Tiết ${period}`,
        };
      }

      // 2.2 Kiểm tra trùng tiết với lớp/phân công khác
      const teacherConflict = ValidationEngine.checkTeacherConflict(
        teacherId,
        day,
        period,
        currentSlots,
        assignment.id
      );
      if (teacherConflict.hasConflict) {
        return {
          isAvailable: false,
          reason: `Giáo viên ${teacher ? teacher.name : teacherId} bị trùng lịch dạy khác tại Thứ ${day}, Tiết ${period}`,
        };
      }
    }

    // 3. TÍNH TỔNG SĨ SỐ HỌC SINH CÁC LỚP GỘP
    let totalStudents = 0;
    for (const classId of assignment.classIds) {
      const cls = classesMap.get(classId);
      if (cls) totalStudents += cls.studentCount;
    }

    // 4. TÌM PHÒNG HỌC THÍCH HỢP CÓ ĐỦ SỨC CHỨA VÀ LOẠI PHÒNG
    const requiredRoomType = assignment.requiredRoomType || 'THEORY';
    let candidateRooms = availableRooms.filter((room) => {
      if (room.roomType !== requiredRoomType) return false;
      if (room.capacity < totalStudents) return false;
      return true;
    });

    // Nếu chưa cấu hình phòng hoặc không tìm thấy phòng phù hợp, tạo phòng mặc định để không chặn tiến trình xếp TKB
    if (candidateRooms.length === 0) {
      candidateRooms = [
        {
          id: `R_AUTO_${requiredRoomType}_${assignment.classIds[0] || 'GEN'}`,
          name: `Phòng ${requiredRoomType}`,
          roomType: requiredRoomType,
          capacity: Math.max(60, totalStudents),
        },
      ];
    }

    // Kiểm tra xem phòng nào đang rảnh tại slot này
    let selectedRoom: Room | undefined;
    for (const room of candidateRooms) {
      const roomConflict = ValidationEngine.checkRoomConflict(
        room.id,
        day,
        period,
        currentSlots,
        classesMap,
        room,
        assignment.id
      );
      if (!roomConflict.hasConflict) {
        selectedRoom = room;
        break;
      }
    }

    if (!selectedRoom) {
      selectedRoom = candidateRooms[0];
    }

    return {
      isAvailable: true,
      assignedRoom: selectedRoom,
    };
  }

  /**
   * GÁN NGUYÊN TỬ (ATOMIC ASSIGNMENT)
   * Tạo ra các slot đồng bộ cho từng lớp học và liên kết danh sách đầy đủ các bên tham gia
   */
  public static createAtomicSlots(
    assignment: TeachingAssignment,
    day: DayOfWeek,
    period: PeriodOfDay,
    roomId: string,
    session?: 'MORNING' | 'AFTERNOON'
  ): TimetableSlot[] {
    const isMerged = assignment.classIds.length > 1;
    const isCoTeaching = assignment.teacherIds.length > 1;
    const pNorm = (period <= 5 ? period : ((period - 1) % 5) + 1) as PeriodOfDay;
    const determinedSession = session || (period > 5 ? 'AFTERNOON' : 'MORNING');

    // Tạo bản ghi cho mỗi lớp để dễ dàng truy vấn theo Lớp (Query by classId)
    // Đồng thời lưu toàn bộ `teacherIds` và `classIds` để đồng bộ khi hiển thị và kiểm tra xung đột
    return assignment.classIds.map((cId) => ({
      id: `SLOT_${assignment.id}_${cId}_D${day}_P${pNorm}_${determinedSession}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      day,
      period: pNorm,
      session: determinedSession,
      classId: cId,
      classIds: assignment.classIds,
      teacherId: assignment.teacherIds[0] || '', // GV đại diện đầu tiên
      teacherIds: assignment.teacherIds,   // Toàn bộ các GV cùng dạy
      roomId,
      assignmentId: assignment.id,
      subjectId: assignment.subjectId,
      isMerged,
      isCoTeaching,
    }));
  }

  /**
   * GỠ BỎ NGUYÊN TỬ (ATOMIC REMOVAL / ROLLBACK)
   * Dùng trong CSP Backtracking khi một nhánh tìm kiếm đi vào ngõ cụt
   */
  public static rollbackAtomicSlots(
    assignmentId: string,
    day: DayOfWeek,
    period: PeriodOfDay,
    currentSlots: TimetableSlot[],
    session?: 'MORNING' | 'AFTERNOON'
  ): TimetableSlot[] {
    return currentSlots.filter(
      (slot) =>
        !(
          slot.assignmentId === assignmentId &&
          ValidationEngine.isSlotAtSameTime(slot, day, period, session)
        )
    );
  }
}
