from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCH = ROOT / "launch"


def _run_launch(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = {**os.environ, **(env or {})}
    return subprocess.run(
        [str(LAUNCH), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=merged,
        check=False,
    )


def _source(script: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = {**os.environ, **(env or {})}
    return subprocess.run(
        ["bash", "-c", f"source {shlex.quote(str(LAUNCH))}\n{script}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=merged,
        check=False,
    )


def test_launch_bash_syntax() -> None:
    result = subprocess.run(
        ["bash", "-n", str(LAUNCH)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_launch_help_lists_new_commands() -> None:
    result = _run_launch("help")
    assert result.returncode == 0, result.stderr
    out = result.stdout
    assert "./launch logs" in out
    assert "./launch restart" in out
    assert "./launch chartisme-train" in out
    assert "./launch brain-specialist-train" in out
    assert "./launch install-nextdata" in out
    assert "./launch stop --force" in out
    assert "HOST du .env" in out
    assert "vérifie Neon / Ollama" in out


def test_launch_reloads_only_python_package() -> None:
    text = LAUNCH.read_text(encoding="utf-8")
    assert "--reload-dir synchro" in text
    assert r'data.get(\"' not in text
    assert "trap '' INT" in text
    assert "/v1/models" in text
    assert "LOCAL_LLM_BASE_URL" in text
    assert 'NO_PROXY="$merged_no_proxy"' in text
    assert "--noproxy '*'" in text
    assert "ollama serve" in text
    assert "ensure_local_llm" in text
    assert "find_ollama_bin" in text
    assert "ollama_version_label" in text
    assert "SYNCHRO_OLLAMA" in text
    assert "ollama pull moondream" in text
    assert "ollama pull qwen2.5vl:7b" in text
    assert "ollama pull qwen2.5:7b" in text
    assert "llm_chat_names" in text
    assert "petit modèle de chat" in text


def test_stop_force_is_accepted() -> None:
    result = _run_launch("stop", "--force")
    assert result.returncode == 0, result.stderr + result.stdout
    assert "libérés" in result.stdout.lower() or "Ports" in result.stdout


def test_unknown_option_still_fails() -> None:
    result = _run_launch("start", "--nope")
    assert result.returncode != 0
    assert "inconnue" in result.stderr


def test_logs_without_files_fails(tmp_path: Path) -> None:
    result = _run_launch("logs", env={"SYNCHRO_RUN_DIR": str(tmp_path / "empty-run")})
    assert result.returncode != 0
    assert "Pas de journaux" in result.stderr


def test_logs_prints_existing_files(tmp_path: Path) -> None:
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    (run_dir / "backend.log").write_text("api-line\n", encoding="utf-8")
    (run_dir / "frontend.log").write_text("ui-line\n", encoding="utf-8")
    result = _run_launch("logs", "-n", "10", env={"SYNCHRO_RUN_DIR": str(run_dir)})
    assert result.returncode == 0, result.stderr
    assert "api-line" in result.stdout
    assert "ui-line" in result.stdout


def test_dotenv_value_handles_export_quotes_and_comments(tmp_path: Path) -> None:
    envfile = tmp_path / ".env"
    envfile.write_text(
        'export DATABASE_URL="postgresql://u:p@h/db"\n'
        "PORT=9001  # local\n"
        "HOST='0.0.0.0'\n",
        encoding="utf-8",
    )
    result = _source(
        f"""
printf 'url=%s\\n' "$(dotenv_value DATABASE_URL {shlex.quote(str(envfile))})"
printf 'port=%s\\n' "$(dotenv_value PORT {shlex.quote(str(envfile))})"
printf 'host=%s\\n' "$(dotenv_value HOST {shlex.quote(str(envfile))})"
"""
    )
    assert result.returncode == 0, result.stderr
    assert "url=postgresql://u:p@h/db" in result.stdout
    assert "port=9001" in result.stdout
    assert "host=0.0.0.0" in result.stdout


def test_apply_launch_defaults_reads_host_port_from_env(tmp_path: Path) -> None:
    envfile = tmp_path / ".env"
    envfile.write_text("HOST=0.0.0.0\nPORT=9001\n", encoding="utf-8")
    result = _source(
        f"""
ROOT={shlex.quote(str(tmp_path))}
BACKEND_PORT=
BACKEND_HOST=
FRONTEND_PORT=
FRONTEND_HOST=
apply_launch_defaults
printf 'bp=%s bh=%s fu=%s\\n' "$BACKEND_PORT" "$BACKEND_HOST" "$FRONTEND_URL"
"""
    )
    assert result.returncode == 0, result.stderr
    assert "bp=9001" in result.stdout
    assert "bh=0.0.0.0" in result.stdout
    assert "fu=http://127.0.0.1:43147" in result.stdout


def test_env_database_ok_accepts_quoted_neon_url(tmp_path: Path) -> None:
    envfile = tmp_path / ".env"
    envfile.write_text(
        'DATABASE_URL="postgresql://neondb_owner:secret@ep-x.neon.tech/neondb?sslmode=require"\n',
        encoding="utf-8",
    )
    result = _source(
        f"""
ROOT={shlex.quote(str(tmp_path))}
unset DATABASE_URL
if env_database_ok; then echo DB_OK; else echo DB_BAD; fi
"""
    )
    assert result.returncode == 0, result.stderr
    assert "DB_OK" in result.stdout


def test_env_database_ok_rejects_placeholder(tmp_path: Path) -> None:
    envfile = tmp_path / ".env"
    envfile.write_text(
        "DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require\n",
        encoding="utf-8",
    )
    result = _source(
        f"""
ROOT={shlex.quote(str(tmp_path))}
unset DATABASE_URL
if env_database_ok; then echo DB_OK; else echo DB_BAD; fi
"""
    )
    assert result.returncode == 0, result.stderr
    assert "DB_BAD" in result.stdout


def test_find_ollama_bin_honors_synchro_ollama(tmp_path: Path) -> None:
    exe = tmp_path / "ollama"
    exe.write_text("#!/bin/sh\necho ollama version is 0.11.0\n", encoding="utf-8")
    exe.chmod(0o755)
    result = _source(
        'printf "bin=%s\\n" "$(find_ollama_bin)"',
        env={"SYNCHRO_OLLAMA": str(exe)},
    )
    assert result.returncode == 0, result.stderr
    assert f"bin={exe}" in result.stdout


def test_ollama_version_label_reads_cli(tmp_path: Path) -> None:
    exe = tmp_path / "ollama"
    exe.write_text("#!/bin/sh\necho 'ollama version is 0.11.0'\n", encoding="utf-8")
    exe.chmod(0o755)
    result = _source(
        f'ver="$(ollama_version_label {shlex.quote(str(exe))})" && printf "ver=%s\\n" "$ver"'
    )
    assert result.returncode == 0, result.stderr
    assert "0.11.0" in result.stdout


def test_ollama_version_label_rejects_stub(tmp_path: Path) -> None:
    exe = tmp_path / "ollama"
    exe.write_text("#!/bin/sh\necho 'ollama: command not found'\n", encoding="utf-8")
    exe.chmod(0o755)
    result = _source(f"ollama_version_label {shlex.quote(str(exe))}")
    assert result.returncode != 0
