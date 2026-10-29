# Hướng dẫn vận hành

## Giáo viên

### Thêm bài tập

1. Vào **Quản lý bài tập** → **Tạo bài mới**.
2. Nhập tiêu đề, nội dung, hướng dẫn, hạn nộp và tệp đề ảnh/PDF nếu có.
3. Chọn **Đã đăng** để học sinh nhìn thấy; bật/tắt **Cho phép học sinh nộp bài** để mở/đóng nhận bài.
4. Độ khó chưa cần chọn ở bước này.

### Chấm và duyệt điểm

1. Vào **Chấm bài**, mở bài nộp và phóng to ảnh khi cần.
2. Nhập điểm 0–10 (tối đa hai chữ số thập phân).
3. Chọn độ khó. Hệ thống tính `floor(điểm × hệ số + 0.5)` cho số không âm.
4. Có thể sửa điểm thưởng; nếu khác đề xuất phải nhập lý do.
5. **Lưu nháp** không cộng điểm. **Duyệt và cộng điểm** mới ghi ledger.
6. Nếu cần nộp lại, dùng nút **Cho nộp lại** tại danh sách bài đã duyệt. Phiên bản cũ không bị xóa.

### Điều chỉnh sau duyệt

Trong **Điểm thưởng** → **Điều chỉnh bài đã duyệt**, nhập điểm mới và lý do. Hệ thống tạo một ledger chênh lệch tham chiếu ledger cũ. Nếu học sinh đã đổi quà và số dư không đủ để trừ, thao tác bị từ chối; hệ thống không làm số dư âm và không tự thu hồi quà đã trao.

### Phần quà

- Giá mặc định là 200 điểm, chỉnh tại **Cài đặt**.
- Mỗi món có thể dùng tồn kho hữu hạn hoặc không giới hạn.
- Giá mới chỉ áp dụng cho lần đổi sau; redemption cũ giữ tên và giá snapshot.
- Bổ sung tồn kho không tự phát quà ngoài ý muốn. Học sinh cần chọn/kích hoạt lại mục tiêu để kiểm tra đổi ngay.
- Vào **Quà đã đổi** để xác nhận **Đã trao quà**.

## Học sinh

1. Đăng nhập bằng tài khoản giáo viên cấp.
2. Mở **Bài tập của em**, làm bài trên giấy và chọn bài cần nộp.
3. Chọn/kéo tối đa 10 tệp ảnh/PDF; dùng nút xoay cho ảnh và mũi tên để xếp đúng thứ tự.
4. Bấm **Xác nhận nộp** và chờ thông báo thành công.
5. Xem kết quả, nhận xét và lịch sử điểm trong **Kết quả học tập**.
6. Chọn đúng một mục tiêu trong **Cửa hàng**. Nếu số dư đã đủ và quà còn hàng, transaction đổi quà chạy ngay.

## Xuất CSV

Giáo viên có thể tải CSV tại trang **Điểm thưởng** và **Quà đã đổi**. CSV chỉ lấy các cột vận hành cần thiết, không chứa token hoặc đường dẫn signed URL.

## Backup và restore

### Database

Free plan không cung cấp automatic downloadable backups. Tạo logical backup định kỳ ở máy tin cậy:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db dump --linked --file backups/math-milk-tea-YYYY-MM-DD.sql
```

Mã hóa bản backup, giữ ít nhất một bản ngoài máy đang dùng và kiểm tra restore trên project staging:

```bash
psql "STAGING_DATABASE_URL" -f backups/math-milk-tea-YYYY-MM-DD.sql
```

Không restore thử vào production. Auth password hashes/role passwords có giới hạn riêng; luôn đọc tài liệu backup hiện hành của Supabase trước mỗi lần khôi phục.

### Ảnh Storage

Database dump chỉ chứa metadata, không chứa object ảnh/PDF. Định kỳ tải bốn bucket bằng một script/admin client chạy ở máy tin cậy với service-role key truyền qua environment variable. Không ghi key vào lệnh shell history, source hoặc file backup. Giữ cấu trúc đường dẫn object để restore đúng liên kết trong `submission_files`, `achievement_files`, `assignments` và `reward_products`.

Quy trình restore Storage:

1. Khôi phục database vào staging.
2. Tạo bucket private và policies bằng migrations.
3. Upload lại object theo đúng bucket/path cũ với `upsert: false`.
4. Chạy truy vấn đối chiếu mọi `submission_files.storage_path` đều có object tương ứng.
5. Kiểm tra signed URL bằng tài khoản teacher/student trước khi chuyển production.

## Bảo mật vận hành

- Dùng mật khẩu khác email, tối thiểu 10 ký tự; bật MFA cho tài khoản Supabase Dashboard.
- Không gửi service-role key qua chat/email; rotate ngay nếu lộ.
- Chỉ publish `VITE_SUPABASE_ANON_KEY`; mọi quyền vẫn phải qua GRANT + RLS.
- Xem log RPC/Storage khi có lỗi, nhưng không chụp/log access token.
- Xóa tài khoản phải đi kèm quy trình lưu trữ dữ liệu; không xóa trực tiếp lịch sử điểm.
- Duy trì project staging riêng hoặc reset local; không thử migrations trên production.

## Hạn mức và chi phí

Các số dưới đây được kiểm tra ngày 24/10/2026 và có thể thay đổi:

- Supabase Free: 500 MB database, 1 GB file storage, 5 GB egress thường + 5 GB cached egress, 50.000 MAU; project ít hoạt động có thể bị pause sau khoảng 7 ngày.
- Free plan không có automatic backups; cần `db dump` và backup object riêng.
- Cloudflare Pages Free: 500 build/tháng, mỗi build tối đa 20 phút và 1 build đồng thời.
- Ảnh bài làm đã giới hạn 5 MB sau xử lý để phù hợp quy mô hai người, nhưng nhiều ảnh vẫn có thể dùng hết 1 GB Storage. Theo dõi Usage trong Supabase Dashboard.

Nguồn chính thức:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://developers.cloudflare.com/pages/platform/limits/

Không cam kết các gói này miễn phí vĩnh viễn. Kiểm tra lại bảng giá trước khi deploy hoặc khi usage tăng.
