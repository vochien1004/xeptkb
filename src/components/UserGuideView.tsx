/**
 * UserGuideView.tsx - Màn hình Hướng dẫn sử dụng TKB Engine Pro
 * Thiết kế giao diện Accordion hiện đại, dễ theo dõi với các bước chi tiết và video YouTube nhúng.
 */

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  HelpCircle,
  Play,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Video,
  Layers,
  FileSpreadsheet,
  UserPlus,
  Printer,
  Database,
  Tag,
  Maximize2,
  Compass,
} from 'lucide-react';
import { GUIDE_TOPICS, GuideTopic } from '../data/userGuideData';

interface Props {
  onNavigateToTab?: (
    tab: 'DISTRIBUTOR' | 'MERGED' | 'GRID' | 'TEACHER_TIMETABLE' | 'INPUT' | 'VALIDATION' | 'DATA' | 'EXPORT' | 'BACKUP'
  ) => void;
}

export const UserGuideView: React.FC<Props> = ({ onNavigateToTab }) => {
  // Trạng thái tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Trạng thái mở rộng Accordion (mặc định mở mục đầu tiên)
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(
    new Set([GUIDE_TOPICS[0]?.id || ''])
  );

  // Toggle accordion
  const toggleTopic = (id: string) => {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Mở tất cả / Thu gọn tất cả
  const handleExpandAll = () => {
    setExpandedTopicIds(new Set(GUIDE_TOPICS.map((t) => t.id)));
  };

  const handleCollapseAll = () => {
    setExpandedTopicIds(new Set());
  };

  // Danh sách toàn bộ các thẻ tag
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    GUIDE_TOPICS.forEach((topic) => {
      topic.tags?.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, []);

  // Lọc chủ đề theo tìm kiếm và tag
  const filteredTopics = useMemo(() => {
    return GUIDE_TOPICS.filter((topic) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        topic.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        topic.steps.some((step) => step.toLowerCase().includes(searchQuery.toLowerCase())) ||
        topic.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchTag = !selectedTag || topic.tags?.includes(selectedTag);

      return matchSearch && matchTag;
    });
  }, [searchQuery, selectedTag]);

  // Ánh xạ icon tương ứng với tên icon
  const getTopicIcon = (iconName: string) => {
    switch (iconName) {
      case 'UserPlus':
        return <UserPlus className="w-5 h-5 text-emerald-600" />;
      case 'FileSpreadsheet':
        return <FileSpreadsheet className="w-5 h-5 text-amber-600" />;
      case 'Layers':
        return <Layers className="w-5 h-5 text-purple-600" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-rose-600" />;
      case 'Printer':
        return <Printer className="w-5 h-5 text-cyan-600" />;
      case 'Database':
        return <Database className="w-5 h-5 text-indigo-600" />;
      default:
        return <BookOpen className="w-5 h-5 text-indigo-600" />;
    }
  };

  // Ánh xạ nút điều hướng trực tiếp tới từng chức năng
  const getNavigationButton = (topicId: string) => {
    if (!onNavigateToTab) return null;

    switch (topicId) {
      case 'guide-input-data':
        return (
          <button
            onClick={() => onNavigateToTab('INPUT')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Menu "Nhập Thông Tin"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'guide-teaching-assignments':
        return (
          <button
            onClick={() => onNavigateToTab('DATA')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Menu "PCGD & Chuyên Môn"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'guide-merged-classes':
        return (
          <button
            onClick={() => onNavigateToTab('MERGED')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Menu "Ghép Lớp"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'guide-schedule-distribution':
        return (
          <button
            onClick={() => onNavigateToTab('DISTRIBUTOR')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Menu "Phân Thời Khóa Biểu"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'guide-export-print':
        return (
          <button
            onClick={() => onNavigateToTab('EXPORT')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Menu "Xuất & In File TKB"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'guide-backup-restore':
        return (
          <button
            onClick={() => onNavigateToTab('BACKUP')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Mở Hộp Thoại "Sao Lưu Dữ Liệu"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* HEADER BANNER CHÍNH */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50 relative overflow-hidden">
        {/* Background decorative glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-black tracking-wide uppercase">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>Trung Tâm Trợ Giúp & Tài Liệu Hướng Dẫn</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-indigo-400 shrink-0" />
              <span>Hướng Dẫn Sử Dụng TKB Engine Pro</span>
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Tổng hợp quy trình từng bước, mẹo nghiệp vụ và video hướng dẫn trực quan để bạn nhanh chóng làm chủ toàn bộ tính năng xếp thời khóa biểu thông minh, ghép lớp và xuất in báo cáo.
            </p>
          </div>

          {/* Quick Stats Widget */}
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <div className="text-2xl font-black text-amber-300">{GUIDE_TOPICS.length}</div>
              <div className="text-[11px] font-bold text-slate-300 uppercase mt-0.5">Chủ Đề Hướng Dẫn</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <div className="text-2xl font-black text-emerald-400">100%</div>
              <div className="text-[11px] font-bold text-slate-300 uppercase mt-0.5">Có Video Trực Quan</div>
            </div>
          </div>
        </div>
      </div>

      {/* THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC THẺ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Ô tìm kiếm */}
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm chủ đề, từ khóa, thao tác..."
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

          {/* Nút thao tác nhanh */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleExpandAll}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Mở Tất Cả</span>
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Thu Gọn</span>
            </button>
          </div>
        </div>

        {/* Thanh Tags Lọc Nhanh */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
          <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1 mr-1">
            <Tag className="w-3 h-3" />
            Lọc theo thẻ:
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTag === null
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            Tất cả ({GUIDE_TOPICS.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedTag === tag
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* DANH SÁCH CÁC MỤC HƯỚNG DẪN DẠNG ACCORDION */}
      <div className="space-y-4">
        {filteredTopics.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
            <HelpCircle className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Không tìm thấy hướng dẫn phù hợp</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Không có kết quả nào khớp với từ khóa "{searchQuery}". Vui lòng thử tìm kiếm với từ khóa khác hoặc bấm "Tất cả".
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTag(null);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
            >
              Xóa Bộ Lọc
            </button>
          </div>
        ) : (
          filteredTopics.map((topic, index) => {
            const isExpanded = expandedTopicIds.has(topic.id);

            return (
              <div
                key={topic.id}
                className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-xs ${
                  isExpanded
                    ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {/* ACCORDION HEADER (THANH TIÊU ĐỀ CÓ THỂ CLICK ĐỂ MỞ/ĐÓNG) */}
                <div
                  onClick={() => toggleTopic(topic.id)}
                  className={`p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-indigo-50/50 border-b border-indigo-100' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                        isExpanded
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {getTopicIcon(topic.icon)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                          {topic.title}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-1">
                          <Video className="w-2.5 h-2.5 text-indigo-700" />
                          <span>Video HD</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 sm:line-clamp-none font-medium">
                        {topic.summary}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden md:flex items-center gap-1">
                      {topic.tags?.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div
                      className={`p-2 rounded-xl transition-transform ${
                        isExpanded ? 'bg-indigo-600 text-white rotate-180' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* ACCORDION CONTENT (NỘI DUNG CHI TIẾT: VĂN BẢN VÀ VIDEO YOUTUBE) */}
                {isExpanded && (
                  <div className="p-5 sm:p-7 space-y-6 bg-white animate-fade-in">
                    {/* KHUNG NỘI DUNG 2 CỘT (RESPONSIVE GRID: TRÁI LÀ CÁC BƯỚC, PHẢI LÀ VIDEO NHÚNG) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* CỘT TRÁI (7 CỘT): VĂN BẢN HƯỚNG DẪN CÁC BƯỚC THỰC HIỆN */}
                      <div className="lg:col-span-7 space-y-5">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 className="text-xs font-black uppercase text-indigo-950 tracking-wider flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                              <span>Quy Trình Các Bước Thực Hiện</span>
                            </h4>
                            <span className="text-[11px] font-bold text-slate-400">
                              {topic.steps.length} bước
                            </span>
                          </div>

                          {/* Danh sách các bước dạng Bullet Points */}
                          <div className="space-y-2.5">
                            {topic.steps.map((step, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-start gap-3 text-xs text-slate-800 font-medium leading-relaxed"
                              >
                                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                                  {sIdx + 1}
                                </div>
                                <div className="pt-0.5 flex-1">
                                  {step.startsWith(`Bước ${sIdx + 1}:`) ? (
                                    <>
                                      <strong className="text-indigo-950 font-black">
                                        {step.split(':')[0]}:
                                      </strong>
                                      {step.substring(step.indexOf(':') + 1)}
                                    </>
                                  ) : (
                                    step
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Mẹo nghiệp vụ / Pro Tips */}
                        {topic.tips && topic.tips.length > 0 && (
                          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-300/80 space-y-2">
                            <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wide">
                              <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Mẹo & Lưu Ý Nghiệp Vụ Quan Trọng:</span>
                            </div>
                            <ul className="space-y-1.5 pl-5 list-disc text-xs text-amber-900 font-medium">
                              {topic.tips.map((tip, tIdx) => (
                                <li key={tIdx}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Nút hành động trực tiếp */}
                        <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
                          {getNavigationButton(topic.id)}
                          <div className="flex items-center gap-1.5">
                            {topic.tags?.map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* CỘT PHẢI (5 CỘT): VIDEO YOUTUBE NHÚNG (EMBED) */}
                      <div className="lg:col-span-5 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                            <Video className="w-4 h-4 text-rose-600" />
                            <span>Video Minh Họa Thao Tác</span>
                          </h4>
                          <a
                            href={topic.youtubeUrl.replace('/embed/', '/watch?v=')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <span>Xem trên YouTube</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* Video Container (16:9 Aspect Ratio) */}
                        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-md">
                          <iframe
                            src={topic.youtubeUrl}
                            title={`Video hướng dẫn: ${topic.title}`}
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>

                        <div className="p-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-medium flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Video hướng dẫn chi tiết từng thao tác thực tế.</span>
                          </span>
                          <span className="font-bold text-slate-700">Chất lượng 1080p</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* FOOTER TRỢ GIÚP BỔ SUNG */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3 shadow-xs">
        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto">
          <HelpCircle className="w-5 h-5" />
        </div>
        <h3 className="text-sm sm:text-base font-black text-slate-900">
          Bạn cần hỗ trợ thêm về quy tắc phân công hoặc thuật toán xếp lịch?
        </h3>
        <p className="text-xs text-slate-500 max-w-xl mx-auto">
          Hệ thống TKB Engine Pro được xây dựng chuẩn theo chương trình GDPT 2018 với thuật toán tối ưu hóa CSP + Di truyền (Genetic Algorithm), đảm bảo 100% không bị trùng tiết giáo viên và phòng học.
        </p>
      </div>
    </div>
  );
};
