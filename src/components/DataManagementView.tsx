/**
 * Component Quản Lý Phân Công Giảng Dạy (PCGD) & Dữ Liệu Trường
 * 
 * Tính năng chính:
 * 1. Hiển thị toàn bộ danh sách giáo viên dưới dạng ẨN / HIỆN (Accordion)
 * 2. Xác định chính xác Giáo viên Chủ Nhiệm (GVCN) và Giáo viên Bộ môn
 * 3. Khi click chọn giáo viên: Phân công người đó dạy môn nào (chọn nhiều môn), lớp nào (chọn nhiều lớp), số tiết/tuần
 * 4. Tự động liên kết tiết Sinh Hoạt Lớp (SHL) cho GVCN vào Thứ 7
 * 5. Thống kê, chỉnh sửa inline và đối chiếu số tiết thời gian thực
 */

import React, { useState, useMemo } from 'react';
import {
  TeachingAssignment,
  Teacher,
  SchoolClass,
  Room,
  Subject,
  TimetableSlot,
  RoomType,
  PeriodOfDay,
  isSpecialDutySubject,
} from '../types/timetable';
import {
  Users,
  BookOpen,
  School,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Save,
  X,
  FileSpreadsheet,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  Crown,
  Layers,
  Award,
  Filter,
  Cloud,
} from 'lucide-react';
import {
  saveAssignmentToFirebase,
  saveMultipleAssignmentsToFirebase,
  deleteAssignmentFromFirebase,
  replaceAllAssignmentsInFirebase,
  saveTimetableSlotsToFirebase,
} from '../services/firebaseClient';

interface Props {
  assignments: TeachingAssignment[];
  setAssignments?: React.Dispatch<React.SetStateAction<TeachingAssignment[]>>;
  teachers: Teacher[];
  classes: SchoolClass[];
  rooms: Room[];
  subjects: Subject[];
  slots?: TimetableSlot[];
  setSlots?: React.Dispatch<React.SetStateAction<TimetableSlot[]>>;
  onDataUpdated?: () => void;
}

export const DataManagementView: React.FC<Props> = ({
  assignments,
  setAssignments,
  teachers,
  classes,
  rooms,
  subjects,
  slots = [],
  setSlots,
  onDataUpdated,
}) => {
  // Tab chế độ xem: Theo Giáo viên (Accordion) | Theo Lớp | Đối Chiếu | Phòng Học
  const [viewMode, setViewMode] = useState<
    'TEACHER_VIEW' | 'CLASS_VIEW' | 'DISCREPANCY_AUDIT' | 'ROOMS'
  >('TEACHER_VIEW');

  // Tìm kiếm & Lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'HOMEROOM' | 'SUBJECT_ONLY'>('ALL');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('ALL');

  // Trạng thái ẨN / HIỆN (Accordion) cho danh sách Giáo viên
  // Khởi tạo mở giáo viên đầu tiên để người dùng thấy ngay giao diện
  const [expandedTeacherIds, setExpandedTeacherIds] = useState<Set<string>>(
    new Set(teachers[0] ? [teachers[0].id] : [])
  );

  // Helper xác định số tiết mặc định theo môn học
  const getDefaultPeriodsForSubject = (sub?: Subject): number => {
    if (!sub) return 2;
    const name = sub.name.toLowerCase();
    const code = (sub.code || '').toUpperCase();
    if (
      name.includes('toán') ||
      name.includes('văn') ||
      name.includes('ngữ văn') ||
      name.includes('tiếng anh') ||
      name.includes('ngoại ngữ') ||
      code === 'TOAN' ||
      code === 'VAN' ||
      code === 'ENG'
    )
      return 4;
    if (
      name.includes('lý') ||
      name.includes('vật lý') ||
      name.includes('hóa') ||
      name.includes('sinh') ||
      name.includes('sử') ||
      name.includes('địa') ||
      name.includes('tin') ||
      name.includes('tin học')
    )
      return 2;
    if (
      name.includes('sinh hoạt') ||
      code === 'SHL' ||
      name.includes('chào cờ') ||
      code === 'CC'
    )
      return 1;
    return 2;
  };

  // Form phân công riêng cho từng giáo viên (khi mở accordion)
  const [teacherForms, setTeacherForms] = useState<
    Record<
      string,
      {
        selectedSubjectIds: string[];
        subjectPeriods: Record<string, number>; // subId -> số tiết/tuần
        selectedClassIds: string[];
        doublePeriodsAllowed: boolean;
        requiredRoomType: RoomType;
      }
    >
  >({});

  // Modal thêm phân công chung
  const [isAddingGlobalModal, setIsAddingGlobalModal] = useState(false);
  const [globalTeacherId, setGlobalTeacherId] = useState<string>(teachers[0]?.id || '');
  const [globalSubjectId, setGlobalSubjectId] = useState<string>(subjects[0]?.id || '');
  const [globalClassIds, setGlobalClassIds] = useState<string[]>([classes[0]?.id || '']);
  const [globalPeriods, setGlobalPeriods] = useState<number>(3);
  const [globalDoublePeriods, setGlobalDoublePeriods] = useState<boolean>(true);
  const [globalRoomType, setGlobalRoomType] = useState<RoomType>('THEORY');

  // Inline editing số tiết
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingPeriodsValue, setEditingPeriodsValue] = useState<number>(3);

  // Modal cảnh báo trùng phân công chuyên môn
  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    isOpen: boolean;
    conflicts: {
      className: string;
      subjectName: string;
      existingTeacherName: string;
      existingPeriods: number;
    }[];
    onConfirm: () => void;
  } | null>(null);

  // Modal xác nhận xóa phân công PCGD
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    assignmentId: string;
    assignmentTitle: string;
    teacherName?: string;
    subjectName?: string;
    classNames?: string;
    periods?: number;
    isDeleting?: boolean;
  } | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
    if (onDataUpdated) onDataUpdated();
  };

  // Lookup Maps
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const teachersMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  // --- TỰ ĐỘNG PHÁT HIỆN TẤT CẢ PHÂN CÔNG BỊ TRÙNG CÙNG LỚP & MÔN (MÀ KHÔNG PHẢI MÔN GHÉP) ---
  const duplicateAssignmentConflicts = useMemo(() => {
    const conflictsMap = new Map<string, TeachingAssignment[]>();

    assignments.forEach((asg) => {
      // Bỏ qua nếu là môn ghép hợp lệ (isMerged: true hoặc có nhiều lớp/GV)
      if (
        asg.isMerged ||
        (asg.classIds && asg.classIds.length > 1) ||
        (asg.teacherIds && asg.teacherIds.length > 1)
      ) {
        return;
      }
      const sub = subjectsMap.get(asg.subjectId);
      if (
        asg.subjectId === 'SUB_SHL' ||
        asg.subjectId === 'SUB_CC' ||
        sub?.code === 'SHL' ||
        sub?.code === 'CC'
      ) {
        return;
      }

      asg.classIds.forEach((cId) => {
        const key = `${cId}_${asg.subjectId}`;
        const list = conflictsMap.get(key) || [];
        list.push(asg);
        conflictsMap.set(key, list);
      });
    });

    const resultList: {
      key: string;
      classId: string;
      className: string;
      subjectId: string;
      subjectName: string;
      assignments: TeachingAssignment[];
    }[] = [];

    conflictsMap.forEach((list, key) => {
      if (list.length > 1) {
        const [classId, subjectId] = key.split('_');
        const cls = classesMap.get(classId);
        const sub = subjectsMap.get(subjectId);
        resultList.push({
          key,
          classId,
          className: cls?.name || classId,
          subjectId,
          subjectName: sub?.name || subjectId,
          assignments: list,
        });
      }
    });

    return resultList;
  }, [assignments, subjectsMap, classesMap]);

  // Toggle mở / đóng 1 giáo viên
  const toggleTeacherExpand = (teacherId: string) => {
    setExpandedTeacherIds((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  // Mở tất cả / Thu gọn tất cả
  const handleExpandAll = () => {
    setExpandedTeacherIds(new Set(teachers.map((t) => t.id)));
  };

  const handleCollapseAll = () => {
    setExpandedTeacherIds(new Set());
  };

  // Khởi tạo hoặc lấy Form State của 1 GV (Mặc định chưa tích chọn môn nào để tránh thừa)
  const getTeacherForm = (teacher: Teacher) => {
    if (teacherForms[teacher.id]) return teacherForms[teacher.id];

    const initialPeriods: Record<string, number> = {};
    subjects.forEach((s) => {
      initialPeriods[s.id] = getDefaultPeriodsForSubject(s);
    });

    return {
      selectedSubjectIds: [],
      subjectPeriods: initialPeriods,
      selectedClassIds: [],
      doublePeriodsAllowed: true,
      requiredRoomType: 'THEORY' as RoomType,
    };
  };

  // Cập nhật Form State cho 1 GV
  const updateTeacherForm = (
    teacherId: string,
    updates: Partial<{
      selectedSubjectIds: string[];
      subjectPeriods: Record<string, number>;
      selectedClassIds: string[];
      doublePeriodsAllowed: boolean;
      requiredRoomType: RoomType;
    }>
  ) => {
    setTeacherForms((prev) => {
      const current = prev[teacherId] || {
        selectedSubjectIds: [],
        subjectPeriods: {},
        selectedClassIds: [],
        doublePeriodsAllowed: true,
        requiredRoomType: 'THEORY',
      };
      return {
        ...prev,
        [teacherId]: {
          ...current,
          ...updates,
          subjectPeriods: {
            ...current.subjectPeriods,
            ...(updates.subjectPeriods || {}),
          },
        },
      };
    });
  };

  // --- TÍNH TOÁN TỔNG SỐ TIẾT CHO TỪNG GIÁO VIÊN ---
  // QUY TẮC NGHIỆP VỤ: Không đếm tiết Sinh hoạt lớp hoặc tiết Chào cờ, chỉ đếm những môn được phân công trong PCGD
  const teacherStats = useMemo(() => {
    return teachers.map((teacher) => {
      // Phân công chuyên môn của GV (bỏ qua Chào cờ & Sinh hoạt lớp)
      const teacherAssignments = assignments.filter(
        (asg) =>
          asg.teacherIds.includes(teacher.id) &&
          !isSpecialDutySubject(asg.subjectId, subjectsMap.get(asg.subjectId), asg.id)
      );

      // Tổng số tiết được giao trong tuần theo PCGD
      const totalAssignedPeriods = teacherAssignments.reduce(
        (sum, asg) =>
          sum +
          (asg.isMerged
            ? asg.periodsPerWeek
            : asg.periodsPerWeek * (asg.classIds.length || 1)),
        0
      );

      // Tập hợp ID phân công của giáo viên này
      const teacherAssignmentIds = new Set(teacherAssignments.map((a) => a.id));

      // Tập hợp các cặp (classId_subjectId) mà giáo viên này được phân công trong PCGD
      const teacherClassSubjectMap = new Set<string>();
      teacherAssignments.forEach((a) => {
        a.classIds.forEach((cId) => {
          teacherClassSubjectMap.add(`${cId}_${a.subjectId}`);
        });
      });

      // Số tiết thực tế trên TKB (chỉ đếm những môn được phân công trong PCGD, KHÔNG đếm Sinh hoạt hay Chào cờ)
      const scheduledUniqueSlots = new Set<string>();
      slots.forEach((s) => {
        const sub = subjectsMap.get(s.subjectId);
        // Bỏ qua tuyệt đối tiết Sinh hoạt lớp hoặc Chào cờ
        if (isSpecialDutySubject(s.subjectId, sub, s.assignmentId)) {
          return;
        }

        // Kiểm tra xem slot có thuộc về giáo viên này không:
        // 1. Trực tiếp gán teacherId hoặc teacherIds
        const directMatch =
          s.teacherId === teacher.id ||
          (s.teacherIds && s.teacherIds.includes(teacher.id));

        // 2. Khớp theo assignmentId của phân công
        const assignmentMatch = !!(s.assignmentId && teacherAssignmentIds.has(s.assignmentId));

        // 3. Khớp theo Lớp và Môn mà giáo viên này được phân công trong PCGD
        // (Giải quyết trường hợp vừa tạo PCGD mới nhưng TKB đã phân tiết sẵn từ trước)
        const matchClassSubject =
          teacherClassSubjectMap.has(`${s.classId}_${s.subjectId}`) ||
          (Array.isArray(s.classIds) &&
            s.classIds.some((cId) => teacherClassSubjectMap.has(`${cId}_${s.subjectId}`)));

        if (!directMatch && !assignmentMatch && !matchClassSubject) {
          return;
        }

        // Chuẩn hóa Session & Period để không bị đè giữa Sáng và Chiều
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);

        // Với tiết ghép: Nhiều lớp học cùng 1 giờ tính là 1 tiết dạy của GV
        // Với các lớp riêng biệt: Mỗi lớp tính là 1 tiết dạy
        const slotKey = s.isMerged
          ? `MERGED_${s.day}_${sSess}_${sPeriod}_${s.subjectId}`
          : `${s.day}_${sSess}_${sPeriod}_${s.classId || (s.classIds ? s.classIds[0] : s.id)}`;

        scheduledUniqueSlots.add(slotKey);
      });
      const actualScheduledPeriods = scheduledUniqueSlots.size;

      // Chênh lệch thừa / thiếu so với PCGD
      const diff = actualScheduledPeriods - totalAssignedPeriods;
      let status: 'EXACT' | 'DEFICIT' | 'SURPLUS' = 'EXACT';
      if (diff < 0) status = 'DEFICIT';
      else if (diff > 0) status = 'SURPLUS';

      // Xác định các lớp chủ nhiệm của GV này
      const homeroomClasses = classes.filter((c) => c.homeroomTeacherId === teacher.id);
      const isHomeroom = homeroomClasses.length > 0;

      return {
        teacher,
        assignments: teacherAssignments,
        totalAssignedPeriods,
        actualScheduledPeriods,
        diff,
        status,
        homeroomClasses,
        isHomeroom,
        quota: teacher.maxPeriodsPerWeek || 18,
      };
    });
  }, [teachers, assignments, slots, classes, subjectsMap]);

  // --- TÍNH TOÁN TỔNG SỐ TIẾT CHO TỪNG LỚP HỌC ---
  // QUY TẮC NGHIỆP VỤ: Chỉ đếm các môn chuyên môn PCGD, không đếm Sinh hoạt hay Chào cờ
  const classStats = useMemo(() => {
    return classes.map((cls) => {
      const classAssignments = assignments.filter(
        (asg) =>
          asg.classIds.includes(cls.id) &&
          !isSpecialDutySubject(asg.subjectId, subjectsMap.get(asg.subjectId), asg.id)
      );
      const totalClassPeriods = classAssignments.reduce((sum, asg) => sum + asg.periodsPerWeek, 0);

      const actualSlots = slots.filter((s) => {
        const matchClass = s.classId === cls.id || (s.classIds && s.classIds.includes(cls.id));
        if (!matchClass) return false;
        const sub = subjectsMap.get(s.subjectId);
        if (isSpecialDutySubject(s.subjectId, sub, s.assignmentId)) return false;
        return true;
      });
      const uniqueTimePoints = new Set(
        actualSlots.map((s) => {
          const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
          const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
          return `${s.day}_${sSess}_${sPeriod}`;
        })
      );
      const actualScheduledPeriods = uniqueTimePoints.size;
      const diff = actualScheduledPeriods - totalClassPeriods;

      let status: 'EXACT' | 'DEFICIT' | 'SURPLUS' = 'EXACT';
      if (diff < 0) status = 'DEFICIT';
      else if (diff > 0) status = 'SURPLUS';

      return {
        cls,
        assignments: classAssignments,
        totalClassPeriods,
        actualScheduledPeriods,
        diff,
        status,
      };
    });
  }, [classes, assignments, slots, subjectsMap]);

  // Tổng số tiết toàn trường (chỉ đếm các môn chuyên môn PCGD)
  const totalSchoolAssignedPeriods = useMemo(() => {
    return assignments
      .filter((a) => !isSpecialDutySubject(a.subjectId, subjectsMap.get(a.subjectId), a.id))
      .reduce((sum, a) => sum + a.periodsPerWeek, 0);
  }, [assignments, subjectsMap]);

  // Lọc danh sách giáo viên
  const filteredTeacherStats = useMemo(() => {
    return teacherStats.filter((item) => {
      // 1. Tìm theo từ khóa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.teacher.name.toLowerCase().includes(q);
        const matchCode = item.teacher.code.toLowerCase().includes(q);
        const matchShort = (item.teacher.shortName || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchShort) return false;
      }

      // 2. Lọc theo vai trò (GVCN vs Bộ môn)
      if (filterRole === 'HOMEROOM' && !item.isHomeroom) return false;
      if (filterRole === 'SUBJECT_ONLY' && item.isHomeroom) return false;

      // 3. Lọc theo môn chuyên môn
      if (filterSubjectId !== 'ALL') {
        const teachesSubject = item.teacher.subjects?.includes(filterSubjectId);
        const hasAssignedSubject = item.assignments.some((a) => a.subjectId === filterSubjectId);
        if (!teachesSubject && !hasAssignedSubject) return false;
      }

      return true;
    });
  }, [teacherStats, searchQuery, filterRole, filterSubjectId]);

  // --- HÀM LƯU PHÂN CÔNG TỪ ACCORDION FORM CỦA 1 GIÁO VIÊN ---
  const handleSaveTeacherAssignments = (teacher: Teacher) => {
    if (!setAssignments) return;

    const form = getTeacherForm(teacher);
    if (form.selectedSubjectIds.length === 0 || form.selectedClassIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 Môn học và ít nhất 1 Lớp học để phân công!');
      return;
    }

    // Kiểm tra trùng phân công chuyên môn với GV khác (khi chưa ghép lớp)
    const conflicts: {
      className: string;
      subjectName: string;
      existingTeacherName: string;
      existingPeriods: number;
    }[] = [];

    form.selectedSubjectIds.forEach((subId) => {
      form.selectedClassIds.forEach((classId) => {
        const existingOtherAsg = assignments.find(
          (a) =>
            !a.teacherIds.includes(teacher.id) &&
            a.subjectId === subId &&
            a.classIds.includes(classId) &&
            !a.isMerged
        );
        if (existingOtherAsg) {
          const otherTeacher = teachersMap.get(existingOtherAsg.teacherIds[0]);
          const cls = classesMap.get(classId);
          const sub = subjectsMap.get(subId);
          conflicts.push({
            className: cls?.name || classId,
            subjectName: sub?.name || subId,
            existingTeacherName: otherTeacher?.name || 'GV khác',
            existingPeriods: existingOtherAsg.periodsPerWeek,
          });
        }
      });
    });

    const executeSave = () => {
      const newAssignmentsList = [...assignments];
      let addedCount = 0;
      let updatedCount = 0;

      // Duyệt qua từng môn đã chọn × từng lớp đã chọn
      form.selectedSubjectIds.forEach((subId) => {
        const subjectObj = subjectsMap.get(subId);
        const periods =
          form.subjectPeriods?.[subId] !== undefined
            ? form.subjectPeriods[subId]
            : getDefaultPeriodsForSubject(subjectObj);

        form.selectedClassIds.forEach((classId) => {
          // Kiểm tra xem đã có phân công môn này cho lớp này với GV này chưa
          const existingIdx = newAssignmentsList.findIndex(
            (asg) =>
              asg.teacherIds.includes(teacher.id) &&
              asg.subjectId === subId &&
              asg.classIds.includes(classId) &&
              asg.classIds.length === 1 // Phân công lớp riêng
          );

          if (existingIdx !== -1) {
            // Cập nhật số tiết
            newAssignmentsList[existingIdx] = {
              ...newAssignmentsList[existingIdx],
              periodsPerWeek: periods,
              doublePeriodsAllowed: form.doublePeriodsAllowed,
              requiredRoomType: form.requiredRoomType,
            };
            updatedCount++;
          } else {
            // Tạo mới
            const newAsg: TeachingAssignment = {
              id: `ASG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              subjectId: subId,
              teacherIds: [teacher.id],
              classIds: [classId],
              periodsPerWeek: periods,
              requiredRoomType: form.requiredRoomType,
              isMerged: false,
              doublePeriodsAllowed: form.doublePeriodsAllowed,
              priorityLevel: 1,
            };
            newAssignmentsList.push(newAsg);
            addedCount++;
          }
        });
      });

      setAssignments(newAssignmentsList);
      replaceAllAssignmentsInFirebase(newAssignmentsList);

      // Tự động gán giáo viên vào các slot TKB đã phân trước đó cho môn và lớp này
      if (setSlots && slots && slots.length > 0) {
        let slotsModified = false;
        const updatedSlots = slots.map((s) => {
          if (form.selectedClassIds.includes(s.classId) && form.selectedSubjectIds.includes(s.subjectId)) {
            if (!s.teacherId || s.teacherId !== teacher.id) {
              slotsModified = true;
              return {
                ...s,
                teacherId: teacher.id,
                teacherIds: [teacher.id],
              };
            }
          }
          return s;
        });
        if (slotsModified) {
          setSlots(updatedSlots);
          saveTimetableSlotsToFirebase(updatedSlots);
        }
      }

      // Reset lại lựa chọn môn và lớp
      updateTeacherForm(teacher.id, { selectedClassIds: [], selectedSubjectIds: [] });

      showToast(
        `Đã lưu phân công cho ${teacher.name} lên Firebase (${addedCount} mới, ${updatedCount} cập nhật)!`
      );
    };

    if (conflicts.length > 0) {
      setDuplicateWarningModal({
        isOpen: true,
        conflicts,
        onConfirm: executeSave,
      });
    } else {
      executeSave();
    }
  };

  // --- HÀM GÁN TIẾT SINH HOẠT LỚP CHO GVCN (1-Click) ---
  const handleQuickAssignHomeroomSHL = async (teacher: Teacher, classObj: SchoolClass) => {
    if (!setAssignments) return;

    let shlSub = subjects.find(
      (s) => s.code === 'SHL' || s.name.toLowerCase().includes('sinh hoạt') || s.id === 'SUB_SHL'
    );
    const shlSubId = shlSub ? shlSub.id : 'SUB_SHL';

    const newAssignmentsList = [...assignments];
    const existingIdx = newAssignmentsList.findIndex(
      (asg) =>
        asg.classIds.includes(classObj.id) &&
        (asg.subjectId === shlSubId ||
          subjectsMap.get(asg.subjectId)?.code === 'SHL' ||
          subjectsMap.get(asg.subjectId)?.name.toLowerCase().includes('sinh hoạt'))
    );

    let savedItem: TeachingAssignment;
    if (existingIdx !== -1) {
      savedItem = {
        ...newAssignmentsList[existingIdx],
        teacherIds: [teacher.id],
        periodsPerWeek: 1,
        preferredDay: 7, // Thứ 7
      };
      newAssignmentsList[existingIdx] = savedItem;
    } else {
      savedItem = {
        id: `ASG_SHL_${classObj.code || classObj.id}`,
        subjectId: shlSubId,
        teacherIds: [teacher.id],
        classIds: [classObj.id],
        periodsPerWeek: 1,
        requiredRoomType: 'THEORY',
        isMerged: false,
        doublePeriodsAllowed: false,
        preferredDay: 7, // Thứ 7
        priorityLevel: 10,
      };
      newAssignmentsList.push(savedItem);
    }

    setAssignments(newAssignmentsList);
    await saveAssignmentToFirebase(savedItem);

    // Đồng thời tạo và lưu luôn Slot vào Thời Khóa Biểu (Thứ 7 Tiết 5 Sáng / Tiết 4 Chiều)
    if (setSlots) {
      const classShift = classObj.shift || 'MORNING';
      const session: 'MORNING' | 'AFTERNOON' = classShift === 'AFTERNOON' ? 'AFTERNOON' : 'MORNING';
      const periodNum = classShift === 'AFTERNOON' ? 4 : 5;

      const filteredSlots = slots.filter((s) => {
        const matchClass = s.classId === classObj.id || (s.classIds && s.classIds.includes(classObj.id));
        if (!matchClass) return true;
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
        const isSlotShl =
          s.subjectId === shlSubId ||
          s.subjectId === 'SUB_SHL' ||
          subjectsMap.get(s.subjectId)?.code === 'SHL' ||
          subjectsMap.get(s.subjectId)?.name.toLowerCase().includes('sinh hoạt') ||
          (s.assignmentId && s.assignmentId.toLowerCase().includes('shl'));
        if (isSlotShl) return false;
        return !(s.day === 7 && sSess === session && sPeriod === periodNum);
      });

      const newSlot: TimetableSlot = {
        id: `SLOT_SHL_${classObj.id}_D7_P${periodNum}_${session}`,
        day: 7,
        period: periodNum as PeriodOfDay,
        session,
        classId: classObj.id,
        classIds: [classObj.id],
        teacherId: teacher.id,
        teacherIds: [teacher.id],
        roomId: rooms[0]?.id || 'R_DEFAULT',
        assignmentId: savedItem.id,
        subjectId: shlSubId,
        isMerged: false,
        isCoTeaching: false,
      };

      const finalSlots = [...filteredSlots, newSlot];
      setSlots(finalSlots);
      await saveTimetableSlotsToFirebase(finalSlots);
    }

    onDataUpdated?.();
    showToast(`Đã gán 1 tiết SHL (${classObj.name}) cho GVCN ${teacher.name} vào Thứ 7 & lưu Firebase!`);
  };

  // --- TỰ ĐỘNG GÁN TIẾT SHL TOÀN TRƯỜNG CHO TẤT CẢ GVCN ---
  const handleAutoAssignAllHomeroomSHL = async () => {
    if (!setAssignments) return;

    let shlSub = subjects.find(
      (s) => s.code === 'SHL' || s.name.toLowerCase().includes('sinh hoạt') || s.id === 'SUB_SHL'
    );
    const shlSubId = shlSub ? shlSub.id : 'SUB_SHL';

    let count = 0;
    const newAssignments = [...assignments];

    classes.forEach((cls) => {
      if (!cls.homeroomTeacherId) return;

      const existingIdx = newAssignments.findIndex(
        (asg) =>
          asg.classIds.includes(cls.id) &&
          (asg.subjectId === shlSubId ||
            subjectsMap.get(asg.subjectId)?.code === 'SHL' ||
            subjectsMap.get(asg.subjectId)?.name.toLowerCase().includes('sinh hoạt'))
      );

      if (existingIdx !== -1) {
        newAssignments[existingIdx] = {
          ...newAssignments[existingIdx],
          teacherIds: [cls.homeroomTeacherId],
          preferredDay: 7,
        };
        count++;
      } else {
        newAssignments.push({
          id: `ASG_SHL_${cls.code || cls.id}`,
          subjectId: shlSubId,
          teacherIds: [cls.homeroomTeacherId],
          classIds: [cls.id],
          periodsPerWeek: 1,
          requiredRoomType: 'THEORY',
          isMerged: false,
          doublePeriodsAllowed: false,
          preferredDay: 7,
          priorityLevel: 10,
        });
        count++;
      }
    });

    setAssignments(newAssignments);
    await replaceAllAssignmentsInFirebase(newAssignments);

    // Đồng thời tạo và lưu toàn bộ Slots vào Thời Khóa Biểu (Thứ 7 Tiết 5 Sáng / Tiết 4 Chiều)
    if (setSlots) {
      let currentSlots = [...slots];

      classes.forEach((cls) => {
        if (!cls.homeroomTeacherId) return;
        const classShift = cls.shift || 'MORNING';
        const session: 'MORNING' | 'AFTERNOON' = classShift === 'AFTERNOON' ? 'AFTERNOON' : 'MORNING';
        const periodNum = classShift === 'AFTERNOON' ? 4 : 5;

        // Xóa slot cũ
        currentSlots = currentSlots.filter((s) => {
          if (s.classId !== cls.id && !(s.classIds && s.classIds.includes(cls.id))) return true;
          const isSlotShl =
            s.subjectId === shlSubId ||
            s.subjectId === 'SUB_SHL' ||
            subjectsMap.get(s.subjectId)?.code === 'SHL' ||
            subjectsMap.get(s.subjectId)?.name.toLowerCase().includes('sinh hoạt') ||
            (s.assignmentId && s.assignmentId.toLowerCase().includes('shl'));
          if (isSlotShl) return false;
          const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
          const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
          return !(s.day === 7 && sSess === session && sPeriod === periodNum);
        });

        currentSlots.push({
          id: `SLOT_SHL_${cls.id}_D7_P${periodNum}_${session}`,
          day: 7,
          period: periodNum as PeriodOfDay,
          session,
          classId: cls.id,
          classIds: [cls.id],
          teacherId: cls.homeroomTeacherId,
          teacherIds: [cls.homeroomTeacherId],
          roomId: rooms[0]?.id || 'R_DEFAULT',
          assignmentId: `ASG_SHL_${cls.id}`,
          subjectId: shlSubId,
          isMerged: false,
          isCoTeaching: false,
        });
      });

      setSlots(currentSlots);
      await saveTimetableSlotsToFirebase(currentSlots);
    }

    onDataUpdated?.();
    showToast(`✓ Đã gán phân công & lưu Firebase ${count} tiết Sinh hoạt lớp vào Thứ 7 cho toàn bộ GVCN!`);
  };

  // --- HÀM SỬA NHANH SỐ TIẾT INLINE ---
  const handleSaveInlinePeriods = (assignmentId: string) => {
    if (!setAssignments) return;
    const target = assignments.find((a) => a.id === assignmentId);
    if (target) {
      const updated = { ...target, periodsPerWeek: Number(editingPeriodsValue) || 1 };
      setAssignments((prev) =>
        prev.map((asg) => (asg.id === assignmentId ? updated : asg))
      );
      saveAssignmentToFirebase(updated);
    }
    setEditingAssignmentId(null);
    showToast('Đã cập nhật số tiết giảng dạy & lưu Firebase!');
  };

  // --- MỞ MODAL CẢNH BÁO XÁC NHẬN XÓA PHÂN CÔNG ---
  const handleOpenDeleteAssignmentModal = (asg: TeachingAssignment) => {
    const sub = subjectsMap.get(asg.subjectId);
    const teacher = teachersMap.get(asg.teacherIds[0]);
    const classNames = asg.classIds.map((c) => classesMap.get(c)?.name || c).join(', ');
    setDeleteConfirmModal({
      isOpen: true,
      assignmentId: asg.id,
      assignmentTitle: `${sub?.name || asg.subjectId} - Lớp: ${classNames}`,
      teacherName: teacher?.name || 'Giáo viên',
      subjectName: sub?.name || asg.subjectId,
      classNames: classNames,
      periods: asg.periodsPerWeek,
      isDeleting: false,
    });
  };

  // --- THỰC HIỆN XÓA PHÂN CÔNG TRÊN CHƯƠNG TRÌNH & FIREBASE ---
  const handleConfirmExecuteDelete = async () => {
    if (!deleteConfirmModal || !setAssignments) return;

    setDeleteConfirmModal((prev) => (prev ? { ...prev, isDeleting: true } : null));

    const assignmentId = deleteConfirmModal.assignmentId;
    const title = deleteConfirmModal.assignmentTitle;

    try {
      // 1. Xóa ngay trên state giao diện React
      setAssignments((prev) => prev.filter((asg) => asg.id !== assignmentId));

      // 2. Xóa trên Firebase Firestore
      await deleteAssignmentFromFirebase(assignmentId);

      setDeleteConfirmModal(null);
      showToast(`✓ Đã xóa phân công "${title}" khỏi chương trình & Firebase!`);
    } catch (err) {
      console.error('Lỗi khi xóa phân công trên Firebase:', err);
      setDeleteConfirmModal(null);
      showToast(`Đã xóa phân công trên giao diện.`);
    }
  };

  // --- MODAL THÊM PHÂN CÔNG TOÀN CỤC ---
  const handleCreateGlobalAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setAssignments) return;

    if (!globalTeacherId || !globalSubjectId || globalClassIds.length === 0) {
      alert('Vui lòng chọn đầy đủ Giáo viên, Môn học và ít nhất 1 Lớp!');
      return;
    }

    const isMerged = globalClassIds.length > 1;
    const newAsg: TeachingAssignment = {
      id: `ASG_${Date.now()}`,
      subjectId: globalSubjectId,
      teacherIds: [globalTeacherId],
      classIds: globalClassIds,
      periodsPerWeek: Number(globalPeriods) || 2,
      requiredRoomType: globalRoomType,
      isMerged,
      doublePeriodsAllowed: globalDoublePeriods,
      priorityLevel: isMerged ? 8 : 1,
    };

    setAssignments((prev) => [newAsg, ...prev]);
    saveAssignmentToFirebase(newAsg);

    // Tự động cập nhật giáo viên vào các slot TKB đã xếp sẵn của các lớp này
    if (setSlots && slots && slots.length > 0) {
      let slotsChanged = false;
      const updatedSlots = slots.map((s) => {
        if (globalClassIds.includes(s.classId) && s.subjectId === globalSubjectId) {
          if (!s.teacherId || s.teacherId !== globalTeacherId) {
            slotsChanged = true;
            return {
              ...s,
              teacherId: globalTeacherId,
              teacherIds: [globalTeacherId],
              assignmentId: newAsg.id,
            };
          }
        }
        return s;
      });
      if (slotsChanged) {
        setSlots(updatedSlots);
        saveTimetableSlotsToFirebase(updatedSlots);
      }
    }

    setIsAddingGlobalModal(false);

    const teacherObj = teachersMap.get(globalTeacherId);
    const subObj = subjectsMap.get(globalSubjectId);
    showToast(
      `Đã phân công ${teacherObj?.name} dạy ${subObj?.name} (${newAsg.periodsPerWeek} tiết/tuần) & lưu Firebase!`
    );
  };

  // Tự động rà soát & đồng bộ giáo viên vào các slot TKB đã phân tiết sẵn khi có phân công mới
  React.useEffect(() => {
    if (!setSlots || !slots || slots.length === 0 || !assignments || assignments.length === 0) return;

    let hasChanges = false;
    const updatedSlots = slots.map((s) => {
      if (s.subjectId === 'SUB_OFF' || s.subjectId === 'SUB_CC' || s.subjectId === 'SUB_SHL') return s;

      const matchedAsg = assignments.find((a) => {
        const matchClass =
          a.classIds.includes(s.classId) ||
          (Array.isArray(s.classIds) && s.classIds.some((cid) => a.classIds.includes(cid)));
        return matchClass && a.subjectId === s.subjectId && a.teacherIds.length > 0;
      });

      if (matchedAsg && matchedAsg.teacherIds[0]) {
        const assignedTeacherId = matchedAsg.teacherIds[0];
        if (s.teacherId !== assignedTeacherId || s.assignmentId !== matchedAsg.id) {
          hasChanges = true;
          return {
            ...s,
            teacherId: assignedTeacherId,
            teacherIds: matchedAsg.teacherIds,
            assignmentId: matchedAsg.id,
          };
        }
      }
      return s;
    });

    if (hasChanges) {
      setSlots(updatedSlots);
      saveTimetableSlotsToFirebase(updatedSlots);
    }
  }, [assignments, slots]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-100 border-2 border-emerald-500 rounded-xl text-emerald-950 font-black text-sm flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-xs font-black cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* 3 Thẻ KPI Thống kê Tổng Số Tiết Toàn Trường */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-indigo-950 text-white border-2 border-indigo-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-indigo-300">
              Tổng Số Tiết Phân Công Toàn Trường
            </span>
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="mt-3 text-3xl font-black text-white">
            {totalSchoolAssignedPeriods} <span className="text-base font-bold text-indigo-300">tiết/tuần</span>
          </div>
          <p className="mt-1 text-xs text-indigo-200 font-semibold">
            Áp dụng cho {assignments.length} phân công giảng dạy
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white text-slate-900 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-600">
              Giáo Viên Có Tiết Giảng Dạy
            </span>
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="mt-3 text-3xl font-black text-slate-950">
            {teacherStats.filter((t) => t.totalAssignedPeriods > 0).length} / {teachers.length}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-semibold">
            <span className="text-amber-800 font-bold">
              👑 {teacherStats.filter((t) => t.isHomeroom).length} GVCN
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">
              {teacherStats.filter((t) => !t.isHomeroom).length} GV Bộ môn
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white text-slate-900 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-600">
              Khớp Số Tiết Với TKB Thực Tế
            </span>
            <Clock className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-800">
            {teacherStats.filter((t) => t.status === 'EXACT').length} / {teachers.length} GV
          </div>
          <p className="mt-1 text-xs text-slate-600 font-semibold">
            {teacherStats.filter((t) => t.status !== 'EXACT').length === 0
              ? '★ 100% Giáo viên đã được xếp đủ số tiết!'
              : `Có ${teacherStats.filter((t) => t.status !== 'EXACT').length} GV bị lệch số tiết`}
          </p>
        </div>
      </div>

      {/* CẢNH BÁO TRÙNG PHÂN CÔNG CHUYÊN MÔN (CHƯA GHÉP LỚP) */}
      {duplicateAssignmentConflicts.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-rose-950 font-black text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>
                Cảnh Báo: Phát hiện {duplicateAssignmentConflicts.length} môn học bị phân công trùng 2+ giáo viên (Chưa được ghép lớp)
              </span>
            </div>
            <span className="text-xs text-rose-800 font-extrabold bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
              ⚠️ Gây ra hiện tượng thời khóa biểu xếp 2 người cùng dạy
            </span>
          </div>

          <p className="text-xs text-rose-900 font-medium leading-relaxed">
            Các lớp dưới đây có 2 phân công chuyên môn riêng lẻ cho cùng 1 môn học. Nếu đây là môn 2 giáo viên dạy chung (Co-teaching), thầy/cô cần vào menu <strong>'Ghép Lớp'</strong> để tạo nhóm ghép. Ngược lại, hãy xóa phân công thừa bên dưới:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 border-t border-rose-200">
            {duplicateAssignmentConflicts.map((item) => {
              const teacherNames = item.assignments
                .map((a) => {
                  const t = teachersMap.get(a.teacherIds[0]);
                  return `${t?.shortName || t?.name || 'GV'} (${a.periodsPerWeek} tiết)`;
                })
                .join(', ');
              return (
                <div
                  key={item.key}
                  className="p-3 bg-white rounded-xl border border-rose-300 flex items-center justify-between gap-2 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <span className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-[10px] font-black">
                        Lớp {item.className}
                      </span>
                      <span className="text-rose-700 font-extrabold">{item.subjectName}</span>
                    </div>
                    <div className="text-[11px] text-slate-700 font-bold mt-1">
                      Các GV đã gán: <span className="text-rose-800 font-black">{teacherNames}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        {/* Navigation Tabs & Actions Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex bg-slate-200/90 p-1.5 rounded-xl text-xs font-bold text-slate-700 border border-slate-300 flex-wrap gap-1">
            <button
              onClick={() => setViewMode('TEACHER_VIEW')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'TEACHER_VIEW'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Phân Công Giáo Viên ({teachers.length})</span>
            </button>

            <button
              onClick={() => setViewMode('CLASS_VIEW')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'CLASS_VIEW'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <School className="w-4 h-4 text-emerald-400" />
              <span>Phân Công Theo Lớp ({classes.length})</span>
            </button>

            <button
              onClick={() => setViewMode('DISCREPANCY_AUDIT')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'DISCREPANCY_AUDIT'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span>Đối Chiếu Thừa / Thiếu</span>
            </button>

            <button
              onClick={() => setViewMode('ROOMS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'ROOMS'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span>Phòng Học ({rooms.length})</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleAutoAssignAllHomeroomSHL}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition-all cursor-pointer"
              title="Tự động gán 1 tiết Sinh Hoạt Lớp (Thứ 7 Tiết 5) cho toàn bộ Giáo Viên Chủ Nhiệm"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Gán Tiết SHL (Toàn Trường)</span>
            </button>

            <button
              onClick={() => setIsAddingGlobalModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Phân Công Mới</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 1. CHẾ ĐỘ XEM: DANH SÁCH GIÁO VIÊN DẠNG ẨN / HIỆN (ACCORDION)        */}
        {/* =================================================================== */}
        {viewMode === 'TEACHER_VIEW' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Thanh Tìm Kiếm, Bộ Lọc & Nút Mở/Thu Gọn Tất Cả */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Ô tìm kiếm */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, mã GV..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 font-bold border border-slate-300 rounded-lg bg-white text-slate-900 w-44 sm:w-60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Bộ lọc Vai trò GVCN */}
                <div className="flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value as any)}
                    className="py-1.5 px-2.5 font-bold border border-slate-300 rounded-lg bg-white text-slate-900 cursor-pointer"
                  >
                    <option value="ALL">Tất cả vai trò ({teachers.length})</option>
                    <option value="HOMEROOM">👑 Chỉ Giáo Viên Chủ Nhiệm</option>
                    <option value="SUBJECT_ONLY">Giáo Viên Bộ Môn</option>
                  </select>
                </div>

                {/* Bộ lọc Môn học */}
                <select
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                  className="py-1.5 px-2.5 font-bold border border-slate-300 rounded-lg bg-white text-slate-900 cursor-pointer"
                >
                  <option value="ALL">Tất cả môn học ({subjects.length})</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.shortName || s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Nút Mở / Thu gọn tất cả */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-xs cursor-pointer transition-colors"
                >
                  Mở Tất Cả
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-xs cursor-pointer transition-colors"
                >
                  Thu Gọn Tất Cả
                </button>
              </div>
            </div>

            {/* DANH SÁCH ACCORDION GIÁO VIÊN */}
            <div className="space-y-3">
              {filteredTeacherStats.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                  Không tìm thấy giáo viên nào phù hợp với bộ lọc tìm kiếm!
                </div>
              ) : (
                filteredTeacherStats.map((item) => {
                  const { teacher, assignments: tAsgs, totalAssignedPeriods, actualScheduledPeriods, diff, status, homeroomClasses, isHomeroom, quota } = item;
                  const isExpanded = expandedTeacherIds.has(teacher.id);
                  const form = getTeacherForm(teacher);

                  return (
                    <div
                      key={teacher.id}
                      className={`rounded-2xl border-2 transition-all overflow-hidden ${
                        isExpanded
                          ? 'border-indigo-500 bg-white shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      {/* HEADER DÒNG GIÁO VIÊN (CLICK ĐỂ MỞ/ĐÓNG ẨN HIỆN) */}
                      <div
                        onClick={() => toggleTeacherExpand(teacher.id)}
                        className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                          isExpanded ? 'bg-indigo-50/70 border-b border-indigo-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Cột trái: Avatar, Tên, Mã, Badge GVCN */}
                        <div className="flex items-center gap-3">
                          <div className="px-3 h-10 min-w-16 rounded-xl bg-indigo-50 border-2 border-indigo-300 flex items-center justify-center font-mono font-black text-indigo-950 text-xs shrink-0 whitespace-nowrap shadow-2xs">
                            {teacher.code}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-slate-950 text-base">
                                {teacher.name}
                              </h4>
                              {teacher.shortName && (
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                                  {teacher.shortName}
                                </span>
                              )}

                              {/* LOGIC XÁC ĐỊNH GVCN: HIỂN THỊ HUY HIỆU VÀNG NỔI BẬT */}
                              {isHomeroom ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                                  <Crown className="w-3.5 h-3.5 text-amber-700" />
                                  <span>
                                    GVCN: {homeroomClasses.map((c) => c.name).join(', ')}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                  Giáo Viên Bộ Môn
                                </span>
                              )}
                            </div>

                            {/* Môn chuyên môn */}
                            <div className="text-xs text-slate-500 font-semibold mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Môn chuyên môn:</span>
                              {teacher.subjects && teacher.subjects.length > 0 ? (
                                teacher.subjects.map((subId) => (
                                  <span
                                    key={subId}
                                    className="px-2 py-0.2 rounded bg-indigo-50 text-indigo-900 font-black text-[11px] border border-indigo-200"
                                  >
                                    {subjectsMap.get(subId)?.name || subId}
                                  </span>
                                ))
                              ) : (
                                <span className="italic text-slate-400">Chưa gắn chuyên môn</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cột phải: Thống kê số tiết & Nút Mũi tên */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Tổng tiết PCGD */}
                          <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-bold flex items-center gap-2 shadow-xs">
                            <span className="text-slate-400 text-[11px]">ĐÃ GIAO:</span>
                            <span className="font-black text-amber-300 text-sm">
                              {totalAssignedPeriods} / {quota} tiết/tuần
                            </span>
                          </div>

                          {/* Trạng thái TKB */}
                          <div
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                              status === 'EXACT'
                                ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                : status === 'DEFICIT'
                                ? 'bg-rose-100 text-rose-950 border-rose-300'
                                : 'bg-amber-100 text-amber-950 border-amber-300'
                            }`}
                          >
                            {status === 'EXACT' && `✓ TKB: ${actualScheduledPeriods}t (Đủ)`}
                            {status === 'DEFICIT' && `⚠ TKB: ${actualScheduledPeriods}/${totalAssignedPeriods}t (Thiếu ${Math.abs(diff)})`}
                            {status === 'SURPLUS' && `⚠ TKB: ${actualScheduledPeriods}/${totalAssignedPeriods}t (Thừa ${diff})`}
                          </div>

                          {/* Mũi tên Mở/Đóng */}
                          <button
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 transition-transform cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-indigo-700" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* NỘI DUNG CHI TIẾT KHI MỞ RỘNG (EXPANDED) */}
                      {isExpanded && (
                        <div className="p-5 space-y-6 bg-slate-50/50">
                          {/* KHỐI 1: BẢNG DANH SÁCH CÁC MÔN VÀ LỚP ĐANG ĐƯỢC PHÂN CÔNG */}
                          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                            <div className="p-3 bg-slate-900 text-white font-black text-xs uppercase flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-indigo-400" />
                                Danh Sách Phân Công Hiện Tại Của {teacher.name} ({tAsgs.length} mục)
                              </span>
                              <span className="font-bold text-amber-300">
                                Tổng: {totalAssignedPeriods} tiết/tuần
                              </span>
                            </div>

                            {tAsgs.length === 0 ? (
                              <div className="p-5 text-center text-xs text-slate-500 italic">
                                Giáo viên này hiện chưa được phân công môn nào. Hãy sử dụng bảng chọn bên dưới để giao môn và lớp!
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-800 font-extrabold text-[11px] uppercase border-b border-slate-200">
                                      <th className="py-2.5 px-4">Môn Học</th>
                                      <th className="py-2.5 px-4">Lớp Học Phụ Trách</th>
                                      <th className="py-2.5 px-4 text-center">Số Tiết / Tuần</th>
                                      <th className="py-2.5 px-4">Phòng Học</th>
                                      <th className="py-2.5 px-4 text-center">Đặc Thù</th>
                                      <th className="py-2.5 px-4 text-center w-28">Thao Tác</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-900">
                                    {tAsgs.map((asg) => {
                                      const sub = subjectsMap.get(asg.subjectId);
                                      const isSHL =
                                        sub?.code === 'SHL' ||
                                        sub?.name.toLowerCase().includes('sinh hoạt');
                                      const isEditing = editingAssignmentId === asg.id;

                                      return (
                                        <tr key={asg.id} className="hover:bg-indigo-50/40 transition-colors">
                                          <td className="py-3 px-4 font-black text-slate-950">
                                            {sub?.name || asg.subjectId}
                                            {isSHL && (
                                              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                                                ⭐ Tiết SHL (Thứ 7)
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-3 px-4">
                                            <span className="font-extrabold text-indigo-950">
                                              {asg.classIds
                                                .map((cId) => classesMap.get(cId)?.name || cId)
                                                .join(', ')}
                                            </span>
                                            {asg.classIds.length > 1 && (
                                              <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-900 font-black border border-amber-300">
                                                Ghép {asg.classIds.length} lớp
                                              </span>
                                            )}
                                          </td>

                                          <td className="py-3 px-4 text-center">
                                            {isEditing ? (
                                              <div className="inline-flex items-center gap-1">
                                                <input
                                                  type="number"
                                                  min={1}
                                                  max={20}
                                                  value={editingPeriodsValue}
                                                  onChange={(e) =>
                                                    setEditingPeriodsValue(Number(e.target.value))
                                                  }
                                                  className="w-14 p-1 text-xs font-black border-2 border-indigo-600 rounded bg-white text-center"
                                                  autoFocus
                                                />
                                                <button
                                                  onClick={() => handleSaveInlinePeriods(asg.id)}
                                                  className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                                  title="Lưu số tiết"
                                                >
                                                  <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => setEditingAssignmentId(null)}
                                                  className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                                                  title="Hủy"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="inline-flex items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 font-black text-indigo-950 text-xs">
                                                  {asg.periodsPerWeek} tiết/tuần
                                                </span>
                                                <button
                                                  onClick={() => {
                                                    setEditingAssignmentId(asg.id);
                                                    setEditingPeriodsValue(asg.periodsPerWeek);
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                                  title="Chỉnh sửa số tiết"
                                                >
                                                  <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            )}
                                          </td>

                                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                                            {asg.requiredRoomType || 'THEORY'}
                                          </td>

                                          <td className="py-3 px-4 text-center">
                                            {asg.doublePeriodsAllowed ? (
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                                Cho phép tiết đôi
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                                                Tiết đơn
                                              </span>
                                            )}
                                          </td>

                                          <td className="py-3 px-4 text-center">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenDeleteAssignmentModal(asg)}
                                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 cursor-pointer transition-colors border border-transparent hover:border-rose-300"
                                              title="Xóa phân công này"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* GỢI Ý NHANH DÀNH CHO GVCN: NẾU CHƯA CÓ TIẾT SHL */}
                            {isHomeroom && (
                              <div className="p-3 bg-amber-50 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2 text-amber-950 font-bold">
                                  <Crown className="w-4 h-4 text-amber-700" />
                                  <span>
                                    Giáo viên này là <strong>GVCN lớp {homeroomClasses.map((c) => c.name).join(', ')}</strong>.
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {homeroomClasses.map((c) => {
                                    const hasSHL = tAsgs.some(
                                      (a) =>
                                        a.classIds.includes(c.id) &&
                                        (subjectsMap.get(a.subjectId)?.code === 'SHL' ||
                                          subjectsMap.get(a.subjectId)?.name.toLowerCase().includes('sinh hoạt'))
                                    );
                                    if (hasSHL) {
                                      return (
                                        <span
                                          key={c.id}
                                          className="text-emerald-800 font-black flex items-center gap-1 text-[11px]"
                                        >
                                          <Check className="w-3.5 h-3.5" /> Đã có tiết SHL {c.name}
                                        </span>
                                      );
                                    }
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => handleQuickAssignHomeroomSHL(teacher, c)}
                                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs cursor-pointer transition-colors flex items-center gap-1"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>+ Gán Tiết SHL Lớp {c.name} (Thứ 7 Tiết 5)</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* KHỐI 2: BẢNG FORM PHÂN CÔNG THÊM MÔN & LỚP TRỰC TIẾP */}
                          <div className="p-5 rounded-2xl bg-white border-2 border-indigo-300 shadow-sm space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                              <h5 className="font-black text-sm text-indigo-950 uppercase flex items-center gap-2">
                                <Plus className="w-4.5 h-4.5 text-indigo-600" />
                                Phân Công Môn Dạy & Số Tiết Cho {teacher.name}
                              </h5>
                              <span className="text-[11px] font-bold text-slate-500">
                                * Tích chọn môn, chỉnh số tiết/tuần cho từng môn (ví dụ: Toán 4t, Lý 2t) và chọn các lớp phụ trách
                              </span>
                            </div>

                            <div className="space-y-5 text-xs">
                              {/* 1. BẢNG TÍCH CHỌN MÔN HỌC & ĐẶT SỐ TIẾT/TUẦN CHO TỪNG MÔN */}
                              <div>
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                  <label className="font-black text-slate-900 flex items-center gap-1.5 text-xs uppercase">
                                    <BookOpen className="w-4 h-4 text-indigo-600" />
                                    <span>1. Tích Chọn Môn Dạy & Thiết Lập Số Tiết / Tuần Cho Từng Môn *</span>
                                  </label>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {teacher.subjects && teacher.subjects.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newSubjectIds = Array.from(
                                            new Set([...form.selectedSubjectIds, ...teacher.subjects])
                                          );
                                          updateTeacherForm(teacher.id, {
                                            selectedSubjectIds: newSubjectIds,
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-950 font-extrabold text-[11px] cursor-pointer shadow-2xs"
                                      >
                                        ⭐ Chọn Môn Chuyên Môn ({teacher.subjects.length})
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTeacherForm(teacher.id, {
                                          selectedSubjectIds: subjects.map((s) => s.id),
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] cursor-pointer"
                                    >
                                      Tất cả môn
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTeacherForm(teacher.id, {
                                          selectedSubjectIds: [],
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-[11px] cursor-pointer"
                                    >
                                      Bỏ chọn
                                    </button>
                                  </div>
                                </div>

                                {/* Grid danh sách các môn với ô nhập số tiết */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-slate-50/80 rounded-xl border border-slate-300 max-h-64 overflow-y-auto">
                                  {subjects.map((sub) => {
                                    const isSelected = form.selectedSubjectIds.includes(sub.id);
                                    const isTeacherSubject = teacher.subjects?.includes(sub.id);
                                    const currentPeriods =
                                      form.subjectPeriods?.[sub.id] !== undefined
                                        ? form.subjectPeriods[sub.id]
                                        : getDefaultPeriodsForSubject(sub);

                                    return (
                                      <div
                                        key={sub.id}
                                        className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
                                          isSelected
                                            ? 'bg-indigo-50/90 border-indigo-500 shadow-xs ring-1 ring-indigo-400'
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                      >
                                        {/* Hàng 1: Checkbox + Tên Môn */}
                                        <label className="flex items-start gap-2 cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                updateTeacherForm(teacher.id, {
                                                  selectedSubjectIds: [
                                                    ...form.selectedSubjectIds,
                                                    sub.id,
                                                  ],
                                                });
                                              } else {
                                                updateTeacherForm(teacher.id, {
                                                  selectedSubjectIds:
                                                    form.selectedSubjectIds.filter(
                                                      (id) => id !== sub.id
                                                    ),
                                                });
                                              }
                                            }}
                                            className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span
                                                className={`font-black text-xs ${
                                                  isSelected
                                                    ? 'text-indigo-950'
                                                    : 'text-slate-900'
                                                }`}
                                              >
                                                {sub.name}
                                              </span>
                                              <span className="text-[10px] font-mono text-slate-500">
                                                ({sub.code})
                                              </span>
                                              {isTeacherSubject && (
                                                <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-amber-200 text-amber-950 border border-amber-300">
                                                  Chuyên môn
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </label>

                                        {/* Hàng 2: Ô chọn / nhập số tiết cho môn này */}
                                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                                          <span className="text-[11px] font-bold text-slate-600">
                                            Số tiết / tuần:
                                          </span>
                                          <div className="inline-flex items-center gap-1">
                                            <button
                                              type="button"
                                              disabled={!isSelected || currentPeriods <= 1}
                                              onClick={() => {
                                                const newP = Math.max(1, currentPeriods - 1);
                                                updateTeacherForm(teacher.id, {
                                                  subjectPeriods: { [sub.id]: newP },
                                                });
                                              }}
                                              className={`w-6 h-6 rounded flex items-center justify-center font-black text-xs transition-colors ${
                                                isSelected
                                                  ? 'bg-indigo-200 hover:bg-indigo-300 text-indigo-950 cursor-pointer'
                                                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                              }`}
                                            >
                                              -
                                            </button>
                                            <input
                                              type="number"
                                              min={1}
                                              max={15}
                                              disabled={!isSelected}
                                              value={currentPeriods}
                                              onChange={(e) => {
                                                const val = Math.max(
                                                  1,
                                                  Math.min(15, Number(e.target.value) || 1)
                                                );
                                                updateTeacherForm(teacher.id, {
                                                  subjectPeriods: { [sub.id]: val },
                                                });
                                              }}
                                              className={`w-12 h-6 text-center font-black text-xs rounded border ${
                                                isSelected
                                                  ? 'bg-white border-indigo-500 text-indigo-950 shadow-2xs'
                                                  : 'bg-slate-100 border-slate-300 text-slate-400'
                                              }`}
                                            />
                                            <button
                                              type="button"
                                              disabled={!isSelected || currentPeriods >= 15}
                                              onClick={() => {
                                                const newP = Math.min(15, currentPeriods + 1);
                                                updateTeacherForm(teacher.id, {
                                                  subjectPeriods: { [sub.id]: newP },
                                                });
                                              }}
                                              className={`w-6 h-6 rounded flex items-center justify-center font-black text-xs transition-colors ${
                                                isSelected
                                                  ? 'bg-indigo-200 hover:bg-indigo-300 text-indigo-950 cursor-pointer'
                                                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                              }`}
                                            >
                                              +
                                            </button>
                                            <span className="text-[10px] font-extrabold text-slate-500 pl-0.5">
                                              tiết
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 2. CHỌN LỚP HỌC (CHO PHÉP CHỌN NHIỀU LỚP) */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                  <label className="font-black text-slate-900 flex items-center gap-1.5 text-xs uppercase">
                                    <School className="w-4 h-4 text-emerald-600" />
                                    <span>2. Chọn Lớp Học (Tích chọn 1 hoặc nhiều lớp sẽ dạy các môn trên) *</span>
                                  </label>

                                  {/* Các nút bấm chọn nhanh */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const grade10Ids = classes
                                          .filter((c) => c.grade === 10)
                                          .map((c) => c.id);
                                        updateTeacherForm(teacher.id, {
                                          selectedClassIds: Array.from(
                                            new Set([...form.selectedClassIds, ...grade10Ids])
                                          ),
                                        });
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-[11px] cursor-pointer"
                                    >
                                      + Khối 10
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const grade11Ids = classes
                                          .filter((c) => c.grade === 11)
                                          .map((c) => c.id);
                                        updateTeacherForm(teacher.id, {
                                          selectedClassIds: Array.from(
                                            new Set([...form.selectedClassIds, ...grade11Ids])
                                          ),
                                        });
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-[11px] cursor-pointer"
                                    >
                                      + Khối 11
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const grade12Ids = classes
                                          .filter((c) => c.grade === 12)
                                          .map((c) => c.id);
                                        updateTeacherForm(teacher.id, {
                                          selectedClassIds: Array.from(
                                            new Set([...form.selectedClassIds, ...grade12Ids])
                                          ),
                                        });
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-[11px] cursor-pointer"
                                    >
                                      + Khối 12
                                    </button>
                                    {isHomeroom && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const hrIds = homeroomClasses.map((c) => c.id);
                                          updateTeacherForm(teacher.id, {
                                            selectedClassIds: Array.from(
                                              new Set([...form.selectedClassIds, ...hrIds])
                                            ),
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[11px] cursor-pointer"
                                      >
                                        + Lớp Chủ Nhiệm
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTeacherForm(teacher.id, {
                                          selectedClassIds: classes.map((c) => c.id),
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] cursor-pointer"
                                    >
                                      Tất cả lớp
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTeacherForm(teacher.id, { selectedClassIds: [] })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-[11px] cursor-pointer"
                                    >
                                      Bỏ chọn
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-300 max-h-40 overflow-y-auto">
                                  {classes.map((cls) => {
                                    const isSelected = form.selectedClassIds.includes(cls.id);
                                    const isMyHomeroom = cls.homeroomTeacherId === teacher.id;

                                    return (
                                      <label
                                        key={cls.id}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                                          isSelected
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'bg-white text-slate-800 border border-slate-300 hover:bg-emerald-50'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              updateTeacherForm(teacher.id, {
                                                selectedClassIds: [
                                                  ...form.selectedClassIds,
                                                  cls.id,
                                                ],
                                              });
                                            } else {
                                              updateTeacherForm(teacher.id, {
                                                selectedClassIds: form.selectedClassIds.filter(
                                                  (id) => id !== cls.id
                                                ),
                                              });
                                            }
                                          }}
                                          className="hidden"
                                        />
                                        <span>{cls.name}</span>
                                        {isMyHomeroom && (
                                          <span className="text-[10px] px-1 rounded bg-amber-300 text-slate-950 font-bold ml-1">
                                            👑 Lớp CN
                                          </span>
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 3. TÙY CHỌN BỔ SUNG (TIẾT ĐÔI & PHÒNG HỌC) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div>
                                  <label className="block font-bold text-slate-900 mb-1 text-xs">
                                    Hình Thức Tiết Học
                                  </label>
                                  <select
                                    value={form.doublePeriodsAllowed ? 'DOUBLE' : 'SINGLE'}
                                    onChange={(e) =>
                                      updateTeacherForm(teacher.id, {
                                        doublePeriodsAllowed: e.target.value === 'DOUBLE',
                                      })
                                    }
                                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-xs"
                                  >
                                    <option value="DOUBLE">Cho phép ghép Tiết Đôi (2 tiết)</option>
                                    <option value="SINGLE">Chỉ xếp Tiết Đơn (1 tiết/buổi)</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block font-bold text-slate-900 mb-1 text-xs">
                                    Phòng Học Yêu Cầu
                                  </label>
                                  <select
                                    value={form.requiredRoomType}
                                    onChange={(e) =>
                                      updateTeacherForm(teacher.id, {
                                        requiredRoomType: e.target.value as RoomType,
                                      })
                                    }
                                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-xs"
                                  >
                                    <option value="THEORY">Phòng Lý Thuyết Thường</option>
                                    <option value="COMPUTER_LAB">Phòng Máy Tính (Lab Tin)</option>
                                    <option value="SCIENCE_LAB">Phòng Thực Nghiệm STEM</option>
                                    <option value="STADIUM">Sân Tập Thể Dục & QP</option>
                                    <option value="HALL">Hội Trường</option>
                                  </select>
                                </div>
                              </div>

                              {/* BẢNG XEM TRƯỚC DANH SÁCH MÔN VÀ LỚP SẼ ĐƯỢC LƯU */}
                              {form.selectedSubjectIds.length > 0 && form.selectedClassIds.length > 0 && (
                                <div className="p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-2.5">
                                  <div className="font-black text-indigo-950 text-xs flex items-center justify-between flex-wrap gap-1">
                                    <span>
                                      🔍 Danh Sách Phân Công Chuẩn Bị Lưu Cho {teacher.name}:
                                    </span>
                                    <span className="text-emerald-800 font-extrabold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                      Tổng cộng:{' '}
                                      {form.selectedSubjectIds.reduce((sum, subId) => {
                                        const p =
                                          form.subjectPeriods?.[subId] !== undefined
                                            ? form.subjectPeriods[subId]
                                            : getDefaultPeriodsForSubject(subjectsMap.get(subId));
                                        return sum + p * form.selectedClassIds.length;
                                      }, 0)}{' '}
                                      tiết/tuần
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                                    {form.selectedSubjectIds.map((subId) => {
                                      const sub = subjectsMap.get(subId);
                                      const p =
                                        form.subjectPeriods?.[subId] !== undefined
                                          ? form.subjectPeriods[subId]
                                          : getDefaultPeriodsForSubject(sub);
                                      const classNames = form.selectedClassIds
                                        .map((cId) => classesMap.get(cId)?.name || cId)
                                        .join(', ');

                                      return (
                                        <div
                                          key={subId}
                                          className="p-2 rounded-lg bg-white border border-indigo-200 text-indigo-950 text-xs font-bold shadow-2xs flex items-center justify-between"
                                        >
                                          <div>
                                            <span className="text-indigo-700 font-black">{sub?.name}</span>{' '}
                                            <span className="text-[11px] text-amber-700 font-bold">({p}t/lớp)</span>
                                            <div className="text-[11px] text-slate-600 font-normal">
                                              Lớp: {classNames}
                                            </div>
                                          </div>
                                          <div className="text-right font-black text-emerald-700 text-xs">
                                            {p * form.selectedClassIds.length}t
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* TỔNG KẾT & NÚT LƯU PHÂN CÔNG CHUYÊN MÔN */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                                <div className="text-xs text-slate-700 font-bold">
                                  {form.selectedSubjectIds.length === 0 || form.selectedClassIds.length === 0 ? (
                                    <span className="text-slate-500 italic">
                                      Vui lòng tích chọn ít nhất 1 Môn học và 1 Lớp học ở trên để lưu phân công.
                                    </span>
                                  ) : (
                                    <span>
                                      Dự kiến phân công:{' '}
                                      <strong className="text-indigo-950 font-black">
                                        {form.selectedSubjectIds.length} môn ({form.selectedSubjectIds.map(sId => `${subjectsMap.get(sId)?.name}: ${form.subjectPeriods?.[sId] ?? getDefaultPeriodsForSubject(subjectsMap.get(sId))}t`).join(', ')}) ×{' '}
                                        {form.selectedClassIds.length} lớp ={' '}
                                        {form.selectedSubjectIds.reduce((sum, subId) => {
                                          const p =
                                            form.subjectPeriods?.[subId] !== undefined
                                              ? form.subjectPeriods[subId]
                                              : getDefaultPeriodsForSubject(subjectsMap.get(subId));
                                          return sum + p * form.selectedClassIds.length;
                                        }, 0)}{' '}
                                        tiết/tuần
                                      </strong>
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSaveTeacherAssignments(teacher)}
                                  disabled={
                                    form.selectedSubjectIds.length === 0 ||
                                    form.selectedClassIds.length === 0
                                  }
                                  className={`px-6 py-2.5 rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                                    form.selectedSubjectIds.length > 0 &&
                                    form.selectedClassIds.length > 0
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                                  }`}
                                >
                                  <Save className="w-4 h-4" />
                                  <span>
                                    LƯU PHÂN CÔNG CHUYÊN MÔN
                                    {form.selectedSubjectIds.length > 0 &&
                                    form.selectedClassIds.length > 0
                                      ? ` (${form.selectedSubjectIds.reduce((sum, subId) => {
                                          const p =
                                            form.subjectPeriods?.[subId] !== undefined
                                              ? form.subjectPeriods[subId]
                                              : getDefaultPeriodsForSubject(subjectsMap.get(subId));
                                          return sum + p * form.selectedClassIds.length;
                                        }, 0)} Tiết/Tuần)`
                                      : ''}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. CHẾ ĐỘ XEM: PHÂN CÔNG THEO LỚP HỌC                               */}
        {/* =================================================================== */}
        {viewMode === 'CLASS_VIEW' && (
          <div className="divide-y divide-slate-200">
            {classStats.map(
              ({ cls, assignments: cAsgs, totalClassPeriods, actualScheduledPeriods, diff, status }) => (
                <div key={cls.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="px-3 h-10 min-w-14 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center font-black text-emerald-950 text-sm shrink-0 whitespace-nowrap">
                        {cls.code || cls.name}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-950 text-base">{cls.name}</h4>
                          <span className="bg-slate-100 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-black text-emerald-900">
                            Khối {cls.grade}
                          </span>
                          {cls.homeroomTeacherId ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-950 border border-indigo-200">
                              👑 GVCN: {teachersMap.get(cls.homeroomTeacherId)?.name || cls.homeroomTeacherId}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Chưa có GVCN</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 shadow-xs">
                        <span>TỔNG TIẾT CỦA LỚP:</span>
                        <span className="font-black text-emerald-400 text-sm">
                          {totalClassPeriods} tiết/tuần
                        </span>
                      </div>

                      <div
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                          status === 'EXACT'
                            ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                            : 'bg-rose-50 text-rose-950 border-rose-300'
                        }`}
                      >
                        {status === 'EXACT'
                          ? `✓ Đã xếp đủ ${actualScheduledPeriods} tiết`
                          : `⚠ TKB xếp: ${actualScheduledPeriods}/${totalClassPeriods} (${
                              diff > 0 ? `Thừa ${diff}` : `Thiếu ${Math.abs(diff)}`
                            } tiết)`}
                      </div>
                    </div>
                  </div>

                  {/* Danh sách môn của lớp */}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-slate-600 font-extrabold text-[11px] uppercase border-b border-slate-200">
                          <th className="py-2 px-3">Môn Học</th>
                          <th className="py-2 px-3">Giáo Viên Giảng Dạy</th>
                          <th className="py-2 px-3 text-center">Số Tiết/Tuần</th>
                          <th className="py-2 px-3">Phòng Học</th>
                          <th className="py-2 px-3 text-center">Hình Thức</th>
                          <th className="py-2 px-3 text-center w-20">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cAsgs.map((asg) => {
                          const sub = subjectsMap.get(asg.subjectId);
                          const teacherNames = asg.teacherIds
                            .map((tId) => teachersMap.get(tId)?.name || tId)
                            .join(' + ');

                          return (
                            <tr key={asg.id} className="hover:bg-slate-100/50">
                              <td className="py-2 px-3 font-black text-slate-950">
                                {sub?.name || asg.subjectId}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-800">
                                {teacherNames}
                              </td>
                              <td className="py-2 px-3 text-center font-black text-indigo-950">
                                {asg.periodsPerWeek} tiết
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                                {asg.requiredRoomType || 'THEORY'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {asg.classIds.length > 1 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-black">
                                    Học ghép {asg.classIds.length} lớp
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-medium">Học riêng</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDeleteAssignmentModal(asg)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 cursor-pointer transition-colors border border-transparent hover:border-rose-300"
                                  title="Xóa phân công này"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. CHẾ ĐỘ XEM: ĐỐI CHIẾU THỪA / THIẾU TIẾT                          */}
        {/* =================================================================== */}
        {viewMode === 'DISCREPANCY_AUDIT' && (
          <div className="p-5 space-y-6">
            <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-xs text-amber-950 font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <span>
                  Bảng đối chiếu tự động so sánh số tiết PCGD được giao với số tiết thực tế đã được xếp trên Thời Khóa Biểu.
                </span>
              </div>
              <span className="text-xs font-black bg-amber-200 px-3 py-1 rounded-lg">
                Kiểm Tra Thời Gian Thực
              </span>
            </div>

            {/* Bảng 1: Đối chiếu từng Giáo Viên */}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-900 text-white font-black text-xs uppercase flex items-center justify-between">
                <span>1. Bảng Kiểm Tra Thừa / Thiếu Tiết Của Từng Giáo Viên</span>
                <span className="text-slate-300 font-bold">{teachers.length} Giáo viên</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-black text-[11px] uppercase border-b-2 border-slate-300">
                      <th className="py-3 px-4 w-28">Mã GV</th>
                      <th className="py-3 px-4">Họ Và Tên</th>
                      <th className="py-3 px-4">Các Môn & Lớp Đang Dạy</th>
                      <th className="py-3 px-3 text-center">Tiết PCGD</th>
                      <th className="py-3 px-3 text-center">Tiết Đã Xếp TKB</th>
                      <th className="py-3 px-3 text-center">Chênh Lệch</th>
                      <th className="py-3 px-4 text-center">Đánh Giá Thừa/Thiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {teacherStats.map(
                      ({
                        teacher,
                        assignments: tAsgs,
                        totalAssignedPeriods,
                        actualScheduledPeriods,
                        diff,
                        status,
                        isHomeroom,
                        homeroomClasses,
                      }) => (
                        <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {teacher.code}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-950 text-sm">
                              {teacher.name}
                            </div>
                            {isHomeroom && (
                              <div className="text-[10px] font-black text-amber-800 mt-0.5">
                                👑 GVCN: {homeroomClasses.map((c) => c.name).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {tAsgs.map((a) => (
                                <span
                                  key={a.id}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-800 font-bold border border-slate-300"
                                >
                                  {subjectsMap.get(a.subjectId)?.shortName || a.subjectId} (
                                  {a.classIds.map((c) => classesMap.get(c)?.code || c).join(',')}):{' '}
                                  {a.periodsPerWeek}t
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-black text-slate-950 text-sm">
                            {totalAssignedPeriods} tiết
                          </td>
                          <td className="py-3 px-3 text-center font-black text-indigo-900 text-sm">
                            {actualScheduledPeriods} tiết
                          </td>
                          <td className="py-3 px-3 text-center font-extrabold text-sm">
                            {diff === 0 && <span className="text-slate-400">0</span>}
                            {diff > 0 && <span className="text-amber-600 font-black">+{diff}</span>}
                            {diff < 0 && <span className="text-rose-600 font-black">{diff}</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {status === 'EXACT' && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-700 text-white shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" /> ĐỦ TIẾT
                              </span>
                            )}
                            {status === 'DEFICIT' && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-rose-700 text-white shadow-xs">
                                <AlertTriangle className="w-3.5 h-3.5" /> THIẾU {Math.abs(diff)} TIẾT
                              </span>
                            )}
                            {status === 'SURPLUS' && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-600 text-white shadow-xs">
                                <AlertTriangle className="w-3.5 h-3.5" /> THỪA {diff} TIẾT
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 4. CHẾ ĐỘ XEM: PHÒNG HỌC & SÂN BÃI                                  */}
        {/* =================================================================== */}
        {viewMode === 'ROOMS' && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border-2 border-slate-200 bg-white shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="font-black text-base text-slate-950">{r.name}</div>
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-indigo-900 text-white">
                      {r.roomType}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1">
                    Mã phòng: <strong className="text-indigo-900">{r.code || r.name.split(' ')[0]}</strong> • {r.building || 'Khu chính'}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-bold">Sức chứa tối đa:</span>
                  <span className="font-black text-emerald-800 text-sm bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-300">
                    {r.capacity} học sinh
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL THÊM PHÂN CÔNG TOÀN CỤC */}
      {isAddingGlobalModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-indigo-400 max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="font-black text-base text-indigo-950 uppercase flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                Thêm Phân Công Giảng Dạy Mới
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingGlobalModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGlobalAssignment} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-900 mb-1">1. Chọn Giáo Viên *</label>
                  <select
                    value={globalTeacherId}
                    onChange={(e) => setGlobalTeacherId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  >
                    {teachers.map((t) => {
                      const hr = classes.find((c) => c.homeroomTeacherId === t.id);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.shortName || t.code}) {hr ? `[👑 GVCN ${hr.name}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1">2. Chọn Môn Học *</label>
                  <select
                    value={globalSubjectId}
                    onChange={(e) => setGlobalSubjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.shortName || s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-900 mb-1">
                  3. Chọn Lớp Học (Tích chọn nhiều lớp để tạo Tiết Ghép) *
                </label>
                <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-300 max-h-32 overflow-y-auto">
                  {classes.map((cls) => {
                    const isChecked = globalClassIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setGlobalClassIds([...globalClassIds, cls.id]);
                            } else {
                              if (globalClassIds.length > 1) {
                                setGlobalClassIds(globalClassIds.filter((cid) => cid !== cls.id));
                              }
                            }
                          }}
                          className="hidden"
                        />
                        <span>{cls.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-900 mb-1">Số Tiết / Tuần *</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={globalPeriods}
                    onChange={(e) => setGlobalPeriods(Number(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1">Tiết Đôi</label>
                  <select
                    value={globalDoublePeriods ? 'DOUBLE' : 'SINGLE'}
                    onChange={(e) => setGlobalDoublePeriods(e.target.value === 'DOUBLE')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  >
                    <option value="DOUBLE">Cho phép Tiết Đôi (2 tiết)</option>
                    <option value="SINGLE">Tiết Đơn</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1">Phòng Học</label>
                  <select
                    value={globalRoomType}
                    onChange={(e) => setGlobalRoomType(e.target.value as RoomType)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  >
                    <option value="THEORY">Phòng Lý Thuyết Thường</option>
                    <option value="COMPUTER_LAB">Phòng Lab Máy Tính</option>
                    <option value="SCIENCE_LAB">Phòng Thực Nghiệm STEM</option>
                    <option value="STADIUM">Sân Tập Thể Dục & QP</option>
                    <option value="HALL">Hội Trường</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddingGlobalModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-black text-white shadow-sm cursor-pointer"
                >
                  Lưu Phân Công
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CẢNH BÁO XÁC NHẬN XÓA PHÂN CÔNG GIẢNG DẠY */}
      {deleteConfirmModal && deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-rose-300 max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center gap-3 text-rose-600 border-b border-rose-100 pb-3">
              <div className="p-3 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-6 h-6 text-rose-700" />
              </div>
              <div>
                <h4 className="font-black text-base text-slate-950">Xác Nhận Xóa Phân Công</h4>
                <p className="text-xs text-slate-500">Cảnh báo xóa dữ liệu phân công giảng dạy</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200 text-xs space-y-2 text-slate-800">
              <p className="font-bold text-rose-950">Bạn có chắc chắn muốn xóa phân công sau đây không?</p>
              <div className="space-y-1 font-extrabold text-slate-900 bg-white p-3 rounded-lg border border-rose-200">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Giáo viên:</span>
                  <span className="text-indigo-950">{deleteConfirmModal.teacherName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Môn học:</span>
                  <span className="text-amber-900">{deleteConfirmModal.subjectName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Lớp học:</span>
                  <span className="text-emerald-950">{deleteConfirmModal.classNames}</span>
                </div>
                {deleteConfirmModal.periods && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Số tiết:</span>
                    <span className="text-rose-700 font-black">{deleteConfirmModal.periods} tiết/tuần</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-rose-700 italic font-semibold">
                ⚠️ Dữ liệu phân công này sẽ bị xóa đồng thời trên chương trình và cơ sở dữ liệu Firebase (collection teaching_assignments).
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal(null)}
                disabled={deleteConfirmModal.isDeleting}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-xs text-slate-800 cursor-pointer transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmExecuteDelete}
                disabled={deleteConfirmModal.isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deleteConfirmModal.isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang Xóa Trên Firebase...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>XÁC NHẬN XÓA NGAY</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẢNH BÁO TRÙNG PHÂN CÔNG CHUYÊN MÔN */}
      {duplicateWarningModal && duplicateWarningModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-amber-400 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-base text-slate-950">⚠️ Cảnh Báo Trùng Phân Công Chuyên Môn</h4>
                <p className="text-xs text-slate-500 font-medium">Lớp học đã có giáo viên khác giảng dạy môn này</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2 text-slate-800">
              <p className="font-bold text-amber-950">
                Phát hiện lặp phân công môn học (chưa được cấu hình là Môn Ghép / Co-teaching):
              </p>
              <div className="space-y-2">
                {duplicateWarningModal.conflicts.map((c, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-amber-300 space-y-1">
                    <div className="flex justify-between font-black text-slate-900">
                      <span>Lớp {c.className} - Môn: {c.subjectName}</span>
                    </div>
                    <div className="text-slate-600 font-semibold">
                      GV Đã Phân Công Hiện Tại: <strong className="text-indigo-900">{c.existingTeacherName}</strong> ({c.existingPeriods} tiết/tuần)
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed font-semibold pt-1">
                ⚠️ Việc gán thêm phân công riêng lẻ này sẽ làm thời khóa biểu tự động xếp <strong>2 giáo viên cùng dạy trùng tiết</strong>.
                Nếu 2 thầy/cô cùng dạy chung một lớp, vui lòng vào menu <strong>'Ghép Lớp'</strong> để tạo nhóm ghép chính thức.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarningModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-xs text-slate-800 cursor-pointer transition-colors"
              >
                Hủy Bỏ / Kiểm Tra Lại
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = duplicateWarningModal.onConfirm;
                  setDuplicateWarningModal(null);
                  cb();
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md cursor-pointer transition-colors"
              >
                Vẫn Phân Công (Trùng PCGD)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
