'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';

/**
 * Biểu đồ cột theo THÁNG, có thể chồng thêm một đường.
 *
 * Dùng cho hai khối trên màn tổng quan của khách:
 *   • Sản lượng từng tháng — một cột.
 *   • Công nợ từng tháng — hai cột (phát sinh / đã trả) + đường dư nợ lũy kế.
 *
 * Cột dọc (không nằm ngang như `bar-chart-ngang`) vì trục ở đây là thời gian:
 * người đọc quen trái → phải là cũ → mới, xoay ngang thì phải nghiêng đầu.
 *
 * Đường lũy kế đi kèm cột là cố ý: hai cột trả lời "tháng này phát sinh và trả
 * bao nhiêu", đường trả lời "nên cuối tháng còn nợ bao nhiêu". Tách thành hai
 * biểu đồ thì phải nhìn qua nhìn lại mới nối được hai câu đó với nhau.
 */

export interface CotThang {
  /** yyyy-MM */
  thang: string;
  [key: string]: string | number;
}

export interface SeriesCot {
  key: string;
  nhan: string;
  mau: string;
}

interface Props {
  data: CotThang[];
  cot: SeriesCot[];
  /** Đường chồng lên cột — thường là số lũy kế. */
  duong?: SeriesCot;
  dinhDang?: (v: number) => string;
  /** Ghi số lên đầu cột. Chỉ nên bật khi có 1 cột, 2 cột thì chữ chen nhau. */
  hienSoTrenCot?: boolean;
  height?: number;
  dangTai?: boolean;
}

/** yyyy-MM -> MM/yyyy, bỏ năm khi vẫn trong năm nay cho trục đỡ chật. */
const nhanThang = (t: string): string => {
  const [nam, thang] = String(t).split('-');
  if (!nam || !thang) return String(t);
  const namNay = String(new Date().getFullYear());
  return nam === namNay ? `T${Number(thang)}` : `${thang}/${nam.slice(2)}`;
};

const rutGon = (v: number): string => {
  const n = Math.abs(v);
  if (n >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (n >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (n >= 1e3) return `${(v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  // Một chữ số lẻ, khớp với cách các ô số đầu màn hiện kg. Hai chữ số ("181,74
  // kg") vừa dài vừa không ai dùng tới, mà lại lệch với ô số ngay phía trên.
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
};

export function BarChartThang({
  data,
  cot,
  duong,
  dinhDang,
  hienSoTrenCot = false,
  height = 280,
  dangTai,
}: Props) {
  if (dangTai) return <div className="h-64 bg-gray-50 animate-pulse rounded" />;
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400">
        Chưa có dữ liệu
      </div>
    );
  }

  const dd = dinhDang ?? ((v: number) => v.toLocaleString('vi-VN'));

  // Trục phải chỉ dựng khi có đường lũy kế: dư nợ và tiền phát sinh lệch nhau
  // cả chục lần, dùng chung một trục thì đường bị ép sát đáy, nhìn như bằng 0.
  const coTrucPhai = Boolean(duong);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: coTrucPhai ? 8 : 4, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="thang" tickFormatter={nhanThang} fontSize={11} interval={0} />
        <YAxis yAxisId="trai" tickFormatter={rutGon} fontSize={11} width={52} />
        {coTrucPhai && (
          <YAxis yAxisId="phai" orientation="right" tickFormatter={rutGon} fontSize={11} width={52} />
        )}
        <Tooltip
          formatter={(v, ten) => [dd(Number(v) || 0), String(ten)]}
          labelFormatter={(t) => {
            const [nam, thang] = String(t).split('-');
            return `Tháng ${Number(thang)}/${nam}`;
          }}
          contentStyle={{ fontSize: 12 }}
        />
        {(cot.length > 1 || duong) && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {cot.map((c) => (
          <Bar key={c.key} yAxisId="trai" dataKey={c.key} name={c.nhan} fill={c.mau} radius={[3, 3, 0, 0]} maxBarSize={38}>
            {hienSoTrenCot && cot.length === 1 && (
              <LabelList
                dataKey={c.key}
                position="top"
                fontSize={10}
                fill="#475569"
                formatter={(v) => {
                  const n = Number(v) || 0;
                  // Ẩn số 0: tháng khách không gửi gì mà vẫn ghi "0" trên đầu
                  // cột rỗng chỉ làm rối trục.
                  return n === 0 ? '' : rutGon(n);
                }}
              />
            )}
          </Bar>
        ))}
        {duong && (
          <Line
            yAxisId="phai"
            type="monotone"
            dataKey={duong.key}
            name={duong.nhan}
            stroke={duong.mau}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
