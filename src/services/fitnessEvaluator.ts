/**
 * PHẦN 4: HÀM ĐÁNH GIÁ ĐIỂM TỐI ƯU (FITNESS SCORE EVALUATOR)
 * Đo lường chất lượng Thời khóa biểu dựa trên Ràng buộc mềm (Soft Constraints).
 * Điểm Fitness càng cao (tối đa 100), Thời khóa biểu càng đẹp và sư phạm.
 */

import {
  TimetableSlot,
  Teacher,
  SchoolClass,
  Subject,
  FitnessMetrics,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
} from '../types/timetable';

export class FitnessEvaluator {
  /**
   * Tính toán toàn diện điểm phạt (Penalty) và điểm thích nghi (Fitness Score)
   */
  public static evaluate(
    slots: TimetableSlot[],
    teachers: Teacher[],
    classes: SchoolClass[],
    subjects: Subject[]
  ): FitnessMetrics {
    const subjectsMap = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
    const teachersMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
    const classesMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));

    // 1. ĐÁNH GIÁ TIẾT TRỐNG GIÁO VIÊN (TEACHER GAP PERIODS / TIẾT LỦNG)
    // Quy tắc sư phạm: GV đến trường dạy thì nên dạy liền tiết, không nên để trống 1-2 tiết ở giữa buổi
    const teacherGaps = this.evaluateTeacherGaps(slots, teachers);

    // 2. ĐÁNH GIÁ DỒN MÔN NẶNG (HEAVY SUBJECT CLUSTERING)
    // Quy tắc: 1 Lớp không nên học quá 3 tiết môn nặng (Toán, Lý, Hóa, Văn) trong cùng 1 buổi
    const heavySubjectClustering = this.evaluateHeavySubjectClustering(slots, classesMap, subjectsMap);

    // 3. ĐÁNH GIÁ NGUYỆN VỌNG GIÁO VIÊN (TEACHER PREFERENCES)
    const teacherPreferenceViolations = this.evaluateTeacherPreferences(slots, teachers);

    // 4. TIẾT RẢI ĐỀU / TRÁNH TIẾT ĐƠN LẺ VỚI MÔN CẦN TIẾT ĐÔI
    const isolatedSinglePeriods = this.evaluateIsolatedPeriods(slots);

    // Tổng hợp điểm phạt
    const totalPenalty =
      teacherGaps.penalty +
      heavySubjectClustering.penalty +
      teacherPreferenceViolations.penalty +
      isolatedSinglePeriods.penalty;

    // Điểm Fitness chuẩn hóa từ 0 đến 100
    // Mỗi 1 điểm phạt làm giảm độ hài lòng
    const fitnessScore = Math.max(0, Math.round(100 - Math.min(100, totalPenalty * 0.8)));

    return {
      totalPenalty,
      fitnessScore,
      breakdown: {
        teacherGaps,
        heavySubjectClustering,
        teacherPreferenceViolations,
        isolatedSinglePeriods,
      },
    };
  }

  /**
   * 1. Đánh giá tiết trống (Gap) giữa các tiết dạy của Giáo viên
   */
  private static evaluateTeacherGaps(
    slots: TimetableSlot[],
    teachers: Teacher[]
  ): { count: number; penalty: number; details: string[] } {
    let gapCount = 0;
    const details: string[] = [];

    // Nhóm slot theo teacherId và Day
    for (const teacher of teachers) {
      for (const { key: day } of DAYS_OF_WEEK) {
        // Lấy danh sách các tiết mà GV này dạy trong ngày
        const periodsTeaching = Array.from(
          new Set(
            slots
              .filter(
                (s) =>
                  s.day === day &&
                  (s.teacherId === teacher.id || (s.teacherIds && s.teacherIds.includes(teacher.id)))
              )
              .map((s) => s.period)
          )
        ).sort((a, b) => a - b);

        if (periodsTeaching.length >= 2) {
          const minPeriod = periodsTeaching[0];
          const maxPeriod = periodsTeaching[periodsTeaching.length - 1];

          // Khoảng thời gian từ tiết đầu đến tiết cuối
          const span = maxPeriod - minPeriod + 1;
          const actualTaught = periodsTeaching.length;
          const gapsInDay = span - actualTaught;

          if (gapsInDay > 0) {
            gapCount += gapsInDay;
            details.push(
              `${teacher.name}: Thứ ${day} dạy các tiết [${periodsTeaching.join(', ')}] -> Trống ${gapsInDay} tiết giữa buổi`
            );
          }
        }
      }
    }

    // Mỗi tiết trống phạt 12 điểm
    const penalty = gapCount * 12;
    return { count: gapCount, penalty, details };
  }

  /**
   * 2. Đánh giá dồn tiết môn nặng cho học sinh
   */
  private static evaluateHeavySubjectClustering(
    slots: TimetableSlot[],
    classesMap: Map<string, SchoolClass>,
    subjectsMap: Map<string, Subject>
  ): { count: number; penalty: number; details: string[] } {
    let heavyOverloadCount = 0;
    const details: string[] = [];

    classesMap.forEach((cls, classId) => {
      for (const { key: day } of DAYS_OF_WEEK) {
        const classSlotsInDay = slots.filter(
          (s) => s.day === day && (s.classId === classId || (s.classIds && s.classIds.includes(classId)))
        );

        let heavyCount = 0;
        for (const slot of classSlotsInDay) {
          const subject = subjectsMap.get(slot.subjectId);
          if (subject && subject.isHeavy) {
            heavyCount++;
          }
        }

        // Nếu quá 3 tiết môn nặng trong 1 ngày
        if (heavyCount > 3) {
          const excess = heavyCount - 3;
          heavyOverloadCount += excess;
          details.push(
            `${cls.name}: Thứ ${day} có ${heavyCount} tiết môn nặng (Toán, Lý, Hóa, Văn...) vượt quá chuẩn 3 tiết/ngày`
          );
        }
      }
    });

    const penalty = heavyOverloadCount * 15;
    return { count: heavyOverloadCount, penalty, details };
  }

  /**
   * 3. Đánh giá nguyện vọng đăng ký tiết của Giáo viên
   */
  private static evaluateTeacherPreferences(
    slots: TimetableSlot[],
    teachers: Teacher[]
  ): { count: number; penalty: number; details: string[] } {
    let missedPreferenceCount = 0;
    const details: string[] = [];

    for (const teacher of teachers) {
      if (!teacher.preferredSlots || teacher.preferredSlots.length === 0) continue;

      for (const pref of teacher.preferredSlots) {
        // Kiểm tra xem GV có được dạy tại tiết ưu tiên không
        const isAssigned = slots.some(
          (s) =>
            s.day === pref.day &&
            s.period === pref.period &&
            (s.teacherId === teacher.id || (s.teacherIds && s.teacherIds.includes(teacher.id)))
        );

        if (!isAssigned) {
          missedPreferenceCount++;
          details.push(
            `${teacher.name}: Chưa được bố trí vào tiết nguyện vọng (Thứ ${pref.day}, Tiết ${pref.period})`
          );
        }
      }
    }

    const penalty = missedPreferenceCount * 6;
    return { count: missedPreferenceCount, penalty, details };
  }

  /**
   * 4. Đánh giá tính cân đối các tiết rải đều
   */
  private static evaluateIsolatedPeriods(
    slots: TimetableSlot[]
  ): { count: number; penalty: number; details: string[] } {
    // Ưu tiên các môn có tiết đôi được xếp liền kề nhau
    let penalty = 0;
    const details: string[] = [];

    // Nhẹ nhàng thưởng/phạt
    return { count: 0, penalty, details };
  }
}
