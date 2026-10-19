'use client';

import { GiaiThichChiSo, MucGiaiThich } from './giai-thich-chi-so';

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** Có thì hiện dấu ⓘ cạnh nhãn: ý nghĩa, cách tính, điều kiện ghi nhận. */
  giaiThich?: MucGiaiThich;
}

export function KPICard({ label, value, unit, icon, trend, giaiThich }: KPICardProps) {
  return (
    <div className="bg-white rounded-lg border border-[#14264b]/20 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 font-medium mb-2 flex items-center gap-1.5">
            {label}
            {giaiThich && <GiaiThichChiSo nhan={label} noiDung={giaiThich} />}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-[#14264b]">{value}</p>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {trend && (
            <div className={`text-xs font-medium mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        {icon && <div className="text-[#14264b]/60 flex-shrink-0">{icon}</div>}
      </div>
    </div>
  );
}
