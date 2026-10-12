/**
 * Lớp chắn đặt TRƯỚC backend chạy local để bấm thử thoải mái.
 *
 * Backend local nối thẳng vào SQL Server THẬT — bấm một nút ghi là ghi vào sổ
 * thật. Lớp này chặn MỌI lời gọi ghi, trả kết quả thành công giả, và in ra thân
 * JSON mà web gửi lên để còn xem được nó định ghi gì.
 *
 * VÌ SAO GIỜ CHẶN TẤT: bản đầu chỉ chặn đúng một đường —
 * `POST /api/debt-reports/management/import` — còn mọi lệnh ghi khác đi thẳng
 * xuống CSDL thật. Tên tệp là "chặn ghi" nên ai đọc cũng tưởng nó chặn ghi, và
 * ngày 10/10/2026 tôi đã tin như vậy rồi gửi một loạt lệnh thử qua cổng này:
 * `DELETE /api/roles/:id` đi thẳng xuống và XOÁ THẬT vai trò Admin trên CSDL
 * sản xuất, kéo 19 dòng AspNetUserRoles thành mồ côi và đẩy 17 tài khoản nhân
 * viên ra khỏi khu vực quản trị. Một công cụ an toàn phải an toàn theo mặc
 * định; danh sách cho phép thì ngắn và phải gõ ra tận tay.
 *
 *   CONG_BE=3101 node backend/scripts/chan-ghi.cjs
 *
 * Cho qua một vài đường ghi khi cần thử thật (ngăn cách bằng dấu phẩy, dạng
 * `PHUONG_THUC đường-dẫn`):
 *
 *   CHO_GHI='POST /api/orders,PUT /api/orders/123' node backend/scripts/chan-ghi.cjs
 */
const http = require('node:http');

const DICH = { host: '127.0.0.1', port: Number(process.env.CONG_BE || 3001) };
const CONG = Number(process.env.CONG || 3094);

const DOC = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Những đường ghi được cho qua, do người chạy tự khai. */
const CHO_GHI = new Set(
  (process.env.CHO_GHI || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, ' ').toUpperCase()),
);

/**
 * Đăng nhập là POST nhưng không ghi gì vào dữ liệu nghiệp vụ, mà chặn nó thì
 * không bấm thử được gì cả.
 */
const NGOAI_LE = [
  { ph: 'POST', duong: '/api/auth/login' },
  { ph: 'POST', duong: '/api/auth/refresh' },
];

const choPhep = (ph, duong) => {
  if (DOC.has(ph)) return true;
  if (NGOAI_LE.some((x) => x.ph === ph && x.duong === duong)) return true;
  return CHO_GHI.has(`${ph} ${duong}`.toUpperCase());
};

const may = http.createServer((req, res) => {
  const duong = req.url.split('?')[0];
  const ph = (req.method || 'GET').toUpperCase();

  if (!choPhep(ph, duong)) {
    let than = '';
    req.on('data', (d) => (than += d));
    req.on('end', () => {
      let rows = [];
      try {
        rows = JSON.parse(than).rows ?? [];
      } catch {
        /* thân hỏng hoặc không phải JSON thì coi như rỗng */
      }
      console.log(`\n[CHAN] ${ph} ${duong} — KHONG ghi vao DB`);
      if (than) console.log('   than:', than.slice(0, 2000));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          successCount: rows.length,
          failCount: 0,
          chanBoiLopChanGhi: true,
          results: rows.map((_, i) => ({
            row: i + 1,
            success: true,
            message: 'Ban local: khong ghi vao DB',
          })),
        }),
      );
    });
    return;
  }

  const di = http.request(
    {
      ...DICH,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${DICH.host}:${DICH.port}` },
    },
    (tra) => {
      res.writeHead(tra.statusCode || 502, tra.headers);
      tra.pipe(res);
    },
  );
  di.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Backend local chua chay? ' + e.message }));
  });
  req.pipe(di);
});

may.listen(CONG, () => {
  console.log(`chan-ghi: ${CONG} -> ${DICH.host}:${DICH.port}`);
  console.log('  CHAN moi lenh ghi (POST/PUT/PATCH/DELETE), tru dang nhap.');
  if (CHO_GHI.size > 0) console.log('  Cho qua:', [...CHO_GHI].join(' | '));
});
