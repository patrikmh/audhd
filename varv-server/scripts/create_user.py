"""Skapar en användare med eget separat dataset + standard-inköpslista.

Körs manuellt, en gång per person:
    python -m scripts.create_user patrik pass123
    python -m scripts.create_user pernilla pass123

Byt lösenord direkt efter första inloggning om det behövs — det finns
inget "byt lösenord"-API än, bara: kör detta igen med samma användarnamn
(uppdaterar lösenordet på en befintlig rad) eller redigera databasen direkt.
"""
import sys

from sqlmodel import Session, select

from varv.db.engine import engine, init_db
from varv.db.models import ShoppingList, User
from varv.utils import hash_password, new_token


def create_or_update_user(username: str, password: str) -> User:
    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if user:
            user.password_hash = hash_password(password)
            session.add(user)
            session.commit()
            session.refresh(user)
            print(f"Uppdaterade lösenord för {username}")
            return user

        user = User(username=username, password_hash=hash_password(password), token=new_token())
        session.add(user)
        session.flush()
        session.add(ShoppingList(user_id=user.id, name="Inköp", slug="shopping"))
        session.commit()
        session.refresh(user)
        print(f"Skapade {username} — token: {user.token}")
        return user


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Användning: python -m scripts.create_user <användarnamn> <lösenord>")
        raise SystemExit(1)
    create_or_update_user(sys.argv[1], sys.argv[2])
