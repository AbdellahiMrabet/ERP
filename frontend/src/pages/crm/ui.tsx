import type { CSSProperties, ReactNode } from "react";

export const panel: CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px #0002", marginBottom: 16,
};

export const errorBox: CSSProperties = {
  background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 14,
};

export const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#374151", gridColumn: wide ? "1 / -1" : undefined }}>
      {label}
      {children}
    </label>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 560 }: ModalProps) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0006", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
