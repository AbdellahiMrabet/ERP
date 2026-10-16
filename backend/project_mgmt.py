# NEW FILE (Projects module)
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from auth import current_user, permission_required
from db import db
from models import Client, Project, Transaction

pm_bp = Blueprint("pm", __name__, url_prefix="/api/pm")

PROJECT_STATUSES = {"active", "completed", "on_hold"}
PRIORITIES = {"low", "medium", "high"}
TASK_STATUSES = {"todo", "in_progress", "blocked", "done"}
MEMBER_ROLES = ["manager", "lead", "member", "observer"]  # also the display order


# ---------- Validation helpers ----------
class BadInput(Exception):
    pass


@pm_bp.errorhandler(BadInput)
def _bad_input(e):
    return jsonify(error=str(e)), 400


def _text(v):
    return (v or "").strip() or None


def _int(v, field):
    try:
        return int(v)
    except (TypeError, ValueError):
        raise BadInput(f"{field} must be an integer") from None


def _num(v, field):
    try:
        n = Decimal(str(0 if v in (None, "") else v))
    except InvalidOperation:
        raise BadInput(f"{field} must be a number") from None
    if not n.is_finite() or n < 0:
        raise BadInput(f"{field} must be zero or more")
    return n


def _date(v):
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise BadInput("invalid date, expected YYYY-MM-DD") from None


def _choice(v, allowed, field):
    if v not in allowed:
        raise BadInput(f"invalid {field}")
    return v


# ---------- Models ----------
class PmEmployee(db.Model):
    __tablename__ = "pm_employees"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True)  # also links an employee to a login with the same email
    job_title = db.Column(db.String(100))
    department = db.Column(db.String(100))
    phone = db.Column(db.String(40))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)


class PmProjectInfo(db.Model):
    """Extra project fields kept in their own table, so the existing `project` table is untouched."""
    __tablename__ = "pm_project_info"
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), primary_key=True)
    description = db.Column(db.Text)
    priority = db.Column(db.String(10), nullable=False, default="medium")


class PmProjectMember(db.Model):
    __tablename__ = "pm_project_members"
    __table_args__ = (db.UniqueConstraint("project_id", "employee_id", name="uq_pm_project_employee"),)
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False, index=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="member")
    responsibilities = db.Column(db.Text)
    added_at = db.Column(db.DateTime, default=datetime.now)
    employee = db.relationship("PmEmployee")


class PmTask(db.Model):
    __tablename__ = "pm_tasks"
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    assignee_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"))
    status = db.Column(db.String(20), nullable=False, default="todo", index=True)
    priority = db.Column(db.String(10), nullable=False, default="medium")
    due_date = db.Column(db.Date)
    completed_at = db.Column(db.DateTime)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    project = db.relationship("Project")
    assignee = db.relationship("PmEmployee")

    def to_dict(self):
        return {"id": self.id, "project_id": self.project_id,
                "project_name": self.project.name if self.project else None,
                "title": self.title, "description": self.description,
                "assignee_id": self.assignee_id,
                "assignee_name": self.assignee.name if self.assignee else None,
                "assignee_email": self.assignee.email if self.assignee else None,
                "status": self.status, "priority": self.priority,
                "due_date": self.due_date.isoformat() if self.due_date else None,
                "overdue": self.status != "done" and self.due_date is not None and self.due_date < date.today(),
                "completed_at": self.completed_at.isoformat() if self.completed_at else None}


def _employee_dict(e, open_tasks=0, projects=0):
    return {"id": e.id, "name": e.name, "email": e.email, "job_title": e.job_title,
            "department": e.department, "phone": e.phone, "is_active": e.is_active,
            "open_tasks": open_tasks, "project_count": projects}


def _my_employee():
    """The employee whose email matches the logged-in user's email (if any)."""
    user = current_user()
    if not user or not user.email:
        return None
    return PmEmployee.query.filter(func.lower(PmEmployee.email) == user.email.lower()).first()


# ---------- Project summaries (progress and deadlines) ----------
def _context(project_id=None):
    """PmTask stats, managers, team sizes and extra info, loaded in a handful of queries."""
    tq = db.session.query(PmTask.project_id, PmTask.status, PmTask.due_date)
    mq = (db.session.query(PmProjectMember.project_id, PmProjectMember.role, PmEmployee.name)
          .join(PmEmployee, PmEmployee.id == PmProjectMember.employee_id))
    iq = PmProjectInfo.query
    if project_id:
        tq = tq.filter(PmTask.project_id == project_id)
        mq = mq.filter(PmProjectMember.project_id == project_id)
        iq = iq.filter_by(project_id=project_id)

    today = date.today()
    stats = {}
    for pid, status, due in tq.all():
        total, done, overdue = stats.get(pid, (0, 0, 0))
        stats[pid] = (total + 1,
                      done + (1 if status == "done" else 0),
                      overdue + (1 if status != "done" and due is not None and due < today else 0))

    managers, counts = {}, {}
    for pid, role, name in mq.all():
        counts[pid] = counts.get(pid, 0) + 1
        if role == "manager":
            managers.setdefault(pid, name)

    return {"stats": stats, "managers": managers, "counts": counts,
            "infos": {i.project_id: i for i in iq.all()},
            "clients": {c.id: c.name for c in Client.query.all()}}


def _project_dict(p, ctx=None):
    ctx = ctx or _context(p.id)
    total, done, overdue_tasks = ctx["stats"].get(p.id, (0, 0, 0))
    info = ctx["infos"].get(p.id)
    today = date.today()
    days_left = (p.end_date - today).days if p.end_date else None
    if total:
        completion = round(done / total * 100)
    else:
        completion = 100 if p.status == "completed" else 0
    return {"id": p.id, "name": p.name, "client_id": p.client_id,
            "client_name": ctx["clients"].get(p.client_id),
            "status": p.status,
            "priority": info.priority if info else "medium",
            "description": info.description if info else None,
            "budget": float(p.budget or 0),
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "days_left": days_left,
            "overdue": bool(p.end_date and p.end_date < today and p.status != "completed"),
            "tasks_total": total, "tasks_done": done, "tasks_overdue": overdue_tasks,
            "completion": completion,
            "manager_name": ctx["managers"].get(p.id),
            "member_count": ctx["counts"].get(p.id, 0)}


def _member_dict(m, tasks):
    mine = [t for t in tasks if t.assignee_id == m.employee_id]
    return {"id": m.id, "employee_id": m.employee_id, "employee_name": m.employee.name,
            "job_title": m.employee.job_title, "role": m.role,
            "responsibilities": m.responsibilities,
            "open_tasks": sum(1 for t in mine if t.status != "done"),
            "done_tasks": sum(1 for t in mine if t.status == "done")}


def _members(project_id, tasks):
    rows = PmProjectMember.query.filter_by(project_id=project_id).all()
    rows.sort(key=lambda m: (MEMBER_ROLES.index(m.role) if m.role in MEMBER_ROLES else 99, m.employee.name))
    return [_member_dict(m, tasks) for m in rows]


def _apply_project(p, d, creating=False):
    if creating or "name" in d:
        name = _text(d.get("name"))
        if not name:
            raise BadInput("project name is required")
        p.name = name
    if creating or "client_id" in d:
        cid = _int(d.get("client_id"), "client") if d.get("client_id") else None
        if cid is None or db.session.get(Client, cid) is None:
            raise BadInput("a valid client is required")
        p.client_id = cid
    if "status" in d:
        p.status = _choice(d["status"], PROJECT_STATUSES, "status")
    if creating or "budget" in d:
        p.budget = _num(d.get("budget"), "budget")
    if "start_date" in d:
        p.start_date = _date(d["start_date"])
    if "end_date" in d:
        p.end_date = _date(d["end_date"])
    if p.start_date and p.end_date and p.end_date < p.start_date:
        raise BadInput("the deadline cannot be before the start date")


def _apply_info(info, d):
    if "description" in d:
        info.description = _text(d["description"])
    if "priority" in d:
        info.priority = _choice(d["priority"], PRIORITIES, "priority")


# ---------- Overview ----------
@pm_bp.get("/overview")
@permission_required("projects:view")
def overview():
    today = date.today()
    ctx = _context()
    projects = [_project_dict(p, ctx) for p in Project.query.all()]
    active = [p for p in projects if p["status"] == "active"]
    rates = [p["completion"] for p in active if p["tasks_total"]]
    me = _my_employee()
    open_tasks = [t for t in db.session.query(PmTask.status, PmTask.due_date, PmTask.assignee_id).all()
                  if t.status != "done"]
    return jsonify({
        "projects_total": len(projects),
        "projects_active": len(active),
        "projects_completed": sum(1 for p in projects if p["status"] == "completed"),
        "projects_overdue": sum(1 for p in projects if p["overdue"]),
        "avg_completion": round(sum(rates) / len(rates)) if rates else 0,
        "tasks_open": len(open_tasks),
        "tasks_overdue": sum(1 for t in open_tasks if t.due_date and t.due_date < today),
        "tasks_due_week": sum(1 for t in open_tasks
                              if t.due_date and today <= t.due_date <= today + timedelta(days=7)),
        "tasks_mine_open": sum(1 for t in open_tasks if me and t.assignee_id == me.id),
    })


# ---------- Projects ----------
@pm_bp.get("/projects")
@permission_required("projects:view")
def list_projects():
    ctx = _context()
    return jsonify([_project_dict(p, ctx) for p in Project.query.order_by(Project.id.desc()).all()])


@pm_bp.post("/projects")
@permission_required("projects:manage")
def create_project():
    d = request.get_json(silent=True) or {}
    p = Project(status="active")
    _apply_project(p, d, creating=True)

    manager = None
    if d.get("manager_id"):
        manager = db.session.get(PmEmployee, _int(d["manager_id"], "project manager"))
        if manager is None or not manager.is_active:
            raise BadInput("invalid project manager")

    db.session.add(p)
    db.session.flush()
    info = PmProjectInfo(project_id=p.id, priority="medium")
    _apply_info(info, d)
    db.session.add(info)
    if manager:
        db.session.add(PmProjectMember(project_id=p.id, employee_id=manager.id, role="manager"))
    db.session.commit()
    return jsonify(_project_dict(p)), 201


@pm_bp.get("/projects/<int:project_id>")
@permission_required("projects:view")
def get_project(project_id):
    p = db.get_or_404(Project, project_id)
    tasks = (PmTask.query.filter_by(project_id=project_id)
             .order_by(PmTask.due_date.is_(None), PmTask.due_date.asc(), PmTask.id.asc()).all())
    data = _project_dict(p)
    data["pm_tasks"] = [t.to_dict() for t in tasks]
    data["members"] = _members(project_id, tasks)
    return jsonify(data)


@pm_bp.put("/projects/<int:project_id>")
@permission_required("projects:manage")
def update_project(project_id):
    p = db.get_or_404(Project, project_id)
    d = request.get_json(silent=True) or {}
    _apply_project(p, d)
    info = db.session.get(PmProjectInfo, project_id)
    if info is None:
        info = PmProjectInfo(project_id=project_id, priority="medium")
        db.session.add(info)
    _apply_info(info, d)
    db.session.commit()
    return jsonify(_project_dict(p))


@pm_bp.delete("/projects/<int:project_id>")
@permission_required("projects:manage")
def delete_project(project_id):
    p = db.get_or_404(Project, project_id)
    if Transaction.query.filter_by(project_id=project_id).first():
        return jsonify(error="this project has financial transactions; mark it completed instead of deleting it"), 409
    PmTask.query.filter_by(project_id=project_id).delete()
    PmProjectMember.query.filter_by(project_id=project_id).delete()
    PmProjectInfo.query.filter_by(project_id=project_id).delete()
    db.session.delete(p)
    db.session.commit()
    return "", 204


# ---------- Project team (links employees to projects and defines responsibilities) ----------
@pm_bp.get("/projects/<int:project_id>/members")
@permission_required("projects:view")
def list_members(project_id):
    db.get_or_404(Project, project_id)
    tasks = PmTask.query.filter_by(project_id=project_id).all()
    return jsonify(_members(project_id, tasks))


@pm_bp.post("/projects/<int:project_id>/members")
@permission_required("projects:manage")
def add_member(project_id):
    db.get_or_404(Project, project_id)
    d = request.get_json(silent=True) or {}
    emp = db.session.get(PmEmployee, _int(d.get("employee_id"), "employee"))
    if emp is None or not emp.is_active:
        raise BadInput("choose an active employee")
    if PmProjectMember.query.filter_by(project_id=project_id, employee_id=emp.id).first():
        return jsonify(error="this employee is already on the project team"), 409
    m = PmProjectMember(project_id=project_id, employee_id=emp.id,
                      role=_choice(d.get("role", "member"), MEMBER_ROLES, "role"),
                      responsibilities=_text(d.get("responsibilities")))
    db.session.add(m)
    db.session.commit()
    return jsonify(_member_dict(m, [])), 201


@pm_bp.put("/projects/<int:project_id>/members/<int:member_id>")
@permission_required("projects:manage")
def update_member(project_id, member_id):
    m = PmProjectMember.query.filter_by(id=member_id, project_id=project_id).first_or_404()
    d = request.get_json(silent=True) or {}
    if "role" in d:
        m.role = _choice(d["role"], MEMBER_ROLES, "role")
    if "responsibilities" in d:
        m.responsibilities = _text(d["responsibilities"])
    db.session.commit()
    return jsonify(_member_dict(m, []))


@pm_bp.delete("/projects/<int:project_id>/members/<int:member_id>")
@permission_required("projects:manage")
def remove_member(project_id, member_id):
    m = PmProjectMember.query.filter_by(id=member_id, project_id=project_id).first_or_404()
    # Their tasks stay on the project, just unassigned
    PmTask.query.filter_by(project_id=project_id, assignee_id=m.employee_id).update({"assignee_id": None})
    db.session.delete(m)
    db.session.commit()
    return "", 204


# ---------- Tasks ----------
def _set_status(task, status):
    if status == task.status and (status != "done" or task.completed_at):
        return
    task.status = status
    task.completed_at = datetime.now() if status == "done" else None


def _apply_task(t, d, creating=False):
    if creating or "title" in d:
        title = _text(d.get("title"))
        if not title:
            raise BadInput("task title is required")
        t.title = title
    if "description" in d:
        t.description = _text(d["description"])
    if "priority" in d:
        t.priority = _choice(d["priority"], PRIORITIES, "priority")
    if "due_date" in d:
        t.due_date = _date(d["due_date"])
    if "assignee_id" in d:
        if d["assignee_id"]:
            eid = _int(d["assignee_id"], "assignee")
            on_team = PmProjectMember.query.filter_by(project_id=t.project_id, employee_id=eid).first()
            if on_team is None:
                raise BadInput("the assignee must be on the project team; add them to the team first")
            t.assignee_id = eid
        else:
            t.assignee_id = None
    if "status" in d:
        _set_status(t, _choice(d["status"], TASK_STATUSES, "status"))


@pm_bp.get("/tasks")
@permission_required("projects:view")
def list_tasks():
    q = PmTask.query
    if request.args.get("project_id", type=int):
        q = q.filter_by(project_id=request.args.get("project_id", type=int))
    if request.args.get("assignee_id", type=int):
        q = q.filter_by(assignee_id=request.args.get("assignee_id", type=int))
    status = request.args.get("status")
    if status == "open":
        q = q.filter(PmTask.status != "done")
    elif status in TASK_STATUSES:
        q = q.filter_by(status=status)
    if request.args.get("overdue") == "1":
        q = q.filter(PmTask.status != "done", PmTask.due_date < date.today())
    if request.args.get("mine") == "1":
        me = _my_employee()
        if me is None:
            return jsonify([])
        q = q.filter_by(assignee_id=me.id)
    q = q.order_by(PmTask.due_date.is_(None), PmTask.due_date.asc(), PmTask.id.asc())
    return jsonify([t.to_dict() for t in q.all()])


@pm_bp.post("/projects/<int:project_id>/tasks")
@permission_required("tasks:manage")
def create_task(project_id):
    db.get_or_404(Project, project_id)
    t = PmTask(project_id=project_id, status="todo", priority="medium", created_by=current_user().id)
    _apply_task(t, request.get_json(silent=True) or {}, creating=True)
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@pm_bp.put("/tasks/<int:task_id>")
@permission_required("tasks:manage")
def update_task(task_id):
    t = db.get_or_404(PmTask, task_id)
    _apply_task(t, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(t.to_dict())


@pm_bp.put("/tasks/<int:task_id>/status")
@permission_required("projects:view")
def update_task_status(task_id):
    """Task managers can change any task; an assignee can change their own task's status."""
    t = db.get_or_404(PmTask, task_id)
    me = _my_employee()
    if "tasks:manage" not in current_user().permissions and not (me and t.assignee_id == me.id):
        return jsonify(error="only the assignee or a task manager can change this task's status"), 403
    status = _choice((request.get_json(silent=True) or {}).get("status"), TASK_STATUSES, "status")
    _set_status(t, status)
    db.session.commit()
    return jsonify(t.to_dict())


@pm_bp.delete("/tasks/<int:task_id>")
@permission_required("tasks:manage")
def delete_task(task_id):
    db.session.delete(db.get_or_404(PmTask, task_id))
    db.session.commit()
    return "", 204


# ---------- Employees ----------
def _apply_employee(e, d, creating=False):
    if creating or "name" in d:
        name = _text(d.get("name"))
        if not name:
            raise BadInput("employee name is required")
        e.name = name
    if "email" in d:
        email = (_text(d["email"]) or "").lower() or None
        if email:
            if "@" not in email:
                raise BadInput("invalid email address")
            clash = PmEmployee.query.filter(func.lower(PmEmployee.email) == email, PmEmployee.id != (e.id or 0)).first()
            if clash:
                raise BadInput("another employee already uses this email")
        e.email = email
    for field in ("job_title", "department", "phone"):
        if field in d:
            setattr(e, field, _text(d[field]))
    if "is_active" in d:
        e.is_active = bool(d["is_active"])


@pm_bp.get("/employees")
@permission_required("projects:view")
def list_employees():
    open_by = dict(db.session.query(PmTask.assignee_id, func.count(PmTask.id))
                   .filter(PmTask.status != "done", PmTask.assignee_id.isnot(None))
                   .group_by(PmTask.assignee_id).all())
    projects_by = dict(db.session.query(PmProjectMember.employee_id, func.count(PmProjectMember.id))
                       .group_by(PmProjectMember.employee_id).all())
    rows = PmEmployee.query.order_by(PmEmployee.name).all()
    return jsonify([_employee_dict(e, open_by.get(e.id, 0), projects_by.get(e.id, 0)) for e in rows])


@pm_bp.post("/employees")
@permission_required("employees:manage")
def create_employee():
    e = PmEmployee()
    _apply_employee(e, request.get_json(silent=True) or {}, creating=True)
    db.session.add(e)
    db.session.commit()
    return jsonify(_employee_dict(e)), 201


@pm_bp.put("/employees/<int:employee_id>")
@permission_required("employees:manage")
def update_employee(employee_id):
    e = db.get_or_404(PmEmployee, employee_id)
    _apply_employee(e, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(_employee_dict(e))


@pm_bp.delete("/employees/<int:employee_id>")
@permission_required("employees:manage")
def delete_employee(employee_id):
    e = db.get_or_404(PmEmployee, employee_id)
    if (PmProjectMember.query.filter_by(employee_id=e.id).first()
            or PmTask.query.filter_by(assignee_id=e.id).first()):
        return jsonify(error="this employee is on a project or has tasks; remove them first, or deactivate instead"), 409
    db.session.delete(e)
    db.session.commit()
    return "", 204
