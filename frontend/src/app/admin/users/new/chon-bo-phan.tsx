'use client';

/**
 * Ô chọn BỘ PHẬN / CẤP cho tài khoản nhân viên ở màn "Tạo tài khoản mới".
 *
 *   • Admin (`quanLyRole`) — chọn mọi bộ phận và cấp.
 *   • Trưởng phòng CSKH — chỉ bộ phận của mình, không cấp. Máy chủ chặn y hệt
 *     (TaoTaiKhoanService.kiemTra); ô ở đây chỉ để khỏi chọn rồi bị từ chối.
 */

export const BO_PHAN: { ma: string; nhan: string }[] = [
  { ma: 'CSKH', nhan: 'CSKH' },
  { ma: 'MuaHang', nhan: 'Mua hàng' },
  { ma: 'KeToan', nhan: 'Kế toán' },
  { ma: 'VanChuyen', nhan: 'Vận chuyển' },
  { ma: 'MKT', nhan: 'MKT' },
  { ma: 'Kho', nhan: 'Kho' },
  { ma: 'KhoSG', nhan: 'Kho Sài Gòn' },
  { ma: 'Admin', nhan: 'Admin' },
];
const CAP = [
  { ma: 'TruongPhong', nhan: 'Trưởng phòng' },
  { ma: 'GiamDoc', nhan: 'Giám đốc' },
];
/** Khớp BO_PHAN_TP_TAO_NHAN_VIEN ở backend. */
const BO_PHAN_TP_TAO = ['CSKH'];

/** Bộ phận người đang đăng nhập được gán cho nhân viên mới. */
export function boPhanDuocTao(laAdmin: boolean, boPhanCuaToi: string[] | undefined) {
  return laAdmin
    ? BO_PHAN
    : BO_PHAN.filter((b) => BO_PHAN_TP_TAO.includes(b.ma) && boPhanCuaToi?.includes(b.ma));
}

export function ChonBoPhan({
  laAdmin,
  ds,
  boPhan,
  cap,
  onBoPhan,
  onCap,
  loi,
}: {
  laAdmin: boolean;
  ds: { ma: string; nhan: string }[];
  boPhan: string[];
  cap: string[];
  onBoPhan: (v: string[]) => void;
  onCap: (v: string[]) => void;
  loi?: string;
}) {
  const tat = (dsCu: string[], set: (v: string[]) => void, m: string) =>
    set(dsCu.includes(m) ? dsCu.filter((x) => x !== m) : [...dsCu, m]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">
          Bộ phận <span className="ml-0.5 text-red-400">*</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ds.map((b) => (
            <label key={b.ma} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={boPhan.includes(b.ma)}
                disabled={!laAdmin}
                onChange={() => tat(boPhan, onBoPhan, b.ma)}
              />
              {b.nhan}
            </label>
          ))}
        </div>
        {loi && <p className="mt-1 text-xs text-red-500">{loi}</p>}
      </div>
      {laAdmin ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">Cấp</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CAP.map((c) => (
              <label key={c.ma} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={cap.includes(c.ma)} onChange={() => tat(cap, onCap, c.ma)} />
                {c.nhan}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Trưởng phòng tạo được nhân viên thường của bộ phận mình. Cấp Trưởng phòng hay bộ phận khác thì
          nhờ Admin.
        </p>
      )}
    </div>
  );
}
