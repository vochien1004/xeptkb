/**
 * AccountLoginModal.tsx - Modal Đăng Nhập & Chuyển Đổi Tài Khoản / Trường Học
 */

import React, { useState } from 'react';
import {
  UserCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { UserProfile } from '../types/school';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onSelectUser: (user: UserProfile) => void;
}

export const AccountLoginModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectUser,
}) => {
  const { login } = useAuth();
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) {
      setErrorMsg('Vui lòng nhập Tên đăng nhập hoặc Email!');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await login({ username: loginUsername.trim(), password: loginPassword });
      if (res.success && res.user) {
        onSelectUser(res.user);
        onClose();
      } else {
        setErrorMsg(res.error || 'Đăng nhập không thành công!');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi đăng nhập!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-7 space-y-5 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Đăng Nhập Tài Khoản Khác
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Đang đăng nhập với: {currentUser?.email || currentUser?.displayName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Tên Đăng Nhập hoặc Số Điện Thoại</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                placeholder="Ví dụ: admin hoặc 0912345678"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-hidden focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Mật Khẩu</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-hidden focus:border-indigo-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Đang xác thực...</span>
            ) : (
              <>
                <span>Xác Nhận Đăng Nhập</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
