import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  calculateSuggestedPoints,
  pointsRemaining,
  potentialRedemptions,
  validateReportedScore,
  validateSubmissionFile,
} from "./domain";

describe("công thức điểm thưởng", () => {
  it.each([
    [0, 1, 0],
    [10, 3, 30],
    [8.5, 2, 17],
    [8, 1.5, 12],
    [1, 1.5, 2],
  ])("tính %s × %s = %s", (score, multiplier, expected) => {
    expect(calculateSuggestedPoints(score, multiplier)).toBe(expected);
  });

  it("từ chối điểm ngoài thang 10", () => {
    expect(() => calculateSuggestedPoints(-1, 1)).toThrow();
    expect(() => calculateSuggestedPoints(10.01, 1)).toThrow();
  });
});

describe("tiến độ và đổi quà", () => {
  it.each([
    [0, 0],
    [50, 25],
    [100, 50],
    [150, 75],
    [180, 90],
    [200, 100],
    [450, 100],
  ])("%s điểm trên mục tiêu 200 bằng %s%%", (points, expected) =>
    expect(calculateProgress(points, 200)).toBe(expected),
  );
  it("giữ điểm dư và tôn trọng tồn kho", () => {
    expect(potentialRedemptions(199, 200, null)).toBe(0);
    expect(potentialRedemptions(200, 200, null)).toBe(1);
    expect(potentialRedemptions(215, 200, null)).toBe(1);
    expect(pointsRemaining(215, 200)).toBe(0);
    expect(potentialRedemptions(450, 200, null)).toBe(2);
    expect(potentialRedemptions(450, 200, 1)).toBe(1);
    expect(potentialRedemptions(450, 200, 0)).toBe(0);
  });
});

describe("tệp bài làm", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "application/pdf"])(
    "chấp nhận %s",
    (type) => {
      expect(validateSubmissionFile({ type, size: 1024 })).toBeNull();
    },
  );

  it("từ chối loại tệp không hỗ trợ và tệp trên 15 MB", () => {
    expect(
      validateSubmissionFile({ type: "application/zip", size: 1024 }),
    ).toMatch(/JPEG/);
    expect(
      validateSubmissionFile({
        type: "application/pdf",
        size: 15 * 1024 * 1024 + 1,
      }),
    ).toMatch(/15 MB/);
  });
});

describe("điểm số học sinh báo cáo", () => {
  it.each([
    [9, 10],
    [8.5, 10],
    [18, 20],
    [85, 100],
  ])("chấp nhận %s trên thang %s", (score, maxScore) => {
    expect(validateReportedScore(score, maxScore)).toBeNull();
  });

  it("từ chối điểm âm, vượt thang và quá 2 chữ số thập phân", () => {
    expect(validateReportedScore(-1, 10)).not.toBeNull();
    expect(validateReportedScore(11, 10)).not.toBeNull();
    expect(validateReportedScore(8.555, 10)).not.toBeNull();
    expect(validateReportedScore(8, 0)).not.toBeNull();
  });
});
