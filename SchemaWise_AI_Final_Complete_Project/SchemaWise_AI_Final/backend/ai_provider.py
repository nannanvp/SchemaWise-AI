import os
import httpx
from dotenv import load_dotenv

load_dotenv()

PROVIDER = os.getenv("AI_PROVIDER", "ollama").strip().lower()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:2b")
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]

print(f"[ai_provider] PROVIDER={PROVIDER!r}  GROQ_API_KEY set={bool(GROQ_API_KEY)}  key_len={len(GROQ_API_KEY)}", flush=True)

async def ai_available() -> bool:
    if PROVIDER == "groq":
        return bool(GROQ_API_KEY)
    if PROVIDER == "ollama":
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(f"{OLLAMA_HOST}/api/tags")
                return r.status_code == 200
        except Exception as e:
            print(f"[ai_provider] ollama_available check failed: {e!r}", flush=True)
            return False
    return False

async def _call_groq(prompt: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 900,
                "temperature": 0.3
            }
        )
        if r.status_code != 200:
            print(f"[ai_provider] Groq HTTP {r.status_code} for model={model}: {r.text[:500]}", flush=True)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()

async def ai_explain(prompt: str) -> str | None:
    print(f"[ai_provider] ai_explain called, PROVIDER={PROVIDER!r}", flush=True)

    if PROVIDER == "ollama":
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(f"{OLLAMA_HOST}/api/generate", json={
                    "model": OLLAMA_MODEL, "prompt": prompt, "stream": False
                })
                r.raise_for_status()
                return r.json()["response"].strip()
        except Exception as e:
            print(f"[ai_provider] ollama call failed: {e!r}", flush=True)
            return None

    if PROVIDER == "groq" and GROQ_API_KEY:
        for model in GROQ_MODELS:
            try:
                return await _call_groq(prompt, model)
            except httpx.HTTPStatusError as e:
                print(f"[ai_provider] {model} HTTPStatusError: {e.response.status_code}", flush=True)
                if e.response.status_code == 429:
                    continue
                return None
            except Exception as e:
                print(f"[ai_provider] {model} unexpected error: {e!r}", flush=True)
                return None
        return None

    print("[ai_provider] Falling through: PROVIDER not 'groq' or key missing")
    return None
