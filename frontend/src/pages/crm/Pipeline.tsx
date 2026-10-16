import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Client, Opportunity, Stage } from "../../types";
import { STAGES, errMsg, money } from "./constants";
import { Field, Modal, errorBox, grid2 } from "./ui";

interface Form {
  title: string;
  client_id: string;
  value: string;
  probability: string;
  expected_close_date: string;
  source: string;
  notes: string;
}

const emptyForm: Form = { title: "", client_id: "", value: "", probability: "", expected_close_date: "", source: "", notes: "" };

const toForm = (o: Opportunity): Form => ({
  title: o.title,
  client_id: String(o.client_id),
  value: String(o.value),
  probability: String(o.probability),
  expected_close_date: o.expected_close_date ?? "",
  source: o.source ?? "",
  notes: o.notes ?? "",
});

export default function Pipeline({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("crm:manage");

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Opportunity | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        api.get<Opportunity[]>("/crm/opportunities"),
        can("clients:view") ? api.get<Client[]>("/clients") : Promise.resolve<Client[]>([]),
      ]);
      setOpps(o);
      setClients(c);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [can]);

  useEffect(() => { void load(); }, [load]);

  // Run a mutation, show any server error, then refresh the board and the summary
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

  const moveTo = (opp: Opportunity, stage: Stage) => {
    if (stage === opp.stage) return;
    let lost_reason: string | undefined;
    if (stage === "lost") {
      const reason = window.prompt("Why was this opportunity lost? (required)");
      if (!reason?.trim()) return;
      lost_reason = reason.trim();
    }
    void run(() => api.send("PUT", `/crm/opportunities/${opp.id}/stage`, { stage, lost_reason }));
  };

  const openNew = () => { setForm(emptyForm); setEditing("new"); setError(null); };
  const openEdit = (o: Opportunity) => { setForm(toForm(o)); setEditing(o); setError(null); };

  const save = () =>
    run(async () => {
      const body = {
        title: form.title,
        client_id: Number(form.client_id) || null,
        value: form.value || 0,
        probability: form.probability === "" ? undefined : Number(form.probability),
        expected_close_date: form.expected_close_date || null,
        source: form.source,
        notes: form.notes,
      };
      if (editing === "new") await api.send("POST", "/crm/opportunities", body);
      else if (editing) await api.send("PUT", `/crm/opportunities/${editing.id}`, body);
      setEditing(null); // only reached when the request succeeded
    });

  const remove = () => {
    if (editing && editing !== "new" && window.confirm(`Delete "${editing.title}"?`)) {
      void run(async () => {
        await api.send("DELETE", `/crm/opportunities/${editing.id}`);
        setEditing(null);
      });
    }
  };

  const onDrop = (stage: Stage) => {
    const opp = opps.find((o) => o.id === dragId);
    setDragId(null);
    setOverStage(null);
    if (opp && canManage) moveTo(opp, stage);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Sales pipeline · فرص الأعمال ومراحلها</h3>
        {canManage && <button onClick={openNew}>+ New opportunity</button>}
      </div>
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {STAGES.map((st) => {
          const column = opps.filter((o) => o.stage === st.key);
          const total = column.reduce((sum, o) => sum + o.value, 0);
          return (
            <div
              key={st.key}
              onDragOver={(e) => { if (canManage) { e.preventDefault(); setOverStage(st.key); } }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => onDrop(st.key)}
              style={{
                minWidth: 240, flex: 1, background: overStage === st.key ? "#e0e7ff" : "#f9fafb",
                borderRadius: 12, padding: 10, borderTop: `4px solid ${st.color}`,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <strong>{st.en}</strong> <span style={{ color: "#6b7280" }}>· {st.ar}</span>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{column.length} · {money(total)}</div>
              </div>

              {column.map((o) => (
                <div
                  key={o.id}
                  draggable={canManage}
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  onClick={() => openEdit(o)}
                  style={{
                    background: "#fff", borderRadius: 8, padding: 10, marginBottom: 8, cursor: "pointer",
                    boxShadow: "0 1px 2px #0002", opacity: dragId === o.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{o.title}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>{o.client_name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 13 }}>
                    <span>{money(o.value)}</span>
                    <span style={{ color: "#6b7280" }}>{o.probability}%</span>
                  </div>
                  {o.expected_close_date && (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Close: {o.expected_close_date}</div>
                  )}
                  {o.stage === "lost" && o.lost_reason && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>Reason: {o.lost_reason}</div>
                  )}
                  {canManage && (
                    // Dropdown alternative to dragging (touch screens, keyboard)
                    <select
                      value={o.stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => moveTo(o, e.target.value as Stage)}
                      style={{ marginTop: 6, width: "100%" }}
                    >
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.en} · {s.ar}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing === "new" ? "New opportunity" : "Opportunity"} onClose={() => setEditing(null)}>
          {error && <div style={errorBox}>{error}</div>}
          <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
            <div style={grid2}>
              <Field label="Title · العنوان" wide>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Client · العميل" wide>
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Value · القيمة">
                <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </Field>
              <Field label="Win probability % · الاحتمالية">
                <input type="number" min="0" max="100" placeholder="auto from stage" value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: e.target.value })} />
              </Field>
              <Field label="Expected close · تاريخ الإغلاق المتوقع">
                <input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
              </Field>
              <Field label="Source · المصدر">
                <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </Field>
              <Field label="Notes · ملاحظات" wide>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          </fieldset>
          {canManage && (
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "space-between" }}>
              <div>{editing !== "new" && <button onClick={remove}>Delete</button>}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditing(null)}>Cancel</button>
                <button onClick={() => void save()}>Save</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
