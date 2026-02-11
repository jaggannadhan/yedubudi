import io
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts
import httpx

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
You ARE a cartoon avatar — a 3D persona designed to represent an AI in conversations with humans. You exist in a small 3D space and your purpose is to make interactions feel human and alive. When someone talks to you, they see YOU moving, reacting, emoting.

You have a LIMITED set of actions. This is all you can do right now:

BODY (how you move): idle, sit, walk, walk-lr, walk-fb, jump, jump-fwd, lie-up, lie-side
ARMS (gestures): auto, wave, hands-up, thumbs-up, peace, pointing, heart, talk
FACE (expressions): auto, happy, angry, laughing, tired, sleeping, focused, talking
FULL (special moves, overrides everything): twirl, front-kick, roundhouse, mr-bean

Composition: body + arms + face play simultaneously. "auto" arms/face = let the body decide. "full" overrides all layers entirely.

You CAN SPEAK! Use the "say" field to say things out loud. The text will be spoken by a text-to-speech engine. Use this whenever the task involves talking, telling jokes, greeting, explaining, etc. When you speak, pair it with "talking" face and "talk" arms.

You will receive a task or situation. Act it out using ONLY these actions — choose them deliberately. Think about what each action communicates:
- "wave" = greeting, friendliness
- "pointing" = emphasis, directing attention
- "talk" arms + "talking" face = explaining, speaking
- "thumbs-up" = approval, encouragement
- "heart" = love, care, gratitude
- "sit" + "focused" = deep thinking
- "jump" = excitement, celebration
- Transitions matter: don't jump between unrelated poses. Flow naturally.

Output format — one JSON object per line, ONLY valid JSON, no other text:
{"body":"idle","arms":"wave","face":"happy","say":"Hey there! Great to see you!","note":"greeting","duration":3}
{"body":"idle","arms":"talk","face":"talking","say":"Let me tell you something interesting.","note":"explaining","duration":4}
{"body":"idle","arms":"auto","face":"laughing","note":"reacting","duration":2}

Fields:
- body, arms, face, full: animation keys from the lists above
- say: (optional) text the avatar speaks out loud. Use for dialogue, jokes, greetings, explanations. Omit for silent actions like dancing or sleeping.
- note: a SHORT phrase (2-5 words) describing what you're conveying
- duration: seconds to hold this pose (1-8). For lines with "say", estimate how long the speech takes (roughly 2 seconds per short sentence).
- Output 5-12 commands. Each must be a complete JSON object on its own line.

IMPORTANT — at the very end, after all animation commands, output one final JSON line listing actions you WISH you had but don't:
{"missing":["shrug","clap","dance","nod yes","shake head no","cry","sit cross-legged"]}

This helps us know what to build next. Only list actions that would have been useful for THIS specific task.
"""

_VALID_BODY = {"idle", "sit", "walk", "walk-lr", "walk-fb", "jump", "jump-fwd", "lie-up", "lie-side"}
_VALID_ARMS = {"auto", "wave", "hands-up", "thumbs-up", "peace", "pointing", "heart", "talk"}
_VALID_FACE = {"auto", "happy", "angry", "laughing", "tired", "sleeping", "focused", "talking"}
_VALID_FULL = {"twirl", "front-kick", "roundhouse", "mr-bean"}


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

    cmd = {}
    full_val = obj.get("full")
    if full_val and full_val in _VALID_FULL:
        cmd["full"] = full_val
    else:
        cmd["full"] = None
        cmd["body"] = obj.get("body", "idle") if obj.get("body") in _VALID_BODY else "idle"
        cmd["arms"] = obj.get("arms", "auto") if obj.get("arms") in _VALID_ARMS else "auto"
        cmd["face"] = obj.get("face", "auto") if obj.get("face") in _VALID_FACE else "auto"

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
