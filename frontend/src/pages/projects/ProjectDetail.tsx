// NEW FILE (Projects module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Client, Employee, MemberRole, PmProjectDetail, Task, TaskStatus } from "../../types";
import { Badge, Modal, errorBox } from "../crm/ui";
import {
  MEMBER_ROLES, PRIORITIES, PROJECT_STATUSES, colorOf, deadlineOf, errMsg, labelOf, money,
} from "./constants";
import { ProgressBar } from "./parts";
import ProjectForm from "./ProjectForm";
import TaskForm from "./TaskForm";
import TaskTable from "./TaskTable";

interface Props {
  id: number;
  clients: Client[];
  employees: Employee[];
  onClose: () => void;
  onChanged: () => void;
}

interface MemberForm { employee_id: string; role: MemberRole; responsibilities: string }
const emptyMember: MemberForm = { employee_id: "", role: "member", responsibilities: "" };

const sectionTitle = { margin: "20px 0 8px" } as const;

export default function ProjectDetail({ id, clients, employees, onClose, onChanged }: Props) {
  const { can } = useAuth();
  const canManage = can("projects:manage");
  const canTasks = can("tasks:manage");

  const [project, setProject] = useState<PmProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [taskEditing, setTaskEditing] = useState<Task | "new" | null>(null);
  const [member, setMember] = useState<MemberForm>(emptyMember);

  const load = useCallback(async () => {
    try {
      setProject(await api.get<PmProjectDetail>(`/pm/projects/${id}`));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
    await load();
    onChanged();
  };

  if (!project) {
    return (
      <Modal title="Project" onClose={onClose} width={960}>
        {error ? <div style={errorBox}>{error}</div> : <p>Loading…</p>}
      </Modal>
    );
  }

  const deadline = deadlineOf(project);
  const teamIds = new Set(project.members.map((m) => m.employee_id));
  const available = employees.filter((e) => e.is_active && !teamIds.has(e.id));

  const addMember = () =>
    run(async () => {
      if (!member.employee_id) return;
      await api.send("POST", `/pm/projects/${id}/members`, {
        employee_id: Number(member.employee_id),
        role: member.role,
        responsibilities: member.responsibilities,
      });
      setMember(emptyMember);
    });

  const editResponsibilities = (memberId: number, current: string | null) => {
    const text = window.prompt("Responsibilities for this team member:", current ?? "");
    if (text !== null) void run(() => api.send("PUT", `/pm/projects/${id}/members/${memberId}`, { responsibilities: text }));
  };

  const removeProject = () => {
    if (!window.confirm(`Delete project "${project.name}" and all of its tasks?`)) return;
    void (async () => {
      try {
        await api.send("DELETE", `/pm/projects/${id}`);
        onChanged();
        onClose();
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  };

  return (
    <>
      <Modal title={project.name} onClose={onClose} width={960}>
        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <Badge text={labelOf(PROJECT_STATUSES, project.status)} color={colorOf(PROJECT_STATUSES, project.status)} />
          <Badge text={`${labelOf(PRIORITIES, project.priority)} priority`} color={colorOf(PRIORITIES, project.priority)} />
          <Badge text={deadline.text} color={deadline.color} />
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            Client: <strong>{project.client_name ?? "—"}</strong> · Manager: <strong>{project.manager_name ?? "—"}</strong>
          </span>
          {canManage && <button style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>Edit project</button>}
        </div>

        {project.description && <p style={{ margin: "8px 0", color: "#374151" }}>{project.description}</p>}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "#374151" }}>
          <span>Start: {project.start_date ?? "—"}</span>
          <span>Deadline: {project.end_date ?? "—"}</span>
          <span>Budget: {money(project.budget)}</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
            <span>Completion</span>
            <strong>{project.completion}% ({project.tasks_done}/{project.tasks_total} tasks)</strong>
          </div>
          <ProgressBar value={project.completion} />
          {project.tasks_overdue > 0 && (
            <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{project.tasks_overdue} overdue task(s)</div>
          )}
        </div>

        <h4 style={sectionTitle}>Team &amp; responsibilities</h4>
        {canManage && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <select value={member.employee_id} onChange={(e) => setMember({ ...member, employee_id: e.target.value })}>
              <option value="">add employee…</option>
              {available.map((e) => <option key={e.id} value={e.id}>{e.name}{e.job_title ? ` — ${e.job_title}` : ""}</option>)}
            </select>
            <select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value as MemberRole })}>
              {MEMBER_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <input style={{ flex: 1, minWidth: 180 }} placeholder="Responsibilities"
              value={member.responsibilities} onChange={(e) => setMember({ ...member, responsibilities: e.target.value })} />
            <button onClick={() => void addMember()}>Add to team</button>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table width="100%">
            <thead><tr style={{ textAlign: "left" }}><th>Employee</th><th>Role</th><th>Responsibilities</th><th>Tasks (open / done)</th><th /></tr></thead>
            <tbody>
              {project.members.length === 0 && <tr><td colSpan={5} style={{ color: "#6b7280" }}>No team members yet.</td></tr>}
              {project.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.employee_name}{m.job_title && <div style={{ fontSize: 12, color: "#6b7280" }}>{m.job_title}</div>}</td>
                  <td>
                    {canManage ? (
                      <select value={m.role} onChange={(e) => void run(() => api.send("PUT", `/pm/projects/${id}/members/${m.id}`, { role: e.target.value }))}>
                        {MEMBER_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    ) : labelOf(MEMBER_ROLES, m.role)}
                  </td>
                  <td>{m.responsibilities ?? <span style={{ color: "#9ca3af" }}>not defined</span>}</td>
                  <td>{m.open_tasks} / {m.done_tasks}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canManage && <button onClick={() => editResponsibilities(m.id, m.responsibilities)}>Responsibilities</button>}{" "}
                    {canManage && (
                      <button onClick={() => { if (window.confirm(`Remove ${m.employee_name} from the team? Their tasks become unassigned.`)) void run(() => api.send("DELETE", `/pm/projects/${id}/members/${m.id}`)); }}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...sectionTitle }}>
          <h4 style={{ margin: 0 }}>Tasks</h4>
          {canTasks && <button onClick={() => setTaskEditing("new")}>+ New task</button>}
        </div>
        <TaskTable
          tasks={project.tasks}
          showProject={false}
          onStatus={(t: Task, status: TaskStatus) => void run(() => api.send("PUT", `/pm/tasks/${t.id}/status`, { status }))}
          onEdit={(t) => setTaskEditing(t)}
          onDelete={(t) => { if (window.confirm(`Delete task "${t.title}"?`)) void run(() => api.send("DELETE", `/pm/tasks/${t.id}`)); }}
        />

        {canManage && (
          <div style={{ marginTop: 20, textAlign: "right" }}>
            <button onClick={removeProject}>Delete project</button>
          </div>
        )}
      </Modal>

      {editing && (
        <ProjectForm project={project} clients={clients} employees={employees}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void load(); onChanged(); }} />
      )}
      {taskEditing && (
        <TaskForm task={taskEditing === "new" ? null : taskEditing} projects={[{ id: project.id, name: project.name }]}
          projectId={project.id} onClose={() => setTaskEditing(null)}
          onSaved={() => { setTaskEditing(null); void load(); onChanged(); }} />
      )}
    </>
  );
}
