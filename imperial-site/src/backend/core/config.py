import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "users.db")


def load_local_env():
    env_paths = [
        os.path.join(BASE_DIR, ".env.local"),
        os.path.join(BASE_DIR, ".env"),
        os.path.join(os.path.dirname(BASE_DIR), ".env.local"),
        os.path.join(os.path.dirname(BASE_DIR), ".env"),
    ]

    for env_path in env_paths:
        if not os.path.exists(env_path):
            continue

        with open(env_path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue

                key, value = stripped.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()

DEFAULT_CORS_ORIGINS = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
])
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_key_change_me")
ACCOUNT_TYPES = ("Admin", "Staff", "User", "Wholesale Customer")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173/imperial-site")
STRIPE_CURRENCY = os.getenv("STRIPE_CURRENCY", "aud")
