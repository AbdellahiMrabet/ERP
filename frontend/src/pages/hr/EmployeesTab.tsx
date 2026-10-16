// NEW FILE (HR module)
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { EmploymentStatus, EmploymentType, HrEmployee, HrPosition } from "../../types";
import { Badge, Field, Modal, errorBox, grid2, panel } from "../crm/ui";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, colorOf, errMsg, labelOf } from "./constants";

interface Form {
  name: string;
  email: string;
  phone: string;
  department: string;
  position_id: string;
  employee_number: string;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  hire_date: string;
  end_date: string;
  reports_to_id: string;
  date_of_birth: string;
  national_id: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  hourly_cost: string;
}

const emptyForm: Form = {
  name: "", email: "", phone: "", department: "", position_id: "", employee_number: "",
  employment_type: "full_time", employment_status: "active", hire_date: "", end_date: "",
  reports_to_id: "", date_of_birth: "", national_id: "", address: "",
  emergency_contact_name: "", emergency_contact_phone: "", notes: "", hourly_cost: "",
};

const toForm = (e: HrEmployee): Form => ({
  name: e.name, email: e.email ?? "", phone: e.phone ?? "", department: e.department ?? "",
  position_id: e.position_id ? String(e.position_id) : "", employee_number: e.employee_number ?? "",
  employment_type: e.employment_type, employment_status: e.employment_status,
  hire_date: e.hire_date ?? "", end_date: e.end_date ?? "",
  reports_to_id: e.reports_to_id ? String(e.reports_to_id) : "",
  date_of_birth: e.date_of_birth ?? "", national_id: e.national_id ?? "", address: e.address ?? "",
  emergency_contact_name: e.emergency_contact_name ?? "", emergency_contact_phone: e.emergency_contact_phone ?? "",
  notes: e.notes ?? "", hourly_cost: e.hourly_cost != null ? String(e.hourly_cost) : "",
});

const sectionTitle = { gridColumn: "1 / -1", margin: "8px 0 0", fontSize: 14, color: "#4f46e5" } as const;

export default function EmployeesTab({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("hr:manage");
  const canSalary = can("hr:salary");

  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [positions, setPositions] = useState<HrPosition[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmploymentStatus | "all">("all");
  const [editing, setEditing] = useState<HrEmployee | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api.get<HrEmployee[]>("/hr/employees"),
        api.get<HrPosition[]>("/hr/positions"),
      ]);
      setEmployees(e);
      setPositions(p);
      setError(null);
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const bind = (key: keyof Form) => ({
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  const openNew = () => { setForm(emptyForm); setEditing("new"); setError(null); };

  // The list leaves out personal data, so the full file is fetched when opened
  const openFile = async (e: HrEmployee) => {
    try {
      const detail = await api.get<HrEmployee>(`/hr/employees/${e.id}`);
      setForm(toForm(detail));
      setEditing(detail);
      setError(null);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const save = async () => {
    const body: Record<string, unknown> = {
      name: form.name, email: form.email, phone: form.phone, department: form.department,
      position_id: Number(form.position_id) || null, employee_number: form.employee_number,
      employment_type: form.employment_type, employment_status: form.employment_status,
      hire_date: form.hire_date || null, end_date: form.end_date || null,
      reports_to_id: Number(form.reports_to_id) || null,
      date_of_birth: form.date_of_birth || null, national_id: form.national_id, address: form.address,
      emergency_contact_name: form.emergency_contact_name, emergency_contact_phone: form.emergency_contact_phone,
      notes: form.notes,
    };
    if (canSalary) body.hourly_cost = form.hourly_cost === "" ? null : form.hourly_cost;
    try {
      if (editing === "new") await api.send("POST", "/hr/employees", body);
      else if (editing) await api.send("PUT", `/hr/employees/${editing.id}`, body);
      setEditing(null);
      await load();
      onChange();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const needle = search.trim().toLowerCase();
  const shown = employees.filter((e) =>
    (status === "all" || e.employment_status === status) &&
    (!needle || [e.name, e.job_title, e.department, e.employee_number, e.email]
      .some((v) => (v ?? "").toLowerCase().includes(needle))));

  const editingId = editing !== null && editing !== "new" ? editing.id : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input placeholder="Search name, title, department…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as EmploymentStatus | "all")}>
          <option value="all">All statuses</option>
          {EMPLOYMENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {canManage && <button style={{ marginLeft: "auto" }} onClick={openNew}>+ New employee</button>}
      </div>
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Employee</th><th>Job title</th><th>Department</th><th>Type</th><th>Status</th>
              <th>Hired</th><th>Reports to</th><th>Allocation</th><th>Hours (month)</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9} style={{ color: "#6b7280" }}>No employees found.</td></tr>}
            {shown.map((e) => (
              <tr key={e.id} onClick={() => void openFile(e)} style={{ cursor: "pointer", opacity: e.employment_status === "terminated" ? 0.55 : 1 }}>
                <td>
                  <strong>{e.name}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{e.employee_number ?? e.email}</div>
                </td>
                <td>{e.job_title}</td>
                <td>{e.department}</td>
                <td>{labelOf(EMPLOYMENT_TYPES, e.employment_type)}</td>
                <td><Badge text={labelOf(EMPLOYMENT_STATUSES, e.employment_status)} color={colorOf(EMPLOYMENT_STATUSES, e.employment_status)} /></td>
                <td>{e.hire_date ?? "—"}</td>
                <td>{e.reports_to_name ?? "—"}</td>
                <td style={{ color: e.overallocated ? "#b91c1c" : undefined, fontWeight: e.overallocated ? 700 : 400 }}>
                  {e.allocated_percent}%{e.overallocated ? " ⚠" : ""}
                </td>
                <td>{e.hours_month ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "New employee" : `Employee file · ${editing.name}`} onClose={() => setEditing(null)} width={760}>
          {error && <div style={errorBox}>{error}</div>}
          <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
            <div style={grid2}>
              <h4 style={sectionTitle}>Job &amp; employment</h4>
              <Field label="Full name"><input {...bind("name")} /></Field>
              <Field label="Employee number"><input {...bind("employee_number")} /></Field>
              <Field label="Job position">
                <select {...bind("position_id")}>
                  <option value="">none</option>
                  {positions.filter((p) => p.is_active || String(p.id) === form.position_id)
                    .map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </Field>
              <Field label="Department"><input {...bind("department")} /></Field>
              <Field label="Employment type">
                <select {...bind("employment_type")}>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Employment status">
                <select {...bind("employment_status")}>
                  {EMPLOYMENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Hire date"><input type="date" {...bind("hire_date")} /></Field>
              <Field label="End date (leavers)"><input type="date" {...bind("end_date")} /></Field>
              <Field label="Reports to" wide>
                <select {...bind("reports_to_id")}>
                  <option value="">nobody</option>
                  {employees.filter((x) => x.id !== editingId && x.employment_status !== "terminated")
                    .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="Work email (matches the login email for 'my hours')"><input type="email" {...bind("email")} /></Field>
              <Field label="Phone"><input {...bind("phone")} /></Field>

              {canManage && (
                <>
                  <h4 style={sectionTitle}>Personal details</h4>
                  <Field label="Date of birth"><input type="date" {...bind("date_of_birth")} /></Field>
                  <Field label="National ID"><input {...bind("national_id")} /></Field>
                  <Field label="Address" wide><input {...bind("address")} /></Field>
                  <Field label="Emergency contact"><input {...bind("emergency_contact_name")} /></Field>
                  <Field label="Emergency phone"><input {...bind("emergency_contact_phone")} /></Field>
                  <Field label="Notes" wide><textarea rows={3} {...bind("notes")} /></Field>
                </>
              )}

              {canSalary && (
                <>
                  <h4 style={sectionTitle}>Pay (restricted)</h4>
                  <Field label="Hourly cost rate (used for project labor cost)">
                    <input type="number" min="0" step="0.01" {...bind("hourly_cost")} />
                  </Field>
                </>
              )}
            </div>
          </fieldset>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(null)}>{canManage ? "Cancel" : "Close"}</button>
            {canManage && <button onClick={() => void save()}>Save</button>}
          </div>
          {canManage && form.employment_status === "terminated" && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
              Terminating an employee deactivates them and ends their project allocations on their last day.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
