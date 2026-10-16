from datetime import date, datetime
from decimal import Decimal
from db import db

class Client(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(40))
    company = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    projects = db.relationship("Project", backref="client", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email,
                "phone": self.phone, "company": self.company}


class Project(db.Model):
    __tablename__ = "project"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    status = db.Column(db.String(30), default="active")  # active | completed | on_hold
    budget = db.Column(db.Numeric(12, 2), default=0)
    start_date = db.Column(db.Date, default=date.today)
    end_date = db.Column(db.Date)
    
    # Relationships
    tasks = db.relationship("Task", backref="project", cascade="all, delete-orphan", lazy=True)
    transactions = db.relationship("Transaction", backref="project", lazy=True)

    def to_dict(self):
        rev = sum((t.amount for t in self.transactions if t.type == "revenue"), Decimal(0))
        exp = sum((t.amount for t in self.transactions if t.type == "expense"), Decimal(0))
        total_tasks = len(self.tasks)
        completed_tasks = sum(1 for t in self.tasks if t.status == "completed")
        completion_rate = round((completed_tasks / total_tasks) * 100, 1) if total_tasks > 0 else 0.0

        return {
            "id": self.id, 
            "name": self.name, 
            "description": self.description,
            "client_id": self.client_id,
            "client_name": self.client.name if self.client else None,
            "status": self.status, 
            "budget": float(self.budget or 0),
            "start_date": str(self.start_date) if self.start_date else None,
            "end_date": str(self.end_date) if self.end_date else None,
            "revenue": float(rev), 
            "expenses": float(exp), 
            "profit": float(rev - exp),
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": completion_rate
        }


class Task(db.Model):
    __tablename__ = "tasks"
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(30), default="todo")  # todo | in_progress | completed
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"))
    due_date = db.Column(db.Date)
    
    assignee = db.relationship("User", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "assignee_name": self.assignee.name if self.assignee else None,
            "due_date": str(self.due_date) if self.due_date else None
        }


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"))
    type = db.Column(db.String(10), nullable=False)  # revenue | expense
    category = db.Column(db.String(60))
    description = db.Column(db.String(255))
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    date = db.Column(db.Date, default=date.today)

    def to_dict(self):
        return {"id": self.id, "project_id": self.project_id, "type": self.type,
                "category": self.category, "description": self.description,
                "amount": float(self.amount), "date": str(self.date)}