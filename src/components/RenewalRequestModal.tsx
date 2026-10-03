/**
 * RenewalRequestModal.tsx - Cửa sổ Tạo Yêu Cầu Gia Hạn Bản Quyền Trường Học
 * Hỗ trợ chọn gói (3, 6, 12 tháng), hiển thị mã VietQR chuyển khoản tự động kèm cú pháp,
 * sao chép nhanh số tài khoản, số tiền và nội dung, cùng lịch sử các yêu cầu gia hạn gần đây.
 */

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Sparkles,
  Phone,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  CreditCard,
  History,
  RefreshCw,
  Plus,
  QrCode,
  Copy,
  Check,
  Wallet,
} from 'lucide-react';
import { School, UserProfile, RenewalRequest } from '../types/school';
import {
  submitRenewalRequest,
  fetchSchoolRenewalRequests,
  BANK_CONFIG,
  RENEWAL_PRICING,
  calculateRenewalMemo,
} from '../services/renewalService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  school: School;
  user: UserProfile;
  onSuccess?: () => void;
}

export const RenewalRequestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  school,
  user,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [selectedMonths, setSelectedMonths] = useState<number>(12);
  const [phone, setPhone] = useState<string>(school.phone || user.phone || '');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [historyList, setHistoryList] = useState<RenewalRequest[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Tính toán số tiền và nội dung chuyển khoản tự động
  const currentPricing = RENEWAL_PRICING[selectedMonths] || {
    price: 599000,
    label: '12 Tháng',
    sub: 'Gói 1 Năm',
  };
  const currentPrice = currentPricing.price;
  const currentMemo = calculateRenewalMemo(school.schoolId, selectedMonths);

  // URL ảnh VietQR chuẩn compact2
  const qrUrl = `https://img.vietqr.io/image/${BANK_CONFIG.BANK_ID}-${BANK_CONFIG.ACCOUNT_NO}-compact2.png?amount=${currentPrice}&addInfo=${encodeURIComponent(
    currentMemo
  )}&accountName=${encodeURIComponent(BANK_CONFIG.ACCOUNT_NAME)}`;

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 2000);
  };

  // Load history whenever modal opens
  const loadHistory = async () => {
    if (!school.schoolId) return;
    setIsLoadingHistory(true);
    try {
      const list = await fetchSchoolRenewalRequests(school.schoolId);
      setHistoryList(list);
    } catch (err) {
      console.warn('⚠️ [RenewalRequestModal] Lỗi load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setCopiedField(null);
      loadHistory();
    }
  }, [isOpen, school.schoolId]);

  if (!isOpen) return null;

  const currentExpiry = new Date(school.expiredAt);
  const isExpired = !isNaN(currentExpiry.getTime()) && currentExpiry < new Date();
  const baseDate = isExpired ? new Date() : new Date(currentExpiry.getTime());
  const previewExpiry = new Date(baseDate.getTime());
  previewExpiry.setMonth(previewExpiry.getMonth() + selectedMonths);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorMessage('Vui lòng nhập số điện thoại để chuyên viên hỗ trợ liên hệ xác nhận.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await submitRenewalRequest({
        schoolId: school.schoolId,
        schoolName: school.schoolName,
        adminEmail: school.adminEmail || user.email,
        adminUsername: school.adminUsername || user.username,
        months: selectedMonths,
        price: currentPrice,
        memo: currentMemo,
        phone: phone.trim(),
        notes: notes.trim(),
      });

      if (res.success) {
        setSuccessMessage(
          '✓ Đã gửi yêu cầu gia hạn thành công! Ban Quản Trị sẽ đối soát giao dịch và xét duyệt kích hoạt bản quyền trong thời gian sớm nhất.'
        );
        setNotes('');
        await loadHistory();
        if (onSuccess) onSuccess();
        setTimeout(() => {
          setActiveTab('history');
          setSuccessMessage(null);
        }, 1500);
      } else {
        setErrorMessage(res.error || 'Có lỗi khi gửi yêu cầu. Vui lòng thử lại!');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối khi gửi yêu cầu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl sm:max-w-2xl w-full p-5 sm:p-7 space-y-5 relative text-slate-100 animate-scale-in max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Yêu Cầu Gia Hạn Bản Quyền</h3>
              <p className="text-xs text-slate-400">Hãy hoàn thành các bước sau để gia hạn bản quyền sử dụng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'form'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo Yêu Cầu Mới</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch Sử Yêu Cầu</span>
            {historyList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-indigo-300 ml-1">
                {historyList.length}
              </span>
            )}
          </button>
        </div>

        {/* Thông tin trường tóm tắt */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Trường học:</span>
            </span>
            <strong className="text-white text-sm">{school.schoolName}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Mã School ID:</span>
            <span className="font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
              {school.schoolId}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Hạn sử dụng hiện tại:</span>
            </span>
            <span className={`font-bold ${isExpired ? 'text-rose-400' : 'text-slate-200'}`}>
              {new Date(school.expiredAt).toLocaleDateString('vi-VN')}
              {isExpired && ' (Đã hết hạn)'}
            </span>
          </div>
        </div>

        {/* Thông báo lỗi hoặc thành công */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: FORM TẠO YÊU CẦU */}
        {activeTab === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* 1. Chọn thời gian muốn gia hạn: 3 tháng, 6 tháng, 12 tháng */}
            <div className="space-y-2">
              <label className="font-black text-slate-200 flex items-center justify-between">
                <span>1. Chọn Thời Gian Muốn Gia Hạn:</span>
                <span className="text-indigo-400 text-[11px] font-bold">Cộng dồn vào hạn hiện tại</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { months: 3, label: '3 Tháng', sub: 'Gói 3 tháng', price: '199.000 đ' },
                  { months: 6, label: '6 Tháng', sub: 'Gói 6 tháng', price: '399.000 đ' },
                  { months: 12, label: '12 Tháng', sub: 'Gói 1 Năm', price: '599.000 đ' },
                ].map((opt) => (
                  <button
                    key={opt.months}
                    type="button"
                    onClick={() => setSelectedMonths(opt.months)}
                    className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${
                      selectedMonths === opt.months
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30 font-black scale-[1.02]'
                        : 'bg-slate-950 hover:bg-slate-800/80 text-slate-300 border-slate-800 font-bold'
                    }`}
                  >
                    <div className="text-sm font-black">{opt.label}</div>
                    <div
                      className={`text-[11px] font-bold mt-0.5 ${
                        selectedMonths === opt.months ? 'text-amber-300' : 'text-emerald-400'
                      }`}
                    >
                      {opt.price}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        selectedMonths === opt.months ? 'text-indigo-100' : 'text-slate-400'
                      }`}
                    >
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Hộp xem trước hạn mới */}
            <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-800/50 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Hạn sử dụng dự kiến sau khi duyệt:</span>
              </span>
              <strong className="text-indigo-300 font-mono text-xs">
                {previewExpiry.toLocaleDateString('vi-VN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </strong>
            </div>

            {/* THẺ THANH TOÁN CHUYỂN KHOẢN & MÃ QR (VIETQR) */}
            <div className="p-3.5 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 shadow-xl">
              {/* Header của thẻ */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
                <span className="font-black text-slate-200 text-xs sm:text-sm flex items-center gap-1.5">
                
                  <span>2. Quét Mã QR Chuyển Khoản Gia Hạn ({currentPricing.label})</span>
                </span>
                <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{new Intl.NumberFormat('vi-VN').format(currentPrice)} đ</span>
                </span>
              </div>

              {/* KHU VỰC MÃ QR TO HIỂN THỊ CHÍNH (KHOẢNG 60% CHIỀU NGANG THẺ) */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-[72%] sm:w-[60%] max-w-[280px] flex flex-col items-center bg-white p-3.5 sm:p-4 rounded-2xl shadow-xl border border-slate-700/60 transition-all hover:shadow-indigo-500/10">
                  <img
                    src={qrUrl}
                    alt={`Mã VietQR ${currentMemo}`}
                    className="w-full aspect-square object-contain rounded-xl"
                    loading="eager"
                  />
                  <div className="mt-2.5 flex items-center gap-1.5 text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      VietQR Tự Động • Quét Mã Tức Thì
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 text-center">
                  Mở ứng dụng Ngân hàng bất kỳ để quét mã QR và hoàn tất chuyển khoản
                </p>
              </div>

              {/* CÁC THÔNG TIN CHUYỂN KHOẢN ĐẶT XUỐNG BÊN DƯỚI (CHỮ NHỎ HƠN, GỌN GÀNG, DỄ SAO CHÉP) */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <span>Thông tin chuyển khoản thủ công (nếu không quét được QR):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Ngân hàng */}
                  <div className="bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800/80">
                    <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold block">
                      Ngân hàng thụ hưởng:
                    </span>
                    <strong className="text-white font-bold text-[11px] leading-snug block mt-0.5">
                      {BANK_CONFIG.BANK_NAME}
                    </strong>
                  </div>

                  {/* Số tài khoản + Copy */}
                  <div className="flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800/80">
                    <div className="min-w-0 pr-2">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold block">
                        Số tài khoản (Chủ TK: {BANK_CONFIG.ACCOUNT_NAME}):
                      </span>
                      <span className="font-mono font-black text-indigo-300 text-xs sm:text-sm tracking-wide block mt-0.5">
                        {BANK_CONFIG.ACCOUNT_NO}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(BANK_CONFIG.ACCOUNT_NO, 'account')}
                      className="shrink-0 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-[10px] font-bold text-indigo-300 flex items-center gap-1 transition-all cursor-pointer border border-slate-700/60"
                      title="Sao chép Số Tài Khoản"
                    >
                      {copiedField === 'account' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-[9px]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[9px]">Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Số tiền + Copy */}
                  <div className="flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800/80">
                    <div className="min-w-0 pr-2">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold block">
                        Số tiền cần chuyển:
                      </span>
                      <span className="font-black text-emerald-400 text-xs sm:text-sm block mt-0.5">
                        {new Intl.NumberFormat('vi-VN').format(currentPrice)} VNĐ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(String(currentPrice), 'price')}
                      className="shrink-0 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-[10px] font-bold text-emerald-300 flex items-center gap-1 transition-all cursor-pointer border border-slate-700/60"
                      title="Sao chép Số Tiền"
                    >
                      {copiedField === 'price' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-[9px]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[9px]">Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Nội dung chuyển khoản (Memo) + Copy */}
                  <div className="flex items-center justify-between bg-purple-950/40 px-3 py-2 rounded-xl border border-purple-800/70">
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-purple-300 text-[9px] uppercase tracking-wider font-bold block">
                        Nội dung CK (Bắt buộc để đối soát):
                      </span>
                      <span className="font-mono font-black text-amber-300 text-[11px] sm:text-xs tracking-wider break-all block mt-0.5">
                        {currentMemo}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(currentMemo, 'memo')}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-purple-900/90 hover:bg-purple-800 active:scale-95 text-[10px] font-black text-amber-300 border border-purple-700/80 flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                      title="Sao chép Nội dung chuyển khoản"
                    >
                      {copiedField === 'memo' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-[9px]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[9px]">Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Nhập số điện thoại để liên hệ xác nhận */}
            <div className="space-y-1.5">
              <label className="font-black text-slate-200 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  3. Nhập số điện thoại để liên hệ xác nhận <span className="text-rose-400">*</span>:
                </span>
              </label>
              <input
                type="tel"
                required
                placeholder="VD: 0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white text-xs font-bold transition-all placeholder:text-slate-500"
              />
            </div>

            {/* 4. Ghi chú / Mã giao dịch chuyển khoản (Không bắt buộc) */}
            <div className="space-y-1.5">
              <label className="font-black text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                <span>4. Ghi Chú (Không bắt buộc):</span>
              </label>
              <textarea
                rows={2}
                placeholder="Nhập mã giao dịch chuyển khoản ngân hàng hoặc ghi chú thêm cho ban quản trị..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white text-xs font-medium transition-all placeholder:text-slate-500 resize-none"
              />
            </div>

            {/* Nút hành động */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>Xem lịch sử ({historyList.length})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white font-black text-xs shadow-lg shadow-indigo-600/30 cursor-pointer transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Đang Gửi...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi Yêu Cầu</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: LỊCH SỬ CÁC YÊU CẦU GIA HẠN */}
        {activeTab === 'history' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between pb-1">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>Lịch Sử Yêu Cầu Của Trường ({historyList.length})</span>
              </span>
              <button
                type="button"
                onClick={loadHistory}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1"
                title="Làm mới"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-indigo-400' : ''}`}
                />
                <span className="text-[11px]">Làm mới</span>
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="p-8 text-center space-y-2 bg-slate-950/60 rounded-2xl border border-slate-800">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-slate-400">Đang tải lịch sử...</div>
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-8 text-center space-y-2 bg-slate-950/60 rounded-2xl border border-slate-800 text-slate-400">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="font-bold text-slate-300">Chưa có yêu cầu gia hạn nào</div>
                <p className="text-[11px] text-slate-500">
                  Hãy nhấn nút &quot;Tạo Yêu Cầu Mới&quot; để gửi đề nghị gia hạn cho ban quản trị.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo Yêu Cầu Ngay</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1 custom-scrollbar">
                {historyList.map((req) => (
                  <div
                    key={req.id || req.createdAt}
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-indigo-300 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5 rounded text-[11px]">
                          {req.packageName || `Gói ${req.months} Tháng`}
                        </span>
                        {typeof req.price === 'number' && (
                          <span className="font-bold text-emerald-400 text-[11px]">
                            {new Intl.NumberFormat('vi-VN').format(req.price)} đ
                          </span>
                        )}
                        <span className="text-slate-400 text-[11px]">
                          {new Date(req.createdAt).toLocaleDateString('vi-VN')}{' '}
                          {new Date(req.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Trạng thái */}
                      {req.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Đã Duyệt</span>
                        </span>
                      ) : req.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-700">
                          <X className="w-3 h-3 text-rose-400" />
                          <span>Bị Từ Chối</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Đang Chờ Duyệt</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300 pt-1 border-t border-slate-800/60">
                      <div>
                        <span className="text-slate-500">SĐT Liên hệ: </span>
                        <strong className="text-slate-200">{req.phone}</strong>
                      </div>
                      {req.memo && (
                        <div>
                          <span className="text-slate-500">Cú pháp: </span>
                          <span className="font-mono text-amber-300 font-bold">{req.memo}</span>
                        </div>
                      )}
                      {req.notes && (
                        <div className="col-span-1 sm:col-span-2 text-slate-400 bg-slate-900 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block font-semibold text-[10px]">
                            Ghi chú / Mã GD:
                          </span>
                          <span>{req.notes}</span>
                        </div>
                      )}
                      {req.reviewedAt && (
                        <div className="col-span-1 sm:col-span-2 text-[10px] text-slate-400 pt-1">
                          Xét duyệt lúc: {new Date(req.reviewedAt).toLocaleDateString('vi-VN')}{' '}
                          {new Date(req.reviewedAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          {req.reviewedBy ? `(bởi ${req.reviewedBy})` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-between items-center border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo Yêu Cầu Mới</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
