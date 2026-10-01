/**
 * PHẦN 2: MODULE KIỂM TRA XUNG ĐỘT & CẢNH BÁO (VALIDATION ENGINE)
 * Chịu trách nhiệm kiểm tra 100% Ràng buộc cứng (Hard Constraints)
 * và so sánh khối lượng giảng dạy (Volume Discrepancy).
 */

import {
  TimetableSlot,
  TeachingAssignment,
  Teacher,
  SchoolClass,
  Room,
  Subject,
  DayOfWeek,
  PeriodOfDay,
  ConflictRecord,
  VolumeDiscrepancy,
  isSpecialDutySubject,
} from '../types/timetable';

export class ValidationEngine {
  /**
   * Helper: Đối chiếu xem slot có trùng khớp thời gian (Day, Period, Session) hay không
   */
  public static isSlotAtSameTime(
    slot: TimetableSlot,
    day: DayOfWeek,
    period: PeriodOfDay,
    session?: 'MORNING' | 'AFTERNOON'
  ): boolean {
    if (slot.day !== day) return false;
    const sSess = slot.session || (slot.period <= 5 ? 'MORNING' : 'AFTERNOON');
    const sPeriodNum = slot.session ? slot.period : (slot.period <= 5 ? slot.period : slot.period - 5);
    const targetPeriodNum = period <= 5 ? period : period - 5;

    if (sPeriodNum !== targetPeriodNum) return false;
    if (session && sSess !== session) return false;
    return true;
  }

  /**
   * 1. Kiểm tra TRÙNG TIẾT GIÁO VIÊN
   * Quy tắc nghiệp vụ: Một giáo viên không thể ở 2 nơi cùng lúc.
   * NGOẠI LỆ: Nếu cùng một assignmentId (tiết ghép N lớp do cùng GV dạy), đây là hợp lệ!
   */
  public static checkTeacherConflict(
    teacherId: string,
    day: DayOfWeek,
    period: PeriodOfDay,
    slots: TimetableSlot[],
    currentAssignmentId?: string,
    currentClassId?: string,
    session?: 'MORNING' | 'AFTERNOON'
  ): { hasConflict: boolean; conflictingSlots: TimetableSlot[]; message?: string } {
    const conflictingSlots = slots.filter((slot) => {
      if (!ValidationEngine.isSlotAtSameTime(slot, day, period, session)) return false;

      // Bỏ qua tiết nghỉ
      if (slot.subjectId === 'SUB_OFF') return false;

      // Kiểm tra xem GV có tham gia slot này không (hỗ trợ cả teacherId đơn và co-teaching mảng teacherIds)
      const isTeacherInSlot =
        slot.teacherId === teacherId ||
        (slot.teacherIds && slot.teacherIds.includes(teacherId));

      if (!isTeacherInSlot) return false;

      // Nếu cùng 1 phân công (assignmentId) thì là tiết ghép hợp lệ, không tính là xung đột
      if (currentAssignmentId && slot.assignmentId && slot.assignmentId === currentAssignmentId) {
        return false;
      }

      // Nếu slot này được đánh dấu là tiết ghép (isMerged) và có chứa classId hiện tại
      if (slot.isMerged && currentClassId && slot.classIds && slot.classIds.includes(currentClassId)) {
        return false;
      }

      // Nếu cả 2 đều là slot của cùng một lớp (ví dụ co-teaching 2 GV hoặc cùng 1 tiết)
      if (currentClassId && slot.classId === currentClassId) {
        return false;
      }

      return true;
    });

    return {
      hasConflict: conflictingSlots.length > 0,
      conflictingSlots,
      message:
        conflictingSlots.length > 0
          ? `Giáo viên [${teacherId}] bị trùng lịch tại Thứ ${day}, Tiết ${period} (${conflictingSlots.length} phân công khác nhau)`
          : undefined,
    };
  }

  /**
   * 2. Kiểm tra TRÙNG TIẾT LỚP HỌC
   * Quy tắc nghiệp vụ: Một lớp học không thể học 2 môn khác nhau trong cùng 1 tiết.
   */
  public static checkClassConflict(
    classId: string,
    day: DayOfWeek,
    period: PeriodOfDay,
    slots: TimetableSlot[],
    currentAssignmentId?: string,
    session?: 'MORNING' | 'AFTERNOON'
  ): { hasConflict: boolean; conflictingSlots: TimetableSlot[]; message?: string } {
    const conflictingSlots = slots.filter((slot) => {
      if (!ValidationEngine.isSlotAtSameTime(slot, day, period, session)) return false;

      const isClassInSlot =
        slot.classId === classId ||
        (slot.classIds && slot.classIds.includes(classId));

      if (!isClassInSlot) return false;

      // Nếu cùng 1 assignmentId thì là cùng 1 tiết học
      if (currentAssignmentId && slot.assignmentId === currentAssignmentId) {
        return false;
      }

      return true;
    });

    return {
      hasConflict: conflictingSlots.length > 0,
      conflictingSlots,
      message:
        conflictingSlots.length > 0
          ? `Lớp [${classId}] bị trùng tiết tại Thứ ${day}, Tiết ${period}`
          : undefined,
    };
  }

  /**
   * 3. Kiểm tra XUNG ĐỘT PHÒNG HỌC & QUÁ TẢI SỨC CHỨA
   * - Phòng học thường không thể xếp 2 tiết độc lập cùng lúc.
   * - Phòng chuyên dụng / Sân tập: Tổng sĩ số các lớp gộp không được vượt quá capacity.
   */
  public static checkRoomConflict(
    roomId: string,
    day: DayOfWeek,
    period: PeriodOfDay,
    slots: TimetableSlot[],
    classesMap: Map<string, SchoolClass>,
    roomInfo?: Room,
    currentAssignmentId?: string,
    session?: 'MORNING' | 'AFTERNOON'
  ): { hasConflict: boolean; conflictingSlots: TimetableSlot[]; totalStudents: number; message?: string } {
    const roomSlots = slots.filter(
      (slot) => ValidationEngine.isSlotAtSameTime(slot, day, period, session) && slot.roomId === roomId
    );

    // Tính các lớp duy nhất đang dùng phòng này trong slot
    const uniqueClassIds = new Set<string>();
    const uniqueAssignmentIds = new Set<string>();

    roomSlots.forEach((slot) => {
      uniqueClassIds.add(slot.classId);
      if (slot.classIds) slot.classIds.forEach((c) => uniqueClassIds.add(c));
      uniqueAssignmentIds.add(slot.assignmentId);
    });

    let totalStudents = 0;
    uniqueClassIds.forEach((cId) => {
      const cls = classesMap.get(cId);
      if (cls) totalStudents += cls.studentCount;
    });

    // Trường hợp 1: Phòng học lý thuyết thường nhưng có nhiều hơn 1 phân công độc lập
    if (roomInfo && roomInfo.roomType === 'THEORY' && uniqueAssignmentIds.size > 1) {
      return {
        hasConflict: true,
        conflictingSlots: roomSlots,
        totalStudents,
        message: `Phòng lý thuyết [${roomInfo.name}] bị xếp cho nhiều lớp khác nhau không ghép chung!`,
      };
    }

    // Trường hợp 2: Vượt quá sức chứa tối đa của phòng / sân
    if (roomInfo && totalStudents > roomInfo.capacity) {
      return {
        hasConflict: true,
        conflictingSlots: roomSlots,
        totalStudents,
        message: `Phòng [${roomInfo.name}] quá tải sức chứa: ${totalStudents}/${roomInfo.capacity} học sinh`,
      };
    }

    // Trường hợp 3: Trùng phòng với phân công khác
    if (currentAssignmentId) {
      const otherAssignmentSlots = roomSlots.filter(
        (s) => s.assignmentId !== currentAssignmentId
      );
      if (otherAssignmentSlots.length > 0 && roomInfo && roomInfo.roomType === 'THEORY') {
        return {
          hasConflict: true,
          conflictingSlots: otherAssignmentSlots,
          totalStudents,
          message: `Phòng [${roomInfo.name}] đã có lớp khác học tại Thứ ${day}, Tiết ${period}`,
        };
      }
    }

    return { hasConflict: false, conflictingSlots: [], totalStudents };
  }

  /**
   * 4. Kiểm tra LỊCH BẬN CỦA GIÁO VIÊN (Teacher Unavailable Slots)
   * Phân biệt rõ ràng Lịch bận Buổi Sáng và Buổi Chiều
   */
  public static checkTeacherAvailability(
    teacher: Teacher,
    day: DayOfWeek,
    period: PeriodOfDay,
    session: 'MORNING' | 'AFTERNOON' = 'MORNING'
  ): boolean {
    if (!teacher.unavailableSlots || teacher.unavailableSlots.length === 0) return true;
    const isBusy = teacher.unavailableSlots.some((slot) => {
      if (slot.day !== day) return false;
      const uPeriod = slot.period <= 5 ? slot.period : ((slot.period - 1) % 5) + 1;
      const targetPeriod = period <= 5 ? period : ((period - 1) % 5) + 1;
      if (uPeriod !== targetPeriod) return false;

      // Xử lý ca học: nếu slot.session chưa định nghĩa (dữ liệu cũ), tự động suy ra từ period (>5 là Chiều) hoặc mặc định MORNING
      const slotSession = slot.session || (slot.period > 5 ? 'AFTERNOON' : 'MORNING');
      return slotSession === session;
    });
    return !isBusy; // true nếu rảnh, false nếu bận
  }

  /**
   * 5. Kiểm tra THỪA / THIẾU TIẾT (Volume Discrepancy)
   * So sánh số tiết thực tế đã xếp trên TKB với Bảng Phân công Giảng dạy (PCGD)
   */
  public static checkVolumeDiscrepancy(
    assignments: TeachingAssignment[],
    currentTimetable: TimetableSlot[],
    subjectsMap: Map<string, string>,
    classesMap: Map<string, string>,
    teachersMap: Map<string, string>
  ): VolumeDiscrepancy[] {
    const discrepancies: VolumeDiscrepancy[] = [];

    // Nhóm các slot đã xếp theo assignmentId.
    // LƯU Ý CHO TIẾT GHÉP: Nếu 1 tiết ghép có 2 lớp, trong timetable có thể có 2 bản ghi
    // (hoặc 1 slot đại diện). Ta đếm theo số lượng distinct (day, period) cho mỗi assignment!
    const assignmentSlotCounts = new Map<string, number>();

    // Chỉ đối chiếu các môn được phân công trong PCGD (bỏ qua Chào cờ & Sinh hoạt lớp)
    const pureAssignments = assignments.filter((asg) => {
      const subName = subjectsMap.get(asg.subjectId) || '';
      return !isSpecialDutySubject(asg.subjectId, { id: asg.subjectId, name: subName } as Subject, asg.id);
    });

    pureAssignments.forEach((asg) => {
      const assignedSlotsForAsg = currentTimetable.filter((s) => s.assignmentId === asg.id);
      // Tạo tập hợp key duy nhất "day-period" để tránh đếm đúp khi có nhiều lớp/nhiều GV
      const uniqueTimePoints = new Set(
        assignedSlotsForAsg.map((s) => `${s.day}_${s.period}`)
      );
      assignmentSlotCounts.set(asg.id, uniqueTimePoints.size);
    });

    for (const asg of pureAssignments) {
      const actual = assignmentSlotCounts.get(asg.id) || 0;
      const expected = asg.periodsPerWeek;
      const diff = actual - expected;

      let status: 'EXACT' | 'DEFICIT' | 'SURPLUS' = 'EXACT';
      if (diff < 0) status = 'DEFICIT'; // Thiếu tiết
      else if (diff > 0) status = 'SURPLUS'; // Thừa tiết

      discrepancies.push({
        assignmentId: asg.id,
        subjectName: subjectsMap.get(asg.subjectId) || asg.subjectId,
        classNames: asg.classIds.map((cid) => classesMap.get(cid) || cid),
        teacherNames: asg.teacherIds.map((tid) => teachersMap.get(tid) || tid),
        expectedPeriods: expected,
        actualPeriods: actual,
        status,
        difference: diff,
      });
    }

    return discrepancies;
  }

  /**
   * 6. Quét toàn diện tất cả các xung đột trong bảng thời khóa biểu
   */
  public static scanAllConflicts(
    slots: TimetableSlot[],
    teachers: Teacher[],
    rooms: Room[],
    classes: SchoolClass[],
    subjects?: Subject[]
  ): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const classesMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));
    const roomsMap = new Map<string, Room>(rooms.map((r) => [r.id, r]));
    const teachersMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
    const subjectsMap = subjects ? new Map<string, Subject>(subjects.map((s) => [s.id, s])) : new Map<string, Subject>();

    // Nhóm slot theo (day, period, session)
    const timeGroupedSlots = new Map<string, TimetableSlot[]>();
    for (const slot of slots) {
      const sess = slot.session || (slot.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const pNorm = slot.session ? slot.period : (slot.period <= 5 ? slot.period : slot.period - 5);
      const key = `${slot.day}_${pNorm}_${sess}`;
      if (!timeGroupedSlots.has(key)) {
        timeGroupedSlots.set(key, []);
      }
      timeGroupedSlots.get(key)!.push(slot);
    }

    // Duyệt qua từng khung giờ để bắt xung đột
    timeGroupedSlots.forEach((slotList, timeKey) => {
      const [dayStr, periodStr] = timeKey.split('_');
      const day = Number(dayStr) as DayOfWeek;
      const period = Number(periodStr) as PeriodOfDay;

      // Lọc bỏ các tiết SUB_OFF
      const activeSlotList = slotList.filter((s) => s.subjectId !== 'SUB_OFF');

      // a) Trùng tiết Lớp (1 lớp không thể học 2 môn khác nhau cùng lúc)
      const classUsage = new Map<string, string[]>(); // classId -> subjectIds/assignmentIds
      
      // b) Trùng tiết Giáo viên (1 GV không thể dạy 2 nơi khác nhau NGOẠI TRỪ tiết ghép)
      const teacherSlots = new Map<string, TimetableSlot[]>(); // teacherId -> slots

      // c) Phòng học
      const roomUsage = new Map<string, TimetableSlot[]>(); // roomId -> slots

      activeSlotList.forEach((slot) => {
        // Ghi nhận lớp
        const cIds = slot.classIds && slot.classIds.length > 0 ? slot.classIds : [slot.classId];
        cIds.forEach((cId) => {
          if (!classUsage.has(cId)) classUsage.set(cId, []);
          classUsage.get(cId)!.push(slot.assignmentId || slot.subjectId);
        });

        // Ghi nhận GV
        const tIds = slot.teacherIds && slot.teacherIds.length > 0 ? slot.teacherIds : [slot.teacherId];
        tIds.forEach((tId) => {
          if (!tId) return;
          if (!teacherSlots.has(tId)) teacherSlots.set(tId, []);
          teacherSlots.get(tId)!.push(slot);
        });

        // Ghi nhận phòng
        if (slot.roomId) {
          if (!roomUsage.has(slot.roomId)) roomUsage.set(slot.roomId, []);
          roomUsage.get(slot.roomId)!.push(slot);
        }
      });

      // Kiểm tra trùng lớp (1 lớp bị gán cho >= 2 assignment khác nhau cùng giờ)
      classUsage.forEach((assignmentIds, classId) => {
        const uniqueAssignments = new Set(assignmentIds);
        if (uniqueAssignments.size > 1) {
          const cls = classesMap.get(classId);
          conflicts.push({
            type: 'CLASS_DOUBLE_BOOKING',
            day,
            period,
            severity: 'CRITICAL',
            message: `Lớp ${cls ? cls.name : classId} bị xếp trùng ${uniqueAssignments.size} môn khác nhau`,
            entities: { classIds: [classId] },
          });
        }
      });

      // Kiểm tra trùng GV
      teacherSlots.forEach((tSlots, teacherId) => {
        // Gom các slot lại: Nếu các slot thuộc cùng 1 tiết ghép (chung assignmentId HOẶC isMerged và cùng môn học) -> Hợp lệ!
        const distinctSessions: TimetableSlot[][] = [];
        tSlots.forEach((slot) => {
          const matchExisting = distinctSessions.find((sess) => {
            const first = sess[0];
            // Cùng assignmentId
            if (slot.assignmentId && first.assignmentId && slot.assignmentId === first.assignmentId) return true;
            // Hoặc cả 2 đều là tiết ghép và chung môn
            if (slot.isMerged && first.isMerged && slot.subjectId === first.subjectId) return true;
            // Hoặc là cùng 1 lớp (ví dụ co-teaching)
            if (slot.classId === first.classId) return true;
            return false;
          });

          if (matchExisting) {
            matchExisting.push(slot);
          } else {
            distinctSessions.push([slot]);
          }
        });

        if (distinctSessions.length > 1) {
          const teacher = teachersMap.get(teacherId);
          conflicts.push({
            type: 'TEACHER_DOUBLE_BOOKING',
            day,
            period,
            severity: 'CRITICAL',
            message: `Giáo viên ${teacher ? teacher.name : teacherId} bị xếp trùng tiết cho ${distinctSessions.length} ca dạy khác nhau`,
            entities: { teacherIds: [teacherId] },
          });
        }
      });

      // Kiểm tra phòng học
      roomUsage.forEach((rSlots, roomId) => {
        const room = roomsMap.get(roomId);
        if (!room) return;
        const uniqueAsgs = new Set(rSlots.map((s) => s.assignmentId));
        if (room.roomType === 'THEORY' && uniqueAsgs.size > 1) {
          conflicts.push({
            type: 'ROOM_OVERFLOW',
            day,
            period,
            severity: 'CRITICAL',
            message: `Phòng ${room.name} bị xếp trùng cho ${uniqueAsgs.size} lớp học lý thuyết`,
            entities: { roomId },
          });
        }
      });
    });

    // d) Kiểm tra vi phạm lịch bận giáo viên
    for (const slot of slots) {
      const tIds = slot.teacherIds && slot.teacherIds.length > 0 ? slot.teacherIds : [slot.teacherId];
      for (const tId of tIds) {
        const teacher = teachersMap.get(tId);
        if (teacher && !ValidationEngine.checkTeacherAvailability(teacher, slot.day, slot.period, slot.session || (slot.period <= 5 ? 'MORNING' : 'AFTERNOON'))) {
          conflicts.push({
            type: 'TEACHER_UNAVAILABLE',
            day: slot.day,
            period: slot.period,
            severity: 'CRITICAL',
            message: `Giáo viên ${teacher.name} đã đăng ký bận tại ${slot.session === 'AFTERNOON' ? 'Chiều' : 'Sáng'} Thứ ${slot.day}, Tiết ${slot.period} nhưng vẫn bị xếp lịch`,
            entities: { teacherIds: [tId] },
          });
        }
      }
    }

    // e) Kiểm tra vi phạm cấu hình Buổi Sáng / Chiều của Môn học (preferredShift)
    if (subjects && subjects.length > 0) {
      for (const slot of slots) {
        if (slot.subjectId === 'SUB_OFF' || slot.subjectId === 'SUB_CC') continue;
        const sub = subjectsMap.get(slot.subjectId);
        if (sub?.preferredShift && sub.preferredShift !== 'ANY') {
          const slotSession = slot.session || (slot.period <= 5 ? 'MORNING' : 'AFTERNOON');
          if (sub.preferredShift !== slotSession) {
            const sessName = sub.preferredShift === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';
            const wrongSessName = slotSession === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';
            const cls = classesMap.get(slot.classId);
            conflicts.push({
              type: 'SHIFT_VIOLATION',
              day: slot.day,
              period: slot.period,
              severity: 'CRITICAL',
              message: `Môn "${sub.name}" (Lớp ${cls ? cls.name : slot.classId}) được cấu hình chỉ học ${sessName} nhưng bị xếp vào ${wrongSessName} Thứ ${slot.day} Tiết ${slot.period}`,
              entities: { classIds: [slot.classId], subjectId: slot.subjectId },
            });
          }
        }
      }
    }

    return conflicts;
  }
}
