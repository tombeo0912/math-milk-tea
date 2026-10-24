import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AssignmentSubmissionPage } from "./pages/student/AssignmentSubmissionPage";
import { StudentAssignments } from "./pages/student/StudentAssignments";
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { StudentGifts } from "./pages/student/StudentGifts";
import { StudentResults } from "./pages/student/StudentResults";
import { StudentRewards } from "./pages/student/StudentRewards";
import { TeacherAssignments } from "./pages/teacher/TeacherAssignments";
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard";
import { TeacherGrading } from "./pages/teacher/TeacherGrading";
import { TeacherPoints } from "./pages/teacher/TeacherPoints";
import { TeacherRedemptions } from "./pages/teacher/TeacherRedemptions";
import { TeacherRewards } from "./pages/teacher/TeacherRewards";
import { TeacherSettings } from "./pages/teacher/TeacherSettings";
import type { UserRole } from "./types/domain";

function Guard({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-cream-100 text-tea-500">
        <div className="flex items-center gap-3">
          <LoaderCircle className="animate-spin" />
          Đang mở góc học tập…
        </div>
      </div>
    );
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (!profile)
    return (
      <main className="grid min-h-screen place-items-center bg-cream-100 p-6 text-center">
        <div className="card max-w-lg p-8">
          <h1 className="text-xl font-black">Tài khoản chưa được cấp hồ sơ</h1>
          <p className="mt-3 text-sm text-tea-500">
            Giáo viên hoặc quản trị viên cần tạo bản ghi trong bảng profiles cho
            tài khoản này.
          </p>
        </div>
      </main>
    );
  if (profile.role !== role)
    return (
      <Navigate
        to={profile.role === "teacher" ? "/giao-vien" : "/hoc-sinh"}
        replace
      />
    );
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
      <Route
        element={
          <Guard role="student">
            <AppShell />
          </Guard>
        }
      >
        <Route path="/hoc-sinh" element={<StudentDashboard />} />
        <Route path="/hoc-sinh/bai-tap" element={<StudentAssignments />} />
        <Route
          path="/hoc-sinh/bai-tap/:id"
          element={<AssignmentSubmissionPage />}
        />
        <Route path="/hoc-sinh/ket-qua" element={<StudentResults />} />
        <Route path="/hoc-sinh/cua-hang" element={<StudentRewards />} />
        <Route path="/hoc-sinh/qua-cua-em" element={<StudentGifts />} />
      </Route>
      <Route
        element={
          <Guard role="teacher">
            <AppShell />
          </Guard>
        }
      >
        <Route path="/giao-vien" element={<TeacherDashboard />} />
        <Route path="/giao-vien/bai-tap" element={<TeacherAssignments />} />
        <Route path="/giao-vien/cham-bai" element={<TeacherGrading />} />
        <Route path="/giao-vien/diem-thuong" element={<TeacherPoints />} />
        <Route path="/giao-vien/cua-hang" element={<TeacherRewards />} />
        <Route path="/giao-vien/doi-qua" element={<TeacherRedemptions />} />
        <Route path="/giao-vien/cai-dat" element={<TeacherSettings />} />
      </Route>
      <Route path="/" element={<Navigate to="/dang-nhap" replace />} />
      <Route
        path="*"
        element={
          <main className="grid min-h-screen place-items-center bg-cream-100 p-6 text-center">
            <div>
              <span className="text-6xl">🧭</span>
              <h1 className="mt-4 text-2xl font-black">
                Trang này chưa tồn tại
              </h1>
              <a className="btn-primary mt-5" href="/">
                Về trang đăng nhập
              </a>
            </div>
          </main>
        }
      />
    </Routes>
  );
}
