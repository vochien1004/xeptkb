/**
 * school.ts - Type System cho tính năng Đa trường học (Multi-tenant) & Super Admin
 */

export type UserRole = 'super_admin' | 'school_admin' | 'teacher';
export type SchoolStatus = 'active' | 'inactive' | 'pending';
export type SchoolPlan = 'trial' | 'standard' | 'premium';

export interface School {
  schoolId: string;
  schoolName: string;
  adminUsername?: string; // Tên đăng nhập của Quản trị viên trường
  adminEmail: string;
  status: SchoolStatus;
  plan?: SchoolPlan;
  planStatus?: 'trial' | 'renewed' | 'official';
  renewalPackageName?: string; // Tên gói gia hạn (VD: Gói 1 tháng, Gói 3 tháng, Gói 6 tháng, Gói 1 năm, Gói vĩnh viễn)
  lastRenewedAt?: string;      // Thời điểm gia hạn gần nhất
  createdAt: string;
  expiredAt: string;
  adminUid?: string;
  adminPasswordInitial?: string; // Mật khẩu ban đầu cấp cho trường (để Super Admin xem lại khi bàn giao)
  address?: string;
  province?: string;
  phone?: string;
  principalName?: string; // Hiệu trưởng / Người đại diện
  representativeName?: string;
  notes?: string;
  maxTeachers?: number;
  maxClasses?: number;
}

export interface UserProfile {
  uid: string;
  username?: string; // Tên đăng nhập duy nhất của tài khoản
  phone?: string;    // Số điện thoại liên hệ / đăng nhập
  email: string;
  displayName: string;
  role: UserRole;
  schoolId?: string;
  schoolName?: string;
  passwordHash?: string;
  createdAt: string;
  isOrphaned?: boolean;
}

export interface LoginCredentials {
  identifier?: string; // Tên đăng nhập hoặc Số điện thoại hoặc Email
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
}

export interface RegisterSchoolPayload {
  schoolName: string;
  representativeName: string;
  username: string; // Tên đăng nhập duy nhất
  phone: string;    // Số điện thoại
  province: string;
  adminEmail: string;
  adminPassword?: string;
  confirmPassword?: string;
  address?: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  school?: School;
  error?: string;
  isBlocked?: boolean;
}

export interface CreateSchoolPayload {
  schoolName: string;
  adminUsername?: string; // Tên đăng nhập cấp cho trường
  adminEmail: string;
  adminPassword?: string;
  durationMonths?: number;
  expiredAt?: string;
  address?: string;
  province?: string;
  phone?: string;
  principalName?: string;
  representativeName?: string;
  plan?: SchoolPlan;
  notes?: string;
}

export type RenewalStatus = 'pending' | 'approved' | 'rejected';

export interface RenewalRequest {
  id?: string;
  schoolId: string;
  schoolName: string;
  adminEmail: string;
  adminUsername?: string;
  months: number; // 3, 6, 12
  packageName: string; // 'Gói 3 tháng' | 'Gói 6 tháng' | 'Gói 12 tháng' (hoặc 'Gói 1 năm')
  price?: number; // Số tiền tương ứng (VNĐ)
  memo?: string; // Nội dung chuyển khoản theo cú pháp: GIAHAN [schoolId] [months]T
  phone: string;
  notes?: string;
  status: RenewalStatus;
  responseMessage?: string; // Tin nhắn phản hồi / Ghi chú từ Super Admin gửi cho trường
  adminNotes?: string;
  createdAt: string; // ISO string
  updatedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

