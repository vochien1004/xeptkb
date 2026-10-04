/**
 * LoginPage.tsx - Màn hình Đăng Nhập & Đăng Ký Trường Học Mới (Auth & Registration)
 * - Đăng nhập bằng Tên đăng nhập hoặc Số điện thoại và Mật khẩu
 * - Đăng ký trường mới: Nhập Tên đăng nhập và kiểm tra trùng lặp trên hệ thống
 * - Khôi phục / Quên mật khẩu qua Email hoặc xác minh Số điện thoại
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Building2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  School as SchoolIcon,
  Calendar,
  Info,
  Phone,
  Zap,
  ShieldCheck,
  Server,
  KeyRound,
  User,
  RefreshCw,
  HelpCircle,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { RegisterSchoolPayload } from '../types/school';
import {
  checkUsernameExists,
  requestPasswordReset,
  resetPasswordWithPhoneVerification,
} from '../services/authService';
import { clearSchoolLocalCache } from '../services/firebaseClient';

interface Props {
  onLoginSuccess?: (role: 'super_admin' | 'school_admin') => void;
}

const PROVINCES_LIST = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Kon Tum',
  'Gia Lai',
  'Đắk Lắk',
  'Lâm Đồng',
  'Nghệ An',
  'Thanh Hóa',
  'Quảng Ninh',
  'Bắc Ninh',
  'Hải Dương',
  'Nam Định',
  'Thừa Thiên Huế',
  'Quảng Nam',
  'Bình Định',
  'Khánh Hòa',
  'Bình Dương',
  'Đồng Nai',
  'Bà Rịa - Vũng Tàu',
  'An Giang',
  'Kiên Giang',
  'Tiền Giang',
];

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const { login, register } = useAuth();

  // Chế độ Auth: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>('LOGIN');

  // Form Đăng nhập bằng Tên đăng nhập hoặc Số điện thoại
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form Đăng ký trường mới
  const [regData, setRegData] = useState<RegisterSchoolPayload>({
    schoolName: '',
    representativeName: '',
    username: '',
    phone: '',
    province: 'Hà Nội',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    address: '',
  });
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Trạng thái kiểm tra Tên đăng nhập realtime
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameCheckMsg, setUsernameCheckMsg] = useState<string>('');

  // Form Quên mật khẩu
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [foundAccount, setFoundAccount] = useState<{
    email?: string;
    phone?: string;
    schoolName?: string;
    message?: string;
  } | null>(null);
  const [verifyPhone, setVerifyPhone] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Trạng thái xử lý chung
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dọn sạch toàn bộ cache dữ liệu trường học cũ khi ở màn hình đăng nhập
  useEffect(() => {
    clearSchoolLocalCache();
  }, []);

  // Kiểm tra tên đăng nhập khi người dùng nhập (Debounce)
  useEffect(() => {
    const raw = regData.username.trim().toLowerCase();
    if (!raw) {
      setUsernameCheckStatus('idle');
      setUsernameCheckMsg('');
      return;
    }

    if (raw.length < 3) {
      setUsernameCheckStatus('invalid');
      setUsernameCheckMsg('Tên đăng nhập phải chứa ít nhất 3 ký tự');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(raw)) {
      setUsernameCheckStatus('invalid');
      setUsernameCheckMsg('Chỉ dùng chữ không dấu, số, dấu _, -, .');
      return;
    }

    setUsernameCheckStatus('checking');
    setUsernameCheckMsg('Đang kiểm tra tính khả dụng...');

    const timer = setTimeout(async () => {
      try {
        const isTaken = await checkUsernameExists(raw);
        if (isTaken) {
          setUsernameCheckStatus('taken');
          setUsernameCheckMsg(`Tên đăng nhập "${raw}" đã được sử dụng`);
        } else {
          setUsernameCheckStatus('available');
          setUsernameCheckMsg(`✓ Tên đăng nhập "${raw}" hợp lệ & sẵn sàng`);
        }
      } catch {
        setUsernameCheckStatus('idle');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [regData.username]);

  // Xử lý Đăng Nhập
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim()) {
      setErrorMsg('Vui lòng nhập Tên đăng nhập hoặc Số điện thoại!');
      return;
    }
    if (!loginPassword.trim()) {
      setErrorMsg('Vui lòng nhập Mật khẩu đăng nhập!');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await login({
        identifier: loginIdentifier.trim(),
        password: loginPassword.trim(),
      });
      if (res.success && res.user) {
        if (onLoginSuccess) {
          onLoginSuccess(res.user.role === 'super_admin' ? 'super_admin' : 'school_admin');
        }
      } else {
        setErrorMsg(res.error || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin!');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Có lỗi xảy ra khi kết nối máy chủ xác thực.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý Đăng Ký Trường Mới
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUsername = regData.username.trim().toLowerCase();

    if (!regData.schoolName.trim()) {
      setErrorMsg('Vui lòng nhập Tên trường học!');
      return;
    }
    if (!regData.representativeName.trim()) {
      setErrorMsg('Vui lòng nhập Họ tên Người đại diện / BGH!');
      return;
    }
    if (!cleanUsername) {
      setErrorMsg('Vui lòng nhập Tên đăng nhập quản trị!');
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMsg('Tên đăng nhập phải chứa ít nhất 3 ký tự!');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      setErrorMsg('Tên đăng nhập chỉ được chứa chữ cái không dấu, số, dấu gạch dưới (_), gạch ngang (-) hoặc chấm (.)!');
      return;
    }
    if (!regData.phone.trim()) {
      setErrorMsg('Vui lòng nhập Số điện thoại liên hệ!');
      return;
    }
    if (!regData.adminPassword || regData.adminPassword.length < 6) {
      setErrorMsg('Mật khẩu phải chứa ít nhất 6 ký tự!');
      return;
    }
    if (regData.adminPassword !== regData.confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp. Vui lòng nhập lại!');
      return;
    }

    setIsSubmitting(true);

    try {
      // Kiểm tra tên đăng nhập trước khi gửi đăng ký
      const isTaken = await checkUsernameExists(cleanUsername);
      if (isTaken) {
        setErrorMsg(`Tên đăng nhập "${cleanUsername}" đã tồn tại. Vui lòng chọn một tên đăng nhập khác!`);
        setIsSubmitting(false);
        return;
      }

      const res = await register({
        ...regData,
        username: cleanUsername,
      });

      if (res.success && res.user && res.school) {
        setSuccessMsg(
          `🎉 Đăng ký thành công trường "${res.school.schoolName}"! Tên đăng nhập: "${cleanUsername}" (Mã ID: ${res.school.schoolId}). Đang tự động đăng nhập vào bảng điều khiển...`
        );
        // Reset form
        setRegData({
          schoolName: '',
          representativeName: '',
          username: '',
          phone: '',
          province: 'Hà Nội',
          adminEmail: '',
          adminPassword: '',
          confirmPassword: '',
          address: '',
        });
        if (onLoginSuccess) {
          setTimeout(() => {
            onLoginSuccess('school_admin');
          }, 1200);
        }
      } else {
        setErrorMsg(res.error || 'Đăng ký trường không thành công. Vui lòng thử lại!');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi tạo tài khoản trường học trên máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tra cứu tài khoản Quên mật khẩu
  const handleForgotLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setErrorMsg('Vui lòng nhập Tên đăng nhập, Số điện thoại hoặc Email!');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await requestPasswordReset(forgotIdentifier.trim());
      if (res.success) {
        setFoundAccount({
          email: res.email,
          phone: res.phone,
          schoolName: res.schoolName,
          message: res.message,
        });
        setForgotStep(2);
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message || 'Không tìm thấy tài khoản tương ứng.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi tra cứu tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xác minh SĐT và đổi mật khẩu mới
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPhone.trim()) {
      setErrorMsg('Vui lòng nhập Số điện thoại đã đăng ký để xác minh!');
      return;
    }
    if (!newResetPassword.trim() || newResetPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    if (newResetPassword !== confirmResetPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp!');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await resetPasswordWithPhoneVerification({
        identifier: forgotIdentifier.trim(),
        phone: verifyPhone.trim(),
        newPassword: newResetPassword.trim(),
      });

      if (res.success) {
        setSuccessMsg('✓ Đặt lại mật khẩu thành công! Bạn có thể quay lại Đăng Nhập ngay bây giờ.');
        setLoginIdentifier(forgotIdentifier.trim());
        setLoginPassword(newResetPassword.trim());
        setTimeout(() => {
          setAuthMode('LOGIN');
          setForgotStep(1);
          setFoundAccount(null);
          setVerifyPhone('');
          setNewResetPassword('');
          setConfirmResetPassword('');
        }, 1800);
      } else {
        setErrorMsg(res.message || 'Xác minh số điện thoại không thành công.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi cập nhật mật khẩu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between relative overflow-hidden select-none font-sans text-slate-100">
      {/* Background Ambient Lighting & Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-sky-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white font-black">
            <SchoolIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>TKB ENGINE PRO</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wider">
                Multi-Tenant Cloud
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium">
              Hệ thống xếp Thời khóa biểu tự động thông minh
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 my-auto py-2 sm:py-6">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left Side: Brand Visual & Features (5 cols on lg) */}
          <div className="lg:col-span-5 p-6 sm:p-8 bg-gradient-to-br from-indigo-950/60 via-slate-900/80 to-purple-950/60 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Phiên Bản V2.1 2026</span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  Tối Ưu Xếp TKB Thông Minh
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                  Thuật toán xếp TBK thông minh, đáp ứng đủ nhu cầu của Nhà trường.
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                  Tính Năng Nổi Bật:
                </div>
                <ul className="space-y-2 text-xs text-slate-300 font-medium">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Hỗ trợ tiết ghép nhiều lớp & đồng giảng dạy (Co-teaching)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Tự động phân phối TKB tránh trùng tiết giáo viên & phòng học</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Bảo mật dữ liệu phân lập độc lập theo từng Trường học</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Xuất file Excel in ấn chuẩn khổ ngang A4 chính xác 100%</span>
                  </li>
                </ul>
              </div>

              {/* Security Badge */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center gap-3 text-xs text-slate-300">
                <ShieldCheck className="w-6 h-6 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-bold text-white">Bảo mật Cloud Đa Trường</div>
                  <div className="text-[11px] text-slate-400">
                    Dữ liệu được lưu trữ an toàn & mã hóa an toàn trên Cloud.
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Highlight */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
              <Server className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Phát triển bởi Võ Chiến - ĐT: 0374716105.</span>
            </div>
          </div>

          {/* Right Side: Auth Form with Tabs (7 cols on lg) */}
          <div className="lg:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div>
              {/* TAB SWITCHER: ĐĂNG NHẬP / ĐĂNG KÝ TRƯỜNG MỚI */}
              <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('LOGIN');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    authMode === 'LOGIN'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Đăng Nhập</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('REGISTER');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    authMode === 'REGISTER'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Đăng Ký Tài khoản Trường Mới</span>
                </button>
              </div>

              {/* Error Message Alert */}
              {errorMsg && (
                <div className="mb-4 p-4 rounded-2xl bg-rose-950/90 border border-rose-700/80 flex flex-col gap-2.5 text-xs text-rose-200 animate-shake shadow-lg shadow-rose-950/40">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 font-medium leading-relaxed whitespace-pre-line">
                      {errorMsg}
                    </div>
                  </div>
                  {authMode === 'LOGIN' && (
                    <div className="pt-2 border-t border-rose-800/60 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-rose-300">Quên hoặc không nhớ mật khẩu?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('FORGOT_PASSWORD');
                          setErrorMsg(null);
                          setSuccessMsg(null);
                          setForgotIdentifier(loginIdentifier);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Đặt Lại Mật Khẩu Ngay</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Success Message Alert */}
              {successMsg && (
                <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 flex items-start gap-2.5 text-xs text-emerald-200 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 font-bold leading-relaxed">{successMsg}</div>
                </div>
              )}

              {/* ================= 1. FORM ĐĂNG NHẬP ================= */}
              {authMode === 'LOGIN' && (
                <div>
                  <div className="pb-3 border-b border-slate-800">
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                      <LogIn className="w-4 h-4 text-indigo-400" />
                      <span>Đăng Nhập Hệ Thống</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sử dụng <strong>Tên đăng nhập hoặc Số điện thoại</strong> và Mật khẩu để truy cập.
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3.5">
                    {/* Tên đăng nhập hoặc Số điện thoại */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 block">
                        Tên Đăng Nhập hoặc Số Điện Thoại <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="Ví dụ: admin hoặc 0912345678"
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-xs font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 block">
                          Mật Khẩu Đăng Nhập <span className="text-rose-400">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('FORGOT_PASSWORD');
                            setErrorMsg(null);
                            setSuccessMsg(null);
                            setForgotIdentifier(loginIdentifier);
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold hover:underline cursor-pointer"
                        >
                          Quên mật khẩu?
                        </button>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          required
                          placeholder="Nhập mật khẩu tài khoản"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-xs font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang xác thực thông tin...</span>
                        </div>
                      ) : (
                        <>
                          <span>Đăng Nhập Vào Hệ Thống</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* ================= 2. FORM ĐĂNG KÝ TRƯỜNG MỚI ================= */}
              {authMode === 'REGISTER' && (
                <div>
                  <div className="pb-2.5 border-b border-slate-800">
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-emerald-400" />
                      <span>Đăng Ký Trường Mới (Dùng Thử 14 Ngày)</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Hệ thống tự động sinh mã School ID và cấp tài khoản quản trị trường ngay lập tức.
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="mt-3.5 space-y-3 text-xs">
                    {/* Tên trường học */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-300 block">
                        Tên Trường Học <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Trường THPT Nguyễn Trãi"
                        value={regData.schoolName}
                        onChange={(e) => setRegData({ ...regData, schoolName: e.target.value })}
                        className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    {/* Họ tên người đại diện */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-300 block">
                        Người Đại Diện / BGH <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: Thầy Trần Quang Khải"
                        value={regData.representativeName}
                        onChange={(e) =>
                          setRegData({ ...regData, representativeName: e.target.value })
                        }
                        className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium"
                      />
                    </div>

                    {/* TÊN ĐĂNG NHẬP & KIỂM TRA TRÙNG LẶP */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-300 block">
                          Tên Đăng Nhập Quản Trị <span className="text-rose-400">*</span>
                        </label>
                        {usernameCheckStatus !== 'idle' && (
                          <span
                            className={`text-[11px] font-bold flex items-center gap-1 ${
                              usernameCheckStatus === 'available'
                                ? 'text-emerald-400'
                                : usernameCheckStatus === 'taken' || usernameCheckStatus === 'invalid'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {usernameCheckStatus === 'checking' && (
                              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                            {usernameCheckStatus === 'available' && (
                              <Check className="w-3 h-3 text-emerald-400" />
                            )}
                            {usernameCheckStatus === 'taken' && (
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                            )}
                            {usernameCheckMsg}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="Ví dụ: thpt_nguyentrai hoặc admin_nguyentrai"
                          value={regData.username}
                          onChange={(e) =>
                            setRegData({ ...regData, username: e.target.value })
                          }
                          className={`w-full pl-9 pr-3 p-2.5 rounded-xl bg-slate-950/80 border text-white text-xs font-medium font-mono ${
                            usernameCheckStatus === 'taken'
                              ? 'border-rose-500 focus:ring-rose-500/20'
                              : usernameCheckStatus === 'available'
                              ? 'border-emerald-500 focus:ring-emerald-500/20'
                              : 'border-slate-700 focus:border-emerald-500'
                          }`}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Dùng để đăng nhập trực tiếp vào hệ thống (viết liền, không dấu, ít nhất 3 ký tự).
                      </p>
                    </div>

                    {/* Số điện thoại & Tỉnh / Thành phố */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-300 block">
                          Số Điện Thoại Liên Hệ <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Phone className="w-3.5 h-3.5" />
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="VD: 0912345678"
                            value={regData.phone}
                            onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                            className="w-full pl-8 pr-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-300 block">
                          Tỉnh / Thành Phố <span className="text-rose-400">*</span>
                        </label>
                        <select
                          value={regData.province}
                          onChange={(e) => setRegData({ ...regData, province: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium"
                        >
                          {PROVINCES_LIST.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Email thông báo & phục hồi */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-300 block">
                        Email Nhận Thông Báo & Khôi Phục <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Mail className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="email"
                          required
                          placeholder="VD: bgh@nguyentrai.edu.vn"
                          value={regData.adminEmail}
                          onChange={(e) => setRegData({ ...regData, adminEmail: e.target.value })}
                          className="w-full pl-8 pr-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* Mật khẩu & Xác nhận mật khẩu */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-300 block">
                          Mật Khẩu <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          placeholder="Ít nhất 6 ký tự"
                          value={regData.adminPassword}
                          onChange={(e) =>
                            setRegData({ ...regData, adminPassword: e.target.value })
                          }
                          className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-slate-300 block">
                            Xác Nhận Mật Khẩu <span className="text-rose-400">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {showRegPassword ? 'Ẩn' : 'Hiện'}
                          </button>
                        </div>
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          placeholder="Nhập lại mật khẩu"
                          value={regData.confirmPassword}
                          onChange={(e) =>
                            setRegData({ ...regData, confirmPassword: e.target.value })
                          }
                          className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Nút Tạo tài khoản trường */}
                    <button
                      type="submit"
                      disabled={isSubmitting || usernameCheckStatus === 'taken'}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang khởi tạo tài khoản trường học...</span>
                        </div>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Tạo Tài Khoản Trường & Dùng Thử 14 Ngày</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* ================= 3. FORM QUÊN MẬT KHẨU ================= */}
              {authMode === 'FORGOT_PASSWORD' && (
                <div>
                  <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black text-white flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Khôi Phục Mật Khẩu</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Lấy lại quyền truy cập bằng Tên đăng nhập, Số điện thoại hoặc Email.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('LOGIN');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                        setForgotStep(1);
                      }}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Quay lại</span>
                    </button>
                  </div>

                  {forgotStep === 1 && (
                    <form onSubmit={handleForgotLookup} className="mt-4 space-y-4 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-300 block">
                          Tên Đăng Nhập, Số Điện Thoại hoặc Email <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <HelpCircle className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="Nhập tên đăng nhập, số điện thoại hoặc email đã đăng ký"
                            value={forgotIdentifier}
                            onChange={(e) => setForgotIdentifier(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Đang tra cứu tài khoản...</span>
                          </div>
                        ) : (
                          <>
                            <span>Tra Cứu Tài Khoản</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {forgotStep === 2 && foundAccount && (
                    <div className="mt-4 space-y-4 text-xs">
                      {/* Thẻ thông tin tài khoản tìm thấy */}
                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <div className="font-bold text-amber-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Đã tìm thấy tài khoản trường học</span>
                        </div>
                        {foundAccount.schoolName && (
                          <div className="text-slate-300">
                            Trường: <strong className="text-white">{foundAccount.schoolName}</strong>
                          </div>
                        )}
                        {foundAccount.phone && (
                          <div className="text-slate-300">
                            SĐT đăng ký: <strong className="text-emerald-400 font-mono">{foundAccount.phone}</strong>
                          </div>
                        )}
                        {foundAccount.email && (
                          <div className="text-slate-300">
                            Email liên kết: <strong className="text-indigo-300 font-mono">{foundAccount.email}</strong>
                          </div>
                        )}
                      </div>

                      {/* Form Xác minh SĐT để đổi mật khẩu trực tiếp */}
                      <form onSubmit={handleConfirmResetPassword} className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-300 block">
                            Nhập Chính Xác Số Điện Thoại Đã Đăng Ký <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Nhập đầy đủ số điện thoại (VD: 0912345678)"
                            value={verifyPhone}
                            onChange={(e) => setVerifyPhone(e.target.value)}
                            className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="font-bold text-slate-300 block">
                              Mật Khẩu Mới <span className="text-rose-400">*</span>
                            </label>
                            <input
                              type={showResetPassword ? 'text' : 'password'}
                              required
                              placeholder="Ít nhất 6 ký tự"
                              value={newResetPassword}
                              onChange={(e) => setNewResetPassword(e.target.value)}
                              className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="font-bold text-slate-300 block">
                                Xác Nhận Mật Khẩu <span className="text-rose-400">*</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowResetPassword(!showResetPassword)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                              >
                                {showResetPassword ? 'Ẩn' : 'Hiện'}
                              </button>
                            </div>
                            <input
                              type={showResetPassword ? 'text' : 'password'}
                              required
                              placeholder="Nhập lại mật khẩu mới"
                              value={confirmResetPassword}
                              onChange={(e) => setConfirmResetPassword(e.target.value)}
                              className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-mono"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 mt-2"
                        >
                          {isSubmitting ? (
                            <span>Đang cập nhật mật khẩu...</span>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Xác Nhận Đổi Mật Khẩu Mới</span>
                            </>
                          )}
                        </button>
                      </form>

                      {/* Hỗ trợ từ Super Admin */}
                      <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/50 text-[11px] text-indigo-300 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-indigo-200">
                          <Info className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Hỗ trợ kỹ thuật trực tiếp từ Super Admin:</span>
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          Nếu quên số điện thoại hoặc email, bạn có thể liên hệ Tổng đài / Zalo BQT: <strong className="text-white">0912.345.678</strong> hoặc email: <strong className="text-white">bqt@tkbpro.edu.vn</strong> để được cấp lại mật khẩu ngay lập tức.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Thông điệp phía dưới */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-300">
                <Info className="w-4 h-4 text-indigo-400" />
                <span>Hệ thống quản lý Thời khóa biểu thông minh TKB Engine Pro</span>
              </div>
              <p className="text-[11px] text-slate-400 font-normal">
                Nếu trường học chưa có tài khoản, nhấn <strong className="text-emerald-400">"Đăng Ký Trường Mới"</strong> ở trên để khởi tạo tài khoản dùng thử 14 ngày.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-slate-500">
        © 2026 TKB Engine Pro • Liên hệ: Võ Chiến - Điện thoại: 0374716105
      </footer>
    </div>
  );
};
