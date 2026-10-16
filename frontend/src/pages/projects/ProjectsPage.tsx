// NEW FILE (Projects module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { PmOverview } from "../../types";
import Employees from "./Employees";
import ProjectList from "./ProjectList";
import TasksTab from "./TasksTab";

type Tab = "projects" | "tasks" | "team";

const TABS: { key: Tab; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "tasks", label: "Tasks" },
  { key: "team", label: "Team" },
];

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px #0002", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ?? "#111827" }}>{value}</div>
    </div>
  );
}

export default function ProjectsPage() {
  const [tab, setTab] = useState<Tab>("projects");
  const [overview, setOverview] = useState<PmOverview | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.get<PmOverview>("/pm/overview"));
    } catch {
      /* each tab shows its own errors */
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Projects</h1>

      {overview && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Kpi label="Active projects" value={`${overview.projects_active} / ${overview.projects_total}`} />
          <Kpi label="Avg completion" value={`${overview.avg_completion}%`} tone="#4f46e5" />
          <Kpi label="Overdue projects" value={overview.projects_overdue} tone={overview.projects_overdue ? "#dc2626" : undefined} />
          <Kpi label="Open tasks" value={overview.tasks_open} />
          <Kpi label="Overdue tasks" value={overview.tasks_overdue} tone={overview.tasks_overdue ? "#dc2626" : undefined} />
          <Kpi label="Due in 7 days" value={overview.tasks_due_week} tone="#d97706" />
          <Kpi label="My open tasks" value={overview.tasks_mine_open} tone="#059669" />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ fontWeight: tab === t.key ? 700 : 400, borderBottom: tab === t.key ? "3px solid #4f46e5" : "3px solid transparent" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projects" && <ProjectList onChange={loadOverview} />}
      {tab === "tasks" && <TasksTab onChange={loadOverview} />}
      {tab === "team" && <Employees onChange={loadOverview} />}
    </div>
  );
}
