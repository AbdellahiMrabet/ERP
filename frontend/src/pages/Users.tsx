import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Permission, PermissionInfo, Role, User } from "../types";

interface NewUser { name: string; email: string; password: string; role_id: string }
const emptyUser: NewUser = { name: "", email: "", password: "", role_id: "" };

const card = { background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px #0002", marginBottom: 16 } as const;

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<PermissionInfo[]>([]);
  const [form, setForm] = useState<NewUser>(emptyUser);
  const [roleName, setRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, r, p] = await Promise.all([
        api.get<User[]>("/users"),
        api.get<Role[]>("/roles"),
        api.get<PermissionInfo[]>("/permissions"),
      ]);
      setUsers(u);
      setRoles(r);
      setPerms(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Run a mutation, surface any server error, then refresh
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
    await load();
  };

  const createUser = () =>
    run(async () => {
      await api.send("POST", "/users", { ...form, role_id: Number(form.role_id) });
      setForm(emptyUser);
    });

  const resetPassword = (u: User) => {
    const password = window.prompt(`New password for ${u.email} (min 8 characters)`);
    if (password) void run(() => api.send("PUT", `/users/${u.id}`, { password }));
  };

  const removeUser = (u: User) => {
    if (window.confirm(`Delete ${u.email}?`)) void run(() => api.send("DELETE", `/users/${u.id}`));
  };

  const togglePermission = (role: Role, key: Permission) => {
    const next = role.permissions.includes(key)
      ? role.permissions.filter((p) => p !== key)
      : [...role.permissions, key];
    void run(() => api.send("PUT", `/roles/${role.id}`, { permissions: next }));
  };

  const createRole = () =>
    run(async () => {
      if (!roleName.trim()) return;
      await api.send("POST", "/roles", { name: roleName, permissions: [] });
      setRoleName("");
    });

  const removeRole = (r: Role) => {
    if (window.confirm(`Delete role "${r.name}"?`)) void run(() => api.send("DELETE", `/roles/${r.id}`));
  };

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Users &amp; roles</h1>
      {error && <div style={{ ...card, color: "#dc2626" }}>{error}</div>}

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Users</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="password (min 8)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            <option value="">role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={createUser}>Add user</button>
        </div>

        <table width="100%">
          <thead>
            <tr align="left"><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Last login</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me?.id ? " (you)" : ""}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role_id ?? ""} onChange={(e) => void run(() => api.send("PUT", `/users/${u.id}`, { role_id: Number(e.target.value) }))}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={u.is_active} disabled={u.id === me?.id}
                    onChange={(e) => void run(() => api.send("PUT", `/users/${u.id}`, { is_active: e.target.checked }))} />
                </td>
                <td>{u.last_login_at ? new Date(u.last_login_at + "Z").toLocaleString() : "never"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => resetPassword(u)}>Reset password</button>{" "}
                  <button onClick={() => removeUser(u)} disabled={u.id === me?.id}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Roles &amp; permissions</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input placeholder="new role name" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
          <button onClick={createRole}>Add role</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table width="100%">
            <thead>
              <tr align="left">
                <th>Permission</th>
                {roles.map((r) => (
                  <th key={r.id} style={{ textAlign: "center" }}>
                    {r.name}
                    {!r.is_system && <> <button onClick={() => removeRole(r)} title="Delete role">×</button></>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((p) => (
                <tr key={p.key}>
                  <td title={p.description}>
                    <code>{p.key}</code>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{p.description}</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={r.permissions.includes(p.key)} disabled={r.is_system}
                        onChange={() => togglePermission(r, p.key)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 0 }}>The admin role is locked and always has every permission.</p>
      </section>
    </div>
  );
}
