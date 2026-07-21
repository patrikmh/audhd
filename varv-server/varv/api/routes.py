"""API-lagret. Tunt: validering + delegering till services. All logik bor i services/.

Nytt sedan reviewen: bearer-auth på allt, Whisper i executor (blockerar inte event-loopen),
/sync/push + /sync/pull för offline-klienter.
"""
import asyncio
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from varv.api.auth import require_token
from varv.db.engine import get_session
from varv.db.models import (
    AgentLog, Capture, EnergyEvent, Idea, ListItem, ShoppingList, Task, TaskStep, Topic, Win,
)
from varv.schemas import CaptureIn, CaptureOut, ChangeIn, SyncPushOut, TaskPatch, TranscriptOut, WeekStats
from varv.services import stats, sync
from varv.services.capture import process_capture

router = APIRouter(dependencies=[Depends(require_token)])


async def _transcribe_upload(file: UploadFile) -> TranscriptOut:
    """KB-Whisper är CPU-tung och synkron → executor så API:et förblir responsivt."""
    from varv.services.transcribe import transcribe_bytes  # lazy: tung modul
    suffix = "." + (file.filename or "a.webm").rsplit(".", 1)[-1]
    data = await file.read()
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, transcribe_bytes, data, suffix)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e


# ---------- fångst ----------

@router.post("/capture", response_model=CaptureOut)
async def capture(payload: CaptureIn, session: Session = Depends(get_session)) -> CaptureOut:
    return await process_capture(session, payload)


@router.post("/transcribe", response_model=TranscriptOut)
async def transcribe(file: UploadFile = File(...)) -> TranscriptOut:
    return await _transcribe_upload(file)


@router.post("/capture/voice", response_model=CaptureOut)
async def capture_voice(file: UploadFile = File(...), session: Session = Depends(get_session)) -> CaptureOut:
    """Röst hela vägen: KB-Whisper → Sorteraren → rätt tabell. Ett anrop från PWA:n."""
    transcript = await _transcribe_upload(file)
    if not transcript.text:
        raise HTTPException(status_code=422, detail="Tomt transkript")
    return await process_capture(session, CaptureIn(raw=transcript.text, source="voice"))


# ---------- synk ----------

@router.post("/sync/push", response_model=SyncPushOut)
def sync_push(changes: list[ChangeIn], session: Session = Depends(get_session)) -> SyncPushOut:
    return SyncPushOut(**sync.apply_changes(session, changes))


@router.get("/sync/pull")
def sync_pull(since: datetime | None = None, session: Session = Depends(get_session)):
    return {"server_time": datetime.now().isoformat(), "changes": sync.pull_changes(session, since)}


# ---------- uppgifter ----------

@router.get("/tasks")
def list_tasks(done: bool = False, session: Session = Depends(get_session)):
    tasks = session.exec(select(Task).where(Task.done == done).order_by(Task.priority, Task.time)).all()
    steps = session.exec(select(TaskStep).order_by(TaskStep.position)).all()
    by_task: dict[str, list[TaskStep]] = {}
    for st in steps:
        by_task.setdefault(st.task_id, []).append(st)
    return [{**t.model_dump(), "steps": [s.model_dump() for s in by_task.get(t.id, [])]} for t in tasks]


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, patch: TaskPatch, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    data = patch.model_dump(exclude_unset=True)
    completing = data.get("done") and not task.done
    for key, value in data.items():
        setattr(task, key, value)
    task.updated_at = datetime.now()
    if completing:
        task.done_at = datetime.now()
        session.add(EnergyEvent(delta=task.energy, label=task.title))
        session.add(Win(text=f"Klart: {task.title}"))
    session.commit()
    session.refresh(task)
    return task


@router.patch("/steps/{step_id}/toggle")
def toggle_step(step_id: str, session: Session = Depends(get_session)):
    step = session.get(TaskStep, step_id)
    if not step:
        raise HTTPException(404)
    step.done = not step.done
    step.updated_at = datetime.now()
    if step.done:
        session.add(Win(text=f"Steg klart: {step.title}"))
    session.commit()
    return step


# ---------- idéer ----------

@router.get("/ideas")
def list_ideas(session: Session = Depends(get_session)):
    return session.exec(select(Idea).order_by(Idea.created_at.desc()).limit(100)).all()


@router.delete("/ideas/{idea_id}")
def delete_idea(idea_id: str, session: Session = Depends(get_session)):
    idea = session.get(Idea, idea_id)
    if not idea:
        raise HTTPException(404)
    session.delete(idea)
    session.commit()
    return {"ok": True}


# ---------- listor ----------

@router.get("/lists")
def get_lists(session: Session = Depends(get_session)):
    lists = session.exec(select(ShoppingList)).all()
    items = session.exec(select(ListItem)).all()
    by_list: dict[str, list[ListItem]] = {}
    for it in items:
        by_list.setdefault(it.list_id, []).append(it)
    return [{**l.model_dump(), "items": [i.model_dump() for i in by_list.get(l.id, [])]} for l in lists]


@router.patch("/list-items/{item_id}/toggle")
def toggle_item(item_id: str, session: Session = Depends(get_session)):
    item = session.get(ListItem, item_id)
    if not item:
        raise HTTPException(404)
    item.done = not item.done
    item.updated_at = datetime.now()
    session.commit()
    return item


# ---------- energi, vinster, kapacitet ----------

@router.get("/energy")
def energy(session: Session = Depends(get_session)):
    return {**stats.energy_today(session), "capacity": stats.get_capacity(session)}


@router.post("/energy")
def add_energy(delta: int, label: str, session: Session = Depends(get_session)):
    session.add(EnergyEvent(delta=delta, label=label))
    session.commit()
    return {"ok": True}


@router.post("/capacity/{mode}")
def capacity(mode: str, by: str = "user", session: Session = Depends(get_session)):
    if mode not in stats.MODE_BUDGETS:
        raise HTTPException(422, "steady | low | recovery")
    stats.set_capacity(session, mode, by)
    return {"capacity": stats.get_capacity(session)}


@router.get("/wins")
def wins(day: str | None = None, session: Session = Depends(get_session)):
    d = day or date.today().isoformat()
    return session.exec(select(Win).where(Win.day == d).order_by(Win.created_at.desc())).all()


# ---------- statistik & teman ----------

@router.get("/stats/week", response_model=WeekStats)
def week_stats(session: Session = Depends(get_session)) -> WeekStats:
    return WeekStats(days=stats.week(session), top_tags=stats.top_tags(session))


@router.get("/topics")
def topics(session: Session = Depends(get_session)):
    return session.exec(select(Topic).order_by(Topic.size.desc())).all()


@router.get("/agents/log")
def agents_log(session: Session = Depends(get_session)):
    return session.exec(select(AgentLog).order_by(AgentLog.created_at.desc()).limit(30)).all()


@router.get("/captures")
def captures(session: Session = Depends(get_session)):
    return session.exec(select(Capture).order_by(Capture.created_at.desc()).limit(100)).all()
