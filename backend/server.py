import io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
