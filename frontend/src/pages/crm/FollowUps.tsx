import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { FollowUp, FollowUpType, Opportunity } from "../../types";
import { FOLLOWUP_TYPES, errMsg, formatDateTime } from "./constants";
import { Badge, errorBox, panel } from "./ui";

interface Form {
  subject: string;
  type: FollowUpType;
  due_at: string;
  opportunity_id: string;
  notes: string;
}

const emptyForm: Form = { subject: "", type: "call", due_at: "", opportunity_id: "", notes: "" };

type StatusFilter = "pending" | "done" | "all";

export default function FollowUps({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("crm:manage");

  const [items, setItems] = useState<FollowUp[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [mine, setMine] = useState(true);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    if (mine) qs.set("mine", "1");
    try {
      const [f, o] = await Promise.all([
        api.get<FollowUp[]>(`/crm/followups?${qs.toString()}`),
        api.get<Opportunity[]>("/crm/opportunities"),
      ]);
      setItems(f);
      setOpps(o.filter((x) => x.stage !== "won" && x.stage !== "lost"));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [status, mine]);

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

  const add = () =>
    run(async () => {
      await api.send("POST", "/crm/followups", {
        subject: form.subject,
        type: form.type,
        due_at: form.due_at,
        opportunity_id: form.opportunity_id ? Number(form.opportunity_id) : null,
        notes: form.notes,
      });
      setForm(emptyForm);
    });

  const complete = (f: FollowUp) => void run(() => api.send("POST", `/crm/followups/${f.id}/complete`));
  const remove = (f: FollowUp) => {
    if (window.confirm(`Delete "${f.subject}"?`)) void run(() => api.send("DELETE", `/crm/followups/${f.id}`));
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Follow-ups · المتابعات</h3>
      {error && <div style={errorBox}>{error}</div>}

      {canManage && (
        <div style={{ ...panel, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Subject · الموضوع" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FollowUpType })}>
            {FOLLOWUP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          <select value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })}>
            <option value="">opportunity…</option>
            {opps.map((o) => <option key={o.id} value={o.id}>{o.title} — {o.client_name}</option>)}
          </select>
          <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button onClick={() => void add()}>Add follow-up</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
          <option value="all">All</option>
        </select>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me
        </label>
      </div>

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr align="left"><th>Due</th><th>Subject</th><th>Type</th><th>Related to</th><th>Assigned</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} style={{ color: "#6b7280" }}>No follow-ups.</td></tr>}
            {items.map((f) => (
              <tr key={f.id} style={{ color: f.overdue ? "#b91c1c" : undefined }}>
                <td>{formatDateTime(f.due_at)}</td>
                <td>{f.subject}{f.notes ? <div style={{ fontSize: 12, color: "#6b7280" }}>{f.notes}</div> : null}</td>
                <td>{f.type}</td>
                <td>{f.opportunity_title ?? f.client_name}</td>
                <td>{f.assignee_name}</td>
                <td>
                  {f.overdue ? <Badge text="Overdue" color="#ef4444" />
                    : <Badge text={f.status} color={f.status === "done" ? "#10b981" : "#6b7280"} />}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {canManage && f.status === "pending" && <button onClick={() => complete(f)}>Done</button>}{" "}
                  {canManage && <button onClick={() => remove(f)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
