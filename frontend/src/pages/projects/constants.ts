// NEW FILE (Projects module)
import type { MemberRole, Priority, ProjectStatus, TaskStatus } from "../../types";

export { errMsg, money } from "../crm/constants";

export const PROJECT_STATUSES: { key: ProjectStatus; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#0ea5e9" },
  { key: "on_hold", label: "On hold", color: "#f59e0b" },
  { key: "completed", label: "Completed", color: "#10b981" },
];

export const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: "low", label: "Low", color: "#6b7280" },
  { key: "medium", label: "Medium", color: "#0ea5e9" },
  { key: "high", label: "High", color: "#ef4444" },
];

export const TASK_STATUSES: { key: TaskStatus; label: string; color: string }[] = [
  { key: "todo", label: "To do", color: "#6b7280" },
  { key: "in_progress", label: "In progress", color: "#0ea5e9" },
  { key: "blocked", label: "Blocked", color: "#ef4444" },
  { key: "done", label: "Done", color: "#10b981" },
];

export const MEMBER_ROLES: { key: MemberRole; label: string }[] = [
  { key: "manager", label: "Project manager" },
  { key: "lead", label: "Team lead" },
  { key: "member", label: "Member" },
  { key: "observer", label: "Observer" },
];

export const colorOf = (list: { key: string; color: string }[], key: string): string =>
  list.find((x) => x.key === key)?.color ?? "#6b7280";

export const labelOf = (list: { key: string; label: string }[], key: string): string =>
  list.find((x) => x.key === key)?.label ?? key;

interface DeadlineInput {
  status: string;
  end_date: string | null;
  days_left: number | null;
  overdue: boolean;
}

// Short deadline badge text and colour for a project
export function deadlineOf(p: DeadlineInput): { text: string; color: string } {
  if (p.status === "completed") return { text: "Completed", color: "#10b981" };
  if (!p.end_date || p.days_left === null) return { text: "No deadline", color: "#6b7280" };
  if (p.overdue) return { text: `${Math.abs(p.days_left)}d overdue`, color: "#ef4444" };
  if (p.days_left === 0) return { text: "Due today", color: "#f59e0b" };
  if (p.days_left <= 7) return { text: `${p.days_left}d left`, color: "#f59e0b" };
  return { text: `${p.days_left}d left`, color: "#6b7280" };
}
