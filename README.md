# Yedubudi

A virtual body for Large Language Models. Instead of chatting with a blank text interface, Yedubudi gives your LLM a 3D avatar that walks, gestures, emotes, and speaks — making AI interactions feel like conversations with a real character.

Built with Three.js, React, and FastAPI. Supports OpenAI GPT and local Ollama models.

## What It Does

You type (or soon, speak) to the avatar. An LLM interprets your message and controls the avatar's body in real time — choosing what to say, how to move, and what expressions to show. The avatar walks around a small stage, tells jokes, does kicks, waves hello, and remembers your conversation.

The LLM doesn't just generate text. It generates **movement sequences** — a stream of body commands that play out as animation. "Come closer and tell me a joke" becomes: walk forward, walk forward, start talking animation, speak via TTS, laugh.

## Meaningful Use Cases

- **AI Tutoring** — A virtual teacher that gestures while explaining concepts, walks to a whiteboard area, and reacts to student questions with appropriate body language
- **Accessibility** — A signing or gesturing avatar for users who benefit from visual communication alongside text
- **Customer Support** — An embodied AI agent that feels more human than a chatbot, with expressions that build trust
- **Therapy & Wellness** — A calming virtual companion that can sit, breathe, and guide exercises with its body
- **Language Learning** — An interactive conversation partner with visible mouth movements and gestures that reinforce vocabulary
- **Virtual Presentations** — An animated host for content delivery, product demos, or storytelling
- **Game NPCs** — LLM-driven characters with natural body language for games and virtual worlds

## Features

**Avatar**
- Composable animation: body, arms, face, and full-body override layers that mix freely
- Dual rendering: professional rigged 3D models (Mixamo) with automatic fallback to procedural primitives
- Layered animation blending — walk + wave simultaneously on a GLTF model
- Head/neck IK tracking that follows the mouse cursor
- Ground plane with soft shadows, loading screen with progress

**LLM Brain**
- OpenAI GPT-4o or local Ollama (llama3.2) — auto-selects based on API key
- Conversation memory that persists across messages within a session
- Spatial awareness — the LLM knows its position, facing direction, and stage boundaries
- Navigation system — "go to center", "come closer", pathfinding via step sequences
- Streaming responses — avatar starts moving as soon as the first command arrives

**Speech**
- Text-to-speech via Microsoft Edge TTS with emotion-based prosody
- Multiple voice options (male, female, accents)
- Speech timing synced to animation duration

## Animation Layers

| Layer | Options |
|-------|---------|
| **Body** | idle, walk, step (4 directions), turn left/right, jump, sit, lie down |
| **Arms** | auto, wave, hands up, thumbs up, peace, pointing, heart, talk |
| **Face** | auto, happy, angry, laughing, tired, sleeping, focused, talking |
| **Full Override** | twirl, front kick, roundhouse kick, Mr. Bean dance |

The LLM composes complex behaviors by chaining these: "celebrate" = jump + hands-up + happy. "Think about it" = sit + focused, then stand + talk + answer.

## Tech Stack

- **Frontend:** React 19 + Three.js (imperative) + Vite
- **Backend:** FastAPI + edge-tts + httpx (streaming LLM proxy)
- **LLM:** OpenAI API (GPT-4o) or Ollama (local, any model)
- **Animation:** THREE.AnimationMixer with dual-mixer layered blending, Mixamo-compatible skeleton

## Prerequisites

- Node.js >= 18
- Python >= 3.10
- One of:
  - An [OpenAI API key](https://platform.openai.com/api-keys) (recommended)
  - [Ollama](https://ollama.com) running locally with a model pulled (`ollama pull llama3.2`)

## Setup

```bash
# Clone
git clone https://github.com/jaggannadhan/yedubudi.git
cd yedubudi

# Frontend
make install

# Backend
make install-backend
```

### Configure LLM

```bash
# Copy the example and add your API key
cp backend/.env.example backend/.env
# Edit backend/.env and set OPENAI_API_KEY=sk-...
```

If no OpenAI key is set, the backend automatically falls back to Ollama at `localhost:11434`.

### Run

```bash
# Terminal 1 — backend (port 8765)
make run-backend

# Terminal 2 — frontend (port 5173)
make run
```

Open http://localhost:5173. The avatar loads, and you can chat with it via the side panel.

### 3D Model (Optional)

By default, the avatar uses procedural geometry (built from Three.js primitives). For a professional rigged model:

1. Go to [mixamo.com](https://www.mixamo.com)
2. Download a character as FBX → save as `frontend/public/models/character.fbx`
3. Download animations (see `frontend/public/models/README.md` for the full list) → save to `frontend/public/models/animations/`

The system auto-detects model files and switches rendering mode.

### Other Commands

```bash
make build     # Production build
make stop      # Kill running dev servers
make clean     # Remove dist/ and node_modules/
```

## Project Structure

```
yedubudi/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                        # Scene, animation loop, UI, autopilot
│   │   └── avatar/
│   │       ├── buildAvatar.js             # Procedural mesh construction (fallback)
│   │       ├── loadModel.js               # GLTF/FBX model loader
│   │       ├── animationManager.js        # Dual-mixer layered animation
│   │       ├── clipMap.js                 # Command → clip mapping, layer resolution
│   │       ├── constants.js               # Color palette
│   │       ├── resetDefaults.js           # Per-frame state reset
│   │       └── animations/
│   │           ├── body.js                # Body locomotion
│   │           ├── arms.js                # Arm gestures
│   │           ├── face.js                # Facial expressions
│   │           ├── full.js                # Full-body overrides
│   │           └── registry.js            # UI button metadata
│   └── public/models/                     # Mixamo model + animation files
├── backend/
│   ├── server.py                          # FastAPI: LLM proxy, TTS, config
│   ├── requirements.txt
│   └── .env.example
├── Makefile
└── README.md
```

## How It Works

1. User sends a message → frontend POSTs to `/api/autopilot` with prompt, position, and rotation
2. Backend prepends spatial context ("You are at (2, -1), facing stage-left") and conversation history
3. LLM streams JSON commands, one per line: `{"body":"step-front","arms":"wave","face":"happy","say":"Hello!","duration":3}`
4. Backend validates/normalizes each command and forwards to the frontend as NDJSON
5. Frontend queues commands and plays them sequentially — setting animation state, triggering TTS, interpolating position
6. In GLTF mode: `resolveClipLayers()` maps commands to body + upper-body clips, `AnimationManager` blends them with bone-masked dual mixers
7. In fallback mode: procedural animations compose via `resetDefaults → applyBody → applyArms → applyFace` each frame

## License

MIT
