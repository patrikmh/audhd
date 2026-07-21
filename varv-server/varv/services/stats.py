"""Energi- och statistikfunktioner. Rena funktioner över databasen — lätta att testa."""
from datetime import date, timedelta

from sqlmodel import Session, func, select

from varv.db.models import EnergyEvent, KV, TagLink, Tag, Win

MODE_BUDGETS = {"steady": 20, "low": 12, "recovery": 6}


def get_capacity(session: Session) -> str:
    row = session.get(KV, "capacity")
    return row.value if row else "steady"


def set_capacity(session: Session, mode: str, by: str) -> None:
    """by = 'user' | 'auto'. Användarens val samma dag vinner alltid; auto växlar bara nedåt."""
    assert mode in MODE_BUDGETS
    owner = session.get(KV, "capacity_by")
    today = date.today().isoformat()
    if by == "auto" and owner and owner.value == f"user:{today}":
        return
    for key, value in (("capacity", mode), ("capacity_by", f"{by}:{today}")):
        row = session.get(KV, key)
        if row:
            row.value = value
        else:
            session.add(KV(key=key, value=value))
    session.commit()


def energy_today(session: Session) -> dict:
    today = date.today().isoformat()
    events = session.exec(select(EnergyEvent).where(EnergyEvent.day == today)).all()
    spent = sum(e.delta for e in events if e.delta > 0)
    recharged = -sum(e.delta for e in events if e.delta < 0)
    budget = MODE_BUDGETS[get_capacity(session)]
    remaining = max(0, min(budget, budget - spent + recharged))
    return {"budget": budget, "spent": spent, "recharged": recharged,
            "remaining": remaining, "over_budget": spent - recharged > budget}


def week(session: Session) -> list[dict]:
    days = []
    for offset in range(6, -1, -1):
        d = (date.today() - timedelta(days=offset)).isoformat()
        events = session.exec(select(EnergyEvent).where(EnergyEvent.day == d)).all()
        wins = session.exec(select(func.count()).select_from(Win).where(Win.day == d)).one()
        days.append({
            "day": d,
            "spent": sum(e.delta for e in events if e.delta > 0),
            "recharged": -sum(e.delta for e in events if e.delta < 0),
            "wins": wins,
        })
    return days


def top_tags(session: Session, days: int = 7, limit: int = 5) -> list[tuple[str, int]]:
    since = (date.today() - timedelta(days=days)).isoformat()
    rows = session.exec(
        select(Tag.name, func.count(TagLink.id))
        .join(TagLink, TagLink.tag_id == Tag.id)
        .where(TagLink.day >= since)
        .group_by(Tag.name)
        .order_by(func.count(TagLink.id).desc())
        .limit(limit)
    ).all()
    return [(name, int(n)) for name, n in rows]
