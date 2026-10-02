/**
 * TKB Engine Pro - Hệ thống Xếp Thời Khóa Biểu Thông Minh
 * 
 * Kiến trúc Hybrid 2 Giai đoạn:
 * - Giai đoạn 1: CSP + Backtracking + MRV + Forward Checking (100% Ràng buộc cứng)
 * - Giai đoạn 2: Genetic Algorithm / Simulated Annealing (Tối ưu hóa mềm)
 * - Firebase Firestore NoSQL Schema & Batch Write
 * 
 * Giao diện Sidebar bên trái với độ tương phản cao, trực quan, chuyên nghiệp.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

import {
  TimetableSlot,
  TeachingAssignment,
  Teacher,
  SchoolClass,
  Room,
  Subject,
} from './types/timetable';
import { TimetableSolver, SolverResult } from './services/timetableSolver';
import { GeneticOptimizer, OptimizationStepResult } from './services/geneticOptimizer';
import { ValidationEngine } from './services/validationEngine';
import { ExportConfig } from './utils/timetableExcelExport';
import { FitnessEvaluator } from './services/fitnessEvaluator';
import {
  fetchAllDataFromFirebase,
  syncAllStateToFirebase,
  saveTimetableSlotsToFirebase,
  clearAllDataFromFirebase,
  saveMultipleTeachersToFirebase,
  saveMultipleClassesToFirebase,
  saveMultipleSubjectsToFirebase,
  saveMultipleRoomsToFirebase,
  replaceAllAssignmentsInFirebase,
} from './services/firebaseClient';

import { TimetableGrid } from './components/TimetableGrid';
import { ValidationReportView } from './components/ValidationReportView';
import { DataManagementView } from './components/DataManagementView';
import { ExportTimetableView } from './components/ExportTimetableView';
import { DataEntryView } from './components/DataEntryView';
import { ClassScheduleDistributor } from './components/ClassScheduleDistributor';
import { MergedClassManager } from './components/MergedClassManager';
import { TeacherTimetableView } from './components/TeacherTimetableView';
import { BackupManagerModal } from './components/BackupManagerModal';
import { UserGuideView } from './components/UserGuideView';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { AccessBlockedScreen } from './components/AccessBlockedScreen';
import { AccountLoginModal } from './components/AccountLoginModal';
import { RenewalRequestModal } from './components/RenewalRequestModal';
import { BackupDataPayload } from './services/BackupService';
import { School, UserProfile, RenewalRequest } from './types/school';
import { checkSchoolAccess, getAllSchools } from './services/schoolService';
import { fetchSchoolRenewalRequests, subscribeToRenewalRequestsRealtime } from './services/renewalService';
import { subscribeToSchoolsRealtime } from './services/authService';
import { getSystemUsers } from './services/superAdminService';

import {
  Calendar,
  ShieldCheck,
  Cpu,
  Sparkles,
  Database,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Award,
  Zap,
  Menu,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  School as SchoolIcon,
  Printer,
  UserPlus,
  UserCheck,
  FileEdit,
  Cloud,
  CloudCheck,
  Trash2,
  UploadCloud,
  Layers,
  BookOpen,
  HelpCircle,
  Shield,
  Building2,
  Lock,
  LogOut,
  Users,
  LayoutGrid,
  Plus,
} from 'lucide-react';

import { LoginPage } from './components/LoginPage';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  // 0. Quản lý Tài khoản Đăng nhập & Phân quyền (AuthContext & RBAC)
  const {
    user: currentUser,
    school: currentSchool,
    isAuthenticated,
    isLoading: isAuthLoading,
    isSchoolBlocked,
    blockedReason,
    logout,
    switchDemoUser,
    verifyCurrentAccess,
    setDirectSchool,
  } = useAuth();

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // 1. Dữ liệu đầu vào (Khởi tạo sạch rỗng - Tải trực tiếp từ Firebase Firestore)
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);

  // 2. Trạng thái Thời khóa biểu và Thuật toán
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizerProgress, setOptimizerProgress] = useState<OptimizationStepResult | null>(null);
  const [firebaseNotification, setFirebaseNotification] = useState<string | null>(null);
  const [isCloudLoading, setIsCloudLoading] = useState(true);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig | undefined>(undefined);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [schoolRenewalRequests, setSchoolRenewalRequests] = useState<RenewalRequest[]>([]);
  const [isLoadingRenewalRequests, setIsLoadingRenewalRequests] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<'OVERVIEW' | 'SCHOOLS' | 'REQUESTS' | 'LICENSE' | 'USERS' | 'SETTINGS'>('OVERVIEW');
  const [schools, setSchools] = useState<School[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [superAdminRequests, setSuperAdminRequests] = useState<RenewalRequest[]>([]);

  // 3. Tab điều hướng chính và Drawer cho Mobile
  const [activeTab, setActiveTab] = useState<
    'SUPER_ADMIN' | 'SCHOOL_ACCOUNT' | 'DISTRIBUTOR' | 'MERGED' | 'GRID' | 'TEACHER_TIMETABLE' | 'INPUT' | 'VALIDATION' | 'DATA' | 'EXPORT' | 'BACKUP' | 'GUIDE'
  >(currentUser?.role === 'super_admin' ? 'SUPER_ADMIN' : 'GRID');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Tải danh sách yêu cầu gia hạn của trường hiện tại
  const loadSchoolRenewalRequests = useCallback(async () => {
    if (currentSchool?.schoolId) {
      setIsLoadingRenewalRequests(true);
      try {
        const list = await fetchSchoolRenewalRequests(currentSchool.schoolId);
        setSchoolRenewalRequests(list);
      } catch (e) {
        console.warn('Lỗi load renewal requests:', e);
      } finally {
        setIsLoadingRenewalRequests(false);
      }
    }
  }, [currentSchool?.schoolId]);

  useEffect(() => {
    if (activeTab === 'SCHOOL_ACCOUNT' && currentSchool?.schoolId) {
      loadSchoolRenewalRequests();
    }
  }, [activeTab, currentSchool?.schoolId, loadSchoolRenewalRequests]);

  // Lắng nghe realtime danh sách trường học, tài khoản và yêu cầu gia hạn khi đăng nhập Super Admin
  useEffect(() => {
    if (currentUser?.role !== 'super_admin') return;

    // 1. Nạp ban đầu danh sách trường và danh sách users
    getAllSchools('super_admin').then((initialSchools) => {
      if (initialSchools.length > 0) {
        setSchools(initialSchools);
        getSystemUsers(initialSchools).then((uList) => setUsers(uList)).catch(() => {});
      }
    }).catch(() => {});

    // Lắng nghe realtime danh sách trường từ Firestore
    const unsubscribeSchools = subscribeToSchoolsRealtime((updatedList) => {
      if (updatedList.length > 0) {
        setSchools(updatedList);
        getSystemUsers(updatedList).then((uList) => setUsers(uList)).catch(() => {});
      }
    });

    // Lắng nghe realtime các yêu cầu gia hạn
    const unsubscribeRequests = subscribeToRenewalRequestsRealtime((requests) => {
      setSuperAdminRequests(requests);
    });

    return () => {
      if (unsubscribeSchools) unsubscribeSchools();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, [currentUser?.role]);

  // Đồng bộ tab khi đổi vai trò người dùng
  useEffect(() => {
    setIsReadOnlyMode(false);
    if (currentUser?.role === 'super_admin') {
      setActiveTab('SUPER_ADMIN');
      setAdminSubTab('OVERVIEW');
    } else {
      setActiveTab('GRID');
    }
  }, [currentUser]);

  /**
   * Cập nhật tức thì dữ liệu vào State sau khi khôi phục thành công từ file JSON
   */
  const handleRestoreSuccess = (restoredData: BackupDataPayload) => {
    setTeachers(restoredData.teachers);
    setClasses(restoredData.classes);
    setRooms(restoredData.rooms);
    setSubjects(restoredData.subjects);
    setAssignments(restoredData.teachingAssignments);
    setSlots(restoredData.timetableSlots);
    setIsCloudSynced(true);
    setFirebaseNotification(
      `Đã khôi phục thành công hệ thống: ${restoredData.teachers.length} GV, ${restoredData.classes.length} Lớp, ${restoredData.timetableSlots.length} Tiết TKB! Đang đồng bộ lên Firebase...`
    );

    // Lưu đồng bộ toàn bộ dữ liệu khôi phục lên Firebase Firestore Sub-collection của trường
    syncAllStateToFirebase(
      {
        teachers: restoredData.teachers,
        classes: restoredData.classes,
        rooms: restoredData.rooms,
        subjects: restoredData.subjects,
        assignments: restoredData.teachingAssignments,
        slots: restoredData.timetableSlots,
      },
      currentSchool?.schoolId
    );

    try {
      if (restoredData.timetableSlots.length > 0) {
        const sid = currentSchool?.schoolId || 'default';
        localStorage.setItem(
          `inprogress_timetable_slots_${sid}`,
          JSON.stringify(restoredData.timetableSlots)
        );
      }
    } catch (e) {
      // ignore
    }
  };

  // Tự động tải dữ liệu từ Firebase Firestore Sub-collection khi mở ứng dụng hoặc đổi trường
  useEffect(() => {
    if (currentSchool?.schoolId) {
      // Khi đổi trường hoặc đăng nhập trường mới, lập tức xóa sạch state cũ tránh rò rỉ dữ liệu
      setTeachers([]);
      setClasses([]);
      setRooms([]);
      setSubjects([]);
      setAssignments([]);
      setSlots([]);
      setSolverResult(null);
      setExportConfig(undefined);
      loadCloudData(currentSchool.schoolId);
    } else {
      // Khi không có trường (đã đăng xuất hoặc chưa đăng nhập), xóa sạch toàn bộ state
      setTeachers([]);
      setClasses([]);
      setRooms([]);
      setSubjects([]);
      setAssignments([]);
      setSlots([]);
      setSolverResult(null);
      setExportConfig(undefined);
      setIsCloudLoading(false);
      setIsCloudSynced(false);
    }
  }, [currentSchool?.schoolId]);

  /**
   * Tải toàn bộ dữ liệu từ Cloud Firestore Sub-collection của trường
   */
  const loadCloudData = async (targetSchoolId?: string) => {
    const sid = targetSchoolId || currentSchool?.schoolId;
    if (!sid) {
      setTeachers([]);
      setClasses([]);
      setRooms([]);
      setSubjects([]);
      setAssignments([]);
      setSlots([]);
      setIsCloudLoading(false);
      return;
    }

    setIsCloudLoading(true);
    try {
      const cloudData = await fetchAllDataFromFirebase(sid);
      setTeachers(cloudData.teachers);
      setClasses(cloudData.classes);
      setSubjects(cloudData.subjects);
      setRooms(cloudData.rooms.length > 0 ? cloudData.rooms : []);
      setAssignments(cloudData.assignments);
      setIsCloudSynced(cloudData.isCloudLoaded);
      if (cloudData.exportConfig) {
        setExportConfig(cloudData.exportConfig);
      }

      // Lọc và làm sạch các slots để loại bỏ triệt để các môn không có trong PCGD của lớp
      const validClassIds = new Set(cloudData.classes.map((c) => c.id));
      const classSubjectMap = new Map<string, Set<string>>();
      cloudData.assignments.forEach((a) => {
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

      const cleanSlots = (cloudData.slots || []).filter((slot) => {
        if (!validClassIds.has(slot.classId)) return false;
        if (
          slot.subjectId === 'SUB_OFF' ||
          slot.subjectId === 'SUB_CC' ||
          slot.subjectId === 'SUB_SHL' ||
          slot.assignmentId?.startsWith('ASG_CC_') ||
          slot.assignmentId?.startsWith('ASG_SHL_')
        ) {
          return true;
        }
        const sub = cloudData.subjects.find((s) => s.id === slot.subjectId);
        if (sub?.code === 'CC' || sub?.code === 'SHL') return true;
        const allowed = classSubjectMap.get(slot.classId);
        return allowed ? allowed.has(slot.subjectId) : false;
      });

      // Bảo toàn Thời Khóa Biểu hợp lệ đang xếp dở của các lớp:
      if (cleanSlots.length > 0) {
        setSlots(cleanSlots);
        if (cleanSlots.length !== (cloudData.slots || []).length) {
          saveTimetableSlotsToFirebase(cleanSlots, 'HK1_2026_2027', sid).catch(() => {});
        }
      } else if (
        cloudData.assignments.length > 0 &&
        cloudData.teachers.length > 0 &&
        cloudData.classes.length > 0
      ) {
        // Chỉ chạy solver khởi tạo khi chưa có bất kỳ TKB nào được lưu
        const solver = new TimetableSolver(
          cloudData.assignments,
          cloudData.teachers,
          cloudData.classes,
          cloudData.rooms,
          cloudData.subjects
        );
        const result = solver.solve();
        setSlots(result.slots);
        setSolverResult(result);
        if (result.slots.length > 0) {
          saveTimetableSlotsToFirebase(result.slots, 'HK1_2026_2027', sid);
        }
      } else {
        setSlots([]);
      }
    } catch (err: any) {
      console.error(`Lỗi khi tải dữ liệu Firebase trường [${sid}]:`, err);
    } finally {
      setIsCloudLoading(false);
    }
  };

  /**
   * Chạy Giai đoạn 1: CSP Backtracking với MRV & Forward Checking
   */
  const runCSPSolver = () => {
    if (isReadOnlyMode) {
      alert('Chế độ Chỉ Đọc: Tài khoản trường học đã hết hạn dùng thử. Không thể chạy công cụ xếp Thời khóa biểu tự động!');
      return;
    }
    if (assignments.length === 0 || teachers.length === 0 || classes.length === 0) {
      setFirebaseNotification('Chưa có đủ dữ liệu Phân công giảng dạy, Giáo viên hoặc Lớp học để xếp TKB!');
      setTimeout(() => setFirebaseNotification(null), 4000);
      return;
    }

    setIsSolving(true);
    setOptimizerProgress(null);

    setTimeout(async () => {
      const solver = new TimetableSolver(
        assignments,
        teachers,
        classes,
        rooms,
        subjects
      );
      const result = solver.solve(slots);

      setSlots(result.slots);
      setSolverResult(result);
      setIsSolving(false);

      // Tự động lưu kết quả xếp lịch lên Firestore Sub-collection
      if (result.slots.length > 0) {
        await saveTimetableSlotsToFirebase(result.slots, 'HK1_2026_2027', currentSchool?.schoolId);
      }
    }, 50);
  };

  /**
   * Chạy Giai đoạn 2: Genetic Algorithm / Simulated Annealing Slot Swapping
   */
  const runGeneticOptimization = () => {
    if (isReadOnlyMode) {
      alert('Chế độ Chỉ Đọc: Tài khoản trường học đã hết hạn dùng thử. Không thể chạy công cụ tối ưu GA!');
      return;
    }
    if (slots.length === 0) return;
    setIsOptimizing(true);

    setTimeout(async () => {
      const optimizer = new GeneticOptimizer(
        teachers,
        classes,
        rooms,
        subjects
      );
      const res = optimizer.optimize(slots, 100, (step) => {
        setOptimizerProgress(step);
      });

      setSlots(res.finalSlots);
      setIsOptimizing(false);

      // Lưu kết quả tối ưu lên Firestore Sub-collection
      await saveTimetableSlotsToFirebase(res.finalSlots, 'HK1_2026_2027', currentSchool?.schoolId);
    }, 60);
  };

  /**
   * Đồng bộ toàn bộ dữ liệu hiện tại lên Firebase Firestore Sub-collection
   */
  const handleSaveToFirestore = async () => {
    if (isReadOnlyMode) {
      alert('Chế độ Chỉ Đọc: Tài khoản trường học đã hết hạn dùng thử. Không thể đồng bộ chỉnh sửa lên Firebase!');
      return;
    }
    const sid = currentSchool?.schoolId;
    try {
      setFirebaseNotification(`Đang đồng bộ dữ liệu trường [${sid}] lên Firebase...`);
      const ok = await syncAllStateToFirebase(
        {
          teachers,
          classes,
          subjects,
          rooms,
          assignments,
          slots,
        },
        sid
      );

      if (ok) {
        setFirebaseNotification(
          `✓ Đã đồng bộ thành công lên Firebase [${currentSchool?.schoolName || sid}]: ${teachers.length} GV, ${classes.length} Lớp, ${subjects.length} Môn, ${assignments.length} PCGD, ${slots.length} Tiết TKB!`
        );
        setIsCloudSynced(true);
      } else {
        setFirebaseNotification('Có lỗi khi lưu lên Firebase Firestore. Vui lòng thử lại!');
      }
      setTimeout(() => setFirebaseNotification(null), 5000);
    } catch (err: any) {
      setFirebaseNotification(`Lỗi khi lưu Firestore: ${err.message}`);
    }
  };

  /**
   * Xóa sạch toàn bộ dữ liệu trên Firebase & Giao diện của trường hiện tại
   */
  const handleClearAllData = async () => {
    if (isReadOnlyMode) {
      alert('Chế độ Chỉ Đọc: Tài khoản trường học đã hết hạn dùng thử. Không thể thực hiện thao tác xóa dữ liệu!');
      return;
    }
    const sid = currentSchool?.schoolId;
    if (
      confirm(
        `CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH TOÀN BỘ dữ liệu của trường [${currentSchool?.schoolName || sid}] trên Firebase Firestore Sub-collection?`
      )
    ) {
      setFirebaseNotification('Đang xóa sạch dữ liệu trên Firebase Firestore...');
      await clearAllDataFromFirebase(sid);
      setTeachers([]);
      setClasses([]);
      setSubjects([]);
      setRooms([]);
      setAssignments([]);
      setSlots([]);
      setSolverResult(null);
      setFirebaseNotification(`Đã xóa sạch dữ liệu của trường [${sid}] trên Cloud Firebase!`);
      setTimeout(() => setFirebaseNotification(null), 4000);
    }
  };



  /**
   * Xuất file JSON
   */
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(slots, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `TKB_${currentSchool?.schoolId || 'EXPORT'}_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Tính toán các báo cáo kiểm tra thời gian thực
  const conflicts = useMemo(() => {
    return ValidationEngine.scanAllConflicts(slots, teachers, rooms, classes, subjects);
  }, [slots, teachers, rooms, classes, subjects]);

  const discrepancies = useMemo(() => {
    const subjectsMap = new Map(subjects.map((s) => [s.id, s.name]));
    const classesMap = new Map(classes.map((c) => [c.id, c.name]));
    const teachersMap = new Map(teachers.map((t) => [t.id, t.name]));
    return ValidationEngine.checkVolumeDiscrepancy(
      assignments,
      slots,
      subjectsMap,
      classesMap,
      teachersMap
    );
  }, [assignments, slots, subjects, classes, teachers]);

  const fitness = useMemo(() => {
    return FitnessEvaluator.evaluate(slots || [], teachers || [], classes || [], subjects || []);
  }, [slots, teachers, classes, subjects]);

  const mergedCount = useMemo(() => {
    return (assignments || []).filter((a) => a.isMerged || (a.classIds && a.classIds.length > 1) || (a.teacherIds && a.teacherIds.length > 1)).length;
  }, [assignments]);

  // Kiểm tra số ngày còn lại của bản quyền trường học (< 5 ngày kích hoạt cảnh báo)
  const schoolDaysUntilExpiry = useMemo(() => {
    if (!currentSchool?.expiredAt) return null;
    const expDate = new Date(currentSchool.expiredAt);
    if (expDate.getFullYear() >= 2090) return null; // Bản quyền vĩnh viễn
    const diff = expDate.getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [currentSchool?.expiredAt]);

  const isSchoolExpiringSoon = schoolDaysUntilExpiry !== null && schoolDaysUntilExpiry < 5 && schoolDaysUntilExpiry >= 0;
  const isSchoolExpired = schoolDaysUntilExpiry !== null && schoolDaysUntilExpiry < 0;

  // Các mục menu bên trái theo đúng thứ tự hiển thị:
  const navMenuItems = currentUser?.role === 'super_admin'
    ? [
        {
          id: 'SUPER_ADMIN_OVERVIEW' as any,
          label: 'Tổng Quan Hệ Thống',
          icon: LayoutGrid,
          badge: 'KPIs',
          badgeColor: 'bg-indigo-600 text-white',
        },
        {
          id: 'SUPER_ADMIN_SCHOOLS' as any,
          label: 'Quản Lý Trường Học',
          icon: Building2,
          badge: `${schools.length} trường`,
          badgeColor: 'bg-emerald-600 text-white',
        },
        {
          id: 'SUPER_ADMIN_REQUESTS' as any,
          label: 'Yêu Cầu Gia Hạn',
          icon: Sparkles,
          badge: superAdminRequests.filter((r) => r.status === 'pending').length > 0
            ? `${superAdminRequests.filter((r) => r.status === 'pending').length} chờ duyệt`
            : `${superAdminRequests.length} yêu cầu`,
          badgeColor: superAdminRequests.filter((r) => r.status === 'pending').length > 0
            ? 'bg-amber-500 text-white animate-pulse'
            : 'bg-purple-600 text-white',
        },
        {
          id: 'SUPER_ADMIN_USERS' as any,
          label: 'Quản Lý Tài Khoản',
          icon: Users,
          badge: `${users.length} users`,
          badgeColor: 'bg-purple-600 text-white',
        },
        {
          id: 'GUIDE' as any,
          label: 'Hướng dẫn sử dụng',
          icon: BookOpen,
          badge: 'Video & Bài viết',
          badgeColor: 'bg-emerald-600 text-white',
        },
      ]
    : [
        {
          id: 'GRID' as const,
          label: 'Thời Khóa Biểu Tuần',
          icon: Calendar,
          badge: `${(slots || []).length} tiết`,
          badgeColor: 'bg-indigo-600 text-white',
        },
        {
          id: 'TEACHER_TIMETABLE' as const,
          label: 'TKB Giáo Viên',
          icon: UserCheck,
          badge: `${(teachers || []).length} GV`,
          badgeColor: 'bg-indigo-600 text-white',
        },
        {
          id: 'INPUT' as const,
          label: 'Nhập Thông Tin',
          icon: UserPlus,
          badge: `${(teachers || []).length} GV`,
          badgeColor: 'bg-emerald-600 text-white',
        },
        {
          id: 'DATA' as const,
          label: 'PCGD & Chuyên Môn',
          icon: FileSpreadsheet,
          badge: `${(assignments || []).length} PCGD`,
          badgeColor: 'bg-amber-600 text-white',
        },
        {
          id: 'MERGED' as const,
          label: 'Ghép Lớp',
          icon: Layers,
          badge: `${mergedCount} Nhóm`,
          badgeColor: 'bg-purple-600 text-white',
        },
        {
          id: 'DISTRIBUTOR' as const,
          label: 'Phân Thời Khóa Biểu',
          icon: Sparkles,
          badge: `${(classes || []).length} Lớp`,
          badgeColor: 'bg-rose-600 text-white',
        },
        {
          id: 'VALIDATION' as const,
          label: 'Kiểm Tra & Cảnh Báo',
          icon: ShieldCheck,
          badge: (conflicts || []).length === 0 ? '0 Lỗi' : `${(conflicts || []).length} Lỗi`,
          badgeColor: (conflicts || []).length === 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white',
        },
        {
          id: 'EXPORT' as const,
          label: 'Xuất & In File TKB',
          icon: Printer,
          badge: 'Chuẩn Bản In',
          badgeColor: 'bg-cyan-700 text-white',
        },
        {
          id: 'BACKUP' as const,
          label: 'Sao lưu dữ liệu',
          icon: Database,
          badge: 'JSON Cloud',
          badgeColor: 'bg-indigo-600 text-white',
        },
        {
          id: 'SCHOOL_ACCOUNT' as const,
          label: 'Quản Lý Tài Khoản Trường',
          icon: Building2,
          badge: isSchoolExpired
            ? 'Đã Hết Hạn'
            : isSchoolExpiringSoon
            ? `Còn ${schoolDaysUntilExpiry === 0 ? 'hôm nay' : `${schoolDaysUntilExpiry} ngày`}`
            : 'Bản Quyền',
          badgeColor: isSchoolExpired
            ? 'bg-rose-600 text-white font-black'
            : isSchoolExpiringSoon
            ? 'bg-amber-500 text-slate-950 font-black animate-pulse'
            : 'bg-emerald-600 text-white',
        },
        {
          id: 'GUIDE' as const,
          label: 'Hướng dẫn sử dụng',
          icon: BookOpen,
          badge: 'Video & Bài viết',
          badgeColor: 'bg-emerald-600 text-white',
        },
      ];

  // Màn hình tải phiên làm việc
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white font-sans">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/40 animate-pulse mb-4">
          <Cpu className="w-8 h-8" />
        </div>
        <div className="text-base font-black text-white">TKB Engine Pro</div>
        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span>Đang kiểm tra phiên làm việc...</span>
        </div>
      </div>
    );
  }

  // 1. Chưa đăng nhập -> Hiển thị Màn hình Đăng Nhập (Login Page) bắt buộc
  if (!isAuthenticated || !currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(role) => {
          setIsReadOnlyMode(false);
          if (role === 'super_admin') {
            setActiveTab('SUPER_ADMIN');
            setAdminSubTab('OVERVIEW');
          } else {
            setActiveTab('GRID');
          }
        }}
      />
    );
  }

  // 2. Nếu tài khoản trường học bị khóa hoặc hết hạn sử dụng -> Chặn truy cập và hiển thị màn hình cảnh báo
  if (isSchoolBlocked && !isReadOnlyMode) {
    return (
      <>
        <AccessBlockedScreen
          user={currentUser}
          school={currentSchool}
          reason={blockedReason || undefined}
          onRetry={verifyCurrentAccess}
          onRequestRenewal={() => setIsRenewalModalOpen(true)}
          onSwitchAccount={() => setIsAccountModalOpen(true)}
          onEnterReadOnly={
            currentSchool && new Date(currentSchool.expiredAt) < new Date() && currentSchool.status !== 'inactive'
              ? () => {
                  setIsReadOnlyMode(true);
                  setActiveTab('GRID');
                }
              : undefined
          }
          onLoginSuperAdmin={async () => {
            setIsReadOnlyMode(false);
            const superAdminUser: UserProfile = {
              uid: 'USR_SUPER_ADMIN',
              email: 'admin@tkbpro.edu.vn',
              displayName: 'Super Administrator',
              role: 'super_admin',
              createdAt: new Date().toISOString(),
            };
            await switchDemoUser(superAdminUser);
            setActiveTab('SUPER_ADMIN');
            setAdminSubTab('OVERVIEW');
          }}
        />
        {currentSchool && currentUser && (
          <RenewalRequestModal
            isOpen={isRenewalModalOpen}
            onClose={() => setIsRenewalModalOpen(false)}
            school={currentSchool}
            user={currentUser}
            onSuccess={() => {
              verifyCurrentAccess();
              loadSchoolRenewalRequests();
            }}
          />
        )}
        <AccountLoginModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          currentUser={currentUser}
          onSelectUser={async (u) => {
            setIsReadOnlyMode(false);
            await switchDemoUser(u);
            if (u.role === 'super_admin') {
              setActiveTab('SUPER_ADMIN');
              setAdminSubTab('OVERVIEW');
            } else {
              setActiveTab('GRID');
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans text-slate-900">
      {/* MOBILE HEADER (Hiện khi màn hình nhỏ) */}
      <div className="lg:hidden bg-slate-950 text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight">TKB Engine Pro</div>
            <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
              {currentUser?.role === 'super_admin' ? 'Quản Trị Hệ Thống Toàn Quốc' : (currentSchool?.schoolName || 'THPT Chu Văn An')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 text-indigo-300 text-xs font-bold flex items-center gap-1"
          >
            <UserCheck className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* BACKDROP CHO MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* SIDEBAR BÊN TRÁI - GIAO DIỆN TỐI ƯU ĐỘ TƯƠNG PHẢN CAO */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-72 lg:w-80 bg-slate-950 text-slate-100 border-r border-slate-800 flex flex-col z-50 transition-transform duration-200 ease-in-out shrink-0 overflow-y-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header / Brand & Tenant Info */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg tracking-tight text-white">TKB ENGINE</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-500 text-white">
                  PRO
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-400 truncate">
                {currentUser?.role === 'super_admin' ? 'Quản Trị Hệ Thống Toàn Quốc' : (currentSchool?.schoolName || 'THPT Chu Văn An')}
              </p>
            </div>
          </div>

          {/* User Account / Tenant Chip */}
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {currentUser.role === 'super_admin' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-slate-950 uppercase flex items-center gap-1 shadow-xs">
                    <Shield className="w-3 h-3" /> Super Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-600 text-white uppercase flex items-center gap-1 shadow-xs">
                    <Building2 className="w-3 h-3" /> School Admin
                  </span>
                )}
                {currentSchool && (
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[100px]">
                    {currentSchool.schoolId}
                  </span>
                )}
              </div>
            </div>

            <div className="text-xs font-bold text-white truncate">
              {currentUser.email}
            </div>

            {/* User action buttons: Switch Account & Logout */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800">
              <button
                onClick={() => setIsAccountModalOpen(true)}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Đổi quyền / Đổi trường học"
              >
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Đổi Quyền</span>
              </button>
              <button
                onClick={logout}
                className="py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-100 text-[11px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng Xuất</span>
              </button>
            </div>
          </div>

          {/* Badges tính năng */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-950 text-indigo-300 border border-indigo-700">
              CSP + Genetic
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
              <Database className="w-2.5 h-2.5" /> Multi-Tenant Ready
            </span>
          </div>
        </div>

        {/* SECTION 1: MENU ĐIỀU HƯỚNG CHÍNH */}
        <div className="p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
            Menu Chức Năng
          </div>

          {navMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              (item.id === 'SUPER_ADMIN_OVERVIEW' && activeTab === 'SUPER_ADMIN' && adminSubTab === 'OVERVIEW') ||
              (item.id === 'SUPER_ADMIN_SCHOOLS' && activeTab === 'SUPER_ADMIN' && adminSubTab === 'SCHOOLS') ||
              (item.id === 'SUPER_ADMIN_REQUESTS' && activeTab === 'SUPER_ADMIN' && adminSubTab === 'REQUESTS') ||
              (item.id === 'SUPER_ADMIN_USERS' && activeTab === 'SUPER_ADMIN' && adminSubTab === 'USERS') ||
              (item.id === activeTab && !String(item.id).startsWith('SUPER_ADMIN_'));

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'SUPER_ADMIN_OVERVIEW') {
                    setActiveTab('SUPER_ADMIN');
                    setAdminSubTab('OVERVIEW');
                  } else if (item.id === 'SUPER_ADMIN_SCHOOLS') {
                    setActiveTab('SUPER_ADMIN');
                    setAdminSubTab('SCHOOLS');
                  } else if (item.id === 'SUPER_ADMIN_REQUESTS') {
                    setActiveTab('SUPER_ADMIN');
                    setAdminSubTab('REQUESTS');
                  } else if (item.id === 'SUPER_ADMIN_USERS') {
                    setActiveTab('SUPER_ADMIN');
                    setAdminSubTab('USERS');
                  } else {
                    setActiveTab(item.id);
                    if (item.id === 'BACKUP') {
                      setIsBackupModalOpen(true);
                    }
                  }
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
                  <span>{item.label}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    isActive ? 'bg-white/20 text-white' : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* SECTION 2: TIỆN ÍCH DƯỚI CÙNG Ở SIDEBAR: SAO LƯU DỮ LIỆU */}
        <div className="p-3 border-t border-slate-800/80 mt-auto bg-slate-900/50">
          <button
            onClick={() => {
              setActiveTab('BACKUP');
              setIsBackupModalOpen(true);
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all text-left bg-gradient-to-r from-indigo-900/80 to-slate-900 text-indigo-200 hover:text-white hover:from-indigo-800 hover:to-indigo-950 border border-indigo-700/60 shadow-md cursor-pointer group"
            title="Mở bảng điều khiển Sao lưu và Khôi phục dữ liệu qua file JSON"
          >
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
              <span>Sao lưu dữ liệu</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-600 text-white">
              JSON
            </span>
          </button>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-medium bg-slate-950">
          <span>TKB Engine Pro</span>
          <button
            onClick={logout}
            className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* KHÔNG GIAN NỘI DUNG CHÍNH (MAIN CONTENT AREA) */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-100 overflow-y-auto">
        {/* BANNER 1: CẢNH BÁO CHẾ ĐỘ CHỈ ĐỌC KHI ĐÃ HẾT HẠN */}
        {isReadOnlyMode && (
          <div className="bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 text-white px-6 py-3.5 font-semibold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border-b border-rose-800 animate-fade-in">
            <span className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-200 animate-bounce" />
              <span>
                <strong>Chế độ Chỉ Đọc (Read-only):</strong> Tài khoản của trường <strong>{currentSchool?.schoolName}</strong> đã hết hạn sử dụng. Bạn có thể xem Thời khóa biểu nhưng không thể thay đổi dữ liệu hoặc đồng bộ Firebase.
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsRenewalModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-white text-rose-900 hover:bg-slate-100 font-black transition-all text-xs cursor-pointer shadow-md flex items-center gap-1.5 hover:scale-105"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Tạo Yêu Cầu Gia Hạn</span>
              </button>
              <button
                onClick={() => setIsAccountModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-white font-bold transition-all text-xs cursor-pointer"
              >
                Đổi Tài Khoản
              </button>
            </div>
          </div>
        )}

        {/* BANNER 2: CẢNH BÁO HẾT HẠN KHI CÒN <= 5 NGÀY */}
        {!isReadOnlyMode && (() => {
          const schoolExpiryDate = currentSchool?.expiredAt ? new Date(currentSchool.expiredAt) : null;
          const isSchoolExpired = schoolExpiryDate ? schoolExpiryDate < new Date() && schoolExpiryDate.getFullYear() < 2090 : false;
          const daysUntilExpiry = schoolExpiryDate && !isSchoolExpired && schoolExpiryDate.getFullYear() < 2090
            ? Math.ceil((schoolExpiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;
          const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 5 && daysUntilExpiry >= 0;

          if (!isExpiringSoon) return null;

          return (
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 px-6 py-3 font-semibold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border-b border-amber-600/50 animate-fade-in">
              <span className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-slate-950 animate-bounce" />
                <span>
                  <strong>Cảnh Báo Hết Hạn:</strong> Bản quyền của trường <strong>{currentSchool?.schoolName}</strong> sẽ hết hạn trong <strong>{daysUntilExpiry === 0 ? 'hôm nay' : `${daysUntilExpiry} ngày nữa`}</strong> ({schoolExpiryDate?.toLocaleDateString('vi-VN')}). Hãy tạo yêu cầu gia hạn ngay để không bị gián đoạn hoạt động.
                </span>
              </span>
              <button
                onClick={() => setIsRenewalModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-black transition-all text-xs shrink-0 cursor-pointer shadow-md flex items-center gap-1.5 hover:scale-105"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Tạo Yêu Cầu Gia Hạn</span>
              </button>
            </div>
          );
        })()}

        {/* TOP BAR TRONG MAIN CONTENT */}
        <div className="bg-white border-b border-slate-300 px-6 py-4 sticky top-0 z-20 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-950 tracking-tight">
                {activeTab === 'SUPER_ADMIN' && 'Quản Lý Cấp Phép & Danh Sách Trường Học (Super Admin)'}
                {activeTab === 'DISTRIBUTOR' && 'Phân Phối Thời Khóa Biểu & Tinh Chỉnh Theo Lớp'}
                {activeTab === 'MERGED' && 'Quản Lý Ghép Lớp & Đồng Giảng Dạy (Co-teaching)'}
                {activeTab === 'GRID' && 'Thời Khóa Biểu Tuần Toàn Trường'}
                {activeTab === 'INPUT' && 'Nhập & Quản Lý Thông Tin (Giáo Viên, Môn Học, Lớp Học)'}
                {activeTab === 'VALIDATION' && 'Kiểm Tra Xung Đột & Khối Lượng Giảng Dạy'}
                {activeTab === 'DATA' && 'Quản Lý Phân Công Giảng Dạy & Hạ Tầng'}
                {activeTab === 'EXPORT' && 'Xuất File Thời Khóa Biểu & Bản Xem Trước (Mẫu Bản In)'}
                {activeTab === 'BACKUP' && 'Quản Lý Sao Lưu & Khôi Phục Dữ Liệu Hệ Thống'}
                {activeTab === 'GUIDE' && 'Hướng Dẫn Sử Dụng & Video Trực Quan'}
              </h2>
            </div>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">
              {activeTab === 'SUPER_ADMIN' && 'Cấp phép trường mới, sinh mã schoolId động, bật/tắt kích hoạt và kiểm soát thời hạn bản quyền.'}
              {activeTab === 'DISTRIBUTOR' && 'Giao diện phân phối TKB trực quan theo từng lớp học, gán môn, dồn tiết và khóa Chào cờ.'}
              {activeTab === 'MERGED' && 'Cấu hình 1 giáo viên dạy nhiều lớp cùng lúc (không báo trùng tiết) hoặc 2+ giáo viên cùng dạy 1 tiết.'}
              {activeTab === 'GRID' && 'Lưới thời khóa biểu tương tác hỗ trợ Tiết ghép N Lớp & Co-teaching N Giáo viên.'}
              {activeTab === 'INPUT' && 'Quản lý riêng lẻ 3 module: Danh sách Giáo viên (kèm mã GV), Môn học (mã môn, viết tắt) và Lớp học (mã lớp).'}
              {activeTab === 'VALIDATION' && 'Kiểm tra 100% ràng buộc cứng (trùng giáo viên, lớp, phòng) và đo lường điểm mềm.'}
              {activeTab === 'DATA' && 'Danh mục giáo viên, phòng thực hành, sân thể chất và các tiết phân công.'}
              {activeTab === 'EXPORT' && 'Bản xem trước ma trận đầy đủ các lớp theo cột, hỗ trợ in A4 khổ ngang và xuất Excel (.xls / .csv).'}
              {activeTab === 'BACKUP' && 'Xuất và nhập toàn bộ 6 collections Firestore NoSQL thông qua file chuẩn JSON an toàn.'}
              {activeTab === 'GUIDE' && 'Toàn bộ bài giảng hướng dẫn từng bước và video YouTube minh họa cho toàn bộ quy trình xếp TKB.'}
            </p>
          </div>

          {/* Trạng thái tóm tắt nhanh trên TopBar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* User Profile Pill & Logout Button */}
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold truncate max-w-[140px] sm:max-w-[180px]">
                {currentUser.email}
              </span>
              <button
                onClick={logout}
                className="ml-1 p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Firebase Status Badge */}
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-300 text-indigo-950">
              <Database className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-black">
                {isCloudLoading ? 'Đang kết nối Firebase...' : 'Firebase: thoikhoabieu-e731c'}
              </span>
            </div>

            <button
              onClick={handleSaveToFirestore}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs cursor-pointer transition-all"
              title="Lưu đồng bộ toàn bộ dữ liệu lên Firebase Firestore"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Đồng Bộ Firebase</span>
            </button>

            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-black text-emerald-950">
                100% Ràng Buộc
              </span>
            </div>

            <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-300">
              <Award className="w-4 h-4 text-purple-700" />
              <span className="text-xs font-black text-purple-950">
                Fitness: {fitness.fitnessScore}/100
              </span>
            </div>
          </div>
        </div>

        {/* THÔNG BÁO FIREBASE NẾU CÓ */}
        {firebaseNotification && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-100 border-2 border-emerald-500 text-emerald-950 text-xs font-bold flex items-center justify-between shadow-xs">
            <span>{firebaseNotification}</span>
            <button
              onClick={() => setFirebaseNotification(null)}
              className="text-xs font-black ml-3 px-2 py-0.5 rounded bg-emerald-200 hover:bg-emerald-300 cursor-pointer"
            >
              ✕ Đóng
            </button>
          </div>
        )}

        {/* VÙNG CHỨA CÁC TAB NỘI DUNG */}
        <div className="p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-6">
          {/* TAB SUPER ADMIN: QUẢN LÝ CẤP PHÉP TRƯỜNG HỌC */}
          {activeTab === 'SUPER_ADMIN' && currentUser?.role === 'super_admin' && (
            <SuperAdminDashboard
              currentSchoolId={currentSchool?.schoolId}
              selectedAdminTab={adminSubTab}
              onSelectSchool={(sc) => {
                setDirectSchool(sc);
                setActiveTab('GRID');
              }}
              onSwitchToSuperAdmin={() => {
                setActiveTab('SUPER_ADMIN');
                setAdminSubTab('OVERVIEW');
              }}
            />
          )}

          {/* TAB 0: PHÂN THỜI KHÓA BIỂU THEO LỚP & CHỌN GV/TIẾT */}
          {activeTab === 'DISTRIBUTOR' && (
            <ClassScheduleDistributor
              slots={slots}
              setSlots={setSlots}
              classes={classes}
              teachers={teachers}
              rooms={rooms}
              subjects={subjects}
              assignments={assignments}
              onDataUpdated={() => {
                // Tự động kiểm tra
              }}
            />
          )}

          {/* TAB 0.5: GHÉP LỚP & CO-TEACHING */}
          {activeTab === 'MERGED' && (
            <MergedClassManager
              classes={classes}
              teachers={teachers}
              subjects={subjects}
              rooms={rooms}
              assignments={assignments}
              setAssignments={setAssignments}
              slots={slots}
              setSlots={setSlots}
              onDataUpdated={() => {
                // Tự động kiểm tra
              }}
            />
          )}

          {/* TAB 1: THỜI KHÓA BIỂU TUẦN */}
          {activeTab === 'GRID' && (
            <TimetableGrid
              slots={slots}
              classes={classes}
              teachers={teachers}
              rooms={rooms}
              subjects={subjects}
              isCloudLoading={isCloudLoading}
            />
          )}

          {/* TAB 1.5: THỜI KHÓA BIỂU GIÁO VIÊN */}
          {activeTab === 'TEACHER_TIMETABLE' && (
            <TeacherTimetableView
              teachers={teachers}
              classes={classes}
              subjects={subjects}
              rooms={rooms}
              assignments={assignments}
              slots={slots}
              onSlotsUpdated={(newSlots) => setSlots(newSlots)}
              onNavigateToDistributor={(classId) => {
                setActiveTab('DISTRIBUTOR');
              }}
            />
          )}

          {/* TAB 2: NHẬP THÔNG TIN (CHỈ GỒM 3 MODULE RIÊNG LẺ: GIÁO VIÊN, MÔN HỌC, LỚP HỌC) */}
          {activeTab === 'INPUT' && (
            <DataEntryView
              teachers={teachers}
              setTeachers={setTeachers}
              subjects={subjects}
              setSubjects={setSubjects}
              classes={classes}
              setClasses={setClasses}
              assignments={assignments}
              setAssignments={setAssignments}
              slots={slots}
              setSlots={setSlots}
              onDataUpdated={() => {
                runCSPSolver();
              }}
            />
          )}

          {/* TAB 3: KIỂM TRA & CẢNH BÁO */}
          {activeTab === 'VALIDATION' && (
            <ValidationReportView
              conflicts={conflicts}
              discrepancies={discrepancies}
              fitness={fitness}
            />
          )}

          {/* TAB 4: DỮ LIỆU & PCGD */}
          {activeTab === 'DATA' && (
            <DataManagementView
              assignments={assignments}
              setAssignments={setAssignments}
              teachers={teachers}
              classes={classes}
              rooms={rooms}
              subjects={subjects}
              slots={slots}
              setSlots={setSlots}
              onDataUpdated={() => {
                runCSPSolver();
              }}
            />
          )}

          {/* TAB 5: XUẤT & IN FILE THỜI KHÓA BIỂU (CHUẨN HÌNH ẢNH SA THẦY) */}
          {activeTab === 'EXPORT' && (
            <ExportTimetableView
              slots={slots}
              classes={classes}
              teachers={teachers}
              subjects={subjects}
              initialConfig={exportConfig}
              onConfigSaved={setExportConfig}
            />
          )}

          {/* TAB 6: SAO LƯU VÀ KHÔI PHỤC DỮ LIỆU JSON */}
          {activeTab === 'BACKUP' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        Quản Lý Sao Lưu & Khôi Phục Dữ Liệu
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        TKB Engine Pro • Cơ sở dữ liệu Firebase Firestore NoSQL
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsBackupModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Mở Bảng Điều Khiển Sao Lưu / Khôi Phục</span>
                  </button>
                </div>

                {/* Thống kê tài nguyên hệ thống hiện tại */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-indigo-700">{(teachers || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Giáo viên</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-emerald-700">{(classes || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Lớp học</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-amber-700">{(subjects || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Môn học</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-cyan-700">{(rooms || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Phòng học</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-purple-700">{(assignments || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Phân công (PCGD)</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                    <div className="text-2xl font-black text-rose-700">{(slots || []).length}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">Tiết TKB</div>
                  </div>
                </div>

                {/* Hướng dẫn an toàn dữ liệu */}
                <div className="mt-6 p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 space-y-2">
                  <h4 className="font-black text-indigo-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-700" />
                    Chính Sách An Toàn & Chuẩn Định Dạng File Sao Lưu (.json)
                  </h4>
                  <p className="font-medium text-indigo-900/90 leading-relaxed">
                    Hệ thống đóng gói toàn vẹn dữ liệu từ 6 collections chính trên Firebase Firestore NoSQL:
                    Giáo viên, Lớp học, Môn học, Phòng học, Phân công giảng dạy và Toàn bộ lưới tiết Thời khóa biểu.
                    Khi khôi phục, bạn có thể lựa chọn <strong>Cập nhật gộp (MERGE)</strong> để bảo vệ dữ liệu hiện có
                    hoặc <strong>Ghi đè toàn bộ (OVERWRITE)</strong> để làm mới hoàn toàn hệ thống.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB SCHOOL_ACCOUNT: QUẢN LÝ TÀI KHOẢN VÀ YÊU CẦU GIA HẠN */}
          {activeTab === 'SCHOOL_ACCOUNT' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16 font-sans">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center gap-3 pb-6 border-b border-slate-800">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Quản Lý Tài Khoản & Bản Quyền Trường</h2>
                    <p className="text-xs text-slate-400">Xem thông tin định danh tenant, mã School ID và yêu cầu gia hạn gói dịch vụ.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Tên Trường Học</span>
                    <div className="text-sm font-bold text-white">{currentSchool?.schoolName || 'Chưa cập nhật'}</div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Mã Định Danh (School ID)</span>
                    <div className="text-sm font-mono font-bold text-indigo-400">{currentSchool?.schoolId || 'N/A'}</div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Người Đại Diện / Hiệu Trưởng</span>
                    <div className="text-sm font-bold text-white">{currentSchool?.principalName || currentSchool?.representativeName || 'Chưa cập nhật'}</div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Email Đăng Nhập Quản Trị</span>
                    <div className="text-sm font-bold text-white">{currentSchool?.adminEmail || currentUser?.email || 'N/A'}</div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Số Điện Thoại Liên Hệ</span>
                    <div className="text-sm font-bold text-white">{currentSchool?.phone || 'Chưa cập nhật'}</div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-slate-400 block font-semibold">Tỉnh / Thành Phố</span>
                    <div className="text-sm font-bold text-white">{currentSchool?.province || 'Hà Nội'}</div>
                  </div>
                </div>

                {/* KHỐI TRẠNG THÁI BẢN QUYỀN VÀ HẠN SỬ DỤNG CÓ CẢNH BÁO */}
                {(() => {
                  const schoolExpDate = currentSchool?.expiredAt ? new Date(currentSchool.expiredAt) : null;
                  const isPerm = schoolExpDate ? schoolExpDate.getFullYear() >= 2090 : false;
                  const isExp = schoolExpDate && !isPerm ? schoolExpDate < new Date() : false;
                  const daysLeft = schoolExpDate && !isPerm
                    ? Math.ceil((schoolExpDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isExpSoon = !isPerm && daysLeft !== null && daysLeft < 5 && daysLeft >= 0;

                  return (
                    <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900 to-purple-950/90 p-6 sm:p-7 rounded-3xl border border-indigo-500/30 space-y-4 shadow-xl">
                      {/* CẢNH BÁO SẮP HẾT HẠN (< 5 NGÀY) HIỂN THỊ NỔI BẬT */}
                      {isExpSoon && (
                        <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/10 animate-pulse">
                          <div className="flex items-start sm:items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/30 text-amber-300 border border-amber-500/60 flex items-center justify-center shrink-0">
                              <AlertTriangle className="w-5 h-5 text-amber-300" />
                            </div>
                            <div>
                              <div className="font-black text-amber-300 text-sm flex items-center gap-2">
                                <span>⚠️ CẢNH BÁO: TÀI KHOẢN SẮP HẾT HẠN ({daysLeft === 0 ? 'HẾT HẠN HÔM NAY' : `CÒN ${daysLeft} NGÀY`})!</span>
                              </div>
                              <p className="text-[11px] text-amber-100/90 mt-0.5 leading-relaxed">
                                Bản quyền của trường sẽ hết hạn vào ngày <strong>{schoolExpDate?.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>. Quản trị viên vui lòng gửi yêu cầu gia hạn ngay để không bị gián đoạn hoạt động.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsRenewalModalOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer shrink-0 shadow-md flex items-center justify-center gap-1.5 hover:scale-105 active:scale-95"
                          >
                            <Sparkles className="w-4 h-4 text-slate-950" />
                            <span>Gia Hạn Ngay</span>
                          </button>
                        </div>
                      )}

                      {/* CẢNH BÁO ĐÃ HẾT HẠN */}
                      {isExp && (
                        <div className="p-4 rounded-2xl bg-rose-500/15 border-2 border-rose-500/50 text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-rose-500/10">
                          <div className="flex items-start sm:items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-rose-500/30 text-rose-300 border border-rose-500/60 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-5 h-5 text-rose-300" />
                            </div>
                            <div>
                              <div className="font-black text-rose-300 text-sm">
                                ⛔ CẢNH BÁO: TÀI KHOẢN ĐÃ HẾT HẠN SỬ DỤNG!
                              </div>
                              <p className="text-[11px] text-rose-100/90 mt-0.5 leading-relaxed">
                                Bản quyền hệ thống của trường đã hết hạn vào ngày <strong>{schoolExpDate?.toLocaleDateString('vi-VN')}</strong>. Vui lòng tạo yêu cầu gia hạn để tiếp tục sử dụng.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsRenewalModalOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all cursor-pointer shrink-0 shadow-md flex items-center justify-center gap-1.5 hover:scale-105 active:scale-95"
                          >
                            <Sparkles className="w-4 h-4 text-amber-300" />
                            <span>Gia Hạn Ngay</span>
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* BADGE TRẠNG THÁI */}
                            {isExp ? (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                <span>Trạng Thái: Đã hết hạn</span>
                              </span>
                            ) : isExpSoon ? (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/50 uppercase tracking-wide flex items-center gap-1.5 shadow-sm animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span>Trạng Thái: Sắp hết hạn (Còn {daysLeft === 0 ? 'hôm nay' : `${daysLeft} ngày`})</span>
                              </span>
                            ) : currentSchool?.planStatus === 'renewed' || currentSchool?.renewalPackageName ? (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span>Trạng Thái: Đã gia hạn ({currentSchool.renewalPackageName || 'Gói chính thức'})</span>
                              </span>
                            ) : currentSchool?.plan === 'trial' ? (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Trạng Thái: Dùng thử 14 ngày</span>
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Trạng Thái: Bản quyền chính thức</span>
                              </span>
                            )}

                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              currentSchool?.status === 'active' && !isExp
                                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-700/50'
                                : 'bg-rose-950/60 text-rose-400 border-rose-700/50'
                            }`}>
                              {currentSchool?.status === 'active' && !isExp ? 'Đang hoạt động' : isExp ? 'Hết hạn bản quyền' : 'Tạm khóa'}
                            </span>
                          </div>

                          <div className="pt-1">
                            <div className="text-xs text-slate-400 font-medium">Thời hạn bản quyền hệ thống:</div>
                            <h4 className="text-base sm:text-lg font-black text-white flex items-center gap-2 mt-0.5 flex-wrap">
                              <Calendar className="w-5 h-5 text-indigo-400" />
                              <span>
                                Hạn sử dụng:{' '}
                                {currentSchool?.expiredAt
                                  ? isPerm
                                    ? 'Vĩnh viễn (Không giới hạn thời gian)'
                                    : schoolExpDate?.toLocaleDateString('vi-VN', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                      })
                                  : 'Không giới hạn'}
                              </span>
                              {isExpSoon && (
                                <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-amber-500 text-slate-950 animate-pulse shadow-sm">
                                  ⚠️ Sắp hết hạn (Còn {daysLeft === 0 ? 'hôm nay' : `${daysLeft} ngày`})
                                </span>
                              )}
                              {isExp && (
                                <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-rose-600 text-white shadow-sm">
                                  Đã hết hạn
                                </span>
                              )}
                            </h4>
                          </div>

                          {currentSchool?.lastRenewedAt && (
                            <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span>Thời điểm gia hạn gần nhất: <strong className="text-slate-200">{new Date(currentSchool.lastRenewedAt).toLocaleDateString('vi-VN')}</strong></span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setIsRenewalModalOpen(true)}
                          className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Tạo Yêu Cầu Gia Hạn</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* BẢNG LỊCH SỬ CÁC YÊU CẦU GIA HẠN GẦN ĐÂY */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 font-black text-sm text-white">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      <span>Lịch Sử Các Yêu Cầu Gia Hạn Gần Đây</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-bold">
                        {schoolRenewalRequests.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadSchoolRenewalRequests}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1 text-xs"
                        title="Làm mới lịch sử yêu cầu"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRenewalRequests ? 'animate-spin text-indigo-400' : ''}`} />
                        <span className="hidden sm:inline">Làm Mới</span>
                      </button>
                      <button
                        onClick={() => setIsRenewalModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tạo Yêu Cầu Mới</span>
                      </button>
                    </div>
                  </div>

                  {isLoadingRenewalRequests ? (
                    <div className="p-8 text-center space-y-2 bg-slate-950/60 rounded-2xl border border-slate-800">
                      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                      <div className="text-xs text-slate-400">Đang tải lịch sử yêu cầu gia hạn...</div>
                    </div>
                  ) : schoolRenewalRequests.length === 0 ? (
                    <div className="p-8 text-center space-y-2 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-xs text-slate-400">
                      <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                      <div className="font-bold text-slate-300">Chưa có yêu cầu gia hạn nào</div>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Khi bạn gửi yêu cầu gia hạn bản quyền, tiến độ xét duyệt và thông tin chi tiết sẽ được ghi nhận tại đây.
                      </p>
                      <button
                        onClick={() => setIsRenewalModalOpen(true)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Gửi Yêu Cầu Gia Hạn Đầu Tiên</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold text-[11px] uppercase">
                            <th className="py-3 px-4">Thời Gian Gửi</th>
                            <th className="py-3 px-4">Gói Yêu Cầu</th>
                            <th className="py-3 px-4">SĐT Liên Hệ</th>
                            <th className="py-3 px-4">Ghi Chú / Mã GD</th>
                            <th className="py-3 px-4 text-center">Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {schoolRenewalRequests.map((req) => (
                            <tr key={req.id || req.createdAt} className="hover:bg-slate-900/50 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-300">
                                <div>{new Date(req.createdAt).toLocaleDateString('vi-VN')}</div>
                                <div className="text-[10px] text-slate-500">{new Date(req.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                              </td>
                              <td className="py-3 px-4 font-bold text-indigo-300">
                                <span className="bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded text-[11px]">
                                  {req.packageName || `${req.months} Tháng`}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono font-medium text-slate-300">
                                {req.phone}
                              </td>
                              <td className="py-3 px-4 text-slate-300 max-w-xs space-y-1">
                                {req.notes && (
                                  <div className="text-[11px] text-slate-300" title={req.notes}>
                                    <span className="text-slate-500 font-semibold text-[10px]">Ghi chú: </span>
                                    {req.notes}
                                  </div>
                                )}
                                {req.responseMessage && (
                                  <div className="p-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-[10px] text-indigo-200">
                                    <span className="font-bold text-indigo-400 block">Phản hồi từ Super Admin:</span>
                                    <span>{req.responseMessage}</span>
                                  </div>
                                )}
                                {!req.notes && !req.responseMessage && (
                                  <span className="italic text-slate-600 text-[11px]">Không có</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {req.status === 'approved' ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span>Đã Duyệt</span>
                                    </span>
                                    {req.reviewedAt && (
                                      <div className="text-[9px] text-slate-500">{new Date(req.reviewedAt).toLocaleDateString('vi-VN')}</div>
                                    )}
                                  </div>
                                ) : req.status === 'rejected' ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-700">
                                      <X className="w-3 h-3 text-rose-400" />
                                      <span>Bị Từ Chối</span>
                                    </span>
                                    {req.reviewedAt && (
                                      <div className="text-[9px] text-slate-500">{new Date(req.reviewedAt).toLocaleDateString('vi-VN')}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
                                    <Clock className="w-3 h-3 text-amber-400" />
                                    <span>Đang Chờ Duyệt</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: HƯỚNG DẪN SỬ DỤNG VÀ VIDEO TRỰC QUAN */}
          {activeTab === 'GUIDE' && (
            <UserGuideView
              onNavigateToTab={(tab) => {
                setActiveTab(tab);
                if (tab === 'BACKUP') {
                  setIsBackupModalOpen(true);
                }
              }}
            />
          )}
        </div>
      </main>

      {/* CỬA SỔ MODAL QUẢN LÝ SAO LƯU & KHÔI PHỤC DỮ LIỆU */}
      <BackupManagerModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreSuccess={handleRestoreSuccess}
        schoolId={currentSchool?.schoolId}
      />

      {/* CỬA SỔ MODAL TẠO YÊU CẦU GIA HẠN BẢN QUYỀN */}
      {currentSchool && currentUser && (
        <RenewalRequestModal
          isOpen={isRenewalModalOpen}
          onClose={() => setIsRenewalModalOpen(false)}
          school={currentSchool}
          user={currentUser}
          onSuccess={() => {
            loadSchoolRenewalRequests();
            verifyCurrentAccess();
          }}
        />
      )}
    </div>
  );
}
