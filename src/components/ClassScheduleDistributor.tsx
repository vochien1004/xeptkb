/**
 * ClassScheduleDistributor.tsx
 * Menu: PHÂN THỜI KHÓA BIỂU (XẾP TKB THEO TỪNG LỚP)
 * 
 * Tính năng chuẩn theo hình thiết kế:
 * 1. Hiển thị TKB theo từng lớp (Sáng 5 tiết, Chiều 4 tiết, Thứ 2 -> Thứ 7)
 * 2. Khi chọn một môn học (Thẻ môn học bên dưới):
 *    - Tự động tô sáng vị trí các tiết đã xếp của môn đó trên TKB lớp (màu hồng phấn)
 *    - Bảng bên phải hiển thị chi tiết giáo viên phụ trách môn đó, kèm mini grid TKB của giáo viên (Sáng/Chiều)
 *    - Kiểm tra xung đột thời gian thực: thấy rõ các tiết GV đã bận ở lớp khác
 * 3. Thao tác tương tác click để xếp tiết, xóa tiết, nút Nghỉ, nút Xóa nhanh môn
 * 4. Hỗ trợ Undo (Quay lại) / Redo (Làm lại), Dồn tiết, Check Nguyện Vọng
 * 5. Tự động đồng bộ và lưu lên Firebase Firestore
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  TimetableSlot,
  SchoolClass,
  Teacher,
  Room,
  Subject,
  TeachingAssignment,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  isSpecialDutySubject,
} from '../types/timetable';
import {
  Wand2,
  RotateCcw,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  Info,
  Clock,
  ChevronRight,
  Filter,
  Users,
  BookOpen,
  ArrowRightLeft,
  X,
  Plus,
  XCircle,
  ShieldAlert,
  Cloud,
  Loader2,
} from 'lucide-react';
import {
  saveTimetableSlotsToFirebase,
  clearTimetableSlotsFromFirebase,
  saveAssignmentToFirebase,
  saveMultipleAssignmentsToFirebase,
} from '../services/firebaseClient';
import { TimetableSolver, UnplacedReminder } from '../services/timetableSolver';
import { MergedClassHandler } from '../services/mergedClassHandler';

interface Props {
  slots: TimetableSlot[];
  setSlots: React.Dispatch<React.SetStateAction<TimetableSlot[]>>;
  classes: SchoolClass[];
  teachers: Teacher[];
  rooms: Room[];
  subjects: Subject[];
  assignments: TeachingAssignment[];
  onDataUpdated?: () => void;
}

// Cấu trúc tiết học hiển thị
const MORNING_PERIODS = [
  { period: 1, time: '7h15 - 8h00', label: 'Tiết 1' },
  { period: 2, time: '8h05 - 8h50', label: 'Tiết 2' },
  { period: 3, time: '9h00 - 9h45', label: 'Tiết 3' },
  { period: 4, time: '9h50 - 10h35', label: 'Tiết 4' },
  { period: 5, time: '10h40 - 11h25', label: 'Tiết 5' },
];

const AFTERNOON_PERIODS = [
  { period: 1, time: '13h30 - 14h15', label: 'Tiết 1' },
  { period: 2, time: '14h20 - 15h05', label: 'Tiết 2' },
  { period: 3, time: '15h20 - 16h05', label: 'Tiết 3' },
  { period: 4, time: '16h10 - 16h55', label: 'Tiết 4' },
];

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 2, label: 'Thứ 2' },
  { key: 3, label: 'Thứ 3' },
  { key: 4, label: 'Thứ 4' },
  { key: 5, label: 'Thứ 5' },
  { key: 6, label: 'Thứ 6' },
  { key: 7, label: 'Thứ 7' },
];

export const ClassScheduleDistributor: React.FC<Props> = ({
  slots,
  setSlots,
  classes,
  teachers,
  rooms,
  subjects,
  assignments,
  onDataUpdated,
}) => {
  // Lựa chọn lớp học đang làm việc
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [viewAllClasses, setViewAllClasses] = useState(false);

  // Tự động load và chọn lớp học có TKB hoặc lớp đầu tiên khi danh sách classes nạp
  useEffect(() => {
    if (classes.length > 0) {
      const isValid = classes.some((c) => c.id === selectedClassId);
      if (!selectedClassId || !isValid) {
        const classWithSlots = classes.find((c) =>
          slots.some((s) => s.classId === c.id || (s.classIds && s.classIds.includes(c.id)))
        );
        setSelectedClassId((classWithSlots || classes[0]).id);
      }
    }
  }, [classes, slots, selectedClassId]);

  // Môn học đang được chọn để xếp / phân bổ
  // { classId, subjectId, teacherId, assignmentId }
  const [selectedSubjectCard, setSelectedSubjectCard] = useState<{
    classId: string;
    subjectId: string;
    teacherId: string;
    assignmentId?: string;
  } | null>(null);

  // Đảm bảo thẻ môn đang chọn luôn thuộc về lớp hiện tại (chỉ hủy nếu thẻ môn không khớp lớp đang chọn)
  useEffect(() => {
    if (selectedSubjectCard && selectedSubjectCard.classId !== selectedClassId) {
      setSelectedSubjectCard(null);
    }
  }, [selectedClassId, selectedSubjectCard]);

  // Chế độ chọn "Nghỉ" để gán tiết nghỉ
  const [isOffMode, setIsOffMode] = useState(false);

  // Cấu hình Toolbar
  const [autoScope, setAutoScope] = useState<'SCHOOL' | 'CLASS'>('CLASS');
  const [maxSubjectPerSession, setMaxSubjectPerSession] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);

  // Toast notification (hỗ trợ SUCCESS, ERROR, WARNING)
  const [toast, setToast] = useState<{
    message: string;
    type: 'SUCCESS' | 'ERROR' | 'WARNING';
  } | null>(null);

  const showToast = (message: string, type: 'SUCCESS' | 'ERROR' | 'WARNING' = 'SUCCESS') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Modal cảnh báo khi vi phạm số tiết PCGD hoặc trùng lịch giáo viên
  const [warningAlert, setWarningAlert] = useState<{
    isOpen: boolean;
    type: 'QUOTA_EXCEEDED' | 'TEACHER_CONFLICT';
    title: string;
    message: string;
    details?: {
      subjectName?: string;
      className?: string;
      scheduledCount?: number;
      assignedPeriods?: number;
      teacherName?: string;
      conflictingClassName?: string;
      conflictingSubjectName?: string;
      day?: number;
      periodNum?: number;
      session?: 'MORNING' | 'AFTERNOON';
    };
  } | null>(null);

  // Modal xác nhận thao tác xóa (Không dùng window.confirm vì bị chặn trên iframe)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmStyle?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  // Modal hiển thị báo cáo & nhắc nhở các môn chưa thể tự động xếp do vướng ràng buộc
  const [autoScheduleReportModal, setAutoScheduleReportModal] = useState<{
    isOpen: boolean;
    targetName: string;
    newlyPlacedCount: number;
    reminders: UnplacedReminder[];
  } | null>(null);

  // Trạng thái lưu trữ TKB đang xếp lên Firebase Cloud
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(new Date());

  // Lịch sử thao tác Undo / Redo
  const [undoStack, setUndoStack] = useState<TimetableSlot[][]>([]);
  const [redoStack, setRedoStack] = useState<TimetableSlot[][]>([]);

  // Maps tra cứu nhanh
  const teachersMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const roomsMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // Đẩy trạng thái vào Undo stack trước khi thay đổi
  const pushUndo = useCallback(
    (currentSlots: TimetableSlot[]) => {
      setUndoStack((prev) => [currentSlots, ...prev.slice(0, 30)]);
      setRedoStack([]);
    },
    []
  );

  // Lưu đồng bộ thời gian thực lên Firebase Firestore và cập nhật chỉ báo Cloud
  const persistSlotsToCloud = async (updatedSlots: TimetableSlot[]) => {
    setIsSavingCloud(true);
    try {
      const res = await saveTimetableSlotsToFirebase(updatedSlots);
      if (res.success) {
        setLastSavedTime(new Date());
      }
      return res;
    } catch (err) {
      console.error('Lỗi khi lưu slots lên Firebase:', err);
      return { success: false, totalWritten: 0 };
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Undo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[0];
    setRedoStack((prev) => [slots, ...prev]);
    setUndoStack((prev) => prev.slice(1));
    setSlots(previous);
    persistSlotsToCloud(previous);
    showToast('Đã hoàn tác thao tác vừa rồi');
  };

  // Redo
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setUndoStack((prev) => [slots, ...prev]);
    setRedoStack((prev) => prev.slice(1));
    setSlots(next);
    persistSlotsToCloud(next);
    showToast('Đã làm lại thao tác');
  };

  // Lọc danh sách lớp
  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return classes;
    const q = searchQuery.toLowerCase();
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
  }, [classes, searchQuery]);

  // Danh sách lớp hiển thị: nếu viewAllClasses thì hiển thị tất cả, không thì chỉ lớp được chọn
  const activeClasses = useMemo(() => {
    if (viewAllClasses) return filteredClasses;
    const target = classes.find((c) => c.id === selectedClassId);
    return target ? [target] : filteredClasses.slice(0, 1);
  }, [viewAllClasses, filteredClasses, selectedClassId, classes]);

  // Tìm slot tại một ô cụ thể
  const getSlot = (
    classId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ): TimetableSlot | undefined => {
    return slots.find((s) => {
      // 1. Slot phải thuộc về đúng lớp classId này (hoặc tiết ghép chứa classId)
      const belongsToClass =
        s.classId === classId || (Array.isArray(s.classIds) && s.classIds.includes(classId));
      if (!belongsToClass) return false;
      if (s.day !== day) return false;

      // 2. Chuẩn hóa session và periodNum của slot
      const sSession = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriodNum = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);

      return sSession === session && sPeriodNum === periodNum;
    });
  };

  // Lấy các phân công của một lớp học (bao gồm cả phân công đơn và phân công dạy ghép N lớp)
  const getClassAssignments = (classId: string) => {
    return assignments.filter((a) => {
      if (a.classIds && Array.isArray(a.classIds) && a.classIds.includes(classId)) return true;
      if ((a as any).classId && (a as any).classId === classId) return true;
      return false;
    });
  };

  // Tìm hoặc định nghĩa môn Sinh Hoạt Lớp (GVCN)
  const shlSubject = useMemo(() => {
    return (
      subjects.find(
        (s) =>
          s.code === 'SHL' ||
          s.id === 'SUB_SHL' ||
          s.name.toLowerCase().includes('sinh hoạt')
      ) || {
        id: 'SUB_SHL',
        code: 'SHL',
        name: 'Sinh Hoạt Lớp (GVCN)',
        shortName: 'Sinh hoạt',
        isHeavy: false,
        preferredShift: 'ANY' as const,
      }
    );
  }, [subjects]);

  // Tìm hoặc định nghĩa môn Chào Cờ (Cố định Thứ 2 Tiết 1)
  const ccSubject = useMemo(() => {
    return (
      subjects.find(
        (s) =>
          s.code === 'CC' ||
          s.id === 'SUB_CC' ||
          s.name.toLowerCase().includes('chào cờ')
      ) || {
        id: 'SUB_CC',
        code: 'CC',
        name: 'Chào Cờ',
        shortName: 'Chào cờ',
        isHeavy: false,
        preferredShift: 'MORNING' as const,
      }
    );
  }, [subjects]);

  // Đếm số tiết đã xếp của môn học trong lớp (hỗ trợ tiết ghép, không bị đếm trùng)
  const getScheduledCountForSubjectInClass = (classId: string, subjectId: string) => {
    const isShlTarget =
      subjectId === shlSubject.id ||
      subjectId === 'SUB_SHL' ||
      subjectsMap.get(subjectId)?.code === 'SHL' ||
      subjectsMap.get(subjectId)?.name.toLowerCase().includes('sinh hoạt');

    const matchingSlots = slots.filter((s) => {
      if (s.subjectId === 'SUB_OFF') return false;
      const belongsToClass =
        s.classId === classId || (Array.isArray(s.classIds) && s.classIds.includes(classId));
      if (!belongsToClass) return false;

      if (isShlTarget) {
        return (
          s.subjectId === shlSubject.id ||
          s.subjectId === 'SUB_SHL' ||
          subjectsMap.get(s.subjectId)?.code === 'SHL' ||
          subjectsMap.get(s.subjectId)?.name.toLowerCase().includes('sinh hoạt') ||
          (s.assignmentId && s.assignmentId.toLowerCase().includes('shl')) ||
          (s.assignmentId && s.assignmentId.toLowerCase().includes('sinh'))
        );
      }
      return s.subjectId === subjectId;
    });

    // Loại bỏ đếm đúp đối với tiết ghép bằng cách lọc theo các khung giờ (Thứ, Tiết, Ca) duy nhất
    const uniqueTimeSlots = new Set(
      matchingSlots.map((s) => {
        const sess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const pNorm = s.period <= 5 ? s.period : s.period - 5;
        return `${s.day}_${pNorm}_${sess}`;
      })
    );

    return uniqueTimeSlots.size;
  };

  // Kiểm tra xem giáo viên có bị trùng lịch dạy ở bất kỳ lớp nào khác trong toàn trường không
  const checkTeacherConflictAt = (
    teacherId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number,
    currentClassId: string,
    ignoreSlotId?: string
  ): TimetableSlot | undefined => {
    return slots.find((s) => {
      if (ignoreSlotId && s.id === ignoreSlotId) return false;
      if (s.day !== day) return false;
      if (s.subjectId === 'SUB_OFF') return false;

      // Chỉ xét các lớp khác
      const isOtherClass = s.classId !== currentClassId && (!s.classIds || !s.classIds.includes(currentClassId));
      if (!isOtherClass) return false;

      // Chuẩn hóa kiểm tra session và period
      const isMorning = s.session ? s.session === 'MORNING' : s.period <= 5;
      const sPeriodNum = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      const sSession = isMorning ? 'MORNING' : 'AFTERNOON';

      if (sSession !== session || sPeriodNum !== periodNum) return false;

      // Kiểm tra giáo viên trùng lặp
      return s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId));
    });
  };

  // Kiểm tra giáo viên có đăng ký lịch bận/nguyện vọng nghỉ cố định hay không (tách biệt Sáng / Chiều)
  const isTeacherUnavailable = (
    teacherId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ): boolean => {
    if (!teacherId) return false;
    const teacher = teachersMap.get(teacherId);
    if (!teacher || !teacher.unavailableSlots || teacher.unavailableSlots.length === 0) {
      return false;
    }
    return teacher.unavailableSlots.some((u) => {
      if (u.day !== day) return false;
      const uPeriod = u.period <= 5 ? u.period : ((u.period - 1) % 5) + 1;
      const targetPeriod = periodNum <= 5 ? periodNum : ((periodNum - 1) % 5) + 1;
      if (uPeriod !== targetPeriod) return false;

      const uSession = u.session || (u.period > 5 ? 'AFTERNOON' : 'MORNING');
      return uSession === session;
    });
  };

  // Tự động kiểm tra và dọn dẹp các môn không có trong PCGD của lớp (ví dụ do nạp nhầm từ cache)
  useEffect(() => {
    if (classes.length === 0 || assignments.length === 0 || slots.length === 0) return;

    const validClassIds = new Set(classes.map((c) => c.id));
    const classSubjectMap = new Map<string, Set<string>>();
    assignments.forEach((a) => {
      if (Array.isArray(a.classIds)) {
        a.classIds.forEach((cId) => {
          if (!classSubjectMap.has(cId)) classSubjectMap.set(cId, new Set());
          classSubjectMap.get(cId)!.add(a.subjectId);
        });
      }
      if ((a as any).classId) {
        const cId = (a as any).classId;
        if (!classSubjectMap.has(cId)) classSubjectMap.set(cId, new Set());
        classSubjectMap.get(cId)!.add(a.subjectId);
      }
    });

    const cleaned = slots.filter((slot) => {
      if (slot.subjectId === 'SUB_OFF') return true;
      if (
        slot.subjectId === 'SUB_CC' ||
        slot.subjectId === 'SUB_SHL' ||
        slot.subjectId === ccSubject.id ||
        slot.subjectId === shlSubject.id ||
        slot.assignmentId?.startsWith('ASG_CC_') ||
        slot.assignmentId?.startsWith('ASG_SHL_')
      ) {
        return true;
      }
      const cId = slot.classId;
      if (!validClassIds.has(cId)) return false;
      const allowed = classSubjectMap.get(cId);
      return allowed ? allowed.has(slot.subjectId) : false;
    });

    if (cleaned.length < slots.length) {
      console.warn(`[ClassScheduleDistributor] Đã loại bỏ ${slots.length - cleaned.length} tiết không có trong PCGD của lớp!`);
      setSlots(cleaned);
      persistSlotsToCloud(cleaned);
      onDataUpdated?.();
    }
  }, [classes, assignments, slots.length, ccSubject.id, shlSubject.id]);

  // Thao tác khi click vào một ô trong bảng TKB lớp
  const handleCellClick = async (
    classId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ) => {
    const existingSlot = getSlot(classId, day, session, periodNum);

    // 1. Chế độ gán "Nghỉ"
    if (isOffMode) {
      pushUndo(slots);
      let newSlots: TimetableSlot[];
      if (existingSlot && existingSlot.subjectId === 'SUB_OFF') {
        // Nếu đã là Nghỉ -> Hủy nghỉ
        newSlots = slots.filter((s) => s.id !== existingSlot.id);
        showToast(`Đã xóa tiết Nghỉ tại ${session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day} Tiết ${periodNum}`);
      } else {
        // Xóa slot cũ nếu có, thêm slot SUB_OFF
        const filtered = existingSlot ? slots.filter((s) => s.id !== existingSlot.id) : [...slots];
        const offSlot: TimetableSlot = {
          id: `SLOT_OFF_${classId}_${day}_${session}_${periodNum}_${Date.now()}`,
          day,
          period: periodNum as PeriodOfDay,
          session,
          classId,
          teacherId: '',
          roomId: '',
          assignmentId: '',
          subjectId: 'SUB_OFF',
          isMerged: false,
          isCoTeaching: false,
        };
        newSlots = [...filtered, offSlot];
        showToast(`Đã gán tiết Nghỉ tại ${session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day} Tiết ${periodNum}`);
      }
      setSlots(newSlots);
      await persistSlotsToCloud(newSlots);
      onDataUpdated?.();
      return;
    }

    // 2. Nếu đang chọn một môn học từ thẻ môn học bên dưới
    if (selectedSubjectCard) {
      const { subjectId, teacherId, assignmentId } = selectedSubjectCard;
      const isShl =
        subjectId === shlSubject.id ||
        subjectId === 'SUB_SHL' ||
        subjectsMap.get(subjectId)?.code === 'SHL' ||
        subjectsMap.get(subjectId)?.name.toLowerCase().includes('sinh hoạt');

      // Nếu click vào ô đã có chính môn này (hoặc chính môn Sinh hoạt) -> Xóa/gỡ tiết này (giảm số tiết)
      const isSameSubject =
        existingSlot &&
        (existingSlot.subjectId === subjectId ||
          (isShl &&
            (existingSlot.subjectId === shlSubject.id ||
              existingSlot.subjectId === 'SUB_SHL' ||
              subjectsMap.get(existingSlot.subjectId)?.code === 'SHL' ||
              subjectsMap.get(existingSlot.subjectId)?.name.toLowerCase().includes('sinh hoạt'))));

      if (isSameSubject && existingSlot) {
        pushUndo(slots);
        const newSlots = slots.filter((s) => s.id !== existingSlot.id);
        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        const subName = isShl ? 'Sinh hoạt' : (subjectsMap.get(subjectId)?.shortName || subjectsMap.get(subjectId)?.name || subjectId);
        showToast(`Đã gỡ tiết môn ${subName} khỏi ${session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ ${day} Tiết ${periodNum}`);
        return;
      }

      const subObj = subjectsMap.get(subjectId) || (isShl ? shlSubject : null);
      const subName = isShl ? 'Sinh hoạt' : (subObj?.name || subjectId);
      const subShort = isShl ? 'Sinh hoạt' : (subObj?.shortName || subName);
      const classObj = classesMap.get(classId);
      const className = classObj?.name || classId;

      const isExistingCC =
        existingSlot &&
        (existingSlot.subjectId === 'SUB_CC' ||
          existingSlot.subjectId === ccSubject.id ||
          subjectsMap.get(existingSlot.subjectId)?.code === 'CC' ||
          subjectsMap.get(existingSlot.subjectId)?.name.toLowerCase().includes('chào cờ'));

      // -----------------------------------------------------------------
      // RÀNG BUỘC CẤU HÌNH BUỔI HỌC CỦA MÔN HỌC (preferredShift)
      // -----------------------------------------------------------------
      if (subObj?.preferredShift) {
        if (subObj.preferredShift === 'MORNING' && session === 'AFTERNOON') {
          showToast(
            `⚠️ Môn "${subName}" được cấu hình học BUỔI SÁNG (theo dữ liệu cấu hình môn học trong phần Nhập thông tin). Không thể xếp vào Buổi Chiều!`,
            'WARNING'
          );
          return;
        }
        if (subObj.preferredShift === 'AFTERNOON' && session === 'MORNING') {
          showToast(
            `⚠️ Môn "${subName}" được cấu hình học BUỔI CHIỀU (theo dữ liệu cấu hình môn học trong phần Nhập thông tin). Không thể xếp vào Buổi Sáng!`,
            'WARNING'
          );
          return;
        }
      }

      // -----------------------------------------------------------------
      // RÀNG BUỘC 0 & 1: KIỂM TRA MÔN HỌC CÓ NẰM TRONG PCGD VÀ CHƯA VƯỢT QUÁ SỐ TIẾT
      // -----------------------------------------------------------------
      const targetAsg = assignments.find(
        (a) =>
          ((a.classIds && a.classIds.includes(classId)) || (a as any).classId === classId) &&
          (a.subjectId === subjectId ||
            (isShl &&
              (a.subjectId === 'SUB_SHL' ||
                a.subjectId === shlSubject.id ||
                subjectsMap.get(a.subjectId)?.code === 'SHL' ||
                subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt'))))
      );

      // Nếu môn này hoàn toàn không có trong PCGD của lớp (và không phải Sinh hoạt lớp) -> Báo lỗi & Chặn!
      if (!targetAsg && !isShl) {
        showToast(
          `⚠️ Môn "${subName}" không có trong Phân công giảng dạy của lớp ${className}! Không thể xếp vào lớp này.`,
          'ERROR'
        );
        return;
      }

      const assignedPeriods = targetAsg?.periodsPerWeek ?? (isShl ? 1 : 0);
      const currentScheduledCount = getScheduledCountForSubjectInClass(classId, subjectId);

      if (assignedPeriods > 0 && currentScheduledCount >= assignedPeriods) {
        const errorMsg = `Đã xếp đủ số tiết môn ${subName} cho lớp ${className}`;
        showToast(`⚠️ ${errorMsg}! (${currentScheduledCount}/${assignedPeriods} tiết)`, 'ERROR');
        setWarningAlert({
          isOpen: true,
          type: 'QUOTA_EXCEEDED',
          title: `Đã Xếp Đủ Số Tiết Phân Công Chuyên Môn`,
          message: `${errorMsg}. Không thể xếp thêm!`,
          details: {
            subjectName: subName,
            className: className,
            scheduledCount: currentScheduledCount,
            assignedPeriods: assignedPeriods,
          },
        });
        return; // KHÔNG CHO PHÉP THỰC HIỆN!
      }

      // -----------------------------------------------------------------
      // CẢNH BÁO XẾP MÔN GHÉP LỚP: NẾU PHÂN CÔNG NÀY LÀ MÔN GHÉP N LỚP
      // -----------------------------------------------------------------
      const isMergedAssignment =
        targetAsg &&
        ((targetAsg.classIds && targetAsg.classIds.length > 1) || (targetAsg as any).isMerged);

      if (isMergedAssignment && targetAsg) {
        const targetClassNames = targetAsg.classIds.map(
          (id) => classesMap.get(id)?.name || id
        );
        const teacherNames = targetAsg.teacherIds.map(
          (id) => teachersMap.get(id)?.name || id
        );
        const sessionLabel = session === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';

        setConfirmDialog({
          isOpen: true,
          title: `⚠️ Cảnh Báo Xếp Môn Ghép Lớp`,
          message: `Cảnh báo: Môn "${subName}" là môn GHÉP LỚP cho ${targetAsg.classIds.length} lớp (${targetClassNames.join(', ')}) do giáo viên ${teacherNames.join(', ')} giảng dạy. Khi xếp tiết này vào Thứ ${day} Tiết ${periodNum} (${sessionLabel}), hệ thống sẽ gán đồng thời lịch học cho tất cả các lớp tham gia ghép. Bạn có chắc chắn muốn tiếp tục không?`,
          confirmLabel: `🔗 Đồng Ý Xếp Lớp Ghép (${targetClassNames.join(' + ')})`,
          confirmStyle: 'primary',
          onConfirm: async () => {
            pushUndo(slots);

            // Gỡ các slot cũ tại ô này ở tất cả các lớp tham gia ghép
            const cleanedSlots = slots.filter((s) => {
              const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
              const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
              if (s.day === day && sSess === session && sPeriod === periodNum) {
                return !targetAsg.classIds.includes(s.classId);
              }
              return true;
            });

            // Tạo atomic slots cho từng lớp tham gia
            const atomicSlots = MergedClassHandler.createAtomicSlots(
              targetAsg,
              day,
              periodNum as PeriodOfDay,
              rooms[0]?.id || 'R_DEFAULT',
              session
            );

            const finalSlots = [...cleanedSlots, ...atomicSlots];
            setSlots(finalSlots);
            await persistSlotsToCloud(finalSlots);
            onDataUpdated?.();

            showToast(
              `✓ Đã xếp thành công tiết ghép môn ${subShort} cho ${targetAsg.classIds.length} lớp (${targetClassNames.join(', ')}) vào Thứ ${day} Tiết ${periodNum}!`,
              'SUCCESS'
            );
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // RÀNG BUỘC 2: KIỂM TRA TIẾT ĐÓ Ở TẤT CẢ CÁC LỚP KHÁC CÓ TRÙNG VỚI
      // TIẾT ĐANG CHỌN CỦA GIÁO VIÊN (HOẶC GVCN) HAY KHÔNG
      // -----------------------------------------------------------------
      const actualTeacherId =
        teacherId ||
        (isShl ? (classObj?.homeroomTeacherId || targetAsg?.teacherIds[0] || '') : '');

      const teacherConflict = actualTeacherId
        ? checkTeacherConflictAt(
            actualTeacherId,
            day,
            session,
            periodNum,
            classId,
            existingSlot?.id
          )
        : undefined;

      if (teacherConflict) {
        const busyClass = classesMap.get(teacherConflict.classId)?.name || teacherConflict.classId;
        const busySubject = subjectsMap.get(teacherConflict.subjectId)?.name || teacherConflict.subjectId;
        const teacherName = teachersMap.get(actualTeacherId)?.name || 'Giáo viên';
        const sessionLabel = session === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';

        // HIỂN THỊ BẢNG HỎI XÁC NHẬN GHÉP LỚP THÔNG MINH
        setConfirmDialog({
          isOpen: true,
          title: `⚠️ Cảnh Báo Ghép Lớp Giảng Dạy`,
          message: `Cảnh báo: Tiết này đã tồn tại ở lớp ${busyClass} (Môn: ${busySubject}, GV: ${teacherName} tại Thứ ${day} Tiết ${periodNum} - ${sessionLabel}). Bạn có muốn xếp ghép lớp ${className} với lớp ${busyClass} để 1 giáo viên dạy cùng lúc không?`,
          confirmLabel: `🔗 Ghép 2 Lớp (${className} + ${busyClass})`,
          confirmStyle: 'primary',
          onConfirm: async () => {
            pushUndo(slots);
            const sharedAssignmentId = teacherConflict.assignmentId || assignmentId || `ASG_MERGE_${Date.now()}`;
            const mergedClassIds = Array.from(
              new Set([
                classId,
                teacherConflict.classId,
                ...(teacherConflict.classIds || []),
              ])
            );

            // Cập nhật slot của lớp bị trùng để chuyển sang chế độ ghép
            const updatedExistingSlots = slots.map((s) => {
              if (s.id === teacherConflict.id) {
                return {
                  ...s,
                  isMerged: true,
                  assignmentId: sharedAssignmentId,
                  classIds: mergedClassIds,
                };
              }
              return s;
            });

            // Xóa slot cũ tại ô này (nếu có)
            const baseSlots = existingSlot
              ? updatedExistingSlots.filter((s) => s.id !== existingSlot.id)
              : updatedExistingSlots;

            // Tạo slot ghép cho lớp hiện tại
            const newSlot: TimetableSlot = {
              id: `SLOT_${classId}_${day}_${session}_${periodNum}_${Date.now()}`,
              day,
              period: periodNum as PeriodOfDay,
              session,
              classId,
              classIds: mergedClassIds,
              teacherId: actualTeacherId,
              roomId: teacherConflict.roomId || rooms[0]?.id || 'R_DEFAULT',
              assignmentId: sharedAssignmentId,
              subjectId: isShl ? shlSubject.id : (subjectId || teacherConflict.subjectId),
              isMerged: true,
              isCoTeaching: teacherConflict.isCoTeaching || false,
            };

            const finalSlots = [...baseSlots, newSlot];
            setSlots(finalSlots);
            await persistSlotsToCloud(finalSlots);
            onDataUpdated?.();

            showToast(
              `✓ Đã ghép thành công lớp ${className} và ${busyClass} (GV ${teacherName}) vào Thứ ${day} Tiết ${periodNum}!`,
              'SUCCESS'
            );
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // RÀNG BUỘC 2.5: NẾU Ô ĐÃ CÓ GV VÀ NGƯỜI DÙNG MUỐN THÊM GV (CO-TEACHING)
      // -----------------------------------------------------------------
      if (
        existingSlot &&
        existingSlot.teacherId &&
        actualTeacherId &&
        existingSlot.teacherId !== actualTeacherId &&
        existingSlot.subjectId !== 'SUB_OFF' &&
        !isExistingCC
      ) {
        const currentTeacherName = teachersMap.get(existingSlot.teacherId)?.name || 'GV 1';
        const newTeacherName = teachersMap.get(actualTeacherId)?.name || 'GV 2';

        setConfirmDialog({
          isOpen: true,
          title: `Cấu Hình Đồng Giảng Dạy (Co-teaching)`,
          message: `Tiết này ở lớp ${className} đã có giáo viên ${currentTeacherName} giảng dạy. Bạn có muốn xếp 2 giáo viên (${currentTeacherName} và ${newTeacherName}) cùng dạy một lúc (Co-teaching) không?`,
          confirmLabel: `👥 Đồng Ý 2 GV Cùng Dạy (Co-teaching)`,
          confirmStyle: 'primary',
          onConfirm: async () => {
            pushUndo(slots);
            const mergedTeacherIds = Array.from(
              new Set([
                existingSlot.teacherId,
                actualTeacherId,
                ...(existingSlot.teacherIds || []),
              ])
            );

            const baseSlots = slots.filter((s) => s.id !== existingSlot.id);
            const coTeachingSlot: TimetableSlot = {
              ...existingSlot,
              teacherId: existingSlot.teacherId,
              teacherIds: mergedTeacherIds,
              isCoTeaching: true,
            };

            const finalSlots = [...baseSlots, coTeachingSlot];
            setSlots(finalSlots);
            await persistSlotsToCloud(finalSlots);
            onDataUpdated?.();

            showToast(
              `✓ Đã cấu hình 2 GV (${currentTeacherName} & ${newTeacherName}) cùng dạy Thứ ${day} Tiết ${periodNum} lớp ${className}!`,
              'SUCCESS'
            );
          },
        });
        return;
      }

      // Nếu ô đang là tiết Chào cờ cố định Thứ 2 Tiết 1, xác nhận xóa Chào cờ để thế chỗ môn này
      if (isExistingCC && day === 2 && session === 'MORNING' && periodNum === 1) {
        setConfirmDialog({
          isOpen: true,
          title: `Xếp môn vào tiết Chào cờ - Lớp ${className}`,
          message: `Tiết 1 sáng Thứ 2 là tiết Chào cờ cố định. Bạn có chắc muốn xóa tiết Chào cờ tuần này để xếp môn ${subName} vào đây không?`,
          confirmLabel: `Xếp môn ${subName}`,
          confirmStyle: 'primary',
          onConfirm: async () => {
            pushUndo(slots);
            const baseSlots = slots.filter((s) => s.id !== existingSlot.id);
            const newSlot: TimetableSlot = {
              id: `SLOT_${classId}_${day}_${session}_${periodNum}_${Date.now()}`,
              day,
              period: periodNum as PeriodOfDay,
              session,
              classId,
              teacherId: actualTeacherId,
              roomId: rooms[0]?.id || 'R_DEFAULT',
              assignmentId: assignmentId || targetAsg?.id || (isShl ? `ASG_SHL_${classId}` : ''),
              subjectId: isShl ? shlSubject.id : subjectId,
              isMerged: false,
              isCoTeaching: false,
            };
            const newSlots = [...baseSlots, newSlot];
            setSlots(newSlots);
            await persistSlotsToCloud(newSlots);
            onDataUpdated?.();
            showToast(
              `Đã xếp môn ${subShort} vào Thứ 2 Tiết 1 lớp ${className} (${currentScheduledCount + 1}/${assignedPeriods} tiết)`,
              'SUCCESS'
            );
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // RÀNG BUỘC KHI XẾP: KIỂM TRA LỊCH BẬN / NGUYỆN VỌNG NGHĨ CỦA GIÁO VIÊN
      // -----------------------------------------------------------------
      const isTeacherBusy = actualTeacherId
        ? isTeacherUnavailable(actualTeacherId, day, session, periodNum)
        : false;

      if (isTeacherBusy && actualTeacherId) {
        const teacherObj = teachersMap.get(actualTeacherId);
        const teacherName = teacherObj?.name || 'Giáo viên';
        const sessionLabel = session === 'MORNING' ? 'Buổi Sáng' : 'Buổi Chiều';

        setConfirmDialog({
          isOpen: true,
          title: `⚠️ Cảnh Báo Lịch Bận / Nguyện Vọng Nghỉ`,
          message: `Tiết này (Thứ ${day} Tiết ${periodNum} - ${sessionLabel}) giáo viên ${teacherName} (${teacherObj?.shortName || teacherObj?.code || ''}) đã đăng ký lịch bận.\n\nTiết này GV có nguyện vọng nghỉ, bạn có muốn xếp không?`,
          confirmLabel: `⚠️ Xác Nhận Xếp Tiết Này`,
          confirmStyle: 'danger',
          onConfirm: async () => {
            pushUndo(slots);
            const baseSlots = existingSlot ? slots.filter((s) => s.id !== existingSlot.id) : [...slots];
            const newSlot: TimetableSlot = {
              id: `SLOT_${classId}_${day}_${session}_${periodNum}_${Date.now()}`,
              day,
              period: periodNum as PeriodOfDay,
              session,
              classId,
              teacherId: actualTeacherId,
              roomId: rooms[0]?.id || 'R_DEFAULT',
              assignmentId: assignmentId || targetAsg?.id || (isShl ? `ASG_SHL_${classId}` : ''),
              subjectId: isShl ? shlSubject.id : subjectId,
              isMerged: false,
              isCoTeaching: false,
            };
            const newSlots = [...baseSlots, newSlot];
            setSlots(newSlots);
            await persistSlotsToCloud(newSlots);
            onDataUpdated?.();
            showToast(
              `Đã xếp môn ${subShort} vào Thứ ${day} Tiết ${periodNum} (GV ${teacherName} có nguyện vọng nghỉ) (${currentScheduledCount + 1}/${assignedPeriods} tiết)`
            );
          },
        });
        return;
      }

      pushUndo(slots);

      // Xóa slot cũ ở ô này (nếu có môn khác hoặc SUB_OFF)
      const baseSlots = existingSlot ? slots.filter((s) => s.id !== existingSlot.id) : [...slots];

      const newSlot: TimetableSlot = {
        id: `SLOT_${classId}_${day}_${session}_${periodNum}_${Date.now()}`,
        day,
        period: periodNum as PeriodOfDay,
        session,
        classId,
        teacherId: actualTeacherId,
        roomId: rooms[0]?.id || 'R_DEFAULT',
        assignmentId: assignmentId || targetAsg?.id || (isShl ? `ASG_SHL_${classId}` : ''),
        subjectId: isShl ? shlSubject.id : subjectId,
        isMerged: false,
        isCoTeaching: false,
      };

      const newSlots = [...baseSlots, newSlot];
      setSlots(newSlots);
      await persistSlotsToCloud(newSlots);
      onDataUpdated?.();

      // Nếu là môn Sinh hoạt lớp, đảm bảo phân công giảng dạy SHL cũng được tạo & lưu ngay lên Firebase
      if (isShl && actualTeacherId) {
        const existingShlAsg = assignments.find(
          (a) =>
            (a.classIds.includes(classId) || (a as any).classId === classId) &&
            (a.subjectId === shlSubject.id ||
              a.subjectId === 'SUB_SHL' ||
              subjectsMap.get(a.subjectId)?.code === 'SHL' ||
              subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt'))
        );
        if (!existingShlAsg) {
          const newAsg: TeachingAssignment = {
            id: `ASG_SHL_${classId}`,
            subjectId: shlSubject.id || 'SUB_SHL',
            teacherIds: [actualTeacherId],
            classIds: [classId],
            periodsPerWeek: 1,
            requiredRoomType: 'THEORY',
            isMerged: false,
            doublePeriodsAllowed: false,
            preferredDay: day,
            priorityLevel: 10,
          };
          saveAssignmentToFirebase(newAsg);
        }
      }

      showToast(
        `Đã xếp môn ${subShort} vào Thứ ${day} Tiết ${periodNum} (${currentScheduledCount + 1}/${assignedPeriods} tiết)`
      );
      return;
    }

    // 3. Nếu chưa chọn môn học mà click vào ô Chào cờ -> mở popup tùy chọn xóa Chào cờ
    const isClickOnCC =
      existingSlot &&
      (existingSlot.subjectId === 'SUB_CC' ||
        existingSlot.subjectId === ccSubject.id ||
        subjectsMap.get(existingSlot.subjectId)?.code === 'CC' ||
        subjectsMap.get(existingSlot.subjectId)?.name.toLowerCase().includes('chào cờ'));

    if (isClickOnCC) {
      handleClearChaoCo(classId);
      return;
    }

    // 4. Nếu chưa chọn môn học mà click vào ô trống Thứ 2 Tiết 1 -> khôi phục lại Chào cờ
    if (!existingSlot && day === 2 && session === 'MORNING' && periodNum === 1) {
      handleRestoreChaoCo(classId);
      return;
    }

    // 5. Nếu click vào ô có môn -> tự động chọn môn đó
    if (existingSlot && existingSlot.subjectId !== 'SUB_OFF') {
      setSelectedSubjectCard({
        classId,
        subjectId: existingSlot.subjectId,
        teacherId: existingSlot.teacherId,
        assignmentId: existingSlot.assignmentId,
      });
      setIsOffMode(false);
    }
  };

  // Lưu thủ công toàn bộ TKB đang xếp lên Firebase Firestore
  const handleManualSaveCloud = async () => {
    setIsSavingCloud(true);
    try {
      const res = await saveTimetableSlotsToFirebase(slots);
      if (res.success) {
        setLastSavedTime(new Date());
        showToast(
          `✓ Đã lưu trữ ${slots.length} tiết TKB (${classes.length} lớp) lên Firebase Firestore thành công!`,
          'SUCCESS'
        );
        onDataUpdated?.();
      } else {
        showToast('Có lỗi khi lưu lên Firebase Firestore. Vui lòng thử lại!', 'ERROR');
      }
    } catch (e: any) {
      showToast(`Lỗi: ${e.message}`, 'ERROR');
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Xóa toàn bộ tiết của một môn trong lớp (Gắn sự kiện cho nút thùng rác trên thẻ môn học)
  const handleClearSubjectInClass = (classId: string, subjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isShl =
      subjectId === shlSubject.id ||
      subjectId === 'SUB_SHL' ||
      subjectsMap.get(subjectId)?.code === 'SHL' ||
      subjectsMap.get(subjectId)?.name.toLowerCase().includes('sinh hoạt');

    const count = getScheduledCountForSubjectInClass(classId, subjectId);
    const subName = isShl ? 'Sinh hoạt' : (subjectsMap.get(subjectId)?.name || subjectId);
    const clsName = classesMap.get(classId)?.name || classId;

    if (count === 0) {
      showToast(`Môn "${subName}" chưa có tiết nào được xếp trong lớp ${clsName}!`, 'WARNING');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `Xác nhận xóa tiết môn ${subName}`,
      message: `Bạn có chắc chắn muốn xóa tất cả ${count} tiết môn "${subName}" của lớp ${clsName}? Thao tác này sẽ lưu ngay lên Firebase và có thể hoàn tác bằng nút "Quay lại".`,
      confirmLabel: `Xóa ${count} tiết môn ${subName}`,
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        const newSlots = slots.filter((s) => {
          if (s.classId !== classId) return true;
          if (isShl) {
            return !(
              s.subjectId === shlSubject.id ||
              s.subjectId === 'SUB_SHL' ||
              subjectsMap.get(s.subjectId)?.code === 'SHL' ||
              subjectsMap.get(s.subjectId)?.name.toLowerCase().includes('sinh hoạt')
            );
          }
          return s.subjectId !== subjectId;
        });
        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        showToast(`✓ Đã xóa ${count} tiết môn ${subName} của lớp ${clsName} và lưu lên Firebase!`, 'SUCCESS');
      },
    });
  };

  // Xóa tiết Chào cờ (Thứ 2 Tiết 1) của 1 lớp kèm tùy chọn tự động đẩy các tiết sau lên
  const handleClearChaoCo = (classId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const clsName = classesMap.get(classId)?.name || classId;

    // Kiểm tra xem lớp này có các tiết 2, 3, 4, 5 sáng Thứ 2 phía sau không
    const followingMorningSlots = slots.filter((s) => {
      const match = s.classId === classId;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return match && s.day === 2 && sSess === 'MORNING' && sPeriod > 1 && s.subjectId !== 'SUB_OFF';
    });

    setConfirmDialog({
      isOpen: true,
      title: `Tùy chọn xóa tiết Chào cờ - Lớp ${clsName}`,
      message: `Tuần này lớp ${clsName} không chào cờ. Bạn có muốn xóa tiết Chào cờ và tự động đẩy các tiết học phía sau (Tiết 2, 3, 4, 5) lên Tiết 1, 2, 3, 4 không?`,
      confirmLabel: followingMorningSlots.length > 0 ? 'Xóa & Đẩy các tiết lên' : 'Xóa Chào cờ',
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        // 1. Xóa slot Chào cờ tại Thứ 2 Sáng Tiết 1
        let newSlots = slots.filter((s) => {
          const match = s.classId === classId;
          const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
          const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
          return !(match && s.day === 2 && sSess === 'MORNING' && sPeriod === 1);
        });

        // 2. Nếu có các tiết phía sau, đẩy lên 1 tiết
        if (followingMorningSlots.length > 0) {
          newSlots = newSlots.map((s) => {
            const match = s.classId === classId;
            const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
            const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
            if (match && s.day === 2 && sSess === 'MORNING' && sPeriod > 1 && s.subjectId !== 'SUB_OFF') {
              const newPeriod = (sPeriod - 1) as PeriodOfDay;
              return {
                ...s,
                period: newPeriod,
                session: 'MORNING',
              };
            }
            return s;
          });
        }

        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        showToast(
          `✓ Đã xóa Chào cờ ${followingMorningSlots.length > 0 ? '& đẩy các tiết Thứ 2 lên' : ''} cho lớp ${clsName}!`,
          'SUCCESS'
        );
      },
    });
  };

  // Khôi phục / Thiết lập lại tiết Chào cờ cho Thứ 2 Tiết 1
  const handleRestoreChaoCo = async (classId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cls = classesMap.get(classId);
    const clsName = cls?.name || classId;
    pushUndo(slots);

    // Xóa slot cũ tại Thứ 2 Tiết 1 nếu có
    const filtered = slots.filter((s) => {
      const match = s.classId === classId;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return !(match && s.day === 2 && sSess === 'MORNING' && sPeriod === 1);
    });

    const ccSlot: TimetableSlot = {
      id: `SLOT_CC_${classId}_${Date.now()}`,
      day: 2,
      period: 1,
      session: 'MORNING',
      classId,
      teacherId: cls?.homeroomTeacherId || '',
      roomId: 'R_SAN_TRUONG',
      assignmentId: `ASG_CC_${classId}`,
      subjectId: 'SUB_CC',
      isMerged: false,
      isCoTeaching: false,
    };

    const newSlots = [...filtered, ccSlot];
    setSlots(newSlots);
    await persistSlotsToCloud(newSlots);
    onDataUpdated?.();
    showToast(`✓ Đã thiết lập lại tiết Chào cờ cho lớp ${clsName}!`, 'SUCCESS');
  };

  // Xóa toàn bộ thời khóa biểu của một lớp
  const handleClearClassTimetable = (classId: string) => {
    const clsName = classesMap.get(classId)?.name || classId;
    const classSlots = slots.filter((s) => s.classId === classId);

    if (classSlots.length === 0) {
      showToast(`Lớp ${clsName} hiện chưa có tiết nào trong TKB!`, 'WARNING');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `Xác nhận xóa TKB lớp ${clsName}`,
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${classSlots.length} tiết trong Thời Khóa Biểu của lớp ${clsName}?`,
      confirmLabel: `Xóa toàn bộ ${classSlots.length} tiết`,
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        const newSlots = slots.filter((s) => s.classId !== classId);
        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        showToast(`✓ Đã xóa toàn bộ ${classSlots.length} tiết của lớp ${clsName} và lưu lên Firebase!`, 'SUCCESS');
      },
    });
  };

  // Xóa các tiết của một hàng tiết (Buổi, Tiết) cho một lớp
  const handleClearPeriodForClass = (
    classId: string,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ) => {
    const sessionName = session === 'MORNING' ? 'Sáng' : 'Chiều';
    const clsName = classesMap.get(classId)?.name || classId;

    const targetSlots = slots.filter((s) => {
      const matchClass = s.classId === classId;
      if (!matchClass) return false;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return sSess === session && sPeriod === periodNum;
    });

    if (targetSlots.length === 0) {
      showToast(`Hàng ${sessionName} Tiết ${periodNum} của lớp ${clsName} chưa có tiết nào!`, 'WARNING');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `Xóa hàng ${sessionName} Tiết ${periodNum}`,
      message: `Bạn có chắc muốn xóa ${targetSlots.length} tiết đã xếp ở hàng ${sessionName} Tiết ${periodNum} của lớp ${clsName}?`,
      confirmLabel: `Xóa ${targetSlots.length} tiết hàng này`,
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        const newSlots = slots.filter((s) => {
          const matchClass = s.classId === classId;
          if (!matchClass) return true;
          const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
          const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
          return !(sSess === session && sPeriod === periodNum);
        });
        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        showToast(`✓ Đã xóa ${targetSlots.length} tiết hàng ${sessionName} Tiết ${periodNum} của lớp ${clsName}!`, 'SUCCESS');
      },
    });
  };

  // Xóa tiết của cả một ngày
  const handleClearDayForClass = (classId: string, day: DayOfWeek) => {
    const clsName = classesMap.get(classId)?.name || classId;
    const daySlots = slots.filter((s) => s.classId === classId && s.day === day);

    if (daySlots.length === 0) {
      showToast(`Thứ ${day} của lớp ${clsName} chưa có tiết nào!`, 'WARNING');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `Xác nhận xóa Thứ ${day}`,
      message: `Bạn có chắc muốn xóa tất cả ${daySlots.length} tiết Thứ ${day} của lớp ${clsName}?`,
      confirmLabel: `Xóa ${daySlots.length} tiết Thứ ${day}`,
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        const newSlots = slots.filter((s) => !(s.classId === classId && s.day === day));
        setSlots(newSlots);
        await persistSlotsToCloud(newSlots);
        onDataUpdated?.();
        showToast(`✓ Đã xóa ${daySlots.length} tiết Thứ ${day} của lớp ${clsName}`);
      },
    });
  };

  // Thuật toán dồn tiết (Compact Schedule)
  const handleCompactSchedule = () => {
    pushUndo(slots);
    showToast('Đang thực hiện thuật toán dồn tiết gọn buổi...');

    const newSlots = [...slots];
    // Sắp xếp các tiết lại liền nhau từ Tiết 1 trở đi cho từng buổi của từng lớp
    classes.forEach((cls) => {
      DAYS.forEach(({ key: day }) => {
        ['MORNING', 'AFTERNOON'].forEach((sess) => {
          const sessionSlots = newSlots
            .filter((s) => {
              const match = s.classId === cls.id;
              const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
              return match && s.day === day && sSess === sess && s.subjectId !== 'SUB_OFF';
            })
            .sort((a, b) => a.period - b.period);

          sessionSlots.forEach((s, idx) => {
            s.period = (idx + 1) as PeriodOfDay;
            s.session = sess as 'MORNING' | 'AFTERNOON';
          });
        });
      });
    });

    setSlots(newSlots);
    persistSlotsToCloud(newSlots);
    showToast('Đã dồn tiết gọn buổi thành công!');
  };

  // Tự động xếp cho 1 lớp hoặc toàn trường (BẢO TOÀN 100% CÁC TIẾT ĐÃ XẾP TAY)
  const handleRunAuto = async (targetClassId?: string) => {
    const targetClass = targetClassId ? classesMap.get(targetClassId) : undefined;
    const targetName = targetClass?.name || targetClassId || 'Toàn trường';

    showToast(`Đang chạy thuật toán TKB Engine tự động xếp bù cho ${targetName}...`);
    pushUndo(slots);

    const solver = new TimetableSolver(
      assignments,
      teachers,
      classes,
      rooms,
      subjects
    );

    let result;
    if (targetClassId) {
      // Tự động xếp cho 1 lớp mục tiêu, bảo toàn 100% các tiết đã xếp tay của lớp và các lớp khác
      result = solver.solveForClass(targetClassId, slots, maxSubjectPerSession);
    } else {
      // Tự động xếp cho toàn trường, bảo toàn 100% các tiết đã xếp tay của tất cả các lớp
      result = solver.solve(slots, maxSubjectPerSession);
    }

    if (result.slots && result.slots.length >= slots.length) {
      setSlots(result.slots);
      await persistSlotsToCloud(result.slots);
      onDataUpdated?.();

      const newlyPlacedCount = result.slots.length - slots.length;

      // NẾU CÓ TIẾT KHÔNG THỂ XẾP ĐƯỢC DO VƯỚNG RÀNG BUỘC VỚI TIẾT ĐÃ XẾP TAY
      if (result.unplacedReminders && result.unplacedReminders.length > 0) {
        setAutoScheduleReportModal({
          isOpen: true,
          targetName,
          newlyPlacedCount,
          reminders: result.unplacedReminders,
        });
      } else {
        if (newlyPlacedCount > 0) {
          showToast(
            `✓ Đã tự động xếp bổ sung ${newlyPlacedCount} tiết còn thiếu cho ${targetName} vào các ô trống mà không ảnh hưởng đến các tiết đã xếp tay!`,
            'SUCCESS'
          );
        } else {
          showToast(
            `Tất cả các môn của ${targetName} đã được xếp đầy đủ từ trước (không có tiết nào bị thiếu).`,
            'SUCCESS'
          );
        }
      }
    } else {
      showToast('Không tìm được slot phù hợp cho cấu hình hiện tại.', 'ERROR');
    }
  };

  // Tự động phân tiết Sinh hoạt (Thứ 7) cho TẤT CẢ các lớp (hoặc lớp đang chọn) và lưu trực tiếp lên Firebase
  const handleAutoAssignAllClassesSHL = async (targetClassId?: string) => {
    const targetClasses = targetClassId
      ? classes.filter((c) => c.id === targetClassId)
      : classes;

    if (targetClasses.length === 0) {
      showToast('Không có lớp nào để phân tiết Sinh hoạt!', 'WARNING');
      return;
    }

    pushUndo(slots);
    setIsSavingCloud(true);
    showToast('Đang phân tiết Sinh hoạt (Thứ 7) và lưu trực tiếp lên Firebase Firestore...');

    try {
      let currentSlots = [...slots];
      const newAssignmentsToSave: TeachingAssignment[] = [];
      let assignedCount = 0;

      for (const cls of targetClasses) {
        const homeroomTeacherId = cls.homeroomTeacherId;
        if (!homeroomTeacherId) continue;

        const classShift = cls.shift || 'MORNING';
        const session: 'MORNING' | 'AFTERNOON' = classShift === 'AFTERNOON' ? 'AFTERNOON' : 'MORNING';
        const periodNum = classShift === 'AFTERNOON' ? 4 : 5;
        const day: DayOfWeek = 7;

        // Xóa slot SHL cũ của lớp này (nếu đã có ở ô khác)
        currentSlots = currentSlots.filter((s) => {
          if (s.classId !== cls.id && !(s.classIds && s.classIds.includes(cls.id))) return true;
          const isSlotShl =
            s.subjectId === shlSubject.id ||
            s.subjectId === 'SUB_SHL' ||
            subjectsMap.get(s.subjectId)?.code === 'SHL' ||
            subjectsMap.get(s.subjectId)?.name.toLowerCase().includes('sinh hoạt') ||
            (s.assignmentId && s.assignmentId.toLowerCase().includes('shl'));
          return !isSlotShl;
        });

        // Xóa slot bất kỳ đang nằm tại Thứ 7 Tiết 5/4 của lớp này
        currentSlots = currentSlots.filter((s) => {
          const matchClass = s.classId === cls.id || (s.classIds && s.classIds.includes(cls.id));
          if (!matchClass) return true;
          const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
          const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
          return !(s.day === day && sSess === session && sPeriod === periodNum);
        });

        // Tạo slot SHL mới
        const shlSlot: TimetableSlot = {
          id: `SLOT_SHL_${cls.id}_D7_P${periodNum}_${session}`,
          day,
          period: periodNum as PeriodOfDay,
          session,
          classId: cls.id,
          classIds: [cls.id],
          teacherId: homeroomTeacherId,
          teacherIds: [homeroomTeacherId],
          roomId: rooms[0]?.id || 'R_DEFAULT',
          assignmentId: `ASG_SHL_${cls.id}`,
          subjectId: shlSubject.id || 'SUB_SHL',
          isMerged: false,
          isCoTeaching: false,
        };

        currentSlots.push(shlSlot);
        assignedCount++;

        // Kiểm tra phân công giảng dạy SHL, nếu chưa có thì chuẩn bị lưu
        const existingAsg = assignments.find(
          (a) =>
            (a.classIds.includes(cls.id) || (a as any).classId === cls.id) &&
            (a.subjectId === shlSubject.id ||
              a.subjectId === 'SUB_SHL' ||
              subjectsMap.get(a.subjectId)?.code === 'SHL' ||
              subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt'))
        );
        if (!existingAsg) {
          newAssignmentsToSave.push({
            id: `ASG_SHL_${cls.id}`,
            subjectId: shlSubject.id || 'SUB_SHL',
            teacherIds: [homeroomTeacherId],
            classIds: [cls.id],
            periodsPerWeek: 1,
            requiredRoomType: 'THEORY',
            isMerged: false,
            doublePeriodsAllowed: false,
            preferredDay: 7,
            priorityLevel: 10,
          });
        }
      }

      setSlots(currentSlots);
      await saveTimetableSlotsToFirebase(currentSlots);
      if (newAssignmentsToSave.length > 0) {
        await saveMultipleAssignmentsToFirebase(newAssignmentsToSave);
      }
      setLastSavedTime(new Date());
      onDataUpdated?.();

      showToast(
        `✓ Đã phân và lưu Firebase thành công tiết Sinh hoạt (Thứ 7) cho ${assignedCount} lớp!`,
        'SUCCESS'
      );
    } catch (error: any) {
      console.error('Lỗi khi phân tiết Sinh hoạt:', error);
      showToast(`Lỗi khi lưu Firebase: ${error.message}`, 'ERROR');
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Xóa toàn bộ Thời Khóa Biểu toàn trường (Cả trên giao diện và trên Firebase)
  const handleClearAllTimetable = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xác nhận xóa toàn bộ Thời Khóa Biểu Toàn Trường',
      message: `Bạn có chắc chắn muốn xóa toàn bộ lịch xếp thời khóa biểu của TẤT CẢ ${classes.length} lớp không? Hành động này sẽ xóa sạch ${slots.length} tiết học đang xếp trên giao diện và đồng bộ xóa trực tiếp trên cơ sở dữ liệu Firebase Cloud (bao gồm cả bộ nhớ tạm).`,
      confirmLabel: 'Xác nhận XÓA TOÀN TRƯỜNG',
      confirmStyle: 'danger',
      onConfirm: async () => {
        pushUndo(slots);
        setSlots([]);
        try {
          setIsSavingCloud(true);
          await clearTimetableSlotsFromFirebase();
          setLastSavedTime(new Date());
          onDataUpdated?.();
          showToast('✓ Đã xóa toàn bộ Thời Khóa Biểu toàn trường thành công (trên máy và Firebase)!', 'SUCCESS');
        } catch (error) {
          console.error('Lỗi khi xóa TKB trên Firebase:', error);
          showToast('Đã xóa trên máy nhưng gặp lỗi kết nối Firebase', 'WARNING');
        } finally {
          setIsSavingCloud(false);
        }
      },
    });
  };

  // Lấy thông tin chi tiết về Giáo viên của môn đang chọn để hiển thị Sidebar bên phải
  const activeTeacher = useMemo(() => {
    if (!selectedSubjectCard) return null;
    return teachersMap.get(selectedSubjectCard.teacherId) || null;
  }, [selectedSubjectCard, teachersMap]);

  const activeSubject = useMemo(() => {
    if (!selectedSubjectCard) return null;
    const sub = subjectsMap.get(selectedSubjectCard.subjectId);
    if (sub) return sub;
    if (
      selectedSubjectCard.subjectId === shlSubject.id ||
      selectedSubjectCard.subjectId === 'SUB_SHL'
    ) {
      return shlSubject;
    }
    return null;
  }, [selectedSubjectCard, subjectsMap, shlSubject]);

  // Các lớp mà GV này phụ trách giảng dạy (bao gồm cả lớp chủ nhiệm)
  const teacherClasses = useMemo(() => {
    if (!activeTeacher) return [];
    const teacherAsgs = assignments.filter((a) => a.teacherIds.includes(activeTeacher.id));
    const classIds = new Set(teacherAsgs.flatMap((a) => a.classIds));
    classes.forEach((c) => {
      if (c.homeroomTeacherId === activeTeacher.id) {
        classIds.add(c.id);
      }
    });
    return Array.from(classIds).map((cid) => classesMap.get(cid)).filter(Boolean) as SchoolClass[];
  }, [activeTeacher, assignments, classesMap, classes]);

  // Tổng số tiết GV được phân công và đã xếp (chỉ đếm các môn được phân công trong PCGD, không đếm Sinh hoạt hay Chào cờ)
  const teacherStats = useMemo(() => {
    if (!activeTeacher) return { scheduled: 0, total: 0 };
    const teacherAsgs = assignments.filter(
      (a) =>
        a.teacherIds.includes(activeTeacher.id) &&
        !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id)
    );
    const totalPeriods = teacherAsgs.reduce((sum, a) => sum + a.periodsPerWeek, 0);

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
      const classSubjectMatch =
        teacherClassSubjectMap.has(`${s.classId}_${s.subjectId}`) &&
        (!s.teacherId || s.teacherId === activeTeacher.id || (s.teacherIds && s.teacherIds.includes(activeTeacher.id)));

      if (!directMatch && !assignmentMatch && !classSubjectMatch) return;

      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      scheduledUniqueSlots.add(`${s.day}_${sSess}_${sPeriod}`);
    });

    return { scheduled: scheduledUniqueSlots.size, total: totalPeriods };
  }, [activeTeacher, assignments, slots, subjectsMap]);

  // Kiểm tra tiết của giáo viên tại 1 vị trí (Dành cho Mini Timetable Grid ở bên phải)
  const getTeacherSlotAt = (
    teacherId: string,
    day: DayOfWeek,
    session: 'MORNING' | 'AFTERNOON',
    periodNum: number
  ) => {
    // Mặc định tất cả giáo viên đều tham gia tiết Chào cờ vào tiết 1 sáng Thứ 2
    if (day === 2 && session === 'MORNING' && periodNum === 1) {
      const existing = slots.find((s) => {
        const matchTeacher = s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId));
        if (!matchTeacher) return false;
        if (s.day !== 2) return false;
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
        return sSess === 'MORNING' && sPeriod === 1;
      });
      if (existing) return existing;

      return {
        id: `SLOT_CC_TEACHER_${teacherId}`,
        day: 2 as DayOfWeek,
        period: 1 as PeriodOfDay,
        session: 'MORNING' as const,
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
      const matchTeacher = s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId));
      if (!matchTeacher) return false;
      if (s.day !== day) return false;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return sSess === session && sPeriod === periodNum;
    });
  };

  // Xử lý khi nhấn vào bất kỳ lớp nào ở bảng TKB mini hoặc danh sách lớp bên phải
  // -> Bảng bên trái hiển thị TKB của lớp đó VÀ VẪN GIỮ CHẾ ĐỘ XEM MÔN CỦA GV ĐÓ
  const handleSelectClassFromRight = (
    targetClassId: string,
    preferredSubjectId?: string,
    teacherIdToKeep?: string
  ) => {
    if (!targetClassId) return;

    const teacherToMatch = teacherIdToKeep || activeTeacher?.id;
    const subjectToMatch = preferredSubjectId || activeSubject?.id;

    // 1. Chuyển chọn lớp cho bảng bên trái
    setSelectedClassId(targetClassId);
    setViewAllClasses(false); // Chuyển sang hiển thị trực diện TKB của lớp này

    // 2. Tìm phân công môn học của lớp này để giữ trạng thái liên kết môn / giáo viên
    const classAssigns = assignments.filter((a) =>
      (Array.isArray(a.classIds) && a.classIds.includes(targetClassId)) ||
      (a as any).classId === targetClassId
    );

    // Ưu tiên 1: Phân công khớp cả GV đó và môn học đó ở lớp mục tiêu
    let matchedAssign = teacherToMatch && subjectToMatch
      ? classAssigns.find((a) => a.teacherIds.includes(teacherToMatch) && a.subjectId === subjectToMatch)
      : undefined;

    // Ưu tiên 2: Phân công có GV đó dạy ở lớp mục tiêu (để giữ nguyên GV và môn của GV đó)
    if (!matchedAssign && teacherToMatch) {
      matchedAssign = classAssigns.find((a) => a.teacherIds.includes(teacherToMatch));
    }

    // Ưu tiên 3: Khớp theo preferredSubjectId nếu có
    if (!matchedAssign && subjectToMatch) {
      matchedAssign = classAssigns.find((a) => a.subjectId === subjectToMatch);
    }

    // Ưu tiên 4: Nếu không có, lấy phân công đầu tiên của lớp này
    if (!matchedAssign && classAssigns.length > 0) {
      matchedAssign = classAssigns[0];
    }

    if (matchedAssign) {
      const actualTeacherId = teacherToMatch && matchedAssign.teacherIds.includes(teacherToMatch)
        ? teacherToMatch
        : matchedAssign.teacherIds[0] || '';

      setSelectedSubjectCard({
        classId: targetClassId,
        subjectId: matchedAssign.subjectId,
        teacherId: actualTeacherId,
        assignmentId: matchedAssign.id,
      });
    }

    // 3. Cuộn mượt đến bảng TKB của lớp đó
    setTimeout(() => {
      const el = document.getElementById(`class-timetable-${targetClassId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);

    const targetClass = classesMap.get(targetClassId);
    const subName = matchedAssign
      ? subjectsMap.get(matchedAssign.subjectId)?.name || matchedAssign.subjectId
      : '';
    const teacherName = teacherToMatch ? teachersMap.get(teacherToMatch)?.name : '';
    showToast(
      `✓ Đã chuyển sang ${targetClass?.name || targetClassId}${subName ? ` - Giữ chế độ xem môn: ${subName}` : ''}${teacherName ? ` (GV: ${teacherName})` : ''}`,
      'SUCCESS'
    );
  };

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL TOOLBAR (THEO THIẾT KẾ TRÊN HÌNH)                          */}
      {/* ========================================================================= */}
      <div className="p-2.5 sm:p-3 bg-white rounded-2xl border border-slate-300 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Auto scope: Trường / Lớp */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="font-black text-slate-900">Auto:</span>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="radio"
                name="autoScope"
                checked={autoScope === 'SCHOOL'}
                onChange={() => setAutoScope('SCHOOL')}
                className="accent-emerald-600 cursor-pointer"
              />
              <span>Trường</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer select-none ml-1">
              <input
                type="radio"
                name="autoScope"
                checked={autoScope === 'CLASS'}
                onChange={() => setAutoScope('CLASS')}
                className="accent-emerald-600 cursor-pointer"
              />
              <span>Lớp</span>
            </label>
          </div>

          {/* Môn/Buổi */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-700">Môn/Buổi:</span>
            <input
              type="number"
              min={0}
              max={5}
              value={maxSubjectPerSession}
              onChange={(e) => setMaxSubjectPerSession(Number(e.target.value))}
              className="w-9 bg-white border border-slate-300 rounded px-1 py-0.5 text-center font-black text-xs"
            />
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border transition-all cursor-pointer ${
                undoStack.length > 0
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title="Hoàn tác thao tác vừa rồi"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Quay lại {undoStack.length}</span>
            </button>

            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border transition-all cursor-pointer ${
                redoStack.length > 0
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title="Làm lại thao tác"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Làm lại {redoStack.length}</span>
            </button>
          </div>

          {/* Nút Check NV (Nguyện vọng GV) */}
          <button
            onClick={() => setShowPreferenceModal(true)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-300 font-extrabold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5 text-purple-700" />
            <span>Check NV</span>
          </button>

          {/* Nút Dồn Tiết */}
          <button
            onClick={handleCompactSchedule}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-extrabold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
            <span>Dồn tiết</span>
          </button>

          {/* Nút Auto Chạy TKB */}
          <button
            onClick={() => handleRunAuto(autoScope === 'CLASS' ? selectedClassId : undefined)}
            className="px-3 py-1.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Tự Động Xếp ({autoScope === 'CLASS' ? 'Lớp Đang Chọn' : 'Toàn Trường'})</span>
          </button>

          {/* Nút Phân Tiết Sinh Hoạt (Thứ 7) */}
          <button
            type="button"
            onClick={() => handleAutoAssignAllClassesSHL(autoScope === 'CLASS' ? selectedClassId : undefined)}
            disabled={isSavingCloud}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black cursor-pointer transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-60"
            title="Tự động phân tiết Sinh hoạt lớp vào Thứ 7 (Tiết 5 Sáng / Tiết 4 Chiều) cho toàn bộ GVCN và lưu trực tiếp lên Firebase"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>Phân Tiết Sinh Hoạt (Thứ 7)</span>
          </button>

          {/* Nút Lưu TKB lên Cloud Firebase */}
          <button
            type="button"
            onClick={handleManualSaveCloud}
            disabled={isSavingCloud}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold cursor-pointer transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-60"
            title="Lưu trữ toàn bộ thời khóa biểu đang xếp của các lớp lên Firebase Firestore"
          >
            {isSavingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
            <span>{isSavingCloud ? 'Đang lưu...' : 'Lưu TKB lên Firebase'}</span>
            {lastSavedTime && !isSavingCloud && (
              <span className="text-[10px] font-normal opacity-85 hidden xl:inline">
                ({lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </span>
            )}
          </button>

          {/* Nút Xóa Toàn Bộ TKB Toàn Trường */}
          <button
            type="button"
            onClick={handleClearAllTimetable}
            disabled={isSavingCloud || slots.length === 0}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-300 font-extrabold cursor-pointer transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Xóa toàn bộ thời khóa biểu đang xếp của tất cả các lớp trên chương trình và Firebase Cloud"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Xóa Toàn Bộ TKB</span>
          </button>
        </div>

        {/* Search bar & Lọc nhanh */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm lớp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs w-44 focus:w-56 transition-all focus:bg-white focus:border-indigo-500 font-bold"
            />
          </div>

          <button
            onClick={() => setViewAllClasses(!viewAllClasses)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-black cursor-pointer transition-colors ${
              viewAllClasses
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {viewAllClasses ? 'Đang hiện tất cả lớp' : 'Xem 1 lớp'}
          </button>
        </div>
      </div>

      {/* Lớp selector bar nếu ở chế độ xem 1 lớp */}
      {!viewAllClasses && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-xs font-black text-slate-700 whitespace-nowrap px-1">Lớp:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => {
                setSelectedClassId(cls.id);
                setSelectedSubjectCard(null);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                selectedClassId === cls.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {/* Toast thông báo nhanh */}
      {toast && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 animate-fade-in shadow-xs ${
            toast.type === 'ERROR'
              ? 'bg-rose-100 border-rose-400 text-rose-950'
              : toast.type === 'WARNING'
              ? 'bg-amber-100 border-amber-400 text-amber-950'
              : 'bg-emerald-100 border-emerald-400 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'ERROR' ? (
              <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
            ) : toast.type === 'WARNING' ? (
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs font-black cursor-pointer px-1.5 py-0.5 rounded hover:bg-black/5"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. KHUNG NỘI DUNG CHÍNH (HAI CỘT: TRÁI = TKB LỚP, PHẢI = CHI TIẾT GIÁO VIÊN) */}
      {/* ========================================================================= */}
      <div className="flex flex-col xl:flex-row gap-3 items-start w-full">
        {/* ======================================================================= */}
        {/* CỘT TRÁI: DANH SÁCH TKB CỦA CÁC LỚP                                     */}
        {/* ======================================================================= */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {activeClasses.map((cls) => {
            const classAssignments = getClassAssignments(cls.id);
            const shlAssignment = classAssignments.find(
              (a) =>
                a.subjectId === shlSubject.id ||
                a.subjectId === 'SUB_SHL' ||
                subjectsMap.get(a.subjectId)?.code === 'SHL' ||
                subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt')
            );
            const regularClassAssignments = classAssignments.filter(
              (a) =>
                a !== shlAssignment &&
                a.subjectId !== shlSubject.id &&
                a.subjectId !== 'SUB_SHL' &&
                subjectsMap.get(a.subjectId)?.code !== 'SHL' &&
                !subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt')
            );

            const homeroomTeacher = cls.homeroomTeacherId
              ? teachersMap.get(cls.homeroomTeacherId)
              : shlAssignment && shlAssignment.teacherIds[0]
              ? teachersMap.get(shlAssignment.teacherIds[0])
              : null;

            const shlTeacherId =
              homeroomTeacher?.id ||
              cls.homeroomTeacherId ||
              (shlAssignment ? shlAssignment.teacherIds[0] : '');

            const shlAssignedPeriods = shlAssignment?.periodsPerWeek || 1;
            const shlScheduledCount = getScheduledCountForSubjectInClass(cls.id, shlSubject.id);

            const totalAssignedPeriods =
              regularClassAssignments.reduce((s, a) => s + a.periodsPerWeek, 0) + shlAssignedPeriods;
            const totalScheduledPeriods = new Set(
              slots
                .filter(
                  (s) =>
                    s.subjectId !== 'SUB_OFF' &&
                    (s.classId === cls.id ||
                      (s.classIds && Array.isArray(s.classIds) && s.classIds.includes(cls.id)) ||
                      (s.assignmentId &&
                        assignments.some(
                          (a) =>
                            a.id === s.assignmentId &&
                            ((a.classIds && Array.isArray(a.classIds) && a.classIds.includes(cls.id)) ||
                              (a as any).classId === cls.id)
                        )))
                )
                .map((s) => {
                  const sess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
                  const pNorm = s.period <= 5 ? s.period : s.period - 5;
                  return `${s.day}_${pNorm}_${sess}`;
                })
            ).size;

            const isShlSelected =
              selectedSubjectCard?.classId === cls.id &&
              (selectedSubjectCard?.subjectId === shlSubject.id ||
                selectedSubjectCard?.subjectId === 'SUB_SHL' ||
                selectedSubjectCard?.subjectId === shlAssignment?.subjectId);

            return (
              <div
                key={cls.id}
                id={`class-timetable-${cls.id}`}
                className={`bg-white rounded-2xl border-2 transition-all shadow-sm overflow-hidden ${
                  selectedClassId === cls.id
                    ? 'ring-2 ring-indigo-500 border-indigo-400 shadow-md'
                    : 'border-slate-300'
                }`}
              >
                {/* BẢNG TKB CỦA LỚP */}
                <div className="overflow-x-auto w-full max-w-full custom-scrollbar pb-1">
                  <table className="w-full table-fixed border-collapse text-xs text-center">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-300 text-slate-800 font-black text-[10px] sm:text-[11px] uppercase">
                        <th className="py-1.5 px-0.5 w-14 sm:w-16 border-r border-slate-200">Lớp</th>
                        <th className="py-1.5 px-0.5 w-9 sm:w-10 border-r border-slate-200">Buổi</th>
                        <th className="py-1.5 px-0.5 w-9 sm:w-10 border-r border-slate-200">Tiết</th>
                        <th className="py-1.5 px-0.5 w-16 sm:w-18 border-r border-slate-200">Thời gian</th>
                        {DAYS.map(({ key, label }) => (
                          <th key={key} className="py-1.5 px-0.5 border-r border-slate-200">
                            {label}
                          </th>
                        ))}
                        <th className="py-1.5 px-0.5 w-9 sm:w-10 text-center">
                          <button
                            type="button"
                            onClick={() => handleClearClassTimetable(cls.id)}
                            className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] cursor-pointer shadow-2xs transition-colors"
                            title={`Xóa toàn bộ thời khóa biểu của lớp ${cls.name}`}
                          >
                            Xóa
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-900 font-bold">
                      {/* === BUỔI SÁNG (5 TIẾT) === */}
                      {MORNING_PERIODS.map((period, idx) => (
                        <tr key={`morning_${period.period}`} className="hover:bg-slate-50/70 transition-colors">
                          {/* Cột Tên Lớp & Nút Sửa (Merge 5 hàng sáng) */}
                          {idx === 0 && (
                            <td
                              rowSpan={5}
                              className="p-1 border-r border-slate-300 bg-slate-50/50 align-top text-center"
                            >
                              <div className="space-y-1.5 flex flex-col items-center justify-start h-full">
                                <button
                                  type="button"
                                  onClick={() => setSelectedClassId(cls.id)}
                                  className="px-2 py-0.5 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-black text-[9px] shadow-2xs cursor-pointer"
                                >
                                  Sửa
                                </button>
                                <div className="font-black text-indigo-950 text-[11px] sm:text-xs mt-0.5 leading-tight text-center break-words max-w-full" title={cls.name}>
                                  {cls.name}
                                </div>
                              </div>
                            </td>
                          )}

                          {/* Cột Buổi (Merge 5 hàng sáng) */}
                          {idx === 0 && (
                            <td
                              rowSpan={5}
                              className="p-1 border-r border-slate-300 bg-slate-50 font-black text-slate-800 text-[11px] text-center"
                            >
                              Sáng
                            </td>
                          )}

                          {/* Cột Tiết */}
                          <td className="py-1 px-0.5 border-r border-slate-200 font-black text-[11px] text-slate-700">
                            {period.label}
                          </td>

                          {/* Cột Thời gian */}
                          <td className="py-1 px-0.5 border-r border-slate-200 font-normal text-[10px] text-slate-500 whitespace-nowrap truncate" title={period.time}>
                            {period.time.replace(' - ', '-').replace(':00', 'h00').replace(':', 'h')}
                          </td>

                          {/* Các ngày Thứ 2 -> Thứ 7 */}
                          {DAYS.map(({ key: day }) => {
                            const slot = getSlot(cls.id, day, 'MORNING', period.period);
                            const isSlotCC =
                              slot &&
                              (slot.subjectId === 'SUB_CC' ||
                                slot.subjectId === ccSubject.id ||
                                subjectsMap.get(slot.subjectId)?.code === 'CC' ||
                                subjectsMap.get(slot.subjectId)?.name.toLowerCase().includes('chào cờ'));

                            const isSlotShl =
                              slot &&
                              !isSlotCC &&
                              (slot.subjectId === shlSubject.id ||
                                slot.subjectId === 'SUB_SHL' ||
                                subjectsMap.get(slot.subjectId)?.code === 'SHL' ||
                                subjectsMap.get(slot.subjectId)?.name.toLowerCase().includes('sinh hoạt'));

                            const isSelectedSubjectSlot =
                              selectedSubjectCard &&
                              selectedSubjectCard.classId === cls.id &&
                              slot &&
                              (slot.subjectId === selectedSubjectCard.subjectId ||
                                ((selectedSubjectCard.subjectId === shlSubject.id ||
                                  selectedSubjectCard.subjectId === 'SUB_SHL' ||
                                  subjectsMap.get(selectedSubjectCard.subjectId)?.code === 'SHL') &&
                                  isSlotShl));

                            const subObj = slot ? subjectsMap.get(slot.subjectId) : null;
                            const isOff = slot?.subjectId === 'SUB_OFF';
                            const displaySubjectName = isSlotCC
                              ? 'Chào cờ'
                              : isSlotShl
                              ? 'Sinh hoạt'
                              : subObj?.shortName || subObj?.name || slot?.subjectId;

                            // 1. Lịch bận cố định / nguyện vọng nghỉ của GV thẻ môn đang chọn
                            const isSelectedTeacherUnavailable = selectedSubjectCard && !slot
                              ? isTeacherUnavailable(selectedSubjectCard.teacherId, day, 'MORNING', period.period)
                              : false;

                            // 2. Lịch bận cố định của GV đã xếp trong ô này
                            const isSlotTeacherUnavailable = slot && slot.subjectId !== 'SUB_OFF'
                              ? (slot.teacherIds && slot.teacherIds.length > 0
                                  ? slot.teacherIds.some((tId) => isTeacherUnavailable(tId, day, 'MORNING', period.period))
                                  : slot.teacherId
                                  ? isTeacherUnavailable(slot.teacherId, day, 'MORNING', period.period)
                                  : false)
                              : false;

                            // 3. Trùng tiết dạy ở lớp khác
                            const teacherConflictAtCell =
                              selectedSubjectCard && !slot
                                ? checkTeacherConflictAt(
                                    selectedSubjectCard.teacherId,
                                    day,
                                    'MORNING',
                                    period.period,
                                    cls.id
                                  )
                                : null;

                            // 4. Môn học trong slot có đang chưa xếp đủ số tiết không
                            const slotAsg = slot && slot.subjectId !== 'SUB_OFF' && !isSlotCC && !isSlotShl
                              ? regularClassAssignments.find((a) => a.subjectId === slot.subjectId)
                              : null;
                            const isSlotIncomplete = Boolean(
                              slotAsg &&
                              getScheduledCountForSubjectInClass(cls.id, slot!.subjectId) < slotAsg.periodsPerWeek
                            );

                            return (
                              <td
                                key={day}
                                onClick={() => handleCellClick(cls.id, day, 'MORNING', period.period)}
                                title={
                                  isSlotTeacherUnavailable
                                    ? `⚠️ Cảnh báo: Giáo viên đã đăng ký lịch bận/nguyện vọng nghỉ vào Thứ ${day} Tiết ${period.period}!`
                                    : isSelectedTeacherUnavailable
                                    ? `⚠️ Bận: Giáo viên ${teachersMap.get(selectedSubjectCard?.teacherId || '')?.name} có nguyện vọng nghỉ / bận vào Thứ ${day} Tiết ${period.period}!`
                                    : teacherConflictAtCell
                                    ? `⚠️ Bận: Giáo viên đã có tiết dạy tại ${classesMap.get(teacherConflictAtCell.classId)?.name}!`
                                    : slot
                                    ? isSlotCC
                                      ? 'Chào cờ (Cố định toàn trường)'
                                      : isSlotShl
                                      ? 'Sinh hoạt (GVCN)'
                                      : isSlotIncomplete
                                      ? `${subObj?.name || slot.subjectId} (⏳ Chưa đủ: ${getScheduledCountForSubjectInClass(cls.id, slot.subjectId)}/${slotAsg?.periodsPerWeek} tiết)`
                                      : `${subObj?.name || slot.subjectId} (✓ Đủ ${slotAsg?.periodsPerWeek || ''} tiết)`
                                    : day === 2 && period.period === 1
                                    ? 'Tiết 1 Sáng Thứ 2 (Click để khôi phục tiết Chào cờ hoặc xếp môn)'
                                    : undefined
                                }
                                className={`py-1 px-0.5 border-r border-slate-200 cursor-pointer select-none transition-all relative ${
                                  isSelectedSubjectSlot
                                    ? 'bg-rose-300 hover:bg-rose-400 text-rose-950 font-black shadow-inner'
                                    : isOff
                                    ? 'bg-slate-200 text-slate-500 font-semibold'
                                    : isSlotCC
                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 font-black ring-1 ring-amber-300'
                                    : isSlotShl
                                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-black'
                                    : isSlotTeacherUnavailable
                                    ? 'bg-rose-100/90 hover:bg-rose-200 text-slate-950 font-bold border-rose-300 ring-1 ring-rose-300'
                                    : isSlotIncomplete
                                    ? 'bg-amber-100/70 hover:bg-amber-200/80 text-amber-950 font-black border-amber-300 ring-1 ring-amber-300/60'
                                    : slot
                                    ? 'hover:bg-indigo-50 text-slate-950 font-bold'
                                    : isSelectedTeacherUnavailable
                                    ? 'bg-rose-100/90 hover:bg-rose-200 text-rose-700 font-extrabold border-rose-300'
                                    : teacherConflictAtCell
                                    ? 'bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-200'
                                    : selectedSubjectCard
                                    ? 'bg-yellow-50/50 hover:bg-yellow-100 text-slate-400 border-dashed'
                                    : 'hover:bg-slate-100 text-slate-400'
                                }`}
                              >
                                {slot ? (
                                  isOff ? (
                                    <span className="text-[10px] italic font-bold">Nghỉ</span>
                                  ) : isSlotCC ? (
                                    <div className="relative group/cc w-full h-full flex items-center justify-center gap-0.5 px-0.5 py-0.5">
                                      <div className="leading-tight flex items-center justify-center gap-0.5">
                                        <span className="text-[10px]">🚩</span>
                                        <span className="text-[11px] font-black text-amber-950 truncate">Chào cờ</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => handleClearChaoCo(cls.id, e)}
                                        className="p-0.5 rounded text-amber-800 hover:text-rose-700 hover:bg-amber-200/90 transition-colors cursor-pointer shrink-0 opacity-80 hover:opacity-100"
                                        title="Xóa tiết Chào cờ tuần này (có tùy chọn đẩy tiết khác lên)"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="leading-tight">
                                      <div className={`text-[11px] ${isSlotShl ? 'font-black text-indigo-950' : isSlotIncomplete ? 'font-black text-amber-950' : 'font-black text-slate-900'} flex items-center justify-center gap-0.5 truncate`}>
                                        <span className="truncate">{displaySubjectName}</span>
                                        {isSlotIncomplete && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 inline-block" title="Môn này chưa xếp đủ số tiết phân công" />
                                        )}
                                      </div>
                                      {isSlotTeacherUnavailable && (
                                        <span className="text-[8px] font-black text-rose-800 bg-rose-100 px-0.5 py-0.2 rounded border border-rose-300 block truncate mt-0.5" title="Cảnh báo: Giáo viên đã đăng ký lịch bận/nguyện vọng nghỉ vào tiết này!">
                                          ⚠️ GV Bận
                                        </span>
                                      )}
                                    </div>
                                  )
                                ) : isSelectedTeacherUnavailable ? (
                                  <span className="text-[9px] text-rose-700 font-extrabold flex items-center justify-center gap-0.5">
                                    <span>⚠️</span>Bận
                                  </span>
                                ) : teacherConflictAtCell ? (
                                  <span className="text-[9px] text-amber-800 font-extrabold flex items-center justify-center gap-0.5 truncate">
                                    <span>⚠️</span>Dạy Lớp Khác
                                  </span>
                                ) : day === 2 && period.period === 1 ? (
                                  <div className="relative group/cc w-full h-full flex flex-col items-center justify-center py-0.5">
                                    <span className="text-slate-400 group-hover/cc:hidden font-light text-[10px]">+</span>
                                    <button
                                      type="button"
                                      onClick={(e) => handleRestoreChaoCo(cls.id, e)}
                                      className="hidden group-hover/cc:inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[8px] cursor-pointer shadow-2xs"
                                      title="Đặt lại tiết Chào cờ cố định cho Thứ 2 Tiết 1"
                                    >
                                      <span>🚩</span>+CC
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-transparent hover:text-slate-300 font-light text-[10px]">+</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Cột Thao tác xóa nhanh tiết hàng này */}
                          <td className="py-1 px-0.5 text-center">
                            {DAYS.some(({ key: day }) => !!getSlot(cls.id, day, 'MORNING', period.period)) ? (
                              <button
                                type="button"
                                onClick={() => handleClearPeriodForClass(cls.id, 'MORNING', period.period)}
                                className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title={`Xóa các tiết trong hàng Sáng ${period.label} của lớp ${cls.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* Phân cách giữa Sáng và Chiều */}
                      <tr className="bg-indigo-600/10 h-1">
                        <td colSpan={11} className="p-0 border-y border-indigo-200" />
                      </tr>

                      {/* === BUỔI CHIỀU (4 TIẾT) === */}
                      {AFTERNOON_PERIODS.map((period, idx) => (
                        <tr key={`afternoon_${period.period}`} className="hover:bg-slate-50/70 transition-colors">
                          {/* Cột Tên Lớp & Nút Auto (Merge 4 hàng chiều) */}
                          {idx === 0 && (
                            <td
                              rowSpan={4}
                              className="p-1 border-r border-slate-300 bg-slate-50/50 align-middle text-center"
                            >
                              <button
                                type="button"
                                onClick={() => handleRunAuto(cls.id)}
                                className="px-1.5 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-black text-[9px] shadow-2xs cursor-pointer flex items-center justify-center gap-0.5 mx-auto"
                                title="Tự động xếp TKB cho lớp này"
                              >
                                <Wand2 className="w-2.5 h-2.5" />
                                <span>Auto</span>
                              </button>
                            </td>
                          )}

                          {/* Cột Buổi (Merge 4 hàng chiều) */}
                          {idx === 0 && (
                            <td
                              rowSpan={4}
                              className="p-1 border-r border-slate-300 bg-slate-50 font-black text-slate-800 text-[11px] text-center"
                            >
                              Chiều
                            </td>
                          )}

                          {/* Cột Tiết */}
                          <td className="py-1 px-0.5 border-r border-slate-200 font-black text-[11px] text-slate-700">
                            {period.label}
                          </td>

                          {/* Cột Thời gian */}
                          <td className="py-1 px-0.5 border-r border-slate-200 font-normal text-[10px] text-slate-500 whitespace-nowrap truncate" title={period.time}>
                            {period.time.replace(' - ', '-').replace(':00', 'h00').replace(':', 'h')}
                          </td>

                          {/* Các ngày Thứ 2 -> Thứ 7 */}
                          {DAYS.map(({ key: day }) => {
                            const slot = getSlot(cls.id, day, 'AFTERNOON', period.period);
                            const isSlotShl =
                              slot &&
                              (slot.subjectId === shlSubject.id ||
                                slot.subjectId === 'SUB_SHL' ||
                                subjectsMap.get(slot.subjectId)?.code === 'SHL' ||
                                subjectsMap.get(slot.subjectId)?.name.toLowerCase().includes('sinh hoạt'));

                            const isSelectedSubjectSlot =
                              selectedSubjectCard &&
                              selectedSubjectCard.classId === cls.id &&
                              slot &&
                              (slot.subjectId === selectedSubjectCard.subjectId ||
                                ((selectedSubjectCard.subjectId === shlSubject.id ||
                                  selectedSubjectCard.subjectId === 'SUB_SHL' ||
                                  subjectsMap.get(selectedSubjectCard.subjectId)?.code === 'SHL') &&
                                  isSlotShl));

                            const subObj = slot ? subjectsMap.get(slot.subjectId) : null;
                            const isOff = slot?.subjectId === 'SUB_OFF';
                            const displaySubjectName = isSlotShl
                              ? 'Sinh hoạt'
                              : subObj?.shortName || subObj?.name || slot?.subjectId;

                            // 1. Lịch bận cố định / nguyện vọng nghỉ của GV thẻ môn đang chọn
                            const isSelectedTeacherUnavailable = selectedSubjectCard && !slot
                              ? isTeacherUnavailable(selectedSubjectCard.teacherId, day, 'AFTERNOON', period.period)
                              : false;

                            // 2. Lịch bận cố định của GV đã xếp trong ô này
                            const isSlotTeacherUnavailable = slot && slot.subjectId !== 'SUB_OFF'
                              ? (slot.teacherIds && slot.teacherIds.length > 0
                                  ? slot.teacherIds.some((tId) => isTeacherUnavailable(tId, day, 'AFTERNOON', period.period))
                                  : slot.teacherId
                                  ? isTeacherUnavailable(slot.teacherId, day, 'AFTERNOON', period.period)
                                  : false)
                              : false;

                            // 3. Trùng tiết dạy ở lớp khác
                            const teacherConflictAtCell =
                              selectedSubjectCard && !slot
                                ? checkTeacherConflictAt(
                                    selectedSubjectCard.teacherId,
                                    day,
                                    'AFTERNOON',
                                    period.period,
                                    cls.id
                                  )
                                : null;

                            // 4. Môn học trong slot có đang chưa xếp đủ số tiết không
                            const slotAsg = slot && slot.subjectId !== 'SUB_OFF' && !isSlotShl
                              ? regularClassAssignments.find((a) => a.subjectId === slot.subjectId)
                              : null;
                            const isSlotIncomplete = Boolean(
                              slotAsg &&
                              getScheduledCountForSubjectInClass(cls.id, slot!.subjectId) < slotAsg.periodsPerWeek
                            );

                            return (
                              <td
                                key={day}
                                onClick={() => handleCellClick(cls.id, day, 'AFTERNOON', period.period)}
                                title={
                                  isSlotTeacherUnavailable
                                    ? `⚠️ Cảnh báo: Giáo viên đã đăng ký lịch bận/nguyện vọng nghỉ vào Thứ ${day} Tiết ${period.period}!`
                                    : isSelectedTeacherUnavailable
                                    ? `⚠️ Bận: Giáo viên ${teachersMap.get(selectedSubjectCard?.teacherId || '')?.name} có nguyện vọng nghỉ / bận vào Thứ ${day} Tiết ${period.period}!`
                                    : teacherConflictAtCell
                                    ? `⚠️ Bận: Giáo viên đã có tiết dạy tại ${classesMap.get(teacherConflictAtCell.classId)?.name}!`
                                    : slot
                                    ? isSlotShl
                                      ? 'Sinh hoạt (GVCN)'
                                      : isSlotIncomplete
                                      ? `${subObj?.name || slot.subjectId} (⏳ Chưa đủ: ${getScheduledCountForSubjectInClass(cls.id, slot.subjectId)}/${slotAsg?.periodsPerWeek} tiết)`
                                      : `${subObj?.name || slot.subjectId} (✓ Đủ ${slotAsg?.periodsPerWeek || ''} tiết)`
                                    : undefined
                                }
                                className={`py-1 px-0.5 border-r border-slate-200 cursor-pointer select-none transition-all relative ${
                                  isSelectedSubjectSlot
                                    ? 'bg-rose-300 hover:bg-rose-400 text-rose-950 font-black shadow-inner'
                                    : isOff
                                    ? 'bg-slate-200 text-slate-500 font-semibold'
                                    : isSlotShl
                                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-black'
                                    : isSlotTeacherUnavailable
                                    ? 'bg-rose-100/90 hover:bg-rose-200 text-slate-950 font-bold border-rose-300 ring-1 ring-rose-300'
                                    : isSlotIncomplete
                                    ? 'bg-amber-100/70 hover:bg-amber-200/80 text-amber-950 font-black border-amber-300 ring-1 ring-amber-300/60'
                                    : slot
                                    ? 'hover:bg-indigo-50 text-slate-950 font-bold'
                                    : isSelectedTeacherUnavailable
                                    ? 'bg-rose-100/90 hover:bg-rose-200 text-rose-700 font-extrabold border-rose-300'
                                    : teacherConflictAtCell
                                    ? 'bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-200'
                                    : selectedSubjectCard
                                    ? 'bg-yellow-50/50 hover:bg-yellow-100 text-slate-400 border-dashed'
                                    : 'hover:bg-slate-100 text-slate-400'
                                }`}
                              >
                                {slot ? (
                                  isOff ? (
                                    <span className="text-[10px] italic font-bold">Nghỉ</span>
                                  ) : (
                                    <div className="leading-tight">
                                      <div className={`text-[11px] ${isSlotShl ? 'font-black text-indigo-950' : isSlotIncomplete ? 'font-black text-amber-950' : 'font-black text-slate-900'} flex items-center justify-center gap-0.5 truncate`}>
                                        <span className="truncate">{displaySubjectName}</span>
                                        {isSlotIncomplete && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 inline-block" title="Môn này chưa xếp đủ số tiết phân công" />
                                        )}
                                      </div>
                                      {isSlotTeacherUnavailable && (
                                        <span className="text-[8px] font-black text-rose-800 bg-rose-100 px-0.5 py-0.2 rounded border border-rose-300 block truncate mt-0.5" title="Cảnh báo: Giáo viên đã đăng ký lịch bận/nguyện vọng nghỉ vào tiết này!">
                                          ⚠️ GV Bận
                                        </span>
                                      )}
                                    </div>
                                  )
                                ) : isSelectedTeacherUnavailable ? (
                                  <span className="text-[9px] text-rose-700 font-extrabold flex items-center justify-center gap-0.5">
                                    <span>⚠️</span>Bận
                                  </span>
                                ) : teacherConflictAtCell ? (
                                  <span className="text-[9px] text-amber-800 font-extrabold flex items-center justify-center gap-0.5 truncate">
                                    <span>⚠️</span>Dạy Lớp Khác
                                  </span>
                                ) : (
                                  <span className="text-transparent hover:text-slate-300 font-light text-[10px]">+</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Cột Thao tác xóa nhanh tiết hàng này */}
                          <td className="py-1 px-0.5 text-center">
                            {DAYS.some(({ key: day }) => !!getSlot(cls.id, day, 'AFTERNOON', period.period)) ? (
                              <button
                                type="button"
                                onClick={() => handleClearPeriodForClass(cls.id, 'AFTERNOON', period.period)}
                                className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title={`Xóa các tiết trong hàng Chiều ${period.label} của lớp ${cls.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ================================================================= */}
                {/* 3. BẢNG CÁC THẺ MÔN HỌC BÊN DƯỚI TKB LỚP (GIỐNG HÌNH CHỤP)        */}
                {/* ================================================================= */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-200 space-y-3">
                  {(() => {
                    const incompleteSubjectsCount = regularClassAssignments.filter((a) => {
                      const cnt = getScheduledCountForSubjectInClass(cls.id, a.subjectId);
                      return cnt < a.periodsPerWeek;
                    }).length + (shlScheduledCount < shlAssignedPeriods ? 1 : 0);

                    const completedSubjectsCount = regularClassAssignments.filter((a) => {
                      const cnt = getScheduledCountForSubjectInClass(cls.id, a.subjectId);
                      return cnt === a.periodsPerWeek;
                    }).length + (shlScheduledCount === shlAssignedPeriods ? 1 : 0);

                    return (
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                        <span className="font-black text-slate-800 uppercase flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-indigo-600" />
                          <span>Bảng Môn Học & Phân Công Của {cls.name.toLowerCase().startsWith('lớp') ? cls.name : `Lớp ${cls.name}`}</span>
                        </span>
                        <div className="flex items-center gap-2 font-extrabold text-slate-600 flex-wrap">
                          <span>
                            Đã xếp: <strong className="text-indigo-900">{totalScheduledPeriods}</strong> /{' '}
                            {totalAssignedPeriods} tiết
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[11px] border border-emerald-300 flex items-center gap-1">
                            <span>✓</span>
                            <span>{completedSubjectsCount} môn đã đủ</span>
                          </span>
                          {incompleteSubjectsCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 font-black text-[11px] border border-amber-400 flex items-center gap-1 shadow-2xs">
                              <span className="text-amber-700">⏳</span>
                              <span>{incompleteSubjectsCount} môn chưa đủ tiết</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                    {/* Lưới các thẻ môn học */}
                    <div className="flex flex-wrap gap-2.5 items-stretch">
                      {regularClassAssignments.map((asg) => {
                        const sub = subjectsMap.get(asg.subjectId);

                        // Các phân công cùng môn cho lớp này
                        const sameSubjectClassAssignments = regularClassAssignments.filter(
                          (a) => a.subjectId === asg.subjectId
                        );

                        // Nhận diện Môn Ghép chính thức vs Phân công trùng lặp
                        const isOfficialMerged = Boolean(
                          asg.isMerged ||
                            (asg.classIds && asg.classIds.length > 1) ||
                            (asg.teacherIds && asg.teacherIds.length > 1)
                        );

                        const isDuplicateAssignment =
                          !isOfficialMerged && sameSubjectClassAssignments.length > 1;

                        const primaryTeacher = teachersMap.get(asg.teacherIds[0]);
                        const primaryTeacherName = primaryTeacher?.shortName || primaryTeacher?.name || 'Chưa gán GV';

                        // Nếu là môn ghép chính thức, gom tất cả tên GV
                        const teacherIdSet = new Set<string>(asg.teacherIds || []);
                        if (isOfficialMerged) {
                          slots
                            .filter((s) => s.classId === cls.id && s.subjectId === asg.subjectId)
                            .forEach((s) => {
                              if (s.teacherId) teacherIdSet.add(s.teacherId);
                              if (s.teacherIds && Array.isArray(s.teacherIds)) {
                                s.teacherIds.forEach((tId) => teacherIdSet.add(tId));
                              }
                            });
                        }

                        const teacherNamesList = Array.from(teacherIdSet)
                          .map((tId) => {
                            const t = teachersMap.get(tId);
                            return t?.shortName || t?.name;
                          })
                          .filter(Boolean);

                        const teachersLabel = isOfficialMerged
                          ? teacherNamesList.length > 0
                            ? teacherNamesList.join(', ')
                            : 'Chưa gán GV'
                          : primaryTeacherName;

                        const primaryTeacherId = asg.teacherIds[0] || '';
                        const scheduledCount = getScheduledCountForSubjectInClass(cls.id, asg.subjectId);

                        // Phân loại trạng thái xếp tiết của môn
                        const isComplete = scheduledCount === asg.periodsPerWeek;
                        const isUnder = scheduledCount < asg.periodsPerWeek;
                        const isOver = scheduledCount > asg.periodsPerWeek;
                        const missingPeriods = asg.periodsPerWeek - scheduledCount;

                        const isSelected =
                          selectedSubjectCard?.classId === cls.id &&
                          selectedSubjectCard?.subjectId === asg.subjectId &&
                          selectedSubjectCard?.assignmentId === asg.id;

                        // Ký hiệu ca: SC (Sáng Chiều), S (Sáng), C (Chiều)
                        const shiftLabel =
                          sub?.preferredShift === 'MORNING'
                            ? 'S'
                            : sub?.preferredShift === 'AFTERNOON'
                            ? 'C'
                            : 'SC';

                        return (
                          <div
                            key={asg.id}
                            onClick={() => {
                              if (isDuplicateAssignment) {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: `⚠️ Cảnh Báo: Phân Công Giảng Dạy Bị Trùng`,
                                  message: `Môn ${sub?.name || asg.subjectId} ở lớp ${cls.name} hiện đang bị trùng ${sameSubjectClassAssignments.length} phân công chuyên môn riêng lẻ (không ghép lớp). Việc xếp môn này có thể khiến TKB phân công 2 giáo viên cùng dạy trùng nhau.\n\nKhuyên dùng: Nếu 2 GV dạy chung, hãy tạo Nhóm Ghép ở menu 'Ghép lớp'. Nếu gán nhầm, hãy xóa phân công thừa ở menu 'Phân công giảng dạy'.`,
                                  confirmLabel: `⚠️ Vẫn Chọn Xếp Phân Công Này`,
                                  confirmStyle: 'danger',
                                  onConfirm: () => {
                                    setSelectedSubjectCard({
                                      classId: cls.id,
                                      subjectId: asg.subjectId,
                                      teacherId: primaryTeacherId,
                                      assignmentId: asg.id,
                                    });
                                    setIsOffMode(false);
                                  },
                                });
                                return;
                              }

                              if (isSelected) {
                                setSelectedSubjectCard(null);
                              } else {
                                setSelectedSubjectCard({
                                  classId: cls.id,
                                  subjectId: asg.subjectId,
                                  teacherId: primaryTeacherId,
                                  assignmentId: asg.id,
                                });
                                setIsOffMode(false);
                              }
                            }}
                            className={`p-2.5 rounded-xl border-2 cursor-pointer select-none transition-all flex flex-col justify-between min-w-28 sm:min-w-36 shadow-2xs ${
                              isSelected
                                ? 'bg-rose-50 border-rose-500 shadow-md ring-2 ring-rose-400 scale-[1.02]'
                                : isDuplicateAssignment
                                ? 'bg-rose-50/70 border-rose-400 hover:border-rose-600 hover:bg-rose-100/60'
                                : isOver
                                ? 'bg-rose-100/90 border-rose-400 hover:border-rose-500 text-rose-950 ring-1 ring-rose-300'
                                : isUnder
                                ? 'bg-amber-100/95 border-amber-400 hover:border-amber-500 hover:bg-amber-200/90 text-amber-950 shadow-xs ring-1 ring-amber-300/80'
                                : 'bg-emerald-50/80 border-emerald-300 hover:border-emerald-500 hover:bg-emerald-100/70 text-emerald-950'
                            }`}
                          >
                            {/* Dòng 1: Icon / Tên Môn / Số tiết / Ca */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-black text-xs text-slate-900 flex items-center gap-1">
                                <span className={`text-[11px] ${isUnder ? 'text-amber-800' : isComplete ? 'text-emerald-700' : 'text-slate-600'}`}>
                                  {isUnder ? '⏳' : isComplete ? '✓' : '👓'}
                                </span>
                                <span className={isUnder ? 'text-amber-950 font-black' : isComplete ? 'text-slate-900 font-black' : 'text-slate-900'}>
                                  {sub?.shortName || sub?.name || asg.subjectId}
                                </span>
                                <span className={`font-extrabold ${isUnder ? 'text-amber-900' : isComplete ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {asg.periodsPerWeek}
                                </span>
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1 rounded border ${
                                  isUnder
                                    ? 'text-amber-900 bg-amber-200/90 border-amber-300'
                                    : isComplete
                                    ? 'text-emerald-800 bg-emerald-100 border-emerald-200'
                                    : 'text-slate-700 bg-slate-100 border-slate-200'
                                }`}
                              >
                                {shiftLabel}
                              </span>
                            </div>

                            {/* Dòng 2: Nút Thùng rác + Số tiết đã xếp */}
                            <div
                              className={`flex items-center justify-between gap-1 my-1.5 pt-1 border-t ${
                                isUnder ? 'border-amber-300/80' : isComplete ? 'border-emerald-200' : 'border-slate-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => handleClearSubjectInClass(cls.id, asg.subjectId, e)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isUnder
                                    ? 'text-amber-800 hover:text-rose-700 hover:bg-amber-200'
                                    : 'text-rose-600 hover:text-rose-800 hover:bg-rose-100'
                                }`}
                                title="Xóa tất cả các tiết đã xếp của môn này trong lớp"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-[11px] font-bold text-slate-700">
                                Đã xếp{' '}
                                <strong
                                  className={
                                    isComplete
                                      ? 'text-emerald-700 font-black'
                                      : isOver
                                      ? 'text-rose-700 font-black'
                                      : 'text-amber-900 font-black'
                                  }
                                >
                                  {scheduledCount}
                                </strong>
                                /{asg.periodsPerWeek}
                                {isComplete && (
                                  <span className="ml-1 text-[10px] text-emerald-700 font-black">✓ Đủ</span>
                                )}
                                {isUnder && (
                                  <span className="ml-1 text-[10px] text-amber-950 bg-amber-200/90 px-1 py-0.5 rounded font-black border border-amber-400 shrink-0">
                                    Thiếu {missingPeriods}
                                  </span>
                                )}
                                {isOver && (
                                  <span className="ml-1 text-[10px] text-rose-700 font-black">⚠ Thừa</span>
                                )}
                              </span>
                            </div>

                            {/* Dòng 3: Tên giáo viên & Cảnh báo nếu trùng PCGD */}
                            <div className="space-y-1">
                              <div
                                className={`text-[11px] font-bold truncate text-center py-0.5 px-1.5 rounded border flex items-center justify-center gap-1 shadow-2xs ${
                                  isDuplicateAssignment
                                    ? 'bg-rose-100 text-rose-950 border-rose-300 font-black'
                                    : isUnder
                                    ? 'bg-white/95 text-amber-950 border-amber-300 font-extrabold'
                                    : isComplete
                                    ? 'bg-white/90 text-slate-800 border-emerald-200/90'
                                    : 'bg-white/80 text-indigo-950 border-slate-200'
                                }`}
                                title={`Giáo viên phụ trách: ${teachersLabel}`}
                              >
                                {isOfficialMerged && teacherNamesList.length > 1 && (
                                  <span
                                    className="text-[9px] bg-indigo-100 text-indigo-800 px-1 rounded font-black shrink-0"
                                    title="Môn ghép / Nhóm GV đồng giảng dạy"
                                  >
                                    👥 {teacherNamesList.length} GV
                                  </span>
                                )}
                                <span className="truncate">{teachersLabel}</span>
                              </div>

                              {isDuplicateAssignment && (
                                <div className="text-[9px] font-black text-rose-800 bg-rose-100/90 px-1 py-0.5 rounded border border-rose-300 text-center truncate">
                                  ⚠️ Trùng PCGD ({sameSubjectClassAssignments.length} GV)
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                    {/* THẺ MÔN SINH HOẠT LỚP (HIỂN THỊ THEO GV CHỦ NHIỆM) */}
                    {(() => {
                      const isShlComplete = shlScheduledCount === shlAssignedPeriods;
                      const isShlUnder = shlScheduledCount < shlAssignedPeriods;
                      const isShlOver = shlScheduledCount > shlAssignedPeriods;

                      return (
                        <div
                          key={`SHL_${cls.id}`}
                          onClick={() => {
                            if (isShlSelected) {
                              setSelectedSubjectCard(null);
                            } else {
                              setSelectedSubjectCard({
                                classId: cls.id,
                                subjectId: shlSubject.id,
                                teacherId: shlTeacherId,
                                assignmentId: shlAssignment?.id || `ASG_SHL_${cls.id}`,
                              });
                              setIsOffMode(false);
                            }
                          }}
                          className={`p-2.5 rounded-xl border-2 cursor-pointer select-none transition-all flex flex-col justify-between min-w-28 sm:min-w-36 shadow-2xs ${
                            isShlSelected
                              ? 'bg-rose-50 border-rose-500 shadow-md ring-2 ring-rose-400 scale-[1.02]'
                              : isShlOver
                              ? 'bg-rose-100/90 border-rose-400 text-rose-950 ring-1 ring-rose-300'
                              : isShlUnder
                              ? 'bg-amber-100/95 border-amber-400 hover:border-amber-500 hover:bg-amber-200/90 text-amber-950 shadow-xs ring-1 ring-amber-300/80'
                              : 'bg-emerald-50/80 border-emerald-300 hover:border-emerald-500 hover:bg-emerald-100/70 text-emerald-950'
                          }`}
                          title={`Tiết Sinh hoạt lớp ${cls.name} (GVCN: ${homeroomTeacher ? homeroomTeacher.name : 'Chưa gán GVCN'}) - Click để xếp linh hoạt vào bất kỳ tiết nào`}
                        >
                          {/* Dòng 1: Icon / Tên Môn / Số tiết / Ca */}
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-black text-xs text-slate-900 flex items-center gap-1">
                              <span className="text-[11px] text-amber-600">👑</span>
                              <span className={isShlUnder ? 'text-amber-950 font-black' : isShlComplete ? 'text-slate-900 font-black' : 'text-slate-900'}>
                                Sinh hoạt
                              </span>
                              <span className={`font-extrabold ${isShlUnder ? 'text-amber-900' : isShlComplete ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {shlAssignedPeriods}
                              </span>
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1 rounded border ${
                                isShlUnder
                                  ? 'text-amber-900 bg-amber-200/90 border-amber-300'
                                  : isShlComplete
                                  ? 'text-emerald-800 bg-emerald-100 border-emerald-200'
                                  : 'text-indigo-800 bg-indigo-100 border-indigo-200'
                              }`}
                            >
                              SC
                            </span>
                          </div>

                          {/* Dòng 2: Nút Thùng rác + Số tiết đã xếp */}
                          <div
                            className={`flex items-center justify-between gap-1 my-1.5 pt-1 border-t ${
                              isShlUnder ? 'border-amber-300/80' : isShlComplete ? 'border-emerald-200' : 'border-indigo-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleClearSubjectInClass(cls.id, shlSubject.id, e)}
                              className={`p-0.5 rounded transition-colors cursor-pointer ${
                                isShlUnder
                                  ? 'text-amber-800 hover:text-rose-700 hover:bg-amber-200'
                                  : 'text-rose-600 hover:text-rose-800 hover:bg-rose-100'
                              }`}
                              title="Xóa tiết Sinh hoạt đã xếp của lớp này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[11px] font-bold text-slate-700">
                              Đã xếp{' '}
                              <strong
                                className={
                                  isShlComplete
                                    ? 'text-emerald-700 font-black'
                                    : isShlOver
                                    ? 'text-rose-700 font-black'
                                    : 'text-amber-900 font-black'
                                }
                              >
                                {shlScheduledCount}
                              </strong>
                              /{shlAssignedPeriods}
                              {isShlComplete && (
                                <span className="ml-1 text-[10px] text-emerald-700 font-black">✓ Đủ</span>
                              )}
                              {isShlUnder && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-[10px] text-amber-950 bg-amber-200/90 px-1 py-0.5 rounded font-black border border-amber-400 shrink-0">
                                    Thiếu {shlAssignedPeriods - shlScheduledCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAutoAssignAllClassesSHL(cls.id);
                                    }}
                                    className="text-[9px] font-black bg-amber-400 hover:bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded shadow-2xs cursor-pointer inline-flex items-center gap-0.5 border border-amber-500 shrink-0"
                                    title="Phân nhanh tiết Sinh hoạt lớp vào Thứ 7 và lưu Firebase"
                                  >
                                    ⚡ Phân T7
                                  </button>
                                </span>
                              )}
                              {isShlOver && (
                                <span className="ml-1 text-[10px] text-rose-700 font-black">⚠ Thừa</span>
                              )}
                            </span>
                          </div>

                          {/* Dòng 3: Tên Giáo viên Chủ nhiệm */}
                          <div
                            className={`text-[11px] font-black truncate text-center py-0.5 px-1 rounded border shadow-2xs flex items-center justify-center gap-1 ${
                              isShlUnder
                                ? 'bg-white/95 text-amber-950 border-amber-300'
                                : isShlComplete
                                ? 'bg-white/90 text-slate-800 border-emerald-200/90'
                                : 'bg-white/95 text-indigo-950 border-indigo-200'
                            }`}
                          >
                            <span className="text-[10px] text-amber-600">👑</span>
                            <span className="truncate">
                              {homeroomTeacher?.shortName || homeroomTeacher?.name || 'Chưa gán GVCN'}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* NÚT "NGHỈ" */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsOffMode(!isOffMode);
                        setSelectedSubjectCard(null);
                      }}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs cursor-pointer transition-all shadow-2xs flex flex-col items-center justify-center min-w-18 ${
                        isOffMode
                          ? 'bg-rose-700 text-white ring-2 ring-rose-400'
                          : 'bg-rose-500 hover:bg-rose-600 text-white'
                      }`}
                    >
                      <span className="text-sm font-black">Nghỉ</span>
                      <span className="text-[9px] opacity-80 font-normal">
                        {isOffMode ? 'Đang chọn' : 'Click để gán'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ======================================================================= */}
        {/* CỘT PHẢI: CHI TIẾT GIÁO VIÊN & LỊCH GIẢNG DẠY                             */}
        {/* ======================================================================= */}
        <div className="w-full xl:w-[260px] shrink-0 space-y-3 sticky top-4">
          <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm p-3 space-y-3">
            {/* Header: Tên GV - Tên Môn - Số tiết / Nút Auto */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="font-black text-xs text-slate-900 truncate">
                {activeTeacher ? (
                  <span>
                    {activeTeacher.shortName || activeTeacher.name} -{' '}
                    <span className="text-rose-600">{activeSubject?.shortName || activeSubject?.name}</span> -{' '}
                    <span className="text-indigo-900 font-extrabold">
                      {teacherStats.scheduled}/{teacherStats.total}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-500 font-normal italic">
                    Chưa chọn môn / giáo viên
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleRunAuto(selectedClassId)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Wand2 className="w-3 h-3" />
                <span>Auto</span>
              </button>
            </div>

            {/* MINI TIMETABLE GRID CỦA GIÁO VIÊN ĐANG CHỌN */}
            {activeTeacher ? (
              <div className="space-y-2">
                <div className="text-[11px] font-black text-slate-700 flex items-center justify-between">
                  <span>Lịch Dạy Của {activeTeacher.name}:</span>
                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {teacherStats.scheduled} tiết toàn trường
                  </span>
                </div>

                <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                  {/* BẢNG SÁNG (5 TIẾT) */}
                  <table className="w-full text-center text-[10px] border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                        {DAYS.map(({ key, label }) => (
                          <th key={key} className="py-1 border-r border-slate-200 last:border-r-0">
                            {label.replace('Thứ ', 'T')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[1, 2, 3, 4, 5].map((period) => (
                        <tr key={`t_m_${period}`}>
                          {DAYS.map(({ key: day }) => {
                            const slot = getTeacherSlotAt(activeTeacher.id, day, 'MORNING', period);
                            const isCC = (day === 2 && period === 1) || slot?.subjectId === 'SUB_CC';
                            const isCurrentClass =
                              selectedSubjectCard && slot?.classId === selectedSubjectCard.classId;

                            if (isCC) {
                              return (
                                <td
                                  key={day}
                                  className="py-1.5 px-0.5 border-r border-slate-100 last:border-r-0 font-black h-6 bg-amber-100/90 text-amber-950 text-center text-[9px]"
                                  title="Chào cờ đầu tuần (Toàn trường tham gia)"
                                >
                                  <span>🚩CC</span>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={day}
                                onClick={() => {
                                  if (slot?.classId && slot.classId !== 'ALL') {
                                    handleSelectClassFromRight(
                                      slot.classId,
                                      slot.subjectId || activeSubject?.id,
                                      activeTeacher.id
                                    );
                                  }
                                }}
                                className={`py-1.5 px-0.5 border-r border-slate-100 last:border-r-0 font-extrabold h-6 transition-all ${
                                  isCurrentClass
                                    ? 'bg-rose-200 text-rose-950 font-black ring-1 ring-rose-400 cursor-pointer shadow-xs'
                                    : slot
                                    ? 'bg-amber-100 text-amber-950 hover:bg-amber-200 hover:ring-1 hover:ring-amber-400 cursor-pointer shadow-2xs hover:scale-105 active:scale-95'
                                    : 'hover:bg-slate-50'
                                }`}
                                title={
                                  slot
                                    ? `Lớp ${classesMap.get(slot.classId)?.name || slot.classId} (${slot.subjectId ? (subjectsMap.get(slot.subjectId)?.shortName || subjectsMap.get(slot.subjectId)?.name || '') : ''} - Sáng T${day}, T${period}) - Nhấn để nhảy sang TKB lớp này (giữ chế độ xem môn GV)`
                                    : undefined
                                }
                              >
                                {slot ? (
                                  classesMap.get(slot.classId)?.code ||
                                  classesMap.get(slot.classId)?.name.replace('Lớp ', '') ||
                                  'Bận'
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

                  {/* Ngăn cách Sáng - Chiều */}
                  <div className="h-1 bg-slate-200 border-y border-slate-300" />

                  {/* BẢNG CHIỀU (4 TIẾT) */}
                  <table className="w-full text-center text-[10px] border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                        {DAYS.map(({ key, label }) => (
                          <th key={key} className="py-1 border-r border-slate-200 last:border-r-0">
                            {label.replace('Thứ ', 'T')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[1, 2, 3, 4].map((period) => (
                        <tr key={`t_a_${period}`}>
                          {DAYS.map(({ key: day }) => {
                            const slot = getTeacherSlotAt(activeTeacher.id, day, 'AFTERNOON', period);
                            const isCurrentClass =
                              selectedSubjectCard && slot?.classId === selectedSubjectCard.classId;

                            return (
                              <td
                                key={day}
                                onClick={() => {
                                  if (slot?.classId && slot.classId !== 'ALL') {
                                    handleSelectClassFromRight(
                                      slot.classId,
                                      slot.subjectId || activeSubject?.id,
                                      activeTeacher.id
                                    );
                                  }
                                }}
                                className={`py-1.5 px-0.5 border-r border-slate-100 last:border-r-0 font-extrabold h-6 transition-all ${
                                  isCurrentClass
                                    ? 'bg-rose-200 text-rose-950 font-black ring-1 ring-rose-400 cursor-pointer shadow-xs'
                                    : slot
                                    ? 'bg-amber-100 text-amber-950 hover:bg-amber-200 hover:ring-1 hover:ring-amber-400 cursor-pointer shadow-2xs hover:scale-105 active:scale-95'
                                    : 'hover:bg-slate-50'
                                }`}
                                title={
                                  slot
                                    ? `Lớp ${classesMap.get(slot.classId)?.name || slot.classId} (${slot.subjectId ? (subjectsMap.get(slot.subjectId)?.shortName || subjectsMap.get(slot.subjectId)?.name || '') : ''} - Chiều T${day}, T${period}) - Nhấn để nhảy sang TKB lớp này (giữ chế độ xem môn GV)`
                                    : undefined
                                }
                              >
                                {slot ? (
                                  classesMap.get(slot.classId)?.code ||
                                  classesMap.get(slot.classId)?.name.replace('Lớp ', '') ||
                                  'Bận'
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

                {/* THÔNG TIN CHI TIẾT CỦA GIÁO VIÊN */}
                <div className="pt-2 text-xs space-y-1.5 border-t border-slate-200">
                  <div className="font-black text-slate-900 text-sm">{activeTeacher.name}</div>
                  <div className="text-slate-600 font-medium">
                    <span className="text-[11px] font-bold text-slate-500 block mb-1">
                      Lớp phụ trách (nhấn để chuyển TKB):
                    </span>
                    <div className="inline-flex flex-wrap gap-1.5">
                      {teacherClasses.map((c) => {
                        const isCurrent = selectedClassId === c.id || selectedSubjectCard?.classId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectClassFromRight(c.id, activeSubject?.id, activeTeacher.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              isCurrent
                                ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400 scale-105'
                                : 'bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 hover:scale-105 active:scale-95'
                            }`}
                            title={`Nhấn để mở và xem TKB lớp ${c.name} (giữ môn của GV)`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                      {teacherClasses.length === 0 && (
                        <span className="text-slate-400 italic text-[11px]">Chưa có lớp</span>
                      )}
                    </div>
                  </div>
                  <div className="text-slate-600 font-medium">
                    Môn giảng dạy:{' '}
                    <span className="font-extrabold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      {activeSubject?.name || 'Môn học'}
                    </span>
                  </div>

                  {/* Tiến độ xếp các lớp khác của giáo viên này */}
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500">
                      Tiến độ theo lớp (nhấn để chuyển lớp):
                    </div>
                    {teacherClasses.map((c) => {
                      const asg = assignments.find(
                        (a) => a.teacherIds.includes(activeTeacher.id) && a.classIds.includes(c.id)
                      );
                      const sched = getScheduledCountForSubjectInClass(c.id, asg?.subjectId || '');
                      const total = asg?.periodsPerWeek || 0;
                      const isCurrent = selectedClassId === c.id || selectedSubjectCard?.classId === c.id;

                      return (
                        <div
                          key={c.id}
                          onClick={() => handleSelectClassFromRight(c.id, asg?.subjectId || activeSubject?.id, activeTeacher.id)}
                          className={`flex items-center justify-between text-[11px] font-bold p-2 rounded-xl border transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-950 ring-2 ring-indigo-200 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-indigo-50/70 hover:border-indigo-200 hover:translate-x-0.5'
                          }`}
                          title={`Nhấn để chuyển sang xem và xếp TKB lớp ${c.name}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-indigo-800 font-black">{c.name}</span>
                            <span className="text-slate-400">-</span>
                            <span>{activeSubject?.shortName || activeSubject?.name} ({total}t)</span>
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              sched === total
                                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                : sched > total
                                ? 'text-rose-700 bg-rose-50 border border-rose-200'
                                : 'text-amber-700 bg-amber-50 border border-amber-200'
                            }`}
                          >
                            Xếp: ({sched}/{total})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                Hãy click vào một thẻ môn học ở phía dưới TKB lớp (ví dụ: CN CN, Văn, Toán...) để xem lịch chi tiết của giáo viên phụ trách tại đây.
              </div>
            )}

            {/* DANH SÁCH GHÉP GIÁO VIÊN / TIẾT ĐẶC THÙ */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="font-black text-xs text-slate-800 uppercase flex items-center justify-between">
                <span>Ghép Giáo Viên & Tiết Đôi</span>
                <span className="text-[10px] text-slate-500 font-normal">Toàn trường</span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
                {slots
                  .filter((s) => s.isMerged || s.isCoTeaching)
                  .slice(0, 8)
                  .map((s) => {
                    const sub = subjectsMap.get(s.subjectId);
                    const teacher = teachersMap.get(s.teacherId);
                    const cls = classesMap.get(s.classId);

                    return (
                      <div
                        key={s.id}
                        className="p-1.5 rounded bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between"
                      >
                        <div className="truncate flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (cls?.id) handleSelectClassFromRight(cls.id, s.subjectId, s.teacherId);
                            }}
                            className="font-bold text-indigo-900 hover:text-indigo-600 hover:underline cursor-pointer"
                            title={`Xem thời khóa biểu lớp ${cls?.name}`}
                          >
                            {cls?.name}:
                          </button>{' '}
                          <span>
                            {s.session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ {s.day} T{s.period} -{' '}
                            {teacher?.shortName || teacher?.name} ({sub?.shortName})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            pushUndo(slots);
                            const updated = slots.filter((item) => item.id !== s.id);
                            setSlots(updated);
                            saveTimetableSlotsToFirebase(updated);
                          }}
                          className="text-rose-600 hover:text-rose-800 p-0.5"
                          title="Hủy gán tiết này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                {slots.filter((s) => s.isMerged || s.isCoTeaching).length === 0 && (
                  <div className="text-[11px] text-slate-400 italic">Chưa có tiết ghép lớp nào.</div>
                )}
              </div>
            </div>

            {/* NGUYỆN VỌNG TOÀN TRƯỜNG */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="font-black text-xs text-slate-800 uppercase flex items-center justify-between">
                <span>Nguyện Vọng Toàn Trường</span>
                <Eye className="w-3.5 h-3.5 text-indigo-600 cursor-pointer" onClick={() => setShowPreferenceModal(true)} />
              </div>

              <div className="space-y-1.5 text-xs text-slate-700">
                {teachers
                  .filter((t) => t.unavailableSlots.length > 0 || (t.preferredSlots && t.preferredSlots.length > 0))
                  .slice(0, 5)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="p-2 rounded-lg bg-indigo-50/70 border border-indigo-200 text-[11px] flex items-start gap-1.5"
                    >
                      <span className="font-black text-indigo-950 shrink-0">{t.shortName || t.name}:</span>
                      <span className="text-slate-600">
                        {t.unavailableSlots.length > 0 &&
                          `Bận: ${t.unavailableSlots.map((u) => `Thứ ${u.day} T${u.period}`).join(', ')}`}
                        {t.preferredSlots &&
                          t.preferredSlots.length > 0 &&
                          ` • Thích: ${t.preferredSlots.map((p) => `Thứ ${p.day} T${p.period}`).join(', ')}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL KIỂM TRA NGUYỆN VỌNG GIÁO VIÊN TOÀN TRƯỜNG                       */}
      {/* ========================================================================= */}
      {showPreferenceModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-indigo-400 max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="font-black text-base text-indigo-950 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                <span>Bảng Kiểm Tra Nguyện Vọng & Ràng Buộc Của Giáo Viên</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowPreferenceModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-3 text-xs">
              {teachers.map((t) => {
                // Kiểm tra xem có vi phạm tiết bận không
                const violations = slots.filter((s) => {
                  const matchT = s.teacherId === t.id || (s.teacherIds && s.teacherIds.includes(t.id));
                  if (!matchT) return false;
                  return t.unavailableSlots.some((u) => u.day === s.day && u.period === s.period);
                });

                return (
                  <div
                    key={t.id}
                    className={`p-3 rounded-xl border ${
                      violations.length > 0
                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-black text-sm">
                      <span>{t.name} ({t.shortName || t.code})</span>
                      {violations.length > 0 ? (
                        <span className="text-xs text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300 font-extrabold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Vi phạm {violations.length} tiết bận
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-extrabold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Hợp lệ
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-xs space-y-1">
                      <div>
                        <strong>Tiết bận (Không thể dạy):</strong>{' '}
                        {t.unavailableSlots.length > 0 ? (
                          t.unavailableSlots.map((u) => `Thứ ${u.day} Tiết ${u.period}`).join(', ')
                        ) : (
                          <span className="text-slate-400 italic">Không có</span>
                        )}
                      </div>
                      <div>
                        <strong>Tiết mong muốn dạy:</strong>{' '}
                        {t.preferredSlots && t.preferredSlots.length > 0 ? (
                          t.preferredSlots.map((p) => `Thứ ${p.day} Tiết ${p.period}`).join(', ')
                        ) : (
                          <span className="text-slate-400 italic">Tự do</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPreferenceModal(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL CẢNH BÁO: ĐỦ SỐ TIẾT PCGD HOẶC TRÙNG LỊCH GIÁO VIÊN              */}
      {/* ========================================================================= */}
      {warningAlert && warningAlert.isOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-rose-300 max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-start gap-3.5 pb-3 border-b border-rose-100">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  warningAlert.type === 'QUOTA_EXCEEDED'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {warningAlert.type === 'QUOTA_EXCEEDED' ? (
                  <AlertTriangle className="w-7 h-7" />
                ) : (
                  <ShieldAlert className="w-7 h-7" />
                )}
              </div>
              <div className="flex-1">
                <div
                  className={`text-[11px] font-black uppercase tracking-wider ${
                    warningAlert.type === 'QUOTA_EXCEEDED' ? 'text-amber-800' : 'text-rose-800'
                  }`}
                >
                  {warningAlert.type === 'QUOTA_EXCEEDED' ? 'Cảnh Báo Đủ Số Tiết' : 'Cảnh Báo Trùng Lịch'}
                </div>
                <h4 className="font-black text-base text-slate-950 leading-snug mt-0.5">
                  {warningAlert.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setWarningAlert(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Khung nội dung cảnh báo chi tiết */}
            <div
              className={`p-4 rounded-2xl border text-xs space-y-3 ${
                warningAlert.type === 'QUOTA_EXCEEDED'
                  ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                  : 'bg-rose-50/80 border-rose-200 text-rose-950'
              }`}
            >
              <div className="font-black text-sm text-slate-900 leading-snug">
                {warningAlert.message}
              </div>

              {warningAlert.type === 'QUOTA_EXCEEDED' && warningAlert.details && (
                <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2 text-slate-800 font-bold">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Lớp học:</span>
                    <span className="font-black text-indigo-950">{warningAlert.details.className}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Môn học:</span>
                    <span className="font-black text-amber-900">{warningAlert.details.subjectName}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium">Số tiết theo PCGD:</span>
                    <span className="font-extrabold text-slate-900">
                      {warningAlert.details.assignedPeriods} tiết / tuần
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Số tiết hiện tại đã xếp:</span>
                    <span className="font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {warningAlert.details.scheduledCount} / {warningAlert.details.assignedPeriods} tiết
                    </span>
                  </div>
                </div>
              )}

              {warningAlert.type === 'TEACHER_CONFLICT' && warningAlert.details && (
                <div className="p-3 bg-white rounded-xl border border-rose-200 space-y-2 text-slate-800 font-bold">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Giáo viên:</span>
                    <span className="font-black text-indigo-950">{warningAlert.details.teacherName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Thời gian bị trùng:</span>
                    <span className="font-black text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {warningAlert.details.session === 'MORNING' ? 'Sáng' : 'Chiều'} Thứ {warningAlert.details.day} Tiết {warningAlert.details.periodNum}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium">Đang có tiết dạy tại:</span>
                    <span className="font-black text-amber-900">
                      {warningAlert.details.conflictingClassName} ({warningAlert.details.conflictingSubjectName})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Lớp đang muốn xếp:</span>
                    <span className="font-extrabold text-slate-900">
                      {warningAlert.details.className} ({warningAlert.details.subjectName})
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] font-semibold text-slate-600 italic">
                {warningAlert.type === 'QUOTA_EXCEEDED'
                  ? '💡 Gợi ý: Nếu cần thay đổi vị trí, vui lòng click vào tiết đã xếp trước đó của môn này trên bảng để gỡ ra trước khi xếp vào vị trí mới.'
                  : '💡 Gợi ý: Mỗi giáo viên chỉ có thể dạy 1 lớp trong cùng 1 tiết học. Vui lòng chọn tiết khác hoặc kiểm tra lại lịch của giáo viên bên cột phải.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWarningAlert(null)}
                className={`px-6 py-2.5 rounded-xl text-white font-black text-xs shadow-md cursor-pointer transition-all ${
                  warningAlert.type === 'QUOTA_EXCEEDED'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                ĐÃ HIỂU & ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL XÁC NHẬN THAO TÁC XÓA (THAY THẾ WINDOW.CONFIRM KHÔNG HOẠT ĐỘNG) */}
      {/* ========================================================================= */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-rose-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                  Xác Nhận Thao Tác
                </div>
                <h4 className="font-black text-base text-slate-900 leading-snug mt-0.5">
                  {confirmDialog.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50/60 rounded-2xl border border-rose-200 text-xs font-semibold text-rose-950 leading-relaxed">
              {confirmDialog.message}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  const onConfirmFn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  onConfirmFn();
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmDialog.confirmLabel || 'Xác nhận xóa'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL BÁO CÁO & NHẮC NHỞ TỰ ĐỘNG XẾP TKB (BẢO TOÀN TIẾT XẾP TAY)       */}
      {/* ========================================================================= */}
      {autoScheduleReportModal && autoScheduleReportModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-amber-300 max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-start gap-3.5 pb-3 border-b border-slate-200 shrink-0">
              <div className="p-3 rounded-2xl bg-amber-100 text-amber-800 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Báo Cáo Tự Động Xếp Bổ Sung
                </div>
                <h4 className="font-black text-base text-slate-950 leading-snug mt-0.5">
                  Kết Quả Tự Động Xếp: {autoScheduleReportModal.targetName}
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Đã bảo toàn 100% các tiết đã xếp tay và tự động điền {autoScheduleReportModal.newlyPlacedCount} tiết vào các ô trống.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoScheduleReportModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar text-xs">
              <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-amber-900 leading-relaxed font-semibold">
                ⚠️ Có <strong>{autoScheduleReportModal.reminders.length}</strong> môn học chưa thể xếp đủ tiết do các ô trống còn lại của lớp bị vướng lịch với các tiết đã xếp tay của giáo viên hoặc lịch bận cá nhân:
              </div>

              {autoScheduleReportModal.reminders.map((rem, idx) => (
                <div
                  key={`${rem.assignmentId}_${idx}`}
                  className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 text-xs font-black">
                        {rem.className}
                      </span>
                      <span>-</span>
                      <span className="text-rose-700">{rem.subjectName}</span>
                      <span>({rem.teacherName})</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-black text-[11px] border border-rose-300">
                      Chưa xếp: {rem.missingPeriods} tiết
                    </span>
                  </div>

                  {/* Lý do vướng */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="font-black text-slate-700 flex items-center gap-1.5 text-[11px] uppercase">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>Chi tiết lý do vướng tại các ô trống của lớp:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 font-medium text-xs pl-1">
                      {rem.reasons.map((r, rIdx) => (
                        <li key={rIdx} className="leading-snug">{r}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Khuyến nghị khắc phục */}
                  <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-200 space-y-1 text-emerald-950">
                    <div className="font-black flex items-center gap-1.5 text-[11px] uppercase text-emerald-800">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Gợi ý & Hướng khắc phục:</span>
                    </div>
                    {rem.recommendations.map((rec, rcIdx) => (
                      <p key={rcIdx} className="text-xs font-semibold leading-relaxed">
                        {rec}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setAutoScheduleReportModal(null)}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md cursor-pointer transition-colors"
              >
                ĐÃ HIỂU & QUAY LẠI LƯỚI TKB
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
