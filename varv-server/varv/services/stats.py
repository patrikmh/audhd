"""Energi- och statistikfunktioner. Rena funktioner över databasen — lätta att testa."""
from datetime import date, timedelta

from sqlmodel import Session, func, select

from varv.db.models import EnergyEvent, TagLink, Tag, User, Win

MODE_BUDGETS = {"steady": 20, "low": 12, "recovery": 6}


def get_capacity(session: Session, user_id: str) -> str:
    return session.get(User, user_id).capacity


def set_capacity(session: Session, user_id: str, mode: str, by: str) -> None:
    """by = 'user' | 'auto'. Användarens val samma dag vinner alltid; auto växlar bara nedåt."""
    assert mode in MODE_BUDGETS
    user = session.get(User, user_id)
    today = date.today().isoformat()
    if by == "auto" and user.capacity_set_by == "user" and user.capacity_set_day == today:
        return
    user.capacity = mode
    user.capacity_set_day = today
    user.capacity_set_by = by
    session.commit()


def energy_today(session: Session, user_id: str) -> dict:
    today = date.today().isoformat()
    events = session.exec(
        select(EnergyEvent).where(EnergyEvent.day == today, EnergyEvent.user_id == user_id)
    ).all()
    spent = sum(e.delta for e in events if e.delta > 0)
    recharged = -sum(e.delta for e in events if e.delta < 0)
    budget = MODE_BUDGETS[get_capacity(session, user_id)]
    remaining = max(0, min(budget, budget - spent + recharged))
    return {"budget": budget, "spent": spent, "recharged": recharged,
            "remaining": remaining, "over_budget": spent - recharged > budget}


def week(session: Session, user_id: str) -> list[dict]:
    days = []
    for offset in range(6, -1, -1):
        d = (date.today() - timedelta(days=offset)).isoformat()
        events = session.exec(
            select(EnergyEvent).where(EnergyEvent.day == d, EnergyEvent.user_id == user_id)
        ).all()
        wins = session.exec(
            select(func.count()).select_from(Win).where(Win.day == d, Win.user_id == user_id)
        ).one()
        days.append({
            "day": d,
            "spent": sum(e.delta for e in events if e.delta > 0),
            "recharged": -sum(e.delta for e in events if e.delta < 0),
            "wins": wins,
        })
    return days


def top_tags(session: Session, user_id: str, days: int = 7, limit: int = 5) -> list[tuple[str, int]]:
    since = (date.today() - timedelta(days=days)).isoformat()
    rows = session.exec(
        select(Tag.name, func.count(TagLink.id))
        .join(TagLink, TagLink.tag_id == Tag.id)
        .where(TagLink.day >= since, TagLink.user_id == user_id)
        .group_by(Tag.name)
        .order_by(func.count(TagLink.id).desc())
        .limit(limit)
    ).all()
    return [(name, int(n)) for name, n in rows]
