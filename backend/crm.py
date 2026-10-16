from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from auth import current_user, permission_required
from db import db  

crm_bp = Blueprint("crm", __name__, url_prefix="/api/crm")

# Stage -> default win probability (%)
STAGES = {"lead": 10, "qualified": 30, "proposal": 50, "negotiation": 70, "won": 100, "lost": 0}
OPEN_STAGES = ["lead", "qualified", "proposal", "negotiation"]
FOLLOWUP_TYPES = {"call", "email", "meeting", "visit", "other"}
FOLLOWUP_STATUSES = {"pending", "done", "cancelled"}
QUOTE_STATUSES = {"draft", "sent", "accepted", "rejected", "expired"}


# ---------- Validation helpers ----------
class BadInput(Exception):
    pass


@crm_bp.errorhandler(BadInput)
def _bad_input(e):
    return jsonify(error=str(e)), 400


def _int(v, field):
    try:
        return int(v)
    except (TypeError, ValueError):
        raise BadInput(f"{field} must be an integer") from None


def _num(v, field, maximum=None):
    try:
        n = Decimal(str(0 if v in (None, "") else v))
    except InvalidOperation:
        raise BadInput(f"{field} must be a number") from None
    if not n.is_finite() or n < 0:
        raise BadInput(f"{field} must be zero or more")
    if maximum is not None and n > maximum:
        raise BadInput(f"{field} must be at most {maximum}")
    return n


def _date(v):
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise BadInput("invalid date, expected YYYY-MM-DD") from None


def _datetime(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v))
    except ValueError:
        raise BadInput("invalid date/time") from None


def _text(v):
    return (v or "").strip() or None


def _require_client(client_id):
    # Client lives in app.py, so check the table directly to avoid a circular import
    row = db.session.execute(db.text("SELECT 1 FROM client WHERE id = :i"), {"i": client_id}).first()
    if client_id is None or row is None:
        raise BadInput("a valid client is required")


def _q(x):
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------- Models ----------
class Opportunity(db.Model):
    __tablename__ = "opportunities"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    stage = db.Column(db.String(20), nullable=False, default="lead", index=True)
    value = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    probability = db.Column(db.Integer, nullable=False, default=10)
    expected_close_date = db.Column(db.Date)
    source = db.Column(db.String(60))
    notes = db.Column(db.Text)
    lost_reason = db.Column(db.String(255))
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    closed_at = db.Column(db.DateTime)
    client = db.relationship("Client")
    owner = db.relationship("User")

    def to_dict(self):
        value = float(self.value or 0)
        return {"id": self.id, "title": self.title, "client_id": self.client_id,
                "client_name": self.client.name if self.client else None,
                "stage": self.stage, "value": value, "probability": self.probability,
                "weighted_value": round(value * (self.probability or 0) / 100, 2),
                "expected_close_date": self.expected_close_date.isoformat() if self.expected_close_date else None,
                "source": self.source, "notes": self.notes, "lost_reason": self.lost_reason,
                "owner_id": self.owner_id, "owner_name": self.owner.name if self.owner else None,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "closed_at": self.closed_at.isoformat() if self.closed_at else None}


class FollowUp(db.Model):
    __tablename__ = "follow_ups"
    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(200), nullable=False)
    type = db.Column(db.String(20), nullable=False, default="call")
    notes = db.Column(db.Text)
    due_at = db.Column(db.DateTime, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    opportunity_id = db.Column(db.Integer, db.ForeignKey("opportunities.id"))
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"))
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"))
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.now)
    opportunity = db.relationship("Opportunity")
    client = db.relationship("Client")
    assignee = db.relationship("User")

    def to_dict(self):
        return {"id": self.id, "subject": self.subject, "type": self.type, "notes": self.notes,
                "due_at": self.due_at.isoformat(), "status": self.status,
                "overdue": self.status == "pending" and self.due_at < datetime.now(),
                "opportunity_id": self.opportunity_id,
                "opportunity_title": self.opportunity.title if self.opportunity else None,
                "client_id": self.client_id, "client_name": self.client.name if self.client else None,
                "assigned_to": self.assigned_to,
                "assignee_name": self.assignee.name if self.assignee else None,
                "completed_at": self.completed_at.isoformat() if self.completed_at else None}


class Quote(db.Model):
    __tablename__ = "quotes"
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(30), unique=True)
    title = db.Column(db.String(200), nullable=False)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    opportunity_id = db.Column(db.Integer, db.ForeignKey("opportunities.id"))
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    issue_date = db.Column(db.Date, nullable=False, default=date.today)
    valid_until = db.Column(db.Date)
    discount_percent = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    tax_percent = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    notes = db.Column(db.Text)
    terms = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.now)
    client = db.relationship("Client")
    opportunity = db.relationship("Opportunity")
    items = db.relationship("QuoteItem", cascade="all, delete-orphan",
                            order_by="QuoteItem.position", lazy="joined")

    def totals(self):
        subtotal = sum((i.quantity * i.unit_price for i in self.items), Decimal(0))
        discount = subtotal * (self.discount_percent or Decimal(0)) / 100
        tax = (subtotal - discount) * (self.tax_percent or Decimal(0)) / 100
        return tuple(_q(x) for x in (subtotal, discount, tax, subtotal - discount + tax))

    def to_dict(self):
        subtotal, discount, tax, total = self.totals()
        return {"id": self.id, "number": self.number, "title": self.title,
                "client_id": self.client_id, "client_name": self.client.name if self.client else None,
                "opportunity_id": self.opportunity_id,
                "opportunity_title": self.opportunity.title if self.opportunity else None,
                "status": self.status,
                "expired": self.status in ("draft", "sent") and self.valid_until is not None
                           and self.valid_until < date.today(),
                "issue_date": self.issue_date.isoformat() if self.issue_date else None,
                "valid_until": self.valid_until.isoformat() if self.valid_until else None,
                "discount_percent": float(self.discount_percent or 0),
                "tax_percent": float(self.tax_percent or 0),
                "notes": self.notes, "terms": self.terms,
                "items": [{"description": i.description, "quantity": float(i.quantity),
                           "unit_price": float(i.unit_price)} for i in self.items],
                "subtotal": float(subtotal), "discount": float(discount),
                "tax": float(tax), "total": float(total)}


class QuoteItem(db.Model):
    __tablename__ = "quote_items"
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey("quotes.id"), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    description = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False, default=1)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)


# ---------- Opportunities (sales pipeline) ----------
def _apply_opportunity(opp, d, creating=False):
    if creating or "title" in d:
        title = _text(d.get("title"))
        if not title:
            raise BadInput("title is required")
        opp.title = title
    if creating or "client_id" in d:
        cid = _int(d.get("client_id"), "client_id") if d.get("client_id") else None
        _require_client(cid)
        opp.client_id = cid
    if creating or "value" in d:
        opp.value = _num(d.get("value"), "value")
    if d.get("probability") not in (None, ""):
        opp.probability = int(_num(d["probability"], "probability", maximum=100))
    if "expected_close_date" in d:
        opp.expected_close_date = _date(d["expected_close_date"])
    for field in ("source", "notes"):
        if field in d:
            setattr(opp, field, _text(d[field]))


@crm_bp.get("/opportunities")
@permission_required("crm:view")
def list_opportunities():
    q = Opportunity.query
    if request.args.get("stage") in STAGES:
        q = q.filter_by(stage=request.args["stage"])
    if request.args.get("client_id", type=int):
        q = q.filter_by(client_id=request.args.get("client_id", type=int))
    if request.args.get("mine") == "1":
        q = q.filter_by(owner_id=current_user().id)
    return jsonify([o.to_dict() for o in q.order_by(Opportunity.updated_at.desc()).all()])


@crm_bp.post("/opportunities")
@permission_required("crm:manage")
def create_opportunity():
    d = request.get_json(silent=True) or {}
    stage = d.get("stage", "lead")
    if stage not in OPEN_STAGES:
        raise BadInput("new opportunities must start in an open stage")
    opp = Opportunity(stage=stage, probability=STAGES[stage], owner_id=current_user().id)
    _apply_opportunity(opp, d, creating=True)
    db.session.add(opp)
    db.session.commit()
    return jsonify(opp.to_dict()), 201


@crm_bp.put("/opportunities/<int:opp_id>")
@permission_required("crm:manage")
def update_opportunity(opp_id):
    opp = db.get_or_404(Opportunity, opp_id)
    _apply_opportunity(opp, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(opp.to_dict())


@crm_bp.put("/opportunities/<int:opp_id>/stage")
@permission_required("crm:manage")
def move_stage(opp_id):
    opp = db.get_or_404(Opportunity, opp_id)
    d = request.get_json(silent=True) or {}
    stage = d.get("stage")
    if stage not in STAGES:
        raise BadInput("invalid stage")
    reason = _text(d.get("lost_reason"))
    if stage == "lost" and not reason:
        raise BadInput("a reason is required when marking an opportunity as lost")
    if stage != opp.stage:
        opp.stage = stage
        opp.probability = STAGES[stage]
        opp.closed_at = datetime.now() if stage in ("won", "lost") else None
        opp.lost_reason = reason if stage == "lost" else None
    db.session.commit()
    return jsonify(opp.to_dict())


@crm_bp.delete("/opportunities/<int:opp_id>")
@permission_required("crm:manage")
def delete_opportunity(opp_id):
    opp = db.get_or_404(Opportunity, opp_id)
    # Keep linked follow-ups and quotes, just detach them
    FollowUp.query.filter_by(opportunity_id=opp.id).update({"opportunity_id": None})
    Quote.query.filter_by(opportunity_id=opp.id).update({"opportunity_id": None})
    db.session.delete(opp)
    db.session.commit()
    return "", 204


# ---------- Follow-ups ----------
def _apply_followup(fu, d, creating=False):
    if creating or "subject" in d:
        subject = _text(d.get("subject"))
        if not subject:
            raise BadInput("subject is required")
        fu.subject = subject
    if "type" in d:
        if d["type"] not in FOLLOWUP_TYPES:
            raise BadInput("invalid follow-up type")
        fu.type = d["type"]
    if creating or "due_at" in d:
        due = _datetime(d.get("due_at"))
        if due is None:
            raise BadInput("due date and time are required")
        fu.due_at = due
    if "notes" in d:
        fu.notes = _text(d["notes"])
    if "opportunity_id" in d:
        if d["opportunity_id"]:
            opp = db.session.get(Opportunity, _int(d["opportunity_id"], "opportunity_id"))
            if opp is None:
                raise BadInput("opportunity not found")
            fu.opportunity_id = opp.id
            fu.client_id = fu.client_id or opp.client_id
        else:
            fu.opportunity_id = None
    if d.get("client_id"):
        cid = _int(d["client_id"], "client_id")
        _require_client(cid)
        fu.client_id = cid
    if creating and not (fu.opportunity_id or fu.client_id):
        raise BadInput("link the follow-up to an opportunity or a client")
    if "status" in d:
        if d["status"] not in FOLLOWUP_STATUSES:
            raise BadInput("invalid status")
        fu.status = d["status"]
        fu.completed_at = datetime.now() if d["status"] == "done" else None


@crm_bp.get("/followups")
@permission_required("crm:view")
def list_followups():
    q = FollowUp.query
    if request.args.get("status") in FOLLOWUP_STATUSES:
        q = q.filter_by(status=request.args["status"])
    if request.args.get("opportunity_id", type=int):
        q = q.filter_by(opportunity_id=request.args.get("opportunity_id", type=int))
    if request.args.get("mine") == "1":
        q = q.filter_by(assigned_to=current_user().id)
    if request.args.get("overdue") == "1":
        q = q.filter(FollowUp.status == "pending", FollowUp.due_at < datetime.now())
    return jsonify([f.to_dict() for f in q.order_by(FollowUp.due_at.asc()).all()])


@crm_bp.post("/followups")
@permission_required("crm:manage")
def create_followup():
    d = request.get_json(silent=True) or {}
    fu = FollowUp(assigned_to=current_user().id, type="call", status="pending")
    _apply_followup(fu, d, creating=True)
    db.session.add(fu)
    db.session.commit()
    return jsonify(fu.to_dict()), 201


@crm_bp.put("/followups/<int:fu_id>")
@permission_required("crm:manage")
def update_followup(fu_id):
    fu = db.get_or_404(FollowUp, fu_id)
    _apply_followup(fu, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(fu.to_dict())


@crm_bp.post("/followups/<int:fu_id>/complete")
@permission_required("crm:manage")
def complete_followup(fu_id):
    fu = db.get_or_404(FollowUp, fu_id)
    fu.status = "done"
    fu.completed_at = datetime.now()
    db.session.commit()
    return jsonify(fu.to_dict())


@crm_bp.delete("/followups/<int:fu_id>")
@permission_required("crm:manage")
def delete_followup(fu_id):
    db.session.delete(db.get_or_404(FollowUp, fu_id))
    db.session.commit()
    return "", 204


# ---------- Quotations ----------
def _parse_items(raw):
    if not isinstance(raw, list) or not raw:
        raise BadInput("add at least one line item")
    items = []
    for n, r in enumerate(raw, start=1):
        if not isinstance(r, dict):
            raise BadInput(f"line {n}: invalid item")
        desc = _text(r.get("description"))
        if not desc:
            raise BadInput(f"line {n}: description is required")
        qty = _num(r.get("quantity"), f"line {n} quantity")
        if qty == 0:
            raise BadInput(f"line {n}: quantity must be greater than 0")
        price = _num(r.get("unit_price"), f"line {n} unit price")
        items.append(QuoteItem(position=n, description=desc, quantity=qty, unit_price=price))
    return items


def _apply_quote(q, d, creating=False):
    if creating or "client_id" in d:
        cid = _int(d.get("client_id"), "client_id") if d.get("client_id") else None
        _require_client(cid)
        q.client_id = cid
    if "opportunity_id" in d:
        if d["opportunity_id"]:
            opp = db.session.get(Opportunity, _int(d["opportunity_id"], "opportunity_id"))
            if opp is None:
                raise BadInput("opportunity not found")
            q.opportunity_id = opp.id
        else:
            q.opportunity_id = None
    if creating or "title" in d:
        title = _text(d.get("title"))
        if not title:
            raise BadInput("title is required")
        q.title = title
    if creating or "issue_date" in d:
        q.issue_date = _date(d.get("issue_date")) or date.today()
    if "valid_until" in d:
        q.valid_until = _date(d["valid_until"])
    if q.valid_until and q.issue_date and q.valid_until < q.issue_date:
        raise BadInput("'valid until' cannot be before the issue date")
    if creating or "discount_percent" in d:
        q.discount_percent = _num(d.get("discount_percent"), "discount", maximum=100)
    if creating or "tax_percent" in d:
        q.tax_percent = _num(d.get("tax_percent"), "tax", maximum=100)
    for field in ("notes", "terms"):
        if field in d:
            setattr(q, field, _text(d[field]))
    if creating or "items" in d:
        q.items = _parse_items(d.get("items"))


@crm_bp.get("/quotes")
@permission_required("crm:view")
def list_quotes():
    q = Quote.query
    if request.args.get("status") in QUOTE_STATUSES:
        q = q.filter_by(status=request.args["status"])
    if request.args.get("client_id", type=int):
        q = q.filter_by(client_id=request.args.get("client_id", type=int))
    return jsonify([x.to_dict() for x in q.order_by(Quote.id.desc()).all()])


@crm_bp.get("/quotes/<int:quote_id>")
@permission_required("crm:view")
def get_quote(quote_id):
    return jsonify(db.get_or_404(Quote, quote_id).to_dict())


@crm_bp.post("/quotes")
@permission_required("quotes:manage")
def create_quote():
    q = Quote(status="draft", created_by=current_user().id)
    _apply_quote(q, request.get_json(silent=True) or {}, creating=True)
    db.session.add(q)
    db.session.flush()
    q.number = f"Q-{q.issue_date.year}-{q.id:04d}"
    db.session.commit()
    return jsonify(q.to_dict()), 201


@crm_bp.put("/quotes/<int:quote_id>")
@permission_required("quotes:manage")
def update_quote(quote_id):
    q = db.get_or_404(Quote, quote_id)
    if q.status != "draft":
        return jsonify(error="only draft quotations can be edited; set it back to draft first"), 409
    _apply_quote(q, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(q.to_dict())


@crm_bp.put("/quotes/<int:quote_id>/status")
@permission_required("quotes:manage")
def set_quote_status(quote_id):
    q = db.get_or_404(Quote, quote_id)
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in QUOTE_STATUSES:
        raise BadInput("invalid status")
    q.status = status
    db.session.commit()
    return jsonify(q.to_dict())


@crm_bp.delete("/quotes/<int:quote_id>")
@permission_required("quotes:manage")
def delete_quote(quote_id):
    q = db.get_or_404(Quote, quote_id)
    if q.status != "draft":
        return jsonify(error="only draft quotations can be deleted"), 409
    db.session.delete(q)
    db.session.commit()
    return "", 204


# ---------- Summary ----------
@crm_bp.get("/summary")
@permission_required("crm:view")
def summary():
    stages = {s: {"count": 0, "value": 0.0, "weighted": 0.0} for s in STAGES}
    rows = (db.session.query(Opportunity.stage, func.count(Opportunity.id),
                             func.coalesce(func.sum(Opportunity.value), 0),
                             func.coalesce(func.sum(Opportunity.value * Opportunity.probability / 100), 0))
            .group_by(Opportunity.stage).all())
    for stage, count, value, weighted in rows:
        if stage in stages:
            stages[stage] = {"count": count, "value": float(value), "weighted": round(float(weighted), 2)}

    won, lost = stages["won"]["count"], stages["lost"]["count"]
    now = datetime.now()
    end_of_day = now.replace(hour=23, minute=59, second=59)
    pending = FollowUp.query.filter(FollowUp.status == "pending")
    quote_counts = {s: 0 for s in QUOTE_STATUSES}
    for status, count in db.session.query(Quote.status, func.count(Quote.id)).group_by(Quote.status).all():
        quote_counts[status] = count

    return jsonify({
        "stages": stages,
        "open_value": sum(stages[s]["value"] for s in OPEN_STAGES),
        "forecast": round(sum(stages[s]["weighted"] for s in OPEN_STAGES), 2),
        "win_rate": round(won / (won + lost) * 100, 1) if won + lost else 0,
        "overdue_followups": pending.filter(FollowUp.due_at < now).count(),
        "due_today": pending.filter(FollowUp.due_at >= now, FollowUp.due_at <= end_of_day).count(),
        "quotes": quote_counts,
    })
