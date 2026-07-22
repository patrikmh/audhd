"""One-off diagnostic: prints every idea's stored title/note and what
idea_connections() actually computes against the real data. Run on the Pi:

    cd /home/patrik/varv-server && source .venv/bin/activate
    python -m scripts.debug_connections <username>
"""
import sys

from sqlmodel import Session, select

from varv.db.engine import engine
from varv.db.models import Idea, User
from varv.services.connections import idea_connections


def main(username: str) -> None:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            print(f"no such user: {username}")
            return

        ideas = session.exec(
            select(Idea).where(Idea.user_id == user.id, Idea.deleted_at.is_(None))
        ).all()
        print(f"{len(ideas)} ideas for {username}:")
        for idea in ideas:
            print(f"  id={idea.id[:8]} title={idea.title!r} note={idea.note!r} raw={idea.raw!r}")

        edges = idea_connections(session, user.id)
        print(f"\n{len(edges)} connections computed:")
        by_id = {idea.id: (idea.title or idea.raw)[:40] for idea in ideas}
        for e in edges:
            print(f"  {by_id.get(e['a'], e['a'])!r} <-> {by_id.get(e['b'], e['b'])!r} score={e['score']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python -m scripts.debug_connections <username>")
        sys.exit(1)
    main(sys.argv[1])
