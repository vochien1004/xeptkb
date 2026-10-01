/**
 * Utility xuất Thời khóa biểu ra file Excel (.xlsx) chuẩn 3 Sheet
 * Theo định dạng chuẩn trường học Việt Nam:
 * - Sheet 1: TKB Toàn trường (chứa cả Buổi Sáng và Buổi Chiều)
 * - Sheet 2: TKB Từng Lớp (hiển thị lần lượt từ lớp đầu tiên đến lớp cuối cùng)
 * - Sheet 3: TKB Từng Giáo Viên (hiển thị lần lượt từ giáo viên đầu tiên đến giáo viên cuối cùng)
 */

import ExcelJS from 'exceljs';
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

export interface ExportConfig {
  schoolName: string;
  semesterYear: string;
  weekInfo: string;
  effectiveDate: string;
}

// Bảng màu & Style chuẩn cho Excel
const CYAN_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF7DD3FC' }, // Cyan / Sky blue (#7dd3fc)
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' }, // Slate 200
};

const BORDER_COLOR = { argb: 'FF000000' };
const BORDER_THIN: ExcelJS.Border = { style: 'thin', color: BORDER_COLOR };
const BORDER_MEDIUM: ExcelJS.Border = { style: 'medium', color: BORDER_COLOR };

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: BORDER_THIN,
  left: BORDER_THIN,
  bottom: BORDER_THIN,
  right: BORDER_THIN,
};

const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};

/**
 * Lấy nội dung hiển thị cho 1 ô (Thứ, Tiết, Lớp) từ TKB thực tế
 */
export const getCellContentForClass = (
  slots: TimetableSlot[],
  subjectsMap: Map<string, Subject>,
  teachersMap: Map<string, string>,
  classes: SchoolClass[],
  day: DayOfWeek,
  period: PeriodOfDay,
  classId: string,
  session: 'MORNING' | 'AFTERNOON'
): string => {
  const matchedSlot = slots.find((s) => {
    if (s.day !== day) return false;
    const matchClass = s.classId === classId || (s.classIds && s.classIds.includes(classId));
    if (!matchClass) return false;
    const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
    const sPeriod = s.session ? s.period : s.period <= 5 ? s.period : s.period - 5;
    return sSess === session && sPeriod === period;
  });

  if (!matchedSlot) {
    return '';
  }

  if (matchedSlot.subjectId === 'SUB_OFF') {
    return 'Nghỉ';
  }

  const subObj = subjectsMap.get(matchedSlot.subjectId);
  const isCC =
    matchedSlot.subjectId === 'SUB_CC' ||
    subObj?.code === 'CC' ||
    subObj?.name.toLowerCase().includes('chào cờ');

  if (isCC) return 'Chào cờ';

  const isShl =
    matchedSlot.subjectId === 'SUB_SHL' ||
    subObj?.code === 'SHL' ||
    subObj?.name.toLowerCase().includes('sinh hoạt');

  const subjectName = isShl
    ? 'Sinh hoạt'
    : subObj?.shortName || subObj?.name || matchedSlot.subjectId;

  let teacherNames = (
    matchedSlot.teacherIds && matchedSlot.teacherIds.length > 0
      ? matchedSlot.teacherIds
      : [matchedSlot.teacherId]
  )
    .filter(Boolean)
    .map((tid) => {
      const t = teachersMap.get(tid);
      if (!t) return tid;
      const parts = t.replace('Thầy ', '').replace('Cô ', '').trim().split(' ');
      return parts[parts.length - 1];
    })
    .filter(Boolean)
    .join(' + ');

  if (isShl && (!teacherNames || teacherNames.trim() === '')) {
    const clsObj = classes.find(
      (c) => c.id === classId || c.name.replace('Lớp ', '') === classId || c.name === classId
    );
    if (clsObj?.homeroomTeacherId) {
      const t = teachersMap.get(clsObj.homeroomTeacherId);
      if (t) {
        const parts = t.replace('Thầy ', '').replace('Cô ', '').trim().split(' ');
        teacherNames = parts[parts.length - 1];
      }
    }
  }

  return teacherNames ? `${subjectName} - ${teacherNames}` : subjectName;
};

/**
 * Lấy nội dung hiển thị cho 1 ô (Thứ, Tiết, Giáo Viên)
 * Định dạng: "[Lớp] - [Môn]" (ví dụ: "11A - GDĐP")
 */
export const getCellContentForTeacher = (
  slots: TimetableSlot[],
  subjectsMap: Map<string, Subject>,
  classesMap: Map<string, SchoolClass>,
  teacherId: string,
  day: DayOfWeek,
  period: PeriodOfDay,
  session: 'MORNING' | 'AFTERNOON'
): string => {
  // Mặc định tất cả giáo viên đều tham gia tiết Chào cờ vào tiết 1 sáng Thứ 2
  if (day === 2 && period === 1 && session === 'MORNING') {
    return 'Chào cờ';
  }

  const matchedSlot = slots.find((s) => {
    if (s.day !== day) return false;
    const isTeacher =
      s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId));
    if (!isTeacher) return false;
    const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
    const sPeriod = s.session ? s.period : s.period <= 5 ? s.period : s.period - 5;
    return sSess === session && sPeriod === period;
  });

  if (!matchedSlot) return '';
  if (matchedSlot.subjectId === 'SUB_OFF') return '';

  const subObj = subjectsMap.get(matchedSlot.subjectId);
  const isCC =
    matchedSlot.subjectId === 'SUB_CC' ||
    subObj?.code === 'CC' ||
    subObj?.name.toLowerCase().includes('chào cờ');
  const isShl =
    matchedSlot.subjectId === 'SUB_SHL' ||
    subObj?.code === 'SHL' ||
    subObj?.name.toLowerCase().includes('sinh hoạt');

  const subjectName = isCC
    ? 'Chào cờ'
    : isShl
    ? 'Sinh hoạt'
    : subObj?.shortName || subObj?.name || matchedSlot.subjectId;

  // Lấy tên lớp
  let className = '';
  if (matchedSlot.classIds && matchedSlot.classIds.length > 0) {
    className = matchedSlot.classIds
      .map((cid) => {
        const c = classesMap.get(cid);
        return c ? c.name.replace('Lớp ', '') : cid;
      })
      .join(', ');
  } else if (matchedSlot.classId) {
    const c = classesMap.get(matchedSlot.classId);
    className = c ? c.name.replace('Lớp ', '') : matchedSlot.classId;
  }

  return className ? `${className} - ${subjectName}` : subjectName;
};

/**
 * Xuất file Excel (.xlsx) gồm đủ 3 sheet
 */
export async function exportThreeSheetTimetableExcel(
  slots: TimetableSlot[],
  classes: SchoolClass[],
  teachers: Teacher[],
  subjects: Subject[],
  config: ExportConfig
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TKB Engine Pro';
  workbook.created = new Date();

  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const teachersMap = new Map(teachers.map((t) => [t.id, t.name]));
  const classesMap = new Map(classes.map((c) => [c.id, c]));

  const targetClasses = classes.map((c) => ({
    id: c.id,
    name: c.name.replace('Lớp ', ''),
  }));

  // =========================================================================
  // SHEET 1: TKB TOÀN TRƯỜNG (CHỨA CẢ BUỔI SÁNG VÀ BUỔI CHIỀU)
  // =========================================================================
  const sheet1 = workbook.addWorksheet('TKB Toàn Trường', {
    views: [{ showGridLines: true }],
  });

  let currentRow = 1;

  // Hàm hỗ trợ vẽ 1 bảng toàn trường (Sáng hoặc Chiều)
  const renderSchoolShiftTable = (shift: 'MORNING' | 'AFTERNOON') => {
    const shiftLabel = shift === 'MORNING' ? 'BUỔI SÁNG' : 'BUỔI CHIỀU';
    const totalCols = targetClasses.length + 2;

    // Số cột phân bổ cho thông tin trường & học kỳ (bên trái)
    // Đảm bảo ô đủ rộng (tối thiểu 40-55) để tên trường và học kỳ hiển thị đầy đủ, không bị khuất chữ
    const splitCol =
      totalCols >= 8
        ? Math.min(4, Math.floor(totalCols / 2))
        : totalCols >= 6
        ? 3
        : Math.max(2, Math.floor(totalCols / 2));

    // Header 1: Tên trường (trái) và Tiêu đề (giữa)
    const row1 = sheet1.getRow(currentRow);
    row1.height = config.schoolName.length > 35 ? 32 : 26;

    sheet1.mergeCells(currentRow, 1, currentRow, splitCol);
    const cellSchool = sheet1.getCell(currentRow, 1);
    cellSchool.value = config.schoolName.toUpperCase();
    cellSchool.font = { name: 'Calibri', bold: true, size: 11 };
    cellSchool.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    sheet1.mergeCells(currentRow, splitCol + 1, currentRow, totalCols);
    const cellTitle = sheet1.getCell(currentRow, splitCol + 1);
    cellTitle.value = `THỜI KHOÁ BIỂU ${shiftLabel}`;
    cellTitle.font = { name: 'Calibri', bold: true, size: 14 };
    cellTitle.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    currentRow++;

    // Header 2: Học kỳ (trái) và Tuần áp dụng (giữa)
    const row2 = sheet1.getRow(currentRow);
    row2.height = 22;

    sheet1.mergeCells(currentRow, 1, currentRow, splitCol);
    const cellSem = sheet1.getCell(currentRow, 1);
    cellSem.value = config.semesterYear.toUpperCase();
    cellSem.font = { name: 'Calibri', bold: true, size: 10 };
    cellSem.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    sheet1.mergeCells(currentRow, splitCol + 1, currentRow, totalCols);
    const cellWeek = sheet1.getCell(currentRow, splitCol + 1);
    cellWeek.value = `${config.weekInfo.toUpperCase()} • CÓ TÁC DỤNG TỪ NGÀY: ${config.effectiveDate}`;
    cellWeek.font = { name: 'Calibri', bold: true, size: 10 };
    cellWeek.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    currentRow++;

    currentRow++; // 1 dòng trống

    // Bảng: Dòng Header cột Lớp
    const headerRowIdx = currentRow;
    const headerRow = sheet1.getRow(headerRowIdx);
    headerRow.height = 25;

    // Ô Lớp / Tiết gộp 2 cột đầu
    sheet1.mergeCells(headerRowIdx, 1, headerRowIdx, 2);
    const cornerCell = sheet1.getCell(headerRowIdx, 1);
    cornerCell.value = 'Lớp / Tiết';
    cornerCell.fill = CYAN_FILL;
    cornerCell.font = { name: 'Calibri', bold: true, size: 11 };
    cornerCell.alignment = CENTER_ALIGN;
    cornerCell.border = {
      top: BORDER_MEDIUM,
      left: BORDER_MEDIUM,
      bottom: BORDER_MEDIUM,
      right: BORDER_MEDIUM,
    };
    sheet1.getCell(headerRowIdx, 2).border = {
      top: BORDER_MEDIUM,
      left: BORDER_MEDIUM,
      bottom: BORDER_MEDIUM,
      right: BORDER_MEDIUM,
    };

    targetClasses.forEach((cls, idx) => {
      const isLastCol = idx === targetClasses.length - 1;
      const cell = sheet1.getCell(headerRowIdx, idx + 3);
      cell.value = cls.name;
      cell.fill = CYAN_FILL;
      cell.font = { name: 'Calibri', bold: true, size: 11 };
      cell.alignment = CENTER_ALIGN;
      cell.border = {
        top: BORDER_MEDIUM,
        left: BORDER_THIN,
        bottom: BORDER_MEDIUM,
        right: isLastCol ? BORDER_MEDIUM : BORDER_THIN,
      };
    });

    currentRow++;

    // Dữ liệu từng ngày (Thứ 2 -> Thứ 7)
    DAYS_OF_WEEK.forEach(({ key: day, label }) => {
      const dayStartRow = currentRow;

      PERIODS.forEach(({ period }, periodIdx) => {
        const isFirstPeriod = periodIdx === 0;
        const isLastPeriod = periodIdx === PERIODS.length - 1;

        const row = sheet1.getRow(currentRow);
        row.height = 20;

        // Cột Tiết
        const periodCell = sheet1.getCell(currentRow, 2);
        periodCell.value = period;
        periodCell.font = { name: 'Calibri', bold: true, size: 11 };
        periodCell.alignment = CENTER_ALIGN;
        periodCell.border = {
          top: isFirstPeriod ? BORDER_MEDIUM : BORDER_THIN,
          left: BORDER_MEDIUM,
          right: BORDER_MEDIUM,
          bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN, // Tô đậm đường viền ngăn cách thứ
        };

        // Dữ liệu từng lớp
        targetClasses.forEach((cls, colIdx) => {
          const isLastCol = colIdx === targetClasses.length - 1;
          const dataCell = sheet1.getCell(currentRow, colIdx + 3);
          const val = getCellContentForClass(
            slots,
            subjectsMap,
            teachersMap,
            classes,
            day,
            period,
            cls.id,
            shift
          );
          dataCell.value = val;
          dataCell.font = { name: 'Calibri', size: 10, bold: val === 'Chào cờ' };
          dataCell.alignment = CENTER_ALIGN;
          dataCell.border = {
            top: isFirstPeriod ? BORDER_MEDIUM : BORDER_THIN,
            left: BORDER_THIN,
            right: isLastCol ? BORDER_MEDIUM : BORDER_THIN,
            bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN, // Tô đậm đường viền ngăn cách thứ
          };
        });

        currentRow++;
      });

      // Gộp cột Thứ (rowSpan = 5)
      sheet1.mergeCells(dayStartRow, 1, currentRow - 1, 1);
      const dayCell = sheet1.getCell(dayStartRow, 1);
      dayCell.value = label;
      dayCell.fill = CYAN_FILL;
      dayCell.font = { name: 'Calibri', bold: true, size: 11 };
      dayCell.alignment = CENTER_ALIGN;

      for (let r = dayStartRow; r < currentRow; r++) {
        const isTop = r === dayStartRow;
        const isBottom = r === currentRow - 1;
        sheet1.getCell(r, 1).border = {
          top: isTop ? BORDER_MEDIUM : BORDER_THIN,
          left: BORDER_MEDIUM,
          right: BORDER_MEDIUM,
          bottom: isBottom ? BORDER_MEDIUM : BORDER_THIN, // Tô đậm ngăn cách thứ
        };
      }
    });

    currentRow += 3; // Khoảng cách giữa 2 bảng
  };

  // Vẽ Buổi Sáng
  renderSchoolShiftTable('MORNING');
  // Vẽ Buổi Chiều
  renderSchoolShiftTable('AFTERNOON');

  // Đặt độ rộng cột cho Sheet 1
  sheet1.getColumn(1).width = 14;
  sheet1.getColumn(2).width = 8;
  for (let c = 3; c <= targetClasses.length + 2; c++) {
    sheet1.getColumn(c).width = 17;
  }

  // =========================================================================
  // SHEET 2: TKB TỪNG LỚP (HIỂN THỊ LẦN LƯỢT TỪ LỚP ĐẦU TIÊN ĐẾN CUỐI CÙNG)
  // =========================================================================
  const sheet2 = workbook.addWorksheet('TKB Từng Lớp', {
    views: [{ showGridLines: true }],
  });

  let classRow = 1;
  const dayColNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  classes.forEach((cls) => {
    const homeroomTeacher = cls.homeroomTeacherId
      ? teachersMap.get(cls.homeroomTeacherId) || ''
      : '';

    // Khối Header lớp
    const r1 = sheet2.getRow(classRow);
    r1.height = config.schoolName.length > 35 ? 26 : 20;
    sheet2.mergeCells(classRow, 1, classRow, 7);
    const cHead1 = sheet2.getCell(classRow, 1);
    cHead1.value = config.schoolName.toUpperCase();
    cHead1.font = { name: 'Calibri', bold: true, size: 11 };
    cHead1.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    classRow++;

    const r2 = sheet2.getRow(classRow);
    r2.height = 20;
    sheet2.mergeCells(classRow, 1, classRow, 7);
    const cHead2 = sheet2.getCell(classRow, 1);
    cHead2.value = config.semesterYear.toUpperCase();
    cHead2.font = { name: 'Calibri', bold: true, size: 10 };
    cHead2.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    classRow++;

    const r3 = sheet2.getRow(classRow);
    r3.height = 28;
    sheet2.mergeCells(classRow, 1, classRow, 7);
    const cHead3 = sheet2.getCell(classRow, 1);
    cHead3.value = `THỜI KHÓA BIỂU LỚP: ${cls.name.toUpperCase()}`;
    cHead3.font = { name: 'Calibri', bold: true, size: 14 };
    cHead3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    classRow++;

    const r4 = sheet2.getRow(classRow);
    r4.height = 20;
    sheet2.mergeCells(classRow, 1, classRow, 4);
    const cHead4Left = sheet2.getCell(classRow, 1);
    cHead4Left.value = homeroomTeacher ? `GVCN: ${homeroomTeacher}` : `Lớp: ${cls.name}`;
    cHead4Left.font = { name: 'Calibri', bold: true, size: 10 };
    cHead4Left.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    sheet2.mergeCells(classRow, 5, classRow, 7);
    const cHead4Right = sheet2.getCell(classRow, 5);
    cHead4Right.value = `Có tác dụng từ ngày: ${config.effectiveDate}`;
    cHead4Right.font = { name: 'Calibri', bold: true, size: 10 };
    cHead4Right.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    classRow++;

    // Vẽ 2 buổi: Buổi sáng & Buổi chiều
    (['MORNING', 'AFTERNOON'] as const).forEach((sess) => {
      const sessLabel = sess === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều';

      // Tiêu đề buổi
      sheet2.mergeCells(classRow, 1, classRow, 7);
      const sessCell = sheet2.getCell(classRow, 1);
      sessCell.value = sessLabel;
      sessCell.font = { name: 'Calibri', bold: true, size: 11 };
      sessCell.fill = SUBHEADER_FILL;
      sessCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      for (let col = 1; col <= 7; col++) {
        sheet2.getCell(classRow, col).border = {
          top: BORDER_MEDIUM,
          bottom: BORDER_MEDIUM,
          left: col === 1 ? BORDER_MEDIUM : BORDER_THIN,
          right: col === 7 ? BORDER_MEDIUM : BORDER_THIN,
        };
      }
      classRow++;

      // Dòng header cyan: Tiết | Thứ Hai | ... | Thứ Bảy
      const hRow = sheet2.getRow(classRow);
      hRow.height = 22;
      const tCell = sheet2.getCell(classRow, 1);
      tCell.value = 'Tiết';
      tCell.fill = CYAN_FILL;
      tCell.font = { name: 'Calibri', bold: true, size: 11 };
      tCell.alignment = CENTER_ALIGN;
      tCell.border = {
        top: BORDER_MEDIUM,
        left: BORDER_MEDIUM,
        bottom: BORDER_MEDIUM,
        right: BORDER_MEDIUM,
      };

      dayColNames.forEach((dName, dIdx) => {
        const cell = sheet2.getCell(classRow, dIdx + 2);
        cell.value = dName;
        cell.fill = CYAN_FILL;
        cell.font = { name: 'Calibri', bold: true, size: 11 };
        cell.alignment = CENTER_ALIGN;
        cell.border = {
          top: BORDER_MEDIUM,
          left: BORDER_MEDIUM,
          bottom: BORDER_MEDIUM,
          right: BORDER_MEDIUM,
        };
      });
      classRow++;

      // 5 Tiết
      PERIODS.forEach(({ period }, periodIdx) => {
        const isLastPeriod = periodIdx === PERIODS.length - 1;
        const row = sheet2.getRow(classRow);
        row.height = 20;

        const pCell = sheet2.getCell(classRow, 1);
        pCell.value = period;
        pCell.font = { name: 'Calibri', bold: true, size: 11 };
        pCell.alignment = CENTER_ALIGN;
        pCell.border = {
          top: BORDER_THIN,
          left: BORDER_MEDIUM,
          bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN,
          right: BORDER_MEDIUM,
        };

        DAYS_OF_WEEK.forEach(({ key: day }, dIdx) => {
          const dCell = sheet2.getCell(classRow, dIdx + 2);
          const val = getCellContentForClass(
            slots,
            subjectsMap,
            teachersMap,
            classes,
            day,
            period,
            cls.id,
            sess
          );
          dCell.value = val;
          dCell.font = { name: 'Calibri', size: 10, bold: val === 'Chào cờ' };
          dCell.alignment = CENTER_ALIGN;
          dCell.border = {
            top: BORDER_THIN,
            left: BORDER_MEDIUM,
            right: BORDER_MEDIUM,
            bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN,
          };
        });

        classRow++;
      });
    });

    // Cách 2 hàng trống giữa các lớp
    classRow += 2;
  });

  // Đặt độ rộng cột cho Sheet 2
  sheet2.getColumn(1).width = 8;
  for (let c = 2; c <= 7; c++) {
    sheet2.getColumn(c).width = 18;
  }

  // =========================================================================
  // SHEET 3: TKB TỪNG GIÁO VIÊN (HIỂN THỊ LẦN LƯỢT TỪ GV ĐẦU TIÊN ĐẾN CUỐI CÙNG)
  // =========================================================================
  const sheet3 = workbook.addWorksheet('TKB Từng Giáo Viên', {
    views: [{ showGridLines: true }],
  });

  let teacherRow = 1;

  teachers.forEach((teacher) => {
    // Khối Header giáo viên
    const tr1 = sheet3.getRow(teacherRow);
    tr1.height = config.schoolName.length > 35 ? 26 : 20;
    sheet3.mergeCells(teacherRow, 1, teacherRow, 7);
    const tHead1 = sheet3.getCell(teacherRow, 1);
    tHead1.value = config.schoolName.toUpperCase();
    tHead1.font = { name: 'Calibri', bold: true, size: 11 };
    tHead1.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    teacherRow++;

    const tr2 = sheet3.getRow(teacherRow);
    tr2.height = 20;
    sheet3.mergeCells(teacherRow, 1, teacherRow, 7);
    const tHead2 = sheet3.getCell(teacherRow, 1);
    tHead2.value = config.semesterYear.toUpperCase();
    tHead2.font = { name: 'Calibri', bold: true, size: 10 };
    tHead2.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    teacherRow++;

    const tr3 = sheet3.getRow(teacherRow);
    tr3.height = 28;
    sheet3.mergeCells(teacherRow, 1, teacherRow, 7);
    const tHead3 = sheet3.getCell(teacherRow, 1);
    tHead3.value = `THỜI KHÓA BIỂU GIÁO VIÊN`;
    tHead3.font = { name: 'Calibri', bold: true, size: 14 };
    tHead3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    teacherRow++;

    const tr4 = sheet3.getRow(teacherRow);
    tr4.height = 20;
    sheet3.mergeCells(teacherRow, 1, teacherRow, 4);
    const tHead4Left = sheet3.getCell(teacherRow, 1);
    tHead4Left.value = `Giáo viên: ${teacher.name}`;
    tHead4Left.font = { name: 'Calibri', bold: true, size: 11 };
    tHead4Left.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    sheet3.mergeCells(teacherRow, 5, teacherRow, 7);
    const tHead4Right = sheet3.getCell(teacherRow, 5);
    tHead4Right.value = `Có tác dụng từ ngày: ${config.effectiveDate}`;
    tHead4Right.font = { name: 'Calibri', bold: true, size: 10 };
    tHead4Right.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    teacherRow++;

    // Vẽ 2 buổi: Buổi sáng & Buổi chiều
    (['MORNING', 'AFTERNOON'] as const).forEach((sess) => {
      const sessLabel = sess === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều';

      // Tiêu đề buổi
      sheet3.mergeCells(teacherRow, 1, teacherRow, 7);
      const sessCell = sheet3.getCell(teacherRow, 1);
      sessCell.value = sessLabel;
      sessCell.font = { name: 'Calibri', bold: true, size: 11 };
      sessCell.fill = SUBHEADER_FILL;
      sessCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      for (let col = 1; col <= 7; col++) {
        sheet3.getCell(teacherRow, col).border = {
          top: BORDER_MEDIUM,
          bottom: BORDER_MEDIUM,
          left: col === 1 ? BORDER_MEDIUM : BORDER_THIN,
          right: col === 7 ? BORDER_MEDIUM : BORDER_THIN,
        };
      }
      teacherRow++;

      // Dòng header cyan: Tiết | Thứ Hai | ... | Thứ Bảy
      const hRow = sheet3.getRow(teacherRow);
      hRow.height = 22;
      const tCell = sheet3.getCell(teacherRow, 1);
      tCell.value = 'Tiết';
      tCell.fill = CYAN_FILL;
      tCell.font = { name: 'Calibri', bold: true, size: 11 };
      tCell.alignment = CENTER_ALIGN;
      tCell.border = {
        top: BORDER_MEDIUM,
        left: BORDER_MEDIUM,
        bottom: BORDER_MEDIUM,
        right: BORDER_MEDIUM,
      };

      dayColNames.forEach((dName, dIdx) => {
        const cell = sheet3.getCell(teacherRow, dIdx + 2);
        cell.value = dName;
        cell.fill = CYAN_FILL;
        cell.font = { name: 'Calibri', bold: true, size: 11 };
        cell.alignment = CENTER_ALIGN;
        cell.border = {
          top: BORDER_MEDIUM,
          left: BORDER_MEDIUM,
          bottom: BORDER_MEDIUM,
          right: BORDER_MEDIUM,
        };
      });
      teacherRow++;

      // 5 Tiết
      PERIODS.forEach(({ period }, periodIdx) => {
        const isLastPeriod = periodIdx === PERIODS.length - 1;
        const row = sheet3.getRow(teacherRow);
        row.height = 20;

        const pCell = sheet3.getCell(teacherRow, 1);
        pCell.value = period;
        pCell.font = { name: 'Calibri', bold: true, size: 11 };
        pCell.alignment = CENTER_ALIGN;
        pCell.border = {
          top: BORDER_THIN,
          left: BORDER_MEDIUM,
          bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN,
          right: BORDER_MEDIUM,
        };

        DAYS_OF_WEEK.forEach(({ key: day }, dIdx) => {
          const dCell = sheet3.getCell(teacherRow, dIdx + 2);
          const val = getCellContentForTeacher(
            slots,
            subjectsMap,
            classesMap,
            teacher.id,
            day,
            period,
            sess
          );
          dCell.value = val;
          dCell.font = { name: 'Calibri', size: 10, bold: !!val };
          dCell.alignment = CENTER_ALIGN;
          dCell.border = {
            top: BORDER_THIN,
            left: BORDER_MEDIUM,
            right: BORDER_MEDIUM,
            bottom: isLastPeriod ? BORDER_MEDIUM : BORDER_THIN,
          };
        });

        teacherRow++;
      });
    });

    // Cách 2 hàng trống giữa các giáo viên
    teacherRow += 2;
  });

  // Đặt độ rộng cột cho Sheet 3
  sheet3.getColumn(1).width = 8;
  for (let c = 2; c <= 7; c++) {
    sheet3.getColumn(c).width = 18;
  }

  // Tải file về máy tính
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileNameDate = new Date().toISOString().slice(0, 10);
  a.download = `TKB_Toan_Truong_3_Sheet_${fileNameDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
