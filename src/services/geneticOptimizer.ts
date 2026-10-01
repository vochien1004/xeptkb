/**
 * GIAI ĐOẠN 2: TỐI ƯU HÓA LỜI GIẢI (OPTIMIZATION ENGINE)
 * Triển khai giải thuật di truyền (Genetic Algorithm) & Simulated Annealing
 * dựa trên các phép Hoán đổi Tiết (Valid Slot Swapping) giữ nguyên 100% Ràng buộc cứng,
 * liên tục giảm thiểu điểm phạt Ràng buộc mềm (Giảm tiết trống GV, giảm dồn môn nặng).
 */

import {
  TimetableSlot,
  Teacher,
  SchoolClass,
  Room,
  Subject,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  PERIODS,
  FitnessMetrics,
} from '../types/timetable';
import { FitnessEvaluator } from './fitnessEvaluator';
import { ValidationEngine } from './validationEngine';

export interface OptimizationStepResult {
  generation: number;
  bestFitness: number;
  totalPenalty: number;
  improved: boolean;
  slots: TimetableSlot[];
  metrics: FitnessMetrics;
}

export class GeneticOptimizer {
  private teachers: Teacher[];
  private classes: SchoolClass[];
  private rooms: Room[];
  private subjects: Subject[];

  private teachersMap: Map<string, Teacher>;
  private classesMap: Map<string, SchoolClass>;
  private subjectsMap: Map<string, Subject>;

  constructor(
    teachers: Teacher[],
    classes: SchoolClass[],
    rooms: Room[],
    subjects: Subject[]
  ) {
    this.teachers = teachers;
    this.classes = classes;
    this.rooms = rooms;
    this.subjects = subjects;

    this.teachersMap = new Map(teachers.map((t) => [t.id, t]));
    this.classesMap = new Map(classes.map((c) => [c.id, c]));
    this.subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  }

  /**
   * Tối ưu hóa qua N thế hệ (Generations)
   * Có thể gọi từng bước (step-by-step) hoặc chạy một lượt
   */
  public optimize(
    initialSlots: TimetableSlot[],
    maxGenerations = 80,
    onProgress?: (progress: OptimizationStepResult) => void
  ): { finalSlots: TimetableSlot[]; initialMetrics: FitnessMetrics; finalMetrics: FitnessMetrics } {
    let currentSlots = JSON.parse(JSON.stringify(initialSlots)) as TimetableSlot[];
    let currentMetrics = FitnessEvaluator.evaluate(
      currentSlots,
      this.teachers,
      this.classes,
      this.subjects
    );

    const initialMetrics = { ...currentMetrics };
    let temperature = 100.0;
    const coolingRate = 0.95;

    for (let gen = 1; gen <= maxGenerations; gen++) {
      // Thực hiện một phép biến dị hoán đổi hợp lệ (Valid Swap Mutation)
      const mutatedSlots = this.performValidSlotMutation(currentSlots);

      if (mutatedSlots) {
        const mutatedMetrics = FitnessEvaluator.evaluate(
          mutatedSlots,
          this.teachers,
          this.classes,
          this.subjects
        );

        const deltaPenalty = mutatedMetrics.totalPenalty - currentMetrics.totalPenalty;

        // Nếu điểm phạt giảm (tốt hơn) -> Chấp nhận ngay
        // Nếu điểm phạt tăng nhẹ -> Chấp nhận theo xác suất nhiệt độ (Simulated Annealing) để vượt qua cực tiểu địa phương
        const acceptWorse =
          deltaPenalty > 0 && Math.random() < Math.exp(-deltaPenalty / Math.max(1, temperature));

        if (deltaPenalty < 0 || acceptWorse) {
          currentSlots = mutatedSlots;
          currentMetrics = mutatedMetrics;
        }
      }

      temperature *= coolingRate;

      if (onProgress && gen % 5 === 0) {
        onProgress({
          generation: gen,
          bestFitness: currentMetrics.fitnessScore,
          totalPenalty: currentMetrics.totalPenalty,
          improved: currentMetrics.totalPenalty < initialMetrics.totalPenalty,
          slots: currentSlots,
          metrics: currentMetrics,
        });
      }
    }

    const finalMetrics = FitnessEvaluator.evaluate(
      currentSlots,
      this.teachers,
      this.classes,
      this.subjects
    );

    return {
      finalSlots: currentSlots,
      initialMetrics,
      finalMetrics,
    };
  }

  /**
   * Phép Biến dị (Mutation): Tìm và di chuyển hoặc hoán đổi 2 slot trong cùng một lớp
   * mà KHÔNG gây ra bất kỳ xung đột lịch nào (Zero Hard Constraint Violations)
   * và TUÂN THỦ 100% CẤU HÌNH BUỔI HỌC (preferredShift: MORNING/AFTERNOON)
   */
  private performValidSlotMutation(slots: TimetableSlot[]): TimetableSlot[] | null {
    const cloned = JSON.parse(JSON.stringify(slots)) as TimetableSlot[];

    // Chọn ngẫu nhiên một lớp học
    const randomClass = this.classes[Math.floor(Math.random() * this.classes.length)];
    const classSlots = cloned.filter(
      (s) =>
        s.classId === randomClass.id &&
        !s.isMerged &&
        s.subjectId !== 'SUB_CC' &&
        !(s.day === 2 && s.period === 1)
    );

    if (classSlots.length === 0) return null;

    // Chọn 1 slot nguồn
    const sourceSlot = classSlots[Math.floor(Math.random() * classSlots.length)];
    const sourceSubject = this.subjectsMap.get(sourceSlot.subjectId);

    // Thử 2 chiến lược:
    // Chiến lược A: Di chuyển slot vào 1 khung giờ trống của lớp
    // Chiến lược B: Hoán đổi với 1 slot khác của cùng lớp
    const tryMoveToEmpty = Math.random() > 0.4;

    if (tryMoveToEmpty) {
      // Tìm các slot mà lớp này đang trống (trừ Thứ 2 Tiết 1 cố định Chào cờ)
      const targetDay = DAYS_OF_WEEK[Math.floor(Math.random() * DAYS_OF_WEEK.length)].key;
      const targetPeriod = PERIODS[Math.floor(Math.random() * PERIODS.length)].period;
      const targetSession = targetPeriod > 5 ? 'AFTERNOON' : (sourceSlot.session || 'MORNING');

      if (targetDay === 2 && targetPeriod === 1 && targetSession === 'MORNING') {
        return null; // Không di chuyển vào tiết Chào cờ
      }

      // Kiểm tra ràng buộc cấu hình Buổi học (preferredShift)
      if (sourceSubject?.preferredShift === 'MORNING' && targetSession === 'AFTERNOON') {
        return null;
      }
      if (sourceSubject?.preferredShift === 'AFTERNOON' && targetSession === 'MORNING') {
        return null;
      }

      // Kiểm tra lớp có đang trống tại đây không
      const isClassOccupied = cloned.some(
        (s) =>
          s.day === targetDay &&
          s.period === targetPeriod &&
          (s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON')) === targetSession &&
          (s.classId === randomClass.id || (s.classIds && s.classIds.includes(randomClass.id)))
      );

      if (!isClassOccupied) {
        // Kiểm tra xem GV của slot có rảnh tại thời điểm mới không
        const teacher = this.teachersMap.get(sourceSlot.teacherId);
        if (teacher) {
          const isTeacherAvailable = ValidationEngine.checkTeacherAvailability(
            teacher,
            targetDay,
            targetPeriod,
            targetSession
          );
          if (isTeacherAvailable) {
            const teacherConflict = ValidationEngine.checkTeacherConflict(
              sourceSlot.teacherId,
              targetDay,
              targetPeriod,
              cloned,
              sourceSlot.assignmentId,
              sourceSlot.classId,
              targetSession
            );

            if (!teacherConflict.hasConflict) {
              // Hợp lệ! Cập nhật thời gian
              sourceSlot.day = targetDay;
              sourceSlot.period = targetPeriod;
              sourceSlot.session = targetSession;
              return cloned;
            }
          }
        }
      }
    } else {
      // Hoán đổi giữa 2 slot trong cùng lớp (trừ Chào cờ)
      const candidateTargets = classSlots.filter(
        (s) => s.id !== sourceSlot.id && s.subjectId !== 'SUB_CC' && !(s.day === 2 && s.period === 1)
      );
      if (candidateTargets.length > 0) {
        const targetSlot = candidateTargets[Math.floor(Math.random() * candidateTargets.length)];
        const targetSubject = this.subjectsMap.get(targetSlot.subjectId);

        const sourceSession = sourceSlot.session || (sourceSlot.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const targetSession = targetSlot.session || (targetSlot.period <= 5 ? 'MORNING' : 'AFTERNOON');

        // Kiểm tra ràng buộc cấu hình Buổi học (preferredShift) cho cả 2 môn khi hoán đổi
        if (sourceSubject?.preferredShift === 'MORNING' && targetSession === 'AFTERNOON') return null;
        if (sourceSubject?.preferredShift === 'AFTERNOON' && targetSession === 'MORNING') return null;
        if (targetSubject?.preferredShift === 'MORNING' && sourceSession === 'AFTERNOON') return null;
        if (targetSubject?.preferredShift === 'AFTERNOON' && sourceSession === 'MORNING') return null;

        // Kiểm tra GV sourceSlot tại vị trí của targetSlot
        const teacherSource = this.teachersMap.get(sourceSlot.teacherId);
        const teacherTarget = this.teachersMap.get(targetSlot.teacherId);

        if (teacherSource && teacherTarget) {
          const sourceCanMoveToTarget =
            ValidationEngine.checkTeacherAvailability(teacherSource, targetSlot.day, targetSlot.period, targetSession) &&
            !ValidationEngine.checkTeacherConflict(
              sourceSlot.teacherId,
              targetSlot.day,
              targetSlot.period,
              cloned.filter((s) => s.id !== targetSlot.id),
              sourceSlot.assignmentId,
              sourceSlot.classId,
              targetSession
            ).hasConflict;

          const targetCanMoveToSource =
            ValidationEngine.checkTeacherAvailability(teacherTarget, sourceSlot.day, sourceSlot.period, sourceSession) &&
            !ValidationEngine.checkTeacherConflict(
              targetSlot.teacherId,
              sourceSlot.day,
              sourceSlot.period,
              cloned.filter((s) => s.id !== sourceSlot.id),
              targetSlot.assignmentId,
              targetSlot.classId,
              sourceSession
            ).hasConflict;

          if (sourceCanMoveToTarget && targetCanMoveToSource) {
            // Thực hiện hoán đổi
            const tempDay = sourceSlot.day;
            const tempPeriod = sourceSlot.period;
            const tempSession = sourceSlot.session;

            sourceSlot.day = targetSlot.day;
            sourceSlot.period = targetSlot.period;
            sourceSlot.session = targetSlot.session;

            targetSlot.day = tempDay;
            targetSlot.period = tempPeriod;
            targetSlot.session = tempSession;

            return cloned;
          }
        }
      }
    }

    return null;
  }
}
