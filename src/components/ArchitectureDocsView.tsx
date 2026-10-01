/**
 * Component Hiển thị Toàn bộ Tài liệu Kiến trúc 6 Phần & Mã nguồn Mẫu
 * Theo yêu cầu chi tiết của Principal Software Architect & TKB Engine.
 */

import React, { useState } from 'react';
import {
  Database,
  ShieldCheck,
  Cpu,
  Award,
  Layers,
  Cloud,
  Copy,
  Check,
  FileCode,
  CheckCircle,
} from 'lucide-react';
import { FIRESTORE_SECURITY_RULES_SAMPLE, FIRESTORE_INDEXES_RECOMMENDATION } from '../services/firebaseIntegration';

export const ArchitectureDocsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const tabs = [
    { id: 1, label: 'Phần 1: Firestore Schema', icon: Database },
    { id: 2, label: 'Phần 2: Validation Engine', icon: ShieldCheck },
    { id: 3, label: 'Phần 3: CSP Solver & MRV', icon: Cpu },
    { id: 4, label: 'Phần 4: Fitness Evaluator', icon: Award },
    { id: 5, label: 'Phần 5: Dạy Ghép & Co-teach', icon: Layers },
    { id: 6, label: 'Phần 6: Firebase Admin SDK', icon: Cloud },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
      {/* Tab Navigation với độ tương phản cao */}
      <div className="border-b border-slate-200 bg-slate-50 p-2 sm:p-3 overflow-x-auto">
        <div className="flex space-x-1.5 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-950 text-white font-black shadow-md ring-1 ring-slate-800'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/70'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-600'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {/* PHẦN 1: SCHEMA DESIGN */}
        {activeTab === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                PHẦN 1: THIẾT KẾ CẤU TRÚC DỮ LIỆU NO-SQL (FIREBASE FIRESTORE SCHEMA)
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Tối ưu hóa NoSQL Schema để truy vấn kiểm tra xung đột (Conflict Detection) với độ trễ cực thấp (&lt;10ms), đồng thời hỗ trợ mảng lớp ghép và mảng co-teaching linh hoạt.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-sans font-bold">
                  <span>Collections: teachers, classes, rooms, teaching_assignments</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `// Firestore Document Schemas
interface Teacher {
  id: string;
  name: string;
  code: string;
  maxPeriodsPerDay: number;
  unavailableSlots: Array<{ day: number; period: number }>;
  preferredSlots?: Array<{ day: number; period: number }>;
}

interface SchoolClass {
  id: string;
  name: string;
  grade: number;
  studentCount: number;
  shift: 'MORNING' | 'AFTERNOON';
}

interface Room {
  id: string;
  name: string;
  roomType: 'THEORY' | 'COMPUTER_LAB' | 'SCIENCE_LAB' | 'STADIUM';
  capacity: number;
}

interface TeachingAssignment {
  id: string;
  subjectId: string;
  teacherIds: string[]; // Co-teaching support
  classIds: string[];   // Merged classes support
  periodsPerWeek: number;
  requiredRoomType?: string;
  isMerged: boolean;
  doublePeriodsAllowed: boolean;
}`,
                        'schema1'
                      )
                    }
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    {copiedKey === 'schema1' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Sao chép
                  </button>
                </div>
                <pre className="mt-2 text-indigo-200">
{`// 1. Collection 'teachers':
{
  "id": "T_NAM",
  "name": "Thầy Trần Văn Nam",
  "code": "GV_TOAN_01",
  "maxPeriodsPerDay": 4,
  "unavailableSlots": [{ "day": 2, "period": 1 }],
  "preferredSlots": [{ "day": 3, "period": 2 }]
}

// 2. Collection 'classes':
{
  "id": "C_10A1",
  "name": "Lớp 10A1",
  "grade": 10,
  "studentCount": 42,
  "shift": "MORNING"
}

// 3. Collection 'rooms':
{
  "id": "R_STADIUM",
  "name": "Sân Thể Dục & QP",
  "roomType": "STADIUM",
  "capacity": 150
}

// 4. Collection 'teaching_assignments' (PCGD):
{
  "id": "ASG_STEM_10A1_A2",
  "subjectId": "SUB_STEM",
  "teacherIds": ["T_TUAN", "T_LAN"], // Co-teaching
  "classIds": ["C_10A1", "C_10A2"],   // Ghép 2 lớp
  "periodsPerWeek": 2,
  "requiredRoomType": "SCIENCE_LAB",
  "isMerged": true,
  "doublePeriodsAllowed": true
}`}
                </pre>
              </div>

              <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-sans font-bold">
                  <span>Collection: timetables (Đơn vị Slot kết quả)</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(FIRESTORE_INDEXES_RECOMMENDATION, null, 2),
                        'indexes'
                      )
                    }
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    {copiedKey === 'indexes' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Indexes
                  </button>
                </div>
                <pre className="mt-2 text-emerald-300">
{`// Collection 'timetables' - Document ID: {termId}_{day}_{period}_{classId}
{
  "id": "SLOT_ASG_STEM_C10A1_D3_P3",
  "termId": "HK1_2026_2027",
  "day": 3,
  "period": 3,
  "classId": "C_10A1",
  "classIds": ["C_10A1", "C_10A2"], // Lưu toàn bộ lớp gộp
  "teacherId": "T_TUAN",
  "teacherIds": ["T_TUAN", "T_LAN"], // Lưu toàn bộ GV dạy đôi
  "roomId": "R_LAB_STEM",
  "assignmentId": "ASG_STEM_10A1_A2",
  "subjectId": "SUB_STEM",
  "isMerged": true,
  "isCoTeaching": true
}

// Composite Indexes để kiểm tra xung đột tức thì:
// 1. (day ASC, period ASC, classId ASC)
// 2. (day ASC, period ASC, teacherId ASC)
// 3. (day ASC, period ASC, roomId ASC)`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* PHẦN 2: VALIDATION ENGINE */}
        {activeTab === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                PHẦN 2: MODULE KIỂM TRA XUNG ĐỘT & CẢNH BÁO (VALIDATION ENGINE)
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Gồm 4 hàm kiểm tra cốt lõi: Trùng tiết GV (ngoại trừ tiết ghép cùng assignmentId), Trùng tiết Lớp, Quá tải phòng học, và Thừa/Thiếu số tiết thực tế so với PCGD.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-sans font-bold">
                <span>ValidationEngine.ts</span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `// Core validation snippets
public static checkTeacherConflict(teacherId, day, period, slots, currentAssignmentId) {
  return slots.filter(slot => {
    if (slot.day !== day || slot.period !== period) return false;
    const isTeacherInSlot = slot.teacherId === teacherId || (slot.teacherIds && slot.teacherIds.includes(teacherId));
    if (!isTeacherInSlot) return false;
    // Ngoại lệ: Nếu cùng 1 assignmentId thì là tiết ghép hợp lệ!
    if (currentAssignmentId && slot.assignmentId === currentAssignmentId) return false;
    return true;
  });
}`,
                      'valSnippet'
                    )
                  }
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  {copiedKey === 'valSnippet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Sao chép
                </button>
              </div>
              <pre className="mt-2 text-indigo-300">
{`/**
 * 1. checkTeacherConflict(teacherId, day, period)
 * Ngoại lệ cực kỳ quan trọng: Nếu slot đã có cùng assignmentId,
 * tức là GV đang dạy ghép 2 lớp (VD: Thể dục 10A1 + 10A2), KHÔNG BÁO XUNG ĐỘT!
 */
public static checkTeacherConflict(
  teacherId: string, day: DayOfWeek, period: PeriodOfDay,
  slots: TimetableSlot[], currentAssignmentId?: string
) {
  const conflicts = slots.filter(slot => {
    if (slot.day !== day || slot.period !== period) return false;
    const isTeacherInSlot = slot.teacherId === teacherId || 
      (slot.teacherIds && slot.teacherIds.includes(teacherId));
    if (!isTeacherInSlot) return false;
    // Cùng 1 phân công (assignmentId) -> Hợp lệ (Tiết ghép)
    if (currentAssignmentId && slot.assignmentId === currentAssignmentId) return false;
    return true;
  });
  return { hasConflict: conflicts.length > 0, conflictingSlots: conflicts };
}

/**
 * 2. checkVolumeDiscrepancy(assignments, currentTimetable)
 * Phát hiện Thừa / Thiếu tiết so với Bảng Phân công Giảng dạy (PCGD)
 */
public static checkVolumeDiscrepancy(assignments, currentTimetable) {
  // Đếm theo tập (day, period) duy nhất để không đếm đúp khi có nhiều lớp trong tiết ghép
  ...
}`}
              </pre>
            </div>
          </div>
        )}

        {/* PHẦN 3: CSP SOLVER */}
        {activeTab === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                PHẦN 3: THUẬT TOÁN XẾP TKB TỰ ĐỘNG (CSP + MRV + FORWARD CHECKING)
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Kỹ thuật <strong>MRV (Minimum Remaining Values)</strong> ưu tiên các biến khó nhất (Co-teaching N GV, Tiết ghép N lớp, Sân bãi đặc thù). Kết hợp <strong>Forward Checking</strong> triệt tiêu sớm các nhánh vô nghiệm.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
              <pre className="mt-2 text-amber-200">
{`/**
 * Thuật toán CSP Backtracking với MRV & Forward Checking
 */
public solve(): SolverResult {
  // Bước 1: Decompose assignments thành các SchedulingTasks (tiết đơn / tiết kép)
  const tasks = this.decomposeAssignmentsToTasks();

  // Bước 2: MRV Sorting - Xếp biến khó nhất trước
  // Tiết co-teaching 2 GV x 2 lớp -> Tiết ghép 1 GV x 2 lớp -> Phòng đặc thù -> Thường
  this.orderTasksByMRV(tasks);

  // Bước 3: Đệ quy gán tiết
  const success = this.assignSlotRecursive(0, tasks, currentSlots);
  return { success, slots: currentSlots, ... };
}

private assignSlotRecursive(taskIndex, tasks, currentSlots): boolean {
  if (taskIndex >= tasks.length) return true; // Hoàn thành tất cả các tiết

  const task = tasks[taskIndex];
  const candidates = this.generateCandidateDomainValues(task, currentSlots);

  for (const candidate of candidates) {
    // 1. Kiểm tra tính sẵn sàng đồng thời
    const check = MergedClassHandler.checkAvailability(task.assignment, candidate.day, candidate.period, ...);
    if (!check.isAvailable) continue;

    // 2. Gán nguyên tử (Atomic Lock)
    const newSlots = MergedClassHandler.createAtomicSlots(task.assignment, candidate.day, candidate.period, ...);
    currentSlots.push(...newSlots);

    // 3. Forward Checking: Kiểm tra xem các task khó còn lại có bị cạn kiệt domain không
    if (this.forwardCheck(taskIndex + 1, tasks, currentSlots)) {
      if (this.assignSlotRecursive(taskIndex + 1, tasks, currentSlots)) return true;
    }

    // 4. Backtrack: Rollback atomic slots
    for (let i = 0; i < newSlots.length; i++) currentSlots.pop();
  }
  return false;
}`}
              </pre>
            </div>
          </div>
        )}

        {/* PHẦN 4: FITNESS EVALUATOR */}
        {activeTab === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" />
                PHẦN 4: HÀM ĐÁNH GIÁ ĐIỂM TỐI ƯU (FITNESS SCORE EVALUATOR)
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Tối ưu hóa các Ràng buộc mềm (Soft Constraints): Phạt tiết trống giữa buổi của GV (Gap period), Phạt dồn môn nặng cho HS, Phạt vi phạm nguyện vọng GV.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
              <pre className="mt-2 text-rose-200">
{`/**
 * Phạt tiết trống (Gap Periods) giữa buổi của Giáo viên:
 * Ví dụ: GV Nam dạy Tiết 1 và Tiết 4, trống Tiết 2, 3 -> span = 4 - 1 + 1 = 4, actual = 2 -> Gaps = 2
 */
private static evaluateTeacherGaps(slots: TimetableSlot[], teachers: Teacher[]) {
  let gapCount = 0;
  for (const teacher of teachers) {
    for (const day of DAYS_OF_WEEK) {
      const periods = slots
        .filter(s => s.day === day && (s.teacherId === teacher.id || s.teacherIds?.includes(teacher.id)))
        .map(s => s.period)
        .sort((a, b) => a - b);

      if (periods.length >= 2) {
        const span = periods[periods.length - 1] - periods[0] + 1;
        const gapsInDay = span - periods.length;
        if (gapsInDay > 0) gapCount += gapsInDay;
      }
    }
  }
  return { count: gapCount, penalty: gapCount * 12 };
}`}
              </pre>
            </div>
          </div>
        )}

        {/* PHẦN 5: MERGED CLASS HANDLER */}
        {activeTab === 5 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-600" />
                PHẦN 5: XỬ LÝ DẠY GHÉP VÀ NHÓM LỚP (MERGED CLASS & CO-TEACHING)
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Cơ chế <strong>Khóa đồng thời (Atomic Lock)</strong> và <strong>Đồng bộ đa đối tượng</strong>: Khi xếp tiết cho <code>classIds: ['10A1', '10A2']</code> và <code>teacherIds: ['T_TUAN', 'T_LAN']</code>.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
              <pre className="mt-2 text-cyan-200">
{`export class MergedClassHandler {
  public static checkAvailability(assignment, day, period, currentSlots, teachersMap, classesMap, rooms) {
    // 1. Kiểm tra ĐỒNG THỜI tất cả các lớp tham gia (Không lớp nào bận)
    for (const classId of assignment.classIds) {
      if (ValidationEngine.checkClassConflict(classId, day, period, currentSlots, assignment.id).hasConflict) {
        return { isAvailable: false, reason: \`Lớp \${classId} đã có lịch\` };
      }
    }

    // 2. Kiểm tra ĐỒNG THỜI tất cả các Giáo viên (Co-teaching: Cả 2 GV đều rảnh)
    for (const teacherId of assignment.teacherIds) {
      const teacher = teachersMap.get(teacherId);
      if (teacher && !ValidationEngine.checkTeacherAvailability(teacher, day, period)) {
        return { isAvailable: false, reason: \`GV \${teacher.name} báo bận\` };
      }
      if (ValidationEngine.checkTeacherConflict(teacherId, day, period, currentSlots, assignment.id).hasConflict) {
        return { isAvailable: false, reason: \`GV \${teacherId} trùng lịch dạy\` };
      }
    }

    // 3. Tính tổng sĩ số tất cả các lớp gộp -> Tìm phòng/sân có capacity >= tổng sĩ số
    let totalStudents = assignment.classIds.reduce((sum, cId) => sum + (classesMap.get(cId)?.studentCount || 0), 0);
    ...
  }
}`}
              </pre>
            </div>
          </div>
        )}

        {/* PHẦN 6: FIREBASE ADMIN SDK CODE */}
        {activeTab === 6 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-indigo-600" />
                PHẦN 6: API INTEGRATION & CODE MẪU FIREBASE ADMIN SDK
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                Các hàm async/await kết nối Firebase Admin SDK, Chunked Batch Writes (&lt;= 500 writes/batch) và Security Rules chuẩn hóa.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-xs overflow-x-auto relative">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-sans font-bold">
                <span>saveTimetableToFirebase() & firestore.rules</span>
                <button
                  onClick={() => copyToClipboard(FIRESTORE_SECURITY_RULES_SAMPLE, 'rules')}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  {copiedKey === 'rules' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy firestore.rules
                </button>
              </div>
              <pre className="mt-2 text-teal-200">
{`// 1. CHUNKED BATCH WRITE LƯU KẾT QUẢ TKB VÀO FIRESTORE (Node.js Backend)
export async function saveTimetableToFirebase(slots: TimetableSlot[], termId: string) {
  const CHUNK_SIZE = 450; // Giới hạn Firestore là 500 operations
  const db = admin.firestore();

  for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
    const chunk = slots.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const slot of chunk) {
      const docRef = db.collection('timetables')
        .doc(\`\${termId}_\${slot.day}_\${slot.period}_\${slot.classId}\`);
      batch.set(docRef, {
        ...slot,
        termId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit(); // Ghi song song hoặc nối tiếp từng chunk
  }
}

// 2. FIRESTORE SECURITY RULES (firestore.rules)
${FIRESTORE_SECURITY_RULES_SAMPLE}`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
