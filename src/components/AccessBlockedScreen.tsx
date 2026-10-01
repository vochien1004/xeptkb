/**
 * AccessBlockedScreen.tsx - Màn hình thông báo khi tài khoản trường học bị Khóa hoặc Hết hạn
 */

import React from 'react';
import {
  Lock,
  AlertTriangle,
  Phone,
  Mail,
  ShieldAlert,
  Building2,
  Calendar,
  RefreshCw,
  LogOut,
  UserCheck,
  HelpCircle,
  Eye,
  Sparkles,
} from 'lucide-react';
import { School, UserProfile } from '../types/school';

interface Props {
  user: UserProfile;
  school?: School | null;
  reason?: string;
  onRetry?: () => void;
  onSwitchAccount?: () => void;
  onLoginSuperAdmin?: () => void;
  onEnterReadOnly?: () => void;
  onRequestRenewal?: () => void;
}

export const AccessBlockedScreen: React.FC<Props> = ({
  user,
  school,
  reason,
  onRetry,
  onSwitchAccount,
  onLoginSuperAdmin,
  onEnterReadOnly,
  onRequestRenewal,
}) => {
  const isInactive = school?.status === 'inactive';
  const isExpired = school?.expiredAt && new Date(school.expiredAt) < new Date();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        {/* Icon & Title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center mx-auto shadow-lg shadow-rose-900/30">
            {isInactive ? <Lock className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Quyền Truy Cập Bị Giới Hạn
          </h2>
          <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs font-bold leading-relaxed">
            {reason ||
              'Tài khoản trường học của bạn chưa được cấp phép hoặc đã hết hạn sử dụng. Vui lòng liên hệ Admin để được hỗ trợ kích hoạt.'}
          </div>
        </div>

        {/* Thông tin trường học */}
        {school && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Trường Học:</span>
              </span>
              <span className="font-black text-white">{school.schoolName}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400 font-medium">Mã School ID:</span>
              <span className="font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
                {school.schoolId}
              </span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Hạn Sử Dụng:</span>
              </span>
              <span className={`font-bold ${isExpired ? 'text-rose-400' : 'text-slate-200'}`}>
                {new Date(school.expiredAt).toLocaleDateString('vi-VN')}
                {isExpired && ' (Đã hết hạn)'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Trạng Thái Hệ Thống:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-black ${
                  school.status === 'active'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {school.status === 'active' ? 'Đã Cấp Phép' : 'Tạm Khóa Quyền'}
              </span>
            </div>
          </div>
        )}

        {/* Thông tin hỗ trợ & liên hệ */}
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-900/60 space-y-2 text-xs">
          <div className="font-black text-indigo-300 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>Liên Hệ Ban Quản Trị Hệ Thống (Super Admin):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              <span>hotro@tkbpro.edu.vn</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hotline: 1900.6868</span>
            </div>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="space-y-2.5 pt-2">
          {onRequestRenewal && (
            <button
              onClick={onRequestRenewal}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all hover:scale-[1.01]"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Tạo Yêu Cầu Gia Hạn Bản Quyền</span>
            </button>
          )}

          {onEnterReadOnly && (
            <button
              onClick={onEnterReadOnly}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/35 cursor-pointer transition-all border border-amber-500 hover:shadow-amber-600/50"
            >
              <Eye className="w-4 h-4 text-white" />
              <span>Xem Thời Khóa Biểu Ở Chế Độ Chỉ Đọc (Read-Only)</span>
            </button>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Kiểm Tra Lại Trạng Thái Cấp Phép</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            {onSwitchAccount && (
              <button
                onClick={onSwitchAccount}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đổi Tài Khoản / Đăng Nhập Khác</span>
              </button>
            )}

            {onLoginSuperAdmin && (
              <button
                onClick={onLoginSuperAdmin}
                className="px-4 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                title="Đăng nhập Super Admin để quản lý cấp phép"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Super Admin</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
