// NEW FILE (HR module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { HrAllocation, HrEmployee, PmProject } from "../../types";
import { Badge, Field, Modal, errorBox, grid2, panel } from "../crm/ui";
import { errMsg, today } from "./constants";

interface Form {
  employee_id: string;
  project_id: string;
  percent: string;
  start_date: string;
  end_date: string;
  notes: string;
}

const newForm = (): Form => ({ employee_id: "", project_id: "", percent: "100", start_date: today(), end_date: "", notes: "" });

export default function AllocationsTab({ onChange }: { onChange: () => void }) {
  const canManage = useAuth().can("hr:manage");

  const [allocations, setAllocations] = useState<HrAllocation[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<HrAllocation | "new" | null>(null);
  const [form, setForm] = useState<Form>(newForm());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (projectFilter) qs.set("project_id", projectFilter);
    if (employeeFilter) qs.set("employee_id", employeeFilter);
    if (activeOnly) qs.set("active", "1");
    try {
      const [a, e, p] = await Promise.all([
        api.get<HrAllocation[]>(`/hr/allocations?${qs.toString()}`),
        api.get<HrEmployee[]>("/hr/employees"),
        api.get<PmProject[]>("/pm/projects"),
      ]);
      setAllocations(a);
      setEmployees(e);
      setProjects(p);
      setError(null);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [projectFilter, employeeFilter, activeOnly]);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setForm(newForm()); setEditing("new"); setError(null); setNotice(null); };
  const openEdit = (a: HrAllocation) => {
    setForm({
      employee_id: String(a.employee_id), project_id: String(a.project_id), percent: String(a.percent),
      start_date: a.start_date, end_date: a.end_date ?? "", notes: a.notes ?? "",
    });
    setEditing(a);
    setError(null);
    setNotice(null);
  };

  const save = async () => {
    const body = {
      employee_id: Number(form.employee_id) || null,
      project_id: Number(form.project_id) || null,
      percent: Number(form.percent),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes,
    };
    try {
      const saved = editing === "new"
        ? await api.post<HrAllocation>("/hr/allocations", body)
        : await api.put<HrAllocation>(`/hr/allocations/${(editing as HrAllocation).id}`, body);
      setNotice(saved.warning ?? null); // over-allocation is allowed, but flagged
      setEditing(null);
      await load();
      onChange();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const remove = async (a: HrAllocation) => {
    if (!window.confirm(`Remove ${a.employee_name} from ${a.project_name}?`)) return;
    try {
      await api.send("DELETE", `/hr/allocations/${a.id}`);
      await load();
      onChange();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const today_ = today();
  const stateOf = (a: HrAllocation): { text: string; color: string } =>
    a.active ? { text: "Active", color: "#10b981" }
      : a.start_date > today_ ? { text: "Upcoming", color: "#0ea5e9" }
      : { text: "Ended", color: "#6b7280" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
          <option value="">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Current only
        </label>
        {canManage && <button style={{ marginLeft: "auto" }} onClick={openNew}>+ Allocate employee</button>}
      </div>
      {notice && (
        <div style={{ ...errorBox, background: "#fffbeb", color: "#b45309" }}>
          ⚠ {notice} <button onClick={() => setNotice(null)} style={{ marginLeft: 8 }}>OK</button>
        </div>
      )}
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr style={{ textAlign: "left" }}><th>Employee</th><th>Project</th><th>Allocation</th><th>Period</th><th>Status</th><th>Notes</th><th /></tr>
          </thead>
          <tbody>
            {allocations.length === 0 && <tr><td colSpan={7} style={{ color: "#6b7280" }}>No allocations.</td></tr>}
            {allocations.map((a) => {
              const st = stateOf(a);
              return (
                <tr key={a.id}>
                  <td>{a.employee_name}</td>
                  <td>{a.project_name}</td>
                  <td><strong>{a.percent}%</strong></td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.start_date} → {a.end_date ?? "open"}</td>
                  <td><Badge text={st.text} color={st.color} /></td>
                  <td style={{ fontSize: 13, color: "#6b7280" }}>{a.notes}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canManage && <button onClick={() => openEdit(a)}>Edit</button>}{" "}
                    {canManage && <button onClick={() => void remove(a)}>Remove</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Allocating an employee also adds them to the project team, so tasks and hours can be assigned to them.
        Removing an allocation leaves them on the team.
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Allocate employee to project" : "Edit allocation"} onClose={() => setEditing(null)}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={grid2}>
            <Field label="Employee">
              <select value={form.employee_id} disabled={editing !== "new"} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">select…</option>
                {employees.filter((e) => e.employment_status !== "terminated")
                  .map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Project">
              <select value={form.project_id} disabled={editing !== "new"} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">select…</option>
                {projects.filter((p) => p.status !== "completed").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Allocation % of their time">
              <input type="number" min="1" max="100" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
            </Field>
            <div />
            <Field label="From">
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Until (blank = open-ended)">
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
            <Field label="Notes" wide>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
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
