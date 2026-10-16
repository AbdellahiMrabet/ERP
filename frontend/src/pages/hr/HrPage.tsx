// NEW FILE (HR module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { HrOverview } from "../../types";
import AllocationsTab from "./AllocationsTab";
import EmployeesTab from "./EmployeesTab";
import PositionsTab from "./PositionsTab";
import TimesheetsTab from "./TimesheetsTab";

type Tab = "employees" | "positions" | "allocation" | "timesheets";

const TABS: { key: Tab; label: string; hrOnly: boolean }[] = [
  { key: "employees", label: "Employees · الموظفون", hrOnly: true },
  { key: "positions", label: "Positions · الوظائف", hrOnly: true },
  { key: "allocation", label: "Allocation · التوزيع على المشاريع", hrOnly: true },
  { key: "timesheets", label: "Timesheets · ساعات العمل", hrOnly: false },
];

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px #0002", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ?? "#111827" }}>{value}</div>
    </div>
  );
}

export default function HrPage() {
  const canView = useAuth().can("hr:view");
  // Without hr:view a user only gets their own timesheet
  const tabs = TABS.filter((t) => canView || !t.hrOnly);

  const [tab, setTab] = useState<Tab>(canView ? "employees" : "timesheets");
  const [overview, setOverview] = useState<HrOverview | null>(null);

  const loadOverview = useCallback(async () => {
    if (!canView) return;
    try {
      setOverview(await api.get<HrOverview>("/hr/overview"));
    } catch {
      /* each tab shows its own errors */
    }
  }, [canView]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>{canView ? "HR · الموارد البشرية" : "My hours · ساعات العمل"}</h1>

      {overview && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Kpi label="Headcount" value={overview.headcount} />
          <Kpi label="On leave" value={overview.on_leave} tone="#d97706" />
          <Kpi label="Active positions" value={overview.positions} />
          <Kpi label="Over-allocated" value={overview.overallocated} tone={overview.overallocated ? "#dc2626" : undefined} />
          <Kpi label="Timesheets to review" value={overview.pending_timesheets} tone={overview.pending_timesheets ? "#d97706" : undefined} />
          <Kpi label="Hours this month" value={overview.hours_month} tone="#4f46e5" />
        </div>
      )}

      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ fontWeight: tab === t.key ? 700 : 400, borderBottom: tab === t.key ? "3px solid #4f46e5" : "3px solid transparent" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {canView && tab === "employees" && <EmployeesTab onChange={loadOverview} />}
      {canView && tab === "positions" && <PositionsTab onChange={loadOverview} />}
      {canView && tab === "allocation" && <AllocationsTab onChange={loadOverview} />}
      {tab === "timesheets" && <TimesheetsTab onChange={loadOverview} />}
    </div>
  );
}
