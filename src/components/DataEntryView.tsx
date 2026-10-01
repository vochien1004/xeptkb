/**
 * Component Nhập Thông Tin (Data Entry View)
 * Thiết kế độc lập (riêng lẻ) và chuyên biệt cho ĐÚNG 3 Module:
 * 1. Module Giáo Viên (Mã GV, Họ tên, SĐT, Email, Định mức tiết/ngày & tuần, Lịch bận, Nguyện vọng)
 * 2. Module Môn Học (Mã môn, Tên đầy đủ, Tên viết tắt bản in, Môn nặng, Phòng mặc định)
 * 3. Module Lớp Học (Mã lớp, Tên lớp, Khối, Sĩ số, Buổi học)
 */

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Teacher,
  Subject,
  SchoolClass,
  RoomType,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  PERIODS,
} from '../types/timetable';
import {
  Users,
  BookOpen,
  School,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  X,
  Search,
  Check,
  AlertCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Download,
  Upload,
  FileSpreadsheet,
  FileUp,
  FileDown,
  Cloud,
  RefreshCw,
  Trash,
} from 'lucide-react';
import {
  saveTeacherToFirebase,
  saveMultipleTeachersToFirebase,
  replaceAllTeachersInFirebase,
  deleteTeacherFromFirebase,
  saveSubjectToFirebase,
  saveMultipleSubjectsToFirebase,
  replaceAllSubjectsInFirebase,
  deleteSubjectFromFirebase,
  saveClassToFirebase,
  saveMultipleClassesToFirebase,
  replaceAllClassesInFirebase,
  deleteClassFromFirebase,
  clearTeachersFromFirebase,
  clearSubjectsFromFirebase,
  clearClassesFromFirebase,
  clearAssignmentsFromFirebase,
  clearAllDataFromFirebase,
  saveTimetableSlotsToFirebase,
  saveMultipleAssignmentsToFirebase,
} from '../services/firebaseClient';
import { TeachingAssignment, TimetableSlot } from '../types/timetable';

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  subjects: Subject[];
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  classes: SchoolClass[];
  setClasses: React.Dispatch<React.SetStateAction<SchoolClass[]>>;
  assignments?: TeachingAssignment[];
  setAssignments?: React.Dispatch<React.SetStateAction<TeachingAssignment[]>>;
  slots?: TimetableSlot[];
  setSlots?: React.Dispatch<React.SetStateAction<TimetableSlot[]>>;
  onDataUpdated?: () => void;
}

export const DataEntryView: React.FC<Props> = ({
  teachers,
  setTeachers,
  subjects,
  setSubjects,
  classes,
  setClasses,
  assignments = [],
  setAssignments,
  slots = [],
  setSlots,
  onDataUpdated,
}) => {
  // Chỉ gồm 3 Module riêng lẻ:
  const [activeModule, setActiveModule] = useState<'TEACHERS' | 'SUBJECTS' | 'CLASSES'>('TEACHERS');

  // Tìm kiếm trong từng module
  const [searchTerm, setSearchTerm] = useState('');

  // Toast thông báo
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
    if (onDataUpdated) onDataUpdated();
  };

  // State cho Modal Xóa Từng Mục (Giáo viên, Môn học, Lớp học)
  const [deleteTarget, setDeleteTarget] = useState<{
    isOpen: boolean;
    type: 'TEACHER' | 'SUBJECT' | 'CLASS';
    id: string;
    name: string;
    code?: string;
    isDeleting?: boolean;
  } | null>(null);

  const handleConfirmDeleteTarget = async () => {
    if (!deleteTarget) return;
    setDeleteTarget((prev) => (prev ? { ...prev, isDeleting: true } : null));
    const { type, id, name } = deleteTarget;
    try {
      if (type === 'TEACHER') {
        setTeachers((prev) => prev.filter((t) => t.id !== id));
        await deleteTeacherFromFirebase(id);
        showToast(`✓ Đã xóa giáo viên "${name}" trên giao diện & Firebase!`);
      } else if (type === 'SUBJECT') {
        setSubjects((prev) => prev.filter((s) => s.id !== id));
        await deleteSubjectFromFirebase(id);
        showToast(`✓ Đã xóa môn học "${name}" trên giao diện & Firebase!`);
      } else if (type === 'CLASS') {
        setClasses((prev) => prev.filter((c) => c.id !== id));
        await deleteClassFromFirebase(id);
        showToast(`✓ Đã xóa lớp học "${name}" trên giao diện & Firebase!`);
      }
    } catch (err) {
      console.error('Lỗi khi xóa:', err);
      showToast('Có lỗi khi xóa trên Firebase. Vui lòng kiểm tra lại!');
    } finally {
      setDeleteTarget(null);
    }
  };

  // State cho Modal Xóa Dữ Liệu
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [selectedClearOptions, setSelectedClearOptions] = useState<{
    teachers: boolean;
    subjects: boolean;
    classes: boolean;
    assignments: boolean;
  }>({
    teachers: false,
    subjects: false,
    classes: false,
    assignments: false,
  });
  const [isClearing, setIsClearing] = useState(false);

  // Xử lý thực hiện Xóa Dữ Liệu
  const handleExecuteClearData = async () => {
    const { teachers: delTeachers, subjects: delSubjects, classes: delClasses, assignments: delAssignments } =
      selectedClearOptions;

    if (!delTeachers && !delSubjects && !delClasses && !delAssignments) {
      alert('Vui lòng tích chọn ít nhất 1 loại dữ liệu cần xóa!');
      return;
    }

    setIsClearing(true);
    try {
      const promises: Promise<any>[] = [];
      const clearedLabels: string[] = [];

      if (delTeachers) {
        setTeachers([]);
        promises.push(clearTeachersFromFirebase());
        clearedLabels.push('Giáo Viên');
      }

      if (delSubjects) {
        setSubjects([]);
        promises.push(clearSubjectsFromFirebase());
        clearedLabels.push('Môn Học');
      }

      if (delClasses) {
        setClasses([]);
        promises.push(clearClassesFromFirebase());
        clearedLabels.push('Lớp Học');
      }

      if (delAssignments && setAssignments) {
        setAssignments([]);
        promises.push(clearAssignmentsFromFirebase());
        clearedLabels.push('Phân Công PCGD');
      }

      await Promise.all(promises);

      showToast(`Đã xóa sạch: ${clearedLabels.join(', ')} trên chương trình và Firebase!`);
      setIsClearModalOpen(false);
      setSelectedClearOptions({
        teachers: false,
        subjects: false,
        classes: false,
        assignments: false,
      });
    } catch (err) {
      console.error('Lỗi xóa dữ liệu:', err);
      alert('Có lỗi xảy ra khi xóa dữ liệu trên Firebase. Vui lòng thử lại!');
    } finally {
      setIsClearing(false);
    }
  };

  // =========================================================================
  // 1. MODULE GIÁO VIÊN (Chỉ gồm: Mã GV, Họ Tên, Tên Viết Tắt, Lịch bận + Excel)
  // =========================================================================
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [teacherForm, setTeacherForm] = useState<Partial<Teacher>>({
    code: '',
    name: '',
    shortName: '',
    unavailableSlots: [],
    preferredSlots: [],
  });

  // Ref cho input file Excel / CSV
  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const [parsedTeachersPreview, setParsedTeachersPreview] = useState<
    { tt: number; code: string; name: string; shortName: string }[] | null
  >(null);

  const resetTeacherForm = () => {
    setTeacherForm({
      code: '',
      name: '',
      shortName: '',
      unavailableSlots: [],
      preferredSlots: [],
    });
    setIsAddingTeacher(false);
    setEditingTeacherId(null);
  };

  const handleOpenEditTeacher = (t: Teacher) => {
    setTeacherForm({
      code: t.code,
      name: t.name,
      shortName: t.shortName || '',
      unavailableSlots: t.unavailableSlots || [],
      preferredSlots: t.preferredSlots || [],
    });
    setEditingTeacherId(t.id);
    setIsAddingTeacher(true);
  };

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.code?.trim() || !teacherForm.name?.trim()) {
      alert('Vui lòng nhập Mã giáo viên và Họ tên!');
      return;
    }

    const codeUpper = teacherForm.code.trim().toUpperCase();
    const fullName = teacherForm.name!.trim();
    // Tự động tạo tên viết tắt nếu để trống (lấy từ cuối, VD: "Nguyễn Văn Nam" -> "Nam")
    const shortNameFinal =
      teacherForm.shortName?.trim() || fullName.split(' ').slice(-1)[0] || codeUpper;

    if (editingTeacherId) {
      // Cập nhật giáo viên hiện có
      const updatedTeacher: Teacher = {
        id: editingTeacherId,
        code: codeUpper,
        name: fullName,
        shortName: shortNameFinal,
        email: `${codeUpper.toLowerCase()}@thpt.edu.vn`,
        subjects: teachers.find((t) => t.id === editingTeacherId)?.subjects || [],
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 25,
        unavailableSlots: teacherForm.unavailableSlots || [],
        preferredSlots: teacherForm.preferredSlots || [],
        color: '#3B82F6',
      };

      setTeachers((prev) =>
        prev.map((t) => (t.id === editingTeacherId ? updatedTeacher : t))
      );
      saveTeacherToFirebase(updatedTeacher);

      // Cập nhật phân công PCGD nếu cần
      if (setAssignments) {
        setAssignments((prev) => {
          const updatedAsgs = prev.map((asg) => asg);
          saveMultipleAssignmentsToFirebase(updatedAsgs);
          return updatedAsgs;
        });
      }

      // Cập nhật tên giáo viên trong các tiết TKB đã xếp
      if (setSlots) {
        setSlots((prev) => {
          const updatedSlots = prev.map((slot) => {
            if (slot.teacherId === editingTeacherId) {
              return { ...slot, teacherName: shortNameFinal || fullName };
            }
            if (slot.teacherIds && slot.teacherIds.includes(editingTeacherId)) {
              return { ...slot, teacherName: shortNameFinal || fullName };
            }
            return slot;
          });
          saveTimetableSlotsToFirebase(updatedSlots);
          return updatedSlots;
        });
      }

      showToast(`Đã cập nhật giáo viên & lưu Firebase: ${fullName} (${shortNameFinal})`);
    } else {
      // Thêm mới giáo viên
      const newT: Teacher = {
        id: `T_${Date.now()}`,
        code: codeUpper,
        name: fullName,
        shortName: shortNameFinal,
        email: `${codeUpper.toLowerCase()}@thpt.edu.vn`,
        subjects: [],
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 25,
        unavailableSlots: teacherForm.unavailableSlots || [],
        preferredSlots: teacherForm.preferredSlots || [],
        color: '#3B82F6',
      };
      setTeachers((prev) => [newT, ...prev]);
      saveTeacherToFirebase(newT);
      showToast(`Đã thêm mới giáo viên & lưu Firebase: ${newT.name} (${newT.shortName})`);
    }

    resetTeacherForm();
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    const target = teachers.find((t) => t.id === id);
    setDeleteTarget({
      isOpen: true,
      type: 'TEACHER',
      id,
      name,
      code: target?.code,
    });
  };

  // --- TẢI FILE EXCEL MẪU DANH SÁCH GIÁO VIÊN: TT, Mã GV, Họ tên GV, Tên GV viết tắt ---
  const handleDownloadTeacherTemplate = () => {
    const templateRows = [
      { 'TT': 1, 'Mã GV': 'GV01', 'Họ tên GV': 'Nguyễn Văn Nam', 'Tên GV viết tắt': 'T.Nam' },
      { 'TT': 2, 'Mã GV': 'GV02', 'Họ tên GV': 'Trần Thị Thu Hương', 'Tên GV viết tắt': 'C.Hương' },
      { 'TT': 3, 'Mã GV': 'GV03', 'Họ tên GV': 'Lê Văn Hùng', 'Tên GV viết tắt': 'T.Hùng' },
      { 'TT': 4, 'Mã GV': 'GV04', 'Họ tên GV': 'Phạm Thị Thúy', 'Tên GV viết tắt': 'C.Thúy' },
      { 'TT': 5, 'Mã GV': 'GV05', 'Họ tên GV': 'Hoàng Văn Chiến', 'Tên GV viết tắt': 'T.Chiến' },
      { 'TT': 6, 'Mã GV': 'GV06', 'Họ tên GV': 'Đặng Quốc Toản', 'Tên GV viết tắt': 'T.Toản' },
      { 'TT': 7, 'Mã GV': 'GV07', 'Họ tên GV': 'Vũ Thị Minh', 'Tên GV viết tắt': 'C.Minh' },
      { 'TT': 8, 'Mã GV': 'GV08', 'Họ tên GV': 'Bùi Đức Anh', 'Tên GV viết tắt': 'T.Anh' },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Giao_Vien');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Giao_Vien.xlsx');
    showToast('Đã tải xuống file Excel mẫu: Mau_Danh_Sach_Giao_Vien.xlsx');
  };

  // --- ĐỌC VÀ PARSE FILE EXCEL / CSV TẢI LÊN ---
  const handleTeacherFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length < 2) {
          alert('File không có dữ liệu hoặc không đúng định dạng!');
          return;
        }

        // Tìm cột theo tiêu đề (TT, Mã GV, Họ tên GV, Tên viết tắt)
        let headerRowIndex = 0;
        let codeColIndex = 1;
        let nameColIndex = 2;
        let shortNameColIndex = -1;
        let ttColIndex = 0;

        for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if (
              val === 'mã gv' ||
              val === 'ma gv' ||
              val === 'magv' ||
              val === 'code' ||
              val === 'mã'
            ) {
              codeColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'họ tên gv' ||
              val === 'ho ten gv' ||
              val === 'họ tên' ||
              val === 'ho ten' ||
              val === 'họ và tên' ||
              val === 'name' ||
              val === 'hoten'
            ) {
              nameColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'tên gv viết tắt' ||
              val === 'ten gv viet tat' ||
              val === 'tên viết tắt' ||
              val === 'ten viet tat' ||
              val === 'viết tắt' ||
              val === 'viet tat' ||
              val === 'shortname' ||
              val === 'short name' ||
              val === 'alias'
            ) {
              shortNameColIndex = c;
            }
            if (val === 'tt' || val === 'stt' || val === 'số tt') {
              ttColIndex = c;
            }
          }
        }

        const list: { tt: number; code: string; name: string; shortName: string }[] = [];
        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;

          const code = String(row[codeColIndex] || '').trim().toUpperCase();
          const name = String(row[nameColIndex] || '').trim();
          const shortName =
            shortNameColIndex !== -1 && row[shortNameColIndex]
              ? String(row[shortNameColIndex]).trim()
              : name.split(' ').slice(-1)[0] || code;

          const tt = ttColIndex !== -1 && row[ttColIndex] ? Number(row[ttColIndex]) : list.length + 1;

          if (code && name) {
            list.push({
              tt: isNaN(tt) ? list.length + 1 : tt,
              code,
              name,
              shortName,
            });
          }
        }

        if (list.length === 0) {
          alert('Không tìm thấy dữ liệu giáo viên hợp lệ! Vui lòng tải file mẫu để kiểm tra.');
          return;
        }

        setParsedTeachersPreview(list);
      } catch (err) {
        console.error(err);
        alert('Lỗi khi đọc file Excel/CSV. Vui lòng kiểm tra lại định dạng file!');
      } finally {
        if (teacherFileInputRef.current) teacherFileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- XÁC NHẬN NHẬP DỮ LIỆU TỪ FILE ---
  const handleConfirmImportTeachers = (mode: 'OVERWRITE' | 'APPEND') => {
    if (!parsedTeachersPreview) return;

    const newItems: Teacher[] = parsedTeachersPreview.map((item, idx) => ({
      id: `T_${item.code}_${Date.now()}_${idx}`,
      code: item.code,
      name: item.name,
      shortName: item.shortName,
      email: `${item.code.toLowerCase()}@thpt.edu.vn`,
      subjects: [],
      maxPeriodsPerDay: 5,
      maxPeriodsPerWeek: 25,
      unavailableSlots: [],
      preferredSlots: [],
      color: '#3B82F6',
    }));

    if (mode === 'OVERWRITE') {
      setTeachers(newItems);
      replaceAllTeachersInFirebase(newItems);
      showToast(`Đã ghi đè toàn bộ danh sách & lưu Firebase: ${newItems.length} giáo viên từ file!`);
    } else {
      const existingCodes = new Set(teachers.map((t) => t.code.toUpperCase()));
      const filtered = newItems.filter((t) => !existingCodes.has(t.code.toUpperCase()));
      setTeachers((prev) => [...prev, ...filtered]);
      saveMultipleTeachersToFirebase(filtered);
      showToast(
        `Đã thêm mới & lưu Firebase ${filtered.length} giáo viên từ file (bỏ qua ${
          newItems.length - filtered.length
        } mã trùng)!`
      );
    }

    setParsedTeachersPreview(null);
  };

  // Toggle lịch bận (tách biệt Sáng & Chiều)
  const toggleUnavailableSlot = (
    day: DayOfWeek,
    period: PeriodOfDay,
    session: 'MORNING' | 'AFTERNOON' = 'MORNING'
  ) => {
    const current = teacherForm.unavailableSlots || [];
    const exists = current.some((s) => {
      if (s.day !== day || s.period !== period) return false;
      const sSess = s.session || 'MORNING';
      return sSess === session;
    });

    if (exists) {
      setTeacherForm({
        ...teacherForm,
        unavailableSlots: current.filter((s) => {
          if (s.day !== day || s.period !== period) return true;
          const sSess = s.session || 'MORNING';
          return sSess !== session;
        }),
      });
    } else {
      setTeacherForm({
        ...teacherForm,
        unavailableSlots: [...current, { day, period, session }],
      });
    }
  };

  // =========================================================================
  // 2. MODULE MÔN HỌC
  // =========================================================================
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjectForm, setSubjectForm] = useState<Partial<Subject>>({
    code: '',
    name: '',
    shortName: '',
    isHeavy: false,
    preferredShift: 'MORNING',
  });

  const resetSubjectForm = () => {
    setSubjectForm({
      code: '',
      name: '',
      shortName: '',
      isHeavy: false,
      preferredShift: 'MORNING',
    });
    setIsAddingSubject(false);
    setEditingSubjectId(null);
  };

  const handleOpenEditSubject = (sub: Subject) => {
    setSubjectForm({
      code: sub.code,
      name: sub.name,
      shortName: sub.shortName || sub.code,
      isHeavy: !!sub.isHeavy,
      preferredShift: sub.preferredShift || 'MORNING',
    });
    setEditingSubjectId(sub.id);
    setIsAddingSubject(true);
  };

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.code?.trim() || !subjectForm.name?.trim()) {
      alert('Vui lòng nhập Mã môn học và Tên đầy đủ!');
      return;
    }

    const codeUpper = subjectForm.code.trim().toUpperCase();
    const shortNameVal = subjectForm.shortName?.trim() || codeUpper;
    const preferredShiftVal = subjectForm.preferredShift || 'MORNING';

    if (editingSubjectId) {
      const updatedSub: Subject = {
        id: editingSubjectId,
        code: codeUpper,
        name: subjectForm.name!.trim(),
        shortName: shortNameVal,
        isHeavy: !!subjectForm.isHeavy,
        preferredShift: preferredShiftVal,
      };

      setSubjects((prev) =>
        prev.map((s) => (s.id === editingSubjectId ? updatedSub : s))
      );
      saveSubjectToFirebase(updatedSub);

      // Cập nhật phân công PCGD nếu cần
      if (setAssignments) {
        setAssignments((prev) => {
          const updatedAsgs = prev.map((asg) => asg);
          saveMultipleAssignmentsToFirebase(updatedAsgs);
          return updatedAsgs;
        });
      }

      // Cập nhật tên môn học trong các tiết TKB
      if (setSlots) {
        setSlots((prev) => {
          const updatedSlots = prev.map((slot) => {
            if (slot.subjectId === editingSubjectId) {
              return { ...slot, subjectName: updatedSub.shortName || updatedSub.name };
            }
            return slot;
          });
          saveTimetableSlotsToFirebase(updatedSlots);
          return updatedSlots;
        });
      }

      showToast(`Đã cập nhật môn học & lưu Firebase: ${subjectForm.name} (${shortNameVal})`);
    } else {
      const newSub: Subject = {
        id: `SUB_${codeUpper}`,
        code: codeUpper,
        name: subjectForm.name!.trim(),
        shortName: shortNameVal,
        isHeavy: !!subjectForm.isHeavy,
        preferredShift: preferredShiftVal,
      };
      setSubjects((prev) => [newSub, ...prev]);
      saveSubjectToFirebase(newSub);
      showToast(`Đã thêm mới môn học & lưu Firebase: ${newSub.name} (${newSub.shortName})`);
    }

    resetSubjectForm();
  };

  const handleDeleteSubject = (id: string, name: string) => {
    const target = subjects.find((s) => s.id === id);
    setDeleteTarget({
      isOpen: true,
      type: 'SUBJECT',
      id,
      name,
      code: target?.code || target?.shortName,
    });
  };

  // Ref cho input file Excel môn học
  const subjectFileInputRef = useRef<HTMLInputElement>(null);
  const [parsedSubjectsPreview, setParsedSubjectsPreview] = useState<
    {
      tt: number;
      code: string;
      name: string;
      shortName: string;
      preferredShift: 'MORNING' | 'AFTERNOON' | 'ANY';
      isHeavy: boolean;
    }[] | null
  >(null);

  // --- TẢI FILE EXCEL MẪU DANH SÁCH MÔN HỌC ---
  const handleDownloadSubjectTemplate = () => {
    const templateRows = [
      {
        'TT': 1,
        'Mã môn': 'TOAN',
        'Tên môn học': 'Toán Học',
        'Tên viết tắt': 'Toán',
        'Buổi học': 'Sáng',
        'Môn nặng (không >2 tiết/ngày)': 'Có',
      },
      {
        'TT': 2,
        'Mã môn': 'VAN',
        'Tên môn học': 'Ngữ Văn',
        'Tên viết tắt': 'Văn',
        'Buổi học': 'Sáng',
        'Môn nặng (không >2 tiết/ngày)': 'Có',
      },
      {
        'TT': 3,
        'Mã môn': 'ANH',
        'Tên môn học': 'Tiếng Anh',
        'Tên viết tắt': 'TAnh',
        'Buổi học': 'Sáng & Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
      {
        'TT': 4,
        'Mã môn': 'LY',
        'Tên môn học': 'Vật Lý',
        'Tên viết tắt': 'Lý',
        'Buổi học': 'Sáng',
        'Môn nặng (không >2 tiết/ngày)': 'Có',
      },
      {
        'TT': 5,
        'Mã môn': 'HOA',
        'Tên môn học': 'Hóa Học',
        'Tên viết tắt': 'Hóa',
        'Buổi học': 'Sáng',
        'Môn nặng (không >2 tiết/ngày)': 'Có',
      },
      {
        'TT': 6,
        'Mã môn': 'TIN',
        'Tên môn học': 'Tin Học',
        'Tên viết tắt': 'Tin',
        'Buổi học': 'Sáng & Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
      {
        'TT': 7,
        'Mã môn': 'TD',
        'Tên môn học': 'Thể Dục (GDTC)',
        'Tên viết tắt': 'GDTC',
        'Buổi học': 'Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
      {
        'TT': 8,
        'Mã môn': 'QP',
        'Tên môn học': 'GDQP - An Ninh',
        'Tên viết tắt': 'GDQP',
        'Buổi học': 'Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
      {
        'TT': 9,
        'Mã môn': 'STEM',
        'Tên môn học': 'Chuyên Đề STEM',
        'Tên viết tắt': 'STEM',
        'Buổi học': 'Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
      {
        'TT': 10,
        'Mã môn': 'SU',
        'Tên môn học': 'Lịch Sử',
        'Tên viết tắt': 'Sử',
        'Buổi học': 'Sáng & Chiều',
        'Môn nặng (không >2 tiết/ngày)': 'Không',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Mon_Hoc');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Mon_Hoc.xlsx');
    showToast('Đã tải xuống file Excel mẫu: Mau_Danh_Sach_Mon_Hoc.xlsx');
  };

  // --- ĐỌC VÀ PARSE FILE EXCEL / CSV MÔN HỌC ---
  const handleSubjectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length < 2) {
          alert('File không có dữ liệu hoặc không đúng định dạng!');
          return;
        }

        // Tìm cột theo tiêu đề
        let headerRowIndex = 0;
        let codeColIndex = 1;
        let nameColIndex = 2;
        let shortNameColIndex = -1;
        let shiftColIndex = -1;
        let heavyColIndex = -1;
        let ttColIndex = 0;

        for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if (
              val === 'mã môn' ||
              val === 'ma mon' ||
              val === 'mã' ||
              val === 'code' ||
              val === 'mamon' ||
              val === 'mã môn học'
            ) {
              codeColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'tên môn học' ||
              val === 'ten mon hoc' ||
              val === 'tên môn' ||
              val === 'ten mon' ||
              val === 'name' ||
              val === 'tên đầy đủ'
            ) {
              nameColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'tên viết tắt' ||
              val === 'ten viet tat' ||
              val === 'viết tắt' ||
              val === 'viet tat' ||
              val === 'shortname' ||
              val === 'alias'
            ) {
              shortNameColIndex = c;
            }
            if (
              val === 'buổi học' ||
              val === 'buoi hoc' ||
              val === 'buổi' ||
              val === 'shift' ||
              val === 'ca học' ||
              val === 'phân loại buổi'
            ) {
              shiftColIndex = c;
            }
            if (
              val.includes('môn nặng') ||
              val.includes('mon nang') ||
              val === 'nặng' ||
              val === 'heavy' ||
              val === 'isheavy'
            ) {
              heavyColIndex = c;
            }
            if (val === 'tt' || val === 'stt' || val === 'số tt') {
              ttColIndex = c;
            }
          }
        }

        const list: {
          tt: number;
          code: string;
          name: string;
          shortName: string;
          preferredShift: 'MORNING' | 'AFTERNOON' | 'ANY';
          isHeavy: boolean;
        }[] = [];

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;

          const code = String(row[codeColIndex] || '').trim().toUpperCase();
          const name = String(row[nameColIndex] || '').trim();
          if (!code || !name) continue;

          const shortName =
            shortNameColIndex !== -1 && row[shortNameColIndex]
              ? String(row[shortNameColIndex]).trim()
              : code;

          // Xử lý buổi học
          let preferredShift: 'MORNING' | 'AFTERNOON' | 'ANY' = 'MORNING';
          if (shiftColIndex !== -1 && row[shiftColIndex] !== undefined) {
            const shiftStr = String(row[shiftColIndex]).toLowerCase().trim();
            if (shiftStr.includes('chiều') || shiftStr.includes('chieu') || shiftStr === 'afternoon') {
              preferredShift = 'AFTERNOON';
            } else if (
              shiftStr.includes('cả') ||
              shiftStr.includes('linh') ||
              shiftStr.includes('&') ||
              shiftStr === 'any' ||
              shiftStr.includes('cả hai')
            ) {
              preferredShift = 'ANY';
            } else {
              preferredShift = 'MORNING';
            }
          }

          // Xử lý môn nặng
          let isHeavy = false;
          if (heavyColIndex !== -1 && row[heavyColIndex] !== undefined) {
            const heavyStr = String(row[heavyColIndex]).toLowerCase().trim();
            if (
              heavyStr === 'có' ||
              heavyStr === 'co' ||
              heavyStr === 'x' ||
              heavyStr === '1' ||
              heavyStr === 'true' ||
              heavyStr === 'yes' ||
              heavyStr === 'y'
            ) {
              isHeavy = true;
            }
          }

          const tt =
            ttColIndex !== -1 && row[ttColIndex] ? Number(row[ttColIndex]) : list.length + 1;

          list.push({
            tt: isNaN(tt) ? list.length + 1 : tt,
            code,
            name,
            shortName,
            preferredShift,
            isHeavy,
          });
        }

        if (list.length === 0) {
          alert('Không tìm thấy dữ liệu môn học hợp lệ! Vui lòng tải file mẫu để kiểm tra.');
          return;
        }

        setParsedSubjectsPreview(list);
      } catch (err) {
        console.error(err);
        alert('Lỗi khi đọc file Excel/CSV môn học. Vui lòng kiểm tra lại định dạng file!');
      } finally {
        if (subjectFileInputRef.current) subjectFileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- XÁC NHẬN NHẬP MÔN HỌC TỪ FILE ---
  const handleConfirmImportSubjects = (mode: 'OVERWRITE' | 'APPEND') => {
    if (!parsedSubjectsPreview) return;

    const newItems: Subject[] = parsedSubjectsPreview.map((item) => ({
      id: `SUB_${item.code}`,
      code: item.code,
      name: item.name,
      shortName: item.shortName,
      isHeavy: item.isHeavy,
      preferredShift: item.preferredShift,
    }));

    if (mode === 'OVERWRITE') {
      setSubjects(newItems);
      replaceAllSubjectsInFirebase(newItems);
      showToast(`Đã ghi đè toàn bộ danh sách & lưu Firebase: ${newItems.length} môn học từ file!`);
    } else {
      const existingCodes = new Set(subjects.map((s) => s.code.toUpperCase()));
      const filtered = newItems.filter((s) => !existingCodes.has(s.code.toUpperCase()));
      setSubjects((prev) => [...prev, ...filtered]);
      saveMultipleSubjectsToFirebase(filtered);
      showToast(
        `Đã thêm mới & lưu Firebase ${filtered.length} môn học từ file (bỏ qua ${
          newItems.length - filtered.length
        } mã trùng)!`
      );
    }

    setParsedSubjectsPreview(null);
  };

  // =========================================================================
  // =========================================================================
  // 3. MODULE LỚP HỌC
  // =========================================================================
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classForm, setClassForm] = useState<Partial<SchoolClass>>({
    code: '',
    name: '',
    grade: 10,
    homeroomTeacherId: '',
  });

  // Map giáo viên đang chủ nhiệm các lớp khác (trừ lớp đang chỉnh sửa)
  const assignedTeacherIdsToOtherClasses = useMemo(() => {
    const assigned = new Map<string, { classId: string; className: string; classCode: string }>();
    classes.forEach((c) => {
      if (c.homeroomTeacherId && c.id !== editingClassId) {
        assigned.set(c.homeroomTeacherId, {
          classId: c.id,
          className: c.name,
          classCode: c.code || c.name,
        });
      }
    });
    return assigned;
  }, [classes, editingClassId]);

  // Danh sách giáo viên khả dụng để chọn làm GVCN (đã ẩn các GV đã được phân công lớp khác)
  const availableTeachersForHomeroom = useMemo(() => {
    return teachers.filter((t) => !assignedTeacherIdsToOtherClasses.has(t.id));
  }, [teachers, assignedTeacherIdsToOtherClasses]);

  // Phát hiện các giáo viên bị trùng lớp chủ nhiệm trong toàn bộ danh sách lớp
  const duplicateHomeroomTeachers = useMemo(() => {
    const teacherClassMap = new Map<string, { id: string; name: string; code?: string }[]>();
    classes.forEach((c) => {
      if (c.homeroomTeacherId) {
        const list = teacherClassMap.get(c.homeroomTeacherId) || [];
        list.push({ id: c.id, name: c.name, code: c.code });
        teacherClassMap.set(c.homeroomTeacherId, list);
      }
    });

    const duplicates: {
      teacherId: string;
      teacherName: string;
      classes: { id: string; name: string; code?: string }[];
    }[] = [];

    teacherClassMap.forEach((classList, teacherId) => {
      if (classList.length > 1) {
        const teacher = teachers.find((t) => t.id === teacherId);
        duplicates.push({
          teacherId,
          teacherName: teacher ? `${teacher.name} (${teacher.shortName || teacher.code})` : `GV: ${teacherId}`,
          classes: classList,
        });
      }
    });

    return duplicates;
  }, [classes, teachers]);

  const resetClassForm = () => {
    setClassForm({
      code: '',
      name: '',
      grade: 10,
      homeroomTeacherId: '',
    });
    setIsAddingClass(false);
    setEditingClassId(null);
  };

  const handleOpenEditClass = (c: SchoolClass) => {
    setClassForm({
      code: c.code || c.name,
      name: c.name,
      grade: c.grade,
      homeroomTeacherId: c.homeroomTeacherId || '',
    });
    setEditingClassId(c.id);
    setIsAddingClass(true);
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.code?.trim() || !classForm.name?.trim()) {
      alert('Vui lòng nhập Mã lớp và Tên lớp!');
      return;
    }

    // Kiểm tra và cảnh báo nếu chọn giáo viên đã chủ nhiệm lớp khác
    if (classForm.homeroomTeacherId) {
      const alreadyAssigned = assignedTeacherIdsToOtherClasses.get(classForm.homeroomTeacherId);
      if (alreadyAssigned) {
        const teacherObj = teachers.find((t) => t.id === classForm.homeroomTeacherId);
        const tName = teacherObj ? teacherObj.name : 'Giáo viên này';
        alert(
          `⚠️ CẢNH BÁO TRÙNG LỚP CHỦ NHIỆM:\n\n${tName} hiện đã được phân công làm giáo viên chủ nhiệm cho "${alreadyAssigned.className}" (${alreadyAssigned.classCode}).\n\nMỗi giáo viên chỉ được chủ nhiệm 1 lớp! Vui lòng chọn giáo viên khác.`
        );
        return;
      }
    }

    const codeUpper = classForm.code.trim().toUpperCase();

    if (editingClassId) {
      const updatedClass: SchoolClass = {
        id: editingClassId,
        code: codeUpper,
        name: classForm.name!.trim(),
        grade: (Number(classForm.grade) as 10 | 11 | 12) || 10,
        homeroomTeacherId: classForm.homeroomTeacherId || undefined,
        studentCount: 40,
        shift: 'MORNING',
      };

      setClasses((prev) =>
        prev.map((c) => (c.id === editingClassId ? updatedClass : c))
      );
      saveClassToFirebase(updatedClass);

      // Cập nhật phân công PCGD nếu cần
      if (setAssignments) {
        setAssignments((prev) => {
          const updatedAsgs = prev.map((asg) => asg);
          saveMultipleAssignmentsToFirebase(updatedAsgs);
          return updatedAsgs;
        });
      }

      // Cập nhật tên lớp trong các tiết TKB
      if (setSlots) {
        setSlots((prev) => {
          const updatedSlots = prev.map((slot) => {
            if (slot.classId === editingClassId) {
              return { ...slot, className: updatedClass.name };
            }
            if (slot.classIds && slot.classIds.includes(editingClassId)) {
              return { ...slot, className: updatedClass.name };
            }
            return slot;
          });
          saveTimetableSlotsToFirebase(updatedSlots);
          return updatedSlots;
        });
      }

      showToast(`Đã cập nhật lớp & lưu Firebase: ${classForm.name} (${codeUpper})`);
    } else {
      const newC: SchoolClass = {
        id: `C_${codeUpper}`,
        code: codeUpper,
        name: classForm.name!.trim(),
        grade: (Number(classForm.grade) as 10 | 11 | 12) || 10,
        homeroomTeacherId: classForm.homeroomTeacherId || undefined,
        studentCount: 40,
        shift: 'MORNING',
      };
      setClasses((prev) => [newC, ...prev]);
      saveClassToFirebase(newC);
      showToast(`Đã thêm mới lớp & lưu Firebase: ${newC.name}`);
    }

    resetClassForm();
  };

  const handleDeleteClass = (id: string, name: string) => {
    const target = classes.find((c) => c.id === id);
    setDeleteTarget({
      isOpen: true,
      type: 'CLASS',
      id,
      name,
      code: target?.code || target?.name,
    });
  };

  // Ref cho input file Excel lớp học
  const classFileInputRef = useRef<HTMLInputElement>(null);
  const [parsedClassesPreview, setParsedClassesPreview] = useState<
    {
      tt: number;
      code: string;
      name: string;
      grade: 10 | 11 | 12;
      homeroomTeacherId?: string;
      homeroomName?: string;
    }[] | null
  >(null);

  // --- TẢI FILE EXCEL MẪU DANH SÁCH LỚP HỌC ---
  const handleDownloadClassTemplate = () => {
    const templateRows = [
      {
        'TT': 1,
        'Mã lớp': '10A1',
        'Tên lớp học': 'Lớp 10A1',
        'Khối lớp': 10,
        'Mã GVCN': 'GV01',
      },
      {
        'TT': 2,
        'Mã lớp': '10A2',
        'Tên lớp học': 'Lớp 10A2',
        'Khối lớp': 10,
        'Mã GVCN': 'GV02',
      },
      {
        'TT': 3,
        'Mã lớp': '11B1',
        'Tên lớp học': 'Lớp 11B1',
        'Khối lớp': 11,
        'Mã GVCN': 'GV03',
      },
      {
        'TT': 4,
        'Mã lớp': '11B2',
        'Tên lớp học': 'Lớp 11B2',
        'Khối lớp': 11,
        'Mã GVCN': 'GV04',
      },
      {
        'TT': 5,
        'Mã lớp': '12C1',
        'Tên lớp học': 'Lớp 12C1',
        'Khối lớp': 12,
        'Mã GVCN': 'GV05',
      },
      {
        'TT': 6,
        'Mã lớp': '12C2',
        'Tên lớp học': 'Lớp 12C2',
        'Khối lớp': 12,
        'Mã GVCN': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Lop_Hoc');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Lop_Hoc.xlsx');
    showToast('Đã tải xuống file Excel mẫu: Mau_Danh_Sach_Lop_Hoc.xlsx');
  };

  // --- ĐỌC VÀ PARSE FILE EXCEL / CSV LỚP HỌC ---
  const handleClassFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length < 2) {
          alert('File không có dữ liệu hoặc không đúng định dạng!');
          return;
        }

        // Tìm cột
        let headerRowIndex = 0;
        let codeColIndex = 1;
        let nameColIndex = 2;
        let gradeColIndex = -1;
        let homeroomColIndex = -1;
        let ttColIndex = 0;

        for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if (
              val === 'mã lớp' ||
              val === 'ma lop' ||
              val === 'mã' ||
              val === 'code' ||
              val === 'malop'
            ) {
              codeColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'tên lớp' ||
              val === 'ten lop' ||
              val === 'tên lớp học' ||
              val === 'ten lop hoc' ||
              val === 'name' ||
              val === 'tên'
            ) {
              nameColIndex = c;
              headerRowIndex = r;
            }
            if (
              val === 'khối' ||
              val === 'khoi' ||
              val === 'khối lớp' ||
              val === 'khoi lop' ||
              val === 'grade'
            ) {
              gradeColIndex = c;
            }
            if (
              val === 'gvcn' ||
              val === 'mã gvcn' ||
              val === 'ma gvcn' ||
              val === 'chủ nhiệm' ||
              val === 'chu nhiem' ||
              val === 'giáo viên chủ nhiệm' ||
              val === 'homeroom'
            ) {
              homeroomColIndex = c;
            }
            if (val === 'tt' || val === 'stt' || val === 'số tt') {
              ttColIndex = c;
            }
          }
        }

        const list: {
          tt: number;
          code: string;
          name: string;
          grade: 10 | 11 | 12;
          homeroomTeacherId?: string;
          homeroomName?: string;
        }[] = [];

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;

          const code = String(row[codeColIndex] || '').trim().toUpperCase();
          let name = String(row[nameColIndex] || '').trim();
          if (!code && !name) continue;

          const finalCode = code || name.toUpperCase().replace(/\s+/g, '');
          if (!name) name = `Lớp ${finalCode}`;

          // Tự suy luận khối lớp nếu không có
          let grade: 10 | 11 | 12 = 10;
          if (gradeColIndex !== -1 && row[gradeColIndex]) {
            const parsedGrade = parseInt(String(row[gradeColIndex]).replace(/\D/g, ''), 10);
            if (parsedGrade === 10 || parsedGrade === 11 || parsedGrade === 12) {
              grade = parsedGrade as 10 | 11 | 12;
            }
          } else {
            if (finalCode.startsWith('10') || name.includes('10')) grade = 10;
            else if (finalCode.startsWith('11') || name.includes('11')) grade = 11;
            else if (finalCode.startsWith('12') || name.includes('12')) grade = 12;
          }

          let homeroomTeacherId: string | undefined = undefined;
          let homeroomName: string | undefined = undefined;
          if (homeroomColIndex !== -1 && row[homeroomColIndex]) {
            const rawH = String(row[homeroomColIndex]).trim();
            const matchedT = teachers.find(
              (t) =>
                t.code.toUpperCase() === rawH.toUpperCase() ||
                t.name.toLowerCase() === rawH.toLowerCase() ||
                (t.shortName && t.shortName.toLowerCase() === rawH.toLowerCase())
            );
            if (matchedT) {
              homeroomTeacherId = matchedT.id;
              homeroomName = matchedT.name;
            } else {
              homeroomName = rawH;
            }
          }

          const tt =
            ttColIndex !== -1 && row[ttColIndex] ? Number(row[ttColIndex]) : list.length + 1;

          list.push({
            tt: isNaN(tt) ? list.length + 1 : tt,
            code: finalCode,
            name,
            grade,
            homeroomTeacherId,
            homeroomName,
          });
        }

        if (list.length === 0) {
          alert('Không tìm thấy dữ liệu lớp học hợp lệ! Vui lòng tải file mẫu để kiểm tra.');
          return;
        }

        setParsedClassesPreview(list);
      } catch (err) {
        console.error(err);
        alert('Lỗi khi đọc file Excel/CSV lớp học. Vui lòng kiểm tra lại định dạng file!');
      } finally {
        if (classFileInputRef.current) classFileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- XÁC NHẬN NHẬP LỚP HỌC TỪ FILE ---
  const handleConfirmImportClasses = (mode: 'OVERWRITE' | 'APPEND') => {
    if (!parsedClassesPreview) return;

    const newItems: SchoolClass[] = parsedClassesPreview.map((item) => ({
      id: `C_${item.code}`,
      code: item.code,
      name: item.name,
      grade: item.grade,
      studentCount: 40,
      shift: 'MORNING',
      homeroomTeacherId: item.homeroomTeacherId,
    }));

    if (mode === 'OVERWRITE') {
      setClasses(newItems);
      replaceAllClassesInFirebase(newItems);
      showToast(`Đã ghi đè toàn bộ danh sách & lưu Firebase: ${newItems.length} lớp học từ file!`);
    } else {
      const existingCodes = new Set(classes.map((c) => (c.code || c.name).toUpperCase()));
      const filtered = newItems.filter(
        (c) => !existingCodes.has((c.code || c.name).toUpperCase())
      );
      setClasses((prev) => [...prev, ...filtered]);
      saveMultipleClassesToFirebase(filtered);
      showToast(
        `Đã thêm mới & lưu Firebase ${filtered.length} lớp học từ file (bỏ qua ${
          newItems.length - filtered.length
        } mã trùng)!`
      );
    }

    setParsedClassesPreview(null);
  };

  // --- FILTERED LISTS ---
  const filteredTeachers = useMemo(() => {
    if (!searchTerm.trim()) return teachers;
    const q = searchTerm.toLowerCase();
    return teachers.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    );
  }, [teachers, searchTerm]);

  const filteredSubjects = useMemo(() => {
    if (!searchTerm.trim()) return subjects;
    const q = searchTerm.toLowerCase();
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.shortName && s.shortName.toLowerCase().includes(q))
    );
  }, [subjects, searchTerm]);

  const filteredClasses = useMemo(() => {
    if (!searchTerm.trim()) return classes;
    const q = searchTerm.toLowerCase();
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
  }, [classes, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="p-3.5 bg-emerald-100 border-2 border-emerald-500 rounded-xl text-emerald-950 font-black text-sm flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-xs font-black">
            ✕
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        {/* 3 MODULE TABS TRỌNG TÂM - ĐỘ TƯƠNG PHẢN CAO */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex bg-slate-200/90 p-1.5 rounded-xl text-xs font-bold text-slate-700 border border-slate-300">
            {/* MODULE 1: GIÁO VIÊN */}
            <button
              onClick={() => {
                setActiveModule('TEACHERS');
                setSearchTerm('');
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer ${
                activeModule === 'TEACHERS'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-400" />
              <span>1. Giáo Viên ({teachers.length})</span>
            </button>

            {/* MODULE 2: MÔN HỌC */}
            <button
              onClick={() => {
                setActiveModule('SUBJECTS');
                setSearchTerm('');
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer ${
                activeModule === 'SUBJECTS'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>2. Môn Học ({subjects.length})</span>
            </button>

            {/* MODULE 3: LỚP HỌC */}
            <button
              onClick={() => {
                setActiveModule('CLASSES');
                setSearchTerm('');
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer ${
                activeModule === 'CLASSES'
                  ? 'bg-slate-950 text-white shadow-sm font-black'
                  : 'hover:text-slate-950'
              }`}
            >
              <School className="w-4 h-4 text-emerald-400" />
              <span>3. Lớp Học ({classes.length})</span>
            </button>
          </div>

          {/* Search Bar & Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={
                  activeModule === 'TEACHERS'
                    ? 'Tìm tên, mã GV...'
                    : activeModule === 'SUBJECTS'
                    ? 'Tìm môn học, viết tắt...'
                    : 'Tìm lớp, khối...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-900 w-44 sm:w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* CÁC NÚT THAO TÁC CHO MODULE GIÁO VIÊN */}
            {activeModule === 'TEACHERS' && (
              <>
                {/* 1. Nút Tải File Excel Mẫu */}
                <button
                  onClick={handleDownloadTeacherTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải file Excel mẫu gồm các cột: TT, Mã GV, Họ tên GV"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Mẫu Excel</span>
                </button>

                {/* 2. Nút Nhập Từ File Excel / CSV */}
                <input
                  type="file"
                  ref={teacherFileInputRef}
                  onChange={handleTeacherFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  onClick={() => teacherFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải lên file Excel (.xlsx) hoặc CSV để nhập danh sách giáo viên"
                >
                  <Upload className="w-4 h-4" />
                  <span>Nhập Từ File Excel</span>
                </button>

                {/* 3. Nút Thêm Thủ Công */}
                {!isAddingTeacher && (
                  <button
                    onClick={() => {
                      resetTeacherForm();
                      setIsAddingTeacher(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-indigo-400" />
                    <span>+ Thêm Thủ Công</span>
                  </button>
                )}
              </>
            )}

            {/* CÁC NÚT THAO TÁC CHO MODULE MÔN HỌC */}
            {activeModule === 'SUBJECTS' && (
              <>
                {/* 1. Nút Tải File Excel Mẫu */}
                <button
                  onClick={handleDownloadSubjectTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải file Excel mẫu gồm các cột: TT, Mã môn, Tên môn học, Tên viết tắt, Buổi học, Môn nặng"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Mẫu Excel</span>
                </button>

                {/* 2. Nút Nhập Từ File Excel / CSV */}
                <input
                  type="file"
                  ref={subjectFileInputRef}
                  onChange={handleSubjectFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  onClick={() => subjectFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải lên file Excel (.xlsx) hoặc CSV để nhập danh sách môn học"
                >
                  <Upload className="w-4 h-4" />
                  <span>Nhập Từ File Excel</span>
                </button>

                {/* 3. Nút Thêm Thủ Công */}
                {!isAddingSubject && (
                  <button
                    onClick={() => {
                      resetSubjectForm();
                      setIsAddingSubject(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-amber-400" />
                    <span>+ Thêm Thủ Công</span>
                  </button>
                )}
              </>
            )}

            {/* CÁC NÚT THAO TÁC CHO MODULE LỚP HỌC */}
            {activeModule === 'CLASSES' && (
              <>
                {/* 1. Nút Tải File Excel Mẫu */}
                <button
                  onClick={handleDownloadClassTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải file Excel mẫu gồm các cột: TT, Mã lớp, Tên lớp học, Khối lớp, Mã GVCN"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Mẫu Excel</span>
                </button>

                {/* 2. Nút Nhập Từ File Excel / CSV */}
                <input
                  type="file"
                  ref={classFileInputRef}
                  onChange={handleClassFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  onClick={() => classFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tải lên file Excel (.xlsx) hoặc CSV để nhập danh sách lớp học"
                >
                  <Upload className="w-4 h-4" />
                  <span>Nhập Từ File Excel</span>
                </button>

                {/* 3. Nút Thêm Thủ Công */}
                {!isAddingClass && (
                  <button
                    onClick={() => {
                      resetClassForm();
                      setIsAddingClass(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>+ Thêm Thủ Công</span>
                  </button>
                )}
              </>
            )}

            {/* NÚT XÓA DỮ LIỆU TÙY CHỌN (Xóa trên CT & Firebase) */}
            <button
              onClick={() => setIsClearModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer border border-rose-600 ml-auto sm:ml-0"
              title="Xóa dữ liệu Giáo viên, Môn học, Lớp học trên chương trình và Firebase"
            >
              <Trash2 className="w-4 h-4 text-rose-200" />
              <span>Xóa Dữ Liệu</span>
            </button>
          </div>
        </div>

        {/* MODAL XEM TRƯỚC VÀ XÁC NHẬN NHẬP DỮ LIỆU GIÁO VIÊN TỪ FILE EXCEL */}
        {parsedTeachersPreview && (
          <div className="p-5 bg-indigo-950 text-white border-b-2 border-indigo-400 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm uppercase text-indigo-200 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  Xác Nhận Nhập Danh Sách Giáo Viên Từ File ({parsedTeachersPreview.length} Giáo Viên)
                </h4>
                <p className="text-xs text-indigo-300 font-medium mt-0.5">
                  Dữ liệu trích xuất: TT, Mã GV, Họ tên GV, Tên GV viết tắt. Vui lòng chọn phương thức nhập bên dưới:
                </p>
              </div>
              <button
                onClick={() => setParsedTeachersPreview(null)}
                className="p-1 rounded-lg hover:bg-indigo-900 text-indigo-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng xem trước tối đa 10 dòng */}
            <div className="bg-white rounded-xl border border-indigo-300 overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-black text-[11px] uppercase border-b border-slate-300">
                    <th className="py-2 px-3 w-14 text-center">TT</th>
                    <th className="py-2 px-3 w-28">Mã GV</th>
                    <th className="py-2 px-3">Họ Tên Giáo Viên</th>
                    <th className="py-2 px-3 w-28">Tên Viết Tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-900">
                  {parsedTeachersPreview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{item.tt || idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-black text-indigo-900">{item.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-950">{item.name}</td>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700">{item.shortName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-indigo-300 font-semibold">
                Tổng cộng: <strong className="text-white font-black">{parsedTeachersPreview.length}</strong> giáo viên hợp lệ
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setParsedTeachersPreview(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportTeachers('APPEND')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Giữ nguyên các giáo viên hiện tại, chỉ thêm các giáo viên mới từ file"
                >
                  Thêm Bổ Sung ({parsedTeachersPreview.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportTeachers('OVERWRITE')}
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Thay thế toàn bộ danh sách giáo viên hiện tại bằng danh sách từ file"
                >
                  Ghi Đè Toàn Bộ Danh Sách
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL XEM TRƯỚC VÀ XÁC NHẬN NHẬP DỮ LIỆU MÔN HỌC TỪ FILE EXCEL */}
        {parsedSubjectsPreview && (
          <div className="p-5 bg-amber-950 text-white border-b-2 border-amber-400 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm uppercase text-amber-200 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  Xác Nhận Nhập Danh Sách Môn Học Từ File ({parsedSubjectsPreview.length} Môn Học)
                </h4>
                <p className="text-xs text-amber-300 font-medium mt-0.5">
                  Dữ liệu trích xuất: TT, Mã môn, Tên môn, Viết tắt, Buổi học, Môn nặng. Vui lòng chọn phương thức nhập bên dưới:
                </p>
              </div>
              <button
                onClick={() => setParsedSubjectsPreview(null)}
                className="p-1 rounded-lg hover:bg-amber-900 text-amber-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng xem trước tối đa các dòng môn học */}
            <div className="bg-white rounded-xl border border-amber-300 overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-black text-[11px] uppercase border-b border-slate-300">
                    <th className="py-2 px-3 w-14 text-center">TT</th>
                    <th className="py-2 px-3 w-28">Mã Môn</th>
                    <th className="py-2 px-3">Tên Môn Học</th>
                    <th className="py-2 px-3 w-24">Viết Tắt</th>
                    <th className="py-2 px-3 text-center w-32">Buổi Học</th>
                    <th className="py-2 px-3 text-center w-40">Môn Nặng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-900">
                  {parsedSubjectsPreview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{item.tt || idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-black text-amber-950">{item.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-950">{item.name}</td>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700">{item.shortName}</td>
                      <td className="py-2 px-3 text-center">
                        {item.preferredShift === 'MORNING' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900">
                            ☀️ Sáng
                          </span>
                        )}
                        {item.preferredShift === 'AFTERNOON' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-100 text-cyan-900">
                            🌤️ Chiều
                          </span>
                        )}
                        {item.preferredShift === 'ANY' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            🔄 Sáng & Chiều
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {item.isHeavy ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300">
                            Môn nặng (≤2t/ngày)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            Môn Chuẩn
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-amber-300 font-semibold">
                Tổng cộng: <strong className="text-white font-black">{parsedSubjectsPreview.length}</strong> môn học hợp lệ
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setParsedSubjectsPreview(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportSubjects('APPEND')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Giữ nguyên các môn học hiện tại, chỉ thêm các môn học mới từ file"
                >
                  Thêm Bổ Sung ({parsedSubjectsPreview.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportSubjects('OVERWRITE')}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Thay thế toàn bộ danh sách môn học hiện tại bằng danh sách từ file"
                >
                  Ghi Đè Toàn Bộ Danh Sách
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL XEM TRƯỚC VÀ XÁC NHẬN NHẬP DỮ LIỆU LỚP HỌC TỪ FILE EXCEL */}
        {parsedClassesPreview && (
          <div className="p-5 bg-teal-950 text-white border-b-2 border-teal-400 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm uppercase text-teal-200 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  Xác Nhận Nhập Danh Sách Lớp Học Từ File ({parsedClassesPreview.length} Lớp Học)
                </h4>
                <p className="text-xs text-teal-300 font-medium mt-0.5">
                  Dữ liệu trích xuất: TT, Mã lớp, Tên lớp, Khối lớp, GV Chủ nhiệm. Vui lòng chọn phương thức nhập bên dưới:
                </p>
              </div>
              <button
                onClick={() => setParsedClassesPreview(null)}
                className="p-1 rounded-lg hover:bg-teal-900 text-teal-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng xem trước danh sách lớp học */}
            <div className="bg-white rounded-xl border border-teal-300 overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-black text-[11px] uppercase border-b border-slate-300">
                    <th className="py-2 px-3 w-14 text-center">TT</th>
                    <th className="py-2 px-3 w-28">Mã Lớp</th>
                    <th className="py-2 px-3">Tên Lớp Học</th>
                    <th className="py-2 px-3 text-center w-24">Khối Lớp</th>
                    <th className="py-2 px-3">GV Chủ Nhiệm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-900">
                  {parsedClassesPreview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{item.tt || idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-black text-teal-900">{item.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-950">{item.name}</td>
                      <td className="py-2 px-3 text-center font-black text-emerald-800">Khối {item.grade}</td>
                      <td className="py-2 px-3 font-medium text-slate-700">
                        {item.homeroomTeacherId ? (
                          (() => {
                            const isDupInFile = parsedClassesPreview.filter(
                              (p) => p.homeroomTeacherId === item.homeroomTeacherId
                            ).length > 1;
                            const tObj = teachers.find((t) => t.id === item.homeroomTeacherId);
                            const tDisplayName = tObj ? tObj.name : (item.homeroomName || item.homeroomTeacherId);
                            if (isDupInFile) {
                              return (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                                  ⚠️ {tDisplayName} (Trùng trong file)
                                </span>
                              );
                            }
                            return tDisplayName;
                          })()
                        ) : (
                          item.homeroomName || '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-teal-300 font-semibold">
                Tổng cộng: <strong className="text-white font-black">{parsedClassesPreview.length}</strong> lớp học hợp lệ
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setParsedClassesPreview(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportClasses('APPEND')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Giữ nguyên các lớp học hiện tại, chỉ thêm các lớp học mới từ file"
                >
                  Thêm Bổ Sung ({parsedClassesPreview.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImportClasses('OVERWRITE')}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-xs cursor-pointer"
                  title="Thay thế toàn bộ danh sách lớp học hiện tại bằng danh sách từ file"
                >
                  Ghi Đè Toàn Bộ Danh Sách
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* NỘI DUNG MODULE 1: GIÁO VIÊN                                        */}
        {/* =================================================================== */}
        {activeModule === 'TEACHERS' && (
          <div className="p-5 space-y-5">
            {/* FORM THÊM / SỬA GIÁO VIÊN: Mã GV, Họ Tên, Tên Viết Tắt trong MODAL DIALOG */}
            {isAddingTeacher && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl shadow-2xl border-2 border-indigo-400 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5">
                  <form onSubmit={handleSaveTeacher} className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-indigo-200">
                      <h4 className="font-black text-base text-indigo-950 uppercase flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-700" />
                        {editingTeacherId ? 'Chỉnh Sửa Hồ Sơ Giáo Viên' : 'Nhập Hồ Sơ Giáo Viên Mới'}
                      </h4>
                      <button
                        type="button"
                        onClick={resetTeacherForm}
                        className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-900 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      {/* 1. Mã Giáo viên */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Mã Giáo Viên (Bắt buộc) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: GV01, GV_TOAN_01"
                          value={teacherForm.code || ''}
                          onChange={(e) => setTeacherForm({ ...teacherForm, code: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-black text-slate-900"
                        />
                      </div>

                      {/* 2. Họ và tên */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Họ Và Tên Giáo Viên (Bắt buộc) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Thầy Trần Văn Nam"
                          value={teacherForm.name || ''}
                          onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        />
                      </div>

                      {/* 3. Tên GV viết tắt */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Tên GV Viết Tắt (Bản in / Lưới TKB)
                        </label>
                        <input
                          type="text"
                          placeholder="VD: T.Nam, C.Hương, Nam"
                          value={teacherForm.shortName || ''}
                          onChange={(e) => setTeacherForm({ ...teacherForm, shortName: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-indigo-950"
                        />
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Nếu để trống, hệ thống tự lấy tên chính của giáo viên.
                        </p>
                      </div>
                    </div>

                    {/* Chọn các khung giờ báo bận cố định (Unavailable Slots) - Tách biệt Sáng & Chiều */}
                    <div className="pt-2 border-t border-indigo-200 space-y-3">
                      <label className="block font-bold text-slate-900 text-xs">
                        Lịch Bận Cố Định (Chọn các tiết GV bận họp, công tác để thuật toán tránh xếp lịch):
                      </label>

                      {/* LỊCH BẬN BUỔI SÁNG */}
                      <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-300 space-y-2">
                        <div className="flex items-center gap-1.5 font-black text-amber-950 text-xs pb-1 border-b border-amber-200">
                          <span className="text-sm">☀️</span>
                          <span>1. Lịch Bận Cố Định - BUỔI SÁNG (Tiết 1 đến Tiết 5)</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                          {DAYS_OF_WEEK.map(({ key: day, label, short }) => (
                            <div key={day} className="space-y-1 bg-white p-2 rounded-lg border border-amber-200">
                              <div className="text-[11px] font-black text-slate-800 text-center pb-1 border-b border-slate-200">
                                {short} ({label})
                              </div>
                              <div className="flex flex-col gap-1">
                                {PERIODS.map(({ period }) => {
                                  const isBusy = (teacherForm.unavailableSlots || []).some((s) => {
                                    if (s.day !== day || s.period !== period) return false;
                                    const sSess = s.session || 'MORNING';
                                    return sSess === 'MORNING';
                                  });
                                  return (
                                    <button
                                      key={period}
                                      type="button"
                                      onClick={() => toggleUnavailableSlot(day, period, 'MORNING')}
                                      className={`py-1 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                                        isBusy
                                          ? 'bg-rose-600 text-white shadow-xs'
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {isBusy ? `Bận Tiết ${period}` : `Tiết ${period}`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* LỊCH BẬN BUỔI CHIỀU */}
                      <div className="bg-cyan-50/70 p-3 rounded-xl border border-cyan-300 space-y-2">
                        <div className="flex items-center gap-1.5 font-black text-cyan-950 text-xs pb-1 border-b border-cyan-200">
                          <span className="text-sm">🌤️</span>
                          <span>2. Lịch Bận Cố Định - BUỔI CHIỀU (Tiết 1 đến Tiết 5 Chiều)</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                          {DAYS_OF_WEEK.map(({ key: day, label, short }) => (
                            <div key={day} className="space-y-1 bg-white p-2 rounded-lg border border-cyan-200">
                              <div className="text-[11px] font-black text-slate-800 text-center pb-1 border-b border-slate-200">
                                {short} ({label})
                              </div>
                              <div className="flex flex-col gap-1">
                                {PERIODS.map(({ period }) => {
                                  const isBusy = (teacherForm.unavailableSlots || []).some((s) => {
                                    if (s.day !== day || s.period !== period) return false;
                                    const sSess = s.session || 'MORNING';
                                    return sSess === 'AFTERNOON';
                                  });
                                  return (
                                    <button
                                      key={period}
                                      type="button"
                                      onClick={() => toggleUnavailableSlot(day, period, 'AFTERNOON')}
                                      className={`py-1 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                                        isBusy
                                          ? 'bg-rose-600 text-white shadow-xs'
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {isBusy ? `Bận Tiết ${period}` : `Tiết ${period}`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-indigo-200">
                      <button
                        type="button"
                        onClick={resetTeacherForm}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 text-xs cursor-pointer"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-black text-white text-xs shadow-sm cursor-pointer"
                      >
                        {editingTeacherId ? 'Lưu Cập Nhật' : 'Lưu Hồ Sơ Giáo Viên'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* BẢNG DANH SÁCH GIÁO VIÊN: TT, Mã GV, Họ Tên GV, Tên Viết Tắt, Lịch Báo Bận, Thao Tác */}
            {filteredTeachers.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200 animate-fade-in">
                <Users className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">
                  {searchTerm ? 'Không tìm thấy giáo viên nào phù hợp' : 'Chưa có GV trong hệ thống, hãy thêm dữ liệu vào hệ thống'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchTerm
                    ? `Không có kết quả nào khớp với từ khóa "${searchTerm}". Vui lòng thử từ khóa khác.`
                    : 'Hãy thêm dữ liệu Giáo viên vào hệ thống bằng cách bấm "+ Thêm Thủ Công" hoặc "Nhập Từ File Excel" ở góc trên.'}
                </p>
                {!searchTerm && (
                  <div className="pt-2 flex items-center justify-center gap-2.5">
                    <button
                      onClick={() => {
                        resetTeacherForm();
                        setIsAddingTeacher(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Thêm Giáo Viên Đầu Tiên</span>
                    </button>
                    <button
                      onClick={() => teacherFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Nhập Từ File Excel</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b-2 border-slate-900 text-white uppercase font-black text-[11px]">
                      <th className="py-3 px-3 w-14 text-center">TT</th>
                      <th className="py-3 px-4 w-28">Mã GV</th>
                      <th className="py-3 px-4">Họ Tên Giáo Viên</th>
                      <th className="py-3 px-4 w-32">Tên Viết Tắt</th>
                      <th className="py-3 px-4">Lịch Báo Bận Cứng</th>
                      <th className="py-3 px-3 text-center w-28">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTeachers.map((t, index) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-3 text-center font-bold text-slate-500">
                          {index + 1}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-indigo-950 text-xs">
                          <span className="bg-indigo-50 border border-indigo-300 px-2.5 py-1 rounded">
                            {t.code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-black text-slate-950 text-sm">
                          {t.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-indigo-900 text-xs">
                          <span className="bg-slate-100 border border-slate-300 px-2.5 py-1 rounded">
                            {t.shortName || t.name.split(' ').slice(-1)[0]}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {(!t.unavailableSlots || t.unavailableSlots.length === 0) ? (
                            <span className="text-emerald-700 font-bold text-[11px]">Rảnh cả tuần</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {t.unavailableSlots.map((u, i) => {
                                const isAfternoon = u.session === 'AFTERNOON';
                                const sessLabel = isAfternoon ? 'Chiều' : 'Sáng';
                                return (
                                  <span
                                    key={i}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                      isAfternoon
                                        ? 'bg-cyan-100 text-cyan-950 border-cyan-300'
                                        : 'bg-rose-100 text-rose-950 border-rose-300'
                                    }`}
                                  >
                                    {isAfternoon ? '🌤️' : '☀️'}{sessLabel} T{u.day}-P{u.period}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditTeacher(t)}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 transition-colors cursor-pointer"
                              title="Sửa hồ sơ giáo viên"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeacher(t.id, t.name)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors cursor-pointer"
                              title="Xóa giáo viên"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* NỘI DUNG MODULE 2: MÔN HỌC                                          */}
        {/* =================================================================== */}
        {activeModule === 'SUBJECTS' && (
          <div className="p-5 space-y-5">
            {/* MODAL THÊM / SỬA MÔN HỌC */}
            {isAddingSubject && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-400 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5">
                  <form onSubmit={handleSaveSubject} className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-amber-200">
                      <h4 className="font-black text-base text-amber-950 uppercase flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-amber-700" />
                        {editingSubjectId ? 'Chỉnh Sửa Thông Tin Môn Học' : 'Nhập Môn Học Mới'}
                      </h4>
                      <button
                        type="button"
                        onClick={resetSubjectForm}
                        className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {/* Mã môn */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Mã Môn Học (Bắt buộc) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: TOAN, VAN, ANH"
                          value={subjectForm.code || ''}
                          onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-black text-slate-900"
                        />
                      </div>

                      {/* Tên đầy đủ */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Tên Đầy Đủ Môn Học *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Toán Học, Ngữ Văn"
                          value={subjectForm.name || ''}
                          onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        />
                      </div>

                      {/* Tên viết tắt */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Tên Viết Tắt (Bản In) *
                        </label>
                        <input
                          type="text"
                          placeholder="VD: Toán, Văn, TAnh, Tin"
                          value={subjectForm.shortName || ''}
                          onChange={(e) => setSubjectForm({ ...subjectForm, shortName: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        />
                      </div>

                      {/* Phân loại Buổi học (Sáng / Chiều) */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Phân Loại Buổi Học *
                        </label>
                        <select
                          value={subjectForm.preferredShift || 'MORNING'}
                          onChange={(e) =>
                            setSubjectForm({
                              ...subjectForm,
                              preferredShift: e.target.value as 'MORNING' | 'AFTERNOON' | 'ANY',
                            })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        >
                          <option value="MORNING">☀️ Buổi Sáng (Tiết 1 - 5)</option>
                          <option value="AFTERNOON">🌤️ Buổi Chiều (Tiết 6 - 10)</option>
                          <option value="ANY">🔄 Cả Sáng & Chiều (Linh hoạt)</option>
                        </select>
                      </div>
                    </div>

                    {/* Tùy chọn Môn nặng (không > 2 tiết/ngày) */}
                    <div className="pt-2 border-t border-amber-200">
                      <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-900 text-xs bg-amber-50/70 p-3 rounded-xl border border-amber-300 w-full">
                        <input
                          type="checkbox"
                          checked={!!subjectForm.isHeavy}
                          onChange={(e) => setSubjectForm({ ...subjectForm, isHeavy: e.target.checked })}
                          className="w-4 h-4 rounded text-amber-600 cursor-pointer"
                        />
                        <span className="font-extrabold text-amber-950">
                          Môn nặng (không &gt; 2 tiết/ngày)
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          — Thuật toán sẽ tự động phân bổ đều trong tuần, không xếp quá 2 tiết cho môn này trong 1 ngày
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-amber-200">
                      <button
                        type="button"
                        onClick={resetSubjectForm}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 text-xs cursor-pointer"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 font-black text-white text-xs shadow-sm cursor-pointer"
                      >
                        {editingSubjectId ? 'Lưu Cập Nhật' : 'Lưu Môn Học'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* BẢNG DANH SÁCH MÔN HỌC */}
            {filteredSubjects.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200 animate-fade-in">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">
                  {searchTerm ? 'Không tìm thấy môn học nào phù hợp' : 'Chưa có Môn học trong hệ thống, hãy thêm dữ liệu vào hệ thống'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchTerm
                    ? `Không có kết quả nào khớp với từ khóa "${searchTerm}". Vui lòng thử từ khóa khác.`
                    : 'Hãy thêm dữ liệu Môn học vào hệ thống bằng cách bấm "+ Thêm Thủ Công" hoặc "Nhập Từ File Excel" ở góc trên.'}
                </p>
                {!searchTerm && (
                  <div className="pt-2 flex items-center justify-center gap-2.5">
                    <button
                      onClick={() => {
                        resetSubjectForm();
                        setIsAddingSubject(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Thêm Môn Học Đầu Tiên</span>
                    </button>
                    <button
                      onClick={() => subjectFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Nhập Từ File Excel</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b-2 border-slate-900 text-white uppercase font-black text-[11px]">
                      <th className="py-3 px-4 w-28">Mã Môn</th>
                      <th className="py-3 px-4">Tên Đầy Đủ Môn Học</th>
                      <th className="py-3 px-4">Tên Viết Tắt (Bản in)</th>
                      <th className="py-3 px-4 text-center">Phân Loại Buổi Học</th>
                      <th className="py-3 px-4 text-center">Tính Chất Môn Học</th>
                      <th className="py-3 px-3 text-center w-28">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSubjects.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-black text-amber-950 text-xs">
                          <span className="bg-amber-50 border border-amber-300 px-2 py-1 rounded">
                            {sub.code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-black text-slate-950 text-sm">
                          {sub.name}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-black text-indigo-950 px-2.5 py-1 rounded bg-slate-100 border border-slate-300">
                            {sub.shortName || sub.code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {sub.preferredShift === 'MORNING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-950 border border-amber-300">
                              ☀️ Buổi Sáng
                            </span>
                          )}
                          {sub.preferredShift === 'AFTERNOON' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-cyan-50 text-cyan-950 border border-cyan-300">
                              🌤️ Buổi Chiều
                            </span>
                          )}
                          {(!sub.preferredShift || sub.preferredShift === 'ANY') && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              🔄 Sáng & Chiều
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {sub.isHeavy ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300">
                              Môn nặng (không &gt; 2 tiết/ngày)
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              Môn Chuẩn
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEditSubject(sub)}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 cursor-pointer"
                              title="Sửa môn học"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(sub.id, sub.name)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                              title="Xóa môn học"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* NỘI DUNG MODULE 3: LỚP HỌC                                          */}
        {/* =================================================================== */}
        {activeModule === 'CLASSES' && (
          <div className="p-5 space-y-5">
            {/* CẢNH BÁO TRÙNG LỚP CHỦ NHIỆM NẾU CÓ TRONG HỆ THỐNG */}
            {duplicateHomeroomTeachers.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 shadow-sm space-y-2">
                <div className="flex items-center gap-2 font-black text-sm text-rose-900 uppercase">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Cảnh Báo: Phát Hiện {duplicateHomeroomTeachers.length} Giáo Viên Bị Trùng Lớp Chủ Nhiệm</span>
                </div>
                <p className="text-xs text-rose-800">
                  Một giáo viên chỉ được phép chủ nhiệm 1 lớp. Các giáo viên sau đang được gán chủ nhiệm cho từ 2 lớp trở lên, vui lòng kiểm tra và sửa lại:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {duplicateHomeroomTeachers.map((dup) => (
                    <div
                      key={dup.teacherId}
                      className="bg-white p-3 rounded-xl border border-rose-200 shadow-2xs space-y-1"
                    >
                      <div className="font-black text-xs text-rose-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>
                        {dup.teacherName}
                      </div>
                      <div className="text-[11px] text-slate-700 flex items-center gap-1 flex-wrap">
                        <span className="text-slate-500 font-semibold">Chủ nhiệm các lớp:</span>
                        {dup.classes.map((c) => (
                          <span
                            key={c.id}
                            className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-950 font-mono font-bold border border-rose-200"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MODAL THÊM / SỬA LỚP HỌC */}
            {isAddingClass && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-400 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5">
                  <form onSubmit={handleSaveClass} className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-200">
                      <h4 className="font-black text-base text-emerald-950 uppercase flex items-center gap-2">
                        <School className="w-5 h-5 text-emerald-700" />
                        {editingClassId ? 'Chỉnh Sửa Thông Tin Lớp Học' : 'Nhập Lớp Học Mới'}
                      </h4>
                      <button
                        type="button"
                        onClick={resetClassForm}
                        className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-900 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {/* Mã lớp */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Mã Lớp (Bắt buộc) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: 10A1, 10A2, 11B1"
                          value={classForm.code || ''}
                          onChange={(e) => setClassForm({ ...classForm, code: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-black text-slate-900"
                        />
                      </div>

                      {/* Tên lớp */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">
                          Tên Lớp Đầy Đủ *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Lớp 10A1"
                          value={classForm.name || ''}
                          onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        />
                      </div>

                      {/* Khối lớp */}
                      <div>
                        <label className="block font-bold text-slate-900 mb-1">Khối Lớp *</label>
                        <select
                          value={classForm.grade || 10}
                          onChange={(e) => setClassForm({ ...classForm, grade: Number(e.target.value) as 10 | 11 | 12 })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        >
                          <option value={10}>Khối 10</option>
                          <option value={11}>Khối 11</option>
                          <option value={12}>Khối 12</option>
                        </select>
                      </div>

                      {/* GVCN - Ẩn các giáo viên đã được phân công chủ nhiệm ở lớp khác */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-slate-900">GV Chủ Nhiệm</label>
                          {assignedTeacherIdsToOtherClasses.size > 0 && (
                            <span className="text-[10px] text-emerald-800 font-black bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              Đã ẩn {assignedTeacherIdsToOtherClasses.size} GV đã CN
                            </span>
                          )}
                        </div>
                        <select
                          value={classForm.homeroomTeacherId || ''}
                          onChange={(e) => setClassForm({ ...classForm, homeroomTeacherId: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                        >
                          <option value="">-- Chưa phân công --</option>
                          {availableTeachersForHomeroom.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.shortName || t.code})
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Chỉ hiển thị các giáo viên chưa được phân công làm chủ nhiệm lớp khác.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-emerald-200">
                      <button
                        type="button"
                        onClick={resetClassForm}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 text-xs cursor-pointer"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black text-white text-xs shadow-sm cursor-pointer"
                      >
                        {editingClassId ? 'Lưu Cập Nhật' : 'Lưu Lớp Học'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* BẢNG DANH SÁCH LỚP HỌC */}
            {filteredClasses.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200 animate-fade-in">
                <School className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">
                  {searchTerm ? 'Không tìm thấy lớp học nào phù hợp' : 'Chưa có Lớp học trong hệ thống, hãy thêm dữ liệu vào hệ thống'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchTerm
                    ? `Không có kết quả nào khớp với từ khóa "${searchTerm}". Vui lòng thử từ khóa khác.`
                    : 'Hãy thêm dữ liệu Lớp học vào hệ thống bằng cách bấm "+ Thêm Thủ Công" hoặc "Nhập Từ File Excel" ở góc trên.'}
                </p>
                {!searchTerm && (
                  <div className="pt-2 flex items-center justify-center gap-2.5">
                    <button
                      onClick={() => {
                        resetClassForm();
                        setIsAddingClass(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Thêm Lớp Học Đầu Tiên</span>
                    </button>
                    <button
                      onClick={() => classFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Nhập Từ File Excel</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b-2 border-slate-900 text-white uppercase font-black text-[11px]">
                      <th className="py-3 px-4 w-28">Mã Lớp</th>
                      <th className="py-3 px-4">Tên Lớp Học</th>
                      <th className="py-3 px-4 text-center w-28">Khối Lớp</th>
                      <th className="py-3 px-4">Giáo Viên Chủ Nhiệm</th>
                      <th className="py-3 px-3 text-center w-28">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredClasses.map((cls) => {
                      const hrTeacher = teachers.find((t) => t.id === cls.homeroomTeacherId);
                      const dupInfo = hrTeacher
                        ? duplicateHomeroomTeachers.find((d) => d.teacherId === hrTeacher.id)
                        : null;

                      return (
                        <tr
                          key={cls.id}
                          className={`transition-colors ${
                            dupInfo ? 'bg-rose-50/70 hover:bg-rose-100/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-black text-emerald-950 text-xs">
                            <span className="bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded">
                              {cls.code || cls.name}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-black text-slate-950 text-sm">
                            {cls.name}
                          </td>
                          <td className="py-3.5 px-4 text-center font-black text-emerald-900">
                            <span className="bg-slate-100 border border-slate-300 px-2.5 py-1 rounded">
                              Khối {cls.grade}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-900 font-bold">
                            {hrTeacher ? (
                              dupInfo ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-300 text-rose-950 text-xs">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>
                                    <strong>{hrTeacher.name}</strong> ({hrTeacher.shortName || hrTeacher.code})
                                  </span>
                                  <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-black">
                                    ⚠️ Trùng {dupInfo.classes.length} lớp ({dupInfo.classes.map((c) => c.name).join(', ')})
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs">
                                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                                  {hrTeacher.name} ({hrTeacher.shortName || hrTeacher.code})
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 italic font-normal text-xs">Chưa phân công</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEditClass(cls)}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 cursor-pointer"
                                title="Sửa lớp học"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClass(cls.id, cls.name)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                                title="Xóa lớp học"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL TÙY CHỌN XÓA DỮ LIỆU (GIÁO VIÊN / MÔN HỌC / LỚP HỌC / FIREBASE) */}
        {/* =================================================================== */}
        {isClearModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header Modal */}
              <div className="p-5 bg-gradient-to-r from-rose-950 via-slate-950 to-slate-900 text-white flex items-center justify-between border-b border-rose-800/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-300">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wide text-white">
                      Xóa Dữ Liệu Nhập & Firebase
                    </h3>
                    <p className="text-[11px] text-rose-300 font-medium">
                      Đồng bộ xóa trên giao diện & Firestore (thoikhoabieu-e731c)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsClearModalOpen(false)}
                  disabled={isClearing}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body Modal */}
              <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-800">
                {/* Cảnh báo */}
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-950">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <strong className="block font-black text-rose-950">Lưu ý quan trọng:</strong>
                    <p className="text-[11px] leading-relaxed text-rose-900">
                      Thao tác này sẽ xóa sạch dữ liệu của các mục đã chọn trên màn hình chương trình đồng thời <strong>xóa vĩnh viễn dữ liệu trên Firebase Firestore</strong>. Không thể hoàn tác sau khi xác nhận.
                    </p>
                  </div>
                </div>

                {/* Nút chọn nhanh */}
                <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1">
                  <span className="font-bold text-slate-700 text-xs">Tùy chọn nhanh:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClearOptions({
                          teachers: true,
                          subjects: true,
                          classes: true,
                          assignments: true,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-950 font-black text-[11px] cursor-pointer"
                    >
                      Chọn Tất Cả
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClearOptions({
                          teachers: true,
                          subjects: false,
                          classes: false,
                          assignments: false,
                        })
                      }
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
                    >
                      Chỉ GV
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClearOptions({
                          teachers: false,
                          subjects: true,
                          classes: false,
                          assignments: false,
                        })
                      }
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
                    >
                      Chỉ Môn
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClearOptions({
                          teachers: false,
                          subjects: false,
                          classes: true,
                          assignments: false,
                        })
                      }
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
                    >
                      Chỉ Lớp
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClearOptions({
                          teachers: false,
                          subjects: false,
                          classes: false,
                          assignments: false,
                        })
                      }
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-[11px] cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {/* Danh sách 4 khối lựa chọn */}
                <div className="space-y-2.5 pt-1">
                  {/* Mục 1: Giáo Viên */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedClearOptions.teachers
                        ? 'border-rose-500 bg-rose-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedClearOptions.teachers}
                        onChange={(e) =>
                          setSelectedClearOptions({
                            ...selectedClearOptions,
                            teachers: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                      />
                      <div>
                        <div className="font-black text-slate-950 text-xs flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span>1. Danh Sách Giáo Viên</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Xóa toàn bộ hồ sơ giáo viên trên giao diện và Firebase collection <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">teachers</code>
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 shrink-0">
                      {teachers.length} GV
                    </span>
                  </label>

                  {/* Mục 2: Môn Học */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedClearOptions.subjects
                        ? 'border-rose-500 bg-rose-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedClearOptions.subjects}
                        onChange={(e) =>
                          setSelectedClearOptions({
                            ...selectedClearOptions,
                            subjects: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                      />
                      <div>
                        <div className="font-black text-slate-950 text-xs flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-amber-600" />
                          <span>2. Danh Sách Môn Học</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Xóa toàn bộ môn học trên giao diện và Firebase collection <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">subjects</code>
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 shrink-0">
                      {subjects.length} Môn
                    </span>
                  </label>

                  {/* Mục 3: Lớp Học */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedClearOptions.classes
                        ? 'border-rose-500 bg-rose-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedClearOptions.classes}
                        onChange={(e) =>
                          setSelectedClearOptions({
                            ...selectedClearOptions,
                            classes: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                      />
                      <div>
                        <div className="font-black text-slate-950 text-xs flex items-center gap-1.5">
                          <School className="w-4 h-4 text-emerald-600" />
                          <span>3. Danh Sách Lớp Học</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Xóa toàn bộ lớp học trên giao diện và Firebase collection <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">classes</code>
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 shrink-0">
                      {classes.length} Lớp
                    </span>
                  </label>

                  {/* Mục 4: Phân Công Giảng Dạy (PCGD) */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedClearOptions.assignments
                        ? 'border-rose-500 bg-rose-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedClearOptions.assignments}
                        onChange={(e) =>
                          setSelectedClearOptions({
                            ...selectedClearOptions,
                            assignments: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                      />
                      <div>
                        <div className="font-black text-slate-950 text-xs flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          <span>4. Phân Công Giảng Dạy (PCGD)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Xóa toàn bộ phân công trên giao diện và Firebase collection <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">teaching_assignments</code>
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-950 shrink-0">
                      {assignments.length} Mục
                    </span>
                  </label>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsClearModalOpen(false)}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 border border-slate-300 font-bold text-slate-800 text-xs cursor-pointer transition-colors"
                >
                  Hủy Bỏ
                </button>

                <button
                  type="button"
                  onClick={handleExecuteClearData}
                  disabled={
                    isClearing ||
                    (!selectedClearOptions.teachers &&
                      !selectedClearOptions.subjects &&
                      !selectedClearOptions.classes &&
                      !selectedClearOptions.assignments)
                  }
                  className={`px-5 py-2.5 rounded-xl font-black text-xs text-white shadow-sm flex items-center gap-2 transition-all ${
                    isClearing ||
                    (!selectedClearOptions.teachers &&
                      !selectedClearOptions.subjects &&
                      !selectedClearOptions.classes &&
                      !selectedClearOptions.assignments)
                      ? 'bg-slate-400 cursor-not-allowed opacity-60'
                      : 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                  }`}
                >
                  {isClearing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Xóa Trên Firebase...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>XÁC NHẬN XÓA DỮ LIỆU ĐÃ CHỌN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL XÁC NHẬN XÓA TỪNG MỤC (GIÁO VIÊN / MÔN HỌC / LỚP HỌC) */}
        {deleteTarget && deleteTarget.isOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border-2 border-rose-300 max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
              <div className="flex items-center gap-3 text-rose-600 border-b border-rose-100 pb-3">
                <div className="p-3 bg-rose-100 rounded-full shrink-0">
                  <Trash2 className="w-6 h-6 text-rose-700" />
                </div>
                <div>
                  <h4 className="font-black text-base text-slate-950">
                    Xác Nhận Xóa{' '}
                    {deleteTarget.type === 'TEACHER' && 'Giáo Viên'}
                    {deleteTarget.type === 'SUBJECT' && 'Môn Học'}
                    {deleteTarget.type === 'CLASS' && 'Lớp Học'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Hệ thống sẽ cập nhật và lưu thay đổi ngay trên Firebase
                  </p>
                </div>
              </div>

              <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200 text-xs space-y-2 text-slate-800">
                <p className="font-bold text-rose-950">
                  Bạn có chắc chắn muốn xóa mục sau đây không?
                </p>
                <div className="space-y-1 font-extrabold text-slate-900 bg-white p-3 rounded-lg border border-rose-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Tên:</span>
                    <span className="text-indigo-950 font-black">{deleteTarget.name}</span>
                  </div>
                  {deleteTarget.code && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Mã:</span>
                      <span className="font-mono text-slate-700">{deleteTarget.code}</span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-rose-700 italic font-semibold">
                  ⚠️ Mục này sẽ được xóa vĩnh viễn khỏi danh sách và đồng bộ lập tức lên Firebase Firestore.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteTarget.isDeleting}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-xs text-slate-800 cursor-pointer transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTarget}
                  disabled={deleteTarget.isDeleting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteTarget.isDeleting ? (
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
      </div>
    </div>
  );
};

