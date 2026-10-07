/**
 * Lớp chắn đặt TRƯỚC backend chạy local (3001) để anh/chị bấm thử thoải mái.
 *
 * Backend local nối thẳng vào SQL Server THẬT — bấm "Import" là ghi công nợ
 * thật vào sổ. Lớp này chặn đúng những lời gọi GHI của màn import lại, trả về
 * kết quả thành công giả, và in ra phần thân JSON mà web gửi lên.
 *
 * Mọi thứ còn lại (đăng nhập, danh sách user, tuyến, tài khoản ngân hàng...)
 * đi thẳng xuống backend thật, nên dữ liệu nhìn thấy là dữ liệu thật.
 */
const http = require('node:http');

const DICH = { host: '127.0.0.1', port: Number(process.env.CONG_BE || 3001) };
const CONG = Number(process.env.CONG || 3094);

// Đường ghi bị chặn — thêm vào đây nếu cần chặn thêm màn khác.
const CHAN = [{ ph: 'POST', duong: '/api/debt-reports/management/import' }];

const may = http.createServer((req, res) => {
  const duong = req.url.split('?')[0];
  const bi = CHAN.find((c) => c.ph === req.method && duong === c.duong);

  if (bi) {
    let than = '';
    req.on('data', (d) => (than += d));
    req.on('end', () => {
      let rows = [];
      try { rows = JSON.parse(than).rows ?? []; } catch { /* thân hỏng thì coi như rỗng */ }
      console.log(`\n[CHAN] ${req.method} ${duong} — ${rows.length} dong, KHONG ghi vao DB`);
      for (const r of rows.slice(0, 5)) console.log('   ', JSON.stringify(r));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        successCount: rows.length,
        failCount: 0,
        results: rows.map((_, i) => ({ row: i + 1, success: true, message: 'Ban local: khong ghi vao DB' })),
      }));
    });
    return;
  }

  const di = http.request(
    { ...DICH, method: req.method, path: req.url, headers: { ...req.headers, host: `${DICH.host}:${DICH.port}` } },
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

may.listen(CONG, () => console.log(`chan-ghi: ${CONG} -> ${DICH.host}:${DICH.port} (chan ghi import cong no)`));
