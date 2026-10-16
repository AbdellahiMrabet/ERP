// NEW FILE (HR module)
import type { EmploymentStatus, EmploymentType, TimesheetStatus } from "../../types";

export { errMsg } from "../crm/constants";
export { colorOf, labelOf } from "../projects/constants";

export const EMPLOYMENT_TYPES: { key: EmploymentType; label: string }[] = [
  { key: "full_time", label: "Full-time" },
  { key: "part_time", label: "Part-time" },
  { key: "contract", label: "Contract" },
  { key: "intern", label: "Intern" },
];

export const EMPLOYMENT_STATUSES: { key: EmploymentStatus; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#10b981" },
  { key: "on_leave", label: "On leave", color: "#f59e0b" },
  { key: "terminated", label: "Terminated", color: "#6b7280" },
];

export const TIMESHEET_STATUSES: { key: TimesheetStatus; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "approved", label: "Approved", color: "#10b981" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

// Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC)
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = (): string => toIsoDate(new Date());

export function monthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export const fmtHours = (n: number): string => `${Math.round(n * 100) / 100} h`;
