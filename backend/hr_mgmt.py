# NEW FILE (HR module)
from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_

from auth import current_user, permission_required
from db import db
from models import Project
from project_mgmt import (
    BadInput, PmEmployee, PmProjectMember, PmTask,
    _apply_employee, _choice, _date, _int, _my_employee, _num, _text,
)

hr_bp = Blueprint("hr", __name__, url_prefix="/api/hr")

EMPLOYMENT_TYPES = {"full_time", "part_time", "contract", "intern"}
EMPLOYMENT_STATUSES = {"active", "on_leave", "terminated"}
TIMESHEET_STATUSES = {"pending", "approved", "rejected"}


@hr_bp.errorhandler(BadInput)
def _bad_input(e):
    return jsonify(error=str(e)), 400


def _can(permission):
    user = current_user()
    return bool(user and permission in user.permissions)


def _iso(d):
    return d.isoformat() if d else None


# ---------- Models (new tables; the existing ones are not altered) ----------
class HrPosition(db.Model):
    """A job role / title that employees can hold."""
    __tablename__ = "hr_positions"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False, unique=True)
    department = db.Column(db.String(100))
    level = db.Column(db.String(40))
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)


class HrProfile(db.Model):
    """Employment data for one employee (1:1 with pm_employees)."""
    __tablename__ = "hr_profiles"
    employee_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"), primary_key=True)
    position_id = db.Column(db.Integer, db.ForeignKey("hr_positions.id"))
    reports_to_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"))
    employee_number = db.Column(db.String(30), unique=True)
    hire_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    employment_type = db.Column(db.String(20), nullable=False, default="full_time")
    employment_status = db.Column(db.String(20), nullable=False, default="active")
    date_of_birth = db.Column(db.Date)
    national_id = db.Column(db.String(50))
    address = db.Column(db.String(255))
    emergency_contact_name = db.Column(db.String(120))
    emergency_contact_phone = db.Column(db.String(40))
    hourly_cost = db.Column(db.Numeric(10, 2))  # internal cost rate, needs hr:salary
    notes = db.Column(db.Text)


class HrAllocation(db.Model):
    """Assigns an employee to a project for a period, as a percentage of their time."""
    __tablename__ = "hr_allocations"
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False, index=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"), nullable=False, index=True)
    percent = db.Column(db.Integer, nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)
    notes = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now)
    project = db.relationship("Project")
    employee = db.relationship("PmEmployee")


class HrTimesheet(db.Model):
    """Hours worked by an employee on a project (optionally on one task)."""
    __tablename__ = "hr_timesheets"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("pm_employees.id"), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False, index=True)
    task_id = db.Column(db.Integer, db.ForeignKey("pm_tasks.id"))
    work_date = db.Column(db.Date, nullable=False, index=True)
    hours = db.Column(db.Numeric(5, 2), nullable=False)
    description = db.Column(db.String(255))
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    reviewed_at = db.Column(db.DateTime)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.now)
    employee = db.relationship("PmEmployee")
    project = db.relationship("Project")
    task = db.relationship("PmTask")

    def to_dict(self):
        return {"id": self.id, "employee_id": self.employee_id,
                "employee_name": self.employee.name if self.employee else None,
                "project_id": self.project_id,
                "project_name": self.project.name if self.project else None,
                "task_id": self.task_id, "task_title": self.task.title if self.task else None,
                "work_date": _iso(self.work_date), "hours": float(self.hours),
                "description": self.description, "status": self.status,
                "reviewed_at": _iso(self.reviewed_at)}


# ---------- Date and aggregate helpers ----------
def _month_range():
    today = date.today()
    return today.replace(day=1), today.replace(day=monthrange(today.year, today.month)[1])


def _range():
    start, end = _date(request.args.get("from")), _date(request.args.get("to"))
    default_start, default_end = _month_range()
    start, end = start or default_start, end or default_end
    if end < start:
        raise BadInput("'to' cannot be before 'from'")
    return start, end


def _allocated_today():
    today = date.today()
    rows = (db.session.query(HrAllocation.employee_id, func.coalesce(func.sum(HrAllocation.percent), 0))
            .filter(HrAllocation.start_date <= today,
                    or_(HrAllocation.end_date.is_(None), HrAllocation.end_date >= today))
            .group_by(HrAllocation.employee_id).all())
    return {eid: int(total) for eid, total in rows}


def _hours_by_employee(start, end):
    rows = (db.session.query(HrTimesheet.employee_id, func.coalesce(func.sum(HrTimesheet.hours), 0))
            .filter(HrTimesheet.work_date >= start, HrTimesheet.work_date <= end,
                    HrTimesheet.status != "rejected")
            .group_by(HrTimesheet.employee_id).all())
    return {eid: float(total) for eid, total in rows}


# ---------- Employee files ----------
def _hr_dict(e, prof, positions, names, allocated=0, detail=False):
    d = {"id": e.id, "name": e.name, "email": e.email, "phone": e.phone,
         "department": e.department, "is_active": e.is_active,
         "position_id": prof.position_id if prof else None,
         "job_title": positions.get(prof.position_id) if prof and prof.position_id else e.job_title,
         "employee_number": prof.employee_number if prof else None,
         "hire_date": _iso(prof.hire_date) if prof else None,
         "end_date": _iso(prof.end_date) if prof else None,
         "employment_type": prof.employment_type if prof else "full_time",
         "employment_status": prof.employment_status if prof else ("active" if e.is_active else "terminated"),
         "reports_to_id": prof.reports_to_id if prof else None,
         "reports_to_name": names.get(prof.reports_to_id) if prof and prof.reports_to_id else None,
         "allocated_percent": allocated, "overallocated": allocated > 100}
    # Personal details only go to people who can manage HR files; pay data only with hr:salary
    if detail and _can("hr:manage"):
        d.update({"date_of_birth": _iso(prof.date_of_birth) if prof else None,
                  "national_id": prof.national_id if prof else None,
                  "address": prof.address if prof else None,
                  "emergency_contact_name": prof.emergency_contact_name if prof else None,
                  "emergency_contact_phone": prof.emergency_contact_phone if prof else None,
                  "notes": prof.notes if prof else None})
    if detail and _can("hr:salary"):
        d["hourly_cost"] = float(prof.hourly_cost) if prof and prof.hourly_cost is not None else None
    return d


def _one(e, detail=False):
    prof = db.session.get(HrProfile, e.id)
    positions = {p.id: p.title for p in HrPosition.query.all()}
    names = {x.id: x.name for x in PmEmployee.query.all()}
    return _hr_dict(e, prof, positions, names, _allocated_today().get(e.id, 0), detail)


def _apply_profile(prof, d, e):
    if "position_id" in d:
        if d["position_id"]:
            pos = db.session.get(HrPosition, _int(d["position_id"], "position"))
            if pos is None or not pos.is_active:
                raise BadInput("choose an active job position")
            prof.position_id = pos.id
        else:
            prof.position_id = None
    if "reports_to_id" in d:
        if d["reports_to_id"]:
            rid = _int(d["reports_to_id"], "line manager")
            if rid == e.id:
                raise BadInput("an employee cannot report to themselves")
            if db.session.get(PmEmployee, rid) is None:
                raise BadInput("line manager not found")
            prof.reports_to_id = rid
        else:
            prof.reports_to_id = None
    if "employee_number" in d:
        number = _text(d["employee_number"])
        if number:
            clash = HrProfile.query.filter(HrProfile.employee_number == number,
                                           HrProfile.employee_id != e.id).first()
            if clash:
                raise BadInput("this employee number is already used")
        prof.employee_number = number
    if "hire_date" in d:
        prof.hire_date = _date(d["hire_date"])
    if "end_date" in d:
        prof.end_date = _date(d["end_date"])
    if "date_of_birth" in d:
        prof.date_of_birth = _date(d["date_of_birth"])
    if "employment_type" in d:
        prof.employment_type = _choice(d["employment_type"], EMPLOYMENT_TYPES, "employment type")
    if "employment_status" in d:
        prof.employment_status = _choice(d["employment_status"], EMPLOYMENT_STATUSES, "employment status")
    for field in ("national_id", "address", "emergency_contact_name", "emergency_contact_phone", "notes"):
        if field in d:
            setattr(prof, field, _text(d[field]))
    if "hourly_cost" in d and _can("hr:salary"):
        prof.hourly_cost = _num(d["hourly_cost"], "hourly cost") if d["hourly_cost"] not in (None, "") else None

    if "employment_status" in d:
        if prof.employment_status == "terminated":
            e.is_active = False
            prof.end_date = prof.end_date or date.today()
            # A leaver's allocations stop on their last day
            for a in HrAllocation.query.filter_by(employee_id=e.id).all():
                if a.end_date is None or a.end_date > prof.end_date:
                    a.end_date = max(prof.end_date, a.start_date)
        else:
            e.is_active = True
    if prof.hire_date and prof.end_date and prof.end_date < prof.hire_date:
        raise BadInput("the end date cannot be before the hire date")

    # Keep the plain job title used by the Projects module in step with the position
    if prof.position_id:
        e.job_title = db.session.get(HrPosition, prof.position_id).title


def _save_employee(e, d, creating):
    _apply_employee(e, d, creating=creating)
    if creating:
        db.session.add(e)
        db.session.flush()
    prof = db.session.get(HrProfile, e.id)
    if prof is None:
        prof = HrProfile(employee_id=e.id, employment_type="full_time",
                         employment_status="active" if e.is_active else "terminated")
        db.session.add(prof)
    _apply_profile(prof, d, e)


@hr_bp.get("/employees")
@permission_required("hr:view")
def list_employees():
    start, end = _month_range()
    employees = PmEmployee.query.order_by(PmEmployee.name).all()
    profiles = {p.employee_id: p for p in HrProfile.query.all()}
    positions = {p.id: p.title for p in HrPosition.query.all()}
    names = {e.id: e.name for e in employees}
    allocated, hours = _allocated_today(), _hours_by_employee(start, end)
    rows = []
    for e in employees:
        row = _hr_dict(e, profiles.get(e.id), positions, names, allocated.get(e.id, 0))
        row["hours_month"] = hours.get(e.id, 0.0)
        rows.append(row)
    return jsonify(rows)


@hr_bp.get("/employees/<int:employee_id>")
@permission_required("hr:view")
def get_employee(employee_id):
    return jsonify(_one(db.get_or_404(PmEmployee, employee_id), detail=True))


@hr_bp.post("/employees")
@permission_required("hr:manage")
def create_employee():
    e = PmEmployee()
    _save_employee(e, request.get_json(silent=True) or {}, creating=True)
    db.session.commit()
    return jsonify(_one(e, detail=True)), 201


@hr_bp.put("/employees/<int:employee_id>")
@permission_required("hr:manage")
def update_employee(employee_id):
    e = db.get_or_404(PmEmployee, employee_id)
    _save_employee(e, request.get_json(silent=True) or {}, creating=False)
    db.session.commit()
    return jsonify(_one(e, detail=True))


@hr_bp.get("/me")
@permission_required("projects:view")
def me():
    e = _my_employee()
    return jsonify({"employee": {"id": e.id, "name": e.name} if e else None})


@hr_bp.get("/employees/<int:employee_id>/projects")
@permission_required("projects:view")
def employee_projects(employee_id):
    mine = _my_employee()
    if not (_can("hr:view") or _can("timesheets:manage") or (mine and mine.id == employee_id)):
        return jsonify(error="you do not have permission to do this"), 403
    rows = (db.session.query(Project.id, Project.name)
            .join(PmProjectMember, PmProjectMember.project_id == Project.id)
            .filter(PmProjectMember.employee_id == employee_id, Project.status != "completed")
            .order_by(Project.name).all())
    return jsonify([{"id": pid, "name": name} for pid, name in rows])


# ---------- Job positions ----------
def _position_dict(p, count):
    return {"id": p.id, "title": p.title, "department": p.department, "level": p.level,
            "description": p.description, "is_active": p.is_active, "employee_count": count}


def _apply_position(p, d, creating=False):
    if creating or "title" in d:
        title = _text(d.get("title"))
        if not title:
            raise BadInput("job title is required")
        clash = HrPosition.query.filter(func.lower(HrPosition.title) == title.lower(),
                                        HrPosition.id != (p.id or 0)).first()
        if clash:
            raise BadInput("a position with this title already exists")
        p.title = title
    for field in ("department", "level", "description"):
        if field in d:
            setattr(p, field, _text(d[field]))
    if "is_active" in d:
        p.is_active = bool(d["is_active"])


@hr_bp.get("/positions")
@permission_required("hr:view")
def list_positions():
    counts = dict(db.session.query(HrProfile.position_id, func.count(HrProfile.employee_id))
                  .filter(HrProfile.position_id.isnot(None)).group_by(HrProfile.position_id).all())
    return jsonify([_position_dict(p, counts.get(p.id, 0))
                    for p in HrPosition.query.order_by(HrPosition.title).all()])


@hr_bp.post("/positions")
@permission_required("hr:manage")
def create_position():
    p = HrPosition()
    _apply_position(p, request.get_json(silent=True) or {}, creating=True)
    db.session.add(p)
    db.session.commit()
    return jsonify(_position_dict(p, 0)), 201


@hr_bp.put("/positions/<int:position_id>")
@permission_required("hr:manage")
def update_position(position_id):
    p = db.get_or_404(HrPosition, position_id)
    _apply_position(p, request.get_json(silent=True) or {})
    # A renamed position renames the job title of everyone who holds it
    holders = [x.employee_id for x in HrProfile.query.filter_by(position_id=p.id).all()]
    if holders:
        PmEmployee.query.filter(PmEmployee.id.in_(holders)).update({"job_title": p.title}, synchronize_session=False)
    db.session.commit()
    return jsonify(_position_dict(p, len(holders)))


@hr_bp.delete("/positions/<int:position_id>")
@permission_required("hr:manage")
def delete_position(position_id):
    p = db.get_or_404(HrPosition, position_id)
    if HrProfile.query.filter_by(position_id=p.id).first():
        return jsonify(error="employees hold this position; reassign them first, or mark the position inactive"), 409
    db.session.delete(p)
    db.session.commit()
    return "", 204


# ---------- Allocation of employees to projects ----------
def _allocation_dict(a):
    today = date.today()
    return {"id": a.id, "project_id": a.project_id,
            "project_name": a.project.name if a.project else None,
            "employee_id": a.employee_id,
            "employee_name": a.employee.name if a.employee else None,
            "percent": a.percent, "start_date": _iso(a.start_date), "end_date": _iso(a.end_date),
            "notes": a.notes,
            "active": a.start_date <= today and (a.end_date is None or a.end_date >= today)}


def _overlap_total(employee_id, start, end, exclude_id=None):
    """Sum of this employee's other allocations that overlap the period (a conservative check)."""
    q = HrAllocation.query.filter(HrAllocation.employee_id == employee_id)
    if exclude_id:
        q = q.filter(HrAllocation.id != exclude_id)
    return sum(o.percent for o in q.all()
               if o.start_date <= (end or date.max) and (o.end_date or date.max) >= start)


def _apply_allocation(a, d, creating=False):
    if creating:
        project = db.session.get(Project, _int(d.get("project_id"), "project"))
        emp = db.session.get(PmEmployee, _int(d.get("employee_id"), "employee"))
        if project is None:
            raise BadInput("project not found")
        if emp is None or not emp.is_active:
            raise BadInput("choose an active employee")
        a.project_id, a.employee_id = project.id, emp.id
    if creating or "percent" in d:
        percent = _int(d.get("percent"), "allocation percent")
        if not 1 <= percent <= 100:
            raise BadInput("allocation must be between 1 and 100 percent")
        a.percent = percent
    if creating or "start_date" in d:
        a.start_date = _date(d.get("start_date")) or date.today()
    if "end_date" in d:
        a.end_date = _date(d["end_date"])
    if a.end_date and a.end_date < a.start_date:
        raise BadInput("the end date cannot be before the start date")
    if "notes" in d:
        a.notes = _text(d["notes"])
    total = _overlap_total(a.employee_id, a.start_date, a.end_date, a.id) + a.percent
    return f"This employee is now allocated {total}% in this period." if total > 100 else None


@hr_bp.get("/allocations")
@permission_required("hr:view")
def list_allocations():
    q = HrAllocation.query
    if request.args.get("project_id", type=int):
        q = q.filter_by(project_id=request.args.get("project_id", type=int))
    if request.args.get("employee_id", type=int):
        q = q.filter_by(employee_id=request.args.get("employee_id", type=int))
    rows = [_allocation_dict(a) for a in q.order_by(HrAllocation.start_date.desc(), HrAllocation.id.desc()).all()]
    if request.args.get("active") == "1":
        rows = [r for r in rows if r["active"]]
    return jsonify(rows)


@hr_bp.post("/allocations")
@permission_required("hr:manage")
def create_allocation():
    a = HrAllocation()
    warning = _apply_allocation(a, request.get_json(silent=True) or {}, creating=True)
    db.session.add(a)
    # Being allocated puts the employee on the project team, so tasks and hours can be assigned to them
    if not PmProjectMember.query.filter_by(project_id=a.project_id, employee_id=a.employee_id).first():
        db.session.add(PmProjectMember(project_id=a.project_id, employee_id=a.employee_id, role="member"))
    db.session.commit()
    result = _allocation_dict(a)
    if warning:
        result["warning"] = warning
    return jsonify(result), 201


@hr_bp.put("/allocations/<int:allocation_id>")
@permission_required("hr:manage")
def update_allocation(allocation_id):
    a = db.get_or_404(HrAllocation, allocation_id)
    warning = _apply_allocation(a, request.get_json(silent=True) or {})
    db.session.commit()
    result = _allocation_dict(a)
    if warning:
        result["warning"] = warning
    return jsonify(result)


@hr_bp.delete("/allocations/<int:allocation_id>")
@permission_required("hr:manage")
def delete_allocation(allocation_id):
    # The employee stays on the project team; remove them there if they should lose access to its tasks
    db.session.delete(db.get_or_404(HrAllocation, allocation_id))
    db.session.commit()
    return "", 204


# ---------- Timesheets (hours linked to projects) ----------
def _timesheet_access(t):
    """None when the caller may change this entry, otherwise an error response."""
    if _can("timesheets:manage"):
        return None
    mine = _my_employee()
    if not (mine and t.employee_id == mine.id):
        return jsonify(error="you can only change your own hours"), 403
    if t.status != "pending":
        return jsonify(error="only pending entries can be changed; ask a manager"), 409
    return None


@hr_bp.get("/timesheets")
@permission_required("projects:view")
def list_timesheets():
    start, end = _range()
    q = HrTimesheet.query.filter(HrTimesheet.work_date >= start, HrTimesheet.work_date <= end)
    sees_all = _can("hr:view") or _can("timesheets:manage")
    if request.args.get("mine") == "1" or not sees_all:
        mine = _my_employee()
        if mine is None:
            return jsonify([])
        q = q.filter_by(employee_id=mine.id)
    elif request.args.get("employee_id", type=int):
        q = q.filter_by(employee_id=request.args.get("employee_id", type=int))
    if request.args.get("project_id", type=int):
        q = q.filter_by(project_id=request.args.get("project_id", type=int))
    if request.args.get("status") in TIMESHEET_STATUSES:
        q = q.filter_by(status=request.args["status"])
    q = q.order_by(HrTimesheet.work_date.desc(), HrTimesheet.id.desc())
    return jsonify([t.to_dict() for t in q.all()])


@hr_bp.post("/timesheets")
@permission_required("projects:view")
def create_timesheet():
    d = request.get_json(silent=True) or {}
    mine = _my_employee()
    manage = _can("timesheets:manage")

    employee_id = _int(d["employee_id"], "employee") if d.get("employee_id") else (mine.id if mine else None)
    if employee_id is None:
        raise BadInput("no employee file matches your login email; ask HR to add your email to your file")
    if not manage and not (mine and employee_id == mine.id):
        return jsonify(error="you can only log your own hours"), 403
    emp = db.session.get(PmEmployee, employee_id)
    if emp is None or not emp.is_active:
        raise BadInput("choose an active employee")

    project = db.session.get(Project, _int(d.get("project_id"), "project"))
    if project is None:
        raise BadInput("project not found")
    if not PmProjectMember.query.filter_by(project_id=project.id, employee_id=emp.id).first():
        raise BadInput("the employee must be allocated to this project first (see Allocation)")

    task_id = None
    if d.get("task_id"):
        task = db.session.get(PmTask, _int(d["task_id"], "task"))
        if task is None or task.project_id != project.id:
            raise BadInput("the task does not belong to this project")
        task_id = task.id

    work_date = _date(d.get("work_date")) or date.today()
    if work_date > date.today():
        raise BadInput("you cannot log hours for a future date")
    hours = _num(d.get("hours"), "hours").quantize(Decimal("0.01"))
    if hours <= 0 or hours > 24:
        raise BadInput("hours must be greater than 0 and at most 24")
    logged = (db.session.query(func.coalesce(func.sum(HrTimesheet.hours), 0))
              .filter(HrTimesheet.employee_id == emp.id, HrTimesheet.work_date == work_date,
                      HrTimesheet.status != "rejected").scalar())
    if Decimal(str(logged)) + hours > 24:
        raise BadInput("that would exceed 24 hours logged for this day")

    t = HrTimesheet(employee_id=emp.id, project_id=project.id, task_id=task_id, work_date=work_date,
                    hours=hours, description=_text(d.get("description")), status="pending",
                    created_by=current_user().id)
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@hr_bp.put("/timesheets/<int:timesheet_id>/review")
@permission_required("timesheets:manage")
def review_timesheet(timesheet_id):
    t = db.get_or_404(HrTimesheet, timesheet_id)
    t.status = _choice((request.get_json(silent=True) or {}).get("status"), TIMESHEET_STATUSES, "status")
    t.reviewed_by = current_user().id if t.status != "pending" else None
    t.reviewed_at = datetime.now() if t.status != "pending" else None
    db.session.commit()
    return jsonify(t.to_dict())


@hr_bp.delete("/timesheets/<int:timesheet_id>")
@permission_required("projects:view")
def delete_timesheet(timesheet_id):
    t = db.get_or_404(HrTimesheet, timesheet_id)
    denied = _timesheet_access(t)
    if denied:
        return denied
    db.session.delete(t)
    db.session.commit()
    return "", 204


@hr_bp.get("/timesheets/summary")
@permission_required("hr:view")
def timesheet_summary():
    start, end = _range()
    rows = (db.session.query(HrTimesheet.project_id, HrTimesheet.employee_id, HrTimesheet.status,
                             func.sum(HrTimesheet.hours))
            .filter(HrTimesheet.work_date >= start, HrTimesheet.work_date <= end,
                    HrTimesheet.status != "rejected")
            .group_by(HrTimesheet.project_id, HrTimesheet.employee_id, HrTimesheet.status).all())

    show_cost = _can("hr:salary")
    costs = ({p.employee_id: float(p.hourly_cost)
              for p in HrProfile.query.filter(HrProfile.hourly_cost.isnot(None)).all()} if show_cost else {})
    project_names = {p.id: p.name for p in Project.query.all()}
    employee_names = {e.id: e.name for e in PmEmployee.query.all()}

    by_project, by_employee = {}, {}
    for pid, eid, status, total in rows:
        hours = float(total)
        proj = by_project.setdefault(pid, {"project_id": pid, "project_name": project_names.get(pid),
                                           "hours": 0.0, "approved_hours": 0.0,
                                           "cost": 0.0 if show_cost else None})
        proj["hours"] += hours
        if status == "approved":
            proj["approved_hours"] += hours
        if show_cost:
            proj["cost"] += hours * costs.get(eid, 0.0)
        emp = by_employee.setdefault(eid, {"employee_id": eid, "employee_name": employee_names.get(eid),
                                           "hours": 0.0})
        emp["hours"] += hours

    def rounded(items):
        for item in items:
            for key in ("hours", "approved_hours", "cost"):
                if item.get(key) is not None:
                    item[key] = round(item[key], 2)
        return sorted(items, key=lambda x: -x["hours"])

    return jsonify({"from": start.isoformat(), "to": end.isoformat(),
                    "total_hours": round(sum(p["hours"] for p in by_project.values()), 2),
                    "by_project": rounded(list(by_project.values())),
                    "by_employee": rounded(list(by_employee.values()))})


# ---------- Overview ----------
@hr_bp.get("/overview")
@permission_required("hr:view")
def overview():
    start, end = _month_range()
    profiles = {p.employee_id: p for p in HrProfile.query.all()}
    employees = PmEmployee.query.all()

    def status_of(e):
        p = profiles.get(e.id)
        return p.employment_status if p else ("active" if e.is_active else "terminated")

    by_type = {t: 0 for t in EMPLOYMENT_TYPES}
    for e in employees:
        if status_of(e) != "terminated":
            p = profiles.get(e.id)
            by_type[p.employment_type if p else "full_time"] += 1

    return jsonify({
        "headcount": sum(1 for e in employees if status_of(e) != "terminated"),
        "on_leave": sum(1 for e in employees if status_of(e) == "on_leave"),
        "terminated": sum(1 for e in employees if status_of(e) == "terminated"),
        "positions": HrPosition.query.filter_by(is_active=True).count(),
        "overallocated": sum(1 for pct in _allocated_today().values() if pct > 100),
        "pending_timesheets": HrTimesheet.query.filter_by(status="pending").count(),
        "hours_month": round(sum(_hours_by_employee(start, end).values()), 2),
        "by_type": by_type,
    })
