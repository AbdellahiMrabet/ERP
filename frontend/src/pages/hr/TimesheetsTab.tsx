// NEW FILE (HR module)
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Employee, PmProject, Task, Timesheet, TimesheetStatus, TimesheetSummary } from "../../types";
import { Badge, errorBox, panel } from "../crm/ui";
import { TIMESHEET_STATUSES, colorOf, errMsg, fmtHours, labelOf, monthRange, today } from "./constants";
import { money } from "../projects/constants";

interface Me { id: number; name: string }
interface ProjectRef { id: number; name: string }

export default function TimesheetsTab({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canView = can("hr:view");
  const canManage = can("timesheets:manage");
  const canAll = canView || canManage; // everyone else only sees and logs their own hours

  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<PmProject[]>([]);

  const [range, setRange] = useState(monthRange());
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TimesheetStatus | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [entries, setEntries] = useState<Timesheet[]>([]);
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);

  const [logEmployee, setLogEmployee] = useState("");
  const [logProject, setLogProject] = useState("");
  const [logTask, setLogTask] = useState("");
  const [logDate, setLogDate] = useState(today());
  const [logHours, setLogHours] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logProjects, setLogProjects] = useState<ProjectRef[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Who am I (the employee whose email matches my login), plus lists for the dropdowns
  useEffect(() => {
    api.get<{ employee: Me | null }>("/hr/me")
      .then((r) => {
        setMe(r.employee);
        const emp = r.employee;
        if (emp) setLogEmployee((cur) => cur || String(emp.id));
      })
      .catch((e) => setError(errMsg(e)));
    api.get<Employee[]>("/pm/employees").then(setEmployees).catch(() => undefined);
    api.get<PmProject[]>("/pm/projects").then(setProjects).catch(() => undefined);
  }, []);

  // Only the projects the chosen employee belongs to can receive hours
  useEffect(() => {
    setLogProject("");
    if (!logEmployee) { setLogProjects([]); return; }
    api.get<ProjectRef[]>(`/hr/employees/${logEmployee}/projects`)
      .then(setLogProjects)
      .catch((e) => setError(errMsg(e)));
  }, [logEmployee]);

  useEffect(() => {
    setLogTask("");
    if (!logProject) { setTasks([]); return; }
    api.get<Task[]>(`/pm/tasks?project_id=${logProject}&status=open`).then(setTasks).catch(() => setTasks([]));
  }, [logProject]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (canAll && employeeFilter) qs.set("employee_id", employeeFilter);
    if (canAll && mineOnly) qs.set("mine", "1");
    if (projectFilter) qs.set("project_id", projectFilter);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    try {
      setEntries(await api.get<Timesheet[]>(`/hr/timesheets?${qs.toString()}`));
      if (canView) setSummary(await api.get<TimesheetSummary>(`/hr/timesheets/summary?from=${range.from}&to=${range.to}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [range, employeeFilter, mineOnly, projectFilter, statusFilter, canAll, canView]);

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

  const log = () =>
    run(async () => {
      await api.send("POST", "/hr/timesheets", {
        employee_id: Number(logEmployee) || null,
        project_id: Number(logProject) || null,
        task_id: Number(logTask) || null,
        work_date: logDate,
        hours: logHours,
        description: logNote,
      });
      setLogHours(""); // only reached when the request succeeded
      setLogNote("");
    });

  const review = (t: Timesheet, status: TimesheetStatus) =>
    void run(() => api.send("PUT", `/hr/timesheets/${t.id}/review`, { status }));

  const remove = (t: Timesheet) => {
    if (window.confirm(`Delete ${t.hours} h on ${t.project_name} (${t.work_date})?`)) {
      void run(() => api.send("DELETE", `/hr/timesheets/${t.id}`));
    }
  };

  const total = entries.reduce((sum, t) => sum + t.hours, 0);
  const noFile = me === null && !canManage;
  const showCost = !!summary && summary.by_project.some((p) => p.cost !== null);

  return (
    <div>
      {error && <div style={errorBox}>{error}</div>}

      <div style={panel}>
        <h4 style={{ margin: "0 0 10px" }}>Log hours · تسجيل ساعات العمل</h4>
        {noFile ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            No employee file matches your login email, so you cannot log hours yet. Ask HR to put your email on your employee file.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canManage ? (
              <select value={logEmployee} onChange={(e) => setLogEmployee(e.target.value)}>
                <option value="">employee…</option>
                {employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            ) : (
              <strong>{me?.name}</strong>
            )}
            <select value={logProject} onChange={(e) => setLogProject(e.target.value)}>
              <option value="">project…</option>
              {logProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={logTask} onChange={(e) => setLogTask(e.target.value)} disabled={!logProject}>
              <option value="">task (optional)</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="date" max={today()} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            <input type="number" min="0.25" max="24" step="0.25" placeholder="hours" style={{ width: 80 }}
              value={logHours} onChange={(e) => setLogHours(e.target.value)} />
            <input placeholder="What did you work on?" style={{ flex: 1, minWidth: 180 }}
              value={logNote} onChange={(e) => setLogNote(e.target.value)} />
            <button onClick={() => void log()}>Log hours</button>
          </div>
        )}
        {!noFile && logEmployee && logProjects.length === 0 && (
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
            Not on any project yet. HR can allocate you under the Allocation tab.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 14 }}>From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label style={{ fontSize: 14 }}>To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        {canAll && (
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TimesheetStatus | "all")}>
          <option value="all">All statuses</option>
          {TIMESHEET_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {canAll && (
          <label style={{ fontSize: 14 }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine
          </label>
        )}
      </div>

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Date</th>{canAll && <th>Employee</th>}<th>Project</th><th>Task</th><th>Hours</th><th>Notes</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={canAll ? 8 : 7} style={{ color: "#6b7280" }}>No hours logged in this period.</td></tr>}
            {entries.map((t) => {
              const own = me != null && t.employee_id === me.id;
              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{t.work_date}</td>
                  {canAll && <td>{t.employee_name}</td>}
                  <td>{t.project_name}</td>
                  <td>{t.task_title ?? "—"}</td>
                  <td><strong>{t.hours}</strong></td>
                  <td style={{ fontSize: 13, color: "#6b7280" }}>{t.description}</td>
                  <td><Badge text={labelOf(TIMESHEET_STATUSES, t.status)} color={colorOf(TIMESHEET_STATUSES, t.status)} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canManage && t.status === "pending" && (
                      <>
                        <button onClick={() => review(t, "approved")}>Approve</button>{" "}
                        <button onClick={() => review(t, "rejected")}>Reject</button>{" "}
                      </>
                    )}
                    {canManage && t.status !== "pending" && <><button onClick={() => review(t, "pending")}>Reopen</button>{" "}</>}
                    {(canManage || (own && t.status === "pending")) && <button onClick={() => remove(t)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr><td colSpan={canAll ? 4 : 3} style={{ textAlign: "right" }}><strong>Total</strong></td><td><strong>{fmtHours(total)}</strong></td><td colSpan={3} /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {canView && summary && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ ...panel, flex: 2, minWidth: 320, overflowX: "auto" }}>
            <h4 style={{ margin: "0 0 8px" }}>Hours by project · {summary.from} → {summary.to}</h4>
            <table width="100%">
              <thead><tr style={{ textAlign: "left" }}><th>Project</th><th>Hours</th><th>Approved</th>{showCost && <th>Labor cost</th>}</tr></thead>
              <tbody>
                {summary.by_project.length === 0 && <tr><td colSpan={4} style={{ color: "#6b7280" }}>Nothing logged.</td></tr>}
                {summary.by_project.map((p) => (
                  <tr key={p.project_id}>
                    <td>{p.project_name}</td><td>{p.hours}</td><td>{p.approved_hours}</td>
                    {showCost && <td>{p.cost !== null ? money(p.cost) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {showCost && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Labor cost uses each employee's hourly cost rate and excludes rejected hours.</div>}
          </div>
          <div style={{ ...panel, flex: 1, minWidth: 260, overflowX: "auto" }}>
            <h4 style={{ margin: "0 0 8px" }}>Hours by employee</h4>
            <table width="100%">
              <thead><tr style={{ textAlign: "left" }}><th>Employee</th><th>Hours</th></tr></thead>
              <tbody>
                {summary.by_employee.map((e) => <tr key={e.employee_id}><td>{e.employee_name}</td><td>{e.hours}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
