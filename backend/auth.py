import os
from datetime import datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, verify_jwt_in_request
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from db import db

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

# ---------- Permissions & default roles ----------
PERMISSIONS = {
    "dashboard:view": "View the dashboard and KPIs",
    "clients:view": "View clients",
    "clients:manage": "Create, edit and delete clients",
    "projects:view": "View projects and transactions",
    "projects:manage": "Create, edit and delete projects",
    "finance:manage": "Record revenue and expenses",
    "reports:view": "Download reports",
    "users:manage": "Manage users and roles",
    "crm:view": "View opportunities, follow-ups and quotations",
    "crm:manage": "Manage opportunities and follow-ups",
    "quotes:manage": "Create and edit price quotations",
    # ---- NEW (Projects) ----
    "tasks:manage": "Create, assign and update project tasks",
    "employees:manage": "Manage employees",
    # ---- END NEW ----
    # ---- NEW (HR) ----
    "hr:view": "View HR data: employee files, positions, allocations, all timesheets",
    "hr:manage": "Manage employee files (incl. personal data), positions and allocations",
    "hr:salary": "View and edit pay rates and labor cost",
    "timesheets:manage": "Log hours for anyone and approve or reject timesheets",
    # ---- END NEW ----
}

DEFAULT_ROLES = {
    "admin": list(PERMISSIONS),
    "manager": ["dashboard:view", "clients:view", "clients:manage", "projects:view",
                "projects:manage", "reports:view", "crm:view", "crm:manage", "quotes:manage",
                "tasks:manage",
                "hr:view", "timesheets:manage"],  # NEW (Projects): tasks:manage; NEW (HR): hr:view, timesheets:manage
    "accountant": ["dashboard:view", "clients:view", "projects:view",
                   "finance:manage", "reports:view", "crm:view",
                   "hr:view", "hr:salary"],  # NEW (HR): hr:view, hr:salary
    "viewer": ["dashboard:view", "clients:view", "projects:view", "crm:view"],
}


# ---------- Models ----------
class Role(db.Model):
    __tablename__ = "roles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255))
    permissions = db.Column(db.JSON, nullable=False, default=list)
    is_system = db.Column(db.Boolean, default=False)  # protected from edits/deletion
    users = db.relationship("User", backref="role", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description,
                "permissions": self.permissions or [], "is_system": bool(self.is_system)}


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"))
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def permissions(self):
        return list(self.role.permissions or []) if self.role else []

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email,
                "role_id": self.role_id, "role": self.role.name if self.role else None,
                "permissions": self.permissions, "is_active": self.is_active,
                "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None}


# ---------- Access control ----------
def current_user():
    uid = get_jwt_identity()
    user = db.session.get(User, int(uid)) if uid else None
    return user if user and user.is_active else None


def permission_required(*perms):
    """Require a valid JWT and every listed permission.

    The user and role are re-read from the database on each request, so
    role changes and account deactivation take effect immediately.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = current_user()
            if user is None:
                return jsonify(error="account disabled or not found"), 401
            if not all(p in user.permissions for p in perms):
                return jsonify(error="you do not have permission to do this"), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def _error(message, status=400):
    return jsonify(error=message), status


def _keeps_a_manager(target, new_role, new_active):
    """Never leave the system without an active user who can manage users."""
    others = sum(1 for u in User.query.filter(User.is_active.is_(True)).all()
                 if u.id != target.id and "users:manage" in u.permissions)
    still = bool(new_active) and new_role is not None and "users:manage" in (new_role.permissions or [])
    return others > 0 or still


def _clean_permissions(values):
    if not isinstance(values, list) or any(v not in PERMISSIONS for v in values):
        return None
    return sorted(set(values))


# ---------- Authentication ----------
@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user or not user.is_active or not user.check_password(data.get("password") or ""):
        return _error("invalid email or password", 401)
    user.last_login_at = datetime.utcnow()
    db.session.commit()
    token = create_access_token(identity=str(user.id), expires_delta=timedelta(hours=8))
    return jsonify(token=token, user=user.to_dict())


@auth_bp.get("/auth/me")
@permission_required()
def me():
    return jsonify(current_user().to_dict())


@auth_bp.post("/auth/change-password")
@permission_required()
def change_password():
    data = request.get_json(silent=True) or {}
    user = current_user()
    if not user.check_password(data.get("current_password") or ""):
        return _error("current password is incorrect")
    new = data.get("new_password") or ""
    if len(new) < 8:
        return _error("new password must be at least 8 characters")
    user.set_password(new)
    db.session.commit()
    return "", 204


# ---------- Users ----------
@auth_bp.get("/users")
@permission_required("users:manage")
def list_users():
    return jsonify([u.to_dict() for u in User.query.order_by(User.id).all()])


@auth_bp.post("/users")
@permission_required("users:manage")
def create_user():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = db.session.get(Role, data.get("role_id") or 0)
    if not name or "@" not in email:
        return _error("name and a valid email are required")
    if len(password) < 8:
        return _error("password must be at least 8 characters")
    if role is None:
        return _error("a valid role is required")
    user = User(name=name, email=email, role=role)
    user.set_password(password)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("a user with this email already exists", 409)
    return jsonify(user.to_dict()), 201


@auth_bp.put("/users/<int:user_id>")
@permission_required("users:manage")
def update_user(user_id):
    user = db.get_or_404(User, user_id)
    data = request.get_json(silent=True) or {}

    role = user.role
    if "role_id" in data:
        role = db.session.get(Role, data["role_id"] or 0)
        if role is None:
            return _error("invalid role")
    active = data.get("is_active", user.is_active)

    if not _keeps_a_manager(user, role, active):
        return _error("at least one active user must keep user-management access")
    if user.id == current_user().id and not active:
        return _error("you cannot deactivate your own account")

    if data.get("name"):
        user.name = data["name"].strip()
    if data.get("password"):
        if len(data["password"]) < 8:
            return _error("password must be at least 8 characters")
        user.set_password(data["password"])
    user.role = role
    user.is_active = bool(active)
    db.session.commit()
    return jsonify(user.to_dict())


@auth_bp.delete("/users/<int:user_id>")
@permission_required("users:manage")
def delete_user(user_id):
    user = db.get_or_404(User, user_id)
    if user.id == current_user().id:
        return _error("you cannot delete your own account")
    if not _keeps_a_manager(user, None, False):
        return _error("at least one active user must keep user-management access")
    db.session.delete(user)
    db.session.commit()
    return "", 204


# ---------- Roles ----------
@auth_bp.get("/permissions")
@permission_required("users:manage")
def list_permissions():
    return jsonify([{"key": k, "description": v} for k, v in PERMISSIONS.items()])


@auth_bp.get("/roles")
@permission_required("users:manage")
def list_roles():
    return jsonify([r.to_dict() for r in Role.query.order_by(Role.id).all()])


@auth_bp.post("/roles")
@permission_required("users:manage")
def create_role():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip().lower()
    perms = _clean_permissions(data.get("permissions", []))
    if not name:
        return _error("role name is required")
    if perms is None:
        return _error("unknown permission in list")
    role = Role(name=name, description=data.get("description"), permissions=perms)
    db.session.add(role)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("a role with this name already exists", 409)
    return jsonify(role.to_dict()), 201


@auth_bp.put("/roles/<int:role_id>")
@permission_required("users:manage")
def update_role(role_id):
    role = db.get_or_404(Role, role_id)
    if role.is_system:
        return _error("system roles cannot be modified", 403)
    data = request.get_json(silent=True) or {}
    if "permissions" in data:
        perms = _clean_permissions(data["permissions"])
        if perms is None:
            return _error("unknown permission in list")
        role.permissions = perms
        # Editing a role must not strip the last user manager of access
        if "users:manage" not in perms and not _keeps_a_manager(User(id=-1), role, False):
            return _error("at least one active user must keep user-management access")
    if "description" in data:
        role.description = data["description"]
    db.session.commit()
    return jsonify(role.to_dict())


@auth_bp.delete("/roles/<int:role_id>")
@permission_required("users:manage")
def delete_role(role_id):
    role = db.get_or_404(Role, role_id)
    if role.is_system:
        return _error("system roles cannot be deleted", 403)
    if role.users:
        return _error("reassign this role's users before deleting it", 409)
    db.session.delete(role)
    db.session.commit()
    return "", 204


# ---------- First-run seeding ----------
def seed_auth():
    if Role.query.count() == 0:
        for name, perms in DEFAULT_ROLES.items():
            db.session.add(Role(name=name, permissions=perms, is_system=(name == "admin"),
                                description=f"Default {name} role"))
        db.session.commit()

    # NEW: the admin role always holds every permission, including ones added later (e.g. crm:*)
    admin_role = Role.query.filter_by(name="admin").first()
    if admin_role and set(admin_role.permissions or []) != set(PERMISSIONS):
        admin_role.permissions = list(PERMISSIONS)
        db.session.commit()

    if User.query.count() == 0:
        email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
        password = os.environ.get("ADMIN_PASSWORD")
        if not password:
            password = "ChangeMe123!"
            print("WARNING: ADMIN_PASSWORD not set; created admin with a default password. Change it now.")
        admin = User(name="Administrator", email=email,
                     role=Role.query.filter_by(name="admin").first())
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print(f"Created initial admin user: {email}")
