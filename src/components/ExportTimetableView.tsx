/**
 * Component Xuất & In Thời Khóa Biểu (ExportTimetableView)
 * Hỗ trợ xem trực quan và in ấn theo chuẩn hình ảnh trường học Việt Nam:
 * 1. Chế độ xem:
 *    - TKB Toàn trường (Buổi sáng & Buổi chiều)
 *    - TKB Từng Lớp (lần lượt từ lớp đầu tiên đến lớp cuối cùng)
 *    - TKB Từng Giáo Viên (lần lượt từ GV đầu tiên đến GV cuối cùng)
 * 2. Xuất file Excel (.xlsx) gồm đúng 3 Sheet:
 *    - Sheet 1: TKB Toàn Trường (cả Buổi sáng & Buổi chiều)
 *    - Sheet 2: TKB Từng Lớp (tất cả các lớp lần lượt)
 *    - Sheet 3: TKB Từng Giáo Viên (tất cả các GV lần lượt, định dạng [Lớp] - [Môn])
 * 3. Hỗ trợ in ấn A4 (Print / Xuất PDF) với page break chuẩn đẹp
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  TimetableSlot,
  SchoolClass,
  Teacher,
  Subject,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  PERIODS,
} from '../types/timetable';
import {
  Printer,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Sun,
  Moon,
  Layers,
  Users,
  GraduationCap,
  Building2,
  Calendar,
  Filter,
  Cloud,
  CloudUpload,
  CloudCheck,
  Save,
} from 'lucide-react';
import {
  exportThreeSheetTimetableExcel,
  getCellContentForClass,
  getCellContentForTeacher,
  ExportConfig,
} from '../utils/timetableExcelExport';
import {
  saveExportConfigToFirebase,
  fetchExportConfigFromFirebase,
} from '../services/firebaseClient';

interface Props {
  slots: TimetableSlot[];
  classes: SchoolClass[];
  teachers: Teacher[];
  subjects: Subject[];
  initialConfig?: ExportConfig;
  onConfigSaved?: (config: ExportConfig) => void;
}

export const ExportTimetableView: React.FC<Props> = ({
  slots,
  classes,
  teachers,
  subjects,
  initialConfig,
  onConfigSaved,
}) => {
  // Chế độ xem: Toàn trường / Từng lớp / Từng giáo viên
  const [viewMode, setViewMode] = useState<'SCHOOL' | 'CLASS' | 'TEACHER'>('SCHOOL');

  // Chế độ buổi cho TKB Toàn Trường: Sáng / Chiều / Cả hai buổi
  const [schoolShiftFilter, setSchoolShiftFilter] = useState<'MORNING' | 'AFTERNOON' | 'BOTH'>('BOTH');

  // Lọc lớp học (Sheet 2)
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  // Lọc giáo viên (Sheet 3)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('ALL');

  // Thông tin tiêu đề cấu hình xuất bản (Khởi tạo từ initialConfig hoặc mặc định)
  const [schoolName, setSchoolName] = useState(initialConfig?.schoolName || 'TRƯỜNG PTDTNT THPT');
  const [semesterYear, setSemesterYear] = useState(initialConfig?.semesterYear || 'HỌC KỲ I - NĂM HỌC: 2026-2027');
  const [weekInfo, setWeekInfo] = useState(initialConfig?.weekInfo || 'TUẦN ÁP DỤNG: THỜI KHÓA BIỂU CHÍNH THỨC');
  const [effectiveDate, setEffectiveDate] = useState(initialConfig?.effectiveDate || '05/09/2026');

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'UNSAVED' | 'SAVING' | 'SAVED'>('IDLE');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Tự động tải thông tin tiêu đề đã lưu từ Firebase Firestore khi mở component
  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.schoolName) setSchoolName(initialConfig.schoolName);
      if (initialConfig.semesterYear) setSemesterYear(initialConfig.semesterYear);
      if (initialConfig.weekInfo) setWeekInfo(initialConfig.weekInfo);
      if (initialConfig.effectiveDate) setEffectiveDate(initialConfig.effectiveDate);
      setSaveStatus('SAVED');
    } else {
      fetchExportConfigFromFirebase().then((cfg) => {
        if (cfg) {
          if (cfg.schoolName) setSchoolName(cfg.schoolName);
          if (cfg.semesterYear) setSemesterYear(cfg.semesterYear);
          if (cfg.weekInfo) setWeekInfo(cfg.weekInfo);
          if (cfg.effectiveDate) setEffectiveDate(cfg.effectiveDate);
          setSaveStatus('SAVED');
        }
      });
    }
  }, [initialConfig]);

  /**
   * Lưu các thông tin tiêu đề xuất TKB lên Firebase Firestore
   */
  const handleSaveConfigToFirebase = async () => {
    setIsSavingConfig(true);
    setSaveStatus('SAVING');
    try {
      const config: ExportConfig = {
        schoolName: schoolName.trim(),
        semesterYear: semesterYear.trim(),
        weekInfo: weekInfo.trim(),
        effectiveDate: effectiveDate.trim(),
      };
      const success = await saveExportConfigToFirebase(config);
      if (success) {
        setSaveStatus('SAVED');
        setSaveSuccessMessage('Đã lưu cấu hình lên Firebase thành công!');
        if (onConfigSaved) onConfigSaved(config);
        setTimeout(() => setSaveSuccessMessage(null), 3000);
      } else {
        setSaveStatus('UNSAVED');
      }
    } catch (err) {
      console.error('Lỗi khi lưu cấu hình lên Firebase:', err);
      setSaveStatus('UNSAVED');
    } finally {
      setIsSavingConfig(false);
    }
  };

  /**
   * Tự động lưu lên Firebase khi người dùng nhập xong và click ra ngoài (onBlur)
   */
  const handleAutoSaveOnBlur = () => {
    const config: ExportConfig = {
      schoolName: schoolName.trim(),
      semesterYear: semesterYear.trim(),
      weekInfo: weekInfo.trim(),
      effectiveDate: effectiveDate.trim(),
    };
    saveExportConfigToFirebase(config).then((ok) => {
      if (ok) {
        setSaveStatus('SAVED');
        if (onConfigSaved) onConfigSaved(config);
      }
    });
  };

  // Maps để tra cứu nhanh dữ liệu
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teachersMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // Danh sách các cột lớp học thực tế
  const targetClasses = useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        name: c.name.replace('Lớp ', ''),
      })),
    [classes]
  );

  // Danh sách lớp hiển thị theo bộ lọc
  const displayClasses = useMemo(() => {
    if (selectedClassId === 'ALL') return classes;
    return classes.filter((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Danh sách giáo viên hiển thị theo bộ lọc
  const displayTeachers = useMemo(() => {
    if (selectedTeacherId === 'ALL') return teachers;
    return teachers.filter((t) => t.id === selectedTeacherId);
  }, [teachers, selectedTeacherId]);

  /**
   * Gọi hàm xuất file Excel 3 Sheet chuẩn định dạng
   */
  const handleExportFullExcel = async () => {
    setIsExportingExcel(true);
    try {
      const config: ExportConfig = {
        schoolName,
        semesterYear,
        weekInfo,
        effectiveDate,
      };
      await exportThreeSheetTimetableExcel(slots, classes, teachers, subjects, config);
    } catch (err) {
      console.error('Lỗi khi xuất file Excel 3 Sheet:', err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  /**
   * In bảng Thời khóa biểu (Gọi Print dialog của trình duyệt)
   */
  const handlePrint = () => {
    window.print();
  };

  /**
   * Sao chép bảng vào Clipboard
   */
  const handleCopyTable = () => {
    let text = `Thứ\tTiết\t` + targetClasses.map((c) => c.name).join('\t') + '\n';

    DAYS_OF_WEEK.forEach(({ key: day, label }) => {
      PERIODS.forEach(({ period }) => {
        const row = [label, `Tiết ${period}`];
        targetClasses.forEach((cls) => {
          row.push(
            getCellContentForClass(
              slots,
              subjectsMap,
              teachersMap,
              classes,
              day,
              period,
              cls.id,
              'MORNING'
            )
          );
        });
        text += row.join('\t') + '\n';
      });
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* THANH ĐIỀU KHIỂN & CẤU HÌNH XUẤT FILE (ẨN KHI IN) */}
      <div className="print:hidden bg-white rounded-2xl border-2 border-slate-300 shadow-sm p-4 sm:p-5 space-y-4">
        {/* Hàng 1: Tiêu đề & Các nút chức năng chính */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
              <Printer className="w-5 h-5 text-indigo-700" />
              Xuất & In Thời Khóa Biểu (Chuẩn Form 3 Sheet Việt Nam)
            </h3>
            <p className="text-xs text-slate-600 font-bold mt-0.5">
              Hỗ trợ in ấn A4 và xuất 1 file Excel gồm đầy đủ 3 Sheet: <strong>Sheet 1: TKB Toàn trường</strong>, <strong>Sheet 2: TKB Từng lớp</strong>, <strong>Sheet 3: TKB Từng giáo viên</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Nút Xuất 1 file gồm 3 sheet */}
            <button
              onClick={handleExportFullExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-black hover:bg-emerald-600 active:scale-95 shadow-md transition-all cursor-pointer disabled:opacity-50"
              title="Xuất 1 file Excel (.xlsx) gồm đầy đủ 3 Sheet: Toàn trường, Từng lớp, Từng GV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>{isExportingExcel ? 'Đang tạo Excel 3 Sheet...' : 'In TKB / Xuất File Excel (3 Sheet)'}</span>
            </button>

            {/* Nút In / Xuất PDF */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800 active:scale-95 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>In Bản In (PDF / Máy in)</span>
            </button>

            {/* Copy Clipboard */}
            <button
              onClick={handleCopyTable}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-black hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer"
              title="Sao chép ma trận TKB"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
              <span>{copied ? 'Đã chép' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Chọn Chế độ xem (Tab 1: Toàn trường, Tab 2: Từng lớp, Tab 3: Từng giáo viên) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              Chế độ xem:
            </span>
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-300">
              <button
                onClick={() => setViewMode('SCHOOL')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewMode === 'SCHOOL'
                    ? 'bg-indigo-900 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Sheet 1: TKB Toàn Trường</span>
              </button>

              <button
                onClick={() => setViewMode('CLASS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewMode === 'CLASS'
                    ? 'bg-cyan-700 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Sheet 2: TKB Từng Lớp</span>
              </button>

              <button
                onClick={() => setViewMode('TEACHER')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewMode === 'TEACHER'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sheet 3: TKB Từng Giáo Viên</span>
              </button>
            </div>
          </div>

          {/* Bộ lọc phụ thuộc vào từng chế độ xem */}
          <div className="flex items-center gap-3">
            {viewMode === 'SCHOOL' && (
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-300 text-xs font-bold">
                <button
                  onClick={() => setSchoolShiftFilter('BOTH')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    schoolShiftFilter === 'BOTH'
                      ? 'bg-slate-950 text-white font-black'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  Cả Sáng & Chiều
                </button>
                <button
                  onClick={() => setSchoolShiftFilter('MORNING')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    schoolShiftFilter === 'MORNING'
                      ? 'bg-amber-500 text-white font-black'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <Sun className="w-3 h-3" />
                  <span>Buổi Sáng</span>
                </button>
                <button
                  onClick={() => setSchoolShiftFilter('AFTERNOON')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    schoolShiftFilter === 'AFTERNOON'
                      ? 'bg-indigo-800 text-white font-black'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <Moon className="w-3 h-3" />
                  <span>Buổi Chiều</span>
                </button>
              </div>
            )}

            {viewMode === 'CLASS' && (
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <label className="text-xs font-bold text-slate-700">Lớp hiển thị:</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">Xem tất cả các lớp ({classes.length} lớp - Chuẩn in)</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.shift === 'MORNING' ? '(Sáng)' : '(Chiều)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === 'TEACHER' && (
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <label className="text-xs font-bold text-slate-700">Giáo viên:</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">Xem tất cả giáo viên ({teachers.length} GV - Chuẩn in)</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subjects.join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Hàng 3: Cấu hình thông tin Header bản in & Lưu Firebase */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Thông tin tiêu đề bản in & File xuất (Tự động lưu Firebase):</span>
            </div>

            <div className="flex items-center gap-2">
              {saveSuccessMessage && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1 animate-fade-in shadow-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  {saveSuccessMessage}
                </span>
              )}
              {saveStatus === 'SAVED' && !saveSuccessMessage && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Đã lưu Firebase
                </span>
              )}
              {saveStatus === 'UNSAVED' && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  Chưa lưu thay đổi
                </span>
              )}

              <button
                type="button"
                onClick={handleSaveConfigToFirebase}
                disabled={isSavingConfig}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Lưu các thông tin Đơn vị trường, Học kỳ, Tuần áp dụng lên Firebase để không cần nhập lại khi khởi động lại"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{isSavingConfig ? 'Đang lưu...' : 'Lưu lên Firebase'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Đơn vị trường:
              </label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => {
                  setSchoolName(e.target.value);
                  setSaveStatus('UNSAVED');
                }}
                onBlur={handleAutoSaveOnBlur}
                placeholder="VD: TRƯỜNG THPT NGUYỄN TRÃI"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Học kỳ & Năm học:
              </label>
              <input
                type="text"
                value={semesterYear}
                onChange={(e) => {
                  setSemesterYear(e.target.value);
                  setSaveStatus('UNSAVED');
                }}
                onBlur={handleAutoSaveOnBlur}
                placeholder="VD: HỌC KỲ I - NĂM HỌC 2026-2027"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Tuần áp dụng:
              </label>
              <input
                type="text"
                value={weekInfo}
                onChange={(e) => {
                  setWeekInfo(e.target.value);
                  setSaveStatus('UNSAVED');
                }}
                onBlur={handleAutoSaveOnBlur}
                placeholder="VD: TUẦN ÁP DỤNG: TKB CHÍNH THỨC"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Có tác dụng từ ngày:
              </label>
              <input
                type="text"
                value={effectiveDate}
                onChange={(e) => {
                  setEffectiveDate(e.target.value);
                  setSaveStatus('UNSAVED');
                }}
                onBlur={handleAutoSaveOnBlur}
                placeholder="VD: 05/09/2026"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KHU VỰC HIỂN THỊ XEM TRƯỚC VÀ IN ẤN */}
      <div
        ref={printAreaRef}
        className="bg-white rounded-2xl border-2 border-slate-300 shadow-md p-6 sm:p-8 overflow-x-auto print:p-0 print:border-none print:shadow-none print:m-0 print:rounded-none"
      >
        {/* ========================================================================= */}
        {/* CHẾ ĐỘ 1: XEM TKB TOÀN TRƯỜNG (SHEET 1) */}
        {/* ========================================================================= */}
        {viewMode === 'SCHOOL' && (
          <div className="space-y-10" style={{ minWidth: '1050px' }}>
            {/* BẢNG BUỔI SÁNG */}
            {(schoolShiftFilter === 'BOTH' || schoolShiftFilter === 'MORNING') && (
              <div className="space-y-3">
                {/* Header Buổi sáng */}
                <div className="flex items-start justify-between pb-2 border-b-2 border-slate-900">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-slate-950 uppercase">
                      {schoolName}
                    </h2>
                    <div className="text-xs font-black text-slate-800 uppercase mt-0.5">
                      {semesterYear}
                    </div>
                  </div>

                  <div className="text-center">
                    <h1 className="text-lg sm:text-xl font-black text-slate-950 uppercase tracking-wide">
                      THỜI KHOÁ BIỂU BUỔI SÁNG
                    </h1>
                    <div className="text-xs font-black text-slate-700 uppercase mt-0.5">
                      {weekInfo} • CÓ TÁC DỤNG TỪ NGÀY: {effectiveDate}
                    </div>
                  </div>

                  <div className="w-28 text-right text-[10px] font-bold text-slate-500">
                    TKB Engine Pro
                  </div>
                </div>

                {/* Bảng ma trận lớp Buổi Sáng */}
                <table className="w-full border-collapse border-2 border-slate-900 text-center text-[11px] leading-tight">
                  <thead>
                    <tr className="border-b-2 border-slate-900">
                      <th
                        rowSpan={1}
                        colSpan={2}
                        className="border-r-2 border-slate-900 bg-sky-300 text-slate-950 font-black px-2 py-2 text-xs w-20"
                      >
                        Lớp / Tiết
                      </th>
                      {targetClasses.map((cls) => (
                        <th
                          key={cls.id}
                          className="border-r border-slate-900 last:border-r-0 bg-sky-300 text-slate-950 font-black px-1 py-2 text-xs uppercase"
                        >
                          {cls.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS_OF_WEEK.map(({ key: day, label }) => {
                      return PERIODS.map(({ period }, periodIdx) => {
                        const isFirst = periodIdx === 0;
                        return (
                          <tr
                            key={`morning_${day}_${period}`}
                            className={`border-b border-slate-900 hover:bg-slate-50 ${
                              period === 5 ? 'border-b-4 border-slate-900' : ''
                            }`}
                          >
                            {isFirst && (
                              <td
                                rowSpan={5}
                                className="border-r-2 border-slate-900 bg-sky-300 text-slate-950 font-black p-1 text-center align-middle w-12"
                              >
                                <div className="font-black text-xs uppercase tracking-wider py-2">
                                  {label}
                                </div>
                              </td>
                            )}
                            <td className="border-r-2 border-slate-900 font-black text-xs text-slate-950 bg-slate-100 p-1 w-8">
                              {period}
                            </td>
                            {targetClasses.map((cls) => {
                              const content = getCellContentForClass(
                                slots,
                                subjectsMap,
                                teachersMap,
                                classes,
                                day,
                                period,
                                cls.id,
                                'MORNING'
                              );
                              const isCC = content === 'Chào cờ';
                              return (
                                <td
                                  key={cls.id}
                                  className={`border-r border-slate-900 last:border-r-0 p-1 font-bold align-middle min-w-[70px] ${
                                    isCC
                                      ? 'bg-amber-100 text-amber-950 font-black'
                                      : content
                                      ? 'text-slate-950'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {content || '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* BẢNG BUỔI CHIỀU */}
            {(schoolShiftFilter === 'BOTH' || schoolShiftFilter === 'AFTERNOON') && (
              <div className="space-y-3 pt-4 border-t-4 border-slate-300 print:pt-6 print:border-t-2 print:page-break-before-always">
                {/* Header Buổi Chiều */}
                <div className="flex items-start justify-between pb-2 border-b-2 border-slate-900">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-slate-950 uppercase">
                      {schoolName}
                    </h2>
                    <div className="text-xs font-black text-slate-800 uppercase mt-0.5">
                      {semesterYear}
                    </div>
                  </div>

                  <div className="text-center">
                    <h1 className="text-lg sm:text-xl font-black text-slate-950 uppercase tracking-wide">
                      THỜI KHOÁ BIỂU BUỔI CHIỀU
                    </h1>
                    <div className="text-xs font-black text-slate-700 uppercase mt-0.5">
                      {weekInfo} • CÓ TÁC DỤNG TỪ NGÀY: {effectiveDate}
                    </div>
                  </div>

                  <div className="w-28 text-right text-[10px] font-bold text-slate-500">
                    TKB Engine Pro
                  </div>
                </div>

                {/* Bảng ma trận lớp Buổi Chiều */}
                <table className="w-full border-collapse border-2 border-slate-900 text-center text-[11px] leading-tight">
                  <thead>
                    <tr className="border-b-2 border-slate-900">
                      <th
                        rowSpan={1}
                        colSpan={2}
                        className="border-r-2 border-slate-900 bg-sky-300 text-slate-950 font-black px-2 py-2 text-xs w-20"
                      >
                        Lớp / Tiết
                      </th>
                      {targetClasses.map((cls) => (
                        <th
                          key={cls.id}
                          className="border-r border-slate-900 last:border-r-0 bg-sky-300 text-slate-950 font-black px-1 py-2 text-xs uppercase"
                        >
                          {cls.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS_OF_WEEK.map(({ key: day, label }) => {
                      return PERIODS.map(({ period }, periodIdx) => {
                        const isFirst = periodIdx === 0;
                        return (
                          <tr
                            key={`afternoon_${day}_${period}`}
                            className={`border-b border-slate-900 hover:bg-slate-50 ${
                              period === 5 ? 'border-b-4 border-slate-900' : ''
                            }`}
                          >
                            {isFirst && (
                              <td
                                rowSpan={5}
                                className="border-r-2 border-slate-900 bg-sky-300 text-slate-950 font-black p-1 text-center align-middle w-12"
                              >
                                <div className="font-black text-xs uppercase tracking-wider py-2">
                                  {label}
                                </div>
                              </td>
                            )}
                            <td className="border-r-2 border-slate-900 font-black text-xs text-slate-950 bg-slate-100 p-1 w-8">
                              {period}
                            </td>
                            {targetClasses.map((cls) => {
                              const content = getCellContentForClass(
                                slots,
                                subjectsMap,
                                teachersMap,
                                classes,
                                day,
                                period,
                                cls.id,
                                'AFTERNOON'
                              );
                              return (
                                <td
                                  key={cls.id}
                                  className={`border-r border-slate-900 last:border-r-0 p-1 font-bold align-middle min-w-[70px] ${
                                    content ? 'text-slate-950' : 'text-slate-300'
                                  }`}
                                >
                                  {content || '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CHẾ ĐỘ 2: XEM TKB TỪNG LỚP (SHEET 2) */}
        {/* ========================================================================= */}
        {viewMode === 'CLASS' && (
          <div className="space-y-12">
            {displayClasses.map((cls, clsIndex) => {
              const homeroomTeacher = cls.homeroomTeacherId
                ? teachersMap.get(cls.homeroomTeacherId) || ''
                : '';

              return (
                <div
                  key={cls.id}
                  className="space-y-3 pb-8 border-b-2 border-slate-300 last:border-b-0 print:border-b-0 print:pb-0 print:page-break-after-always"
                >
                  {/* Header Lớp Học chuẩn ảnh */}
                  <div className="border-b-2 border-slate-900 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="text-xs font-black text-slate-950 uppercase">
                        {schoolName}
                      </div>
                      <div className="text-right text-xs font-black text-slate-800 uppercase">
                        {semesterYear}
                      </div>
                    </div>

                    <div className="text-center my-1.5">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-wide">
                        THỜI KHÓA BIỂU LỚP: {cls.name}
                      </h2>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mt-1">
                      <div>
                        {homeroomTeacher ? (
                          <span>
                            Giáo viên chủ nhiệm: <strong>{homeroomTeacher}</strong>
                          </span>
                        ) : (
                          <span>Lớp: <strong>{cls.name}</strong></span>
                        )}
                      </div>
                      <div>
                        Có tác dụng từ ngày: <strong>{effectiveDate}</strong>
                      </div>
                    </div>
                  </div>

                  {/* BẢNG BUỔI SÁNG & BUỔI CHIỀU CỦA LỚP */}
                  <div className="space-y-4">
                    {/* Buổi Sáng */}
                    <div>
                      <div className="bg-slate-200 border-2 border-b-0 border-slate-900 px-3 py-1 text-xs font-black text-slate-900">
                        Buổi sáng
                      </div>
                      <table className="w-full border-collapse border-2 border-slate-900 text-center text-xs">
                        <thead>
                          <tr className="border-b-2 border-slate-900 bg-sky-300">
                            <th className="border-r-2 border-slate-900 py-1.5 w-14 font-black text-slate-950">
                              Tiết
                            </th>
                            {DAYS_OF_WEEK.map(({ key, label }) => (
                              <th
                                key={key}
                                className="border-r-2 border-slate-900 last:border-r-0 py-1.5 font-black text-slate-950 uppercase"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map(({ period }) => (
                            <tr
                              key={`cls_m_${period}`}
                              className="border-b border-slate-900 last:border-b-0 hover:bg-slate-50"
                            >
                              <td className="border-r-2 border-slate-900 font-black text-slate-950 bg-slate-100 py-2">
                                {period}
                              </td>
                              {DAYS_OF_WEEK.map(({ key: day }) => {
                                const val = getCellContentForClass(
                                  slots,
                                  subjectsMap,
                                  teachersMap,
                                  classes,
                                  day,
                                  period,
                                  cls.id,
                                  'MORNING'
                                );
                                const isCC = val === 'Chào cờ';
                                return (
                                  <td
                                    key={day}
                                    className={`border-r-2 border-slate-900 last:border-r-0 p-1.5 font-bold ${
                                      isCC
                                        ? 'bg-amber-100 text-amber-950 font-black'
                                        : val
                                        ? 'text-slate-950'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {val || '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Buổi Chiều */}
                    <div>
                      <div className="bg-slate-200 border-2 border-b-0 border-slate-900 px-3 py-1 text-xs font-black text-slate-900">
                        Buổi chiều
                      </div>
                      <table className="w-full border-collapse border-2 border-slate-900 text-center text-xs">
                        <thead>
                          <tr className="border-b-2 border-slate-900 bg-sky-300">
                            <th className="border-r-2 border-slate-900 py-1.5 w-14 font-black text-slate-950">
                              Tiết
                            </th>
                            {DAYS_OF_WEEK.map(({ key, label }) => (
                              <th
                                key={key}
                                className="border-r-2 border-slate-900 last:border-r-0 py-1.5 font-black text-slate-950 uppercase"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map(({ period }) => (
                            <tr
                              key={`cls_a_${period}`}
                              className="border-b border-slate-900 last:border-b-0 hover:bg-slate-50"
                            >
                              <td className="border-r-2 border-slate-900 font-black text-slate-950 bg-slate-100 py-2">
                                {period}
                              </td>
                              {DAYS_OF_WEEK.map(({ key: day }) => {
                                const val = getCellContentForClass(
                                  slots,
                                  subjectsMap,
                                  teachersMap,
                                  classes,
                                  day,
                                  period,
                                  cls.id,
                                  'AFTERNOON'
                                );
                                return (
                                  <td
                                    key={day}
                                    className={`border-r-2 border-slate-900 last:border-r-0 p-1.5 font-bold ${
                                      val ? 'text-slate-950' : 'text-slate-300'
                                    }`}
                                  >
                                    {val || '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CHẾ ĐỘ 3: XEM TKB TỪNG GIÁO VIÊN (SHEET 3) */}
        {/* ========================================================================= */}
        {viewMode === 'TEACHER' && (
          <div className="space-y-12">
            {displayTeachers.map((teacher, tIndex) => {
              return (
                <div
                  key={teacher.id}
                  className="space-y-3 pb-8 border-b-2 border-slate-300 last:border-b-0 print:border-b-0 print:pb-0 print:page-break-after-always"
                >
                  {/* Header Giáo viên chuẩn ảnh */}
                  <div className="border-b-2 border-slate-900 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="text-xs font-black text-slate-950 uppercase">
                        {schoolName}
                      </div>
                      <div className="text-right text-xs font-black text-slate-800 uppercase">
                        {semesterYear}
                      </div>
                    </div>

                    <div className="text-center my-1.5">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-wide">
                        THỜI KHÓA BIỂU GIÁO VIÊN
                      </h2>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mt-1">
                      <div>
                        Giáo viên: <strong>{teacher.name}</strong> ({teacher.subjects.join(', ')})
                      </div>
                      <div>
                        Có tác dụng từ ngày: <strong>{effectiveDate}</strong>
                      </div>
                    </div>
                  </div>

                  {/* BẢNG BUỔI SÁNG & BUỔI CHIỀU CỦA GIÁO VIÊN */}
                  <div className="space-y-4">
                    {/* Buổi Sáng */}
                    <div>
                      <div className="bg-slate-200 border-2 border-b-0 border-slate-900 px-3 py-1 text-xs font-black text-slate-900">
                        Buổi sáng
                      </div>
                      <table className="w-full border-collapse border-2 border-slate-900 text-center text-xs">
                        <thead>
                          <tr className="border-b-2 border-slate-900 bg-sky-300">
                            <th className="border-r-2 border-slate-900 py-1.5 w-14 font-black text-slate-950">
                              Tiết
                            </th>
                            {DAYS_OF_WEEK.map(({ key, label }) => (
                              <th
                                key={key}
                                className="border-r-2 border-slate-900 last:border-r-0 py-1.5 font-black text-slate-950 uppercase"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map(({ period }) => (
                            <tr
                              key={`t_m_${period}`}
                              className="border-b border-slate-900 last:border-b-0 hover:bg-slate-50"
                            >
                              <td className="border-r-2 border-slate-900 font-black text-slate-950 bg-slate-100 py-2">
                                {period}
                              </td>
                              {DAYS_OF_WEEK.map(({ key: day }) => {
                                const val = getCellContentForTeacher(
                                  slots,
                                  subjectsMap,
                                  classesMap,
                                  teacher.id,
                                  day,
                                  period,
                                  'MORNING'
                                );
                                return (
                                  <td
                                    key={day}
                                    className={`border-r-2 border-slate-900 last:border-r-0 p-1.5 font-bold ${
                                      val ? 'text-slate-950 font-black' : 'text-slate-300'
                                    }`}
                                  >
                                    {val || '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Buổi Chiều */}
                    <div>
                      <div className="bg-slate-200 border-2 border-b-0 border-slate-900 px-3 py-1 text-xs font-black text-slate-900">
                        Buổi chiều
                      </div>
                      <table className="w-full border-collapse border-2 border-slate-900 text-center text-xs">
                        <thead>
                          <tr className="border-b-2 border-slate-900 bg-sky-300">
                            <th className="border-r-2 border-slate-900 py-1.5 w-14 font-black text-slate-950">
                              Tiết
                            </th>
                            {DAYS_OF_WEEK.map(({ key, label }) => (
                              <th
                                key={key}
                                className="border-r-2 border-slate-900 last:border-r-0 py-1.5 font-black text-slate-950 uppercase"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map(({ period }) => (
                            <tr
                              key={`t_a_${period}`}
                              className="border-b border-slate-900 last:border-b-0 hover:bg-slate-50"
                            >
                              <td className="border-r-2 border-slate-900 font-black text-slate-950 bg-slate-100 py-2">
                                {period}
                              </td>
                              {DAYS_OF_WEEK.map(({ key: day }) => {
                                const val = getCellContentForTeacher(
                                  slots,
                                  subjectsMap,
                                  classesMap,
                                  teacher.id,
                                  day,
                                  period,
                                  'AFTERNOON'
                                );
                                return (
                                  <td
                                    key={day}
                                    className={`border-r-2 border-slate-900 last:border-r-0 p-1.5 font-bold ${
                                      val ? 'text-slate-950 font-black' : 'text-slate-300'
                                    }`}
                                  >
                                    {val || '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Chú thích cuối trang bản in */}
        <div className="flex items-center justify-between mt-6 pt-3 border-t border-slate-200 text-[10px] font-bold text-slate-600 print:text-[8px]">
          <div>
            * Bảng thời khóa biểu tự động xuất từ <strong>TKB Engine Pro</strong> • Đã kiểm duyệt phân công giảng dạy & tối ưu hóa xung đột.
          </div>
          <div>
            Ngày in: {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      </div>

      {/* CSS DÀNH RIÊNG CHO CHẾ ĐỘ IN ẤN (PRINT CSS) */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 6mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 9px !important;
          }
          aside, header, nav, .print\\:hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
          }
          table {
            border-collapse: collapse !important;
            border: 1.5px solid #000000 !important;
            page-break-inside: avoid;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 3px !important;
          }
          .bg-sky-300 {
            background-color: #7dd3fc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bg-slate-100 {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bg-slate-200 {
            background-color: #e2e8f0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bg-amber-100 {
            background-color: #fef3c7 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:page-break-after-always {
            page-break-after: always !important;
            break-after: page !important;
          }
          .print\\:page-break-before-always {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
      `}</style>
    </div>
  );
};
