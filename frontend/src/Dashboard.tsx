import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { Link } from "react-router-dom"; // NEW (CRM)
import { api } from "./api";
import { useAuth } from "./auth/AuthContext";
import { STAGES } from "./pages/crm/constants"; // NEW (CRM)
import { Badge } from "./pages/crm/ui"; // NEW (Projects)
import { deadlineOf } from "./pages/projects/constants"; // NEW (Projects)
import { ProgressBar } from "./pages/projects/parts"; // NEW (Projects)
import type {
  Client, Project, ProjectStatus, DashboardData, TransactionType,
  CrmSummary, // NEW (CRM)
  PmProject, // NEW (Projects): has `completion`, tasks_done, days_left...
} from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];

const money = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// CORRECTED: turn any thrown value into readable text for the error banner
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "Request failed");

// ---------- Small UI pieces ----------
interface KpiProps { label: string; value: string | number; tone?: string }

function Kpi({ label, value, tone }: KpiProps) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px #0002", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? "#111827" }}>{value}</div>
    </div>
  );
}

interface CardProps { title: string; children: ReactNode; action?: ReactNode }

function Card({ title, children, action }: CardProps) {
  return (
    <section style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px #0002", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------- Clients ----------
interface ClientsProps { clients: Client[]; reload: () => Promise<void>; onError: (message: string) => void } // CORRECTED: onError
interface ClientForm { name: string; email: string; company: string }
const emptyClient: ClientForm = { name: "", email: "", company: "" };

function Clients({ clients, reload, onError }: ClientsProps) {
  const canManage = useAuth().can("clients:manage");
  const [form, setForm] = useState<ClientForm>(emptyClient);

  // CORRECTED: failed requests (e.g. deleting a client that has projects) now show a message instead of failing silently
  const add = async () => {
    if (!form.name) return;
    try {
      await api.send("POST", "/clients", form);
      setForm(emptyClient);
      await reload();
    } catch (e) {
      onError(errMsg(e));
    }
  };

  const remove = async (c: Client) => {
    if (!window.confirm(`Delete client "${c.name}"?`)) return;
    try {
      await api.send("DELETE", `/clients/${c.id}`);
      await reload();
    } catch (e) {
      onError(errMsg(e));
    }
  };

  return (
    <Card title="Clients">
      {canManage && (
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(Object.keys(form) as (keyof ClientForm)[]).map((k) => (
          <input
            key={k}
            placeholder={k}
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        ))}
        <button onClick={add}>Add client</button>
      </div>
      )}
      <table width="100%">
        <thead><tr style={{ textAlign: "left" }}><th>Name</th><th>Company</th><th>Email</th><th /></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.company}</td><td>{c.email}</td>
              <td>{canManage && <button onClick={() => remove(c)}>Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------- Completion and deadline cells (NEW: Projects module) ----------
// Completion lives on PmProject (`completion`, from /api/pm/projects), not on the finance `Project` type.
function ProgressCell({ pm }: { pm: PmProject | undefined }) {
  if (!pm) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <div style={{ minWidth: 120 }}>
      <ProgressBar value={pm.completion} />
      <div style={{ fontSize: 12, color: "#6b7280" }}>{pm.completion}% · {pm.tasks_done}/{pm.tasks_total} tasks</div>
    </div>
  );
}

function DeadlineCell({ pm }: { pm: PmProject | undefined }) {
  if (!pm) return <span style={{ color: "#9ca3af" }}>—</span>;
  const d = deadlineOf(pm);
  return <Badge text={d.text} color={d.color} />;
}

// ---------- Projects ----------
interface ProjectsProps { projects: Project[]; clients: Client[]; reload: () => Promise<void>; onError: (message: string) => void; progress: Record<number, PmProject> } // CORRECTED: onError; NEW: progress
interface ProjectForm { name: string; client_id: string; budget: string }
interface TxForm { project_id: string; type: TransactionType; category: string; amount: string }

const emptyProject: ProjectForm = { name: "", client_id: "", budget: "" };
const emptyTx: TxForm = { project_id: "", type: "revenue", category: "", amount: "" };

function Projects({ projects, clients, reload, onError, progress }: ProjectsProps) {
  const { can } = useAuth();
  const canManage = can("projects:manage");
  const canFinance = can("finance:manage");
  const canReport = can("reports:view");
  const [form, setForm] = useState<ProjectForm>(emptyProject);
  const [tx, setTx] = useState<TxForm>(emptyTx);

  // CORRECTED: every action reports failures through onError
  const attempt = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      onError(errMsg(e));
    }
  };

  const add = () =>
    attempt(async () => {
      if (!form.name || !form.client_id) return;
      await api.send("POST", "/projects", {
        name: form.name,
        client_id: Number(form.client_id),
        budget: Number(form.budget) || 0,
      });
      setForm(emptyProject);
      await reload();
    });

  const addTx = () =>
    attempt(async () => {
      if (!tx.project_id || !tx.amount) return;
      await api.send("POST", "/transactions", {
        project_id: Number(tx.project_id),
        type: tx.type,
        category: tx.category,
        amount: Number(tx.amount),
      });
      setTx({ ...tx, category: "", amount: "" });
      await reload();
    });

  const setStatus = (id: number, status: ProjectStatus) =>
    attempt(async () => {
      await api.send("PUT", `/projects/${id}`, { status });
      await reload();
    });

  return (
    <Card title="Projects" action={
      <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link to="/projects">Open Projects →</Link>
        {canReport && (
          <button onClick={() => void api.download("/reports/projects.csv", "projects_report.csv").catch((e: unknown) => onError(errMsg(e)))}>
            Export CSV report
          </button>
        )}
      </span>
    }>
      {canManage && (
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input placeholder="project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
          <option value="">client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="budget" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        <button onClick={add}>Add project</button>
      </div>
      )}

      {canFinance && (
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={tx.project_id} onChange={(e) => setTx({ ...tx, project_id: e.target.value })}>
          <option value="">project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={tx.type} onChange={(e) => setTx({ ...tx, type: e.target.value as TransactionType })}>
          <option value="revenue">Revenue</option>
          <option value="expense">Expense</option>
        </select>
        <input placeholder="category" value={tx.category} onChange={(e) => setTx({ ...tx, category: e.target.value })} />
        <input placeholder="amount" type="number" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} />
        <button onClick={addTx}>Add transaction</button>
      </div>
      )}

      <table width="100%">
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>Project</th><th>Client</th><th>Status</th><th>Budget</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Progress</th><th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.client_name}</td>
              <td>
                <select value={p.status} disabled={!canManage} onChange={(e) => setStatus(p.id, e.target.value as ProjectStatus)}>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="on_hold">on hold</option>
                </select>
              </td>
              <td>{money(p.budget)}</td>
              <td>{money(p.revenue)}</td>
              <td>{money(p.expenses)}</td>
              <td style={{ color: p.profit >= 0 ? "#059669" : "#dc2626" }}>{money(p.profit)}</td>
              <td><ProgressCell pm={progress[p.id]} /></td>
              <td><DeadlineCell pm={progress[p.id]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------- CRM overview (NEW) ----------
function CrmOverview() {
  const [s, setS] = useState<CrmSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<CrmSummary>("/crm/summary").then(setS).catch((e: unknown) => setError(errMsg(e)));
  }, []);

  // CORRECTED: a failed request used to hide this section silently; now the reason is shown
  if (error) {
    return (
      <Card title="CRM · Sales pipeline · فرص الأعمال" action={<Link to="/crm">Open CRM →</Link>}>
        <p style={{ margin: 0, color: "#b91c1c" }}>CRM data could not be loaded: {error}</p>
      </Card>
    );
  }
  if (!s) return null;

  const funnel = STAGES.filter((st) => st.key !== "lost").map((st) => ({
    name: st.en,
    value: s.stages[st.key].value,
    color: st.color,
  }));

  return (
    <Card title="CRM · Sales pipeline · فرص الأعمال" action={<Link to="/crm">Open CRM →</Link>}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Open pipeline" value={money(s.open_value)} />
        <Kpi label="Weighted forecast" value={money(s.forecast)} tone="#4f46e5" />
        <Kpi label="Win rate" value={`${s.win_rate}%`} tone="#059669" />
        <Kpi label="Overdue follow-ups" value={s.overdue_followups} tone={s.overdue_followups ? "#dc2626" : undefined} />
        <Kpi label="Open quotations" value={s.quotes.draft + s.quotes.sent} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={funnel}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(v) => money(Number(v))} />
          <Bar dataKey="value" name="Value">
            {funnel.map((f, i) => <Cell key={i} fill={f.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ---------- Dashboard page ----------
export default function Dashboard() {
  const { can } = useAuth();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [progress, setProgress] = useState<Record<number, PmProject>>({}); // NEW (Projects)
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null); // CORRECTED: errors from add/delete/status actions

  const load = useCallback(async () => {
    try {
      const [d, c, p, pm] = await Promise.all([
        api.get<DashboardData>(`/dashboard?year=${year}`),
        can("clients:view") ? api.get<Client[]>("/clients") : Promise.resolve<Client[]>([]),
        can("projects:view") ? api.get<Project[]>("/projects") : Promise.resolve<Project[]>([]),
        // NEW (Projects): completion rate and deadline per project; the table still works if this call fails
        can("projects:view")
          ? api.get<PmProject[]>("/pm/projects").catch(() => [] as PmProject[])
          : Promise.resolve<PmProject[]>([]),
      ]);
      setData(d);
      setClients(c);
      setProjects(p);
      setProgress(Object.fromEntries(pm.map((x) => [x.id, x])));
      setError(null);
      setActionError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    }
  }, [year, can]);

  useEffect(() => { void load(); }, [load]);

  // CORRECTED: offer a retry (for example when the backend was not running yet)
  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "#dc2626" }}>{error}</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!data) return <p style={{ padding: 24 }}>Loading…</p>;

  const k = data.kpis;
  const monthly = data.monthly.map((m) => ({ ...m, name: MONTHS[m.month - 1] }));
  const currentYear = new Date().getFullYear();

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>ERP Dashboard</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((i) => <option key={i} value={currentYear - i}>{currentYear - i}</option>)}
        </select>
      </div>

      {actionError && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Revenue" value={money(k.revenue)} tone="#059669" />
        <Kpi label="Expenditure" value={money(k.expenses)} tone="#dc2626" />
        <Kpi label="Net profit" value={money(k.net_profit)} />
        <Kpi label="Estimated profit (incl. active projects)" value={money(k.estimated_profit)} tone="#4f46e5" />
        <Kpi label="Profit margin" value={`${k.profit_margin}%`} />
        <Kpi label="Active projects" value={`${k.active_projects} / ${k.total_projects}`} />
        <Kpi label="Clients" value={k.total_clients} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <Card title="Revenue vs expenditure (monthly)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" fill="#10b981" />
                <Bar dataKey="expenses" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <Card title="Expenses by category">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.expense_by_category} dataKey="amount" nameKey="category" outerRadius={90} label>
                  {data.expense_by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {can("crm:view") && <CrmOverview />} {/* NEW (CRM) */}

      <Card title="Top projects by profit">
        <table width="100%">
          <thead><tr style={{ textAlign: "left" }}><th>Project</th><th>Client</th><th>Revenue</th><th>Profit</th></tr></thead>
          <tbody>
            {data.top_projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.client_name}</td><td>{money(p.revenue)}</td><td>{money(p.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {can("projects:view") && <Projects projects={projects} clients={clients} reload={load} onError={setActionError} progress={progress} />}
      {can("clients:view") && <Clients clients={clients} reload={load} onError={setActionError} />}
    </div>
  );
}
