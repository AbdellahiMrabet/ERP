// NEW FILE (Projects module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Employee } from "../../types";
import { Badge, Field, Modal, errorBox, grid2, panel } from "../crm/ui";
import { errMsg } from "./constants";

interface Form {
  name: string;
  email: string;
  job_title: string;
  department: string;
  phone: string;
  is_active: boolean;
}

const emptyForm: Form = { name: "", email: "", job_title: "", department: "", phone: "", is_active: true };

export default function Employees({ onChange }: { onChange: () => void }) {
  const canManage = useAuth().can("employees:manage");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEmployees(await api.get<Employee[]>("/pm/employees"));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

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

  const openNew = () => { setForm(emptyForm); setEditing("new"); setError(null); };
  const openEdit = (e: Employee) => {
    setForm({
      name: e.name, email: e.email ?? "", job_title: e.job_title ?? "",
      department: e.department ?? "", phone: e.phone ?? "", is_active: e.is_active,
    });
    setEditing(e);
    setError(null);
  };

  const save = () =>
    run(async () => {
      if (editing === "new") await api.send("POST", "/pm/employees", form);
      else if (editing) await api.send("PUT", `/pm/employees/${editing.id}`, form);
      setEditing(null); // only reached when the request succeeded
    });

  const remove = (e: Employee) => {
    if (window.confirm(`Delete ${e.name}?`)) void run(() => api.send("DELETE", `/pm/employees/${e.id}`));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          An employee whose email matches a user's login email sees their own tasks under "Assigned to me".
        </div>
        {canManage && <button onClick={openNew}>+ New employee</button>}
      </div>
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr align="left"><th>Name</th><th>Job title</th><th>Department</th><th>Email</th><th>Projects</th><th>Open tasks</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={8} style={{ color: "#6b7280" }}>No employees yet.</td></tr>}
            {employees.map((e) => (
              <tr key={e.id} style={{ opacity: e.is_active ? 1 : 0.55 }}>
                <td>{e.name}</td><td>{e.job_title}</td><td>{e.department}</td><td>{e.email}</td>
                <td>{e.project_count}</td><td>{e.open_tasks}</td>
                <td><Badge text={e.is_active ? "Active" : "Inactive"} color={e.is_active ? "#10b981" : "#6b7280"} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {canManage && <button onClick={() => openEdit(e)}>Edit</button>}{" "}
                  {canManage && <button onClick={() => remove(e)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "New employee" : "Edit employee"} onClose={() => setEditing(null)}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={grid2}>
            <Field label="Full name" wide>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Job title">
              <input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
            </Field>
            <Field label="Department">
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field>
            <label style={{ fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(null)}>Cancel</button>
            <button onClick={() => void save()}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
