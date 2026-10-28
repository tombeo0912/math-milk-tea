export const DIFFICULTY_DEFAULTS = [
  { code: "easy", label: "Dễ", multiplier: 1 },
  { code: "medium", label: "Trung bình", multiplier: 1.5 },
  { code: "hard", label: "Khó", multiplier: 2 },
  { code: "challenge", label: "Thử thách", multiplier: 3 },
] as const;

export function calculateSuggestedPoints(
  score: number,
  multiplier: number,
): number {
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error("Điểm bài làm phải nằm trong khoảng từ 0 đến 10.");
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error("Hệ số độ khó phải lớn hơn 0.");
  }
  // All values are non-negative; floor(x + .5) implements the product rule.
  return Math.floor(score * multiplier + 0.5 + Number.EPSILON);
}

export function calculateProgress(
  availablePoints: number,
  targetPrice: number,
): number {
  if (targetPrice <= 0) return 0;
  return Math.min(100, Math.max(0, (availablePoints / targetPrice) * 100));
}

export function pointsRemaining(
  availablePoints: number,
  targetPrice: number,
): number {
  return Math.max(0, targetPrice - availablePoints);
}

export function potentialRedemptions(
  availablePoints: number,
  price: number,
  stock: number | null,
): number {
  if (availablePoints < 0 || price <= 0) return 0;
  const byBalance = Math.floor(availablePoints / price);
  return stock === null ? byBalance : Math.min(byBalance, Math.max(0, stock));
}

export function friendlyDate(
  value: string | null | undefined,
  includeTime = false,
): string {
  if (!value) return "Không giới hạn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function encouragement(progress: number): string {
  if (progress >= 100) return "Chúc mừng! Em đã chinh phục mục tiêu!";
  if (progress >= 75) return "Sắp được nhận quà rồi!";
  if (progress >= 35) return "Em đang tiến bộ mỗi ngày!";
  return "Khởi đầu thật tốt!";
}

export const MAX_SUBMISSION_FILES = 10;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ORIGINAL_FILE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_SUBMISSION_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  "application/pdf",
];

export function validateSubmissionFile(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!ACCEPTED_SUBMISSION_TYPES.includes(file.type))
    return "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc tệp PDF.";
  if (file.size > MAX_ORIGINAL_FILE_BYTES)
    return "Tệp quá lớn. Vui lòng chọn tệp dưới 15 MB.";
  return null;
}

export function makeIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}
