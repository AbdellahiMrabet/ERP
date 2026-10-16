// NEW FILE (HR module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { HrPosition } from "../../types";
import { Badge, Field, Modal, errorBox, grid2, panel } from "../crm/ui";
import { errMsg } from "./constants";

interface Form {
  title: string;
  department: string;
  level: string;
  description: string;
  is_active: boolean;
}

const emptyForm: Form = { title: "", department: "", level: "", description: "", is_active: true };

export default function PositionsTab({ onChange }: { onChange: () => void }) {
  const canManage = useAuth().can("hr:manage");

  const [positions, setPositions] = useState<HrPosition[]>([]);
  const [editing, setEditing] = useState<HrPosition | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPositions(await api.get<HrPosition[]>("/hr/positions"));
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
  const openEdit = (p: HrPosition) => {
    setForm({
      title: p.title, department: p.department ?? "", level: p.level ?? "",
      description: p.description ?? "", is_active: p.is_active,
    });
    setEditing(p);
    setError(null);
  };

  const save = () =>
    run(async () => {
      if (editing === "new") await api.send("POST", "/hr/positions", form);
      else if (editing) await api.send("PUT", `/hr/positions/${editing.id}`, form);
      setEditing(null); // only reached when the request succeeded
    });

  const remove = (p: HrPosition) => {
    if (window.confirm(`Delete the position "${p.title}"?`)) void run(() => api.send("DELETE", `/hr/positions/${p.id}`));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          Positions are the job titles employees can hold. Renaming one updates everyone who holds it.
        </div>
        {canManage && <button onClick={openNew}>+ New position</button>}
      </div>
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr style={{ textAlign: "left" }}><th>Title</th><th>Department</th><th>Level</th><th>Description</th><th>Employees</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {positions.length === 0 && <tr><td colSpan={7} style={{ color: "#6b7280" }}>No positions yet.</td></tr>}
            {positions.map((p) => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                <td><strong>{p.title}</strong></td>
                <td>{p.department}</td>
                <td>{p.level}</td>
                <td style={{ maxWidth: 280, color: "#6b7280", fontSize: 13 }}>{p.description}</td>
                <td>{p.employee_count}</td>
                <td><Badge text={p.is_active ? "Active" : "Inactive"} color={p.is_active ? "#10b981" : "#6b7280"} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {canManage && <button onClick={() => openEdit(p)}>Edit</button>}{" "}
                  {canManage && <button onClick={() => remove(p)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "New position" : "Edit position"} onClose={() => setEditing(null)}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={grid2}>
            <Field label="Job title" wide>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Department">
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field>
            <Field label="Level / grade">
              <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            </Field>
            <Field label="Description" wide>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
