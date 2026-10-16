import csv
import io
from datetime import date
from flask import jsonify, request
from sqlalchemy import func, extract

from db import db
from models import Client, Project, Transaction, Task
from auth import permission_required

def register_routes(app):
    # ---------- Generic CRUD helper ----------
    def register_crud(model, path, read_perm, write_perm, parse=None):
        def list_items():
            return jsonify([o.to_dict() for o in model.query.order_by(model.id.desc()).all()])

        def create_item():
            data = request.get_json()
            obj = model(**(parse(data) if parse else data))
            db.session.add(obj)
            db.session.commit()
            return jsonify(obj.to_dict()), 201

        def update_item(item_id):
            obj = model.query.get_or_404(item_id)
            data = parse(request.get_json()) if parse else request.get_json()
            for k, v in data.items():
                setattr(obj, k, v)
            db.session.commit()
            return jsonify(obj.to_dict())

        def delete_item(item_id):
            obj = model.query.get_or_404(item_id)
            db.session.delete(obj)
            db.session.commit()
            return "", 204

        n = model.__name__.lower()
        read, write = permission_required(read_perm), permission_required(write_perm)
        app.add_url_rule(f"/api/{path}", f"list_{n}", read(list_items), methods=["GET"])
        app.add_url_rule(f"/api/{path}", f"create_{n}", write(create_item), methods=["POST"])
        app.add_url_rule(f"/api/{path}/<int:item_id>", f"update_{n}", write(update_item), methods=["PUT"])
        app.add_url_rule(f"/api/{path}/<int:item_id>", f"delete_{n}", write(delete_item), methods=["DELETE"])

    def _dates(d):
        for k in ("start_date", "end_date", "date"):
            if d.get(k):
                d[k] = date.fromisoformat(d[k])
        return d

    register_crud(Client, "clients", "clients:view", "clients:manage")
    register_crud(Project, "projects", "projects:view", "projects:manage", parse=_dates)
    register_crud(Transaction, "transactions", "projects:view", "finance:manage", parse=_dates)

    # ---------- Dashboard ----------
    @app.get("/api/dashboard")
    @permission_required("dashboard:view")
    def dashboard():
        year = request.args.get("year", date.today().year, type=int)

        def total(t):
            return float(db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
                         .filter(Transaction.type == t, extract("year", Transaction.date) == year).scalar())

        revenue, expenses = total("revenue"), total("expense")

        monthly = {m: {"month": m, "revenue": 0.0, "expenses": 0.0} for m in range(1, 13)}
        rows = (db.session.query(extract("month", Transaction.date), Transaction.type,
                                 func.sum(Transaction.amount))
                .filter(extract("year", Transaction.date) == year)
                .group_by(extract("month", Transaction.date), Transaction.type).all())
        for m, t, amt in rows:
            monthly[int(m)]["revenue" if t == "revenue" else "expenses"] = float(amt)

        by_category = (db.session.query(Transaction.category, func.sum(Transaction.amount))
                       .filter(Transaction.type == "expense", extract("year", Transaction.date) == year)
                       .group_by(Transaction.category).all())

        projects = [p.to_dict() for p in Project.query.all()]
        active = [p for p in projects if p["status"] == "active"]

        est_future_revenue = sum(max(p["budget"] - p["revenue"], 0) for p in active)
        est_future_cost = sum(
            (p["expenses"] / p["revenue"] if p["revenue"] else 0.6) * max(p["budget"] - p["revenue"], 0)
            for p in active)
        estimated_profit = (revenue - expenses) + (est_future_revenue - est_future_cost)

        return jsonify({
            "year": year,
            "kpis": {
                "revenue": revenue,
                "expenses": expenses,
                "net_profit": revenue - expenses,
                "profit_margin": round((revenue - expenses) / revenue * 100, 1) if revenue else 0,
                "estimated_profit": round(estimated_profit, 2),
                "active_projects": len(active),
                "total_projects": len(projects),
                "total_clients": Client.query.count(),
            },
            "monthly": list(monthly.values()),
            "expense_by_category": [{"category": c or "Other", "amount": float(a)} for c, a in by_category],
            "top_projects": sorted(projects, key=lambda p: p["profit"], reverse=True)[:5],
        })

    @app.get("/api/reports/projects.csv")
    @permission_required("reports:view")
    def report_projects_csv():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Project", "Client", "Status", "Budget", "Revenue", "Expenses", "Profit"])
        for p in Project.query.all():
            d = p.to_dict()
            w.writerow([d["name"], d["client_name"], d["status"], d["budget"],
                        d["revenue"], d["expenses"], d["profit"]])
        return buf.getvalue(), 200, {"Content-Type": "text/csv",
                                     "Content-Disposition": "attachment; filename=projects_report.csv"}
    
    @app.get("/api/projects/<int:project_id>/tasks")
    @permission_required("projects:view")
    def list_project_tasks(project_id):
        Project.query.get_or_404(project_id)
        tasks = Task.query.filter_by(project_id=project_id).all()
        return jsonify([t.to_dict() for t in tasks])

    @app.post("/api/projects/<int:project_id>/tasks")
    @permission_required("projects:manage")
    def create_project_task(project_id):
        Project.query.get_or_404(project_id)
        data = request.get_json() or {}
        task = Task(
            project_id=project_id,
            title=data.get("title"),
            description=data.get("description"),
            status=data.get("status", "todo"),
            assigned_to=data.get("assigned_to") or None,
            due_date=date.fromisoformat(data["due_date"]) if data.get("due_date") else None
        )
        db.session.add(task)
        db.session.commit()
        return jsonify(task.to_dict()), 201

    @app.put("/api/tasks/<int:task_id>")
    @permission_required("projects:manage")
    def update_task(task_id):
        task = Task.query.get_or_404(task_id)
        data = request.get_json() or {}
        if "title" in data: task.title = data["title"]
        if "description" in data: task.description = data["description"]
        if "status" in data: task.status = data["status"]
        if "assigned_to" in data: task.assigned_to = data["assigned_to"] or None
        if "due_date" in data:
            task.due_date = date.fromisoformat(data["due_date"]) if data["due_date"] else None
        db.session.commit()
        return jsonify(task.to_dict())

    @app.delete("/api/tasks/<int:task_id>")
    @permission_required("projects:manage")
    def delete_task(task_id):
        task = Task.query.get_or_404(task_id)
        db.session.delete(task)
        db.session.commit()
        return "", 204
        