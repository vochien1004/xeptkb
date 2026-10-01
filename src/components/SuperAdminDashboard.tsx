/**
 * SuperAdminDashboard.tsx - Màn hình Quản Lý Trường Học Dành Cho Super Admin
 * Hỗ trợ Duyệt trường mới đăng ký (Realtime Sync), cấp quyền, sinh schoolId động,
 * gia hạn, đổi mật khẩu và khoá/mở khoá trường học.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Key,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  School as SchoolIcon,
  Edit3,
  ArrowRight,
  Check,
  LogOut,
  LayoutGrid,
  Infinity as InfinityIcon,
  UserCheck,
  UserPlus,
  Award,
  BadgeCheck,
  Users,
  MessageSquare,
  Send,
  X,
  FileText,
} from 'lucide-react';
import { School, SchoolStatus, SchoolPlan, CreateSchoolPayload, UserProfile, RenewalRequest } from '../types/school';
import {
  getAllSchools,
  createSchool,
  updateSchoolStatus,
  updateSchoolExpiry,
  updateSchool,
  resetSchoolPassword,
  deleteSchool,
  generateSchoolId,
} from '../services/schoolService';
import {
  subscribeToRenewalRequestsRealtime,
  fetchAllRenewalRequests,
  reviewRenewalRequest,
  sendRenewalResponse,
} from '../services/renewalService';
import {
  subscribeToSchoolsRealtime,
  approveSchoolAccount,
} from '../services/authService';
import {
  getSystemUsers,
  updateUserProfile,
  getSystemAnalytics,
  deleteUserAccount,
  cleanupOrphanedAccounts,
} from '../services/superAdminService';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  currentSchoolId?: string;
  onSelectSchool?: (school: School) => void;
  onSwitchToSuperAdmin?: () => void;
  selectedAdminTab?: 'OVERVIEW' | 'SCHOOLS' | 'REQUESTS' | 'LICENSE' | 'USERS' | 'SETTINGS';
}

export const SuperAdminDashboard: React.FC<Props> = ({
  currentSchoolId,
  onSelectSchool,
  selectedAdminTab,
}) => {
  const { user: currentUser, logout } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'pending' | 'inactive' | 'expired'>('ALL');

  // Sub Tab Selector
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'SCHOOLS' | 'REQUESTS' | 'LICENSE' | 'USERS' | 'SETTINGS'>('OVERVIEW');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<UserProfile | null>(null);
  const [editUserDisplayName, setEditUserDisplayName] = useState('');
  const [editUserRole, setEditUserRole] = useState<'super_admin' | 'school_admin' | 'teacher'>('school_admin');
  const [editUserSchoolId, setEditUserSchoolId] = useState('');

  // Renewal Requests State
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('ALL');

  // Review Renewal Modal State
  const [reviewingRequest, setReviewingRequest] = useState<RenewalRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'respond'>('approve');
  const [reviewResponseMessage, setReviewResponseMessage] = useState('');
  const [reviewMonths, setReviewMonths] = useState(12);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);

  // Sync subTab with parent prop
  useEffect(() => {
    if (selectedAdminTab) {
      setSubTab(selectedAdminTab);
      if (selectedAdminTab === 'USERS') {
        loadUsers();
      }
    }
  }, [selectedAdminTab]);

  // Modal Thêm trường mới
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newSchoolData, setNewSchoolData] = useState<CreateSchoolPayload>({
    schoolName: '',
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    durationMonths: 12,
    address: '',
    phone: '',
    principalName: '',
    notes: '',
  });
  const [isPermanentDuration, setIsPermanentDuration] = useState(false);

  // Modal Duyệt Trường Mới Đăng Ký
  const [approvingSchool, setApprovingSchool] = useState<School | null>(null);
  const [approveMonths, setApproveMonths] = useState(12);
  const [approvePlan, setApprovePlan] = useState<SchoolPlan>('standard');
  const [isApprovePermanent, setIsApprovePermanent] = useState(false);
  const [isApprovingSubmitting, setIsApprovingSubmitting] = useState(false);

  // Modal Thành công sau khi tạo
  const [createdSchoolSuccess, setCreatedSchoolSuccess] = useState<{
    school: School;
    user: any;
  } | null>(null);

  // Modal Gia hạn
  const [extendingSchool, setExtendingSchool] = useState<School | null>(null);
  const [extendMonths, setExtendMonths] = useState(12);
  const [isExtendPermanent, setIsExtendPermanent] = useState(false);

  // Modal Đổi mật khẩu
  const [resettingPasswordSchool, setResettingPasswordSchool] = useState<School | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isResettingPass, setIsResettingPass] = useState(false);

  // Modal Chỉnh sửa thông tin trường
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editFormData, setEditFormData] = useState<{
    schoolName: string;
    adminEmail: string;
    principalName: string;
    phone: string;
    address: string;
    notes: string;
  }>({
    schoolName: '',
    adminEmail: '',
    principalName: '',
    phone: '',
    address: '',
    notes: '',
  });
  const [isUpdatingSchool, setIsUpdatingSchool] = useState(false);

  // Trạng thái hiển thị mật khẩu
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast thông báo
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Custom confirmation modal state for browser-compatible iframe compliance
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'warning' | 'danger' | 'info';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Lắng nghe realtime danh sách trường & yêu cầu gia hạn từ Firestore
  useEffect(() => {
    loadSchools();
    loadRenewalRequests();
    const unsubscribeSchools = subscribeToSchoolsRealtime((updatedList) => {
      if (updatedList.length > 0) {
        setSchools(updatedList);
        setIsLoading(false);
      }
    });
    const unsubscribeRequests = subscribeToRenewalRequestsRealtime((requests) => {
      setRenewalRequests(requests);
      setIsRequestsLoading(false);
    });
    return () => {
      if (unsubscribeSchools) unsubscribeSchools();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, []);

  const loadRenewalRequests = async () => {
    setIsRequestsLoading(true);
    try {
      const data = await fetchAllRenewalRequests();
      setRenewalRequests(data);
    } catch (err) {
      console.warn('Lỗi tải yêu cầu gia hạn:', err);
    } finally {
      setIsRequestsLoading(false);
    }
  };

  const loadSchools = async () => {
    setIsLoading(true);
    try {
      const data = await getAllSchools();
      setSchools(data);
      // Đồng thời cập nhật danh sách users theo các trường hợp lệ
      loadUsers(data);
    } catch (err) {
      console.error('Lỗi khi tải danh sách trường:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async (customSchools?: School[]) => {
    setIsUsersLoading(true);
    try {
      const validSchools = customSchools || (schools.length > 0 ? schools : await getAllSchools());
      const data = await getSystemUsers(validSchools);
      setUsers(data);
    } catch (err: any) {
      showToast('Không thể tải danh sách tài khoản: ' + err.message, 'error');
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToEdit) return;
    try {
      const ok = await updateUserProfile(selectedUserToEdit.uid, {
        displayName: editUserDisplayName.trim(),
        role: editUserRole,
        schoolId: editUserSchoolId.trim() || undefined,
      });
      if (ok) {
        showToast('✓ Đã cập nhật phân quyền tài khoản thành công!');
        setSelectedUserToEdit(null);
        await loadUsers();
      }
    } catch (err: any) {
      showToast('Lỗi cập nhật: ' + err.message, 'error');
    }
  };

  // Xem trước schoolId khi gõ tên trường
  const previewSchoolId = useMemo(() => {
    if (!newSchoolData.schoolName) return 'chua-co-ten';
    return generateSchoolId(newSchoolData.schoolName);
  }, [newSchoolData.schoolName]);

  // Lọc danh sách trường
  const filteredSchools = useMemo(() => {
    const now = new Date();
    return schools.filter((s) => {
      const isExpired = new Date(s.expiredAt) < now;

      // Lọc trạng thái
      if (statusFilter === 'active') {
        if (s.status !== 'active' || isExpired) return false;
      } else if (statusFilter === 'pending') {
        if (s.status !== 'pending') return false;
      } else if (statusFilter === 'inactive') {
        if (s.status !== 'inactive') return false;
      } else if (statusFilter === 'expired') {
        if (!isExpired) return false;
      }

      // Lọc từ khóa
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.schoolName.toLowerCase().includes(q) ||
        s.schoolId.toLowerCase().includes(q) ||
        s.adminEmail.toLowerCase().includes(q) ||
        (s.principalName && s.principalName.toLowerCase().includes(q)) ||
        (s.representativeName && s.representativeName.toLowerCase().includes(q)) ||
        (s.province && s.province.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
      );
    });
  }, [schools, searchQuery, statusFilter]);

  const validSchoolIdSet = useMemo(() => new Set(schools.map((s) => s.schoolId)), [schools]);

  // Lọc danh sách users (Tự động loại trừ các tài khoản có trường học đã bị xóa)
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (u.role !== 'super_admin' && u.schoolId && schools.length > 0 && !validSchoolIdSet.has(u.schoolId)) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.schoolId && u.schoolId.toLowerCase().includes(q))
      );
    });
  }, [users, schools, validSchoolIdSet, searchQuery]);

  // Lọc danh sách yêu cầu gia hạn
  const filteredRequests = useMemo(() => {
    return renewalRequests.filter((req) => {
      if (requestStatusFilter !== 'ALL' && req.status !== requestStatusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        req.schoolName.toLowerCase().includes(q) ||
        req.schoolId.toLowerCase().includes(q) ||
        req.adminEmail.toLowerCase().includes(q) ||
        req.phone.toLowerCase().includes(q) ||
        (req.notes && req.notes.toLowerCase().includes(q)) ||
        (req.responseMessage && req.responseMessage.toLowerCase().includes(q)) ||
        (req.packageName && req.packageName.toLowerCase().includes(q))
      );
    });
  }, [renewalRequests, requestStatusFilter, searchQuery]);

  // Số lượng yêu cầu gia hạn đang chờ duyệt
  const pendingRenewalCount = useMemo(() => {
    return renewalRequests.filter((r) => r.status === 'pending').length;
  }, [renewalRequests]);

  // Map yêu cầu gia hạn pending theo từng trường
  const pendingRequestsBySchoolId = useMemo(() => {
    const map: Record<string, RenewalRequest[]> = {};
    renewalRequests.forEach((req) => {
      if (req.status === 'pending') {
        if (!map[req.schoolId]) map[req.schoolId] = [];
        map[req.schoolId].push(req);
      }
    });
    return map;
  }, [renewalRequests]);

  // Thống kê số lượng (KPI Cards)
  const stats = useMemo(() => {
    const now = new Date();
    const total = schools.length;
    const active = schools.filter((s) => s.status === 'active' && new Date(s.expiredAt) >= now).length;
    const pending = schools.filter((s) => s.status === 'pending').length;
    const inactive = schools.filter((s) => s.status === 'inactive').length;
    const expired = schools.filter((s) => new Date(s.expiredAt) < now && s.status !== 'inactive').length;
    const renewalPending = renewalRequests.filter((r) => r.status === 'pending').length;
    return { total, active, pending, inactive, expired, renewalPending };
  }, [schools, renewalRequests]);

  // Xử lý tạo trường mới bởi Super Admin
  const handleCreateSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolData.schoolName.trim() || !newSchoolData.adminEmail.trim()) {
      showToast('Vui lòng nhập đầy đủ Tên trường học và Email Quản trị viên!', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateSchoolPayload = {
        ...newSchoolData,
        durationMonths: isPermanentDuration ? 1200 : newSchoolData.durationMonths,
      };
      if (isPermanentDuration) {
        payload.expiredAt = '2099-12-31T23:59:59.000Z';
      }

      const result = await createSchool(payload);
      if (result.success && result.school) {
        setCreatedSchoolSuccess({
          school: result.school,
          user: result.user,
        });
        setIsAddModalOpen(false);
        setNewSchoolData({
          schoolName: '',
          adminUsername: '',
          adminEmail: '',
          adminPassword: '',
          durationMonths: 12,
          address: '',
          phone: '',
          principalName: '',
          notes: '',
        });
        setIsPermanentDuration(false);
        await loadSchools();
        showToast(`✓ Đã cấp phép và tạo trường "${result.school.schoolName}" thành công!`);
      } else {
        showToast(result.error || 'Có lỗi xảy ra khi tạo trường. Vui lòng thử lại!', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kết nối Firebase', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý Duyệt Trường Học Mới Đăng Ký
  const handleConfirmApproveSchool = async () => {
    if (!approvingSchool) return;
    setIsApprovingSubmitting(true);
    try {
      const res = await approveSchoolAccount(approvingSchool.schoolId, {
        months: approveMonths,
        plan: approvePlan,
        isPermanent: isApprovePermanent,
      });

      if (res.success && res.school) {
        setSchools((prev) =>
          prev.map((s) => (s.schoolId === approvingSchool.schoolId ? res.school! : s))
        );
        showToast(`✓ Đã duyệt và kích hoạt gói ${approvePlan.toUpperCase()} cho trường "${approvingSchool.schoolName}"!`);
        setApprovingSchool(null);
      } else {
        showToast(res.error || 'Không thể duyệt trường học.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kết nối Firebase', 'error');
    } finally {
      setIsApprovingSubmitting(false);
    }
  };

  // Xử lý Khoá / Mở khoá trường (Toggle Status)
  const handleToggleStatus = (school: School) => {
    const newStatus: SchoolStatus = school.status === 'active' ? 'inactive' : 'active';
    const actionLabel = newStatus === 'active' ? 'MỞ KHÓA' : 'TẠM KHÓA';

    setConfirmModal({
      isOpen: true,
      title: `${actionLabel} TRƯỜNG HỌC`,
      message: `Bạn có chắc chắn muốn ${actionLabel.toLowerCase()} trường "${school.schoolName}"?\n\n${
        newStatus === 'inactive'
          ? 'Khi bị khóa, tài khoản của trường sẽ KHÔNG THỂ đăng nhập vào hệ thống TKB.'
          : 'Khi mở khóa, trường sẽ được phép đăng nhập và sử dụng lại bình thường.'
      }`,
      type: 'warning',
      onConfirm: async () => {
        const ok = await updateSchoolStatus(school.schoolId, newStatus);
        if (ok) {
          setSchools((prev) =>
            prev.map((s) => (s.schoolId === school.schoolId ? { ...s, status: newStatus } : s))
          );
          showToast(`Đã ${actionLabel.toLowerCase()} trường "${school.schoolName}" thành công!`);
        } else {
          showToast('Không thể cập nhật trạng thái trường.', 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  // Xử lý Gia hạn thời gian sử dụng (Cộng dồn thời gian & Chuyển sang trạng thái Đã gia hạn)
  const handleConfirmExtend = async () => {
    if (!extendingSchool) return;
    let newExpiredAt: string;

    const pkgName = isExtendPermanent
      ? 'Gói vĩnh viễn'
      : extendMonths === 1
      ? 'Gói 1 tháng'
      : extendMonths === 3
      ? 'Gói 3 tháng'
      : extendMonths === 6
      ? 'Gói 6 tháng'
      : extendMonths === 12
      ? 'Gói 1 năm'
      : extendMonths === 24
      ? 'Gói 2 năm'
      : `Gói ${extendMonths} tháng`;

    if (isExtendPermanent) {
      newExpiredAt = '2099-12-31T23:59:59.000Z';
    } else {
      const currentExpiry = new Date(extendingSchool.expiredAt);
      const baseDate = (!isNaN(currentExpiry.getTime()) && currentExpiry > new Date())
        ? new Date(currentExpiry.getTime())
        : new Date();
      baseDate.setMonth(baseDate.getMonth() + extendMonths);
      newExpiredAt = baseDate.toISOString();
    }

    const nowIso = new Date().toISOString();
    const ok = await updateSchoolExpiry(extendingSchool.schoolId, newExpiredAt, 'active', {
      packageName: pkgName,
      planStatus: 'renewed',
      plan: 'standard',
    });

    if (ok) {
      setSchools((prev) =>
        prev.map((s) =>
          s.schoolId === extendingSchool.schoolId
            ? {
                ...s,
                expiredAt: newExpiredAt,
                status: 'active',
                planStatus: 'renewed',
                renewalPackageName: pkgName,
                plan: 'standard',
                lastRenewedAt: nowIso,
              }
            : s
        )
      );
      showToast(
        `✓ Đã gia hạn thành công (${pkgName}) cho trường "${extendingSchool.schoolName}"! Hạn mới: ${
          isExtendPermanent ? 'Vĩnh viễn' : new Date(newExpiredAt).toLocaleDateString('vi-VN')
        }`
      );
      setExtendingSchool(null);
    } else {
      showToast('Có lỗi khi gia hạn trường học.', 'error');
    }
  };

  // Mở modal xét duyệt / phản hồi yêu cầu gia hạn
  const handleOpenReviewModal = (request: RenewalRequest, action: 'approve' | 'reject' | 'respond') => {
    setReviewingRequest(request);
    setReviewAction(action);
    setReviewMonths(request.months || 12);
    setReviewResponseMessage(
      action === 'approve'
        ? (request.responseMessage || `Ban Quản Trị TKB Engine Pro đã xác nhận thanh toán và phê duyệt gia hạn ${request.packageName || `${request.months || 12} tháng`}. Chúc nhà trường năm học mới thành công!`)
        : action === 'reject'
        ? (request.responseMessage || `Yêu cầu gia hạn chưa được phê duyệt do chưa đối soát được thông tin thanh toán. Quý trường vui lòng kiểm tra lại mã giao dịch hoặc liên hệ Hotline 1900.6868.`)
        : (request.responseMessage || '')
    );
  };

  // Xử lý gửi phản hồi / xét duyệt yêu cầu gia hạn
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingRequest) return;
    setIsReviewSubmitting(true);
    try {
      const adminEmail = currentUser?.email || 'admin@tkbpro.edu.vn';
      if (reviewAction === 'respond') {
        if (!reviewResponseMessage.trim()) {
          showToast('Vui lòng nhập nội dung tin nhắn phản hồi cho trường!', 'error');
          setIsReviewSubmitting(false);
          return;
        }
        const res = await sendRenewalResponse(reviewingRequest, reviewResponseMessage.trim(), adminEmail);
        if (res.success) {
          showToast(`✓ Đã gửi tin nhắn phản hồi đến trường "${reviewingRequest.schoolName}" thành công!`);
          setReviewingRequest(null);
        } else {
          showToast('Lỗi gửi phản hồi: ' + res.error, 'error');
        }
      } else {
        const res = await reviewRenewalRequest(
          reviewingRequest,
          reviewAction,
          adminEmail,
          reviewResponseMessage.trim() || undefined,
          reviewAction === 'approve' ? reviewMonths : undefined
        );
        if (res.success) {
          if (reviewAction === 'approve') {
            showToast(`✓ Đã duyệt gia hạn ${reviewMonths} tháng cho trường "${reviewingRequest.schoolName}" thành công!`);
          } else {
            showToast(`✓ Đã từ chối yêu cầu gia hạn của trường "${reviewingRequest.schoolName}".`);
          }
          setReviewingRequest(null);
          await loadSchools();
        } else {
          showToast('Lỗi xử lý: ' + res.error, 'error');
        }
      }
    } catch (err: any) {
      showToast('Có lỗi xảy ra: ' + err.message, 'error');
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  // Xử lý Đặt lại Mật khẩu cho trường
  const handleConfirmResetPassword = async () => {
    if (!resettingPasswordSchool) return;
    setIsResettingPass(true);
    try {
      const res = await resetSchoolPassword(
        resettingPasswordSchool.schoolId,
        newPasswordInput.trim() || undefined
      );
      if (res.success) {
        setSchools((prev) =>
          prev.map((s) =>
            s.schoolId === resettingPasswordSchool.schoolId
              ? { ...s, adminPasswordInitial: res.newPassword }
              : s
          )
        );
        showToast(
          `✓ Đã đặt lại mật khẩu mới: "${res.newPassword}" cho trường "${resettingPasswordSchool.schoolName}"!`
        );
        setResettingPasswordSchool(null);
        setNewPasswordInput('');
      } else {
        showToast(res.error || 'Lỗi khi đặt lại mật khẩu.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kết nối Firebase', 'error');
    } finally {
      setIsResettingPass(false);
    }
  };

  // Mở modal Chỉnh sửa thông tin trường
  const handleOpenEditModal = (school: School) => {
    setEditingSchool(school);
    setEditFormData({
      schoolName: school.schoolName,
      adminEmail: school.adminEmail,
      principalName: school.principalName || school.representativeName || '',
      phone: school.phone || '',
      address: school.address || '',
      notes: school.notes || '',
    });
  };

  // Xử lý lưu thông tin chỉnh sửa
  const handleConfirmUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;
    if (!editFormData.schoolName.trim() || !editFormData.adminEmail.trim()) {
      showToast('Tên trường và Email không được để trống!', 'error');
      return;
    }

    setIsUpdatingSchool(true);
    try {
      const ok = await updateSchool(editingSchool.schoolId, {
        schoolName: editFormData.schoolName.trim(),
        adminEmail: editFormData.adminEmail.trim().toLowerCase(),
        principalName: editFormData.principalName.trim(),
        phone: editFormData.phone.trim(),
        address: editFormData.address.trim(),
        notes: editFormData.notes.trim(),
      });

      if (ok) {
        setSchools((prev) =>
          prev.map((s) =>
            s.schoolId === editingSchool.schoolId
              ? {
                  ...s,
                  schoolName: editFormData.schoolName.trim(),
                  adminEmail: editFormData.adminEmail.trim().toLowerCase(),
                  principalName: editFormData.principalName.trim(),
                  phone: editFormData.phone.trim(),
                  address: editFormData.address.trim(),
                  notes: editFormData.notes.trim(),
                }
              : s
          )
        );
        showToast(`✓ Đã cập nhật thông tin trường "${editFormData.schoolName}"!`);
        setEditingSchool(null);
      } else {
        showToast('Có lỗi xảy ra khi cập nhật trường.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi Firebase', 'error');
    } finally {
      setIsUpdatingSchool(false);
    }
  };

  // Xử lý Xóa trường học và các tài khoản liên kết
  const handleDeleteSchool = (school: School) => {
    setConfirmModal({
      isOpen: true,
      title: '⚠️ XÓA HOÀN TOÀN TRƯỜNG HỌC & TÀI KHOẢN',
      message: `CẢNH BÁO QUAN TRỌNG: Bạn có chắc chắn muốn XÓA HOÀN TOÀN trường "${school.schoolName}" (ID: ${school.schoolId}) khỏi hệ thống Cloud?\n\nThao tác này KHÔNG THỂ HOÀN TÁC. Toàn bộ dữ liệu (Giáo viên, Lớp học, Môn học, Thời khóa biểu) và TÀI KHOẢN QUẢN TRỊ gắn liền với trường sẽ bị xóa vĩnh viễn trên Firebase và trong chương trình.`,
      type: 'danger',
      onConfirm: async () => {
        const ok = await deleteSchool(school.schoolId);
        if (ok) {
          setSchools((prev) => prev.filter((s) => s.schoolId !== school.schoolId));
          setUsers((prev) => prev.filter((u) => u.schoolId !== school.schoolId && u.uid !== school.adminUid));
          showToast(`✓ Đã xóa hoàn toàn trường "${school.schoolName}" và toàn bộ tài khoản liên kết cả trên Firebase và hệ thống!`);
        } else {
          showToast('Lỗi khi xóa trường học.', 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  // Xử lý Xóa tài khoản người dùng đơn lẻ
  const handleDeleteUser = (u: UserProfile) => {
    if (u.role === 'super_admin') {
      showToast('Không thể xóa tài khoản Super Administrator tối cao!', 'error');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '⚠️ XÓA TÀI KHOẢN NGƯỜI DÙNG',
      message: `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${u.displayName || u.email}" (UID: ${u.uid})?\n\nThao tác này sẽ xóa tài khoản cả trên Firebase Firestore (/users) và trong chương trình.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteUserAccount(u.uid);
          setUsers((prev) => prev.filter((item) => item.uid !== u.uid));
          showToast(`✓ Đã xóa tài khoản "${u.displayName || u.email}" khỏi hệ thống thành công!`);
        } catch (err: any) {
          showToast('Lỗi khi xóa tài khoản: ' + err.message, 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  // Xử lý dọn dẹp hàng loạt các tài khoản có trường học đã bị xóa
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);
  const handleCleanupOrphanedUsers = async () => {
    setIsCleaningOrphans(true);
    try {
      const res = await cleanupOrphanedAccounts(schools);
      if (res.cleanedCount > 0) {
        showToast(`✓ Đã dọn dẹp ${res.cleanedCount} tài khoản thuộc các trường đã xóa khỏi Firebase và hệ thống!`);
        await loadUsers();
      } else {
        showToast('Tất cả tài khoản hiện tại đều hợp lệ và gắn đúng trường học.');
      }
    } catch (err: any) {
      showToast('Lỗi khi dọn dẹp tài khoản: ' + err.message, 'error');
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  // Sao chép thông tin bàn giao
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-fade-in">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-2xl border shadow-xl flex items-center gap-3 text-xs font-black animate-slide-in ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-500'
              : 'bg-rose-900 text-white border-rose-500'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER BANNER SUPER ADMIN */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-black tracking-wide uppercase">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Cổng Quản Trị Hệ Thống Toàn Quyền (Super Admin)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Building2 className="w-8 h-8 text-indigo-400 shrink-0" />
              <span>Quản Lý Trường Học & Cấp Phép Bản Quyền</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Trung tâm cấp mã <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-amber-300">schoolId</code> tự động, duyệt trường mới đăng ký, phân quyền tài khoản School Admin và kiểm soát trạng thái kích hoạt/khóa dịch vụ.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Nút Tạo Trường Mới */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 flex items-center gap-2.5 transition-all cursor-pointer transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              <span>Tạo Trường Mới / Cấp Tài Khoản</span>
            </button>

            {/* Nút Chuyển sang Giao diện TKB */}
            {onSelectSchool && schools.length > 0 && (
              <button
                onClick={() => {
                  const targetSchool = schools.find((s) => s.schoolId === currentSchoolId) || schools[0];
                  onSelectSchool(targetSchool);
                }}
                className="px-4 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm border border-white/20 flex items-center gap-2 transition-all cursor-pointer"
                title="Chuyển sang giao diện xem & xếp TKB"
              >
                <LayoutGrid className="w-4 h-4 text-indigo-300" />
                <span>Chuyển sang Giao diện TKB</span>
              </button>
            )}

            {/* Nút Đăng xuất */}
            <button
              onClick={logout}
              className="px-4 py-3.5 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 font-bold text-xs sm:text-sm border border-rose-500/30 flex items-center gap-2 transition-all cursor-pointer"
              title="Đăng xuất khỏi tài khoản Super Admin"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng Xuất</span>
            </button>
          </div>
        </div>
      </div>

      {/* THẺ THỐNG KÊ (STATISTICS KPI CARDS - 6 CỘT) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Tổng số trường */}
        <div
          onClick={() => {
            setSubTab('SCHOOLS');
            setStatusFilter('ALL');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            subTab === 'SCHOOLS' && statusFilter === 'ALL'
              ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Tổng Số Trường</span>
            <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{stats.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Toàn bộ trên Firestore</div>
        </div>

        {/* Card 2: Đang Hoạt Động (Active) */}
        <div
          onClick={() => {
            setSubTab('SCHOOLS');
            setStatusFilter('active');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            subTab === 'SCHOOLS' && statusFilter === 'active'
              ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">Đang Hoạt Động</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-950 mt-2">{stats.active}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">Đã kích hoạt & còn hạn</div>
        </div>

        {/* Card 3: Chờ Duyệt / Mới Đăng Ký (Pending) */}
        <div
          onClick={() => {
            setSubTab('SCHOOLS');
            setStatusFilter('pending');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none relative overflow-hidden ${
            subTab === 'SCHOOLS' && statusFilter === 'pending'
              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-300 shadow-md'
              : 'bg-white border-amber-300 hover:border-amber-400 shadow-xs'
          }`}
        >
          {stats.pending > 0 && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-amber-800 tracking-wider">Đăng Ký Mới</span>
            <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <UserPlus className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-950 mt-2">{stats.pending}</div>
          <div className="text-[10px] text-amber-700 mt-0.5 font-medium">Chờ cấp quyền & schoolId</div>
        </div>

        {/* Card 4: Yêu Cầu Gia Hạn (Renewal Requests) */}
        <div
          onClick={() => {
            setSubTab('REQUESTS');
            setRequestStatusFilter('pending');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none relative overflow-hidden ${
            subTab === 'REQUESTS'
              ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-300 shadow-md'
              : 'bg-white border-purple-300 hover:border-purple-400 shadow-xs'
          }`}
        >
          {stats.renewalPending > 0 && (
            <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-600"></span>
            </span>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-purple-900 tracking-wider">Gia Hạn Chờ Duyệt</span>
            <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-950 mt-2">{stats.renewalPending}</div>
          <div className="text-[10px] text-purple-700 mt-0.5 font-medium">{renewalRequests.length} tổng yêu cầu</div>
        </div>

        {/* Card 5: Đang Tạm Khóa (Inactive) */}
        <div
          onClick={() => {
            setSubTab('SCHOOLS');
            setStatusFilter('inactive');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            subTab === 'SCHOOLS' && statusFilter === 'inactive'
              ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-rose-800 tracking-wider">Đang Tạm Khóa</span>
            <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-950 mt-2">{stats.inactive}</div>
          <div className="text-[10px] text-rose-700 mt-0.5 font-medium">Bị dừng quyền truy cập</div>
        </div>

        {/* Card 6: Hết Hạn (Expired) */}
        <div
          onClick={() => {
            setSubTab('SCHOOLS');
            setStatusFilter('expired');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            subTab === 'SCHOOLS' && statusFilter === 'expired'
              ? 'bg-slate-100 border-slate-500 ring-2 ring-slate-300 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">Đã Hết Hạn</span>
            <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{stats.expired}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Cần gia hạn hợp đồng</div>
        </div>
      </div>

      {/* CHUYỂN PHÂN HỆ QUẢN TRỊ */}
      <div className="flex flex-wrap border-b border-slate-200 gap-2 mt-4 bg-white p-2 rounded-2xl border">
        <button
          onClick={() => setSubTab('SCHOOLS')}
          className={`flex-1 sm:flex-initial px-5 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'SCHOOLS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Quản Lý Trường Học ({filteredSchools.length})</span>
        </button>

        <button
          onClick={() => {
            setSubTab('REQUESTS');
            loadRenewalRequests();
          }}
          className={`flex-1 sm:flex-initial px-5 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'REQUESTS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Yêu Cầu Gia Hạn ({renewalRequests.length})</span>
          {pendingRenewalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
              {pendingRenewalCount} mới
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setSubTab('USERS');
            loadUsers();
          }}
          className={`flex-1 sm:flex-initial px-5 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'USERS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Quản Lý Tài Khoản ({filteredUsers.length})</span>
        </button>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={subTab === 'SCHOOLS' ? "Tìm theo tên trường, schoolId, email admin, tỉnh thành..." : "Tìm theo email, tên hiển thị, vai trò, schoolId..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs sm:text-sm font-medium transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => (subTab === 'SCHOOLS' ? loadSchools() : loadUsers())}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            title="Làm mới dữ liệu từ Firebase"
          >
            <RefreshCw className={`w-4 h-4 ${(subTab === 'SCHOOLS' ? isLoading : isUsersLoading) ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Làm Mới</span>
          </button>
        </div>
      </div>

      {/* PHÂN HỆ 1: QUẢN LÝ TRƯỜNG HỌC (SCHOOLS) */}
      {subTab === 'SCHOOLS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-900 text-white font-black text-xs uppercase flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SchoolIcon className="w-4 h-4 text-indigo-400" />
              <span>Danh Sách Trường Học ({filteredSchools.length} trường)</span>
            </span>
            <span className="text-[11px] text-amber-300 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Realtime Firestore: <code className="font-mono">/schools</code></span>
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-xs font-bold text-slate-600">Đang tải danh sách trường từ Firebase Firestore...</div>
            </div>
          ) : filteredSchools.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy trường học nào</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Không có trường nào khớp với từ khóa tìm kiếm hoặc bộ lọc hiện tại.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-extrabold text-[11px] uppercase border-b border-slate-200">
                    <th className="py-3.5 px-4">Tên Trường & Mã School ID</th>
                    <th className="py-3.5 px-4">Đại Diện & Email Admin</th>
                    <th className="py-3.5 px-4">Ngày Kích Hoạt & Hạn Dùng</th>
                    <th className="py-3.5 px-4 text-center">Trạng Thái & Gói</th>
                    <th className="py-3.5 px-4 text-center w-72">Thao Tác Quản Trị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900">
                  {filteredSchools.map((school) => {
                    const now = new Date();
                    const createdDate = new Date(school.createdAt);
                    const expiryDate = new Date(school.expiredAt);
                    const isPermanent = expiryDate.getFullYear() >= 2090;
                    const isExpired = !isPermanent && expiryDate < now;
                    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const isPasswordVisible = showPasswordMap[school.schoolId];

                    return (
                      <tr
                        key={school.schoolId}
                        className={`hover:bg-indigo-50/40 transition-colors ${
                          school.status === 'pending'
                            ? 'bg-amber-50/40'
                            : school.status === 'inactive'
                            ? 'bg-rose-50/30'
                            : ''
                        }`}
                      >
                        {/* Cột 1: Tên Trường & schoolId */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-black text-sm text-slate-950 flex items-center gap-2">
                            <span>{school.schoolName}</span>
                            {currentSchoolId === school.schoolId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-600 text-white">
                                Đang Chọn
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {school.schoolId}
                            </span>
                            <button
                              onClick={() => copyToClipboard(school.schoolId, `id_${school.schoolId}`)}
                              className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                              title="Sao chép schoolId"
                            >
                              {copiedId === `id_${school.schoolId}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {school.province && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Tỉnh/TP: {school.province}</span>
                            </div>
                          )}
                          {school.address && !school.province && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-xs">{school.address}</span>
                            </div>
                          )}
                        </td>

                        {/* Cột 2: Email Admin & Người đại diện */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{school.adminEmail}</span>
                          </div>
                          {(school.representativeName || school.principalName) && (
                            <div className="text-[11px] text-slate-600 flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Đại diện: {school.representativeName || school.principalName}</span>
                            </div>
                          )}
                          {school.phone && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{school.phone}</span>
                            </div>
                          )}
                          {school.adminPasswordInitial && (
                            <div className="flex items-center gap-2 text-[11px] pt-0.5">
                              <span className="text-slate-400 font-medium">Mật khẩu:</span>
                              <span className="font-mono font-black text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                {isPasswordVisible ? school.adminPasswordInitial : '••••••••'}
                              </span>
                              <button
                                onClick={() =>
                                  setShowPasswordMap((prev) => ({
                                    ...prev,
                                    [school.schoolId]: !prev[school.schoolId],
                                  }))
                                }
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Ẩn/Hiện mật khẩu"
                              >
                                {isPasswordVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    school.adminPasswordInitial || '',
                                    `pass_${school.schoolId}`
                                  )
                                }
                                className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                                title="Sao chép mật khẩu"
                              >
                                {copiedId === `pass_${school.schoolId}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Cột 3: Ngày kích hoạt & Thời hạn cấp phép */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="text-[11px] text-slate-500">
                            Tạo ngày: {createdDate.toLocaleDateString('vi-VN')}
                          </div>
                          <div className="font-black text-slate-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>
                              {isPermanent
                                ? 'Hạn: Vĩnh viễn'
                                : `Đến: ${expiryDate.toLocaleDateString('vi-VN')}`}
                            </span>
                          </div>
                          <div>
                            {isPermanent ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-950 border border-purple-300 inline-flex items-center gap-1">
                                <InfinityIcon className="w-3 h-3" />
                                <span>Vĩnh Viễn</span>
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-950 border border-rose-300">
                                ⚠️ Đã Hết Hạn
                              </span>
                            ) : daysLeft <= 30 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                                ⏳ Còn {daysLeft} ngày
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                ✓ Còn {daysLeft} ngày
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Cột 4: Trạng thái kích hoạt & Gói cước (Badge) */}
                        <td className="py-3.5 px-4 text-center space-y-1">
                          {school.status === 'inactive' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs">
                              <Lock className="w-3.5 h-3.5 text-rose-700" />
                              <span>Tạm Khóa</span>
                            </span>
                          ) : school.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              <span>Chờ Duyệt (Trial)</span>
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                              <span>Hết Hạn</span>
                            </span>
                          ) : school.planStatus === 'renewed' || school.renewalPackageName ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Đã gia hạn ({school.renewalPackageName || 'Gói chính thức'})</span>
                            </span>
                          ) : school.plan === 'trial' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-950 border border-blue-300 shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-blue-700" />
                              <span>Dùng thử 14 ngày</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Bản Quyền Chính Thức</span>
                            </span>
                          )}

                          {school.lastRenewedAt && (
                            <div className="text-[10px] text-slate-500 font-medium">
                              Gia hạn: {new Date(school.lastRenewedAt).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                        </td>

                        {/* Cột 5: Nút Thao tác (Actions) */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {/* Nút Duyệt nếu đang Pending */}
                            {school.status === 'pending' && (
                              <button
                                onClick={() => {
                                  setApprovingSchool(school);
                                  setApproveMonths(12);
                                  setApprovePlan('standard');
                                  setIsApprovePermanent(false);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                title="Duyệt và cấp quyền chính thức cho trường này"
                              >
                                <BadgeCheck className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                            )}

                            {/* Nút Vào TKB Trường này */}
                            {onSelectSchool && (
                              <button
                                onClick={() => onSelectSchool(school)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                                title="Truy cập giao diện xếp TKB của trường này"
                              >
                                <span>Vào TKB</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}

                            {/* Nút Khóa / Mở khóa */}
                            <button
                              onClick={() => handleToggleStatus(school)}
                              className={`p-1.5 rounded-lg border font-bold text-xs transition-all cursor-pointer ${
                                school.status === 'active'
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}
                              title={school.status === 'active' ? 'Tạm khóa quyền truy cập' : 'Mở khóa quyền truy cập'}
                            >
                              {school.status === 'active' ? (
                                <Lock className="w-3.5 h-3.5 text-amber-700" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                              )}
                            </button>

                            {/* Nút Gia hạn */}
                            <button
                              onClick={() => {
                                setExtendingSchool(school);
                                setIsExtendPermanent(false);
                                setExtendMonths(12);
                              }}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer"
                              title="Gia hạn thời gian sử dụng"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>

                            {/* Nút Đặt lại Mật khẩu */}
                            <button
                              onClick={() => {
                                setResettingPasswordSchool(school);
                                setNewPasswordInput('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                              title="Đặt lại mật khẩu cho Admin trường"
                            >
                              <Key className="w-3.5 h-3.5 text-amber-600" />
                            </button>

                            {/* Nút Chỉnh sửa */}
                            <button
                              onClick={() => handleOpenEditModal(school)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                              title="Chỉnh sửa thông tin trường"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            </button>

                            {/* Nút Xóa */}
                            <button
                              onClick={() => handleDeleteSchool(school)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                              title="Xóa trường học"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* PHÂN HỆ 2: QUẢN LÝ YÊU CẦU GIA HẠN BẢN QUYỀN (RENEWAL REQUESTS) */}
      {subTab === 'REQUESTS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in space-y-4 p-4">
          <div className="p-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Danh Sách Yêu Cầu Gia Hạn Bản Quyền ({filteredRequests.length} yêu cầu)</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-amber-300 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Realtime Firestore: <code className="font-mono">/renewal_requests</code></span>
              </span>
            </div>
          </div>

          {/* Bộ lọc trạng thái yêu cầu gia hạn */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { id: 'ALL', label: 'Tất Cả', count: renewalRequests.length, color: 'bg-slate-100 text-slate-800 border-slate-300' },
              { id: 'pending', label: '⏳ Chờ Duyệt', count: renewalRequests.filter(r => r.status === 'pending').length, color: 'bg-amber-50 text-amber-800 border-amber-300' },
              { id: 'approved', label: '✓ Đã Duyệt', count: renewalRequests.filter(r => r.status === 'approved').length, color: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
              { id: 'rejected', label: '✕ Bị Từ Chối', count: renewalRequests.filter(r => r.status === 'rejected').length, color: 'bg-rose-50 text-rose-800 border-rose-300' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setRequestStatusFilter(f.id as any)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  requestStatusFilter === f.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                    : `${f.color} hover:opacity-80`
                }`}
              >
                <span>{f.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  requestStatusFilter === f.id ? 'bg-white/20 text-white' : 'bg-white text-slate-700 font-bold border'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {isRequestsLoading ? (
            <div className="p-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-xs font-bold text-slate-600">Đang tải danh sách yêu cầu gia hạn từ Firestore...</div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Clock className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Không có yêu cầu gia hạn nào</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {requestStatusFilter !== 'ALL'
                  ? `Không có yêu cầu nào thuộc trạng thái "${requestStatusFilter}".`
                  : 'Hiện chưa có trường nào gửi yêu cầu gia hạn qua hệ thống.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-extrabold text-[11px] uppercase border-b border-slate-200">
                    <th className="py-3.5 px-4">Trường Học & Thời Điểm Gửi</th>
                    <th className="py-3.5 px-4">Gói Yêu Cầu & Liên Hệ</th>
                    <th className="py-3.5 px-4">Ghi Chú / Mã GD & Phản Hồi</th>
                    <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                    <th className="py-3.5 px-4 text-center w-64">Thao Tác Super Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredRequests.map((req) => {
                    const matchedSchool = schools.find((s) => s.schoolId === req.schoolId);

                    return (
                      <tr
                        key={req.id || req.createdAt}
                        className={`hover:bg-indigo-50/30 transition-colors ${
                          req.status === 'pending'
                            ? 'bg-amber-50/30'
                            : req.status === 'rejected'
                            ? 'bg-rose-50/20'
                            : ''
                        }`}
                      >
                        {/* Cột 1: Thông tin trường & Thời gian */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span>{req.schoolName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {req.schoolId}
                            </span>
                            {matchedSchool && (
                              <span className="text-[10px] text-slate-500">
                                (Hạn hiện tại: <strong className="text-slate-700">{new Date(matchedSchool.expiredAt).toLocaleDateString('vi-VN')}</strong>)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Gửi lúc: {new Date(req.createdAt).toLocaleDateString('vi-VN')} {new Date(req.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </td>

                        {/* Cột 2: Gói cước & Liên hệ */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div>
                            <span className="font-black text-xs text-indigo-700 bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-300 inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              <span>{req.packageName || `Gói ${req.months} Tháng`}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-indigo-600" />
                            <a href={`tel:${req.phone}`} className="font-bold hover:underline text-indigo-600">
                              {req.phone}
                            </a>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[180px]">{req.adminEmail}</span>
                          </div>
                        </td>

                        {/* Cột 3: Ghi chú & Phản hồi */}
                        <td className="py-3.5 px-4 space-y-1.5 max-w-xs">
                          {req.notes ? (
                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                              <div className="font-bold text-[10px] text-slate-500 uppercase">Ghi chú của trường:</div>
                              <div className="whitespace-pre-line break-words">{req.notes}</div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic">Không có ghi chú kèm theo</div>
                          )}

                          {req.responseMessage && (
                            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 space-y-0.5">
                              <div className="font-black text-[10px] text-indigo-700 uppercase flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                <span>Phản hồi từ Super Admin:</span>
                              </div>
                              <div className="whitespace-pre-line break-words">{req.responseMessage}</div>
                            </div>
                          )}
                        </td>

                        {/* Cột 4: Trạng thái */}
                        <td className="py-3.5 px-4 text-center">
                          {req.status === 'approved' ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>ĐÃ DUYỆT</span>
                              </span>
                              {req.reviewedAt && (
                                <div className="text-[10px] text-slate-500">
                                  {new Date(req.reviewedAt).toLocaleDateString('vi-VN')}
                                </div>
                              )}
                            </div>
                          ) : req.status === 'rejected' ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                                <X className="w-3.5 h-3.5 text-rose-600" />
                                <span>BỊ TỪ CHỐI</span>
                              </span>
                              {req.reviewedAt && (
                                <div className="text-[10px] text-slate-500">
                                  {new Date(req.reviewedAt).toLocaleDateString('vi-VN')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-400 animate-pulse">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>CHỜ DUYỆT</span>
                            </span>
                          )}
                        </td>

                        {/* Cột 5: Thao tác */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col gap-1.5 items-center justify-center">
                            {req.status === 'pending' ? (
                              <div className="flex items-center gap-1.5 w-full justify-center">
                                <button
                                  onClick={() => handleOpenReviewModal(req, 'approve')}
                                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs flex items-center justify-center gap-1 cursor-pointer transition-all hover:scale-105"
                                  title="Duyệt yêu cầu và cộng dồn thời hạn sử dụng"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Duyệt</span>
                                </button>
                                <button
                                  onClick={() => handleOpenReviewModal(req, 'reject')}
                                  className="py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all"
                                  title="Từ chối yêu cầu gia hạn"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Từ Chối</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenReviewModal(req, 'approve')}
                                className="w-full py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                                title="Gia hạn thêm hoặc cập nhật xét duyệt"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Gia Hạn Lại</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenReviewModal(req, 'respond')}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all"
                              title="Gửi tin nhắn phản hồi / Ghi chú cho trường học"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{req.responseMessage ? 'Sửa Phản Hồi' : 'Nhắn Phản Hồi'}</span>
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

      {/* PHÂN HỆ 3: QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG (USERS) */}
      {subTab === 'USERS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          <div className="p-4 bg-slate-900 text-white font-black text-xs uppercase flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Danh Sách Tài Khoản Người Dùng ({filteredUsers.length} tài khoản)</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCleanupOrphanedUsers}
                disabled={isCleaningOrphans}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Dọn dẹp và xóa các tài khoản mà trường học đã bị xóa khỏi hệ thống Cloud"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>{isCleaningOrphans ? 'Đang dọn dẹp...' : 'Dọn Dẹp Tài Khoản Mồ Côi'}</span>
              </button>
              <span className="text-[11px] text-amber-300 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Firestore Collection: <code className="font-mono">/users</code></span>
              </span>
            </div>
          </div>

          {isUsersLoading ? (
            <div className="p-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-xs font-bold text-slate-600">Đang tải danh sách tài khoản từ Firebase Firestore...</div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Users className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy tài khoản người dùng</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Không có tài khoản người dùng nào khớp với bộ lọc hoặc từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-extrabold text-[11px] uppercase border-b border-slate-200">
                    <th className="py-3.5 px-4">Tên Hiển Thị & Email</th>
                    <th className="py-3.5 px-4">UID Tài Khoản</th>
                    <th className="py-3.5 px-4">Vai Trò Hệ Thống (Role)</th>
                    <th className="py-3.5 px-4">Mã Trường Liên Kết (schoolId)</th>
                    <th className="py-3.5 px-4 text-center">Hành Động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-slate-150 hover:bg-slate-50 transition-all font-medium text-slate-800">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{u.displayName || 'Chưa đặt tên'}</div>
                        <div className="text-slate-500 font-semibold text-[11px] mt-0.5">{u.email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500">{u.uid}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          u.role === 'super_admin'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : u.role === 'school_admin'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-350'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.schoolId ? (
                          <div className="font-mono text-xs text-indigo-600 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded inline-block">
                            {u.schoolId}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold italic">Không có (Super Admin)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedUserToEdit(u);
                              setEditUserDisplayName(u.displayName || '');
                              setEditUserRole(u.role);
                              setEditUserSchoolId(u.schoolId || '');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                            title="Chỉnh sửa quyền hạn tài khoản"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Chỉnh Sửa Quyền</span>
                          </button>

                          {u.role !== 'super_admin' && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer flex items-center justify-center"
                              title="Xóa vĩnh viễn tài khoản này trên Firebase và trong chương trình"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          )}
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

      {/* MODAL DUYỆT TRƯỜNG ĐĂNG KÝ MỚI */}
      {approvingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">Duyệt & Cấp Quyền Trường Học</h3>
              </div>
              <button
                onClick={() => setApprovingSchool(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-2 text-slate-700 bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
              <div>
                Trường: <strong>{approvingSchool.schoolName}</strong>
              </div>
              <div>
                Email Admin: <strong>{approvingSchool.adminEmail}</strong>
              </div>
              {approvingSchool.province && (
                <div>
                  Tỉnh/TP: <strong>{approvingSchool.province}</strong>
                </div>
              )}
            </div>

            {/* Chọn Gói Cước */}
            <div className="space-y-1.5 text-xs">
              <label className="font-black text-slate-900 block">Chọn Gói Cước:</label>
              <div className="grid grid-cols-3 gap-2">
                {(['trial', 'standard', 'premium'] as SchoolPlan[]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setApprovePlan(plan)}
                    className={`py-2 rounded-xl border font-black uppercase text-center cursor-pointer transition-all ${
                      approvePlan === plan
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </div>

            {/* Chọn Thời Gian Cấp Phép */}
            <div className="space-y-1.5 text-xs">
              <label className="font-black text-slate-900 block">Thời Gian Kích Hoạt:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '3 Tháng', months: 3 },
                  { label: '6 Tháng', months: 6 },
                  { label: '1 Năm', months: 12 },
                ].map((opt) => (
                  <button
                    key={opt.months}
                    type="button"
                    onClick={() => {
                      setIsApprovePermanent(false);
                      setApproveMonths(opt.months);
                    }}
                    className={`py-2 rounded-xl border font-black text-center cursor-pointer transition-all ${
                      !isApprovePermanent && approveMonths === opt.months
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsApprovePermanent(true)}
                className={`w-full py-2.5 mt-2 rounded-xl border font-black text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                  isApprovePermanent
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                }`}
              >
                <InfinityIcon className="w-4 h-4" />
                <span>Cấp Bản Quyền Vĩnh Viễn</span>
              </button>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => setApprovingSchool(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmApproveSchool}
                disabled={isApprovingSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isApprovingSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang duyệt...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Xác Nhận & Kích Hoạt</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CẤP QUYỀN / THÊM TRƯỜNG MỚI */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-7 space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    Tạo Trường Mới / Cấp Tài Khoản
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Tự động sinh mã School ID & khởi tạo tài khoản School Admin
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSchoolSubmit} className="space-y-4 text-xs">
              {/* Tên trường học */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">
                  Tên Trường Học <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Trường THPT Nguyễn Huệ"
                  value={newSchoolData.schoolName}
                  onChange={(e) =>
                    setNewSchoolData({ ...newSchoolData, schoolName: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Mã School ID tự động sinh */}
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase text-indigo-950">
                    Mã School ID Động Sẽ Được Tạo:
                  </div>
                  <div className="font-mono text-xs font-black text-indigo-700 mt-0.5">
                    {previewSchoolId}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-200 text-indigo-900">
                  Tự Động Sinh
                </span>
              </div>

              {/* Tên Đăng Nhập Quản Trị (Username) */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">
                  Tên Đăng Nhập Quản Trị (Username)
                </label>
                <input
                  type="text"
                  placeholder={`Ví dụ: ${previewSchoolId.replace(/-/g, '_')}_admin (để trống để tự sinh)`}
                  value={newSchoolData.adminUsername || ''}
                  onChange={(e) =>
                    setNewSchoolData({ ...newSchoolData, adminUsername: e.target.value.toLowerCase().trim() })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                />
                <p className="text-[11px] text-slate-500">
                  Dùng để đăng nhập hệ thống. Nếu để trống, hệ thống sẽ tự sinh: <span className="font-mono text-indigo-600">{previewSchoolId.replace(/-/g, '_')}_admin</span>
                </p>
              </div>

              {/* Email Quản Trị Viên */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">
                  Email Đại Diện Admin Trường <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="Ví dụ: bgh@nguyenhue.edu.vn"
                  value={newSchoolData.adminEmail}
                  onChange={(e) =>
                    setNewSchoolData({ ...newSchoolData, adminEmail: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Mật khẩu ban đầu */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">
                  Mật Khẩu Khởi Tạo (Để trống để hệ thống tự sinh ngẫu nhiên)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: NguyenHue@2026 (Tùy chọn)"
                  value={newSchoolData.adminPassword}
                  onChange={(e) =>
                    setNewSchoolData({ ...newSchoolData, adminPassword: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Thời hạn cấp phép */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">Thời Hạn Cấp Phép Bản Quyền</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '3 Tháng', months: 3 },
                    { label: '6 Tháng', months: 6 },
                    { label: '12 Tháng', months: 12 },
                  ].map((opt) => (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => {
                        setIsPermanentDuration(false);
                        setNewSchoolData({ ...newSchoolData, durationMonths: opt.months });
                      }}
                      className={`py-2 rounded-xl border font-black text-center cursor-pointer transition-all ${
                        !isPermanentDuration && newSchoolData.durationMonths === opt.months
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsPermanentDuration(true)}
                    className={`py-2 rounded-xl border font-black text-center cursor-pointer transition-all ${
                      isPermanentDuration
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                    }`}
                  >
                    Vĩnh Viễn
                  </button>
                </div>
              </div>

              {/* Địa chỉ & Số điện thoại & Hiệu trưởng */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-black text-slate-900 block">Số Điện Thoại Liên Hệ</label>
                  <input
                    type="text"
                    placeholder="VD: 024.38233140"
                    value={newSchoolData.phone}
                    onChange={(e) =>
                      setNewSchoolData({ ...newSchoolData, phone: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-black text-slate-900 block">Người Đại Diện / Hiệu Trưởng</label>
                  <input
                    type="text"
                    placeholder="VD: Thầy Nguyễn Văn A"
                    value={newSchoolData.principalName}
                    onChange={(e) =>
                      setNewSchoolData({ ...newSchoolData, principalName: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Nút gửi */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black flex items-center gap-2 shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Tạo Trên Firebase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Lưu & Cấp Phép Trường Học</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: THÔNG TIN BÀN GIAO SAU KHI TẠO THÀNH CÔNG */}
      {createdSchoolSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 animate-scale-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900">
                Cấp Phép Trường Thành Công!
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Dữ liệu trường học và tài khoản School Admin đã được lưu trữ an toàn trên Firebase. Hãy sao chép thông tin bàn giao bên dưới gửi cho nhà trường:
              </p>
            </div>

            {/* Khung Thông Tin Bàn Giao */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">TÊN TRƯỜNG:</span>
                <span className="font-bold text-amber-300">{createdSchoolSuccess.school.schoolName}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">MÃ SCHOOL ID:</span>
                <span className="font-bold text-indigo-300">{createdSchoolSuccess.school.schoolId}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">TÊN ĐĂNG NHẬP:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {createdSchoolSuccess.user?.username || createdSchoolSuccess.school.adminUsername || 'chưa cập nhật'}
                </span>
              </div>
              {createdSchoolSuccess.school.phone && (
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">SỐ ĐIỆN THOẠI:</span>
                  <span className="font-bold text-cyan-400">{createdSchoolSuccess.school.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">EMAIL ADMIN:</span>
                <span className="font-bold text-white">{createdSchoolSuccess.school.adminEmail}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">MẬT KHẨU KHỞI TẠO:</span>
                <span className="font-bold text-amber-400">{createdSchoolSuccess.school.adminPasswordInitial}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">HẠN SỬ DỤNG:</span>
                <span className="font-bold text-slate-200">
                  {new Date(createdSchoolSuccess.school.expiredAt).getFullYear() >= 2090
                    ? 'Vĩnh Viễn'
                    : new Date(createdSchoolSuccess.school.expiredAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const uname = createdSchoolSuccess.user?.username || createdSchoolSuccess.school.adminUsername || '';
                  const phone = createdSchoolSuccess.school.phone || '';
                  const info = `THÔNG TIN TÀI KHOẢN TKB ENGINE PRO:\n- Tên trường: ${createdSchoolSuccess.school.schoolName}\n- Mã School ID: ${createdSchoolSuccess.school.schoolId}\n- Tên đăng nhập: ${uname}\n- SĐT liên hệ: ${phone}\n- Email: ${createdSchoolSuccess.school.adminEmail}\n- Mật khẩu: ${createdSchoolSuccess.school.adminPasswordInitial}\n- Hạn dùng: ${new Date(createdSchoolSuccess.school.expiredAt).getFullYear() >= 2090 ? 'Vĩnh Viễn' : new Date(createdSchoolSuccess.school.expiredAt).toLocaleDateString('vi-VN')}`;
                  copyToClipboard(info, 'full_info');
                  showToast('✓ Đã sao chép toàn bộ thông tin bàn giao vào Clipboard!');
                }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Sao Chép Thông Tin Bàn Giao</span>
              </button>
              <button
                onClick={() => setCreatedSchoolSuccess(null)}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: GIA HẠN THỜI HẠN (EXTEND SUBSCRIPTION) */}
      {extendingSchool && (() => {
        const currentExpiryDate = new Date(extendingSchool.expiredAt);
        const isCurrentValid = !isNaN(currentExpiryDate.getTime()) && currentExpiryDate > new Date();
        const basePreviewDate = isCurrentValid ? new Date(currentExpiryDate.getTime()) : new Date();
        const previewDate = new Date(basePreviewDate.getTime());
        if (!isExtendPermanent) {
          previewDate.setMonth(previewDate.getMonth() + extendMonths);
        }
        const selectedPkgName = isExtendPermanent
          ? 'Gói vĩnh viễn'
          : extendMonths === 1
          ? 'Gói 1 tháng'
          : extendMonths === 3
          ? 'Gói 3 tháng'
          : extendMonths === 6
          ? 'Gói 6 tháng'
          : extendMonths === 12
          ? 'Gói 1 năm'
          : extendMonths === 24
          ? 'Gói 2 năm'
          : `Gói ${extendMonths} tháng`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Gia Hạn Dịch Vụ Trường Học</h3>
                    <p className="text-[11px] text-slate-500">Cộng dồn thời gian & nâng cấp trạng thái bản quyền</p>
                  </div>
                </div>
                <button
                  onClick={() => setExtendingSchool(null)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Thông tin trường & Trạng thái */}
              <div className="text-xs space-y-2 text-slate-700 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Trường học:</span>
                  <strong className="text-slate-900 text-sm">{extendingSchool.schoolName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Trạng thái hiện tại:</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900">
                    {extendingSchool.planStatus === 'renewed'
                      ? `Đã gia hạn (${extendingSchool.renewalPackageName || 'Gói chính thức'})`
                      : extendingSchool.plan === 'trial'
                      ? 'Dùng thử 14 ngày'
                      : 'Bản quyền chính thức'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500 font-medium">Hạn sử dụng hiện tại:</span>
                  <strong className="text-indigo-950 font-mono">
                    {new Date(extendingSchool.expiredAt).getFullYear() >= 2090
                      ? 'Vĩnh Viễn (Không giới hạn)'
                      : new Date(extendingSchool.expiredAt).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </strong>
                </div>
              </div>

              {/* Lựa chọn gói gia hạn */}
              <div className="space-y-2 text-xs">
                <label className="font-black text-slate-900 block flex items-center justify-between">
                  <span>Chọn Gói Gia Hạn Thêm:</span>
                  <span className="text-indigo-600 text-[11px] font-bold">Tự động cộng dồn vào hạn hiện tại</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Gói 1 Tháng', sub: '+1 Tháng', months: 1 },
                    { label: 'Gói 3 Tháng', sub: '+3 Tháng', months: 3 },
                    { label: 'Gói 6 Tháng', sub: '+6 Tháng', months: 6 },
                    { label: 'Gói 1 Năm', sub: '+12 Tháng', months: 12 },
                    { label: 'Gói 2 Năm', sub: '+24 Tháng', months: 24 },
                  ].map((opt) => (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => {
                        setIsExtendPermanent(false);
                        setExtendMonths(opt.months);
                      }}
                      className={`py-2.5 px-2 rounded-xl border text-center cursor-pointer transition-all ${
                        !isExtendPermanent && extendMonths === opt.months
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20 font-black'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                      }`}
                    >
                      <div className="text-xs">{opt.label}</div>
                      <div className={`text-[10px] ${!isExtendPermanent && extendMonths === opt.months ? 'text-indigo-100' : 'text-slate-400'}`}>{opt.sub}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsExtendPermanent(true)}
                    className={`py-2.5 px-2 rounded-xl border text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                      isExtendPermanent
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20 font-black'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 font-bold'
                    }`}
                  >
                    <div className="text-xs flex items-center gap-1">
                      <InfinityIcon className="w-3.5 h-3.5" />
                      <span>Gói Vĩnh Viễn</span>
                    </div>
                    <div className={`text-[10px] ${isExtendPermanent ? 'text-purple-100' : 'text-purple-600'}`}>Không thời hạn</div>
                  </button>
                </div>
              </div>

              {/* Hộp xem trước kết quả cộng dồn */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-1.5 animate-fade-in">
                <div className="font-black flex items-center gap-1.5 text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>KẾT QUẢ SAU KHI GIA HẠN:</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Trạng thái mới:</span>
                  <span className="font-black px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-950">
                    Đã gia hạn ({selectedPkgName})
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Hạn sử dụng mới (Cộng dồn):</span>
                  <strong className="text-emerald-900 font-mono text-sm">
                    {isExtendPermanent
                      ? 'Vĩnh Viễn (Không giới hạn)'
                      : previewDate.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </strong>
                </div>
                <div className="text-[10px] text-emerald-700 italic pt-0.5">
                  {isCurrentValid
                    ? `✓ Thời gian gia hạn được cộng dồn tiếp nối từ ngày ${currentExpiryDate.toLocaleDateString('vi-VN')}`
                    : '✓ Tài khoản đã hết hạn, thời gian gia hạn được tính bắt đầu từ hôm nay'}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  onClick={() => setExtendingSchool(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  onClick={handleConfirmExtend}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 shadow-md shadow-indigo-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Xác Nhận Gia Hạn ({selectedPkgName})</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: ĐẶT LẠI MẬT KHẨU (RESET PASSWORD) */}
      {resettingPasswordSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">Đặt Lại Mật Khẩu Admin Trường</h3>
              </div>
              <button
                onClick={() => setResettingPasswordSchool(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-2 text-slate-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              <div>
                Trường: <strong>{resettingPasswordSchool.schoolName}</strong>
              </div>
              <div>
                Email Admin: <strong>{resettingPasswordSchool.adminEmail}</strong>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-black text-slate-900 block">
                Mật Khẩu Mới (Để trống để tự sinh ngẫu nhiên):
              </label>
              <input
                type="text"
                placeholder="VD: NguyenHue@2026 (hoặc để trống)"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
              <p className="text-[11px] text-slate-500">
                Super Admin có thể tạo lại mật khẩu mới khi Ban giám hiệu trường học quên mật khẩu đăng nhập.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => setResettingPasswordSchool(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmResetPassword}
                disabled={isResettingPass}
                className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isResettingPass ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Cập Nhật Mật Khẩu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CHỈNH SỬA THÔNG TIN TRƯỜNG (EDIT SCHOOL) */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">Chỉnh Sửa Thông Tin Trường Học</h3>
              </div>
              <button
                onClick={() => setEditingSchool(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmUpdateSchool} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Tên Trường Học</label>
                <input
                  type="text"
                  required
                  value={editFormData.schoolName}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, schoolName: e.target.value })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Email Đại Diện Admin Trường</label>
                <input
                  type="email"
                  required
                  value={editFormData.adminEmail}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, adminEmail: e.target.value })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-black text-slate-900 block">Người Đại Diện / Hiệu Trưởng</label>
                  <input
                    type="text"
                    value={editFormData.principalName}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, principalName: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-black text-slate-900 block">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, phone: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Địa Chỉ</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, address: e.target.value })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Ghi Chú</label>
                <textarea
                  rows={2}
                  value={editFormData.notes}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, notes: e.target.value })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingSchool}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUpdatingSchool ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Lưu Thay Đổi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: CHỈNH SỬA PHÂN QUYỀN USER (EDIT USER ROLE) */}
      {selectedUserToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 font-sans">Chỉnh Sửa Quyền & Trường Học</h3>
              </div>
              <button
                onClick={() => setSelectedUserToEdit(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUserSubmit} className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Tên hiển thị</label>
                <input
                  type="text"
                  required
                  value={editUserDisplayName}
                  onChange={(e) => setEditUserDisplayName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-900 block">Vai Trò Hệ Thống (Role)</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-xs"
                >
                  <option value="school_admin">School Admin (Quản trị trường)</option>
                  <option value="teacher">Teacher (Giáo viên)</option>
                  <option value="super_admin">Super Admin (Quản trị tối cao)</option>
                </select>
              </div>

              {editUserRole !== 'super_admin' && (
                <div className="space-y-1">
                  <label className="font-black text-slate-900 block">Liên Kết Mã Trường (schoolId)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: thpt-chu-van-an-88e1"
                    value={editUserSchoolId}
                    onChange={(e) => setEditUserSchoolId(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-indigo-600 text-xs"
                  />
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Nhập chính xác mã ID trường học từ danh sách trường để liên kết tài khoản này với trường tương ứng.
                  </p>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedUserToEdit(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-700 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Lưu Thay Đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: XÉT DUYỆT / TỪ CHỐI / PHẢN HỒI YÊU CẦU GIA HẠN */}
      {reviewingRequest && (() => {
        const matchedSchool = schools.find((s) => s.schoolId === reviewingRequest.schoolId);
        const currentExp = matchedSchool ? new Date(matchedSchool.expiredAt) : new Date();
        const isExpValid = !isNaN(currentExp.getTime()) && currentExp > new Date();
        const baseCalc = isExpValid ? new Date(currentExp.getTime()) : new Date();
        const previewNewExp = new Date(baseCalc.getTime());
        previewNewExp.setMonth(previewNewExp.getMonth() + reviewMonths);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scale-in text-slate-800 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                    reviewAction === 'approve'
                      ? 'bg-emerald-100 text-emerald-700'
                      : reviewAction === 'reject'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {reviewAction === 'approve' ? (
                      <Sparkles className="w-5 h-5 text-emerald-600" />
                    ) : reviewAction === 'reject' ? (
                      <X className="w-5 h-5 text-rose-600" />
                    ) : (
                      <MessageSquare className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {reviewAction === 'approve'
                        ? 'Phê Duyệt Gia Hạn Bản Quyền'
                        : reviewAction === 'reject'
                        ? 'Từ Chối Yêu Cầu Gia Hạn'
                        : 'Nhắn Tin Phản Hồi Cho Trường'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {reviewAction === 'approve'
                        ? 'Cộng dồn thời gian & gửi tin nhắn phản hồi xác nhận cho trường'
                        : reviewAction === 'reject'
                        ? 'Gửi lý do từ chối để trường học điều chỉnh thông tin thanh toán'
                        : 'Trao đổi / gửi hướng dẫn cho quản trị viên trường'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReviewingRequest(null)}
                  className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Thông tin trường & yêu cầu */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Trường học:</span>
                  <strong className="text-slate-900 text-sm">{reviewingRequest.schoolName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Mã School ID:</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {reviewingRequest.schoolId}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">SĐT Liên hệ xác nhận:</span>
                  <a href={`tel:${reviewingRequest.phone}`} className="font-bold text-indigo-600 hover:underline">
                    {reviewingRequest.phone}
                  </a>
                </div>
                {reviewingRequest.notes && (
                  <div className="pt-1.5 border-t border-slate-200">
                    <span className="text-slate-500 font-semibold block text-[10px] uppercase">Ghi chú / Mã giao dịch từ trường:</span>
                    <div className="font-medium text-slate-800 bg-white p-2 rounded-lg border border-slate-200 mt-1 whitespace-pre-line">
                      {reviewingRequest.notes}
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
                {/* 1. Chọn thời gian gia hạn (khi Duyệt) */}
                {reviewAction === 'approve' && (
                  <div className="space-y-2">
                    <label className="font-black text-slate-900 block flex items-center justify-between">
                      <span>Thời Gian Gia Hạn Phê Duyệt:</span>
                      <span className="text-indigo-600 text-[11px] font-bold">Cộng dồn vào hạn hiện tại</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { months: 3, label: '3 Tháng', sub: 'Gói 3 tháng' },
                        { months: 6, label: '6 Tháng', sub: 'Gói 6 tháng' },
                        { months: 12, label: '12 Tháng', sub: 'Gói 1 Năm' },
                      ].map((opt) => (
                        <button
                          key={opt.months}
                          type="button"
                          onClick={() => setReviewMonths(opt.months)}
                          className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                            reviewMonths === opt.months
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-black'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                          }`}
                        >
                          <div className="font-black text-xs">{opt.label}</div>
                          <div className={`text-[10px] ${reviewMonths === opt.months ? 'text-emerald-100' : 'text-slate-500'}`}>
                            {opt.sub}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Hạn mới sau khi duyệt:</span>
                      </span>
                      <strong className="text-emerald-800 font-bold text-xs">
                        {previewNewExp.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </strong>
                    </div>
                  </div>
                )}

                {/* 2. Tin nhắn phản hồi / Ghi chú cho trường */}
                <div className="space-y-1.5">
                  <label className="font-black text-slate-900 block flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      {reviewAction === 'approve'
                        ? 'Tin Nhắn Phản Hồi Khi Duyệt (Tùy chọn):'
                        : reviewAction === 'reject'
                        ? 'Lý Do Từ Chối / Hướng Dẫn Điều Chỉnh:'
                        : 'Nội Dung Tin Nhắn Phản Hồi Cho Trường:'}
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    required={reviewAction === 'respond' || reviewAction === 'reject'}
                    placeholder={
                      reviewAction === 'approve'
                        ? 'Nhập lời nhắn gửi đến admin trường (VD: Đã nhận thanh toán, gia hạn thành công...)'
                        : reviewAction === 'reject'
                        ? 'Nhập lý do từ chối (VD: Chưa nhận được giao dịch chuyển khoản. Vui lòng kiểm tra lại...)'
                        : 'Nhập tin nhắn phản hồi gửi đến quản trị viên trường học...'
                    }
                    value={reviewResponseMessage}
                    onChange={(e) => setReviewResponseMessage(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 text-slate-900 text-xs transition-all resize-none font-medium"
                  />
                </div>

                {/* Nút hành động */}
                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setReviewingRequest(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={isReviewSubmitting}
                    className={`px-5 py-2.5 rounded-xl text-white font-black text-xs shadow-md cursor-pointer transition-all flex items-center gap-2 ${
                      reviewAction === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                        : reviewAction === 'reject'
                        ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
                    }`}
                  >
                    {isReviewSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Đang Xử Lý...</span>
                      </>
                    ) : reviewAction === 'approve' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Xác Nhận Phê Duyệt</span>
                      </>
                    ) : reviewAction === 'reject' ? (
                      <>
                        <X className="w-3.5 h-3.5" />
                        <span>Xác Nhận Từ Chối</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Gửi Tin Nhắn</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* CUSTOM CONFIRMATION MODAL */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200">
              <div className={`p-2 rounded-xl border ${
                confirmModal.type === 'danger'
                  ? 'bg-rose-50 text-rose-600 border-rose-200'
                  : confirmModal.type === 'warning'
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900 font-sans">{confirmModal.title}</h3>
            </div>

            <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans">
              {confirmModal.message}
            </p>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 font-sans">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2 rounded-xl text-white text-xs font-black cursor-pointer shadow-xs transition-all ${
                  confirmModal.type === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : confirmModal.type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                }`}
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
