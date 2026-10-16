import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { CrmSummary } from "../../types";
import FollowUps from "./FollowUps";
import Pipeline from "./Pipeline";
import Quotes from "./Quotes";
import { money } from "./constants";
import { panel } from "./ui";

type Tab = "pipeline" | "followups" | "quotes";

const TABS: { key: Tab; en: string; ar: string }[] = [
  { key: "pipeline", en: "Pipeline", ar: "فرص الأعمال" },
  { key: "followups", en: "Follow-ups", ar: "المتابعات" },
  { key: "quotes", en: "Quotations", ar: "عروض الأسعار" },
];

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px #0002", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ?? "#111827" }}>{value}</div>
    </div>
  );
}

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [summary, setSummary] = useState<CrmSummary | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.get<CrmSummary>("/crm/summary"));
    } catch {
      /* each tab shows its own errors */
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>CRM</h1>

      {summary && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Kpi label="Open pipeline" value={money(summary.open_value)} />
          <Kpi label="Weighted forecast" value={money(summary.forecast)} tone="#4f46e5" />
          <Kpi label="Win rate" value={`${summary.win_rate}%`} tone="#059669" />
          <Kpi label="Overdue follow-ups" value={summary.overdue_followups} tone={summary.overdue_followups ? "#dc2626" : undefined} />
          <Kpi label="Due today" value={summary.due_today} />
          <Kpi label="Open quotations" value={summary.quotes.draft + summary.quotes.sent} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ fontWeight: tab === t.key ? 700 : 400, borderBottom: tab === t.key ? "3px solid #4f46e5" : "3px solid transparent" }}
          >
            {t.en} · {t.ar}
          </button>
        ))}
      </div>

      <div style={{ ...panel, background: "transparent", boxShadow: "none", padding: 0 }}>
        {tab === "pipeline" && <Pipeline onChange={loadSummary} />}
        {tab === "followups" && <FollowUps onChange={loadSummary} />}
        {tab === "quotes" && <Quotes onChange={loadSummary} />}
      </div>
    </div>
  );
}
