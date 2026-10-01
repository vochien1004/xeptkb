/**
 * Dữ liệu chuẩn mẫu theo ảnh chụp Thời khóa biểu TRƯỜNG PTDTNT THPT SA THẦY
 * Đầy đủ 16 lớp (10A, 10B, 10C, 10D, 10E, 10G, 11A, 11B, 11C, 11D, 11E, 12A, 12B, 12C, 12D, 12E)
 * Cả Buổi Sáng và Buổi Chiều.
 */

export interface ExportClassColumn {
  id: string;
  name: string;
}

export const SA_THAY_CLASSES: ExportClassColumn[] = [
  { id: '10A', name: '10A' },
  { id: '10B', name: '10B' },
  { id: '10C', name: '10C' },
  { id: '10D', name: '10D' },
  { id: '10E', name: '10E' },
  { id: '10G', name: '10G' },
  { id: '11A', name: '11A' },
  { id: '11B', name: '11B' },
  { id: '11C', name: '11C' },
  { id: '11D', name: '11D' },
  { id: '11E', name: '11E' },
  { id: '12A', name: '12A' },
  { id: '12B', name: '12B' },
  { id: '12C', name: '12C' },
  { id: '12D', name: '12D' },
  { id: '12E', name: '12E' },
];

export interface ExportSlotData {
  day: number; // 2 -> 7
  period: number; // 1 -> 5
  classId: string;
  subjectWithTeacher: string; // VD: 'Toán - Tuyên'
}

// Bảng dữ liệu buổi sáng mẫu trích xuất từ ảnh
export const SA_THAY_MORNING_DATA: Record<string, string> = {
  // Thứ 2
  '2_1_ALL': 'Chào cờ',
  '2_2_10A': 'Toán - Tuyên', '2_2_10B': 'Hóa - Hiền', '2_2_10C': 'Địa - Lữ', '2_2_10D': 'Toán - Dũng', '2_2_10E': 'Toán - Thủy', '2_2_10G': 'Văn - Hương', '2_2_11A': 'Toán - Minh', '2_2_11B': 'GDKT&PL - Nhỏ', '2_2_11C': 'TAnh - Khuyên', '2_2_11D': 'TAnh - K.Hạnh', '2_2_11E': 'Sử - T.Hạnh', '2_2_12A': 'Lý - Nguyên', '2_2_12B': 'Văn - Kiều', '2_2_12C': 'Toán - Thuần', '2_2_12D': 'Công nghệ NN - Nga', '2_2_12E': 'Mỹ thuật - Hồng',
  '2_3_10A': 'Toán - Tuyên', '2_3_10B': 'Lý - Huyền', '2_3_10C': 'Hóa - Hiền', '2_3_10D': 'Văn - Dung', '2_3_10E': 'Toán - Thủy', '2_3_10G': 'TAnh - Ngoãi', '2_3_11A': 'Toán - Minh', '2_3_11B': 'GDKT&PL - Nhỏ', '2_3_11C': 'Tin - Nhân', '2_3_11D': 'TAnh - K.Hạnh', '2_3_11E': 'Văn - Hương', '2_3_12A': 'Văn - Sanh', '2_3_12B': 'Văn - Kiều', '2_3_12C': 'Văn - Thương', '2_3_12D': 'Nhạc - Châu', '2_3_12E': 'Sử - T.Hạnh',
  '2_4_10A': 'Lý - Chiến', '2_4_10B': 'Lý - Huyền', '2_4_10C': 'Toán - Dũng', '2_4_10D': 'Hóa - Thu Thủy', '2_4_10E': 'Sử - Tịnh', '2_4_10G': 'Nhạc - Châu', '2_4_11A': 'TAnh - Khuyên', '2_4_11B': 'Toán - Như', '2_4_11C': 'Tin - Nhân', '2_4_11D': 'Toán - Thuần', '2_4_11E': 'Văn - Hương', '2_4_12A': 'Văn - Sanh', '2_4_12B': 'Công nghệ NN - Nga', '2_4_12C': 'GDKT&PL - Nhỏ', '2_4_12D': 'Văn - Dung', '2_4_12E': 'Tin - Thế',
  '2_5_10A': 'Lý - Chiến', '2_5_10B': 'Toán - Tuyên', '2_5_10C': 'Toán - Dũng', '2_5_10D': 'Hóa - Thu Thủy', '2_5_10E': 'Nhạc - Châu', '2_5_10G': 'Sử - Tịnh', '2_5_11A': 'Văn - Thương', '2_5_11B': 'Toán - Như', '2_5_11C': 'GDKT&PL - Nhỏ', '2_5_11D': 'Toán - Thuần', '2_5_11E': 'Mỹ thuật - Hồng', '2_5_12A': 'Toán - Minh', '2_5_12B': 'Địa - Thu', '2_5_12C': 'TAnh - Ngoãi', '2_5_12D': 'TAnh - Khuyên', '2_5_12E': 'Tin - Thế',

  // Thứ 3
  '3_1_10A': 'Toán - Tuyên', '3_1_10B': 'TAnh - K.Hạnh', '3_1_10C': 'Văn - Sanh', '3_1_10D': 'Văn - Dung', '3_1_10E': 'Tin - Thế', '3_1_10G': 'Toán - Thủy', '3_1_11A': 'Sử - Tịnh', '3_1_11B': 'Văn - Kiều', '3_1_11C': 'Toán - Thuần', '3_1_11D': 'Văn - Thương', '3_1_11E': 'Mỹ thuật - Hồng', '3_1_12A': 'TAnh - Ngoãi', '3_1_12B': 'GDKT&PL - Nhỏ', '3_1_12C': 'Công nghệ CN - Khoa', '3_1_12D': 'Công nghệ NN - Nga', '3_1_12E': 'TAnh - Khuyên',
  '3_2_10A': 'Sử - Tịnh', '3_2_10B': 'Địa - Lữ', '3_2_10C': 'Văn - Sanh', '3_2_10D': 'Văn - Dung', '3_2_10E': 'Tin - Thế', '3_2_10G': 'Toán - Thủy', '3_2_11A': 'Văn - Thương', '3_2_11B': 'Văn - Kiều', '3_2_11C': 'Toán - Thuần', '3_2_11D': 'Hóa - Thu Thủy', '3_2_11E': 'Toán - Tuyên', '3_2_12A': 'TAnh - Ngoãi', '3_2_12B': 'Sử - T.Hạnh', '3_2_12C': 'GDKT&PL - Nhỏ', '3_2_12D': 'Mỹ thuật - Hồng', '3_2_12E': 'TAnh - Khuyên',
  '3_3_10A': 'TAnh - K.Hạnh', '3_3_10B': 'Lý - Huyền', '3_3_10C': 'Công nghệ NN - Lê Trung', '3_3_10D': 'Sử - Tịnh', '3_3_10E': 'GDKT&PL - Nhỏ', '3_3_10G': 'Tin - Nhân', '3_3_11A': 'Tin - Thế', '3_3_11B': 'TAnh - Khuyên', '3_3_11C': 'Văn - Thương', '3_3_11D': 'Hóa - Thu Thủy', '3_3_11E': 'Toán - Tuyên', '3_3_12A': 'Hóa - Hiền', '3_3_12B': 'Văn - Kiều', '3_3_12C': 'Sử - T.Hạnh', '3_3_12D': 'Mỹ thuật - Hồng', '3_3_12E': 'Công nghệ CN - Khoa',
  '3_4_10A': 'Lý - Chiến', '3_4_10B': 'Toán - Tuyên', '3_4_10C': 'Công nghệ NN - Lê Trung', '3_4_10D': 'Địa - Lữ', '3_4_10E': 'Toán - Thủy', '3_4_10G': 'GDKT&PL - Nhỏ', '3_4_11A': 'Tin - Thế', '3_4_11B': 'TAnh - Khuyên', '3_4_11C': 'Lý - Huyền', '3_4_11D': 'Sử - T.Hạnh', '3_4_11E': 'TAnh - K.Hạnh', '3_4_12A': 'Văn - Sanh', '3_4_12B': 'Văn - Kiều', '3_4_12C': 'TAnh - Ngoãi', '3_4_12D': 'Văn - Dung', '3_4_12E': 'Công nghệ CN - Khoa',
  '3_5_10A': 'Văn - Sanh', '3_5_10B': 'Hóa - Hiền', '3_5_10C': 'Sử - Tịnh', '3_5_10D': 'TAnh - K.Hạnh', '3_5_10E': 'Toán - Thủy', '3_5_10G': 'Văn - Hương', '3_5_11A': 'Lý - Huyền', '3_5_11B': 'Địa - Thu', '3_5_11C': 'Công nghệ CN - Khoa', '3_5_11D': 'Sử - T.Hạnh', '3_5_11E': 'Hóa - Quân', '3_5_12A': 'Sinh - Lê Trung', '3_5_12B': 'TAnh - Ngoãi', '3_5_12C': 'Địa - Lữ', '3_5_12D': 'Văn - Dung', '3_5_12E': 'Mỹ thuật - Hồng',

  // Thứ 4
  '4_1_10A': 'Văn - Sanh', '4_1_10B': 'TAnh - K.Hạnh', '4_1_10C': 'Sinh - Nga', '4_1_10D': 'Toán - Dũng', '4_1_10E': 'Tin - Thế', '4_1_10G': 'TAnh - Ngoãi', '4_1_11A': 'Sử - Tịnh', '4_1_11B': 'TAnh - Khuyên', '4_1_11C': 'Công nghệ CN - Khoa', '4_1_11D': 'VănCĐ - Kiều', '4_1_11E': 'Hóa - Quân', '4_1_12A': 'Sử - T.Hạnh', '4_1_12B': 'Toán - Minh', '4_1_12C': 'Địa - Lữ', '4_1_12D': 'Nhạc - Châu', '4_1_12E': 'Toán - Như',
  '4_2_10A': 'Văn - Sanh', '4_2_10B': 'TAnh - K.Hạnh', '4_2_10C': 'Sinh - Nga', '4_2_10D': 'Toán - Dũng', '4_2_10E': 'Văn - Tịnh', '4_2_10G': 'TAnh - Ngoãi', '4_2_11A': 'Công nghệ CN - Khoa', '4_2_11B': 'Văn - Kiều', '4_2_11C': 'Văn - Thương', '4_2_11D': 'Nhạc - Châu', '4_2_11E': 'Hóa - Quân', '4_2_12A': 'Hóa - Hiền', '4_2_12B': 'Toán - Minh', '4_2_12C': 'Sử - T.Hạnh', '4_2_12D': 'Toán - Như', '4_2_12E': 'Văn - Dung',
  '4_3_10A': 'Hóa - Thu Thủy', '4_3_10B': 'Văn - Sanh', '4_3_10C': 'TAnh - K.Hạnh', '4_3_10D': 'Địa - Lữ', '4_3_10E': 'Văn - Tịnh', '4_3_10G': 'Văn - Hương', '4_3_11A': 'Văn - Thương', '4_3_11B': 'Văn - Kiều', '4_3_11C': 'TAnh - Khuyên', '4_3_11D': 'Sinh - Viên', '4_3_11E': 'Công nghệ CN - Khoa', '4_3_12A': 'Toán - Minh', '4_3_12B': 'TAnh - Ngoãi', '4_3_12C': 'Tin - Nhân', '4_3_12D': 'Toán - Như', '4_3_12E': 'Văn - Dung',
  '4_4_10A': 'Hóa - Thu Thủy', '4_4_10B': 'Văn - Sanh', '4_4_10C': 'Địa - Lữ', '4_4_10D': 'Sinh - Nga', '4_4_10E': 'TAnh - Ngoãi', '4_4_10G': 'Văn - Hương', '4_4_11A': 'Văn - Thương', '4_4_11B': 'Sinh - Viên', '4_4_11C': 'TAnh - Khuyên', '4_4_11D': 'TAnh - K.Hạnh', '4_4_11E': 'Công nghệ CN - Khoa', '4_4_12A': 'Toán - Minh', '4_4_12B': 'Tin - Thế', '4_4_12C': 'Tin - Nhân', '4_4_12D': 'Sử - T.Hạnh', '4_4_12E': 'Nhạc - Châu',
  '4_5_12A': 'Lý - Nguyên', '4_5_12B': 'Tin - Thế', '4_5_12C': 'Văn - Thương', '4_5_12D': 'Công nghệ NN - Nga', '4_5_12E': 'Nhạc - Châu',

  // Thứ 5
  '5_1_10A': 'Văn - Sanh', '5_1_10B': 'Sử - Tịnh', '5_1_10C': 'TAnh - K.Hạnh', '5_1_10D': 'Hóa - Thu Thủy', '5_1_10E': 'Nhạc - Châu', '5_1_10G': 'Toán - Thủy', '5_1_11A': 'Địa - Thu', '5_1_11B': 'Sử - Sáng', '5_1_11C': 'Toán - Thuần', '5_1_11D': 'Công nghệ NN - Viên', '5_1_11E': 'Sử - T.Hạnh', '5_1_12A': 'TAnh - Ngoãi', '5_1_12B': 'GDKT&PL - Nhỏ', '5_1_12C': 'Văn - Thương', '5_1_12D': 'TAnh - Khuyên', '5_1_12E': 'Văn - Dung',
  '5_2_10A': 'Địa - Lữ', '5_2_10B': 'Toán - Tuyên', '5_2_10C': 'TAnh - K.Hạnh', '5_2_10D': 'Toán - Dũng', '5_2_10E': 'GDKT&PL - Nhỏ', '5_2_10G': 'Toán - Thủy', '5_2_11A': 'TAnh - Khuyên', '5_2_11B': 'Sử - Sáng', '5_2_11C': 'Toán - Thuần', '5_2_11D': 'Công nghệ NN - Viên', '5_2_11E': 'Địa - Thu', '5_2_12A': 'TAnh - Ngoãi', '5_2_12B': 'Sử - T.Hạnh', '5_2_12C': 'Văn - Thương', '5_2_12D': 'Toán - Như', '5_2_12E': 'Văn - Dung',
  '5_3_10A': 'Địa - Lữ', '5_3_10B': 'Toán - Tuyên', '5_3_10C': 'Hóa - Hiền', '5_3_10D': 'Văn - Dung', '5_3_10E': 'Văn - Tịnh', '5_3_10G': 'Nhạc - Châu', '5_3_11A': 'TAnh - Khuyên', '5_3_11B': 'Toán - Như', '5_3_11C': 'Sử - Sáng', '5_3_11D': 'Hóa - Thu Thủy', '5_3_11E': 'Địa - Thu', '5_3_12A': 'Văn - Sanh', '5_3_12B': 'TAnh - Ngoãi', '5_3_12C': 'Công nghệ CN - Khoa', '5_3_12D': 'Tin - Nhân', '5_3_12E': 'Sử - T.Hạnh',
  '5_4_10A': 'Toán - Tuyên', '5_4_10B': 'Địa - Lữ', '5_4_10C': 'Hóa - Hiền', '5_4_10D': 'Sinh - Nga', '5_4_10E': 'Văn - Tịnh', '5_4_10G': 'GDKT&PL - Nhỏ', '5_4_11A': 'Lý - Huyền', '5_4_11B': 'Sinh - Viên', '5_4_11C': 'Sử - Sáng', '5_4_11D': 'Nhạc - Châu', '5_4_11E': 'TAnh - K.Hạnh', '5_4_12A': 'Toán - Minh', '5_4_12B': 'TAnh - Ngoãi', '5_4_12C': 'Toán - Thuần', '5_4_12D': 'Tin - Nhân', '5_4_12E': 'Công nghệ CN - Khoa',
  '5_5_11B': 'Sinh - Viên', '5_5_11C': 'GDKT&PL - Nhỏ', '5_5_11D': 'Toán - Thuần', '5_5_11E': 'TAnh - K.Hạnh', '5_5_12A': 'Sinh - Lê Trung', '5_5_12B': 'Công nghệ NN - Nga', '5_5_12C': 'Địa - Lữ', '5_5_12D': 'Văn - Dung', '5_5_12E': 'Toán - Như',

  // Thứ 6
  '6_1_10A': 'Công nghệ CN - Chiến', '6_1_10B': 'Văn - Sanh', '6_1_10C': 'Toán - Dũng', '6_1_10D': 'TAnh - K.Hạnh', '6_1_10E': 'TAnh - Ngoãi', '6_1_10G': 'Mỹ thuật - Hồng', '6_1_11A': 'Toán - Minh', '6_1_11B': 'Công nghệ NN - Viên', '6_1_11C': 'Lý - Huyền', '6_1_11D': 'Văn - Thương', '6_1_11E': 'Văn - Hương', '6_1_12A': 'Sử - T.Hạnh', '6_1_12B': 'Địa - Thu', '6_1_12C': 'Toán - Thuần', '6_1_12D': 'TAnh - Khuyên', '6_1_12E': 'Toán - Như',
  '6_2_10A': 'Công nghệ CN - Chiến', '6_2_10B': 'Văn - Sanh', '6_2_10C': 'Toán - Dũng', '6_2_10D': 'TAnh - K.Hạnh', '6_2_10E': 'TAnh - Ngoãi', '6_2_10G': 'Mỹ thuật - Hồng', '6_2_11A': 'Toán - Minh', '6_2_11B': 'Công nghệ NN - Viên', '6_2_11C': 'Lý - Huyền', '6_2_11D': 'Văn - Thương', '6_2_11E': 'Văn - Hương', '6_2_12A': 'Tin - Thế', '6_2_12B': 'Địa - Thu', '6_2_12C': 'Toán - Thuần', '6_2_12D': 'TAnh - Khuyên', '6_2_12E': 'Toán - Như',
  '6_3_10A': 'TAnh - K.Hạnh', '6_3_10B': 'Công nghệ CN - Chiến', '6_3_10C': 'Văn - Sanh', '6_3_10D': 'Công nghệ NN - Lê Trung', '6_3_10E': 'Mỹ thuật - Hồng', '6_3_10G': 'Tin - Nhân', '6_3_11A': 'Địa - Thu', '6_3_11B': 'Toán - Như', '6_3_11C': 'Văn - Thương', '6_3_11D': 'Toán - Thuần', '6_3_11E': 'Toán - Tuyên', '6_3_12A': 'Tin - Thế', '6_3_12B': 'Toán - Minh', '6_3_12C': 'TAnh - Ngoãi', '6_3_12D': 'Sử - T.Hạnh', '6_3_12E': 'TAnh - Khuyên',
  '6_4_10A': 'TAnh - K.Hạnh', '6_4_10B': 'Công nghệ CN - Chiến', '6_4_10C': 'VănCĐ - Tịnh', '6_4_10D': 'Công nghệ NN - Lê Trung', '6_4_10E': 'Mỹ thuật - Hồng', '6_4_10G': 'Tin - Nhân', '6_4_11A': 'Lý - Huyền', '6_4_11B': 'Địa - Thu', '6_4_11C': 'Văn - Thương', '6_4_11D': 'Sinh - Viên', '6_4_11E': 'Toán - Tuyên', '6_4_12A': 'Lý - Nguyên', '6_4_12B': 'Toán - Minh', '6_4_12C': 'TAnh - Ngoãi', '6_4_12D': 'Toán - Như', '6_4_12E': 'TAnh - Khuyên',

  // Thứ 7
  '7_1_10A': 'GDĐP - Chiến', '7_1_10B': 'HĐTN - Hiền', '7_1_10C': 'HĐTN - Dũng', '7_1_10D': 'GDĐP - Lê Trung', '7_1_10E': 'GDĐP - Thủy', '7_1_10G': 'GDĐP - Châu', '7_1_11A': 'HĐTN - Th. Wũ', '7_1_11B': 'GDĐP - Viên', '7_1_11C': 'GDĐP - Nhỏ', '7_1_11D': 'GDĐP - Thu Thủy', '7_1_11E': 'HĐTN - Quân', '7_1_12A': 'HĐTN - Nguyên', '7_1_12B': 'HĐTN - Th.Sang', '7_1_12C': 'GDĐP - Tuyên', '7_1_12D': 'HĐTN - Nga', '7_1_12E': 'HĐTN - Hồng',
  '7_2_10A': 'HĐTN - Chiến', '7_2_10B': 'GDĐP - Hiền', '7_2_10C': 'GDĐP - Dũng', '7_2_10D': 'HĐTN - Lê Trung', '7_2_10E': 'HĐTN - Thủy', '7_2_10G': 'HĐTN - Th. Wũ', '7_2_11A': 'GDĐP - Thu', '7_2_11B': 'HĐTN - Viên', '7_2_11C': 'HĐTN - Huyền', '7_2_11D': 'HĐTN - Thu Thủy', '7_2_11E': 'GDĐP - Quân', '7_2_12A': 'GDĐP - Nguyên', '7_2_12B': 'GDĐP - Tuyên', '7_2_12C': 'HĐTN - Th.Sang', '7_2_12D': 'GDĐP - Châu', '7_2_12E': 'GDĐP - Hồng',
  '7_3_10A': 'SHL - Chiến', '7_3_10B': 'SHL - Hiền', '7_3_10C': 'SHL - Dũng', '7_3_10D': 'SHL - Lữ', '7_3_10E': 'SHL - Thủy', '7_3_10G': 'SHL - Hương', '7_3_11A': 'SHL - Quảng', '7_3_11B': 'SHL - Viên', '7_3_11C': 'SHL - Huyền', '7_3_11D': 'SHL - Thu Thủy', '7_3_11E': 'SHL - Quân', '7_3_12A': 'SHL - Nguyên', '7_3_12B': 'SHL - Kiều', '7_3_12C': 'SHL - Thuần', '7_3_12D': 'SHL - Nga', '7_3_12E': 'SHL - Như',
  '7_4_10A': 'CN - Chiến', '7_4_10B': 'CN - Hiền', '7_4_10C': 'CN - Dũng', '7_4_10D': 'CN - Lữ', '7_4_10E': 'CN - Thủy', '7_4_10G': 'CN - Hương', '7_4_11A': 'CN - Quảng', '7_4_11B': 'CN - Viên', '7_4_11C': 'CN - Huyền', '7_4_11D': 'CN - Thu Thủy', '7_4_11E': 'CN - Quân', '7_4_12A': 'CN - Nguyên', '7_4_12B': 'CN - Kiều', '7_4_12C': 'CN - Thuần', '7_4_12D': 'CN - Nga', '7_4_12E': 'CN - Như',
};

// Bảng dữ liệu buổi chiều mẫu trích xuất từ trang 2
export const SA_THAY_AFTERNOON_DATA: Record<string, string> = {
  // Thứ 2
  '2_1_10A': 'GDTC - Thắng', '2_1_10C': 'GDQP&AN - Quảng', '2_1_12A': 'BDHSGS - T.Hạnh', '2_1_12B': 'BDHSGS - T.Hạnh', '2_1_12C': 'GDTC - Luân', '2_1_12E': 'GDQP&AN - Trung',
  '2_2_10A': 'GDTC - Thắng', '2_2_10D': 'GDQP&AN - Quảng', '2_2_12A': 'BDHSGS - T.Hạnh', '2_2_12B': 'BDHSGS - T.Hạnh', '2_2_12C': 'GDTC - Luân', '2_2_12E': 'GDQP&AN - Trung',
  '2_3_10B': 'GDQP&AN - Quảng', '2_3_12B': 'GDTC - Thắng', '2_3_12E': 'GDQP&AN - Trung',
  '2_4_12B': 'GDTC - Thắng',

  // Thứ 3
  '3_1_11C': 'GDTC - Luân', '3_1_12B': 'GDQP&AN - Quảng', '3_1_12C': 'GDQP&AN - Trung', '3_1_12E': 'GDTC - Thắng',
  '3_2_11C': 'GDTC - Luân', '3_2_12B': 'GDQP&AN - Quảng', '3_2_12C': 'GDQP&AN - Trung', '3_2_12E': 'GDTC - Thắng',
  '3_3_12A': 'GDTC - Thắng', '3_3_12B': 'GDQP&AN - Quảng', '3_3_12C': 'GDQP&AN - Trung', '3_3_12D': 'GDTC - Luân',
  '3_4_12A': 'GDTC - Thắng', '3_4_12D': 'GDTC - Luân',

  // Thứ 4
  '4_1_10C': 'GDTC - Thắng', '4_1_11B': 'BDHSGV - Kiều', '4_1_11D': 'GDTC - Luân', '4_1_12A': 'GDQP&AN - Quảng', '4_1_12B': 'BDHSG GDKT&PL - Nhỏ', '4_1_12C': 'BDHSG GDKT&PL - Nhỏ', '4_1_12D': 'GDQP&AN - Trung',
  '4_2_10C': 'GDTC - Thắng', '4_2_11B': 'BDHSGV - Kiều', '4_2_11D': 'GDTC - Luân', '4_2_12A': 'GDQP&AN - Quảng', '4_2_12B': 'BDHSG GDKT&PL - Nhỏ', '4_2_12C': 'BDHSG GDKT&PL - Nhỏ', '4_2_12D': 'GDQP&AN - Trung',
  '4_3_12A': 'GDQP&AN - Quảng', '4_3_12B': 'BDHSGV - Hương', '4_3_12D': 'GDQP&AN - Trung',
  '4_4_12B': 'BDHSGV - Hương',

  // Thứ 5
  '5_1_10B': 'GDQP&AN - Quảng', '5_1_10D': 'GDTC - Thắng', '5_1_10G': 'GDTC - Thầy Đường', '5_1_11B': 'GDTC - Luân', '5_1_12B': 'BDHSGĐ - Thu', '5_1_12C': 'BDHSGĐ - Thu',
  '5_2_10D': 'GDTC - Thắng', '5_2_10G': 'GDTC - Thầy Đường', '5_2_11B': 'GDTC - Luân', '5_2_11D': 'GDQP&AN - Quảng', '5_2_12B': 'BDHSGĐ - Thu', '5_2_12C': 'BDHSGĐ - Thu',
  '5_3_10G': 'GDQP&AN - Trung', '5_3_11B': 'GDQP&AN - Quảng',

  // Thứ 6
  '6_1_10E': 'GDQP&AN - Quảng', '6_1_11A': 'GDTC - Luân', '6_1_11C': 'GDQP&AN - Trung',
  '6_2_10B': 'GDTC - Thắng', '6_2_10E': 'GDTC - Thầy Đường', '6_2_11A': 'GDTC - Luân', '6_2_11E': 'GDQP&AN - Quảng',
  '6_3_10B': 'GDTC - Thắng', '6_3_10E': 'GDTC - Thầy Đường', '6_3_11A': 'GDQP&AN - Quảng', '6_3_11D': 'GDTC - Luân',
  '6_4_11D': 'GDTC - Luân',
};
