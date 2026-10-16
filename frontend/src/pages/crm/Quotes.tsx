import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Client, Opportunity, Quote, QuoteStatus } from "../../types";
import { QUOTE_STATUSES, errMsg, money2 } from "./constants";
import { Badge, Field, Modal, errorBox, grid2, panel } from "./ui";

interface LineForm { description: string; quantity: string; unit_price: string }

interface Form {
  client_id: string;
  opportunity_id: string;
  title: string;
  issue_date: string;
  valid_until: string;
  discount_percent: string;
  tax_percent: string;
  notes: string;
  terms: string;
  items: LineForm[];
}

const emptyLine: LineForm = { description: "", quantity: "1", unit_price: "" };

const newForm = (): Form => ({
  client_id: "", opportunity_id: "", title: "",
  issue_date: new Date().toISOString().slice(0, 10), valid_until: "",
  discount_percent: "0", tax_percent: "0", notes: "", terms: "",
  items: [{ ...emptyLine }],
});

const toForm = (q: Quote): Form => ({
  client_id: String(q.client_id),
  opportunity_id: q.opportunity_id ? String(q.opportunity_id) : "",
  title: q.title,
  issue_date: q.issue_date ?? "",
  valid_until: q.valid_until ?? "",
  discount_percent: String(q.discount_percent),
  tax_percent: String(q.tax_percent),
  notes: q.notes ?? "",
  terms: q.terms ?? "",
  items: q.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })),
});

export default function Quotes({ onChange }: { onChange: () => void }) {
  const { can } = useAuth();
  const canManage = can("quotes:manage");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  const [form, setForm] = useState<Form>(newForm());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [q, c, o] = await Promise.all([
        api.get<Quote[]>("/crm/quotes"),
        can("clients:view") ? api.get<Client[]>("/clients") : Promise.resolve<Client[]>([]),
        api.get<Opportunity[]>("/crm/opportunities"),
      ]);
      setQuotes(q);
      setClients(c);
      setOpps(o);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [can]);

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

  const readOnly = editing !== null && editing !== "new" && editing.status !== "draft";

  // Live totals (the server recomputes them on save)
  const subtotal = form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const discount = subtotal * (Number(form.discount_percent) || 0) / 100;
  const tax = (subtotal - discount) * (Number(form.tax_percent) || 0) / 100;
  const total = subtotal - discount + tax;

  const setLine = (index: number, patch: Partial<LineForm>) =>
    setForm({ ...form, items: form.items.map((l, i) => (i === index ? { ...l, ...patch } : l)) });

  const openNew = () => { setForm(newForm()); setEditing("new"); setError(null); };
  const openEdit = (q: Quote) => { setForm(toForm(q)); setEditing(q); setError(null); };

  const save = () =>
    run(async () => {
      const body = {
        client_id: Number(form.client_id) || null,
        opportunity_id: form.opportunity_id ? Number(form.opportunity_id) : null,
        title: form.title,
        issue_date: form.issue_date || null,
        valid_until: form.valid_until || null,
        discount_percent: form.discount_percent || 0,
        tax_percent: form.tax_percent || 0,
        notes: form.notes,
        terms: form.terms,
        items: form.items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price || 0 })),
      };
      if (editing === "new") await api.send("POST", "/crm/quotes", body);
      else if (editing) await api.send("PUT", `/crm/quotes/${editing.id}`, body);
      setEditing(null);
    });

  const setStatus = (q: Quote, status: QuoteStatus) =>
    void run(() => api.send("PUT", `/crm/quotes/${q.id}/status`, { status }));

  const remove = (q: Quote) => {
    if (window.confirm(`Delete ${q.number ?? "this quotation"}?`)) void run(() => api.send("DELETE", `/crm/quotes/${q.id}`));
  };

  const clientOpps = opps.filter((o) => !form.client_id || String(o.client_id) === form.client_id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Quotations · عروض الأسعار</h3>
        {canManage && <button onClick={openNew}>+ New quotation</button>}
      </div>
      {error && !editing && <div style={errorBox}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table width="100%">
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Number</th>
              <th>Title</th>
              <th>Client</th>
              <th>Valid until</th>
              <th>Total</th>
              <th>Status</th>
              <th /></tr>
          </thead>
          <tbody>
            {quotes.length === 0 && <tr><td colSpan={7} style={{ color: "#6b7280" }}>No quotations yet.</td></tr>}
            {quotes.map((q) => {
              const meta = QUOTE_STATUSES.find((s) => s.key === q.status);
              return (
                <tr key={q.id}>
                  <td>{q.number}</td>
                  <td>{q.title}{q.opportunity_title ? <div style={{ fontSize: 12, color: "#6b7280" }}>{q.opportunity_title}</div> : null}</td>
                  <td>{q.client_name}</td>
                  <td>{q.valid_until ?? "—"}</td>
                  <td>{money2(q.total)}</td>
                  <td>
                    {canManage ? (
                      <select value={q.status} onChange={(e) => setStatus(q, e.target.value as QuoteStatus)}>
                        {QUOTE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    ) : <Badge text={meta?.label ?? q.status} color={meta?.color ?? "#6b7280"} />}
                    {q.expired && <> <Badge text="Past validity" color="#f59e0b" /></>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => openEdit(q)}>{q.status === "draft" && canManage ? "Edit" : "View"}</button>{" "}
                    {canManage && q.status === "draft" && <button onClick={() => remove(q)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? "New quotation" : `Quotation ${editing.number ?? ""}`}
          onClose={() => setEditing(null)}
          width={820}
        >
          {error && <div style={errorBox}>{error}</div>}
          {readOnly && (
            <div style={{ ...errorBox, background: "#eff6ff", color: "#1d4ed8" }}>
              Only draft quotations can be edited. Set the status back to Draft to make changes.
            </div>
          )}
          <fieldset disabled={readOnly || !canManage} style={{ border: 0, padding: 0, margin: 0 }}>
            <div style={grid2}>
              <Field label="Title · العنوان" wide>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Client · العميل">
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, opportunity_id: "" })}>
                  <option value="">select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Opportunity · الفرصة (optional)">
                <select value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })}>
                  <option value="">none</option>
                  {clientOpps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </Field>
              <Field label="Issue date · تاريخ الإصدار">
                <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
              </Field>
              <Field label="Valid until · صالح حتى">
                <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </Field>
            </div>

            <table width="100%" style={{ marginTop: 16 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Description · البند</th>
                  <th style={{ width: 90 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit price</th>
                  <th style={{ width: 110 }}>Amount</th>
                  <th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {form.items.map((line, i) => (
                  <tr key={i}>
                    <td><input style={{ width: "100%" }} value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                    <td><input style={{ width: "100%" }} type="number" min="0" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                    <td><input style={{ width: "100%" }} type="number" min="0" value={line.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                    <td>{money2((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</td>
                    <td>
                      {form.items.length > 1 && (
                        <button onClick={() => setForm({ ...form, items: form.items.filter((_, n) => n !== i) })} aria-label="Remove line">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={{ marginTop: 8 }} onClick={() => setForm({ ...form, items: [...form.items, { ...emptyLine }] })}>+ Add line</button>

            <div style={{ ...grid2, marginTop: 16 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Discount % · الخصم">
                  <input type="number" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} />
                </Field>
                <Field label="Tax % · الضريبة">
                  <input type="number" min="0" max="100" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} />
                </Field>
              </div>
              <div style={{ textAlign: "right", alignSelf: "end", lineHeight: 1.8 }}>
                <div>Subtotal: {money2(subtotal)}</div>
                <div>Discount: −{money2(discount)}</div>
                <div>Tax: {money2(tax)}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Total: {money2(total)}</div>
              </div>
              <Field label="Notes · ملاحظات" wide>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <Field label="Terms & conditions · الشروط والأحكام" wide>
                <textarea rows={2} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
              </Field>
            </div>
          </fieldset>

          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(null)}>{readOnly || !canManage ? "Close" : "Cancel"}</button>
            {!readOnly && canManage && <button onClick={() => void save()}>Save</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
