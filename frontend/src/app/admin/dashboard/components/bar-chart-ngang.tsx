'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';

export interface DongBar {
  nhan: string;
  giaTri: number;
}

interface BarChartNgangProps {
  data: DongBar[];
  /** Định dạng số trên tooltip và nhãn đầu thanh (vd kg, tiền). */
  valueFormatter?: (v: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  /** Hiện thêm tỷ trọng % cuối mỗi thanh — trả lời "tuyến này chiếm bao nhiêu phần". */
  hienTyTrong?: boolean;
  height?: number;
}

/**
 * Biểu đồ thanh NGANG.
 *
 * Nằm ngang chứ không dựng đứng vì nhãn ở đây là tên tuyến, tên nhân viên —
 * chữ dài. Thanh dọc thì nhãn phải xoay nghiêng hoặc bị cắt, đọc rất mệt.
 *
 * Màu nhạt dần theo thứ hạng thay vì mỗi thanh một màu: màu ở đây không mang
 * thêm thông tin nào, loè loẹt chỉ làm khó so chiều dài thanh — mà chiều dài
 * mới là thứ cần so.
 */
const MAU_DAM = '#14264b';

const rutGon = (v: number): string => {
  const n = Math.abs(v);
  if (n >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (n >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  // Một chữ số lẻ ở mốc nghìn: làm tròn chẵn thì 1.600 và 2.400 cùng ra "2k",
  // trục hiện hai vạch trùng tên, còn thanh 2.842 kg thì ghi là "3k".
  if (n >= 1e3) return `${(v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
};

export function BarChartNgang({
  data,
  valueFormatter,
  loading,
  emptyMessage = 'Không có dữ liệu trong khoảng đã chọn',
  hienTyTrong = false,
  height,
}: BarChartNgangProps) {
  if (loading) return <div className="h-64 bg-gray-50 animate-pulse rounded" />;
  if (!data || data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-sm text-gray-400">{emptyMessage}</div>;
  }

  const tong = data.reduce((s, d) => s + (d.giaTri || 0), 0);
  const dinhDang = valueFormatter ?? ((v: number) => v.toLocaleString('vi-VN'));

  // Mỗi thanh ~34px, cộng chỗ cho trục dưới. Để chiều cao chạy theo số dòng,
  // nếu không thì 3 tuyến cũng chiếm chỗ bằng 12 tuyến, nhìn rỗng tuếch.
  const cao = height ?? Math.max(160, data.length * 34 + 40);

  // Thanh dài nhất chừa thêm chỗ cuối trục để nhãn "2.814,5 (82%)" không bị cắt.
  const lonNhat = Math.max(...data.map((d) => d.giaTri || 0), 0);

  return (
    <ResponsiveContainer width="100%" height={cao}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis type="number" tickFormatter={rutGon} domain={[0, lonNhat * 1.08 || 1]} fontSize={12} />
        <YAxis type="category" dataKey="nhan" width={130} fontSize={12} interval={0} />
        <Tooltip
          // recharts gõ kiểu tham số rất rộng (ValueType), ép về số ngay tại đây
          // thay vì chiều theo kiểu của thư viện cho cả hàm.
          formatter={(v) => {
            const n = Number(v) || 0;
            return [dinhDang(n) + (hienTyTrong && tong > 0 ? ` (${((n / tong) * 100).toFixed(1)}%)` : ''), ''];
          }}
          labelStyle={{ color: MAU_DAM, fontWeight: 600 }}
          separator=""
        />
        <Bar dataKey="giaTri" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {data.map((_, i) => (
            // Nhạt dần theo thứ hạng, chạm đáy 0.35 để thanh cuối vẫn đọc được.
            <Cell key={i} fill={MAU_DAM} fillOpacity={Math.max(0.35, 1 - i * 0.07)} />
          ))}
          <LabelList
            dataKey="giaTri"
            position="right"
            fontSize={11}
            fill="#475569"
            formatter={(v) => {
              const n = Number(v) || 0;
              return hienTyTrong && tong > 0 ? `${rutGon(n)} (${Math.round((n / tong) * 100)}%)` : rutGon(n);
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
