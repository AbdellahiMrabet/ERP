export interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export type ProjectStatus = "active" | "completed" | "on_hold";

export interface Project {
  id: number;
  name: string;
  client_id: number;
  client_name: string | null;
  status: ProjectStatus;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  revenue: number;
  expenses: number;
  profit: number;
}

export type TransactionType = "revenue" | "expense";

export interface Transaction {
  id: number;
  project_id: number | null;
  type: TransactionType;
  category: string | null;
  description: string | null;
  amount: number;
  date: string;
}

export interface Kpis {
  revenue: number;
  expenses: number;
  net_profit: number;
  profit_margin: number;
  estimated_profit: number;
  active_projects: number;
  total_projects: number;
  total_clients: number;
}

export interface MonthlyPoint {
  month: number;
  revenue: number;
  expenses: number;
}

export interface ExpenseCategory {
  category: string;
  amount: number;
}

export interface DashboardData {
  year: number;
  kpis: Kpis;
  monthly: MonthlyPoint[];
  expense_by_category: ExpenseCategory[];
  top_projects: Project[];
}

// ---------- Auth & access control ----------
export type Permission =
  | "dashboard:view"
  | "clients:view"
  | "clients:manage"
  | "projects:view"
  | "projects:manage"
  | "finance:manage"
  | "reports:view"
  | "users:manage"
  | "crm:view" // NEW (CRM)
  | "crm:manage" // NEW (CRM)
  | "quotes:manage" // NEW (CRM)
  | "tasks:manage" // NEW (Projects)
  | "employees:manage" // NEW (Projects)
  | "hr:view" // NEW (HR)
  | "hr:manage" // NEW (HR)
  | "hr:salary" // NEW (HR)
  | "timesheets:manage"; // NEW (HR)

export interface PermissionInfo {
  key: Permission;
  description: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
  is_system: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number | null;
  role: string | null;
  permissions: Permission[];
  is_active: boolean;
  last_login_at: string | null;
}

// ---------- CRM (NEW: everything from here to the end of the file) ----------
export type Stage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export interface Opportunity {
  id: number;
  title: string;
  client_id: number;
  client_name: string | null;
  stage: Stage;
  value: number;
  probability: number;
  weighted_value: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  lost_reason: string | null;
  owner_id: number | null;
  owner_name: string | null;
  created_at: string | null;
  closed_at: string | null;
}

export type FollowUpType = "call" | "email" | "meeting" | "visit" | "other";
export type FollowUpStatus = "pending" | "done" | "cancelled";

export interface FollowUp {
  id: number;
  subject: string;
  type: FollowUpType;
  notes: string | null;
  due_at: string;
  status: FollowUpStatus;
  overdue: boolean;
  opportunity_id: number | null;
  opportunity_title: string | null;
  client_id: number | null;
  client_name: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  completed_at: string | null;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Quote {
  id: number;
  number: string | null;
  title: string;
  client_id: number;
  client_name: string | null;
  opportunity_id: number | null;
  opportunity_title: string | null;
  status: QuoteStatus;
  expired: boolean;
  issue_date: string | null;
  valid_until: string | null;
  discount_percent: number;
  tax_percent: number;
  notes: string | null;
  terms: string | null;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface CrmSummary {
  stages: Record<Stage, { count: number; value: number; weighted: number }>;
  open_value: number;
  forecast: number;
  win_rate: number;
  overdue_followups: number;
  due_today: number;
  quotes: Record<QuoteStatus, number>;
}

// ---------- Projects module (NEW: everything from here to the end of the file) ----------
export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type MemberRole = "manager" | "lead" | "member" | "observer";

export interface Employee {
  id: number;
  name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  open_tasks: number;
  project_count: number;
}

export interface PmProject {
  id: number;
  name: string;
  client_id: number;
  client_name: string | null;
  status: ProjectStatus;
  priority: Priority;
  description: string | null;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  days_left: number | null;
  overdue: boolean;
  tasks_total: number;
  tasks_done: number;
  tasks_overdue: number;
  completion: number;
  manager_name: string | null;
  member_count: number;
}

export interface Task {
  id: number;
  project_id: number;
  project_name: string | null;
  title: string;
  description: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_email: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  overdue: boolean;
  completed_at: string | null;
}

export interface ProjectMember {
  id: number;
  employee_id: number;
  employee_name: string;
  job_title: string | null;
  role: MemberRole;
  responsibilities: string | null;
  open_tasks: number;
  done_tasks: number;
}

export interface PmProjectDetail extends PmProject {
  members: ProjectMember[];
  tasks: Task[];
}

export interface PmOverview {
  projects_total: number;
  projects_active: number;
  projects_completed: number;
  projects_overdue: number;
  avg_completion: number;
  tasks_open: number;
  tasks_overdue: number;
  tasks_due_week: number;
  tasks_mine_open: number;
}

// ---------- HR module (NEW: everything from here to the end of the file) ----------
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type EmploymentStatus = "active" | "on_leave" | "terminated";
export type TimesheetStatus = "pending" | "approved" | "rejected";

export interface HrPosition {
  id: number;
  title: string;
  department: string | null;
  level: string | null;
  description: string | null;
  is_active: boolean;
  employee_count: number;
}

export interface HrEmployee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  is_active: boolean;
  position_id: number | null;
  job_title: string | null;
  employee_number: string | null;
  hire_date: string | null;
  end_date: string | null;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  reports_to_id: number | null;
  reports_to_name: string | null;
  allocated_percent: number;
  overallocated: boolean;
  hours_month?: number; // list only
  // Detail only. Present when the user has hr:manage (personal data) or hr:salary (pay rate).
  date_of_birth?: string | null;
  national_id?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
  hourly_cost?: number | null;
}

export interface HrAllocation {
  id: number;
  project_id: number;
  project_name: string | null;
  employee_id: number;
  employee_name: string | null;
  percent: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  active: boolean;
  warning?: string;
}

export interface Timesheet {
  id: number;
  employee_id: number;
  employee_name: string | null;
  project_id: number;
  project_name: string | null;
  task_id: number | null;
  task_title: string | null;
  work_date: string;
  hours: number;
  description: string | null;
  status: TimesheetStatus;
  reviewed_at: string | null;
}

export interface TimesheetSummary {
  from: string;
  to: string;
  total_hours: number;
  by_project: { project_id: number; project_name: string | null; hours: number; approved_hours: number; cost: number | null }[];
  by_employee: { employee_id: number; employee_name: string | null; hours: number }[];
}

export interface HrOverview {
  headcount: number;
  on_leave: number;
  terminated: number;
  positions: number;
  overallocated: number;
  pending_timesheets: number;
  hours_month: number;
  by_type: Record<EmploymentType, number>;
}
