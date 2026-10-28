# Triển khai Math & Milk Tea

## 1. Tạo Supabase project

1. Tạo project mới trong Supabase Dashboard và lưu database password trong password manager.
2. Trong Authentication → URL Configuration, đặt Site URL local là `http://localhost:5173` trong lúc phát triển.
3. Thêm Redirect URL `http://localhost:5173/dat-lai-mat-khau`.
4. Tắt public signup. Chỉ tạo tài khoản từ Dashboard hoặc môi trường quản trị tin cậy.
5. Không sao chép service-role key vào source code, trình duyệt hoặc Git.

## 2. Áp dụng database migrations

Cách khuyến nghị bằng Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Nếu dùng SQL Editor, chạy ba tệp trong `supabase/migrations` đúng thứ tự tên. Sau đó kiểm tra:

- 14 bảng trong schema `public`.
- Ba bucket `submission-images`, `assignment-images`, `reward-images` đều là private.
- RLS đã bật trên mọi bảng public.
- Role `anon` không có quyền trên bảng dữ liệu nghiệp vụ.
- Authenticated client chỉ ghi điểm/đổi quà thông qua RPC được cấp quyền.

Không chạy migrations thử nghiệm trên production khi chưa có backup.

## 3. Tạo tài khoản teacher và student

Trong Authentication → Users, dùng **Add user**:

1. Tạo tài khoản giáo viên, bật xác nhận email trong thao tác admin.
2. Tạo tài khoản học sinh, bật xác nhận email trong thao tác admin.
3. Không dùng email giả mà giáo viên không kiểm soát.

Nếu học sinh chưa có email, dùng một email alias do giáo viên quản lý, chẳng hạn `math.student+01@ten-mien-cua-giao-vien.example`. Alias chỉ dùng làm tên đăng nhập; không thu thập họ tên, ngày sinh hoặc dữ liệu cá nhân không cần thiết. Mật khẩu ban đầu phải được chuyển riêng và đổi ngay lần đầu.

Lấy UUID của hai user trong Dashboard, rồi chạy trong SQL Editor:

```sql
insert into public.profiles(id, role, display_name) values
  ('TEACHER_AUTH_UUID', 'teacher', 'Cô/Thầy Tùng'),
  ('STUDENT_AUTH_UUID', 'student', 'Em học sinh');
```

Trigger sẽ tạo ví 0 điểm cho học sinh. Đăng nhập bằng tài khoản giáo viên, mở **Cửa hàng** và bấm **Thêm quà mẫu**; món trà sữa sẽ trở thành mục tiêu mặc định nếu đang hoạt động.

## 4. Cấu hình frontend

Tạo `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY
```

Anon/publishable key được phép có trong frontend vì RLS là hàng rào quyền thật. Service-role key tuyệt đối không được đặt ở đây.

Chạy xác minh local:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Kiểm tra hành trình thật bằng hai cửa sổ trình duyệt riêng:

1. Giáo viên tạo và đăng bài.
2. Học sinh nộp ít nhất hai ảnh.
3. Giáo viên mở signed URL, chấm, lưu nháp rồi duyệt.
4. Học sinh thấy điểm và cốc cập nhật.
5. Dùng một phần quà giá thấp trong staging để kiểm tra tự đổi, điểm dư và tồn kho.
6. Giáo viên xác nhận đã trao.

## 5. Deploy Cloudflare Pages

1. Đưa source lên một GitHub repository **private**. Kiểm tra `.env.local` không nằm trong commit.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Import Git repository.
3. Chọn framework preset Vite (hoặc cấu hình thủ công):
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `24`
4. Thêm hai biến `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trong phần Environment variables.
5. Deploy. Tệp `public/_redirects` đã chứa `/* /index.html 200` để reload React route không lỗi 404.
6. Lấy URL `https://...pages.dev`, cập nhật Supabase Auth:
   - Site URL: URL production.
   - Redirect URL: `https://...pages.dev/dat-lai-mat-khau`.
7. Deploy lại và kiểm tra HTTPS, login, upload ảnh/PDF, chấm/duyệt, đổi quà.

Không cần mua domain ở giai đoạn đầu. Không tuyên bố production hoàn tất trước khi toàn bộ hành trình trên chạy với dữ liệu thật.
