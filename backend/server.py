import io
import json
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts
import httpx

logger = logging.getLogger("yedubudi")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Emotion → prosody mapping (rate / pitch / volume tweaks)
EMOTION_PROSODY = {
    "laugh":    {"rate": "+10%", "pitch": "+5Hz",  "volume": "+0%"},
    "angry":    {"rate": "+5%",  "pitch": "-3Hz",  "volume": "+10%"},
    "sad":      {"rate": "-20%", "pitch": "-5Hz",  "volume": "-10%"},
    "thinking": {"rate": "-10%", "pitch": "+0Hz",  "volume": "-5%"},
    "frowning": {"rate": "-5%",  "pitch": "-3Hz",  "volume": "+0%"},
}

RECOMMENDED_VOICES = [
    {"name": "en-US-JennyNeural",    "label": "Jenny (Female)",            "gender": "Female"},
    {"name": "en-US-AriaNeural",     "label": "Aria (Female)",             "gender": "Female"},
    {"name": "en-US-GuyNeural",      "label": "Guy (Male)",                "gender": "Male"},
    {"name": "en-GB-SoniaNeural",    "label": "Sonia (British Female)",    "gender": "Female"},
    {"name": "en-AU-NatashaNeural",  "label": "Natasha (Australian Female)", "gender": "Female"},
]


class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-JennyNeural"
    emotion: str | None = None


@app.get("/voices")
async def get_voices():
    return RECOMMENDED_VOICES


@app.post("/tts")
async def tts(req: TTSRequest):
    prosody = EMOTION_PROSODY.get(req.emotion, {})
    rate = prosody.get("rate", "+0%")
    pitch = prosody.get("pitch", "+0Hz")
    volume = prosody.get("volume", "+0%")

    communicate = edge_tts.Communicate(
        req.text, req.voice, rate=rate, pitch=pitch, volume=volume
    )

    audio_data = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.write(chunk["data"])

    audio_data.seek(0)
    return StreamingResponse(audio_data, media_type="audio/mpeg")


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Autopilot (Ollama LLM brain) ──────────────────────────────────

OLLAMA_URL = "http://localhost:11434/api/chat"

AUTOPILOT_SYSTEM_PROMPT = """\
You are a living cartoon avatar. This 3D body is YOUR body. When a human talks to you, they see YOU moving. Do exactly what they ask.

YOUR BODY — available actions:

BODY: idle, sit, step-front, step-back, step-left, step-right, jump, jump-fwd, lie-up, lie-side
ARMS: auto, wave, hands-up, thumbs-up, peace, pointing, heart, talk
FACE: auto, happy, angry, laughing, tired, sleeping, focused, talking
FULL (overrides all): twirl, front-kick, roundhouse, mr-bean

MOVEMENT RULES — this is critical:
- "move left" or "step left" = body:"step-left"
- "move right" or "step right" = body:"step-right"
- "move forward" or "step forward" or "come closer" = body:"step-front"
- "move back" or "step back" = body:"step-back"
- Each step is ONE command. "Move left 3 steps" = 3 separate step-left commands.
- For movement, use arms:"auto" and face:"auto" or face:"talking" (if there is someting to say) — do NOT add pointing, focused, or other decorations.
- Step duration should be 1 second. Steps must feel quick and snappy.

SPEAKING: Use "say" field to talk. When speaking, use arms:"talk" and face:"talking". Duration = ~2s per sentence.

RULES:
- Output ONLY what was asked. "Step left" = 1 command. "Move left 3 steps" = 3 commands. No extras.
- Do NOT add idle commands between steps. Do NOT pad with random actions.
- One JSON object per line. No other text.

EXAMPLES:

User: "move left 2 steps and move back 1 step"
{"body":"step-left","arms":"auto","face":"auto","note":"step left","duration":1}
{"body":"step-left","arms":"auto","face":"auto","note":"step left","duration":1}
{"body":"step-back","arms":"auto","face":"auto","note":"step back","duration":1}
{"missing":[]}

User: "say hello"
{"body":"idle","arms":"wave","face":"happy","say":"Hello! Nice to see you!","note":"greeting","duration":3}
{"missing":[]}

User: "come closer and tell me a joke"
{"body":"step-front","arms":"auto","face":"auto","note":"step closer","duration":1}
{"body":"step-front","arms":"auto","face":"auto","note":"step closer","duration":1}
{"body":"idle","arms":"talk","face":"talking","say":"Why don't scientists trust atoms? Because they make up everything!","note":"telling joke","duration":5}
{"body":"idle","arms":"auto","face":"laughing","note":"laughing","duration":2}
{"missing":[]}

End with: {"missing":["actions you wish you had"]} — or empty list if none needed.
"""

_VALID_BODY = {"idle", "sit", "step-front", "step-back", "step-left", "step-right", "jump", "jump-fwd", "lie-up", "lie-side"}
_VALID_ARMS = {"auto", "wave", "hands-up", "thumbs-up", "peace", "pointing", "heart", "talk"}
_VALID_FACE = {"auto", "happy", "angry", "laughing", "tired", "sleeping", "focused", "talking"}
_VALID_FULL = {"twirl", "front-kick", "roundhouse", "mr-bean"}

# LLMs often use spaces, underscores, or synonyms instead of exact keys
_KEY_ALIASES = {
    # Body aliases
    "step front": "step-front", "step_front": "step-front", "stepfront": "step-front",
    "step back": "step-back", "step_back": "step-back", "stepback": "step-back",
    "step left": "step-left", "step_left": "step-left", "stepleft": "step-left",
    "step right": "step-right", "step_right": "step-right", "stepright": "step-right",
    "move forward": "step-front", "move-forward": "step-front", "walk forward": "step-front",
    "move front": "step-front", "move-front": "step-front", "walk front": "step-front",
    "move back": "step-back", "move-back": "step-back", "walk back": "step-back",
    "move backward": "step-back", "move-backward": "step-back", "walk backward": "step-back",
    "move left": "step-left", "move-left": "step-left", "walk left": "step-left",
    "move right": "step-right", "move-right": "step-right", "walk right": "step-right",
    "jump fwd": "jump-fwd", "jump_fwd": "jump-fwd", "jump forward": "jump-fwd",
    "lie up": "lie-up", "lie_up": "lie-up", "lieup": "lie-up",
    "lie side": "lie-side", "lie_side": "lie-side", "lieside": "lie-side",
    # Arms aliases
    "hands up": "hands-up", "hands_up": "hands-up", "handsup": "hands-up",
    "thumbs up": "thumbs-up", "thumbs_up": "thumbs-up", "thumbsup": "thumbs-up",
    # Full aliases
    "front kick": "front-kick", "front_kick": "front-kick", "frontkick": "front-kick",
    "mr bean": "mr-bean", "mr_bean": "mr-bean", "mrbean": "mr-bean",
}


def _normalize_key(raw: str) -> str:
    """Normalize an animation key: lowercase, resolve aliases."""
    if not isinstance(raw, str):
        return ""
    key = raw.strip().lower()
    return _KEY_ALIASES.get(key, key)


def _try_parse_command(line: str) -> dict | None:
    line = line.strip().strip("`").strip()
    if not line.startswith("{"):
        return None
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None

    # Handle "missing actions" feedback line
    if "missing" in obj and isinstance(obj["missing"], list):
        return {"missing": obj["missing"]}

    logger.info("LLM raw: %s", {k: obj.get(k) for k in ("body", "arms", "face", "full")})

    cmd = {}
    full_val = _normalize_key(obj.get("full", ""))
    if full_val and full_val in _VALID_FULL:
        cmd["full"] = full_val
    else:
        cmd["full"] = None
        body_key = _normalize_key(obj.get("body", "idle"))
        arms_key = _normalize_key(obj.get("arms", "auto"))
        face_key = _normalize_key(obj.get("face", "auto"))
        cmd["body"] = body_key if body_key in _VALID_BODY else "idle"
        cmd["arms"] = arms_key if arms_key in _VALID_ARMS else "auto"
        cmd["face"] = face_key if face_key in _VALID_FACE else "auto"

    # Pass through the note for display
    if obj.get("note"):
        cmd["note"] = str(obj["note"])[:60]

    # Pass through speech text for TTS
    if obj.get("say"):
        cmd["say"] = str(obj["say"])[:500]

    dur = obj.get("duration", 3)
    try:
        dur = max(1, min(10, int(dur)))
    except (ValueError, TypeError):
        dur = 3
    cmd["duration"] = dur
    return cmd


class AutopilotRequest(BaseModel):
    prompt: str = "Someone just opened the app and is seeing you for the first time. Greet them warmly and introduce yourself."
    model: str = "llama3.2"


@app.post("/autopilot")
async def autopilot(req: AutopilotRequest):
    async def stream_commands():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                payload = {
                    "model": req.model,
                    "messages": [
                        {"role": "system", "content": AUTOPILOT_SYSTEM_PROMPT},
                        {"role": "user", "content": req.prompt},
                    ],
                    "stream": True,
                }
                async with client.stream("POST", OLLAMA_URL, json=payload) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        yield json.dumps({"error": f"Ollama returned {resp.status_code}: {error_body.decode()}"}) + "\n"
                        return

                    line_buffer = ""
                    async for raw_line in resp.aiter_lines():
                        if not raw_line.strip():
                            continue
                        try:
                            chunk = json.loads(raw_line)
                        except json.JSONDecodeError:
                            continue

                        if chunk.get("done"):
                            if line_buffer.strip():
                                cmd = _try_parse_command(line_buffer.strip())
                                if cmd:
                                    yield json.dumps(cmd) + "\n"
                            yield json.dumps({"done": True}) + "\n"
                            return

                        token = chunk.get("message", {}).get("content", "")
                        line_buffer += token

                        while "\n" in line_buffer:
                            line, line_buffer = line_buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            cmd = _try_parse_command(line)
                            if cmd:
                                yield json.dumps(cmd) + "\n"

        except httpx.ConnectError:
            yield json.dumps({"error": "Cannot connect to Ollama at localhost:11434. Is it running?"}) + "\n"
        except httpx.ReadTimeout:
            yield json.dumps({"error": "Ollama request timed out"}) + "\n"
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(stream_commands(), media_type="text/x-ndjson")


@app.get("/ollama-health")
async def ollama_health():
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                return {"status": "ok", "models": models}
            return {"status": "error", "detail": f"Ollama returned {resp.status_code}"}
    except httpx.ConnectError:
        return {"status": "error", "detail": "Ollama not reachable at localhost:11434"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
