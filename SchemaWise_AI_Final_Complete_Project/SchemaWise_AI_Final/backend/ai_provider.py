import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

PROVIDER = os.getenv("AI_PROVIDER", "ollama")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:2b")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]

async def ai_available() -> bool:
    if PROVIDER == "groq":
        return bool(GROQ_API_KEY)
    if PROVIDER == "ollama":
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(f"{OLLAMA_HOST}/api/tags")
                return r.status_code == 200
        except Exception:
            return False
    return False

async def _call_ollama(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{OLLAMA_HOST}/api/generate", json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": False
        })
        r.raise_for_status()
        return r.json()["response"].strip()

async def _call_groq(prompt: str, model: str) -> str:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 900,
        "temperature": 0.3
    }
    if model.startswith("qwen/"):
        payload["reasoning_effort"] = "low"

    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=payload
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()

async def ai_explain(prompt: str) -> str | None:
    try:
        if PROVIDER == "ollama":
            return await asyncio.wait_for(_call_ollama(prompt), timeout=60)

        if PROVIDER == "groq" and GROQ_API_KEY:
            for model in GROQ_MODELS:
                try:
                    return await asyncio.wait_for(_call_groq(prompt, model), timeout=25)
                except (asyncio.TimeoutError, httpx.HTTPStatusError):
                    continue
            return None
    except Exception:
        return None
    return None
