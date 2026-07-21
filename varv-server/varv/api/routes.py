"""API-lagret. Tunt: validering + delegering till services. All logik bor i services/.

Auth: varje route (utom /auth/login) kräver en giltig User-token och skalar
alla frågor till just den användaren — se varv/api/auth.py och User i db/models.py.
"""
import asyncio
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from varv.agents.core import SortDeps, forfinaren, nedbrytaren, sorteraren
from varv.api.auth import current_user
from varv.db.engine import get_session
from varv.db.models import (
    AgentLog, Capture, EnergyEvent, Idea, ListItem, ShoppingList, Task, TaskStep, Topic, User, Win,
)
from varv.schemas import (
    Breakdown, BreakdownIn, CaptureIn, CaptureOut, ChangeIn, ClassifiedCapture, ClassifyIn,
    LoginIn, LoginOut, RefinedIdea, RefineIn, SyncPushOut, TaskPatch, TranscriptOut, WeekStats,
)
from varv.services import stats, sync
from varv.services.capture import known_tag_vocabulary, process_capture
from varv.utils import verify_password

auth_router = APIRouter()
router = APIRouter()


@auth_router.post("/auth/login", response_model=LoginOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> LoginOut:
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Fel användarnamn eller lösenord")
    return LoginOut(token=user.token, username=user.username)


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
async def capture(
    payload: CaptureIn, user: User = Depends(current_user), session: Session = Depends(get_session)
) -> CaptureOut:
    return await process_capture(session, user.id, payload)


@router.post("/transcribe", response_model=TranscriptOut)
async def transcribe(file: UploadFile = File(...), user: User = Depends(current_user)) -> TranscriptOut:
    return await _transcribe_upload(file)


@router.post("/capture/voice", response_model=CaptureOut)
async def capture_voice(
    file: UploadFile = File(...), user: User = Depends(current_user), session: Session = Depends(get_session)
) -> CaptureOut:
    """Röst hela vägen: KB-Whisper → Sorteraren → rätt tabell. Ett anrop från PWA:n."""
    transcript = await _transcribe_upload(file)
    if not transcript.text:
        raise HTTPException(status_code=422, detail="Tomt transkript")
    return await process_capture(session, user.id, CaptureIn(raw=transcript.text, source="voice"))


# ---------- agent-proxy ----------
# Tunna passthrough-endpoints så frontend kan anropa agenterna direkt
# (t.ex. "unstick"-nedbrytning på begäran) via varv-server/OpenRouter, aldrig
# mot LLM-API:et direkt. Sparar inget själva — /api/capture gör det.

@router.post("/agents/classify", response_model=ClassifiedCapture)
async def agents_classify(
    payload: ClassifyIn, user: User = Depends(current_user), session: Session = Depends(get_session)
) -> ClassifiedCapture:
    deps = SortDeps(known_tags=known_tag_vocabulary(session, user.id))
    result = await sorteraren.run(payload.raw, deps=deps)
    return result.output


@router.post("/agents/refine", response_model=RefinedIdea)
async def agents_refine(payload: RefineIn, user: User = Depends(current_user)) -> RefinedIdea:
    result = await forfinaren.run(payload.raw)
    return result.output


@router.post("/agents/breakdown", response_model=Breakdown)
async def agents_breakdown(payload: BreakdownIn, user: User = Depends(current_user)) -> Breakdown:
    result = await nedbrytaren.run(payload.title)
    return result.output


# ---------- synk ----------

@router.post("/sync/push", response_model=SyncPushOut)
def sync_push(
    changes: list[ChangeIn], user: User = Depends(current_user), session: Session = Depends(get_session)
) -> SyncPushOut:
    return SyncPushOut(**sync.apply_changes(session, user.id, changes))


@router.get("/sync/pull")
def sync_pull(
    since: datetime | None = None, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    return {"server_time": datetime.now().isoformat(), "changes": sync.pull_changes(session, user.id, since)}


# ---------- uppgifter ----------

@router.get("/tasks")
def list_tasks(done: bool = False, user: User = Depends(current_user), session: Session = Depends(get_session)):
    tasks = session.exec(
        select(Task).where(Task.user_id == user.id, Task.done == done).order_by(Task.priority, Task.time)
    ).all()
    steps = session.exec(select(TaskStep).where(TaskStep.user_id == user.id).order_by(TaskStep.position)).all()
    by_task: dict[str, list[TaskStep]] = {}
    for st in steps:
        by_task.setdefault(st.task_id, []).append(st)
    return [{**t.model_dump(), "steps": [s.model_dump() for s in by_task.get(t.id, [])]} for t in tasks]


@router.patch("/tasks/{task_id}")
def patch_task(
    task_id: str, patch: TaskPatch, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    task = session.get(Task, task_id)
    if not task or task.user_id != user.id:
        raise HTTPException(404)
    data = patch.model_dump(exclude_unset=True)
    completing = data.get("done") and not task.done
    for key, value in data.items():
        setattr(task, key, value)
    task.updated_at = datetime.now()
    if completing:
        task.done_at = datetime.now()
        session.add(EnergyEvent(user_id=user.id, delta=task.energy, label=task.title))
        session.add(Win(user_id=user.id, text=f"Klart: {task.title}"))
    session.commit()
    session.refresh(task)
    return task


@router.patch("/steps/{step_id}/toggle")
def toggle_step(step_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    step = session.get(TaskStep, step_id)
    if not step or step.user_id != user.id:
        raise HTTPException(404)
    step.done = not step.done
    step.updated_at = datetime.now()
    if step.done:
        session.add(Win(user_id=user.id, text=f"Steg klart: {step.title}"))
    session.commit()
    return step


# ---------- idéer ----------

@router.get("/ideas")
def list_ideas(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(
        select(Idea).where(Idea.user_id == user.id).order_by(Idea.created_at.desc()).limit(100)
    ).all()


@router.delete("/ideas/{idea_id}")
def delete_idea(idea_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    idea = session.get(Idea, idea_id)
    if not idea or idea.user_id != user.id:
        raise HTTPException(404)
    session.delete(idea)
    session.commit()
    return {"ok": True}


# ---------- listor ----------

@router.get("/lists")
def get_lists(user: User = Depends(current_user), session: Session = Depends(get_session)):
    lists = session.exec(select(ShoppingList).where(ShoppingList.user_id == user.id)).all()
    items = session.exec(select(ListItem).where(ListItem.user_id == user.id)).all()
    by_list: dict[str, list[ListItem]] = {}
    for it in items:
        by_list.setdefault(it.list_id, []).append(it)
    return [{**l.model_dump(), "items": [i.model_dump() for i in by_list.get(l.id, [])]} for l in lists]


@router.patch("/list-items/{item_id}/toggle")
def toggle_item(item_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    item = session.get(ListItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404)
    item.done = not item.done
    item.updated_at = datetime.now()
    session.commit()
    return item


# ---------- energi, vinster, kapacitet ----------

@router.get("/energy")
def energy(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return {**stats.energy_today(session, user.id), "capacity": stats.get_capacity(session, user.id)}


@router.post("/energy")
def add_energy(
    delta: int, label: str, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    session.add(EnergyEvent(user_id=user.id, delta=delta, label=label))
    session.commit()
    return {"ok": True}


@router.post("/capacity/{mode}")
def capacity(
    mode: str, by: str = "user", user: User = Depends(current_user), session: Session = Depends(get_session)
):
    if mode not in stats.MODE_BUDGETS:
        raise HTTPException(422, "steady | low | recovery")
    stats.set_capacity(session, user.id, mode, by)
    return {"capacity": stats.get_capacity(session, user.id)}


@router.get("/wins")
def wins(day: str | None = None, user: User = Depends(current_user), session: Session = Depends(get_session)):
    d = day or date.today().isoformat()
    return session.exec(
        select(Win).where(Win.user_id == user.id, Win.day == d).order_by(Win.created_at.desc())
    ).all()


# ---------- statistik & teman ----------

@router.get("/stats/week", response_model=WeekStats)
def week_stats(user: User = Depends(current_user), session: Session = Depends(get_session)) -> WeekStats:
    return WeekStats(days=stats.week(session, user.id), top_tags=stats.top_tags(session, user.id))


@router.get("/topics")
def topics(user: User = Depends(current_user), session: Session = Depends(get_session)):
    # BERTopic-teman klustras över alla användares fångster ihop (delad, systemomfattande analys).
    return session.exec(select(Topic).order_by(Topic.size.desc())).all()


@router.get("/agents/log")
def agents_log(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(
        select(AgentLog).where(AgentLog.user_id == user.id).order_by(AgentLog.created_at.desc()).limit(30)
    ).all()


@router.get("/captures")
def captures(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(
        select(Capture).where(Capture.user_id == user.id).order_by(Capture.created_at.desc()).limit(100)
    ).all()
