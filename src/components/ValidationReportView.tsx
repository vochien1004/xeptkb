/**
 * Component Báo cáo Kiểm tra Xung đột & Thừa/Thiếu Tiết (Validation Engine Report)
 * Tối ưu hóa màu sắc tương phản cao (High Contrast), font chữ đậm nét, dễ quan sát.
 */

import React from 'react';
import {
  ConflictRecord,
  VolumeDiscrepancy,
  FitnessMetrics,
} from '../types/timetable';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  BookOpen,
  Award,
  Zap,
} from 'lucide-react';

interface Props {
  conflicts: ConflictRecord[];
  discrepancies: VolumeDiscrepancy[];
  fitness: FitnessMetrics;
}

export const ValidationReportView: React.FC<Props> = ({
  conflicts,
  discrepancies,
  fitness,
}) => {
  const hasHardConflicts = conflicts.length > 0;
  const deficitCount = discrepancies.filter((d) => d.status === 'DEFICIT').length;
  const surplusCount = discrepancies.filter((d) => d.status === 'SURPLUS').length;
  const exactCount = discrepancies.filter((d) => d.status === 'EXACT').length;

  return (
    <div className="space-y-6">
      {/* 3 Thẻ Tổng quan (Overview Metric Cards) với độ tương phản cao */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Xung đột Ràng buộc Cứng (Hard Constraints) */}
        <div
          className={`p-5 rounded-2xl border-2 shadow-xs ${
            hasHardConflicts
              ? 'bg-rose-50 border-rose-500 text-rose-950'
              : 'bg-emerald-50 border-emerald-500 text-emerald-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Ràng buộc Cứng (Hard Constraints)
            </span>
            {hasHardConflicts ? (
              <XCircle className="w-6 h-6 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-700" />
            )}
          </div>
          <div className="mt-3 text-3xl font-black">
            {conflicts.length === 0 ? '0 Xung đột' : `${conflicts.length} Vi phạm`}
          </div>
          <p className="mt-1.5 text-xs font-bold opacity-90">
            {conflicts.length === 0
              ? 'Thành công 100%! Không trùng lớp, không trùng GV, phòng học đủ sức chứa.'
              : 'Cần giải quyết xung đột trước khi xuất thời khóa biểu.'}
          </p>
        </div>

        {/* Card 2: So sánh Khối lượng PCGD (Volume Match) */}
        <div className="p-5 rounded-2xl border-2 border-blue-500 bg-blue-50 text-blue-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Khớp số tiết PCGD
            </span>
            <BookOpen className="w-6 h-6 text-blue-700" />
          </div>
          <div className="mt-3 text-3xl font-black text-blue-950">
            {exactCount} / {discrepancies.length}
          </div>
          <p className="mt-1.5 text-xs font-bold text-slate-700">
            {deficitCount > 0 && `Thiếu: ${deficitCount} • `}
            {surplusCount > 0 && `Thừa: ${surplusCount} • `}
            Tỷ lệ chuẩn:{' '}
            <span className="text-blue-900 font-black">
              {discrepancies.length > 0
                ? Math.round((exactCount / discrepancies.length) * 100)
                : 0}
              %
            </span>
          </p>
        </div>

        {/* Card 3: Điểm Fitness & Soft Constraints */}
        <div className="p-5 rounded-2xl border-2 border-purple-500 bg-purple-50 text-purple-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Chỉ số Hài lòng (Fitness)
            </span>
            <Award className="w-6 h-6 text-purple-700" />
          </div>
          <div className="mt-3 text-3xl font-black text-purple-950 flex items-baseline gap-2">
            <span>{fitness.fitnessScore}/100</span>
            <span className="text-xs font-bold text-purple-800">
              (Điểm phạt: -{fitness.totalPenalty})
            </span>
          </div>
          <p className="mt-1.5 text-xs font-bold text-slate-700">
            Tiết trống GV: <strong className="text-purple-950">{fitness.breakdown.teacherGaps.count}</strong> • Dồn môn nặng:{' '}
            <strong className="text-purple-950">{fitness.breakdown.heavySubjectClustering.count}</strong>
          </p>
        </div>
      </div>

      {/* DANH SÁCH XUNG ĐỘT RÀNG BUỘC CỨNG (NẾU CÓ) */}
      {hasHardConflicts && (
        <div className="bg-white rounded-2xl border-2 border-rose-500 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-rose-600 text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h3 className="font-black text-sm uppercase tracking-wide">
              Chi tiết các Xung đột cần giải quyết ({conflicts.length})
            </h3>
          </div>
          <div className="divide-y divide-rose-200">
            {conflicts.map((conf, idx) => {
              const typeLabel =
                conf.type === 'SHIFT_VIOLATION'
                  ? 'SAI BUỔI HỌC (SÁNG/CHIỀU)'
                  : conf.type === 'TEACHER_DOUBLE_BOOKING'
                  ? 'TRÙNG GIÁO VIÊN'
                  : conf.type === 'CLASS_DOUBLE_BOOKING'
                  ? 'TRÙNG LỚP HỌC'
                  : conf.type === 'ROOM_OVERFLOW'
                  ? 'XUNG ĐỘT PHÒNG'
                  : conf.type === 'TEACHER_UNAVAILABLE'
                  ? 'VI PHẠM LỊCH BẬN GV'
                  : conf.type;

              return (
                <div key={idx} className="p-4 flex items-start gap-3 bg-white">
                  <span
                    className={`px-2.5 py-1 text-[11px] font-black rounded-md text-white shrink-0 ${
                      conf.type === 'SHIFT_VIOLATION'
                        ? 'bg-amber-700'
                        : conf.type === 'TEACHER_UNAVAILABLE'
                        ? 'bg-purple-700'
                        : 'bg-rose-700'
                    }`}
                  >
                    {typeLabel}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-950">
                      {conf.message}
                    </div>
                    <div className="text-xs text-slate-600 font-semibold mt-1">
                      Thời điểm: Thứ {conf.day}, Tiết {conf.period}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BẢNG SO SÁNH THỪA / THIẾU TIẾT VS BẢNG PHÂN CÔNG GIẢNG DẠY (PCGD) */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wide">
              Kiểm tra Khối lượng Giảng dạy (Volume Discrepancy vs PCGD)
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md">
            {discrepancies.length} Phân công
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-900 uppercase font-black text-[11px]">
                <th className="py-3 px-4">Môn học</th>
                <th className="py-3 px-4">Lớp tham gia</th>
                <th className="py-3 px-4">Giáo viên phụ trách</th>
                <th className="py-3 px-3 text-center">PCGD Yêu cầu</th>
                <th className="py-3 px-3 text-center">Đã xếp thực tế</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {discrepancies.map((row) => (
                <tr key={row.assignmentId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-black text-slate-950 text-sm">
                    {row.subjectName}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-indigo-950">
                      {row.classNames.join(', ')}
                    </span>
                    {row.classNames.length > 1 && (
                      <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] bg-amber-200 text-amber-950 font-black border border-amber-400">
                        Ghép {row.classNames.length} lớp
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">
                    {row.teacherNames.join(' + ')}
                    {row.teacherNames.length > 1 && (
                      <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] bg-emerald-200 text-emerald-950 font-black border border-emerald-400">
                        Co-teach
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center font-extrabold text-slate-800">
                    {row.expectedPeriods} tiết
                  </td>
                  <td className="py-3.5 px-3 text-center font-black text-slate-950 text-sm">
                    {row.actualPeriods} tiết
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {row.status === 'EXACT' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-700 text-white shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Chuẩn đủ tiết
                      </span>
                    )}
                    {row.status === 'DEFICIT' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-rose-700 text-white shadow-xs">
                        <AlertTriangle className="w-3.5 h-3.5" /> Thiếu {Math.abs(row.difference)} tiết
                      </span>
                    )}
                    {row.status === 'SURPLUS' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-600 text-white shadow-xs">
                        <AlertTriangle className="w-3.5 h-3.5" /> Thừa {row.difference} tiết
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHI TIẾT ĐÁNH GIÁ SOFT CONSTRAINTS (TIẾT TRỐNG GV & DỒN MÔN NẶNG) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tiết trống giáo viên (Gap period / Tiết lủng) */}
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-amber-200">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-700" />
              <h4 className="font-black text-slate-950 text-sm">
                Tiết trống giữa buổi của Giáo viên ({fitness.breakdown.teacherGaps.count})
              </h4>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
              Phạt: -{fitness.breakdown.teacherGaps.penalty}đ
            </span>
          </div>

          <div className="mt-3.5 space-y-2 max-h-56 overflow-y-auto pr-1">
            {fitness.breakdown.teacherGaps.details.length === 0 ? (
              <p className="text-xs text-emerald-800 font-extrabold py-3 flex items-center gap-2 bg-emerald-50 p-3 rounded-xl border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Không có giáo viên nào bị tiết trống giữa buổi!
              </p>
            ) : (
              fitness.breakdown.teacherGaps.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-amber-50/70 border border-amber-300 text-xs text-amber-950 font-bold"
                >
                  {detail}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dồn môn nặng học sinh */}
        <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-sm p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-indigo-200">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-700" />
              <h4 className="font-black text-slate-950 text-sm">
                Dồn tiết môn nặng/ngày ({fitness.breakdown.heavySubjectClustering.count})
              </h4>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300">
              Phạt: -{fitness.breakdown.heavySubjectClustering.penalty}đ
            </span>
          </div>

          <div className="mt-3.5 space-y-2 max-h-56 overflow-y-auto pr-1">
            {fitness.breakdown.heavySubjectClustering.details.length === 0 ? (
              <p className="text-xs text-emerald-800 font-extrabold py-3 flex items-center gap-2 bg-emerald-50 p-3 rounded-xl border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Tuyệt vời! Các môn nặng được rải đều khoa học (không quá 3 tiết/buổi).
              </p>
            ) : (
              fitness.breakdown.heavySubjectClustering.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-300 text-xs text-indigo-950 font-bold"
                >
                  {detail}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
