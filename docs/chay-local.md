# Chạy Phúc Long Express ở máy local

Dùng để xem thử trước khi deploy. Backend local nối thẳng vào **SQL Server thật**
(xem `backend/.env`), nên dữ liệu nhìn thấy là dữ liệu thật — và mọi thao tác GHI
cũng ghi thật, trừ những đường bị chặn ở mục 3.

## 1. Backend

```bash
cd backend && npm run build
PORT=3101 node dist/src/main.js
```

**Đừng dùng cổng 3001 mặc định**: máy đã có một ứng dụng node khác nghe cổng đó.
Windows cho hai tiến trình cùng bind một cổng, không báo lỗi gì, rồi request rơi
vào tiến trình nào tuỳ lúc — biểu hiện là API trả `404 Route not found` cho
đường dẫn chắc chắn có thật, hoặc trả về header của một ứng dụng khác hẳn.

Kiểm: `curl -o /dev/null -w "%{http_code}" http://localhost:3101/api/orders/countries`
→ **401** là đúng (sống, chỉ thiếu token). 404 là đụng cổng.

## 2. Lớp chắn ghi (khuyến nghị khi chỉ muốn xem)

`backend/scripts/chan-ghi.cjs` đứng trước backend, chặn đúng các lời gọi GHI đã
khai trong mảng `CHAN` (hiện có: import công nợ), trả kết quả thành công giả và
in ra thân JSON mà web gửi lên. Mọi đường khác đi thẳng xuống backend thật.

```bash
CONG_BE=3101 node backend/scripts/chan-ghi.cjs    # nghe 3094 -> 3101
```

Bỏ bước này thì bấm nút trên màn local là ghi thật vào sổ công nợ.

## 3. Frontend

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:3094/api npx next dev -p 9555
```

Mở http://localhost:9555, đăng nhập bằng **tài khoản thường ngày** — backend local
dùng chung DB với production nên tài khoản y hệt.

## 4. Cái bẫy đã làm sập site một lần (07/10/2026)

**`next dev` GHI ĐÈ thư mục `.next`** — cùng chỗ `npm run build` đổ ra. Chạy dev
để xem local, rồi đẩy `.next` lên máy chủ, là đẩy bản dev: iisnode trả
`Could not find a production build in the '.next' directory`, cả site chết.

Quy tắc: **trước khi deploy phải dừng dev server rồi `npm run build` LẠI.** Dấu
hiệu nhận ra bản dev — đếm số file:

```bash
find .next -type f -not -path "*/cache/*" | wc -l
# bản build thật: ~629 file. Khoảng ~89 file là bản dev, ĐỪNG đẩy.
cat .next/BUILD_ID        # bản dev không có file này
```

## 5. Dọn tiến trình

```bash
netstat -ano | grep ":9555"                      # lấy PID
powershell -NoProfile -Command "Stop-Process -Id <PID> -Force"
```

Dừng task trong Claude Code không phải lúc nào cũng giết được tiến trình node
con; cổng vẫn bị giữ và lần chạy sau báo `EADDRINUSE`.
