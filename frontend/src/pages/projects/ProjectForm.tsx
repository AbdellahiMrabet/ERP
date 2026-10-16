// NEW FILE (Projects module)
import { useState } from "react";
import { api } from "../../api";
import type { Client, Employee, PmProject, Priority, ProjectStatus } from "../../types";
import { Field, Modal, errorBox, grid2 } from "../crm/ui";
import { PRIORITIES, PROJECT_STATUSES, errMsg } from "./constants";

interface Props {
  project: PmProject | null; // null = create a new project
  clients: Client[];
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

interface Form {
  name: string;
  client_id: string;
  status: ProjectStatus;
  priority: Priority;
  start_date: string;
  end_date: string;
  budget: string;
  manager_id: string;
  description: string;
}

export default function ProjectForm({ project, clients, employees, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Form>({
    name: project?.name ?? "",
    client_id: project ? String(project.client_id) : "",
    status: project?.status ?? "active",
    priority: project?.priority ?? "medium",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    budget: project ? String(project.budget) : "",
    manager_id: "",
    description: project?.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.name,
        client_id: Number(form.client_id) || null,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget: form.budget || 0,
        description: form.description,
        ...(project ? {} : { manager_id: form.manager_id ? Number(form.manager_id) : null }),
      };
      if (project) await api.send("PUT", `/pm/projects/${project.id}`, body);
      else await api.send("POST", "/pm/projects", body);
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={project ? "Edit project" : "New project"} onClose={onClose}>
      {error && <div style={errorBox}>{error}</div>}
      <div style={grid2}>
        <Field label="Project name" wide>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Client">
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
            <option value="">select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {!project && (
          <Field label="Project manager">
            <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
              <option value="">none yet</option>
              {employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </Field>
        <Field label="Deadline">
          <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </Field>
        <Field label="Budget">
          <input type="number" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        </Field>
        <Field label="Description" wide>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}
