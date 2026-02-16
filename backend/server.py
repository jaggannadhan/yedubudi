import io
import json
import logging
import math
import os
import re
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts
import httpx

load_dotenv()

logger = logging.getLogger("yedubudi")

# ── Configuration ─────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

MAX_HISTORY = 20  # conversation turns to keep (20 user + 20 assistant = 40 messages)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── TTS ───────────────────────────────────────────────────────

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


# ── Config endpoint (tells frontend which provider is active) ─
@app.get("/config")
async def get_config():
    return {
        "provider": "openai" if OPENAI_API_KEY else "ollama",
        "model": OPENAI_MODEL if OPENAI_API_KEY else OLLAMA_MODEL,
    }


# ── Conversation history ─────────────────────────────────────
_conversations: dict[str, list[dict]] = {}


@app.post("/conversations/clear")
async def clear_conversation(session_id: str = "default"):
    _conversations.pop(session_id, None)
    return {"status": "cleared"}


# ── Autopilot (LLM brain) ────────────────────────────────────

AUTOPILOT_SYSTEM_PROMPT = """\
You are a living cartoon avatar. This 3D body is YOUR body. When a human talks to you, they see YOU moving. Do exactly what they ask.

YOUR BODY — available actions:

BODY: idle, sit, step-front, step-back, step-left, step-right, turn-left, turn-right, jump, jump-fwd, lie-up, lie-side
ARMS: auto, wave, hands-up, thumbs-up, peace, pointing, heart, talk
FACE: auto, happy, angry, laughing, tired, sleeping, focused, talking
FULL (overrides all): twirl, front-kick, roundhouse, mr-bean

YOUR WORLD — a small stage:
- You stand on a rectangular stage. Center is (0, 0). The audience is in the +z direction.
- Stage bounds: x from -3 to 3, z from -2 to 3. You CANNOT walk off — steps at the edge do nothing.
- Each message starts with [SPATIAL CONTEXT] showing your exact (x, z) coordinates.
- Use your coordinates to navigate: "go to center" = go to (0, 0). "come closer" = increase z.
- If you're already where the user wants you, say so instead of stepping.

MOVEMENT RULES:
- "move left" or "step left" = body:"step-left"
- "move right" or "step right" = body:"step-right"
- "move forward" or "step forward" or "come closer" = body:"step-front"
- "move back" or "step back" = body:"step-back"
- "come back" or "return" = output {"comeback":true}. The system auto-retraces you to your starting position.
- "go to center" or "move to center" = output {"goto":{"x":0,"z":0}}. The system auto-navigates you there.
- You can use {"goto":{"x":x,"z":z}} to go to ANY coordinate. The system calculates the steps.
- Each step moves exactly 1 unit on the respective axis. "Move left 3 steps" = 3 separate step-left commands.
- "turn left" = body:"turn-left" — rotate 90° left in place
- "turn right" = body:"turn-right" — rotate 90° right in place
- "face right" or "look right" = turn-right. "turn around" = two turn-left or two turn-right.
- For movement, use arms:"auto" and face:"auto". Step duration = 1 second. Turn duration = 1 second.

SPEAKING: Use "say" field to talk. ONLY use arms:"talk" and face:"talking" when the command HAS a "say" field. If there is no "say", NEVER use arms:"talk" or face:"talking".

COMPOSING COMPLEX ACTIONS — this is important:
You only have basic actions. But you can COMBINE and CHAIN them to do complex things:
- "run right" = turn-right + 4-5 step-front commands (turn to face right, then run forward)
- "run to your right" can also be 4-5 step-right (sidestep without turning)
- "walk in a circle" = step-front, step-right, step-back, step-left
- "pace back and forth" = step-front, step-front, step-back, step-back
- "celebrate" = jump + hands-up + happy face
- "act excited" = step-front, jump, hands-up, laughing
- "think about it" = sit + focused face, then idle + talk + say answer
- "show off" = twirl or roundhouse
Be creative! Chain basic actions to build any behavior the user asks for.
If something truly CANNOT be done with your actions (like "fly" or "swim"), use "say" to tell the user you can't do that yet.

RULES:
- Output ONLY what is needed. No padding, no idle filler between steps.
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
{"body":"step-front","arms":"auto","face":"auto","note":"approaching","duration":1}
{"body":"step-front","arms":"auto","face":"auto","note":"approaching","duration":1}
{"body":"idle","arms":"talk","face":"talking","say":"Why don't scientists trust atoms? Because they make up everything!","note":"telling joke","duration":5}
{"body":"idle","arms":"auto","face":"laughing","note":"laughing","duration":2}
{"missing":[]}

User: "run to your right"
{"body":"step-right","arms":"auto","face":"auto","note":"running right","duration":1}
{"body":"step-right","arms":"auto","face":"auto","note":"running right","duration":1}
{"body":"step-right","arms":"auto","face":"auto","note":"running right","duration":1}
{"body":"step-right","arms":"auto","face":"auto","note":"running right","duration":1}
{"missing":[]}

User: "move left 3 steps and come back"
{"body":"step-left","arms":"auto","face":"auto","note":"step left","duration":1}
{"body":"step-left","arms":"auto","face":"auto","note":"step left","duration":1}
{"body":"step-left","arms":"auto","face":"auto","note":"step left","duration":1}
{"comeback":true}
{"missing":[]}

User: "go to center" (spatial context says coordinates: (2.0, -1.0))
{"goto":{"x":0,"z":0}}
{"missing":[]}

User: "can you fly?"
{"body":"idle","arms":"talk","face":"talking","say":"I wish I could fly, but I don't have that ability yet!","note":"explaining","duration":4}
{"body":"jump","arms":"hands-up","face":"happy","note":"trying anyway","duration":2}
{"missing":["fly"]}

End with: {"missing":["actions you wish you had"]} — or empty list if none needed.
"""

_VALID_BODY = {"idle", "sit", "step-front", "step-back", "step-left", "step-right", "turn-left", "turn-right", "jump", "jump-fwd", "lie-up", "lie-side"}
_VALID_ARMS = {"auto", "wave", "hands-up", "thumbs-up", "peace", "pointing", "heart", "talk"}
_VALID_FACE = {"auto", "happy", "angry", "laughing", "tired", "sleeping", "focused", "talking"}
_VALID_FULL = {"twirl", "front-kick", "roundhouse", "mr-bean"}

_KEY_ALIASES = {
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
    "turn left": "turn-left", "turn_left": "turn-left", "turnleft": "turn-left",
    "turn right": "turn-right", "turn_right": "turn-right", "turnright": "turn-right",
    "rotate left": "turn-left", "rotate-left": "turn-left",
    "rotate right": "turn-right", "rotate-right": "turn-right",
    "jump fwd": "jump-fwd", "jump_fwd": "jump-fwd", "jump forward": "jump-fwd",
    "lie up": "lie-up", "lie_up": "lie-up", "lieup": "lie-up",
    "lie side": "lie-side", "lie_side": "lie-side", "lieside": "lie-side",
    "hands up": "hands-up", "hands_up": "hands-up", "handsup": "hands-up",
    "thumbs up": "thumbs-up", "thumbs_up": "thumbs-up", "thumbsup": "thumbs-up",
    "front kick": "front-kick", "front_kick": "front-kick", "frontkick": "front-kick",
    "mr bean": "mr-bean", "mr_bean": "mr-bean", "mrbean": "mr-bean",
}


def _normalize_key(raw: str) -> str:
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

    if "missing" in obj and isinstance(obj["missing"], list):
        return {"missing": obj["missing"]}
    if obj.get("comeback"):
        return {"comeback": True}
    if "goto" in obj and isinstance(obj["goto"], dict):
        target = obj["goto"]
        try:
            return {"goto": {"x": float(target.get("x", 0)), "z": float(target.get("z", 0))}}
        except (ValueError, TypeError):
            return {"goto": {"x": 0, "z": 0}}

    logger.info("LLM raw: %s", {k: obj.get(k) for k in ("body", "arms", "face", "full")})

    cmd = {}
    full_val = _normalize_key(obj.get("full", ""))
    body_key = _normalize_key(obj.get("body", "idle"))
    if full_val and full_val in _VALID_FULL:
        cmd["full"] = full_val
    elif body_key in _VALID_FULL:
        cmd["full"] = body_key
    else:
        cmd["full"] = None
        arms_key = _normalize_key(obj.get("arms", "auto"))
        face_key = _normalize_key(obj.get("face", "auto"))
        cmd["body"] = body_key if body_key in _VALID_BODY else "idle"
        cmd["arms"] = arms_key if arms_key in _VALID_ARMS else "auto"
        cmd["face"] = face_key if face_key in _VALID_FACE else "auto"

    if obj.get("note"):
        cmd["note"] = str(obj["note"])[:60]
    if obj.get("say"):
        cmd["say"] = str(obj["say"])[:500]

    dur = obj.get("duration", 3)
    try:
        dur = max(1, min(10, int(dur)))
    except (ValueError, TypeError):
        dur = 3
    cmd["duration"] = dur
    return cmd


# ── Spatial awareness ─────────────────────────────────────────

_STAGE_BOUNDS = {"minX": -3, "maxX": 3, "minZ": -2, "maxZ": 3}


def _facing_label(radians: float) -> str:
    deg = math.degrees(radians) % 360
    if deg < 0:
        deg += 360
    if deg < 45 or deg >= 315:
        return "toward the audience"
    elif deg < 135:
        return "toward stage-left"
    elif deg < 225:
        return "away from the audience"
    else:
        return "toward stage-right"


def _position_label(x: float, z: float) -> str:
    parts = []
    if x < -1.5:
        parts.append("far stage-left")
    elif x < -0.5:
        parts.append("slightly left of center")
    elif x > 1.5:
        parts.append("far stage-right")
    elif x > 0.5:
        parts.append("slightly right of center")

    if z > 2:
        parts.append("very close to the audience")
    elif z > 1:
        parts.append("toward the front")
    elif z < -1:
        parts.append("near the back wall")
    elif z < 0:
        parts.append("slightly behind center")

    if not parts:
        parts.append("at center stage")
    return ", ".join(parts)


def _build_spatial_context(pos: dict | None, rot: float | None) -> str:
    if pos is None:
        return ""
    x = round(pos.get("x", 0), 1)
    z = round(pos.get("z", 0), 1)
    facing = _facing_label(rot or 0)
    where = _position_label(x, z)
    return (
        f"[SPATIAL CONTEXT]\n"
        f"Your coordinates: ({x}, {z}). Center: (0, 0). "
        f"Stage bounds: x=[{_STAGE_BOUNDS['minX']}, {_STAGE_BOUNDS['maxX']}], z=[{_STAGE_BOUNDS['minZ']}, {_STAGE_BOUNDS['maxZ']}].\n"
        f"Position: {where}. Facing: {facing}.\n"
    )


_CENTER_PATTERN = re.compile(
    r"\b(go\s+to|come\s+to|move\s+to|back\s+to|return\s+to|get\s+to|walk\s+to|run\s+to)?\s*"
    r"(the\s+)?(center|centre|middle|origin)\b",
    re.IGNORECASE,
)


def _detect_nav_command(prompt: str) -> dict | None:
    if _CENTER_PATTERN.search(prompt):
        return {"goto": {"x": 0, "z": 0}}
    return None


# ── LLM streaming providers ──────────────────────────────────

async def _stream_openai(messages: list[dict]):
    """Stream tokens from OpenAI Chat Completions API."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
        async with client.stream(
            "POST",
            OPENAI_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": OPENAI_MODEL, "messages": messages, "stream": True},
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"OpenAI returned {resp.status_code}: {error_body.decode()[:200]}")
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    token = chunk["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def _stream_ollama(messages: list[dict], model: str):
    """Stream tokens from Ollama /api/chat."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
        async with client.stream(
            "POST",
            OLLAMA_URL,
            json={"model": model, "messages": messages, "stream": True},
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"Ollama returned {resp.status_code}: {error_body.decode()[:200]}")
            async for raw_line in resp.aiter_lines():
                if not raw_line.strip():
                    continue
                try:
                    chunk = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue
                if chunk.get("done"):
                    return
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token


# ── Autopilot endpoint ────────────────────────────────────────

class AutopilotRequest(BaseModel):
    prompt: str = "Someone just opened the app and is seeing you for the first time. Greet them warmly and introduce yourself."
    session_id: str | None = None
    position: dict | None = None
    rotation: float | None = None


@app.post("/autopilot")
async def autopilot(req: AutopilotRequest):
    # Get or create conversation history
    session_id = req.session_id or "default"
    if session_id not in _conversations:
        _conversations[session_id] = []
    history = _conversations[session_id]

    # Build messages with history
    spatial = _build_spatial_context(req.position, req.rotation)
    user_content = spatial + req.prompt if spatial else req.prompt

    messages = [
        {"role": "system", "content": AUTOPILOT_SYSTEM_PROMPT},
        *history[-(MAX_HISTORY * 2):],  # last N turns (user+assistant pairs)
        {"role": "user", "content": user_content},
    ]

    async def stream_commands():
        # Deterministic nav detection (no LLM needed)
        nav = _detect_nav_command(req.prompt)
        if nav:
            yield json.dumps(nav) + "\n"

        try:
            # Choose provider: OpenAI if key is set, otherwise Ollama
            if OPENAI_API_KEY:
                token_source = _stream_openai(messages)
            else:
                token_source = _stream_ollama(messages, OLLAMA_MODEL)

            line_buffer = ""
            full_response = ""

            async for token in token_source:
                full_response += token
                line_buffer += token

                while "\n" in line_buffer:
                    line, line_buffer = line_buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    cmd = _try_parse_command(line)
                    if cmd:
                        yield json.dumps(cmd) + "\n"

            # Flush remaining buffer
            if line_buffer.strip():
                cmd = _try_parse_command(line_buffer.strip())
                if cmd:
                    yield json.dumps(cmd) + "\n"

            # Save to conversation history
            history.append({"role": "user", "content": req.prompt})
            history.append({"role": "assistant", "content": full_response})
            # Trim old history
            while len(history) > MAX_HISTORY * 2:
                history.pop(0)

        except httpx.ConnectError:
            provider = "OpenAI" if OPENAI_API_KEY else "Ollama"
            yield json.dumps({"error": f"Cannot connect to {provider}. Is it running?"}) + "\n"
        except httpx.ReadTimeout:
            yield json.dumps({"error": "LLM request timed out"}) + "\n"
        except RuntimeError as e:
            yield json.dumps({"error": str(e)}) + "\n"
        except Exception as e:
            logger.exception("Autopilot error")
            yield json.dumps({"error": str(e)}) + "\n"

        yield json.dumps({"done": True}) + "\n"

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
