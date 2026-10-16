import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";
import Dashboard from "./Dashboard";
import Login from "./pages/Login";
import Users from "./pages/Users";
import CrmPage from "./pages/crm/CrmPage"; // NEW (CRM)
import ProjectsPage from "./pages/projects/ProjectsPage"; // NEW (Projects)
import HrPage from "./pages/hr/HrPage"; // NEW (HR)

function NavBar() {
  const { user, can, logout } = useAuth();
  if (!user) return null;

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    marginRight: 16,
    fontWeight: isActive ? 700 : 400,
    color: "#fff",
    textDecoration: "none",
  });

  return (
    <nav style={{ display: "flex", alignItems: "center", padding: "12px 24px", background: "#1f2937", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {can("dashboard:view") && <NavLink to="/" end style={linkStyle}>Dashboard</NavLink>}
      {/* NEW (Projects) */}
      {can("projects:view") && <NavLink to="/projects" style={linkStyle}>Projects</NavLink>}
      {/* NEW (HR) */}
      {can("projects:view") && <NavLink to="/hr" style={linkStyle}>HR</NavLink>}
      {/* NEW (CRM) */}
      {can("crm:view") && <NavLink to="/crm" style={linkStyle}>CRM</NavLink>}
      {can("users:manage") && <NavLink to="/users" style={linkStyle}>Users &amp; roles</NavLink>}
      <span style={{ marginLeft: "auto" }}>{user.name} ({user.role})</span>
      <button onClick={logout} style={{ marginLeft: 12 }}>Sign out</button>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth permission="dashboard:view"><Dashboard /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth permission="users:manage"><Users /></RequireAuth>} />
          {/* NEW (Projects) */}
          <Route path="/projects" element={<RequireAuth permission="projects:view"><ProjectsPage /></RequireAuth>} />
          {/* NEW (HR) */}
          <Route path="/hr" element={<RequireAuth permission="projects:view"><HrPage /></RequireAuth>} />
          {/* NEW (CRM) */}
          <Route path="/crm" element={<RequireAuth permission="crm:view"><CrmPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
