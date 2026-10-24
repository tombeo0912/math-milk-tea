export type UserRole = "teacher" | "student";
export type AssignmentStatus = "draft" | "published" | "archived";
export type SubmissionStatus = "submitted" | "graded" | "approved";
export type GradingStatus = "draft" | "approved";
export type RedemptionStatus = "pending" | "delivered" | "cancelled";

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  teacher_id: string;
  title: string;
  content: string;
  instructions: string | null;
  due_at: string | null;
  image_path: string | null;
  status: AssignmentStatus;
  accepts_submissions: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  storage_path: string;
  page_order: number;
  mime_type: string;
  size_bytes: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  version: number;
  status: SubmissionStatus;
  note: string | null;
  resubmission_allowed: boolean;
  submitted_at: string;
  assignment?: Assignment;
  submission_files?: SubmissionFile[];
  profiles?: Pick<Profile, "display_name">;
}

export interface DifficultySetting {
  code: string;
  label: string;
  multiplier: number;
  sort_order: number;
  active: boolean;
}

export interface GradingRecord {
  id: string;
  submission_id: string;
  math_score: number;
  difficulty_code: string;
  difficulty_label_snapshot: string;
  difficulty_multiplier_snapshot: number;
  suggested_points: number;
  approved_points: number;
  comment: string | null;
  adjustment_reason: string | null;
  status: GradingStatus;
  approved_at: string | null;
  updated_at: string;
}

export interface PointWallet {
  student_id: string;
  earned_points: number;
  available_points: number;
  redeemed_points: number;
  updated_at: string;
}

export interface PointLedgerEntry {
  id: string;
  transaction_type:
    "assignment_reward" | "manual_reward" | "adjustment" | "reward_redemption";
  source_type: string;
  source_id: string | null;
  delta: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface RewardProduct {
  id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  price_points: number;
  active: boolean;
  inventory_mode: "unlimited" | "limited";
  stock_quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface RewardTarget {
  student_id: string;
  product_id: string;
  activated_at: string;
  reward_products?: RewardProduct;
}

export interface RewardRedemption {
  id: string;
  student_id: string;
  product_id: string;
  product_name_snapshot: string;
  price_points_snapshot: number;
  status: RedemptionStatus;
  redeemed_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  kind: string;
  read_at: string | null;
  created_at: string;
}
