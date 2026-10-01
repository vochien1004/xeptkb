/**
 * Component hiển thị Lưới Thời khóa biểu tương tác
 * Tối ưu hóa độ tương phản cao (High Contrast), dễ đọc, phân định rõ ràng
 * Hỗ trợ lọc theo Lớp, Giáo viên, hoặc Phòng học.
 * Đánh dấu trực quan Tiết ghép (Merged) và Co-teaching (Dạy đôi).
 */

import React, { useState, useEffect } from 'react';
import {
  TimetableSlot,
  SchoolClass,
  Teacher,
  Room,
  Subject,
  DayOfWeek,
  PeriodOfDay,
  DAYS_OF_WEEK,
  PERIODS,
} from '../types/timetable';
import { Users, BookOpen, MapPin, Sparkles, Filter, Info, Loader2 } from 'lucide-react';

interface Props {
  slots: TimetableSlot[];
  classes: SchoolClass[];
  teachers: Teacher[];
  rooms: Room[];
  subjects: Subject[];
  isCloudLoading?: boolean;
}

export const TimetableGrid: React.FC<Props> = ({
  slots,
  classes,
  teachers,
  rooms,
  subjects,
  isCloudLoading,
}) => {
  const [viewMode, setViewMode] = useState<'CLASS' | 'TEACHER' | 'ROOM'>('CLASS');
  const [shiftFilter, setShiftFilter] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');

  // Tự động load và chọn lớp học có TKB hoặc lớp đầu tiên khi danh sách classes được nạp
  useEffect(() => {
    if (classes.length > 0) {
      const isValid = classes.some((c) => c.id === selectedClassId);
      if (!selectedClassId || !isValid) {
        // Ưu tiên chọn lớp đã có tiết xếp trong TKB
        const classWithSlots = classes.find((c) =>
          slots.some((s) => s.classId === c.id || (s.classIds && s.classIds.includes(c.id)))
        );
        const targetClass = classWithSlots || classes[0];
        setSelectedClassId(targetClass.id);

        // Tự động chọn ca học phù hợp với lớp đã chọn
        if (targetClass.shift) {
          setShiftFilter(targetClass.shift);
        } else {
          const hasMorning = slots.some(
            (s) =>
              (s.classId === targetClass.id || (s.classIds && s.classIds.includes(targetClass.id))) &&
              (s.session === 'MORNING' || (!s.session && s.period <= 5))
          );
          const hasAfternoon = slots.some(
            (s) =>
              (s.classId === targetClass.id || (s.classIds && s.classIds.includes(targetClass.id))) &&
              (s.session === 'AFTERNOON' || (!s.session && s.period > 5))
          );
          if (hasMorning) {
            setShiftFilter('MORNING');
          } else if (hasAfternoon) {
            setShiftFilter('AFTERNOON');
          }
        }
      }
    }
  }, [classes, slots, selectedClassId]);

  // Tự động load và chọn giáo viên có tiết hoặc giáo viên đầu tiên
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

  // Tự động load và chọn phòng đầu tiên
  useEffect(() => {
    if (rooms.length > 0) {
      const isValid = rooms.some((r) => r.id === selectedRoomId);
      if (!selectedRoomId || !isValid) {
        setSelectedRoomId(rooms[0].id);
      }
    }
  }, [rooms, selectedRoomId]);

  // Hàm chọn lớp và tự động chuyển ca học tương ứng
  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find((c) => c.id === classId);
    if (cls?.shift) {
      setShiftFilter(cls.shift);
    } else {
      const hasMorning = slots.some(
        (s) =>
          (s.classId === classId || (s.classIds && s.classIds.includes(classId))) &&
          (s.session === 'MORNING' || (!s.session && s.period <= 5))
      );
      const hasAfternoon = slots.some(
        (s) =>
          (s.classId === classId || (s.classIds && s.classIds.includes(classId))) &&
          (s.session === 'AFTERNOON' || (!s.session && s.period > 5))
      );
      if (hasMorning) setShiftFilter('MORNING');
      else if (hasAfternoon) setShiftFilter('AFTERNOON');
    }
  };

  // Hàm chọn GV và tự động chuyển ca học có nhiều tiết
  const handleSelectTeacher = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    const morningCount = slots.filter(
      (s) =>
        (s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId))) &&
        (s.session === 'MORNING' || (!s.session && s.period <= 5))
    ).length;
    const afternoonCount = slots.filter(
      (s) =>
        (s.teacherId === teacherId || (s.teacherIds && s.teacherIds.includes(teacherId))) &&
        (s.session === 'AFTERNOON' || (!s.session && s.period > 5))
    ).length;
    if (morningCount > 0) setShiftFilter('MORNING');
    else if (afternoonCount > 0) setShiftFilter('AFTERNOON');
  };

  const classesMap = new Map(classes.map((c) => [c.id, c]));
  const teachersMap = new Map(teachers.map((t) => [t.id, t]));
  const roomsMap = new Map(rooms.map((r) => [r.id, r]));
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));

  const MORNING_PERIODS_GRID = [
    { period: 1 as PeriodOfDay, time: '07:15 - 08:00', name: 'Tiết 1' },
    { period: 2 as PeriodOfDay, time: '08:05 - 08:50', name: 'Tiết 2' },
    { period: 3 as PeriodOfDay, time: '09:00 - 09:45', name: 'Tiết 3' },
    { period: 4 as PeriodOfDay, time: '09:50 - 10:35', name: 'Tiết 4' },
    { period: 5 as PeriodOfDay, time: '10:40 - 11:25', name: 'Tiết 5' },
  ];

  const AFTERNOON_PERIODS_GRID = [
    { period: 1 as PeriodOfDay, time: '13:30 - 14:15', name: 'Tiết 1' },
    { period: 2 as PeriodOfDay, time: '14:20 - 15:05', name: 'Tiết 2' },
    { period: 3 as PeriodOfDay, time: '15:20 - 16:05', name: 'Tiết 3' },
    { period: 4 as PeriodOfDay, time: '16:10 - 16:55', name: 'Tiết 4' },
  ];

  const displayPeriods = shiftFilter === 'MORNING' ? MORNING_PERIODS_GRID : AFTERNOON_PERIODS_GRID;

  // Lọc các slot theo chế độ xem
  const filteredSlots = slots.filter((slot) => {
    if (viewMode === 'CLASS') {
      return (
        slot.classId === selectedClassId ||
        (slot.classIds && slot.classIds.includes(selectedClassId))
      );
    } else if (viewMode === 'TEACHER') {
      const isDirectTeacher =
        slot.teacherId === selectedTeacherId ||
        (slot.teacherIds && slot.teacherIds.includes(selectedTeacherId));
      if (isDirectTeacher) return true;

      // Nếu là tiết Sinh hoạt của lớp mà GV này làm chủ nhiệm:
      const sub = subjectsMap.get(slot.subjectId);
      const isShl =
        slot.subjectId === 'SUB_SHL' ||
        sub?.code === 'SHL' ||
        sub?.name.toLowerCase().includes('sinh hoạt');
      if (isShl) {
        const cls = classesMap.get(slot.classId);
        if (cls?.homeroomTeacherId === selectedTeacherId) return true;
      }
      return false;
    } else {
      return slot.roomId === selectedRoomId;
    }
  });

  // Tìm slot tại (day, period) theo ca học Sáng / Chiều
  const getSlotAt = (day: DayOfWeek, period: PeriodOfDay) => {
    // Mặc định tất cả giáo viên đều tham gia tiết Chào cờ vào tiết 1 sáng Thứ 2
    if (viewMode === 'TEACHER' && day === 2 && period === 1 && shiftFilter === 'MORNING') {
      const existing = filteredSlots.find((s) => {
        if (s.day !== 2) return false;
        const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
        const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
        return sSess === 'MORNING' && sPeriod === 1;
      });
      if (existing) return existing;

      return {
        id: `SLOT_CC_TEACHER_${selectedTeacherId}`,
        day: 2 as DayOfWeek,
        period: 1 as PeriodOfDay,
        session: 'MORNING' as const,
        classId: 'ALL',
        classIds: [],
        teacherId: selectedTeacherId,
        teacherIds: [selectedTeacherId],
        roomId: '',
        assignmentId: '',
        subjectId: 'SUB_CC',
        isMerged: false,
        isCoTeaching: false,
      };
    }

    return filteredSlots.find((s) => {
      if (s.day !== day) return false;
      const sSess = s.session || (s.period <= 5 ? 'MORNING' : 'AFTERNOON');
      const sPeriod = s.session ? s.period : (s.period <= 5 ? s.period : s.period - 5);
      return sSess === shiftFilter && sPeriod === period;
    });
  };

  // Lấy đối tượng đang chọn
  const activeTitle = () => {
    if (viewMode === 'CLASS') {
      return classesMap.get(selectedClassId)?.name || 'Chọn lớp';
    } else if (viewMode === 'TEACHER') {
      return teachersMap.get(selectedTeacherId)?.name || 'Chọn giáo viên';
    } else {
      return roomsMap.get(selectedRoomId)?.name || 'Chọn phòng';
    }
  };

  if (isCloudLoading && classes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <div className="text-sm font-bold text-slate-800">
          Đang tải dữ liệu Thời khóa biểu từ hệ thống...
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Vui lòng đợi giây lát để hệ thống nạp dữ liệu TKB
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
      {/* Thanh điều khiển lọc với độ tương phản cao */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider mr-1">
            <Filter className="w-4 h-4 text-indigo-700" />
            <span>Chế độ xem:</span>
          </div>

          <div className="inline-flex bg-slate-200/90 p-1 rounded-xl text-xs font-bold text-slate-700 border border-slate-300">
            <button
              onClick={() => setViewMode('CLASS')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'CLASS'
                  ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                  : 'hover:text-slate-950'
              }`}
            >
              Theo Lớp học
            </button>
            <button
              onClick={() => setViewMode('TEACHER')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'TEACHER'
                  ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                  : 'hover:text-slate-950'
              }`}
            >
              Theo Giáo viên
            </button>
            <button
              onClick={() => setViewMode('ROOM')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'ROOM'
                  ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                  : 'hover:text-slate-950'
              }`}
            >
              Theo Phòng / Sân
            </button>
          </div>

          {/* Chọn Buổi Sáng / Buổi Chiều */}
          <div className="inline-flex bg-slate-200/90 p-1 rounded-xl text-xs font-bold text-slate-700 border border-slate-300">
            <button
              onClick={() => setShiftFilter('MORNING')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                shiftFilter === 'MORNING'
                  ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                  : 'hover:text-slate-950'
              }`}
            >
              Buổi Sáng (5T)
            </button>
            <button
              onClick={() => setShiftFilter('AFTERNOON')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                shiftFilter === 'AFTERNOON'
                  ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                  : 'hover:text-slate-950'
              }`}
            >
              Buổi Chiều (4T)
            </button>
          </div>

          {/* Selector tương ứng với viền đậm nét và tương phản cao */}
          {viewMode === 'CLASS' && (
            <select
              value={selectedClassId}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="bg-white border-2 border-indigo-600 rounded-xl px-3.5 py-1.5 text-sm font-bold text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.studentCount} Học sinh)
                </option>
              ))}
            </select>
          )}

          {viewMode === 'TEACHER' && (
            <select
              value={selectedTeacherId}
              onChange={(e) => handleSelectTeacher(e.target.value)}
              className="bg-white border-2 border-indigo-600 rounded-xl px-3.5 py-1.5 text-sm font-bold text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          )}

          {viewMode === 'ROOM' && (
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="bg-white border-2 border-indigo-600 rounded-xl px-3.5 py-1.5 text-sm font-bold text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity} chỗ)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Chú thích màu sắc (Legend) rõ ràng, tương phản cao */}
        <div className="flex items-center gap-3 text-xs font-bold text-slate-800 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-amber-500 border border-amber-700 shadow-xs" />
            <span>Tiết Ghép</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-emerald-600 border border-emerald-800 shadow-xs" />
            <span>Co-Teaching</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 border border-indigo-800 shadow-xs" />
            <span>Sinh Hoạt (GVCN)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-blue-600 border border-blue-800 shadow-xs" />
            <span>Tiết Chuẩn</span>
          </div>
        </div>
      </div>

      {/* Lưới Thời khóa biểu: Viền rõ nét, chữ đậm, độ tương phản cao */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[800px]">
          <thead>
            <tr className="bg-slate-900 border-b-2 border-slate-900 text-white text-xs font-extrabold uppercase tracking-wider">
              <th className="py-3.5 px-4 w-32 text-center border-r border-slate-700 bg-slate-950">
                Tiết / Thời Gian
              </th>
              {DAYS_OF_WEEK.map(({ key, label }) => (
                <th key={key} className="py-3.5 px-3 border-r border-slate-700 last:border-r-0 text-center">
                  <div className="text-white text-sm font-black">{label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {displayPeriods.map(({ period, time, name }) => (
              <tr key={period} className="hover:bg-slate-100/50 transition-colors">
                {/* Cột thời gian bên trái */}
                <td className="py-3 px-3 bg-slate-100 border-r-2 border-slate-300 text-center">
                  <div className="text-xs font-black text-slate-950">{name}</div>
                  <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{time}</div>
                </td>

                {/* Các ngày trong tuần */}
                {DAYS_OF_WEEK.map(({ key: day }) => {
                  const slot = getSlotAt(day, period);
                  const subject = slot ? subjectsMap.get(slot.subjectId) : null;
                  const room = slot ? roomsMap.get(slot.roomId) : null;

                  const isShl =
                    slot &&
                    (slot.subjectId === 'SUB_SHL' ||
                      subject?.code === 'SHL' ||
                      subject?.name.toLowerCase().includes('sinh hoạt'));

                  const isCC =
                    slot &&
                    (slot.subjectId === 'SUB_CC' ||
                      subject?.code === 'CC' ||
                      subject?.name.toLowerCase().includes('chào cờ'));

                  const isOff = slot?.subjectId === 'SUB_OFF';

                  // Lấy tên GV
                  let teacherNames = slot
                    ? (slot.teacherIds && slot.teacherIds.length > 0
                        ? slot.teacherIds
                        : [slot.teacherId]
                      )
                        .filter(Boolean)
                        .map((tid) => {
                          const t = teachersMap.get(tid);
                          return t?.shortName || t?.name.replace('Thầy ', 'T.').replace('Cô ', 'C.') || tid;
                        })
                        .filter(Boolean)
                        .join(' + ')
                    : '';

                  if (isShl && (!teacherNames || teacherNames.trim() === '')) {
                    const clsObj = classesMap.get(slot.classId);
                    if (clsObj?.homeroomTeacherId) {
                      const t = teachersMap.get(clsObj.homeroomTeacherId);
                      if (t) {
                        teacherNames = t.shortName || t.name.replace('Thầy ', 'T.').replace('Cô ', 'C.');
                      }
                    }
                  }

                  // Lấy tên các lớp
                  const classNames = slot
                    ? slot.classId === 'ALL'
                      ? 'Toàn trường'
                      : (slot.classIds && slot.classIds.length > 0 ? slot.classIds : [slot.classId])
                          .map((cid) => classesMap.get(cid)?.name || cid)
                          .join(' & ')
                    : '';

                  return (
                    <td
                      key={day}
                      className="p-1.5 border-r border-slate-300 last:border-r-0 align-top h-28 min-w-[130px]"
                    >
                      {slot ? (
                        <div
                          className={`h-full rounded-xl p-2.5 flex flex-col justify-between transition-all shadow-xs hover:shadow-md ${
                            isOff
                              ? 'bg-slate-200 border-2 border-slate-400 text-slate-700'
                              : isCC
                              ? 'bg-amber-50/95 border-2 border-amber-500 text-amber-950 ring-1 ring-amber-300'
                              : isShl
                              ? 'bg-indigo-50/95 border-2 border-indigo-600 text-indigo-950 ring-1 ring-indigo-300'
                              : slot.isCoTeaching
                              ? 'bg-emerald-50/90 border-2 border-emerald-600 text-emerald-950'
                              : slot.isMerged
                              ? 'bg-amber-50/90 border-2 border-amber-500 text-amber-950'
                              : 'bg-white border-2 border-blue-500 text-slate-950'
                          }`}
                        >
                          <div>
                            {/* Tiêu đề môn học & Badge đặc thù */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-black text-xs text-slate-950 truncate flex items-center gap-1">
                                {isCC && <span className="text-[11px] text-rose-600">🚩</span>}
                                {isShl && <span className="text-[11px] text-amber-600">👑</span>}
                                <span>
                                  {isOff
                                    ? 'Nghỉ'
                                    : isCC
                                    ? 'Chào cờ'
                                    : isShl
                                    ? 'Sinh hoạt'
                                    : subject?.name || slot.subjectId}
                                </span>
                              </span>
                              {isCC && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-600 text-white tracking-wide uppercase shrink-0">
                                  Toàn trường
                                </span>
                              )}
                              {isShl && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-indigo-700 text-white tracking-wide uppercase shrink-0">
                                  GVCN
                                </span>
                              )}
                              {!isCC && !isShl && slot.isCoTeaching && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-700 text-white tracking-wide uppercase shrink-0">
                                  <Sparkles className="w-2.5 h-2.5" /> Co-Teach
                                </span>
                              )}
                              {!isShl && !slot.isCoTeaching && slot.isMerged && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-600 text-white tracking-wide uppercase shrink-0">
                                  Ghép Lớp
                                </span>
                              )}
                            </div>

                            {/* Thông tin phụ thuộc ViewMode với độ tương phản sắc nét */}
                            {viewMode === 'CLASS' && (
                              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                <span className="truncate" title={teacherNames || 'GVCN'}>
                                  {teacherNames || (isShl ? 'GVCN' : 'Chưa gán GV')}
                                </span>
                              </div>
                            )}

                            {viewMode === 'TEACHER' && (
                              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                <span className="truncate text-indigo-950 font-black">
                                  {classNames} {isShl ? '(SHL)' : ''}
                                </span>
                              </div>
                            )}

                            {viewMode === 'ROOM' && (
                              <div className="text-[11px] font-bold text-slate-800 flex flex-col gap-0.5">
                                <span className="truncate text-indigo-950 font-black">
                                  {classNames} {isShl ? '(SHL)' : ''}
                                </span>
                                <span className="text-[10px] text-slate-700 truncate font-semibold">
                                  {teacherNames}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Footer của slot: Phòng học & Sĩ số */}
                          <div className="pt-1.5 mt-1 border-t border-slate-300/80 flex items-center justify-between text-[11px] font-bold text-slate-700">
                            <span className="flex items-center gap-1 truncate" title={room?.name}>
                              <MapPin className="w-3 h-3 text-slate-600 shrink-0" />
                              <span className="truncate text-slate-800">{room?.name.split(' (')[0] || slot.roomId}</span>
                            </span>
                            {slot.isMerged && (
                              <span className="text-[10px] font-extrabold text-amber-900 bg-amber-200/80 px-1 py-0.2 rounded">
                                {classNames}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-center group hover:bg-slate-100 hover:border-slate-400 transition-all">
                          <span className="text-[11px] text-slate-400 font-bold group-hover:text-slate-600">
                            Trống
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer ghi chú với màu sắc rõ nét */}
      <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-600" />
          <span>
            Đang hiển thị:{' '}
            <strong className="text-slate-950 font-extrabold">{activeTitle()}</strong> • Số tiết bố trí:{' '}
            <strong className="text-indigo-700 font-black">{filteredSlots.length} tiết</strong>
          </span>
        </div>
        <div className="text-xs text-slate-600 font-medium">
          * Tiết ghép và Co-teaching được đồng bộ nguyên tử tự động (Zero Conflict).
        </div>
      </div>
    </div>
  );
};
