// NEW FILE (Projects module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Employee, PmProject, Task, TaskStatus } from "../../types";
import { errorBox, panel } from "../crm/ui";
import { TASK_STATUSES, errMsg } from "./constants";
import TaskForm from "./TaskForm";
import TaskTable from "./TaskTable";

export default function TasksTab({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("tasks:manage");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState<TaskStatus | "open" | "all">("open");
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (projectId) qs.set("project_id", projectId);
    if (assigneeId) qs.set("assignee_id", assigneeId);
    if (status !== "all") qs.set("status", status);
    if (mine) qs.set("mine", "1");
    if (overdue) qs.set("overdue", "1");
    try {
      const [t, p, e] = await Promise.all([
        api.get<Task[]>(`/pm/tasks?${qs.toString()}`),
        api.get<PmProject[]>("/pm/projects"),
        api.get<Employee[]>("/pm/employees"),
      ]);
      setTasks(t);
      setProjects(p);
      setEmployees(e);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [projectId, assigneeId, status, mine, overdue]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
    await load();
    onChange();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Anyone</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | "open" | "all")}>
          <option value="open">Open tasks</option>
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me
        </label>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue only
        </label>
        {canManage && <button style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>+ New task</button>}
      </div>
      {mine && tasks.length === 0 && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          "Assigned to me" matches your login email to an employee's email. If nothing shows, check that an employee has your email.
        </div>
      )}
      {error && <div style={errorBox}>{error}</div>}

      <div style={panel}>
        <TaskTable
          tasks={tasks}
          showProject
          onStatus={(t, s) => void run(() => api.send("PUT", `/pm/tasks/${t.id}/status`, { status: s }))}
          onEdit={(t) => setEditing(t)}
          onDelete={(t) => { if (window.confirm(`Delete task "${t.title}"?`)) void run(() => api.send("DELETE", `/pm/tasks/${t.id}`)); }}
        />
      </div>

      {editing && (
        <TaskForm task={editing === "new" ? null : editing} projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); onChange(); }} />
      )}
    </div>
  );
}
