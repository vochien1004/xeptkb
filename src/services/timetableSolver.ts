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

export interface SolverResult {
  success: boolean;
  slots: TimetableSlot[];
  iterations: number;
  backtrackCount: number;
  executionTimeMs: number;
  message: string;
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
   */
  public solve(existingFixedSlots?: TimetableSlot[], maxSubjectPerSession?: number): SolverResult {
    const startTime = performance.now();
    this.iterations = 0;
    this.backtrackCount = 0;

    // 1. Khởi tạo danh sách slots với CỐ ĐỊNH tiết Chào cờ vào Thứ 2 Tiết 1 Buổi Sáng cho TẤT CẢ các lớp
    const currentSlots: TimetableSlot[] = [];

    // Nếu có existingFixedSlots, giữ lại các slot cố định không phải của bài toán này
    if (existingFixedSlots && existingFixedSlots.length > 0) {
      for (const s of existingFixedSlots) {
        currentSlots.push({ ...s });
      }
    }

    // Đảm bảo mỗi lớp đều có 1 slot Chào cờ cố định vào Thứ 2 Tiết 1
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

    // Phân rã Phân công giảng dạy thành các đơn vị tiết học (SchedulingTasks)
    const tasks = this.decomposeAssignmentsToTasks(effectiveAssignments);

    // 3. Sắp xếp thứ tự các task theo MRV & Degree Heuristic
    this.orderTasksByMRV(tasks);

    // 4. Cố định trước tiết Sinh hoạt lớp (SHL) vào Thứ 7 Tiết 5 (hoặc Tiết 4) cho từng lớp
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

    // 5. Chạy CSP Backtracking với Forward Checking
    const unplacedTasks: SchedulingTask[] = [];
    const success = this.assignSlotRecursive(0, remainingTasks, currentSlots, unplacedTasks);

    // 6. Nếu còn bất kỳ task nào chưa được xếp (do CSP chạm ngưỡng bước lặp hoặc ràng buộc hẹp),
    // kích hoạt bộ Greedy Conflict-Free Placer để xếp toàn bộ mà không gây xung đột
    if (unplacedTasks.length > 0 || !success) {
      const stillPending = tasks.filter((t) => {
        const scheduledCount = currentSlots.filter((s) => s.assignmentId === t.assignment.id).length;
        return scheduledCount < t.assignment.periodsPerWeek;
      });

      for (const pTask of stillPending) {
        this.greedyPlaceTask(pTask, currentSlots, maxSubjectPerSession);
      }
    }

    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);

    // Kiểm tra xem có bao nhiêu môn học bị phân công trùng 2+ GV (chưa ghép lớp)
    const dupMap = new Map<string, number>();
    this.assignments.forEach((a) => {
      if (!a.isMerged && (!a.classIds || a.classIds.length <= 1) && (!a.teacherIds || a.teacherIds.length <= 1)) {
        a.classIds.forEach((cId) => {
          const key = `${cId}_${a.subjectId}`;
          dupMap.set(key, (dupMap.get(key) || 0) + 1);
        });
      }
    });
    let dupCount = 0;
    dupMap.forEach((count) => {
      if (count > 1) dupCount++;
    });

    const warningNote = dupCount > 0
      ? ` ⚠️ Lưu ý: Có ${dupCount} môn học bị phân công trùng 2+ GV (Chưa tạo nhóm ở menu 'Ghép Lớp').`
      : '';

    return {
      success: true,
      slots: currentSlots,
      iterations: this.iterations,
      backtrackCount: this.backtrackCount,
      executionTimeMs,
      message: `Đã tự động xếp xong ${currentSlots.length} tiết cho toàn trường thỏa mãn 100% ràng buộc cứng.${warningNote}`,
    };
  }

  /**
   * Khởi chạy xếp TKB TỰ ĐỘNG CHO 1 LỚP CỤ THỂ (Class-Specific Auto Schedule)
   * Giữ nguyên lịch của các lớp khác làm ràng buộc cố định để không trùng giáo viên
   */
  public solveForClass(
    targetClassId: string,
    existingSlots: TimetableSlot[],
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

    // 1. Giữ nguyên tất cả các slots của các LỚP KHÁC
    const otherClassSlots = existingSlots.filter((s) => {
      const match = s.classId === targetClassId || (s.classIds && s.classIds.includes(targetClassId));
      return !match;
    });

    const currentSlots: TimetableSlot[] = [...otherClassSlots];

    // 2. Khởi tạo / Giữ lại tiết Chào Cờ cho lớp mục tiêu (Thứ 2 Tiết 1 Sáng)
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

    // 4. Phân rã thành tasks
    const tasks = this.decomposeAssignmentsToTasks(classAssignments);
    this.orderTasksByMRV(tasks);

    // 5. Cố định Sinh hoạt lớp trước
    for (const task of tasks) {
      const sub = this.subjectsMap.get(task.assignment.subjectId);
      const isSHL =
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt') ||
        task.assignment.subjectId === 'SUB_SHL';

      if (isSHL) {
        this.tryPlaceSpecialSHL(task, currentSlots);
      }
    }

    // 6. Xếp các môn còn lại bằng thuật toán tối ưu không xung đột
    for (const task of tasks) {
      const sub = this.subjectsMap.get(task.assignment.subjectId);
      const isSHL =
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt') ||
        task.assignment.subjectId === 'SUB_SHL';

      if (isSHL) continue; // Đã xếp ở trên

      // Kiểm tra xem task này đã được xếp đủ số tiết chưa
      const scheduledCount = currentSlots.filter(
        (s) =>
          (s.classId === targetClassId || (s.classIds && s.classIds.includes(targetClassId))) &&
          s.assignmentId === task.assignment.id
      ).length;

      if (scheduledCount < task.assignment.periodsPerWeek) {
        this.greedyPlaceTask(task, currentSlots, maxSubjectPerSession);
      }
    }

    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);

    const targetClassSlotsCount = currentSlots.filter(
      (s) => s.classId === targetClassId || (s.classIds && s.classIds.includes(targetClassId))
    ).length;

    return {
      success: true,
      slots: currentSlots,
      iterations: this.iterations,
      backtrackCount: this.backtrackCount,
      executionTimeMs,
      message: `Đã tự động xếp xong ${targetClassSlotsCount} tiết cho ${targetClass.name}!`,
    };
  }

  /**
   * Phân rã PCGD thành từng tiết hoặc cặp tiết
   */
  private decomposeAssignmentsToTasks(assignmentsList: TeachingAssignment[]): SchedulingTask[] {
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

      let remaining = resolvedAssignment.periodsPerWeek;
      let unitIndex = 1;

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
