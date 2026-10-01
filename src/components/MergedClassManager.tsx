import React, { useState, useMemo } from 'react';
import {
  SchoolClass,
  Teacher,
  Subject,
  Room,
  TeachingAssignment,
  TimetableSlot,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  PERIODS,
} from '../types/timetable';
import { MergedClassHandler } from '../services/mergedClassHandler';
import { ValidationEngine } from '../services/validationEngine';
import {
  saveAssignmentToFirebase,
  deleteAssignmentFromFirebase,
  saveTimetableSlotsToFirebase,
} from '../services/firebaseClient';
import {
  Layers,
  Users,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  Info,
  Clock,
  School,
  X,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface MergedClassManagerProps {
  classes: SchoolClass[];
  teachers: Teacher[];
  subjects: Subject[];
  rooms: Room[];
  assignments: TeachingAssignment[];
  setAssignments: React.Dispatch<React.SetStateAction<TeachingAssignment[]>>;
  slots: TimetableSlot[];
  setSlots: React.Dispatch<React.SetStateAction<TimetableSlot[]>>;
  onDataUpdated?: () => void;
}

export function MergedClassManager({
  classes,
  teachers,
  subjects,
  rooms,
  assignments,
  setAssignments,
  slots,
  setSlots,
  onDataUpdated,
}: MergedClassManagerProps) {
  // Lọc danh sách các phân công ghép lớp hoặc co-teaching
  const mergedAssignments = useMemo(() => {
    return assignments.filter(
      (a) => a.isMerged || a.classIds.length > 1 || a.teacherIds.length > 1
    );
  }, [assignments]);

  // Form state
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [periodsPerWeek, setPeriodsPerWeek] = useState<number>(2);
  const [requiredRoomType, setRequiredRoomType] = useState<string>('STADIUM');
  const [doublePeriodsAllowed, setDoublePeriodsAllowed] = useState<boolean>(true);
  const [groupNote, setGroupNote] = useState<string>('');

  // UI state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'SUCCESS' | 'ERROR' | 'INFO' } | null>(null);
  const [activeSlotFinderAssignment, setActiveSlotFinderAssignment] = useState<TeachingAssignment | null>(null);
  const [matrixSession, setMatrixSession] = useState<'MORNING' | 'AFTERNOON'>('MORNING');

  // Dialog xác nhận ghép thông minh
  const [mergeConfirmDialog, setMergeConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details?: {
      targetClassNames: string[];
      teacherNames: string[];
      subjectName: string;
      day: DayOfWeek;
      period: PeriodOfDay;
      session: 'MORNING' | 'AFTERNOON';
    };
    onConfirm: () => void;
  } | null>(null);

  // Fast Maps
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const teachersMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const roomsMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const showToast = (text: string, type: 'SUCCESS' | 'ERROR' | 'INFO' = 'SUCCESS') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Tổng sĩ số các lớp được chọn trong form
  const totalStudentsSelected = useMemo(() => {
    return selectedClassIds.reduce((sum, cId) => {
      const cls = classesMap.get(cId);
      return sum + (cls ? cls.studentCount : 40);
    }, 0);
  }, [selectedClassIds, classesMap]);

  // Loại hình ghép được phát hiện tự động theo form
  const groupTypeDescription = useMemo(() => {
    const numClasses = selectedClassIds.length;
    const numTeachers = selectedTeacherIds.length;

    if (numClasses > 1 && numTeachers === 1) {
      return {
        badge: '🎯 1 GV Dạy N Lớp Ghép',
        badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        detail: '1 Giáo viên sẽ dạy đồng thời nhiều lớp cùng một lúc mà không bị báo lỗi trùng tiết.',
      };
    }
    if (numClasses === 1 && numTeachers > 1) {
      return {
        badge: '👥 Co-teaching (2+ GV Cùng Tiết)',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        detail: 'Nhiều Giáo viên cùng tham gia giảng dạy 1 tiết cho lớp (trợ giảng / đồng giảng dạy).',
      };
    }
    if (numClasses > 1 && numTeachers > 1) {
      return {
        badge: '🔥 Ghép N Lớp + Co-teaching',
        badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
        detail: 'Nhiều lớp học gộp chung với nhóm nhiều Giáo viên cùng phối hợp giảng dạy.',
      };
    }
    return {
      badge: 'Lớp Đơn Chuẩn',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      detail: '1 lớp học tiêu chuẩn với 1 giáo viên phụ trách.',
    };
  }, [selectedClassIds, selectedTeacherIds]);

  // Chọn nhanh các lớp theo khối
  const handleSelectByGrade = (grade: 10 | 11 | 12) => {
    const gradeClassIds = classes.filter((c) => c.grade === grade).map((c) => c.id);
    setSelectedClassIds((prev) => Array.from(new Set([...prev, ...gradeClassIds])));
  };

  const handleSelectAllClasses = () => {
    setSelectedClassIds(classes.map((c) => c.id));
  };

  const handleClearSelectedClasses = () => {
    setSelectedClassIds([]);
  };

  const toggleClassSelection = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleTeacherSelection = (teacherId: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
    );
  };

  // Reset form
  const resetForm = () => {
    setEditingAssignmentId(null);
    setSelectedClassIds([]);
    setSelectedSubjectId(subjects[0]?.id || '');
    setSelectedTeacherIds([]);
    setPeriodsPerWeek(2);
    setRequiredRoomType('STADIUM');
    setDoublePeriodsAllowed(true);
    setGroupNote('');
  };

  // Bắt đầu sửa nhóm ghép
  const handleStartEdit = (asg: TeachingAssignment) => {
    setEditingAssignmentId(asg.id);
    setSelectedClassIds(asg.classIds);
    setSelectedSubjectId(asg.subjectId);
    setSelectedTeacherIds(asg.teacherIds);
    setPeriodsPerWeek(asg.periodsPerWeek);
    setRequiredRoomType(asg.requiredRoomType || 'THEORY');
    setDoublePeriodsAllowed(asg.doublePeriodsAllowed);
  };

  // Lưu nhóm ghép lớp
  const handleSaveMergedGroup = async () => {
    if (selectedClassIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 lớp học tham gia!', 'ERROR');
      return;
    }
    if (selectedTeacherIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 giáo viên giảng dạy!', 'ERROR');
      return;
    }
    if (!selectedSubjectId) {
      showToast('Vui lòng chọn môn học!', 'ERROR');
      return;
    }

    const isMerged = selectedClassIds.length > 1;
    const asgId = editingAssignmentId || `ASG_MERGED_${Date.now()}`;

    const newAsg: TeachingAssignment = {
      id: asgId,
      subjectId: selectedSubjectId,
      classIds: selectedClassIds,
      teacherIds: selectedTeacherIds,
      periodsPerWeek,
      requiredRoomType: requiredRoomType as any,
      isMerged: isMerged || selectedTeacherIds.length > 1,
      doublePeriodsAllowed,
      priorityLevel: 1, // Tiết ghép luôn ưu tiên xếp cao nhất
    };

    let updatedAssignments: TeachingAssignment[];
    if (editingAssignmentId) {
      updatedAssignments = assignments.map((a) => (a.id === editingAssignmentId ? newAsg : a));
    } else {
      updatedAssignments = [newAsg, ...assignments];
    }

    setAssignments(updatedAssignments);
    await saveAssignmentToFirebase(newAsg);
    onDataUpdated?.();

    showToast(
      editingAssignmentId
        ? 'Đã cập nhật cấu hình nhóm ghép thành công!'
        : 'Đã tạo nhóm ghép lớp mới và lưu lên Firebase!',
      'SUCCESS'
    );
    resetForm();
  };

  // Xóa nhóm ghép
  const handleDeleteAssignment = async (asgId: string) => {
    // Xóa phân công và gỡ toàn bộ slot đã xếp trên TKB của phân công này
    const updatedAssignments = assignments.filter((a) => a.id !== asgId);
    const updatedSlots = slots.filter((s) => s.assignmentId !== asgId);

    setAssignments(updatedAssignments);
    setSlots(updatedSlots);

    await deleteAssignmentFromFirebase(asgId);
    await saveTimetableSlotsToFirebase(updatedSlots);
    onDataUpdated?.();

    showToast('Đã xóa nhóm ghép và giải phóng các tiết trên TKB!', 'SUCCESS');
  };

  // Đếm số tiết đã xếp trên TKB của phân công ghép
  const getScheduledSlotsCount = (assignmentId: string) => {
    const asgSlots = slots.filter((s) => s.assignmentId === assignmentId);
    const uniqueKeys = new Set(asgSlots.map((s) => `${s.day}_${s.period}`));
    return uniqueKeys.size;
  };

  // Gỡ tất cả các tiết trên TKB của phân công này
  const handleClearSlotsOfAssignment = async (assignmentId: string) => {
    const updatedSlots = slots.filter((s) => s.assignmentId !== assignmentId);
    setSlots(updatedSlots);
    await saveTimetableSlotsToFirebase(updatedSlots);
    onDataUpdated?.();
    showToast('Đã gỡ tất cả các tiết của nhóm ghép khỏi bảng TKB!', 'SUCCESS');
  };

  // ==========================================================================
  // LOGIC TÌM KHUNG GIỜ RẢNH CHUNG (SMART FREE TIME MATRIX FINDER)
  // ==========================================================================
  const checkGroupAvailabilityAt = (
    asg: TeachingAssignment,
    day: DayOfWeek,
    period: PeriodOfDay,
    session: 'MORNING' | 'AFTERNOON' = 'MORNING'
  ) => {
    // 1. Không xếp vào Thứ 2 Tiết 1 Sáng (Chào cờ cố định)
    if (day === 2 && period === 1 && session === 'MORNING') {
      return { available: false, reason: 'Tiết Chào cờ cố định' };
    }

    // 2. Kiểm tra tất cả các lớp tham gia
    for (const cId of asg.classIds) {
      const classSlot = slots.find(
        (s) =>
          ValidationEngine.isSlotAtSameTime(s, day, period, session) &&
          s.subjectId !== 'SUB_OFF' &&
          (s.classId === cId || (s.classIds && s.classIds.includes(cId))) &&
          s.assignmentId !== asg.id
      );
      if (classSlot) {
        const cls = classesMap.get(cId);
        const sub = subjectsMap.get(classSlot.subjectId);
        return {
          available: false,
          reason: `Lớp ${cls?.name || cId} bận học môn ${sub?.name || classSlot.subjectId}`,
        };
      }
    }

    // 3. Kiểm tra tất cả các giáo viên tham gia
    for (const tId of asg.teacherIds) {
      const teacher = teachersMap.get(tId);
      if (teacher && !ValidationEngine.checkTeacherAvailability(teacher, day, period, session)) {
        return {
          available: false,
          reason: `GV ${teacher.name} đã đăng ký bận`,
        };
      }

      const teacherSlot = slots.find(
        (s) =>
          ValidationEngine.isSlotAtSameTime(s, day, period, session) &&
          s.subjectId !== 'SUB_OFF' &&
          (s.teacherId === tId || (s.teacherIds && s.teacherIds.includes(tId))) &&
          s.assignmentId !== asg.id
      );
      if (teacherSlot) {
        const busyCls = classesMap.get(teacherSlot.classId);
        return {
          available: false,
          reason: `GV ${teacher?.name || tId} bận dạy lớp ${busyCls?.name || teacherSlot.classId}`,
        };
      }
    }

    return { available: true, reason: 'Tất cả lớp & GV đều rảnh' };
  };

  // Xếp trực tiếp 1 tiết ghép vào khung giờ (day, period, session)
  const handleAssignMergedSlotDirectly = async (
    asg: TeachingAssignment,
    day: DayOfWeek,
    period: PeriodOfDay,
    session: 'MORNING' | 'AFTERNOON' = 'MORNING'
  ) => {
    const targetClassNames = asg.classIds.map((id) => classesMap.get(id)?.name || id);
    const teacherNames = asg.teacherIds.map((id) => teachersMap.get(id)?.name || id);
    const subjectName = subjectsMap.get(asg.subjectId)?.name || asg.subjectId;
    const sessionLabel = session === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';

    // Hiển thị hộp thoại hỏi xác nhận / cảnh báo xếp lớp ghép
    setMergeConfirmDialog({
      isOpen: true,
      title: '⚠️ Cảnh Báo Xếp Môn Ghép Lớp',
      message: `Cảnh báo: Bạn đang xếp tiết ghép môn "${subjectName}" cho ${asg.classIds.length} lớp (${targetClassNames.join(', ')}) với ${asg.teacherIds.length} giáo viên (${teacherNames.join(', ')}) vào ${sessionLabel} Thứ ${day} Tiết ${period}. Thao tác này sẽ gán đồng thời lịch học cho tất cả ${asg.classIds.length} lớp.`,
      details: {
        targetClassNames,
        teacherNames,
        subjectName,
        day,
        period,
        session,
      },
      onConfirm: async () => {
        // Gỡ các slot cũ nếu có ở các ô này
        const cleanedSlots = slots.filter((s) => {
          if (!ValidationEngine.isSlotAtSameTime(s, day, period, session)) return true;
          // Bỏ slot của các lớp này tại ô đó
          return !asg.classIds.includes(s.classId);
        });

        // Tạo atomic slots cho từng lớp tham gia
        const atomicSlots = MergedClassHandler.createAtomicSlots(
          asg,
          day,
          period,
          rooms[0]?.id || 'R_DEFAULT',
          session
        );

        const finalSlots = [...cleanedSlots, ...atomicSlots];
        setSlots(finalSlots);
        await saveTimetableSlotsToFirebase(finalSlots);
        onDataUpdated?.();

        showToast(
          `✓ Đã xếp thành công tiết ghép cho ${asg.classIds.length} lớp vào ${sessionLabel} Thứ ${day} Tiết ${period}!`,
          'SUCCESS'
        );
        setMergeConfirmDialog(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl font-bold text-xs flex items-center gap-2 border transition-all animate-in fade-in ${
            toastMessage.type === 'SUCCESS'
              ? 'bg-emerald-600 text-white border-emerald-400'
              : toastMessage.type === 'ERROR'
              ? 'bg-rose-600 text-white border-rose-400'
              : 'bg-indigo-600 text-white border-indigo-400'
          }`}
        >
          {toastMessage.type === 'SUCCESS' && <CheckCircle2 className="w-4 h-4" />}
          {toastMessage.type === 'ERROR' && <AlertTriangle className="w-4 h-4" />}
          {toastMessage.type === 'INFO' && <Info className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* HEADER & THỐNG KÊ NHANH */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Quản Lý Ghép Lớp & Đồng Giảng Dạy (Co-teaching)
                </h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Cấu hình 1 giáo viên dạy nhiều lớp cùng lúc (không báo trùng tiết) hoặc 2+ giáo viên cùng dạy 1 tiết
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Nhóm Ghép Mới</span>
            </button>
          </div>
        </div>

        {/* 4 THẺ THỐNG KÊ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <div className="text-[11px] font-bold text-indigo-700">Tổng Nhóm Ghép Lớp</div>
            <div className="text-2xl font-black text-indigo-950 mt-1">
              {mergedAssignments.filter((a) => a.classIds.length > 1).length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] font-bold text-emerald-700">Nhóm Co-teaching (2+ GV)</div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              {mergedAssignments.filter((a) => a.teacherIds.length > 1).length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
            <div className="text-[11px] font-bold text-purple-700">Lớp Đang Tham Gia Ghép</div>
            <div className="text-2xl font-black text-purple-950 mt-1">
              {new Set(mergedAssignments.flatMap((a) => a.classIds)).size} / {classes.length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] font-bold text-amber-700">Tiết Ghép Đã Xếp TKB</div>
            <div className="text-2xl font-black text-amber-950 mt-1">
              {mergedAssignments.reduce((acc, a) => acc + getScheduledSlotsCount(a.id), 0)} tiết
            </div>
          </div>
        </div>
      </div>

      {/* FORM TẠO / SỬA NHÓM GHÉP LỚP */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-slate-900">
              {editingAssignmentId ? 'Chỉnh Sửa Cấu Hình Nhóm Ghép' : 'Thiết Lập Nhóm Ghép Lớp / Co-teaching Mới'}
            </h2>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-black border ${groupTypeDescription.badgeColor}`}>
            {groupTypeDescription.badge}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT 1: CHỌN CÁC LỚP THAM GIA (Multi-select) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <School className="w-4 h-4 text-indigo-600" />
                <span>1. Chọn Các Lớp Gộp Chung ({selectedClassIds.length} lớp đã chọn)</span>
              </label>
            </div>

            {/* Thanh công cụ chọn nhanh theo khối */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleSelectByGrade(10)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              >
                + Khối 10
              </button>
              <button
                type="button"
                onClick={() => handleSelectByGrade(11)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              >
                + Khối 11
              </button>
              <button
                type="button"
                onClick={() => handleSelectByGrade(12)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              >
                + Khối 12
              </button>
              <button
                type="button"
                onClick={handleSelectAllClasses}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-all cursor-pointer"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={handleClearSelectedClasses}
                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-all cursor-pointer"
              >
                Bỏ chọn
              </button>
            </div>

            {/* Danh sách lưới các lớp */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-56 overflow-y-auto">
              {classes.map((c) => {
                const isChecked = selectedClassIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClassSelection(c.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all border text-left cursor-pointer ${
                      isChecked
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{c.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        isChecked ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.studentCount} HS
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between">
              <span>Tổng sĩ số gộp: <strong className="text-indigo-900 font-black">{totalStudentsSelected} học sinh</strong></span>
              <span>Yêu cầu phòng/sân: &ge; {totalStudentsSelected} chỗ</span>
            </div>
          </div>

          {/* CỘT 2: CHỌN MÔN HỌC & GIÁO VIÊN (Co-teaching) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Chọn môn học */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-purple-600" />
                  <span>2. Môn Học Giảng Dạy</span>
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - {s.isHeavy ? 'Môn nặng' : 'Tiêu chuẩn'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Số tiết & Tiết đôi */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>3. Số Tiết Ghép / Tuần</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={periodsPerWeek}
                    onChange={(e) => setPeriodsPerWeek(Number(e.target.value))}
                    className="w-24 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} tiết
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={doublePeriodsAllowed}
                      onChange={(e) => setDoublePeriodsAllowed(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Cho phép Tiết đôi (liền kề)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Chọn Giáo viên (Hỗ trợ 1 hoặc nhiều GV - Co-teaching) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>4. Giáo Viên Phụ Trách ({selectedTeacherIds.length} GV đã chọn)</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-500 lowercase">
                  *Chọn &ge; 2 GV nếu là đồng giảng dạy (Co-teaching)
                </span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                {teachers.map((t) => {
                  const isChecked = selectedTeacherIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTeacherSelection(t.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all border text-left cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 ml-1 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hàng nút Thao tác */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500 font-semibold max-w-sm">
                {groupTypeDescription.detail}
              </div>

              <div className="flex items-center gap-2">
                {editingAssignmentId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-all cursor-pointer"
                  >
                    Hủy sửa
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveMergedGroup}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{editingAssignmentId ? 'Lưu Thay Đổi' : 'Lưu Cấu Hình Nhóm Ghép'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DANH SÁCH CÁC NHÓM GHÉP LỚP & CO-TEACHING HIỆN TẠI */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-slate-900">
              Danh Sách Nhóm Ghép Lớp & Co-teaching Toàn Trường ({mergedAssignments.length} nhóm)
            </h2>
          </div>
        </div>

        {mergedAssignments.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div className="text-sm font-black text-slate-800">Chưa có nhóm ghép lớp nào được tạo</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
              Sử dụng biểu mẫu phía trên để cấu hình các lớp học chung môn (GDQP, Thể Dục, Tiếng Anh) hoặc các tiết có 2 giáo viên cùng dạy.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mergedAssignments.map((asg) => {
              const sub = subjectsMap.get(asg.subjectId);
              const assignedClassObjs = asg.classIds.map((id) => classesMap.get(id)).filter(Boolean) as SchoolClass[];
              const assignedTeacherObjs = asg.teacherIds.map((id) => teachersMap.get(id)).filter(Boolean) as Teacher[];
              const scheduledCount = getScheduledSlotsCount(asg.id);
              const isFullyScheduled = scheduledCount >= asg.periodsPerWeek;

              return (
                <div
                  key={asg.id}
                  className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-300 hover:shadow-md transition-all space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs">
                          {sub?.name || asg.subjectId}
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {asg.periodsPerWeek} tiết/tuần
                        </span>
                        {asg.doublePeriodsAllowed && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Tiết đôi
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-slate-600 mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-400">Lớp tham gia:</span>
                        {assignedClassObjs.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-800 font-extrabold text-[11px]"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(asg)}
                        className="p-2 rounded-lg bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-all cursor-pointer"
                        title="Chỉnh sửa cấu hình"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(asg.id)}
                        className="p-2 rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-all cursor-pointer"
                        title="Xóa nhóm ghép"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body: Danh sách GV & Tiến độ */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-extrabold text-slate-800">
                        {assignedTeacherObjs.map((t) => t.name).join(' & ') || 'Chưa gán GV'}
                      </span>
                      {assignedTeacherObjs.length > 1 && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                          Co-teaching
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                          isFullyScheduled
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        Đã xếp {scheduledCount}/{asg.periodsPerWeek} tiết
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Các nút thao tác xếp lịch */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSlotFinderAssignment(activeSlotFinderAssignment?.id === asg.id ? null : asg)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        activeSlotFinderAssignment?.id === asg.id
                          ? 'bg-purple-700 text-white shadow-xs'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        {activeSlotFinderAssignment?.id === asg.id
                          ? 'Đang mở Ma Trận Rảnh'
                          : '⚡ Tìm Khung Giờ Rảnh Chung'}
                      </span>
                    </button>

                    {scheduledCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearSlotsOfAssignment(asg.id)}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black transition-all border border-rose-200 cursor-pointer"
                        title="Gỡ tất cả các tiết này khỏi TKB"
                      >
                        Gỡ tiết
                      </button>
                    )}
                  </div>

                  {/* MA TRẬN KHUNG GIỜ RẢNH CHUNG (Hiện khi click nút tìm giờ) */}
                  {activeSlotFinderAssignment?.id === asg.id && (
                    <div className="mt-3 p-4 bg-white rounded-xl border-2 border-purple-400 space-y-3 animate-in fade-in">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-purple-950">
                          <Calendar className="w-4 h-4 text-purple-600" />
                          <span>Ma Trận Giờ Rảnh Của Tất Cả Các Bên</span>
                        </div>

                        {/* Nút chuyển Ca Sáng / Ca Chiều */}
                        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setMatrixSession('MORNING')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              matrixSession === 'MORNING'
                                ? 'bg-amber-500 text-white font-black shadow-2xs'
                                : 'text-slate-700 hover:text-slate-900'
                            }`}
                          >
                            ☀️ Buổi Sáng
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixSession('AFTERNOON')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              matrixSession === 'AFTERNOON'
                                ? 'bg-cyan-600 text-white font-black shadow-2xs'
                                : 'text-slate-700 hover:text-slate-900'
                            }`}
                          >
                            🌤️ Buổi Chiều
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-center text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-black">
                              <th className="p-1.5 border border-slate-200">
                                {matrixSession === 'MORNING' ? 'Sáng' : 'Chiều'}
                              </th>
                              {DAYS_OF_WEEK.map((d) => (
                                <th key={d.key} className="p-1.5 border border-slate-200">
                                  {d.short}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PERIODS.map((p) => (
                              <tr key={p.period}>
                                <td className="p-1.5 border border-slate-200 font-black bg-slate-50 text-slate-600">
                                  T{p.period}
                                </td>
                                {DAYS_OF_WEEK.map((d) => {
                                  const avail = checkGroupAvailabilityAt(asg, d.key, p.period, matrixSession);
                                  const isCurrentlyAssignedHere = slots.some(
                                    (s) =>
                                      s.assignmentId === asg.id &&
                                      ValidationEngine.isSlotAtSameTime(s, d.key, p.period, matrixSession)
                                  );

                                  if (isCurrentlyAssignedHere) {
                                    return (
                                      <td
                                        key={d.key}
                                        className="p-1.5 border border-indigo-300 bg-indigo-600 text-white font-black rounded-xs"
                                      >
                                        ✓ Đang học
                                      </td>
                                    );
                                  }

                                  if (avail.available) {
                                    return (
                                      <td key={d.key} className="p-1 border border-slate-200">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAssignMergedSlotDirectly(asg, d.key, p.period, matrixSession)
                                          }
                                          className="w-full py-1.5 px-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-800 font-black text-[11px] transition-all border border-emerald-300 cursor-pointer shadow-2xs"
                                          title="Tất cả các lớp và GV đều rảnh. Bấm để xếp!"
                                        >
                                          + Xếp
                                        </button>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td
                                      key={d.key}
                                      className="p-1.5 border border-slate-200 bg-slate-100 text-slate-400 font-bold text-[10px]"
                                      title={avail.reason}
                                    >
                                      Bận
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL XÁC NHẬN GHÉP THÔNG MINH */}
      {mergeConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">{mergeConfirmDialog.title}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Xếp tiết ghép đồng bộ cho nhiều lớp</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
              <div>{mergeConfirmDialog.message}</div>
              {mergeConfirmDialog.details && (
                <div className="pt-2 border-t border-slate-200 font-semibold space-y-1">
                  <div>• Môn: <strong className="text-indigo-900">{mergeConfirmDialog.details.subjectName}</strong></div>
                  <div>• Lớp: <strong className="text-indigo-900">{mergeConfirmDialog.details.targetClassNames.join(' + ')}</strong></div>
                  <div>• Giáo viên: <strong className="text-indigo-900">{mergeConfirmDialog.details.teacherNames.join(' & ')}</strong></div>
                  <div>• Khung giờ: <strong>Thứ {mergeConfirmDialog.details.day}, Tiết {mergeConfirmDialog.details.period}</strong></div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMergeConfirmDialog(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={mergeConfirmDialog.onConfirm}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Xác Nhận Xếp Ghép</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
