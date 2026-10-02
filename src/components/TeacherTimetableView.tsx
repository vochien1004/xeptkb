/**
 * Component TKB Giáo Viên (Dedicated Teacher Timetable View)
 * Hiển thị Lịch Dạy Chi Tiết của từng Giáo viên theo mẫu thiết kế High Contrast,
 * giao diện trực quan tương tự bảng TKB GV bên phải của chức năng Phân thời khóa biểu.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Teacher,
  SchoolClass,
  Subject,
  Room,
  TeachingAssignment,
  TimetableSlot,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  isSpecialDutySubject,
} from '../types/timetable';
import {
  Users,
  Search,
  Sparkles,
  BookOpen,
  Calendar,
  Clock,
  Printer,
  CheckCircle2,
  AlertCircle,
  Filter,
  UserCheck,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { TimetableSolver } from '../services/timetableSolver';
import { saveTimetableSlotsToFirebase } from '../services/firebaseClient';

interface Props {
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  rooms: Room[];
  assignments: TeachingAssignment[];
  slots: TimetableSlot[];
  onSlotsUpdated?: (newSlots: TimetableSlot[]) => void;
  onNavigateToDistributor?: (classId?: string) => void;
}

const DAYS = [
  { key: 2 as DayOfWeek, label: 'Thứ 2' },
  { key: 3 as DayOfWeek, label: 'Thứ 3' },
  { key: 4 as DayOfWeek, label: 'Thứ 4' },
  { key: 5 as DayOfWeek, label: 'Thứ 5' },
  { key: 6 as DayOfWeek, label: 'Thứ 6' },
  { key: 7 as DayOfWeek, label: 'Thứ 7' },
];

export const TeacherTimetableView: React.FC<Props> = ({
  teachers,
  classes,
  subjects,
  rooms,
  assignments,
  slots,
  onSlotsUpdated,
  onNavigateToDistributor,
}) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    teachers[0]?.id || ''
  );

  // Tự động load và chọn giáo viên có tiết hoặc giáo viên đầu tiên khi teachers được nạp
  useEffect(() => {
    if (teachers.length > 0) {
      const isValid = teachers.some((t) => t.id === selectedTeacherId);
      if (!selectedTeacherId || !isValid) {
        const teacherWithSlots = teachers.find((t) =>
          slots.some((s) => s.teacherId === t.id || (s.teacherIds && s.teacherIds.includes(t.id)))
        );
        setSelectedTeacherId((teacherWithSlots || teachers[0]).id);
      }
    }
  }, [teachers, slots, selectedTeacherId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'SINGLE' | 'ALL_GRID'>('SINGLE');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Maps để tra cứu nhanh
  const teachersMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  // Lọc danh sách giáo viên theo từ khóa tìm kiếm và môn học
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const matchSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.shortName && t.shortName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (selectedSubjectFilter !== 'ALL') {
        const teacherAsgs = assignments.filter((a) => a.teacherIds.includes(t.id));
        const teachesSubject = teacherAsgs.some((a) => a.subjectId === selectedSubjectFilter);
        if (!teachesSubject) return false;
      }

      return true;
    });
  }, [teachers, searchQuery, selectedSubjectFilter, assignments]);

  const activeTeacher = teachersMap.get(selectedTeacherId) || filteredTeachers[0] || teachers[0];

  // Tính các thông số phân công của giáo viên đang chọn
  const teacherAssignments = useMemo(() => {
    if (!activeTeacher) return [];
    return assignments.filter((a) => a.teacherIds.includes(activeTeacher.id));
  }, [activeTeacher, assignments]);

  // Danh sách các lớp GV này giảng dạy
  const teacherClasses = useMemo(() => {
    if (!activeTeacher) return [];
    const classIdsSet = new Set<string>();
    teacherAssignments.forEach((a) => {
      a.classIds.forEach((cid) => classIdsSet.add(cid));
    });
    // Lớp chủ nhiệm
    const homeroomClass = classes.find((c) => c.homeroomTeacherId === activeTeacher.id);
    if (homeroomClass) classIdsSet.add(homeroomClass.id);

    return Array.from(classIdsSet)
      .map((id) => classesMap.get(id))
      .filter(Boolean) as SchoolClass[];
  }, [activeTeacher, teacherAssignments, classes, classesMap]);

  // Môn học chính mà GV này đảm nhận
  const activeSubject = useMemo(() => {
    if (!teacherAssignments.length) return null;
    return subjectsMap.get(teacherAssignments[0].subjectId) || null;
  }, [teacherAssignments, subjectsMap]);

  // Tổng số tiết theo Phân công giảng dạy (PCGD) toàn trường (chỉ đếm các môn được phân công trong PCGD)
  const totalAssignedPeriods = useMemo(() => {
    return teacherAssignments
      .filter((a) => !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id))
      .reduce((sum, a) => sum + a.periodsPerWeek * a.classIds.length, 0);
  }, [teacherAssignments, subjectsMap]);

  // Số tiết đã được xếp vào lịch của GV này (không đếm Sinh hoạt hay Chào cờ, chỉ đếm các môn PCGD)
  const totalScheduledPeriodsForTeacher = useMemo(() => {
    if (!activeTeacher) return 0;
    const teacherAsgs = teacherAssignments.filter(
      (a) => !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id)
    );
    const teacherAssignmentIds = new Set(teacherAsgs.map((a) => a.id));
    const teacherClassSubjectMap = new Set<string>();
    teacherAsgs.forEach((a) => {
      a.classIds.forEach((cId) => {
        teacherClassSubjectMap.add(`${cId}_${a.subjectId}`);
      });
    });

    const scheduledUniqueSlots = new Set<string>();
    slots.forEach((s) => {
      const sub = subjectsMap.get(s.subjectId);
      if (isSpecialDutySubject(s.subjectId, sub, s.assignmentId)) return;

      const directMatch =
        s.teacherId === activeTeacher.id ||
        (s.teacherIds && s.teacherIds.includes(activeTeacher.id));
      const assignmentMatch = !!(s.assignmentId && teacherAssignmentIds.has(s.assignmentId));
      const matchClassSubject =
        teacherClassSubjectMap.has(`${s.classId}_${s.subjectId}`) ||
        (Array.isArray(s.classIds) &&
          s.classIds.some((cId) => teacherClassSubjectMap.has(`${cId}_${s.subjectId}`)));

      if (!directMatch && !assignmentMatch && !matchClassSubject) return;

      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      const slotKey = s.isMerged
        ? `MERGED_${s.day}_${sSess}_${sPeriod}_${s.subjectId}`
        : `${s.day}_${sSess}_${sPeriod}_${s.classId || (s.classIds ? s.classIds[0] : s.id)}`;
      scheduledUniqueSlots.add(slotKey);
    });
    return scheduledUniqueSlots.size;
  }, [activeTeacher, slots, subjectsMap, teacherAssignments]);

  // Tra cứu slot tại 1 vị trí (day, session, period) cho 1 giáo viên cụ thể
  const getTeacherSlotAt = (
    teacherId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ): TimetableSlot | undefined => {
    // Mặc định tất cả giáo viên đều tham gia tiết Chào cờ vào tiết 1 sáng Thứ 2
    if (day === 2 && session === 'MORNING' && periodNum === 1) {
      const existing = slots.find((s) => {
        if (s.day !== 2) return false;
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : s.period <= 5 ? s.period : s.period - 5;
        if (sSess !== 'MORNING' || sPeriod !== 1) return false;
        return s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId));
      });
      if (existing) return existing;

      return {
        id: `SLOT_CC_DEFAULT_${teacherId}`,
        day: 2 as DayOfWeek,
        period: 1 as PeriodOfDay,
        session: 'MORNING',
        classId: 'ALL',
        teacherId,
        roomId: '',
        assignmentId: '',
        subjectId: 'SUB_CC',
        isMerged: false,
        isCoTeaching: false,
      };
    }

    return slots.find((s) => {
      if (s.day !== day) return false;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      if (sSess !== session || sPeriod !== periodNum) return false;

      // Trực tiếp đảm nhận
      if (s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId))) {
        return true;
      }

      // Khớp theo phân công PCGD
      const tAsgs = teacherAssignments.filter((a) => a.teacherIds.includes(teacherId));
      const isAsgMatch = tAsgs.some(
        (a) =>
          a.subjectId === s.subjectId &&
          (a.classIds.includes(s.classId) ||
            (Array.isArray(s.classIds) && s.classIds.some((cId) => a.classIds.includes(cId))))
      );
      if (isAsgMatch) {
        return true;
      }

      // GVCN dạy Sinh hoạt
      const sub = subjectsMap.get(s.subjectId);
      const isShl =
        s.subjectId === 'SUB_SHL' ||
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt');
      if (isShl) {
        const cls = classesMap.get(s.classId);
        if (cls?.homeroomTeacherId === teacherId) return true;
      }

      return false;
    });
  };

  // Kiểm tra GV có báo bận tại (day, session, periodNum) hay không
  const isTeacherBusyAt = (
    teacherId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ): boolean => {
    const t = teachersMap.get(teacherId);
    if (!t || !t.unavailableSlots || t.unavailableSlots.length === 0) return false;
    return t.unavailableSlots.some((u) => {
      if (u.day !== day) return false;
      const uPeriod = u.period <= 5 ? u.period : ((u.period - 1) % 5) + 1;
      if (uPeriod !== periodNum) return false;
      const uSession = u.session || (u.period > 5 ? 'AFTERNOON' : 'MORNING');
      return uSession === session;
    });
  };

  // Tính số tiết đã xếp cho 1 môn trong 1 lớp
  const getScheduledCountForSubjectInClass = (classId: string, subjectId: string): number => {
    return slots.filter((s) => {
      if (s.classId !== classId && (!s.classIds || !s.classIds.includes(classId))) return false;
      if (s.subjectId === subjectId) return true;

      const sub = subjectsMap.get(s.subjectId);
      if (
        subjectId === 'SUB_SHL' &&
        (sub?.code === 'SHL' || sub?.name.toLowerCase().includes('sinh hoạt'))
      ) {
        return true;
      }
      return false;
    }).length;
  };

  // Tự động xếp các tiết còn thiếu cho giáo viên đang chọn
  const handleAutoScheduleActiveTeacher = async () => {
    if (!activeTeacher) return;

    // Chạy thuật toán xếp tự động cho phân công của GV này (Bảo toàn các tiết đã xếp tay)
    const solver = new TimetableSolver(assignments, teachers, classes, rooms, subjects);
    const result = solver.solve(slots);

    if (result.slots.length > 0) {
      onSlotsUpdated?.(result.slots);
      await saveTimetableSlotsToFirebase(result.slots);
      showToast(`✓ Đã tự động xếp lịch tối ưu cho GV ${activeTeacher.name}!`);
    } else {
      showToast(`⚠️ Không thể tự động xếp thêm cho GV ${activeTeacher.name}. Hãy kiểm tra xung đột!`);
    }
  };

  // Hàm in TKB
  const handlePrintTeacherTimetable = () => {
    window.print();
  };

  // Bảng màu phân biệt các lớp học trên TKB
  const getClassColorStyle = (classId: string) => {
    const colorIndex = Math.abs(classId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 6;
    const styles = [
      'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200',
      'bg-rose-100 text-rose-950 border-rose-300 hover:bg-rose-200',
      'bg-indigo-100 text-indigo-950 border-indigo-300 hover:bg-indigo-200',
      'bg-emerald-100 text-emerald-950 border-emerald-300 hover:bg-emerald-200',
      'bg-cyan-100 text-cyan-950 border-cyan-300 hover:bg-cyan-200',
      'bg-purple-100 text-purple-950 border-purple-300 hover:bg-purple-200',
    ];
    return styles[colorIndex];
  };

  return (
    <div className="space-y-6">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white font-black px-5 py-3 rounded-xl shadow-2xl border-2 border-indigo-500 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* thanh CÔNG CỤ ĐIỀU HƯỚNG VÀ LỌC GIÁO VIÊN */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-300 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-tight">
                Thời Khóa Biểu Giáo Viên
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Tra cứu, kiểm tra lịch dạy chi tiết của từng Giáo viên trong toàn trường
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-300 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('SINGLE')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'SINGLE'
                    ? 'bg-indigo-600 text-white shadow-xs font-black'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Xem Từng Giáo Viên
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ALL_GRID')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'ALL_GRID'
                    ? 'bg-indigo-600 text-white shadow-xs font-black'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất Cả GV ({filteredTeachers.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintTeacherTimetable}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer print:hidden"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>In TKB Giáo Viên</span>
            </button>
          </div>
        </div>

        {/* Ô TÌM KIẾM & BỘ LỌC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Tìm theo tên/mã GV */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc mã GV..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Lọc theo môn học */}
          <div>
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">Tất cả môn học ({subjects.length})</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  Môn: {sub.name} ({sub.code})
                </option>
              ))}
            </select>
          </div>

          {/* Chọn giáo viên nhanh */}
          <div>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full py-2 px-3 bg-white border-2 border-indigo-600 rounded-xl text-xs font-black text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              {filteredTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  GV: {t.name} ({t.shortName || t.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* NẾU Ở CHẾ ĐỘ XEM TỪNG GIÁO VIÊN (SINGLE VIEW - MATCHING MOCKUP IMAGE) */}
      {viewMode === 'SINGLE' && activeTeacher && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI: DANH SÁCH GIÁO VIÊN BÊN BẠN NẾU NGHỈ VÀ CHỌN NHANH (3 CỘT) */}
          <div className="lg:col-span-4 space-y-3 print:hidden">
            <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>Danh Sách Giáo Viên ({filteredTeachers.length})</span>
                </span>
              </div>

              <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
                {filteredTeachers.map((t) => {
                  const isSelected = t.id === activeTeacher.id;
                  const tAsgs = assignments.filter(
                    (a) =>
                      a.teacherIds.includes(t.id) &&
                      !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id)
                  );
                  const tTotal = tAsgs.reduce((s, a) => s + a.periodsPerWeek * a.classIds.length, 0);

                  const tAssignmentIds = new Set(tAsgs.map((a) => a.id));
                  const tClassSubjectMap = new Set<string>();
                  tAsgs.forEach((a) => {
                    a.classIds.forEach((cId) => {
                      tClassSubjectMap.add(`${cId}_${a.subjectId}`);
                    });
                  });

                  const scheduledUniqueSlots = new Set<string>();
                  slots.forEach((s) => {
                    const sub = subjectsMap.get(s.subjectId);
                    if (isSpecialDutySubject(s.subjectId, sub, s.assignmentId)) return;

                    const directMatch =
                      s.teacherId === t.id || (s.teacherIds && s.teacherIds.includes(t.id));
                    const assignmentMatch = !!(s.assignmentId && tAssignmentIds.has(s.assignmentId));
                    const matchClassSubject =
                      tClassSubjectMap.has(`${s.classId}_${s.subjectId}`) ||
                      (Array.isArray(s.classIds) &&
                        s.classIds.some((cId) => tClassSubjectMap.has(`${cId}_${s.subjectId}`)));

                    if (!directMatch && !assignmentMatch && !matchClassSubject) return;

                    const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
                    const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
                    const slotKey = s.isMerged
                      ? `MERGED_${s.day}_${sSess}_${sPeriod}_${s.subjectId}`
                      : `${s.day}_${sSess}_${sPeriod}_${s.classId || (s.classIds ? s.classIds[0] : s.id)}`;
                    scheduledUniqueSlots.add(slotKey);
                  });
                  const tSched = scheduledUniqueSlots.size;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTeacherId(t.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-md font-black ring-2 ring-indigo-300'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-xs flex items-center gap-1.5">
                          <span>{t.name}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-black ${
                              isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {t.shortName || t.code}
                          </span>
                        </div>
                        <div className={`text-[11px] mt-0.5 font-medium ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {tAsgs.map((a) => subjectsMap.get(a.subjectId)?.shortName || subjectsMap.get(a.subjectId)?.name).filter(Boolean).join(', ') || 'Chưa gán PCGD'}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                            isSelected
                              ? 'bg-white text-indigo-950'
                              : tSched === tTotal && tTotal > 0
                              ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                              : tSched > tTotal
                              ? 'bg-rose-100 text-rose-950 border border-rose-300'
                              : 'bg-amber-100 text-amber-950 border border-amber-300'
                          }`}
                        >
                          {tSched}/{tTotal}t
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: KHUNG HIỂN THỊ THỜI KHÓA BIỂU CỦA GIÁO VIÊN (MATCHING SCREENSHOT PERFECTLY) (8 CỘT) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md overflow-hidden p-5 sm:p-6 space-y-4">
              {/* HEADER THẺ MÔN VÀ TÊN GV DỰA THEO HÌNH MẪU */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2 text-sm sm:text-base font-black text-slate-950">
                  <span className="text-indigo-900 font-extrabold">{activeTeacher.shortName || activeTeacher.name}</span>
                  <span className="text-slate-400">-</span>
                  <span className="text-rose-700 font-black">{activeSubject?.shortName || activeSubject?.name || 'Môn Học'}</span>
                  <span className="text-slate-400">-</span>
                  <span className="text-indigo-950 font-black">
                    {totalScheduledPeriodsForTeacher}/{totalAssignedPeriods}
                  </span>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={handleAutoScheduleActiveTeacher}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    title="Tự động xếp tiết thiếu cho giáo viên này"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto</span>
                  </button>
                </div>
              </div>

              {/* DÒNG TIÊU ĐỀ LỊCH DẠY & BADGE SỐ TIẾT TOÀN TRƯỜNG */}
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-slate-900 text-sm sm:text-base">
                  Lịch Dạy Của {activeTeacher.name}:
                </div>
                <div className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-950 font-black text-xs border border-emerald-300">
                  {totalScheduledPeriodsForTeacher} tiết toàn trường
                </div>
              </div>

              {/* BẢNG LƯỚI THỜI KHÓA BIỂU DẠY (SÁNG 5 TIẾT + CHIỀU 4 TIẾT) */}
              <div className="rounded-xl border-2 border-slate-300 overflow-hidden bg-slate-50">
                {/* 1. BẢNG BUỔI SÁNG (5 TIẾT) */}
                <table className="w-full text-center text-xs border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300 text-xs">
                      {DAYS.map(({ key, label }) => (
                        <th key={key} className="py-2 border-r border-slate-300 last:border-r-0 w-1/6">
                          {label.replace('Thứ ', 'T')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[1, 2, 3, 4, 5].map((period) => (
                      <tr key={`single_m_${period}`}>
                        {DAYS.map(({ key: day }) => {
                          const slot = getTeacherSlotAt(activeTeacher.id, day, 'MORNING', period);
                          const isBusy = isTeacherBusyAt(activeTeacher.id, day, 'MORNING', period);
                          const isCC = (day === 2 && period === 1) || slot?.subjectId === 'SUB_CC' || subjectsMap.get(slot?.subjectId || '')?.code === 'CC';
                          const cls = slot && slot.classId !== 'ALL' ? classesMap.get(slot.classId) : null;
                          const classNameLabel = cls?.code || cls?.name.replace('Lớp ', '') || (slot?.classId !== 'ALL' ? slot?.classId : '');

                          if (isCC) {
                            return (
                              <td
                                key={day}
                                className="py-2 px-1 border-r border-slate-200 last:border-r-0 font-black h-10 transition-all text-xs bg-amber-100/95 text-amber-950 border border-amber-300 ring-1 ring-amber-300 select-none shadow-2xs"
                                title="Chào cờ đầu tuần (Toàn trường - Mặc định tất cả giáo viên tham gia)"
                              >
                                <div className="flex flex-col items-center justify-center leading-tight">
                                  <span className="text-[11px] font-black text-amber-950 flex items-center gap-0.5">
                                    <span>🚩</span> Chào cờ
                                  </span>
                                  <span className="text-[9px] font-bold text-amber-800">Toàn trường</span>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={day}
                              onClick={() => {
                                if (slot?.classId && slot.classId !== 'ALL') {
                                  onNavigateToDistributor?.(slot.classId);
                                }
                              }}
                              className={`py-2 px-1 border-r border-slate-200 last:border-r-0 font-black h-10 transition-all text-xs ${
                                slot
                                  ? `${getClassColorStyle(
                                      slot.classId
                                    )} cursor-pointer shadow-xs hover:scale-105`
                                  : isBusy
                                  ? 'bg-rose-100 text-rose-800 font-bold'
                                  : 'hover:bg-slate-100/70'
                              }`}
                              title={
                                slot
                                  ? `Lớp ${cls?.name || slot.classId} (Sáng T${day}, Tiết ${period}) - Click để mở TKB lớp`
                                  : isBusy
                                  ? `Giáo viên đã đăng ký bận tiết ${period} sáng Thứ ${day}`
                                  : `Tiết ${period} Sáng Thứ ${day}: Rảnh`
                              }
                            >
                              {slot ? (
                                <div className="flex flex-col items-center justify-center">
                                  <span>{classNameLabel}</span>
                                  {slot.isCoTeaching && (
                                    <span className="text-[8px] text-emerald-800 font-black bg-emerald-200/80 px-1 rounded">
                                      Co-Teach
                                    </span>
                                  )}
                                  {slot.isMerged && (
                                    <span className="text-[8px] text-amber-800 font-black bg-amber-200/80 px-1 rounded">
                                      Ghép
                                    </span>
                                  )}
                                </div>
                              ) : isBusy ? (
                                <span className="text-[10px] text-rose-700 font-black">Bận</span>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* DÒNG PHÂN CÁCH SÁNG - CHIỀU */}
                <div className="h-2 bg-slate-200 border-y border-slate-300 flex items-center justify-center">
                  <span className="bg-slate-400 text-white text-[9px] font-black px-2 rounded-full uppercase">
                    Ca Chiều
                  </span>
                </div>

                {/* 2. BẢNG BUỔI CHIỀU (4 TIẾT) */}
                <table className="w-full text-center text-xs border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300 text-xs">
                      {DAYS.map(({ key, label }) => (
                        <th key={key} className="py-2 border-r border-slate-300 last:border-r-0 w-1/6">
                          {label.replace('Thứ ', 'T')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[1, 2, 3, 4].map((period) => (
                      <tr key={`single_a_${period}`}>
                        {DAYS.map(({ key: day }) => {
                          const slot = getTeacherSlotAt(activeTeacher.id, day, 'AFTERNOON', period);
                          const isBusy = isTeacherBusyAt(activeTeacher.id, day, 'AFTERNOON', period);
                          const cls = slot ? classesMap.get(slot.classId) : null;
                          const classNameLabel = cls?.code || cls?.name.replace('Lớp ', '') || slot?.classId;

                          return (
                            <td
                              key={day}
                              onClick={() => {
                                if (slot?.classId) {
                                  onNavigateToDistributor?.(slot.classId);
                                }
                              }}
                              className={`py-2 px-1 border-r border-slate-200 last:border-r-0 font-black h-10 transition-all text-xs ${
                                slot
                                  ? `${getClassColorStyle(
                                      slot.classId
                                    )} cursor-pointer shadow-xs hover:scale-105`
                                  : isBusy
                                  ? 'bg-rose-100 text-rose-800 font-bold'
                                  : 'hover:bg-slate-100/70'
                              }`}
                              title={
                                slot
                                  ? `Lớp ${cls?.name || slot.classId} (Chiều T${day}, Tiết ${period}) - Click để mở TKB lớp`
                                  : isBusy
                                  ? `Giáo viên đã đăng ký bận tiết ${period} chiều Thứ ${day}`
                                  : `Tiết ${period} Chiều Thứ ${day}: Rảnh`
                              }
                            >
                              {slot ? (
                                <div className="flex flex-col items-center justify-center">
                                  <span>{classNameLabel}</span>
                                  {slot.isCoTeaching && (
                                    <span className="text-[8px] text-emerald-800 font-black bg-emerald-200/80 px-1 rounded">
                                      Co-Teach
                                    </span>
                                  )}
                                  {slot.isMerged && (
                                    <span className="text-[8px] text-amber-800 font-black bg-amber-200/80 px-1 rounded">
                                      Ghép
                                    </span>
                                  )}
                                </div>
                              ) : isBusy ? (
                                <span className="text-[10px] text-rose-700 font-black">Bận</span>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* BẢNG CHI TIẾT PHÂN CÔNG & TIẾN ĐỘ DẠY CỦA GIÁO VIÊN */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="font-black text-xs text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Chi Tiết Lớp Phụ Trách & Tiến Độ Xếp</span>
                  <span className="text-[11px] text-indigo-700 font-bold">
                    Môn: {activeSubject?.name || 'Chưa gán'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {teacherClasses.map((c) => {
                    const asg = teacherAssignments.find((a) => a.classIds.includes(c.id));
                    const sched = getScheduledCountForSubjectInClass(c.id, asg?.subjectId || '');
                    const total = asg?.periodsPerWeek || 0;

                    return (
                      <div
                        key={c.id}
                        onClick={() => onNavigateToDistributor?.(c.id)}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/60 transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="font-black text-xs text-slate-950 flex items-center gap-1.5">
                            <span>{c.name}</span>
                            {c.homeroomTeacherId === activeTeacher.id && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-white">
                                👑 GVCN
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {asg ? `${activeSubject?.shortName || activeSubject?.name} (${total} tiết/tuần)` : 'Lớp chủ nhiệm'}
                          </div>
                        </div>

                        <div>
                          <span
                            className={`px-2 py-1 rounded-lg text-xs font-black border ${
                              sched === total && total > 0
                                ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                : sched > total
                                ? 'bg-rose-100 text-rose-950 border-rose-300'
                                : 'bg-amber-100 text-amber-950 border-amber-300'
                            }`}
                          >
                            Xếp {sched}/{total}t
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {teacherClasses.length === 0 && (
                    <div className="col-span-2 text-center text-xs text-slate-400 italic py-2">
                      Giáo viên này chưa được gán Phân công giảng dạy hoặc Chủ nhiệm lớp nào.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHẾ ĐỘ XEM TẤT CẢ GIÁO VIÊN NẾU NGƯỜI DÙNG CHỌN "ALL_GRID" */}
      {viewMode === 'ALL_GRID' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTeachers.map((t) => {
            const tAsgs = assignments.filter(
              (a) =>
                a.teacherIds.includes(t.id) &&
                !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id)
            );
            const tSubject = subjectsMap.get(tAsgs[0]?.subjectId);
            const tTotal = tAsgs.reduce((sum, a) => sum + a.periodsPerWeek * a.classIds.length, 0);

            const tAssignmentIds = new Set(tAsgs.map((a) => a.id));
            const tClassSubjectMap = new Set<string>();
            tAsgs.forEach((a) => {
              a.classIds.forEach((cId) => {
                tClassSubjectMap.add(`${cId}_${a.subjectId}`);
              });
            });

            const scheduledUniqueSlots = new Set<string>();
            slots.forEach((s) => {
              const sub = subjectsMap.get(s.subjectId);
              if (isSpecialDutySubject(s.subjectId, sub, s.assignmentId)) return;

              const directMatch =
                s.teacherId === t.id || (s.teacherIds && s.teacherIds.includes(t.id));
              const assignmentMatch = !!(s.assignmentId && tAssignmentIds.has(s.assignmentId));
              const matchClassSubject =
                tClassSubjectMap.has(`${s.classId}_${s.subjectId}`) ||
                (Array.isArray(s.classIds) &&
                  s.classIds.some((cId) => tClassSubjectMap.has(`${cId}_${s.subjectId}`)));

              if (!directMatch && !assignmentMatch && !matchClassSubject) return;

              const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
              const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
              const slotKey = s.isMerged
                ? `MERGED_${s.day}_${sSess}_${sPeriod}_${s.subjectId}`
                : `${s.day}_${sSess}_${sPeriod}_${s.classId || (s.classIds ? s.classIds[0] : s.id)}`;
              scheduledUniqueSlots.add(slotKey);
            });
            const tSched = scheduledUniqueSlots.size;

            return (
              <div
                key={t.id}
                className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden p-4 space-y-3 hover:border-indigo-500 transition-all"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <div className="font-black text-sm text-slate-950">{t.name}</div>
                    <div className="text-[11px] font-bold text-indigo-700">
                      {tSubject?.name || 'Giáo viên'} ({t.shortName || t.code})
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                      tSched === tTotal && tTotal > 0
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                        : 'bg-amber-100 text-amber-950 border border-amber-300'
                    }`}
                  >
                    {tSched}/{tTotal}t
                  </span>
                </div>

                {/* BẢNG LƯỚI THU NHỎ DÀNH CHO ALL GRID */}
                <div className="rounded-lg border border-slate-300 overflow-hidden text-[10px]">
                  <table className="w-full text-center border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        {DAYS.map(({ key, label }) => (
                          <th key={key} className="py-1 border-r border-slate-200 last:border-r-0">
                            {label.replace('Thứ ', 'T')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[1, 2, 3, 4, 5].map((period) => (
                        <tr key={`all_m_${t.id}_${period}`}>
                          {DAYS.map(({ key: day }) => {
                            const slot = getTeacherSlotAt(t.id, day, 'MORNING', period);
                            const isCC = (day === 2 && period === 1) || slot?.subjectId === 'SUB_CC' || subjectsMap.get(slot?.subjectId || '')?.code === 'CC';
                            const cls = slot && slot.classId !== 'ALL' ? classesMap.get(slot.classId) : null;
                            const classNameLabel = cls?.code || cls?.name.replace('Lớp ', '') || (slot?.classId !== 'ALL' ? slot?.classId : '');

                            if (isCC) {
                              return (
                                <td
                                  key={day}
                                  className="py-1 border-r border-slate-100 last:border-r-0 font-black h-6 bg-amber-100/90 text-amber-950 text-center text-[9px]"
                                  title="Chào cờ (Toàn trường)"
                                >
                                  <span>🚩 CC</span>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={day}
                                className={`py-1 border-r border-slate-100 last:border-r-0 font-bold h-6 ${
                                  slot ? getClassColorStyle(slot.classId) : ''
                                }`}
                              >
                                {slot ? classNameLabel : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeacherId(t.id);
                    setViewMode('SINGLE');
                  }}
                  className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-black text-xs rounded-xl transition-all cursor-pointer text-center"
                >
                  Xem Chi Tiết Lịch Dạy →
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
