// NEW FILE (Projects module)
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Priority, ProjectMember, Task, TaskStatus } from "../../types";
import { Field, Modal, errorBox, grid2 } from "../crm/ui";
import { PRIORITIES, TASK_STATUSES, errMsg } from "./constants";

interface Props {
  task: Task | null; // null = create a new task
  projects: { id: number; name: string }[];
  projectId?: number; // fixes the project (used from inside a project)
  onClose: () => void;
  onSaved: () => void;
}

interface Form {
  project_id: string;
  title: string;
  description: string;
  assignee_id: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string;
}

export default function TaskForm({ task, projects, projectId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Form>({
    project_id: String(task?.project_id ?? projectId ?? ""),
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignee_id: task?.assignee_id ? String(task.assignee_id) : "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    due_date: task?.due_date ?? "",
  });
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locked = task !== null || projectId !== undefined; // the project cannot change here

  // Load the team of the chosen project: only team members can be assigned
  useEffect(() => {
    if (!form.project_id) { setMembers([]); return; }
    api.get<ProjectMember[]>(`/pm/projects/${form.project_id}/members`)
      .then(setMembers)
      .catch((e) => setError(errMsg(e)));
  }, [form.project_id]);

  const save = async () => {
    if (!form.project_id) { setError("choose a project"); return; }
    setBusy(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
      };
      if (task) await api.send("PUT", `/pm/tasks/${task.id}`, body);
      else await api.send("POST", `/pm/projects/${form.project_id}/tasks`, body);
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      {error && <div style={errorBox}>{error}</div>}
      <div style={grid2}>
        <Field label="Project" wide>
          <select value={form.project_id} disabled={locked}
            onChange={(e) => setForm({ ...form, project_id: e.target.value, assignee_id: "" })}>
            <option value="">select a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Task title" wide>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Assigned to (project team)">
          <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
            <option value="">unassigned</option>
            {members.map((m) => <option key={m.id} value={m.employee_id}>{m.employee_name}</option>)}
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
            {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
      {form.project_id && members.length === 0 && (
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          This project has no team yet. Add employees to its team first to assign tasks.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}
