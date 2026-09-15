"""
Django settings for a single mock anchor instance. Every mock anchor
(mock_anchor_1..4) runs this exact same settings module — the per-instance
identity (port, keys, asset, behavior profile) comes entirely from
environment variables, set by scripts/run-all.sh before launching
`manage.py runserver` for that instance. This means one codebase serves
all four anchors instead of maintaining four near-identical Django projects.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
(BASE_DIR / "state").mkdir(parents=True, exist_ok=True)
(BASE_DIR / "logs").mkdir(parents=True, exist_ok=True)

# --- Per-instance identity (set by scripts/run-all.sh) ---
ANCHOR_ID = os.environ.get("ANCHOR_ID", "mock_anchor_dev")
ANCHOR_NAME = os.environ.get("ANCHOR_NAME", ANCHOR_ID)
ANCHOR_PORT = os.environ.get("ANCHOR_PORT", "8001")
ANCHOR_HOST = os.environ.get("ANCHOR_HOST", f"localhost:{ANCHOR_PORT}")
ASSET_CODE = os.environ.get("ASSET_CODE", "MOCK")
ASSET_ISSUER = os.environ.get("ASSET_ISSUER", "")
DISTRIBUTION_SEED = os.environ.get("DISTRIBUTION_SEED", "")
BEHAVIOR_PROFILE_PATH = os.environ.get(
    "BEHAVIOR_PROFILE_PATH",
    str(BASE_DIR / "behavior_profiles" / "anchor-1.json"),
)
# Compresses simulated "days since launch" for demo purposes: with
# TIME_ACCELERATION=1440, one real minute counts as one simulated day, so a
# "degrades after day 20" profile can be demonstrated in ~20 minutes instead
# of 20 real days. 1.0 = no acceleration (real time).
TIME_ACCELERATION = float(os.environ.get("TIME_ACCELERATION", "1440"))
# How often (seconds) the simulate_transactions command checks for
# transactions that have finished their simulated processing delay.
SIMULATOR_POLL_INTERVAL_SECONDS = float(os.environ.get("SIMULATOR_POLL_INTERVAL_SECONDS", "2"))

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", f"dev-insecure-key-{ANCHOR_ID}-do-not-use-in-prod")
DEBUG = os.environ.get("DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.messages",
    "corsheaders",
    "rest_framework",
    "polaris",
    "mockanchor",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "polaris.middleware.TimezoneMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Each mock anchor instance gets its own SQLite file, keyed by ANCHOR_ID, so
# the four instances never share state.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "state" / f"db-{ANCHOR_ID}.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en-us"

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "state" / f"staticfiles-{ANCHOR_ID}"

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"

CORS_ORIGIN_ALLOW_ALL = True

# --- django-polaris settings (see polaris/settings.py for the full list) ---
POLARIS_ACTIVE_SEPS = ["sep-1", "sep-10", "sep-24"]
POLARIS_HOST_URL = f"http://{ANCHOR_HOST}"
POLARIS_LOCAL_MODE = True
POLARIS_SIGNING_SEED = DISTRIBUTION_SEED  # same testnet account signs SEP-10 challenges and holds the asset
POLARIS_SERVER_JWT_KEY = os.environ.get("SERVER_JWT_KEY", f"dev-insecure-jwt-{ANCHOR_ID}")
POLARIS_STELLAR_NETWORK_PASSPHRASE = os.environ.get(
    "STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015"
)
POLARIS_HORIZON_URI = os.environ.get("HORIZON_TESTNET_URL", "https://horizon-testnet.stellar.org")
POLARIS_SEP10_HOME_DOMAINS = [ANCHOR_HOST]
