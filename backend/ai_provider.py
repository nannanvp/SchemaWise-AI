"""AI provider layer for SchemaWise AI.

Supports two backends, selected with the ``AI_PROVIDER`` environment variable:

* ``groq``   – GroqCloud (OpenAI-compatible). Primary model ``qwen/qwen3.8-27b``
               with automatic failover to ``openai/gpt-oss-120b``. Both are chosen
               with ``GROQ_MODEL_PRIMARY`` / ``GROQ_MODEL_SECONDARY``.
* ``ollama`` – a local Ollama server (fully offline).

Every public helper is defensive: if the provider is unreachable or rate
limited it returns ``None`` so the caller can fall back to the built-in,
rule-based content instead of crashing.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
load_dotenv()

PROVIDER = os.getenv("AI_PROVIDER", "groq").strip().lower()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:2b")

GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GROQ_URL = os.getenv(
    "GROQ_URL", "https://api.groq.com/openai/v1/chat/completions"
)
GROQ_MODEL_PRIMARY = os.getenv("GROQ_MODEL_PRIMARY", "qwen/qwen3.8-27b").strip()
GROQ_MODEL_SECONDARY = os.getenv(
    "GROQ_MODEL_SECONDARY", "openai/gpt-oss-120b"
).strip()

# Ordered, de-duplicated list of Groq models to try.
GROQ_MODELS = list(
    dict.fromkeys(
        m for m in [GROQ_MODEL_PRIMARY, GROQ_MODEL_SECONDARY] if m
    )
)

AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "60"))
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "2048"))


def active_models() -> list[str]:
    """The model chain currently in use, for display in the UI status chip."""
    if PROVIDER == "groq":
        return list(GROQ_MODELS)
    if PROVIDER == "ollama":
        return [OLLAMA_MODEL]
    return []

# Small in-process response cache so repeated requests are instant and we
# stay well inside the Groq free-tier rate limits.
_CACHE: dict[str, str] = {}
_CACHE_MAX = 128


def _log(message: str) -> None:
    print(f"[ai_provider] {message}", flush=True)


_log(
    f"PROVIDER={PROVIDER!r}  groq_key_set={bool(GROQ_API_KEY)}  "
    f"models={GROQ_MODELS}"
)


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #
async def ai_available() -> bool:
    """Return True when the configured provider looks usable."""
    if PROVIDER == "groq":
        return bool(GROQ_API_KEY)
    if PROVIDER == "ollama":
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{OLLAMA_HOST}/api/tags")
                return response.status_code == 200
        except Exception as exc:  # noqa: BLE001 - availability probe
            _log(f"ollama availability check failed: {exc!r}")
            return False
    return False


# --------------------------------------------------------------------------- #
# JSON helpers
# --------------------------------------------------------------------------- #
def extract_json(text: str) -> Any | None:
    """Best-effort extraction of a JSON object/array from model output."""
    if not text:
        return None
    cleaned = text.strip()

    fence = re.match(r"^```(?:json)?\s*(.*?)```\s*$", cleaned, re.S)
    if fence:
        cleaned = fence.group(1).strip()

    try:
        return json.loads(cleaned)
    except (ValueError, TypeError):
        pass

    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = cleaned.find(open_ch)
        end = cleaned.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except (ValueError, TypeError):
                continue
    return None


# --------------------------------------------------------------------------- #
# Low-level providers
# --------------------------------------------------------------------------- #
def _groq_payload(
    model: str,
    prompt: str,
    system: str | None,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
) -> dict[str, Any]:
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    # Reasoning tuning. GPT-OSS accepts low/medium/high. Qwen 3.8 supports a
    # "none" (instruct) mode which is faster and avoids reasoning text.
    if model.startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = os.getenv("GROQ_REASONING_EFFORT", "low")
    elif model.startswith("qwen/"):
        payload["reasoning_effort"] = (
            "none" if json_mode else os.getenv("GROQ_REASONING_EFFORT", "low")
        )
    return payload


async def _post_groq(payload: dict[str, Any]) -> httpx.Response:
    async with httpx.AsyncClient(timeout=AI_TIMEOUT) as client:
        return await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )


async def _call_groq(
    model: str,
    prompt: str,
    system: str | None,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
) -> str:
    payload = _groq_payload(
        model, prompt, system, temperature, max_tokens, json_mode
    )
    response = await _post_groq(payload)

    # If optional tuning parameters are rejected, retry with a minimal body.
    if response.status_code == 400:
        _log(
            f"Groq 400 model={model}, retrying without optional params: "
            f"{response.text[:200]}"
        )
        response = await _post_groq(
            {
                "model": model,
                "messages": payload["messages"],
                "max_tokens": max_tokens,
            }
        )

    if response.status_code != 200:
        _log(f"Groq HTTP {response.status_code} model={model}: {response.text[:300]}")
    response.raise_for_status()
    data = response.json()
    return (data["choices"][0]["message"]["content"] or "").strip()


async def _call_ollama(
    prompt: str, system: str | None, temperature: float, json_mode: bool
) -> str:
    async with httpx.AsyncClient(timeout=AI_TIMEOUT) as client:
        response = await client.post(
            f"{OLLAMA_HOST}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": (
                    ([{"role": "system", "content": system}] if system else [])
                    + [{"role": "user", "content": prompt}]
                ),
                "stream": False,
                "format": "json" if json_mode else "",
                "options": {"temperature": temperature},
            },
        )
        response.raise_for_status()
        return (response.json().get("message", {}).get("content") or "").strip()


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
async def ai_generate(
    prompt: str,
    *,
    system: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int | None = None,
    use_cache: bool = True,
) -> str | None:
    """Generate text with automatic provider/model failover.

    Returns ``None`` when no provider could answer.
    """
    max_tokens = max_tokens or AI_MAX_TOKENS

    cache_key = None
    if use_cache:
        digest = hashlib.sha256(
            f"{PROVIDER}|{system}|{prompt}|{json_mode}|{temperature}|{max_tokens}".encode()
        ).hexdigest()
        cache_key = digest
        if digest in _CACHE:
            return _CACHE[digest]

    result: str | None = None

    if PROVIDER == "groq" and GROQ_API_KEY:
        for model in GROQ_MODELS:
            try:
                result = await _call_groq(
                    model, prompt, system, temperature, max_tokens, json_mode
                )
                if result:
                    _log(f"groq success model={model}")
                    break
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                _log(f"groq HTTPStatusError model={model} status={status}")
                # Try the next model on rate limit / server errors.
                if status in (429, 500, 502, 503, 504):
                    continue
                continue
            except Exception as exc:  # noqa: BLE001 - failover
                _log(f"groq error model={model}: {exc!r}")
                continue
    elif PROVIDER == "ollama":
        try:
            result = await _call_ollama(prompt, system, temperature, json_mode)
        except Exception as exc:  # noqa: BLE001 - failover
            _log(f"ollama error: {exc!r}")
            result = None

    if result and cache_key:
        if len(_CACHE) >= _CACHE_MAX:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[cache_key] = result

    return result or None


async def ai_generate_json(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> Any | None:
    """Generate and parse a JSON response from the model."""
    raw = await ai_generate(
        prompt,
        system=system,
        json_mode=True,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if not raw:
        return None
    parsed = extract_json(raw)
    if parsed is None:
        _log(f"could not parse JSON response: {raw[:200]!r}")
    return parsed


# Backwards-compatible helper used by the schema explanation endpoint.
async def ai_explain(prompt: str) -> str | None:
    return await ai_generate(prompt, temperature=0.3, max_tokens=900)
