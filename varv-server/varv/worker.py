"""Bakgrundsworkern: samma agentprinciper som i appen, nu server-side.

Nytt sedan reviewen: KV-lease så att bara EN process kör agentloopen även om
uvicorn startas med --workers > 1 (annars dubbla svep och dubbel API-kostnad).
"""
import asyncio
import logging
import os
import time
from datetime import date, datetime

from sqlmodel import func, select

from varv.agents.core import forfinaren, nedbrytaren
from varv.config import get_settings
from varv.db.engine import session_scope
from varv.db.models import AgentLog, Idea, IdeaStatus, KV, Task, TaskStep, User
from varv.services.capture import agent_note
from varv.services.capture import link_tags
from varv.services.topics import run_topics

log = logging.getLogger(__name__)
_PID = str(os.getpid())


def _hold_lease() -> bool:
    """En process äger loopen. Lease = 'pid:epoch'; stale efter 2 tick ⇒ övertagbar."""
    s = get_settings()
    now = time.time()
    with session_scope() as session:
        kv = session.get(KV, "worker_lease")
        if kv:
            pid, stamp = kv.value.split(":")
            if pid != _PID and now - float(stamp) < 2 * s.agent_tick_seconds:
                return False  # någon annan lever och äger loopen
            kv.value = f"{_PID}:{now}"
        else:
            session.add(KV(key="worker_lease", value=f"{_PID}:{now}"))
        session.commit()
    return True


async def refine_sweep() -> None:
    s = get_settings()
    with session_scope() as session:
        pending = session.exec(
            select(Idea)
            .where(
                Idea.status.in_([IdeaStatus.raw, IdeaStatus.fail]),
                Idea.attempts < s.refine_max_attempts,
                Idea.deleted_at.is_(None),
            )
            .limit(s.refine_batch)
        ).all()
        for idea in pending:
            idea.attempts += 1
            idea.status = IdeaStatus.refining
            session.commit()
            try:
                result = await forfinaren.run(idea.raw)
                out = result.output
                idea.title, idea.note, idea.status = out.title, out.note, IdeaStatus.klar
                idea.updated_at = datetime.now()
                link_tags(session, idea.user_id, out.tags, "idea", idea.id)
                agent_note(session, idea.user_id, "forfinaren", f'städade "{out.title[:50]}"')
            except Exception:
                log.exception("Förfinaren fallerade för idé %s", idea.id)
                idea.status = IdeaStatus.fail
            session.commit()


async def breakdown_sweep() -> None:
    s = get_settings()
    today = date.today().isoformat()
    with session_scope() as session:
        # Budget och kandidat väljs per användare — separata dataset, separata budgetar.
        for user in session.exec(select(User)).all():
            used = session.exec(
                select(func.count()).select_from(AgentLog)
                .where(AgentLog.user_id == user.id, AgentLog.agent == "nedbrytaren", AgentLog.day == today)
            ).one()
            if used >= s.breakdown_daily_budget:
                continue
            has_steps = select(TaskStep.task_id).where(TaskStep.deleted_at.is_(None)).distinct()
            # Kandidater: öppna, stegfria uppgifter som faktiskt behöver igångsättningshjälp
            # (A-prioriterade eller tunga). Väljs sedan i den ordning användaren möter dem.
            candidates = session.exec(
                select(Task)
                .where(
                    Task.user_id == user.id, Task.done == False,  # noqa: E712
                    Task.deleted_at.is_(None), Task.id.not_in(has_steps),
                )
                .where((Task.priority == "A") | (Task.energy >= 4))
            ).all()
            if not candidates:
                continue

            def _order(t: Task) -> tuple:
                # 1) tidsatta först, i tidsordning  2) A före B/C  3) tyngre först
                has_time = 0 if t.time else 1
                prio_rank = {"A": 0, "B": 1, "C": 2}.get(t.priority or "", 3)
                return (has_time, t.time or "99:99", prio_rank, -t.energy)

            candidate = sorted(candidates, key=_order)[0]
            try:
                result = await nedbrytaren.run(candidate.title)
                for pos, step in enumerate(result.output.steps):
                    session.add(TaskStep(
                        user_id=user.id, task_id=candidate.id, title=step.title, minutes=step.minutes, position=pos,
                    ))
                agent_note(
                    session, user.id, "nedbrytaren",
                    f'förberedde {len(result.output.steps)} steg för "{candidate.title[:50]}"',
                )
                session.commit()
            except Exception:
                log.exception("Nedbrytaren fallerade för uppgift %s", candidate.id)


def _topics_due() -> bool:
    s = get_settings()
    if datetime.now().hour < s.topics_hour:
        return False
    with session_scope() as session:
        kv = session.get(KV, "topics_last_run")
        return not kv or kv.value[:10] != date.today().isoformat()


async def topics_job() -> None:
    if not _topics_due():
        return
    loop = asyncio.get_running_loop()
    with session_scope() as session:
        result = await loop.run_in_executor(None, run_topics, session)  # CPU-tungt → blockera inte API:et
        log.info("BERTopic: %s", result)


async def agent_loop(stop: asyncio.Event) -> None:
    s = get_settings()
    log.info("Agentloop startad pid=%s (tick %ss)", _PID, s.agent_tick_seconds)
    while not stop.is_set():
        try:
            if _hold_lease():
                await refine_sweep()
                await breakdown_sweep()
                await topics_job()
            else:
                log.debug("lease hålls av annan process — hoppar tick")
        except Exception:
            log.exception("agent-tick fallerade — fortsätter nästa tick")
        try:
            await asyncio.wait_for(stop.wait(), timeout=s.agent_tick_seconds)
        except TimeoutError:
            pass
