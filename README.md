# Math & Milk Tea

Website học Toán cho một giáo viên và một học sinh: giao bài, nộp bài, ghi nhận điểm tốt ở trường, phê duyệt điểm thưởng, đề xuất phần quà và tự động đổi đúng món quà mục tiêu.

## Trạng thái

- Frontend React/TypeScript responsive đã hoàn thành và production build thành công.
- Schema PostgreSQL, RLS, private Storage policies và RPC transaction đã có trong `supabase/migrations`.
- Unit test nghiệp vụ frontend bao phủ công thức điểm, tệp PDF/ảnh và điểm số do học sinh báo cáo.
- Database test pgTAP đã viết trong `supabase/tests/database`.
- Chưa thể xác minh end-to-end với Supabase production cho đến khi có project URL, anon key và hai tài khoản thật. Ứng dụng không dùng dữ liệu giả để che trạng thái này.

## Chức năng chính

### Học sinh

- Đăng nhập bằng tài khoản được cấp, không có đăng ký công khai.
- Xem bài đã đăng và hạn nộp.
- Kéo thả tối đa 10 tệp ảnh/PDF, xem trước, đổi thứ tự và xóa trước khi nộp; ảnh có thể xoay.
- Ảnh được thu nhỏ an toàn, chuyển WebP và bỏ EXIF; PDF được giữ nguyên trong private bucket.
- Xem kết quả, nhận xét và lịch sử điểm.
- Gửi 1–5 ảnh/PDF minh chứng điểm tốt trên lớp hoặc bài kiểm tra để giáo viên xét thưởng.
- Theo dõi cốc trà sữa SVG theo đúng giá quà mục tiêu.
- Chọn một món quà mục tiêu; nếu đủ điểm, RPC tự đổi ngay và giữ điểm dư.
- Gửi mong muốn phần thưởng riêng khi cửa hàng chưa có món phù hợp và theo dõi phản hồi.
- Xem quà chờ trao/đã trao và thông báo trong ứng dụng.

### Giáo viên

- Tạo, sửa, đăng, đóng nhận bài và lưu trữ bài tập; có thể đính kèm ảnh hoặc PDF đề bài.
- Xem ảnh bài làm bằng signed URL, phóng to và chấm theo thang 10.
- Chọn độ khó khi chấm; xem điểm đề xuất; điều chỉnh có lý do.
- Lưu nháp không cộng điểm; duyệt mới ghi ledger và cộng điểm.
- Cho phép nộp lại từng bài đã duyệt, giữ nguyên phiên bản cũ.
- Cộng/điều chỉnh điểm có lịch sử; chỉnh bài đã duyệt bằng giao dịch chênh lệch.
- Xem minh chứng điểm ở trường, duyệt hoặc từ chối; mỗi lần duyệt chỉ cộng điểm một lần.
- Quản lý nhiều phần quà, giá, ảnh, trạng thái và tồn kho.
- Nhận mong muốn của học sinh và tạo phần thưởng trực tiếp từ đề nghị đó.
- Xác nhận đã trao quà; xem lịch sử đổi quà.
- Chỉnh hệ số độ khó, giá quà mặc định và giới hạn upload.

## Bất biến nghiệp vụ

- Trình duyệt không có quyền ghi trực tiếp vào `point_wallets`, `point_ledger`, `grading_records` hay `reward_redemptions`.
- Một bài nộp chỉ có một giao dịch thưởng chính thức; unique index chống duyệt hai lần.
- Một minh chứng thành tích chỉ có một giao dịch thưởng; học sinh chỉ có một mong muốn quà đang chờ.
- Các thao tác quan trọng có idempotency key.
- Ví, mục tiêu và sản phẩm được khóa hàng trong transaction khi cộng điểm/đổi quà.
- Điểm khả dụng không thể âm; quà hết hàng không làm mất điểm.
- Giao dịch cũ không bị sửa/xóa âm thầm; giá và tên quà được snapshot khi đổi.
- Tệp bài làm và minh chứng thành tích nằm trong bucket riêng tư, chỉ truy cập bằng phiên xác thực/signed URL.

## Chạy local

Yêu cầu Node.js 24 LTS (hoặc phiên bản đáp ứng yêu cầu của Vite 8).

```bash
npm install
copy .env.example .env.local
npm run dev
```

Điền vào `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

Không đặt service-role key trong frontend hoặc tệp `.env.local` của Vite.

## Lệnh kiểm tra

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Database test cần Supabase CLI và Docker:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

## Cấu trúc

```text
src/
  components/          layout, feedback, cốc trà sữa, thông báo
  context/             session và hồ sơ người dùng
  hooks/               tải dữ liệu bất đồng bộ
  lib/                 Supabase client, nghiệp vụ, ảnh, CSV
  pages/student/       dashboard, bài tập, nộp bài, kết quả, quà
  pages/teacher/       tổng quan, bài tập, chấm, điểm, quà, cài đặt
  types/               kiểu dữ liệu nghiệp vụ
supabase/
  migrations/          schema, RPC/transaction, RLS và Storage
  tests/database/      pgTAP schema/privilege tests
docs/
  DEPLOYMENT.md        thiết lập Supabase và Cloudflare Pages
  OPERATIONS.md        sử dụng, backup/restore, bảo mật và hạn mức
```

Đọc [hướng dẫn triển khai](docs/DEPLOYMENT.md) và [hướng dẫn vận hành](docs/OPERATIONS.md) trước khi đưa dữ liệu thật vào hệ thống.
