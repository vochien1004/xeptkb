/**
 * userGuideData.ts - Dữ liệu Hướng dẫn sử dụng TKB Engine Pro
 * Cung cấp danh sách các chủ đề hướng dẫn, các bước thực hiện chi tiết và link video YouTube nhúng.
 * Dễ dàng mở rộng, chỉnh sửa nội dung hoặc thay link YouTube.
 */

export interface GuideTopic {
  id: string;
  title: string;
  icon: string; // Tên icon Lucide tương ứng (UserPlus, FileSpreadsheet, Layers, Sparkles, Printer, Database...)
  summary: string;
  steps: string[];
  youtubeUrl: string;
  tips?: string[];
  tags?: string[];
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'guide-input-data',
    title: '1. Thêm thông tin Giáo viên, Lớp, Môn học',
    icon: 'UserPlus',
    summary: 'Hướng dẫn thiết lập hồ sơ Giáo viên, danh mục Môn học và Lớp học nhanh chóng qua Form nhập hoặc File Excel.',
    steps: [
      'Bước 1: Chọn menu "Nhập Thông Tin" trên thanh điều hướng bên trái.',
      'Bước 2: Chọn thẻ tương ứng muốn thêm (Giáo Viên, Môn Học, hoặc Lớp Học).',
      'Bước 3 (Thêm thủ công): Điền đầy đủ thông tin vào biểu mẫu (Họ tên, Mã viết tắt, Tiết tối đa/tuần, Tiết bận, v.v.) và nhấn "Thêm Mới".',
      'Bước 4 (Nhập từ Excel): Chọn "Nhập File Excel", tải về file mẫu (nếu cần), chọn file từ máy tính và nhấn "Xác Nhận Nhập Dữ Liệu".',
      'Bước 5: Kiểm tra danh sách hiển thị bên dưới. Mọi thay đổi đều được tự động lưu trữ và đồng bộ tức thì lên Firebase Cloud.'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Nên đặt mã viết tắt ngắn gọn (VD: Nam, Thủy, Toán, Văn) để thời khóa biểu hiển thị đẹp mắt trên ô lưới.',
      'Khai báo đúng các tiết bận của giáo viên để thuật toán tự động tránh xếp trùng vào các tiết đó.'
    ],
    tags: ['Giáo viên', 'Lớp học', 'Môn học', 'Nhập liệu', 'Excel']
  },
  {
    id: 'guide-teaching-assignments',
    title: '2. Phân công chuyên môn (Giảng dạy - PCGD)',
    icon: 'FileSpreadsheet',
    summary: 'Hướng dẫn giao môn, lớp và số tiết/tuần cho từng giáo viên, kiểm soát định mức tiết dạy.',
    steps: [
      'Bước 1: Truy cập menu "PCGD & Chuyên Môn".',
      'Bước 2: Tìm giáo viên cần phân công từ danh sách hoặc thanh tìm kiếm nhanh.',
      'Bước 3: Nhấn mở rộng thẻ giáo viên, chọn các Môn học và Lớp học mà giáo viên đó phụ trách.',
      'Bước 4: Điều chỉnh số tiết/tuần cho từng môn (hoặc chỉnh sửa nhanh trực tiếp tại cột "Số Tiết / Tuần").',
      'Bước 5: Nhấn "Lưu Phân Công Chuyên Môn" để lưu lại.',
      'Bước 6: Xem bảng thống kê đối chiếu Thừa / Thiếu phía trên để đảm bảo tổng số tiết giao khớp với chỉ tiêu định mức.'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Sử dụng nút "Gán Tiết SHL (Toàn Trường)" để tự động giao 1 tiết Sinh hoạt lớp vào Thứ 7 cho toàn bộ Giáo viên Chủ nhiệm.',
      'Hệ thống sẽ tự động đồng bộ mã giáo viên vào các tiết đã phân trên TKB ngay khi bạn cập nhật phân công.'
    ],
    tags: ['PCGD', 'Phân công', 'Định mức', 'Chuyên môn', 'Tiết dạy']
  },
  {
    id: 'guide-merged-classes',
    title: '3. Thêm lớp ghép / Môn ghép (Co-teaching)',
    icon: 'Layers',
    summary: 'Hướng dẫn tạo nhóm học ghép (Thể dục, Giáo dục quốc phòng, Tin học...) hoặc nhóm nhiều giáo viên cùng dạy.',
    steps: [
      'Bước 1: Chọn menu "Ghép Lớp" trên thanh điều hướng.',
      'Bước 2: Nhấn nút "Tạo Nhóm Ghép Lớp Mới".',
      'Bước 3: Chọn Môn học cần ghép (ví dụ: Thể Dục, GDQP-AN).',
      'Bước 4: Chọn từ 2 lớp học trở lên cùng tham gia nhóm ghép.',
      'Bước 5: Chọn 1 hoặc nhiều giáo viên cùng phụ trách (hỗ trợ Co-teaching).',
      'Bước 6: Nhập số tiết/tuần và phòng học/sân bãi yêu cầu, sau đó nhấn "Lưu Nhóm Ghép".',
      'Bước 7: Khi xếp lịch, các lớp trong nhóm ghép sẽ luôn được bố trí cùng một khung giờ và không bị tách rời.'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Tiết ghép được ưu tiên số 1 trong thuật toán CSP để tránh xung đột phòng học và lịch dạy đồng thời.'
    ],
    tags: ['Ghép lớp', 'Môn ghép', 'Co-teaching', 'Thể dục', 'GDQP']
  },
  {
    id: 'guide-schedule-distribution',
    title: '4. Phân Thời khóa biểu (Tự động & Bằng tay)',
    icon: 'Sparkles',
    summary: 'Hướng dẫn sử dụng công cụ Phân TKB tương tác, kéo thả/click xếp tiết trực quan và giải thuật toán AI tự động.',
    steps: [
      'Bước 1: Vào menu "Phân Thời Khóa Biểu".',
      'Bước 2: Chọn Lớp học muốn xếp lịch ở thanh chọn lớp.',
      'Bước 3: Nhấp chọn thẻ môn học bên dưới thanh công cụ (thẻ hiển thị rõ số tiết đã xếp / tổng số tiết được giao).',
      'Bước 4: Nhấp vào ô trống trên lưới TKB để đặt tiết học. Nhấp vào ô đã có môn để gỡ/xóa tiết.',
      'Bước 5 (Xếp Tự Động): Nhấn nút "Xếp Tự Động (AI Solver)" để hệ thống tự động tính toán phân bổ tối ưu theo thuật toán CSP + Genetic.',
      'Bước 6: Quan sát các chỉ báo màu sắc (Đủ tiết - Xanh, Thiếu tiết - Vàng, Trùng lịch/Lịch bận - Cảnh báo đỏ).'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Hệ thống tự động kiểm tra lịch bận, không cho xếp trùng giáo viên cùng 1 thời điểm ở 2 lớp khác nhau.',
      'Có thể sử dụng nút "Quay lại (Undo)" và "Làm lại (Redo)" để hoàn tác các thao tác vừa thực hiện.'
    ],
    tags: ['Phân TKB', 'Xếp lịch', 'Tự động', 'Thủ công', 'AI Solver', 'CSP']
  },
  {
    id: 'guide-export-print',
    title: '5. Xuất Thời khóa biểu (Excel / PDF / Bản in)',
    icon: 'Printer',
    summary: 'Hướng dẫn xuất file Thời khóa biểu toàn trường, theo từng Lớp hoặc từng Giáo viên định dạng Excel, PDF chuẩn in.',
    steps: [
      'Bước 1: Chọn menu "Xuất & In File TKB".',
      'Bước 2: Chọn mẫu hiển thị mong muốn: Bảng tổng hợp toàn trường, TKB theo từng Lớp học, hoặc TKB theo từng Giáo viên.',
      'Bước 3: Chỉnh sửa thông tin tiêu đề trường học, năm học, học kỳ và ngày áp dụng trong phần Cấu hình xuất file.',
      'Bước 4 (Xuất Excel): Nhấn nút "Xuất File Excel (.xlsx)" để tải về file bảng tính đầy đủ định dạng màu sắc và viền kẻ chuẩn Bộ GD&ĐT.',
      'Bước 5 (In ấn / PDF): Nhấn nút "In / Lưu PDF" để mở hộp thoại in trực tiếp trên trình duyệt.'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Cấu hình xuất TKB (Tên trường, Năm học, Học kỳ) sẽ tự động được lưu trữ trên Firebase để tái sử dụng ở các lần sau.'
    ],
    tags: ['Xuất file', 'In ấn', 'Excel', 'PDF', 'Toàn trường', 'Giáo viên']
  },
  {
    id: 'guide-backup-restore',
    title: '6. Sao lưu và Phục hồi dữ liệu (Backup & Restore)',
    icon: 'Database',
    summary: 'Hướng dẫn tạo file sao lưu JSON an toàn vào máy tính và khôi phục lại dữ liệu hệ thống bất kỳ lúc nào.',
    steps: [
      'Bước 1: Nhấn menu "Sao lưu dữ liệu" ở thanh bên trái.',
      'Bước 2 (Sao lưu): Trong tab "Xuất Bản Sao Lưu", nhập ghi chú phiên bản và nhấn "Tải File Sao Lưu (.JSON)" để lưu toàn bộ dữ liệu về máy.',
      'Bước 3 (Khôi phục): Chuyển sang tab "Khôi Phục Dữ Liệu", chọn hoặc kéo thả file .json đã sao lưu trước đó vào khung.',
      'Bước 4: Kiểm tra bản xem trước số lượng Giáo viên, Lớp, Môn học, PCGD và Tiết TKB được trích xuất từ file.',
      'Bước 5: Chọn chế độ khôi phục (Ghi đè toàn bộ hoặc Cập nhật bổ sung) và nhấn "Bắt Đầu Khôi Phục".',
      'Bước 6: Dữ liệu sau khi phục hồi sẽ tự động đồng bộ ngay lên Firebase Firestore và sẵn sàng sử dụng.'
    ],
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    tips: [
      'Nên tạo một bản sao lưu JSON trước khi thực hiện các thay đổi lớn hoặc trước khi nạp dữ liệu năm học mới.',
      'File JSON sao lưu chứa 100% dữ liệu: Giáo viên, Lớp, Môn học, Phòng, PCGD và các tiết TKB hiện tại.'
    ],
    tags: ['Sao lưu', 'Khôi phục', 'Backup', 'Restore', 'JSON', 'Cloud']
  }
];
