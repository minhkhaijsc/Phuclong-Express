# Deploy Phúc Long Express

Máy chủ Windows + Plesk + IIS/iisnode, đẩy bằng FTP. Thông tin đăng nhập nằm
trong tệp creds riêng (không để trong repo).

```
host  125.212.243.86
user  plelogisticsco
```

| Phần | Thư mục trên máy chủ | Build ra |
|---|---|---|
| Frontend (Next.js) | `/web.phuclongexpress.com` | `.next` |
| Backend (NestJS) | `/api.phuclongexpress.com` | `dist/src/...` |
| API công khai | `https://api.phuclongexpress.com/api` | — |

## Ba điều đã trả giá để biết — đừng bỏ bước nào

1. **Đẩy vào `.next.moi` trước rồi mới đổi tên.** Ghi đè thẳng vào `.next` thì
   suốt lúc truyền (vài phút) khách vào site sẽ gặp lỗi thiếu chunk.

2. **Đổi tên thư mục KHÔNG làm iisnode dựng lại tiến trình.** Site đặt
   `watchedFiles="web.config;server.js"`, nên phải **sửa nội dung `web.config`**
   mới ép nạp lại. Quy ước: thêm một dòng vào trước `</configuration>`:

   ```xml
   <!-- nap lai 2026-10-05T05:12:40Z (mo ta ngan viec vua deploy) -->
   ```

   Thiếu bước này thì tiến trình cũ vẫn trả HTML trỏ tới tên chunk đã bị đổi đi
   mất → hàng loạt tệp tĩnh lỗi 400.

3. **Build frontend phải có `.env.production`**, không thì `NEXT_PUBLIC_API_URL`
   bị nướng cứng thành `localhost:3001` và cả site chết. Kiểm TRƯỚC khi đẩy:

   ```bash
   grep -rl "localhost:3001" .next/static/chunks/ | wc -l   # phải là 0
   ```

## Backend

Chỉ đổi vài tệp thì đẩy đúng tệp đã build, khỏi đẩy cả `dist`:

```bash
cd backend && npm run build
# đẩy dist/src/<duong-dan>/<ten>.js lên /api.phuclongexpress.com/dist/src/...
# rồi sửa web.config của /api.phuclongexpress.com để nạp lại
```

Tải bản đang chạy về làm bản lùi trước khi ghi đè. Kiểm sau khi đẩy:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -d '{}' \
  https://api.phuclongexpress.com/api/orders/list
# 401 = sống đúng (chỉ thiếu token). 404 = sai đường. 500 = hỏng.
```

Lưu ý: IIS thay thân phản hồi 4xx bằng trang HTML của nó (`httpErrors`), nên lỗi
theo từng phần tử phải trả trong thân HTTP 200, đừng dựa vào mã lỗi 4xx.

## Stored procedure

Phần lớn logic nằm trong stored procedure trên SQL Server **2014 Express**:

- Không có `STRING_SPLIT` (cần 2016+), DB cũng chưa có hàm tách chuỗi nào.
- **Các SP nối chuỗi thô vào SQL động** rồi `EXEC sp_executesql`, ví dụ
  `SET @Sql = @Sql + ' AND ID IN (' + @MaDatHang + ')'`. Nên mọi thứ truyền
  xuống SP phải được lọc sạch ở tầng NestJS trước — xem `locMaDatHang()` và
  `tachDanhSachMa()` trong `orders.service.ts`.
- Thêm tham số mới thì đặt **ở cuối** và **có giá trị mặc định**, để bản ASP cũ
  (vẫn gọi chung các SP này) không bị ảnh hưởng.
- Đọc thân SP: `SELECT OBJECT_DEFINITION(OBJECT_ID('SP_Lay_DonHang'))`.
- Lưu bản gốc ra `_backup/ple-sp/` trước khi sửa, và viết migration dạng
  DROP + CREATE đầy đủ vào `backend/src/database/migrations/`.
