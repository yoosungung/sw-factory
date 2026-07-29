"""TDD: factory staff user seed + My Project cleanup helpers."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import seed_factory_users as seed  # noqa: E402

FACTORY = ["pm", "km", "ta", "qa", "aa"]


def test_factory_staff_names_constant():
    assert seed.FACTORY_STAFF == tuple(FACTORY)


def test_staff_agents_from_yaml():
    data = {
        "agents": [
            {"name": "eric", "email": "e@x", "type": "human"},
            {"name": "pm", "email": "pm@x", "type": "sessions", "leantime_user_id": 4},
            {"name": "asky", "email": "a@x", "type": "sessions"},
            {"name": "qa", "email": "qa@x", "type": "sessions"},
        ]
    }
    staff = seed.staff_agents(data)
    assert [a["name"] for a in staff] == ["pm", "qa"]
    assert staff[0]["email"] == "pm@x"


def test_apply_user_ids_updates_agents():
    data = {
        "agents": [
            {"name": "pm", "leantime_user_id": 4, "email": "pm@x"},
            {"name": "qa", "leantime_user_id": 15, "email": "qa@x"},
        ],
        "settings": {
            "schedules": [
                {"id": "pm-checkpoint", "prompt": "Mentions: eric=1,pm=4,qa=15."},
            ]
        },
    }
    out = seed.apply_user_ids(data, {"pm": 40, "qa": 41})
    assert out["agents"][0]["leantime_user_id"] == 40
    assert out["agents"][1]["leantime_user_id"] == 41
    assert "pm=40" in out["settings"]["schedules"][0]["prompt"]
    assert "qa=41" in out["settings"]["schedules"][0]["prompt"]
    assert "eric=1" in out["settings"]["schedules"][0]["prompt"]


def test_secret_token_keys():
    assert seed.token_secret_key("pm") == "LEANTIME_ACCESS_TOKEN_pm"
    assert seed.token_secret_key("ta") == "LEANTIME_ACCESS_TOKEN_ta"


def test_is_my_project_name():
    assert seed.is_my_project_name("My Project") is True
    assert seed.is_my_project_name("my project") is True
    assert seed.is_my_project_name("Demo Acme") is False


def test_user_insert_values_shape():
    vals = seed.user_insert_values(
        email="pm@example.com",
        firstname="pm",
        role=40,
        password_hash="$2y$10$abc",
    )
    assert vals["username"] == "pm@example.com"
    assert vals["firstname"] == "pm"
    assert vals["role"] == 40
    assert vals["status"] == "a"
    assert vals["password"] == "$2y$10$abc"
    assert "clientId" in vals


def test_rename_secret_keys_map():
    mapping = seed.legacy_secret_renames()
    assert mapping["LEANTIME_ACCESS_TOKEN_candy"] == "LEANTIME_ACCESS_TOKEN_pm"
    assert mapping["LEANTIME_ACCESS_TOKEN_finder"] == "LEANTIME_ACCESS_TOKEN_km"
    assert mapping["LEANTIME_ACCESS_TOKEN_infra"] == "LEANTIME_ACCESS_TOKEN_ta"
    assert mapping["GH_TOKEN_candy"] == "GH_TOKEN_pm"


def test_build_secret_patch_merges_tokens_and_renames():
    existing = {
        "CURSOR_API_KEY": "crsr_x",
        "GH_TOKEN": "ghp_x",
        "GH_TOKEN_candy": "ghp_old",
        "LEANTIME_ACCESS_TOKEN_candy": "old",
    }
    tokens = {"pm": "pat-pm", "km": "pat-km", "ta": "pat-ta", "qa": "pat-qa", "aa": "pat-aa"}
    patch = seed.build_secret_string_data(existing, tokens)
    assert patch["LEANTIME_ACCESS_TOKEN_pm"] == "pat-pm"
    assert patch["LEANTIME_ACCESS_TOKEN_ta"] == "pat-ta"
    assert patch["GH_TOKEN_pm"] == "ghp_old"
    assert "LEANTIME_ACCESS_TOKEN_candy" not in patch
    assert "GH_TOKEN_candy" not in patch


def test_clients_project_name_default():
    assert seed.client_project_name({"id": "demo-acme"}) == "demo-acme"
    assert seed.client_project_name({"id": "demo-acme", "project_name": "Acme"}) == "Acme"


@pytest.mark.parametrize("name", ["My Project", "MY PROJECT"])
def test_refuse_create_my_project(name):
    with pytest.raises(ValueError, match="My Project"):
        seed.ensure_not_my_project(name)
