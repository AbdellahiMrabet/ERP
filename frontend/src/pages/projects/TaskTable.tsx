// NEW FILE (Projects module)
import { useAuth } from "../../auth/AuthContext";
import type { Task, TaskStatus } from "../../types";
import { Badge } from "../crm/ui";
import { PRIORITIES, TASK_STATUSES, colorOf, labelOf } from "./constants";

interface Props {
  tasks: Task[];
  showProject: boolean;
  onStatus: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export default function TaskTable({ tasks, showProject, onStatus, onEdit, onDelete }: Props) {
  const { user, can } = useAuth();
  const canManage = can("tasks:manage");
  const myEmail = user?.email.toLowerCase();

  // Task managers can update any task; an assignee can update their own
  const canUpdate = (t: Task) =>
    canManage || (!!myEmail && !!t.assignee_email && t.assignee_email.toLowerCase() === myEmail);

  return (
    <div style={{ overflowX: "auto" }}>
      <table width="100%">
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>Task</th>{showProject && <th>Project</th>}<th>Assigned to</th><th>Priority</th><th>Due</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr><td colSpan={showProject ? 7 : 6} style={{ color: "#6b7280" }}>No tasks.</td></tr>
          )}
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                {t.title}
                {t.description && <div style={{ fontSize: 12, color: "#6b7280" }}>{t.description}</div>}
              </td>
              {showProject && <td>{t.project_name}</td>}
              <td>{t.assignee_name ?? <span style={{ color: "#9ca3af" }}>unassigned</span>}</td>
              <td><Badge text={labelOf(PRIORITIES, t.priority)} color={colorOf(PRIORITIES, t.priority)} /></td>
              <td style={{ color: t.overdue ? "#b91c1c" : undefined, whiteSpace: "nowrap" }}>
                {t.due_date ?? "—"}{t.overdue ? " (overdue)" : ""}
              </td>
              <td>
                {canUpdate(t) ? (
                  <select value={t.status} onChange={(e) => onStatus(t, e.target.value as TaskStatus)}>
                    {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                ) : (
                  <Badge text={labelOf(TASK_STATUSES, t.status)} color={colorOf(TASK_STATUSES, t.status)} />
                )}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {canManage && <button onClick={() => onEdit(t)}>Edit</button>}{" "}
                {canManage && <button onClick={() => onDelete(t)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
