/**
 * BackupManagerModal.tsx - Modal Quản lý Sao lưu & Khôi phục Dữ liệu
 * Ứng dụng: TKB Engine Pro
 * Hỗ trợ: Xuất JSON, Nhập / Kéo thả JSON, Xác nhận Chế độ Khôi phục (Ghi đè / Cập nhật gộp)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileJson,
  RefreshCw,
  X,
  Database,
  Layers,
  Users,
  GraduationCap,
  Calendar,
  Building,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  exportSystemDataToJSON,
  validateBackupJSONFile,
  importSystemDataFromJSON,
  BackupPackage,
  BackupDataPayload,
  RestoreMode,
  RestoreResult,
} from '../services/BackupService';
import { useAuth } from '../contexts/AuthContext';

interface BackupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess?: (restoredData: BackupDataPayload) => void;
  schoolId?: string;
}

export const BackupManagerModal: React.FC<BackupManagerModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
  schoolId: propSchoolId,
}) => {
  const { schoolId: authSchoolId } = useAuth();
  const currentSchoolId = propSchoolId || authSchoolId;

  // Trạng thái xuất file
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Trạng thái chọn file khôi phục
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewPackage, setPreviewPackage] = useState<BackupPackage | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Trạng thái hộp thoại xác nhận (Confirmation Dialog)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('MERGE');

  // Trạng thái đang khôi phục
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgressMsg, setRestoreProgressMsg] = useState('');

  // Toast Notification
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tự động tắt Toast sau 6 giây
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Đóng modal khi bấm phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRestoring && !isExporting) {
        if (isConfirmDialogOpen) {
          setIsConfirmDialogOpen(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConfirmDialogOpen, isRestoring, isExporting, onClose]);

  if (!isOpen) return null;

  /**
   * XỬ LÝ XUẤT DỮ LIỆU JSON
   */
  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage(null);

    try {
      const result = await exportSystemDataToJSON(currentSchoolId);
      if (result.success && result.fileName) {
        setExportMessage({
          type: 'success',
          text: `Đã tạo và tải xuống file "${result.fileName}" thành công!`,
        });
        setToast({
          type: 'success',
          title: 'Sao lưu thành công',
          message: `Đã lưu toàn bộ dữ liệu 6 collections về máy dưới tên ${result.fileName}`,
        });
      } else {
        setExportMessage({
          type: 'error',
          text: result.error || 'Có lỗi xảy ra khi tạo bản sao lưu.',
        });
        setToast({
          type: 'error',
          title: 'Sao lưu thất bại',
          message: result.error || 'Không thể đọc dữ liệu từ Firestore.',
        });
      }
    } catch (err: any) {
      setExportMessage({
        type: 'error',
        text: err?.message || 'Lỗi bất ngờ trong quá trình xuất dữ liệu.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * XỬ LÝ CHỌN FILE VÀ KIỂM TRA TÍNH HỢP LỆ
   */
  const handleFileChange = async (file: File | null) => {
    if (!file) return;

    setSelectedFile(file);
    setValidationError(null);
    setPreviewPackage(null);
    setIsValidating(true);

    try {
      const validation = await validateBackupJSONFile(file);
      if (validation.isValid && validation.parsedPackage) {
        setPreviewPackage(validation.parsedPackage);
        setValidationError(null);
      } else {
        setValidationError(validation.errorMessage || 'File sao lưu không hợp lệ.');
        setPreviewPackage(null);
      }
    } catch (err: any) {
      setValidationError(err?.message || 'Không thể phân tích dữ liệu từ file.');
      setPreviewPackage(null);
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * XỬ LÝ DRAG & DROP
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileChange(droppedFile);
    }
  };

  /**
   * MỞ HỘP THOẠI XÁC NHẬN KHÔI PHỤC
   */
  const handleOpenConfirmDialog = () => {
    if (!selectedFile || !previewPackage) {
      setToast({
        type: 'error',
        title: 'Chưa có file',
        message: 'Vui lòng chọn file JSON hợp lệ trước khi thực hiện khôi phục.',
      });
      return;
    }
    setIsConfirmDialogOpen(true);
  };

  /**
   * THỰC HIỆN KHÔI PHỤC / CẬP NHẬT DỮ LIỆU VÀO FIRESTORE
   */
  const handleExecuteRestore = async () => {
    if (!selectedFile || !previewPackage) return;

    setIsConfirmDialogOpen(false);
    setIsRestoring(true);
    setRestoreProgressMsg(
      restoreMode === 'OVERWRITE'
        ? 'Đang xóa dữ liệu cũ và nạp dữ liệu mới theo từng Batch...'
        : 'Đang kiểm tra và ghi gộp dữ liệu theo từng Batch...'
    );

    try {
      const result: RestoreResult = await importSystemDataFromJSON(
        selectedFile,
        {
          mode: restoreMode,
        },
        currentSchoolId
      );

      if (result.success) {
        setToast({
          type: 'success',
          title: 'Khôi phục hoàn tất',
          message: result.message,
        });

        // Kích hoạt callback cập nhật ngay lập tức giao diện người dùng
        if (onRestoreSuccess) {
          onRestoreSuccess(result.restoredData);
        }

        // Reset trạng thái chọn file
        setSelectedFile(null);
        setPreviewPackage(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err: any) {
      console.error('Lỗi khi khôi phục dữ liệu:', err);
      setToast({
        type: 'error',
        title: 'Khôi phục thất bại',
        message: err?.message || 'Không thể ghi dữ liệu vào Firebase. Vui lòng kiểm tra kết nối mạng.',
      });
    } finally {
      setIsRestoring(false);
      setRestoreProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isRestoring && !isExporting) onClose();
        }}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg tracking-tight">
                Quản Lý Sao Lưu & Khôi Phục Dữ Liệu
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                TKB Engine Pro • Cơ sở dữ liệu Firebase Firestore
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRestoring || isExporting}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung chính Modal */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TOAST THÔNG BÁO NỔI BẬT */}
          {toast && (
            <div
              className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-md animate-in slide-in-from-top-2 duration-200 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : toast.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-indigo-50 border-indigo-300 text-indigo-950'
              }`}
            >
              <div className="flex items-start gap-3">
                {toast.type === 'success' && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                )}
                {toast.type === 'error' && (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                {toast.type === 'info' && (
                  <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-black text-sm">{toast.title}</h4>
                  <p className="text-xs font-medium mt-0.5 opacity-90">{toast.message}</p>
                </div>
              </div>
              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* BỐ CỤC 2 CỘT: SAO LƯU (BÊN TRÁI) VÀ KHÔI PHỤC (BÊN PHẢI) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CỘT 1: SAO LƯU DỮ LIỆU (EXPORT JSON) */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">Sao Lưu Dữ Liệu</h4>
                    <p className="text-xs text-slate-500 font-medium">Xuất toàn bộ hệ thống ra file .json</p>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/80">
                  <p className="font-semibold text-slate-700">Dữ liệu được đóng gói bao gồm 6 collections:</p>
                  <ul className="grid grid-cols-2 gap-1.5 text-[11px] font-medium text-slate-600">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Giáo viên (`teachers`)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Lớp học (`classes`)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Môn học (`subjects`)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Phòng học (`rooms`)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Phân công (`assignments`)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      Thời khóa biểu (`slots`)
                    </li>
                  </ul>
                </div>

                {exportMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      exportMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {exportMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{exportMessage.text}</span>
                  </div>
                )}
              </div>

              {/* Nút bấm Xuất dữ liệu */}
              <button
                onClick={handleExport}
                disabled={isExporting || isRestoring}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang nạp dữ liệu từ Firestore & Đóng gói...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Xuất dữ liệu về máy (.json)</span>
                  </>
                )}
              </button>
            </div>

            {/* CỘT 2: KHÔI PHỤC DỮ LIỆU (IMPORT/RESTORE JSON) */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">Khôi Phục Dữ Liệu</h4>
                    <p className="text-xs text-slate-500 font-medium">Nhập file backup JSON vào hệ thống</p>
                  </div>
                </div>

                {/* Khu vực Drag & Drop / Chọn file */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01]'
                      : selectedFile
                      ? 'border-emerald-400 bg-emerald-50/30'
                      : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                      <FileJson className="w-5 h-5 text-indigo-600" />
                    </div>
                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-bold text-slate-900 truncate max-w-[240px]">
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {(selectedFile.size / 1024).toFixed(1)} KB • Bấm để chọn file khác
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Kéo thả file .json vào đây hoặc
                        </p>
                        <p className="text-[11px] text-indigo-600 font-semibold underline mt-0.5">
                          Chọn file .json từ máy
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chỉ báo kiểm tra file */}
                {isValidating && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Đang kiểm tra định dạng file...</span>
                  </div>
                )}

                {/* Thông báo lỗi validation */}
                {validationError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </div>
                )}

                {/* Thông tin tóm tắt file backup khi kiểm tra hợp lệ */}
                {previewPackage && !validationError && (
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        File hợp lệ: Phiên bản {previewPackage.version}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(previewPackage.exportedAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[11px] text-slate-600">
                      <div>
                        <span className="text-slate-400">GV:</span>{' '}
                        <strong className="text-slate-900">
                          {previewPackage.data.teachers.length}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Lớp:</span>{' '}
                        <strong className="text-slate-900">
                          {previewPackage.data.classes.length}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Môn:</span>{' '}
                        <strong className="text-slate-900">
                          {previewPackage.data.subjects.length}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Phòng:</span>{' '}
                        <strong className="text-slate-900">
                          {previewPackage.data.rooms.length}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">PCGD:</span>{' '}
                        <strong className="text-slate-900">
                          {previewPackage.data.teachingAssignments.length}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Tiết TKB:</span>{' '}
                        <strong className="text-indigo-600 font-bold">
                          {previewPackage.data.timetableSlots.length}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút bấm Bắt đầu khôi phục */}
              <button
                onClick={handleOpenConfirmDialog}
                disabled={!previewPackage || isValidating || isRestoring || isExporting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{restoreProgressMsg || 'Đang khôi phục...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Tiến hành Khôi phục dữ liệu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Firestore Batch write: Cam kết tốc độ và tính toàn vẹn (Atomic Transactions)</span>
          </div>
          <button
            onClick={onClose}
            disabled={isRestoring || isExporting}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HỘP THOẠI XÁC NHẬN KHÔI PHỤC (CONFIRMATION DIALOG VỚI 2 CHẾ ĐỘ) */}
      {/* ========================================================================= */}
      {isConfirmDialogOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsConfirmDialogOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  Xác nhận Khôi phục Dữ liệu Hệ thống
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Vui lòng chọn phương thức nạp dữ liệu từ file <strong>{selectedFile?.name}</strong> vào
                  cơ sở dữ liệu Firebase Firestore:
                </p>
              </div>
            </div>

            {/* LỰA CHỌN CHẾ ĐỘ: MERGE HOẶC OVERWRITE */}
            <div className="space-y-3">
              {/* Chế độ 1: CẬP NHẬT GỘP (Khuyên dùng) */}
              <label
                onClick={() => setRestoreMode('MERGE')}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  restoreMode === 'MERGE'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  value="MERGE"
                  checked={restoreMode === 'MERGE'}
                  onChange={() => setRestoreMode('MERGE')}
                  className="mt-1 accent-indigo-600"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-slate-900">Cập nhật gộp (MERGE)</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-indigo-100 text-indigo-700">
                      Khuyên dùng
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Giữ nguyên các dữ liệu hiện có trên Firestore. Chỉ ghi đè hoặc bổ sung các bản ghi
                    có trùng ID từ file sao lưu.
                  </p>
                </div>
              </label>

              {/* Chế độ 2: GHI ĐÈ TOÀN BỘ (Cảnh báo nguy hiểm) */}
              <label
                onClick={() => setRestoreMode('OVERWRITE')}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  restoreMode === 'OVERWRITE'
                    ? 'border-rose-600 bg-rose-50/50 ring-2 ring-rose-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  value="OVERWRITE"
                  checked={restoreMode === 'OVERWRITE'}
                  onChange={() => setRestoreMode('OVERWRITE')}
                  className="mt-1 accent-rose-600"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-rose-950">
                      Ghi đè toàn bộ (OVERWRITE)
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-100 text-rose-700">
                      Nguy hiểm
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 font-medium">
                    <strong>Xóa sạch toàn bộ</strong> tài liệu hiện có trong 6 collections trên Firestore
                    và thay thế hoàn toàn bằng dữ liệu mới từ file JSON.
                  </p>
                </div>
              </label>
            </div>

            {/* Các nút hành động trong Dialog */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsConfirmDialogOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleExecuteRestore}
                className={`px-5 py-2 rounded-xl text-white font-black text-xs shadow-md transition-all cursor-pointer ${
                  restoreMode === 'OVERWRITE'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
                }`}
              >
                {restoreMode === 'OVERWRITE'
                  ? 'Đồng ý Xóa sạch & Ghi đè'
                  : 'Xác nhận Cập nhật gộp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
