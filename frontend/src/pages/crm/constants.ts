import type { FollowUpType, QuoteStatus, Stage } from "../../types";

export const STAGES: { key: Stage; en: string; ar: string; color: string }[] = [
  { key: "lead", en: "Lead", ar: "عميل محتمل", color: "#6b7280" },
  { key: "qualified", en: "Qualified", ar: "مؤهل", color: "#0ea5e9" },
  { key: "proposal", en: "Proposal", ar: "عرض سعر", color: "#8b5cf6" },
  { key: "negotiation", en: "Negotiation", ar: "تفاوض", color: "#f59e0b" },
  { key: "won", en: "Won", ar: "مكسوبة", color: "#10b981" },
  { key: "lost", en: "Lost", ar: "خسارة", color: "#ef4444" },
];

export const FOLLOWUP_TYPES: { key: FollowUpType; label: string }[] = [
  { key: "call", label: "Call" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
  { key: "visit", label: "Visit" },
  { key: "other", label: "Other" },
];

export const QUOTE_STATUSES: { key: QuoteStatus; label: string; color: string }[] = [
  { key: "draft", label: "Draft", color: "#6b7280" },
  { key: "sent", label: "Sent", color: "#0ea5e9" },
  { key: "accepted", label: "Accepted", color: "#10b981" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
  { key: "expired", label: "Expired", color: "#f59e0b" },
];

export const money = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money2 = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "Request failed");

// Server sends naive local datetimes; <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"
export const toLocalInput = (iso: string): string => iso.slice(0, 16);

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
