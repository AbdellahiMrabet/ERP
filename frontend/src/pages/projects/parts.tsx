// NEW FILE (Projects module)
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 100 ? "#10b981" : pct >= 50 ? "#4f46e5" : "#0ea5e9";
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 999, height: 8, overflow: "hidden", minWidth: 90 }}>
      <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
    </div>
  );
}
