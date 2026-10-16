// NEW FILE (Projects module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Client, Employee, PmProject, ProjectStatus } from "../../types";
import { Badge, errorBox, panel } from "../crm/ui";
import { PRIORITIES, PROJECT_STATUSES, colorOf, deadlineOf, errMsg, labelOf } from "./constants";
import { ProgressBar } from "./parts";
import ProjectDetail from "./ProjectDetail";
import ProjectForm from "./ProjectForm";

export default function ProjectList({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("projects:manage");

  const [projects, setProjects] = useState<PmProject[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, e] = await Promise.all([
        api.get<PmProject[]>("/pm/projects"),
        can("clients:view") ? api.get<Client[]>("/clients") : Promise.resolve<Client[]>([]),
        api.get<Employee[]>("/pm/employees"),
      ]);
      setProjects(p);
      setClients(c);
      setEmployees(e);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [can]);

  useEffect(() => { void load(); }, [load]);

  const changed = () => { void load(); onChange(); };

  const needle = search.trim().toLowerCase();
  const shown = projects.filter((p) =>
    (status === "all" || p.status === status) &&
    (!needle || p.name.toLowerCase().includes(needle) || (p.client_name ?? "").toLowerCase().includes(needle)));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input placeholder="Search project or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "all")}>
          <option value="all">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {canManage && <button style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>+ New project</button>}
      </div>
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr align="left">
              <th>Project</th><th>Status</th><th>Priority</th><th>Manager</th><th style={{ minWidth: 150 }}>Progress</th><th>Deadline</th><th>Team</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7} style={{ color: "#6b7280" }}>No projects found.</td></tr>}
            {shown.map((p) => {
              const dl = deadlineOf(p);
              return (
                <tr key={p.id} onClick={() => setSelected(p.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <strong>{p.name}</strong>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{p.client_name}</div>
                  </td>
                  <td><Badge text={labelOf(PROJECT_STATUSES, p.status)} color={colorOf(PROJECT_STATUSES, p.status)} /></td>
                  <td><Badge text={labelOf(PRIORITIES, p.priority)} color={colorOf(PRIORITIES, p.priority)} /></td>
                  <td>{p.manager_name ?? <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>
                    <ProgressBar value={p.completion} />
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {p.completion}% · {p.tasks_done}/{p.tasks_total} tasks
                      {p.tasks_overdue > 0 && <span style={{ color: "#b91c1c" }}> · {p.tasks_overdue} overdue</span>}
                    </div>
                  </td>
                  <td>
                    <Badge text={dl.text} color={dl.color} />
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{p.end_date ?? ""}</div>
                  </td>
                  <td>{p.member_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected !== null && (
        <ProjectDetail id={selected} clients={clients} employees={employees}
          onClose={() => setSelected(null)} onChanged={changed} />
      )}
      {creating && (
        <ProjectForm project={null} clients={clients} employees={employees}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); changed(); }} />
      )}
    </div>
  );
}
