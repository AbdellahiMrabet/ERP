import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Permission } from "../types";

interface Props {
  permission?: Permission;
  children: ReactNode;
}

export default function RequireAuth({ permission, children }: Props) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (permission && !can(permission)) {
    return <p style={{ padding: 24, color: "#dc2626" }}>You don't have access to this page.</p>;
  }
  return <>{children}</>;
}
