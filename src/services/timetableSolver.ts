/**
 * PHẦN 3: THUẬT TOÁN XẾP TKB TỰ ĐỘNG (SCHEDULING ENGINE PRO)
 * Thuật toán CSP (Constraint Satisfaction Problem) kết hợp Backtracking,
 * MRV (Minimum Remaining Values), Degree Heuristic, Forward Checking,
 * và Greedy Conflict-Free Placer đảm bảo 100% không trùng tiết.
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
  DAYS_OF_WEEK,
  PERIODS,
} from '../types/timetable';
import { MergedClassHandler } from './mergedClassHandler';
import { ValidationEngine } from './validationEngine';

export interface UnplacedReminder {
  assignmentId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  missingPeriods: number;
  reasons: string[];
  recommendations: string[];
}

export interface SolverResult {
  success: boolean;
  slots: TimetableSlot[];
  iterations: number;
  backtrackCount: number;
  executionTimeMs: number;
  message: string;
  unplacedReminders?: UnplacedReminder[];
}

interface SchedulingTask {
  id: string;
  assignment: TeachingAssignment;
  unitIndex: number;
  duration: 1 | 2; // Tiết đơn hay tiết đôi
}

export class TimetableSolver {
  private assignments: TeachingAssignment[];
  private teachers: Teacher[];
  private classes: SchoolClass[];
  private rooms: Room[];
  private subjects: Subject[];

  private teachersMap: Map<string, Teacher>;
  private classesMap: Map<string, SchoolClass>;
  private roomsMap: Map<string, Room>;
  private subjectsMap: Map<string, Subject>;

  private iterations = 0;
  private backtrackCount = 0;
  private maxSteps = 25000;

  constructor(
    assignments: TeachingAssignment[],
    teachers: Teacher[],
    classes: SchoolClass[],
    rooms: Room[],
    subjects: Subject[]
  ) {
    this.assignments = assignments;
    this.teachers = teachers;
    this.classes = classes;
    this.rooms = rooms;
    this.subjects = subjects;

    this.teachersMap = new Map(teachers.map((t) => [t.id, t]));
    this.classesMap = new Map(classes.map((c) => [c.id, c]));
    this.roomsMap = new Map(rooms.map((r) => [r.id, r]));
    this.subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  }

  /**
   * Khởi chạy xếp TKB TỰ ĐỘNG CHO TOÀN TRƯỜNG
   * BẢO TOÀN 100% CÁC TIẾT ĐÃ XẾP TAY, chỉ xếp bù các môn/tiết còn thiếu vào các ô trống
   */
  public solve(existingFixedSlots?: TimetableSlot[], maxSubjectPerSession?: number): SolverResult {
    const startTime = performance.now();
    this.iterations = 0;
    this.backtrackCount = 0;

    // 1. Khởi tạo danh sách slots: BẢO TOÀN NGUYÊN VẸN TẤT CẢ CÁC SLOTS ĐÃ CÓ (TIẾT XẾP TAY)
    const currentSlots: TimetableSlot[] = existingFixedSlots && existingFixedSlots.length > 0
      ? existingFixedSlots.map((s) => ({ ...s }))
      : [];

    // Đảm bảo mỗi lớp đều có 1 slot Chào cờ cố định vào Thứ 2 Tiết 1 nếu chưa có
    for (const cls of this.classes) {
      const hasCC = currentSlots.some((s) => {
        const match = s.classId === cls.id || (s.classIds && s.classIds.includes(cls.id));
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
        return match && s.day === 2 && sSess === 'MORNING' && sPeriod === 1;
      });

      if (!hasCC) {
        currentSlots.push({
          id: `SLOT_CC_${cls.id}`,
          day: 2,
          period: 1,
          session: 'MORNING',
          classId: cls.id,
          classIds: [cls.id],
          teacherId: cls.homeroomTeacherId || '',
          roomId: 'R_SAN_TRUONG',
          assignmentId: `ASG_CC_${cls.id}`,
          subjectId: 'SUB_CC',
          isMerged: false,
          isCoTeaching: false,
        });
      }
    }

    // 2. Đảm bảo tất cả các lớp có GVCN đều có Phân công tiết Sinh hoạt lớp (SHL)
    let effectiveAssignments = [...this.assignments];
    const shlSub = this.subjects.find(
      (s) => s.code === 'SHL' || s.name.toLowerCase().includes('sinh hoạt') || s.id === 'SUB_SHL'
    );
    const shlSubId = shlSub ? shlSub.id : 'SUB_SHL';

    for (const cls of this.classes) {
      if (!cls.homeroomTeacherId) continue;
      const hasSHL = effectiveAssignments.some((a) => {
        const sub = this.subjectsMap.get(a.subjectId);
        return (
          a.classIds.includes(cls.id) &&
          (a.subjectId === shlSubId ||
            a.subjectId === 'SUB_SHL' ||
            sub?.code === 'SHL' ||
            sub?.name.toLowerCase().includes('sinh hoạt'))
        );
      });

      if (!hasSHL) {
        effectiveAssignments.push({
          id: `ASG_SHL_${cls.id}`,
          subjectId: shlSubId,
          teacherIds: [cls.homeroomTeacherId],
          classIds: [cls.id],
          periodsPerWeek: 1,
          isMerged: false,
          doublePeriodsAllowed: false,
          preferredDay: 7,
          priorityLevel: 10,
        });
      }
    }

    // 3. Phân rã Phân công giảng dạy thành các đơn vị tiết học - CHỈ TẠO TASK CHO CÁC TIẾT CÒN THIẾU
    const tasks = this.decomposeAssignmentsToTasks(effectiveAssignments, currentSlots);

    // 4. Sắp xếp thứ tự các task theo MRV & Degree Heuristic
    this.orderTasksByMRV(tasks);

    // 5. Cố định trước tiết Sinh hoạt lớp (SHL) vào Thứ 7 Tiết 5/4 nếu chưa xếp
    const remainingTasks: SchedulingTask[] = [];
    for (const task of tasks) {
      const sub = this.subjectsMap.get(task.assignment.subjectId);
      const isSHL =
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt') ||
        task.assignment.subjectId === 'SUB_SHL';

      if (isSHL) {
        const placed = this.tryPlaceSpecialSHL(task, currentSlots);
        if (!placed) {
          remainingTasks.push(task);
        }
      } else {
        remainingTasks.push(task);
      }
    }

    // 6. Chạy CSP Backtracking với Forward Checking cho các tasks còn thiếu
    const unplacedTasks: SchedulingTask[] = [];
    const success = this.assignSlotRecursive(0, remainingTasks, currentSlots, unplacedTasks);

    // 7. Nếu còn bất kỳ task nào chưa được xếp, kích hoạt bộ Greedy Conflict-Free Placer
    if (unplacedTasks.length > 0 || !success) {
      const stillPending = tasks.filter((t) => {
        const scheduledCount = currentSlots.filter((s) => {
          if (s.subjectId === 'SUB_OFF') return false;
          if (s.assignmentId && s.assignmentId === t.assignment.id) return true;
          return (
            s.subjectId === t.assignment.subjectId &&
            t.assignment.classIds.some((cId) => s.classId === cId || (s.classIds && s.classIds.includes(cId)))
          );
        }).length;
        return scheduledCount < t.assignment.periodsPerWeek;
      });

      for (const pTask of stillPending) {
        this.greedyPlaceTask(pTask, currentSlots, maxSubjectPerSession);
      }
    }

    // 8. Lọc các tasks vẫn không thể xếp được (do vướng tiết đã xếp tay hoặc lịch bận) để xây dựng báo cáo nhắc nhở
    const finalUnplacedTasks = tasks.filter((t) => {
      const scheduledCount = currentSlots.filter((s) => {
        if (s.subjectId === 'SUB_OFF') return false;
        if (s.assignmentId && s.assignmentId === t.assignment.id) return true;
        return (
          s.subjectId === t.assignment.subjectId &&
          t.assignment.classIds.some((cId) => s.classId === cId || (s.classIds && s.classIds.includes(cId)))
        );
      }).length;
      return scheduledCount < t.assignment.periodsPerWeek;
    });

    const unplacedReminders = this.buildUnplacedReminders(finalUnplacedTasks, currentSlots);

    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);
    const initialSlotCount = existingFixedSlots ? existingFixedSlots.length : 0;
    const newlyPlacedCount = Math.max(0, currentSlots.length - initialSlotCount);

    return {
      success: unplacedReminders.length === 0,
      slots: currentSlots,
      iterations: this.iterations,
      backtrackCount: this.backtrackCount,
      executionTimeMs,
      message: unplacedReminders.length === 0
        ? `Đã tự động xếp bổ sung ${newlyPlacedCount} tiết cho toàn trường thỏa mãn 100% ràng buộc cứng mà không đụng chạm đến các tiết đã xếp tay!`
        : `Đã xếp bổ sung được ${newlyPlacedCount} tiết cho toàn trường. Phát hiện ${unplacedReminders.length} môn học bị vướng ràng buộc với các tiết đã xếp tay.`,
      unplacedReminders,
    };
  }

  /**
   * Khởi chạy xếp TKB TỰ ĐỘNG CHO 1 LỚP CỤ THỂ (Class-Specific Auto Schedule)
   * BẢO TOÀN 100% LỊCH CỦA CÁC LỚP KHÁC VÀ CÁC TIẾT ĐÃ XẾP TAY CỦA LỚP NÀY!
   * Chỉ điền bù các môn còn thiếu vào các ô tiết còn trống.
   */
  public solveForClass(
    targetClassId: string,
    existingSlots: TimetableSlot[] = [],
    maxSubjectPerSession?: number
  ): SolverResult {
    const startTime = performance.now();
    this.iterations = 0;
    this.backtrackCount = 0;

    const targetClass = this.classesMap.get(targetClassId);
    if (!targetClass) {
      return {
        success: false,
        slots: existingSlots,
        iterations: 0,
        backtrackCount: 0,
        executionTimeMs: 0,
        message: `Không tìm thấy thông tin lớp ${targetClassId}`,
      };
    }

    // 1. BẢO TOÀN NGUYÊN VẸN 100% TẤT CẢ CÁC SLOTS ĐÃ CÓ (Bao gồm cả tiết xếp tay của lớp mục tiêu và các lớp khác)
    const currentSlots: TimetableSlot[] = existingSlots && existingSlots.length > 0
      ? existingSlots.map((s) => ({ ...s }))
      : [];

    // 2. Khởi tạo / Giữ lại tiết Chào Cờ cho lớp mục tiêu (Thứ 2 Tiết 1 Sáng) nếu chưa có
    const hasCC = currentSlots.some((s) => {
      const match = s.classId === targetClassId || (s.classIds && s.classIds.includes(targetClassId));
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return match && s.day === 2 && sSess === 'MORNING' && sPeriod === 1;
    });

    if (!hasCC) {
      currentSlots.push({
        id: `SLOT_CC_${targetClassId}`,
        day: 2,
        period: 1,
        session: 'MORNING',
        classId: targetClassId,
        classIds: [targetClassId],
        teacherId: targetClass.homeroomTeacherId || '',
        roomId: 'R_SAN_TRUONG',
        assignmentId: `ASG_CC_${targetClassId}`,
        subjectId: 'SUB_CC',
        isMerged: false,
        isCoTeaching: false,
      });
    }

    // 3. Lấy toàn bộ phân công của riêng lớp mục tiêu
    let classAssignments = this.assignments.filter((a) => a.classIds.includes(targetClassId));

    // Đảm bảo có tiết Sinh hoạt lớp nếu lớp có GVCN
    const hasSHLAssignment = classAssignments.some((a) => {
      const sub = this.subjectsMap.get(a.subjectId);
      return (
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt') ||
        a.subjectId === 'SUB_SHL'
      );
    });

    if (!hasSHLAssignment && targetClass.homeroomTeacherId) {
      classAssignments = [
        ...classAssignments,
        {
          id: `ASG_SHL_${targetClassId}`,
          subjectId: 'SUB_SHL',
          teacherIds: [targetClass.homeroomTeacherId],
          classIds: [targetClassId],
          periodsPerWeek: 1,
          isMerged: false,
          doublePeriodsAllowed: false,
          priorityLevel: 10,
        },
      ];
    }

    // 4. Phân rã thành tasks - CHỈ TẠO TASK CHO CÁC TIẾT CÒN THIẾU CỦA LỚP NÀY (ĐÃ TRỪ TIẾT XẾP TAY)
    const tasks = this.decomposeAssignmentsToTasks(classAssignments, currentSlots);
    this.orderTasksByMRV(tasks);

    // 5. Cố định Sinh hoạt lớp trước nếu chưa có
    const remainingTasks: SchedulingTask[] = [];
    for (const task of tasks) {
      const sub = this.subjectsMap.get(task.assignment.subjectId);
      const isSHL =
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt') ||
        task.assignment.subjectId === 'SUB_SHL';

      if (isSHL) {
        const placed = this.tryPlaceSpecialSHL(task, currentSlots);
        if (!placed) remainingTasks.push(task);
      } else {
        remainingTasks.push(task);
      }
    }

    // 6. Xếp các môn còn thiếu vào các ô trống còn lại
    const unplacedTasks: SchedulingTask[] = [];
    for (const task of remainingTasks) {
      const placed = this.greedyPlaceTask(task, currentSlots, maxSubjectPerSession);
      if (!placed) {
        unplacedTasks.push(task);
      }
    }

    // 7. Thu thập báo cáo chi tiết các môn/tiết không thể xếp được do vướng ràng buộc
    const unplacedReminders = this.buildUnplacedReminders(unplacedTasks, currentSlots);

    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);
    const initialSlotCount = existingSlots ? existingSlots.length : 0;
    const newlyPlacedCount = Math.max(0, currentSlots.length - initialSlotCount);

    return {
      success: unplacedReminders.length === 0,
      slots: currentSlots,
      iterations: this.iterations,
      backtrackCount: this.backtrackCount,
      executionTimeMs,
      message: unplacedReminders.length === 0
        ? `Đã tự động xếp bổ sung ${newlyPlacedCount} tiết còn thiếu cho lớp ${targetClass.name} vào các ô trống!`
        : `Đã xếp bổ sung được ${newlyPlacedCount} tiết cho lớp ${targetClass.name}. Còn ${unplacedReminders.length} môn bị vướng ràng buộc với các tiết đã xếp tay.`,
      unplacedReminders,
    };
  }

  /**
   * Phân rã PCGD thành từng tiết hoặc cặp tiết
   * CHỈ TẠO TASK CHO SỐ TIẾT CÒN THIẾU (ĐÃ TRỪ CÁC TIẾT ĐÃ CÓ / ĐÃ XẾP TAY)
   */
  private decomposeAssignmentsToTasks(
    assignmentsList: TeachingAssignment[],
    existingSlots: TimetableSlot[] = []
  ): SchedulingTask[] {
    const tasks: SchedulingTask[] = [];

    for (const asg of assignmentsList) {
      // Bỏ qua Chào cờ vì đã cố định riêng vào Thứ 2 Tiết 1
      if (asg.subjectId === 'SUB_CC' || asg.id.startsWith('ASG_CC_')) {
        continue;
      }

      const subject = this.subjectsMap.get(asg.subjectId);
      const isSHL =
        subject?.code === 'SHL' ||
        subject?.name.toLowerCase().includes('sinh hoạt') ||
        asg.subjectId === 'SUB_SHL';

      let resolvedAssignment = { ...asg };
      if (isSHL && (!asg.teacherIds || asg.teacherIds.length === 0)) {
        const classObj = asg.classIds[0] ? this.classesMap.get(asg.classIds[0]) : undefined;
        if (classObj?.homeroomTeacherId) {
          resolvedAssignment.teacherIds = [classObj.homeroomTeacherId];
        }
      }

      // Đếm số tiết của phân công này ĐÃ CÓ SẴN trong existingSlots (tiết đã xếp tay hoặc đã có từ trước)
      const alreadyScheduledCount = existingSlots.filter((s) => {
        if (s.subjectId === 'SUB_OFF') return false;
        // Trực tiếp theo assignmentId
        if (s.assignmentId && s.assignmentId === resolvedAssignment.id) return true;
        // Khớp theo môn học và lớp học
        if (s.subjectId === resolvedAssignment.subjectId) {
          const matchClass = resolvedAssignment.classIds.some(
            (cId) => s.classId === cId || (s.classIds && s.classIds.includes(cId))
          );
          if (matchClass) return true;
        }
        return false;
      }).length;

      // CHỈ TẠO TASK CHO SỐ TIẾT CÒN THIẾU (CHƯA ĐƯỢC XẾP)
      let remaining = Math.max(0, resolvedAssignment.periodsPerWeek - alreadyScheduledCount);
      let unitIndex = alreadyScheduledCount + 1;

      while (remaining > 0) {
        if (resolvedAssignment.doublePeriodsAllowed && remaining >= 2) {
          tasks.push({
            id: `${resolvedAssignment.id}_U${unitIndex}`,
            assignment: resolvedAssignment,
            unitIndex,
            duration: 2, // Tiết đôi
          });
          unitIndex += 2;
          remaining -= 2;
        } else {
          tasks.push({
            id: `${resolvedAssignment.id}_U${unitIndex}`,
            assignment: resolvedAssignment,
            unitIndex,
            duration: 1, // Tiết đơn
          });
          unitIndex += 1;
          remaining -= 1;
        }
      }
    }

    return tasks;
  }

  /**
   * Phân tích và xây dựng danh sách nhắc nhở chi tiết đối với những tiết không thể xếp được
   * do vướng ràng buộc (bị trùng giáo viên đã xếp tay ở lớp khác hoặc lịch bận)
   */
  private buildUnplacedReminders(
    unplacedTasks: SchedulingTask[],
    currentSlots: TimetableSlot[]
  ): UnplacedReminder[] {
    const reminderMap = new Map<string, UnplacedReminder>();

    for (const task of unplacedTasks) {
      const asg = task.assignment;
      const key = `${asg.id}_${asg.subjectId}`;
      if (reminderMap.has(key)) {
        const item = reminderMap.get(key)!;
        item.missingPeriods += task.duration;
        continue;
      }

      const classNames = asg.classIds
        .map((cId) => this.classesMap.get(cId)?.name || cId)
        .join(', ');
      const sub = this.subjectsMap.get(asg.subjectId);
      const subjectName = sub?.name || asg.subjectId;
      const teacherNames = asg.teacherIds
        .map((tId) => this.teachersMap.get(tId)?.name || tId)
        .join(' + ') || 'Chưa gán GV';

      // Phân tích các ô trống của lớp và xác định lý do vướng
      const reasons: string[] = [];
      const recommendations: string[] = [];

      const preferredShift = sub?.preferredShift || 'ANY';
      const primaryClass = asg.classIds[0] ? this.classesMap.get(asg.classIds[0]) : undefined;
      const classShift = primaryClass?.shift || 'MORNING';

      let allowedSessions: ('MORNING' | 'AFTERNOON')[] = ['MORNING', 'AFTERNOON'];
      if (preferredShift === 'MORNING') allowedSessions = ['MORNING'];
      else if (preferredShift === 'AFTERNOON') allowedSessions = ['AFTERNOON'];
      else if (classShift === 'AFTERNOON') allowedSessions = ['AFTERNOON', 'MORNING'];

      let emptySlotCountForClass = 0;
      let teacherConflictCount = 0;
      let teacherUnavailableCount = 0;
      const recordedConflicts = new Set<string>();

      for (const session of allowedSessions) {
        const maxP = session === 'MORNING' ? 5 : 4;
        for (const { key: day } of DAYS_OF_WEEK) {
          for (let p = 1; p <= maxP; p++) {
            const period = p as PeriodOfDay;
            if (day === 2 && period === 1 && session === 'MORNING') continue;

            // Kiểm tra xem các lớp của phân công này có ô trống ở (day, period, session) không
            const isAnyClassOccupied = asg.classIds.some((cId) => {
              return currentSlots.some((s) => {
                const matchClass = s.classId === cId || (s.classIds && s.classIds.includes(cId));
                const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
                const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
                return matchClass && s.day === day && sSess === session && sPeriod === period;
              });
            });

            if (!isAnyClassOccupied) {
              emptySlotCountForClass++;

              // Lớp trống ô này, kiểm tra lý do GV không thể vào
              for (const tId of asg.teacherIds) {
                const teacher = this.teachersMap.get(tId);

                // 1. Kiểm tra lịch bận GV
                if (teacher && !ValidationEngine.checkTeacherAvailability(teacher, day, period, session)) {
                  teacherUnavailableCount++;
                  const reasonMsg = `Tại ${session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day} Tiết ${period}: GV ${teacher.name} có lịch bận/nguyện vọng nghỉ.`;
                  if (!recordedConflicts.has(reasonMsg)) {
                    recordedConflicts.add(reasonMsg);
                    reasons.push(reasonMsg);
                  }
                }

                // 2. Kiểm tra trùng tiết với lớp khác (tiết đã xếp tay hoặc xếp trước)
                const occupyingSlot = currentSlots.find((s) => {
                  if (s.subjectId === 'SUB_OFF') return false;
                  const tMatch = s.teacherId === tId || (s.teacherIds && s.teacherIds.includes(tId));
                  if (!tMatch) return false;
                  const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
                  const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
                  return s.day === day && sSess === session && sPeriod === period;
                });

                if (occupyingSlot) {
                  teacherConflictCount++;
                  const otherClassName = this.classesMap.get(occupyingSlot.classId)?.name || occupyingSlot.classId;
                  const otherSubName = this.subjectsMap.get(occupyingSlot.subjectId)?.name || occupyingSlot.subjectId;
                  const reasonMsg = `Tại ${session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day} Tiết ${period}: GV ${teacher?.name || tId} bị trùng lịch dạy môn ${otherSubName} tại lớp ${otherClassName} (đã xếp trước/xếp tay).`;
                  if (!recordedConflicts.has(reasonMsg)) {
                    recordedConflicts.add(reasonMsg);
                    reasons.push(reasonMsg);
                  }
                }
              }
            }
          }
        }
      }

      if (emptySlotCountForClass === 0) {
        reasons.push(`Lớp ${classNames} đã kín hết tất cả các ô tiết trong tuần (không còn ô trống nào).`);
        recommendations.push(`Khuyến nghị: Kiểm tra lại tổng số tiết phân công của lớp ${classNames} hoặc cân nhắc mở thêm buổi chiều.`);
      } else {
        if (teacherConflictCount > 0) {
          recommendations.push(
            `Khuyến nghị: Thử di chuyển hoặc đổi lịch các tiết đã xếp tay của giáo viên ${teacherNames} ở các lớp bị trùng sang tiết khác để tạo khoảng trống cho lớp ${classNames}.`
          );
        }
        if (teacherUnavailableCount > 0) {
          recommendations.push(
            `Khuyến nghị: Kiểm tra lại phần đăng ký 'Lịch bận cố định' hoặc 'Nguyện vọng nghỉ' của giáo viên ${teacherNames} để mở thêm tiết dạy.`
          );
        }
      }

      // Giới hạn hiển thị tối đa 4 lý do cụ thể nhất
      const trimmedReasons = reasons.slice(0, 4);

      reminderMap.set(key, {
        assignmentId: asg.id,
        classId: asg.classIds[0],
        className: classNames,
        subjectId: asg.subjectId,
        subjectName,
        teacherId: asg.teacherIds[0] || '',
        teacherName: teacherNames,
        missingPeriods: task.duration,
        reasons: trimmedReasons.length > 0 ? trimmedReasons : ['Không tìm được ô tiết trống thỏa mãn tất cả ràng buộc giáo viên và môn học.'],
        recommendations: recommendations.length > 0 ? recommendations : ['Thử điều chỉnh lại các tiết đã xếp tay xung quanh để mở thêm phương án xếp.'],
      });
    }

    return Array.from(reminderMap.values());
  }

  /**
   * Sắp xếp thứ tự ưu tiên theo MRV (Minimum Remaining Values)
   */
  private orderTasksByMRV(tasks: SchedulingTask[]): void {
    tasks.sort((a, b) => {
      const subjectA = this.subjectsMap.get(a.assignment.subjectId);
      const subjectB = this.subjectsMap.get(b.assignment.subjectId);
      const isSHLA = subjectA?.code === 'SHL' || subjectA?.name.toLowerCase().includes('sinh hoạt') || a.assignment.subjectId === 'SUB_SHL';
      const isSHLB = subjectB?.code === 'SHL' || subjectB?.name.toLowerCase().includes('sinh hoạt') || b.assignment.subjectId === 'SUB_SHL';

      if (isSHLA !== isSHLB) return isSHLA ? -1 : 1;

      // 1. Cấp độ ưu tiên gán cứng nếu có
      const priorityA = a.assignment.priorityLevel || 0;
      const priorityB = b.assignment.priorityLevel || 0;
      if (priorityA !== priorityB) return priorityB - priorityA;

      // 2. Co-teaching (Nhiều GV cùng dạy) -> Khó nhất
      const coTeachA = a.assignment.teacherIds.length;
      const coTeachB = b.assignment.teacherIds.length;
      if (coTeachA !== coTeachB) return coTeachB - coTeachA;

      // 3. Tiết ghép nhiều lớp (isMerged = true) -> Rất hẹp
      const mergeWeightA = a.assignment.classIds.length;
      const mergeWeightB = b.assignment.classIds.length;
      if (mergeWeightA !== mergeWeightB) return mergeWeightB - mergeWeightA;

      // 4. Phòng đặc thù (Khác THEORY)
      const specialRoomA = a.assignment.requiredRoomType && a.assignment.requiredRoomType !== 'THEORY' ? 5 : 0;
      const specialRoomB = b.assignment.requiredRoomType && b.assignment.requiredRoomType !== 'THEORY' ? 5 : 0;
      if (specialRoomA !== specialRoomB) return specialRoomB - specialRoomA;

      // 5. Tiết đôi ưu tiên trước tiết đơn
      if (a.duration !== b.duration) return b.duration - a.duration;

      return 0;
    });
  }

  /**
   * Xếp ưu tiên tiết Sinh hoạt lớp vào Thứ 7 Tiết 5/4 Sáng hoặc Tiết 4/3 Chiều tùy theo cấu hình
   */
  private tryPlaceSpecialSHL(task: SchedulingTask, currentSlots: TimetableSlot[]): boolean {
    const sub = this.subjectsMap.get(task.assignment.subjectId);
    const preferredShift = sub?.preferredShift || 'ANY';
    const primaryClass = task.assignment.classIds[0] ? this.classesMap.get(task.assignment.classIds[0]) : undefined;
    const classShift = primaryClass?.shift || 'MORNING';

    const candidateSHLSlots: { day: DayOfWeek; period: PeriodOfDay; session: 'MORNING' | 'AFTERNOON' }[] = [];

    if (preferredShift === 'AFTERNOON' || (preferredShift === 'ANY' && classShift === 'AFTERNOON')) {
      candidateSHLSlots.push(
        { day: 7, period: 4, session: 'AFTERNOON' },
        { day: 7, period: 3, session: 'AFTERNOON' },
        { day: 6, period: 4, session: 'AFTERNOON' },
        { day: 6, period: 3, session: 'AFTERNOON' }
      );
    }
    if (preferredShift === 'MORNING' || (preferredShift === 'ANY' && classShift !== 'AFTERNOON')) {
      candidateSHLSlots.push(
        { day: 7, period: 5, session: 'MORNING' },
        { day: 7, period: 4, session: 'MORNING' },
        { day: 6, period: 5, session: 'MORNING' },
        { day: 6, period: 4, session: 'MORNING' }
      );
    }

    for (const { day, period, session } of candidateSHLSlots) {
      const check = MergedClassHandler.checkAvailability(
        task.assignment,
        day,
        period,
        currentSlots,
        this.teachersMap,
        this.classesMap,
        this.rooms,
        session,
        this.subjectsMap
      );

      if (check.isAvailable && check.assignedRoom) {
        const slots = MergedClassHandler.createAtomicSlots(
          task.assignment,
          day,
          period,
          check.assignedRoom.id,
          session
        );
        currentSlots.push(...slots);
        return true;
      }
    }

    return false;
  }

  /**
   * Đệ quy CSP Backtracking với Forward Checking
   */
  private assignSlotRecursive(
    taskIndex: number,
    tasks: SchedulingTask[],
    currentSlots: TimetableSlot[],
    unplacedTasks: SchedulingTask[]
  ): boolean {
    this.iterations++;

    if (this.iterations > this.maxSteps) {
      // Ghi nhận các task còn lại để xếp qua Greedy
      for (let i = taskIndex; i < tasks.length; i++) {
        unplacedTasks.push(tasks[i]);
      }
      return false;
    }

    if (taskIndex >= tasks.length) {
      return true;
    }

    const task = tasks[taskIndex];
    const candidateSlots = this.generateCandidateDomainValues(task, currentSlots);

    for (const { day, period, session } of candidateSlots) {
      const maxPeriods = session === 'MORNING' ? 5 : 4;

      if (task.duration === 1) {
        const check = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          period,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          this.rooms,
          session,
          this.subjectsMap
        );

        if (!check.isAvailable || !check.assignedRoom) continue;

        const newSlots = MergedClassHandler.createAtomicSlots(
          task.assignment,
          day,
          period,
          check.assignedRoom.id,
          session
        );
        currentSlots.push(...newSlots);

        if (this.forwardCheck(taskIndex + 1, tasks, currentSlots)) {
          const nextSuccess = this.assignSlotRecursive(
            taskIndex + 1,
            tasks,
            currentSlots,
            unplacedTasks
          );
          if (nextSuccess) return true;
        }

        this.backtrackCount++;
        for (let i = 0; i < newSlots.length; i++) {
          currentSlots.pop();
        }
      } else if (task.duration === 2) {
        const nextPeriod = (period + 1) as PeriodOfDay;
        if (nextPeriod > maxPeriods) continue;

        const check1 = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          period,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          this.rooms,
          session,
          this.subjectsMap
        );
        if (!check1.isAvailable || !check1.assignedRoom) continue;

        const slots1 = MergedClassHandler.createAtomicSlots(
          task.assignment,
          day,
          period,
          check1.assignedRoom.id,
          session
        );
        currentSlots.push(...slots1);

        const check2 = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          nextPeriod,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          [check1.assignedRoom],
          session,
          this.subjectsMap
        );

        if (check2.isAvailable && check2.assignedRoom) {
          const slots2 = MergedClassHandler.createAtomicSlots(
            task.assignment,
            day,
            nextPeriod,
            check2.assignedRoom.id,
            session
          );
          currentSlots.push(...slots2);

          if (this.forwardCheck(taskIndex + 1, tasks, currentSlots)) {
            const nextSuccess = this.assignSlotRecursive(
              taskIndex + 1,
              tasks,
              currentSlots,
              unplacedTasks
            );
            if (nextSuccess) return true;
          }

          this.backtrackCount++;
          for (let i = 0; i < slots2.length; i++) {
            currentSlots.pop();
          }
        }

        for (let i = 0; i < slots1.length; i++) {
          currentSlots.pop();
        }
      }
    }

    return false;
  }

  /**
   * Xếp Greedy không xung đột (Conflict-Free Greedy Placer)
   * Đảm bảo mọi tiết đều được xếp vào vị trí hoàn toàn hợp lệ 100% đúng buổi Sáng/Chiều
   */
  private greedyPlaceTask(
    task: SchedulingTask,
    currentSlots: TimetableSlot[],
    maxSubjectPerSession?: number
  ): boolean {
    const candidateSlots = this.generateCandidateDomainValues(task, currentSlots);

    for (const { day, period, session } of candidateSlots) {
      const maxPeriods = session === 'MORNING' ? 5 : 4;

      if (task.duration === 2) {
        const nextPeriod = (period + 1) as PeriodOfDay;
        if (nextPeriod > maxPeriods) continue;

        const check1 = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          period,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          this.rooms,
          session,
          this.subjectsMap
        );
        if (!check1.isAvailable || !check1.assignedRoom) continue;

        const slots1 = MergedClassHandler.createAtomicSlots(
          task.assignment,
          day,
          period,
          check1.assignedRoom.id,
          session
        );
        currentSlots.push(...slots1);

        const check2 = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          nextPeriod,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          [check1.assignedRoom],
          session,
          this.subjectsMap
        );

        if (check2.isAvailable && check2.assignedRoom) {
          const slots2 = MergedClassHandler.createAtomicSlots(
            task.assignment,
            day,
            nextPeriod,
            check2.assignedRoom.id,
            session
          );
          currentSlots.push(...slots2);
          return true;
        }

        // Rollback slots1 nếu tiết 2 không vừa
        for (let i = 0; i < slots1.length; i++) {
          currentSlots.pop();
        }
      } else {
        // Tiết đơn
        const check = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          period,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          this.rooms,
          session,
          this.subjectsMap
        );

        if (check.isAvailable && check.assignedRoom) {
          const slots = MergedClassHandler.createAtomicSlots(
            task.assignment,
            day,
            period,
            check.assignedRoom.id,
            session
          );
          currentSlots.push(...slots);
          return true;
        }
      }
    }

    // Nếu các ngày thông thường chưa vừa do tiết đôi, thử hạ xuống xếp tiết đơn đúng session
    if (task.duration === 2) {
      for (const { day, period, session } of candidateSlots) {
        const check = MergedClassHandler.checkAvailability(
          task.assignment,
          day,
          period,
          currentSlots,
          this.teachersMap,
          this.classesMap,
          this.rooms,
          session,
          this.subjectsMap
        );
        if (check.isAvailable && check.assignedRoom) {
          const slots = MergedClassHandler.createAtomicSlots(
            task.assignment,
            day,
            period,
            check.assignedRoom.id,
            session
          );
          currentSlots.push(...slots);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Sinh tập giá trị ứng viên (Domain Values) theo thứ tự heuristics thông minh
   * BẮT BUỘC TUÂN THỦ CẤU HÌNH BUỔI HỌC (MORNING / AFTERNOON / ANY) CỦA MÔN HỌC!
   */
  private generateCandidateDomainValues(
    task: SchedulingTask,
    currentSlots: TimetableSlot[]
  ): { day: DayOfWeek; period: PeriodOfDay; session: 'MORNING' | 'AFTERNOON' }[] {
    const candidates: { day: DayOfWeek; period: PeriodOfDay; session: 'MORNING' | 'AFTERNOON'; score: number }[] = [];
    const assignment = task.assignment;

    const existingDaysForAssignment = new Set(
      currentSlots.filter((s) => s.assignmentId === assignment.id).map((s) => s.day)
    );

    const sub = this.subjectsMap.get(assignment.subjectId);
    const isSHL =
      sub?.code === 'SHL' ||
      sub?.name.toLowerCase().includes('sinh hoạt') ||
      assignment.subjectId === 'SUB_SHL';

    // 1. LẤY CẤU HÌNH BUỔI HỌC CỦA MÔN HỌC (preferredShift)
    // - 'MORNING': Chỉ được phân vào Buổi Sáng (Tiết 1 -> 5)
    // - 'AFTERNOON': Chỉ được phân vào Buổi Chiều (Tiết 1 -> 4)
    // - 'ANY' hoặc undefined: Linh hoạt (Ưu tiên theo ca học của lớp)
    const preferredShift = sub?.preferredShift || 'ANY';

    const primaryClass = assignment.classIds[0] ? this.classesMap.get(assignment.classIds[0]) : undefined;
    const classShift = primaryClass?.shift;

    let allowedSessions: ('MORNING' | 'AFTERNOON')[];
    if (preferredShift === 'MORNING') {
      allowedSessions = ['MORNING'];
    } else if (preferredShift === 'AFTERNOON') {
      allowedSessions = ['AFTERNOON'];
    } else {
      if (classShift === 'AFTERNOON') {
        allowedSessions = ['AFTERNOON', 'MORNING'];
      } else {
        allowedSessions = ['MORNING', 'AFTERNOON'];
      }
    }

    for (const session of allowedSessions) {
      const maxPeriods = session === 'MORNING' ? 5 : 4;

      for (const { key: day } of DAYS_OF_WEEK) {
        for (let p = 1; p <= maxPeriods; p++) {
          const period = p as PeriodOfDay;

          // Cố định Tiết 1 sáng Thứ 2 (Day 2, Period 1, MORNING) cho tiết Chào cờ, không xếp các môn khác vào đây
          if (day === 2 && period === 1 && session === 'MORNING') continue;

          if (task.duration === 2 && period >= maxPeriods) continue;

          let score = 0;

          // Ưu tiên ca học chính của lớp
          if (classShift && session === classShift) {
            score += 25;
          }

          if (assignment.preferredDay && assignment.preferredDay === day) {
            score += 50;
          }

          if (isSHL) {
            if (day === 7 && period === (session === 'MORNING' ? 5 : 4)) {
              score += 300;
            } else if (day === 7 && period === (session === 'MORNING' ? 4 : 3)) {
              score += 150;
            } else if (day === 7) {
              score += 80;
            } else {
              score -= 200;
            }
          }

          // Rải đều các môn trong tuần
          if (existingDaysForAssignment.has(day)) {
            score -= 40;
          }

          // Môn nặng: ưu tiên tiết 2-3 sáng
          if (sub?.isHeavy && session === 'MORNING') {
            if (period === 2 || period === 3) score += 30;
          }

          // Tiết đôi ưu tiên đặt vào 1-2, 2-3
          if (task.duration === 2) {
            if (period === 1 || period === 2) score += 20;
            if (period === maxPeriods - 1) score -= 10;
          }

          // Ưu tiên nguyện vọng GV
          for (const tId of assignment.teacherIds) {
            const teacher = this.teachersMap.get(tId);
            if (teacher?.preferredSlots?.some((pref) => {
              if (pref.day !== day) return false;
              const prefPeriod = pref.period <= 5 ? pref.period : ((pref.period - 1) % 5) + 1;
              if (prefPeriod !== period) return false;
              const prefSession = pref.session || (pref.period > 5 ? 'AFTERNOON' : 'MORNING');
              return prefSession === session;
            })) {
              score += 35;
            }
          }

          candidates.push({ day, period, session, score });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.map(({ day, period, session }) => ({ day, period, session }));
  }

  /**
   * Forward Checking: Kiểm tra nhanh xem việc vừa gán slot có làm cho
   * bất kỳ task nào ngay sau đó bị cạn kiệt domain không
   */
  private forwardCheck(
    nextTaskIndex: number,
    tasks: SchedulingTask[],
    currentSlots: TimetableSlot[]
  ): boolean {
    const checkHorizon = Math.min(tasks.length, nextTaskIndex + 3);

    for (let i = nextTaskIndex; i < checkHorizon; i++) {
      const task = tasks[i];
      if (task.assignment.isMerged || task.assignment.teacherIds.length > 1) {
        const sub = this.subjectsMap.get(task.assignment.subjectId);
        const preferredShift = sub?.preferredShift || 'ANY';
        let allowedSessions: ('MORNING' | 'AFTERNOON')[] = ['MORNING', 'AFTERNOON'];
        if (preferredShift === 'MORNING') allowedSessions = ['MORNING'];
        else if (preferredShift === 'AFTERNOON') allowedSessions = ['AFTERNOON'];

        let hasAtLeastOneSlot = false;
        for (const session of allowedSessions) {
          const maxP = session === 'MORNING' ? 5 : 4;
          for (const { key: day } of DAYS_OF_WEEK) {
            for (let p = 1; p <= maxP; p++) {
              const period = p as PeriodOfDay;
              if (day === 2 && period === 1 && session === 'MORNING') continue;
              if (task.duration === 2 && period >= maxP) continue;

              const check = MergedClassHandler.checkAvailability(
                task.assignment,
                day,
                period,
                currentSlots,
                this.teachersMap,
                this.classesMap,
                this.rooms,
                session,
                this.subjectsMap
              );
              if (check.isAvailable) {
                hasAtLeastOneSlot = true;
                break;
              }
            }
            if (hasAtLeastOneSlot) break;
          }
          if (hasAtLeastOneSlot) break;
        }

        if (!hasAtLeastOneSlot) {
          return false;
        }
      }
    }

    return true;
  }
}
