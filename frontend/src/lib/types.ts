export interface Branch {
  id: number;
  name: string;
  active: 0 | 1;
  registers?: number;
}

export interface Register {
  id: number;
  branch_id: number;
  name: string;
  active: 0 | 1;
  branch_name?: string;
}

export interface Cashier {
  id: number;
  branch_id: number;
  name: string;
  active: 0 | 1;
  branch_name?: string;
}

export interface KioskSessionInfo {
  branch: { id: number; name: string };
  register: { id: number; name: string };
  cashier: { id: number; name: string };
}

export type UserRole = 'admin' | 'cashier';

export type RatingValue = 'good' | 'regular' | 'bad';

export interface RatingCounts {
  good: number;
  regular: number;
  bad: number;
  none: number;
}

export interface GroupStats {
  id: number | null;
  name: string;
  count: number;
  good: number;
  regular: number;
  bad: number;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  /** Nivel heredado: 'admin' solo para el rol Administrador. Para permisos usa `can()`. */
  role: UserRole;
  role_id: number | null;
  role_name: string;
  is_admin: boolean;
  permissions: string[];
}

export interface AdminUserRow {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  role_id: number | null;
  role_name: string;
  active: 0 | 1;
  created_at: string;
}

export interface RoleRow {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  is_admin: boolean;
  user_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface Survey {
  id: number;
  client_uuid: string;
  session_id: number | null;
  branch_id: number | null;
  branch_name: string | null;
  register_id: number | null;
  register_name: string | null;
  cashier_id: number | null;
  cashier_name: string | null;
  areas: string[];
  dislikes: string[];
  likes: string[];
  rating: RatingValue | null;
  created_at: string;
  client_ts: string | null;
}

export interface SurveyPayload {
  client_uuid: string;
  branch_id?: number | null;
  register_id?: number | null;
  cashier_id?: number | null;
  areas: string[];
  dislikes: string[];
  likes: string[];
  rating: RatingValue | null;
  client_ts: string;
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface StatsResponse {
  total: number;
  ratingCounts: RatingCounts;
  allGoodCount: number;
  allGoodPct: number;
  areas: LabeledCount[];
  dislikes: LabeledCount[];
  likes: LabeledCount[];
  trend: { date: string; count: number; good: number; regular: number; bad: number }[];
  byRegister: GroupStats[];
  byCashier: GroupStats[];
  byBranch: GroupStats[];
  recent: Survey[];
}

export interface SessionEvent {
  id: number;
  role: string;
  user_name: string | null;
  branch_name: string | null;
  register_name: string | null;
  cashier_name: string | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

export interface ActivityResponse {
  sessions: SessionEvent[];
  recentClosures: SessionEvent[];
  openSessions: number;
  surveysLast24h: number;
}

export interface Filters {
  branch_id: string;
  register_id: string;
  cashier_id: string;
  from: string;
  to: string;
}
