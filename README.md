# Yedubudi

A procedural 3D cartoon avatar built with Three.js and React, designed to give a visual persona to LLM models. Instead of chatting with a blank text interface, conversations with an LLM can feel like talking to a real character — one that walks, waves, laughs, and reacts.

The avatar features a **composable animation system** where body movements, arm gestures, and facial expressions are independent layers that can be mixed freely. Walk + wave + angry face? Sit + heart + happy? Any combination works.

## Animation Layers

| Layer | Options |
|-------|---------|
| **Body** | idle, walk, walk left-right, walk front-back, jump, jump forward, sit, lie face-up, lie sideways |
| **Arms** | auto, wave, hands up, thumbs up, peace sign, pointing, heart, talk gestures |
| **Face** | auto, happy, angry, laughing, tired, sleeping, focused, talking |
| **Full Override** | twirl, front kick, roundhouse kick, Mr. Bean dance |

- **Auto** mode for arms/face inherits whatever the active body animation provides (e.g., walk includes arm swing by default)
- **Full Override** takes control of the entire body, dimming the other layer controls

## Tech Stack

- **Frontend:** React 19 + Three.js (imperative, not React Three Fiber) + Vite
- **Backend:** FastAPI + edge-tts (text-to-speech with emotion-based prosody)
- **Styling:** Inline styles with Fredoka font, dark radial gradient background

## Prerequisites

- Node.js >= 18
- Python >= 3.10 (for the TTS backend)

## Setup

```bash
# Clone the repo
git clone https://github.com/jaggannadhan/yedubudi.git
cd yedubudi

# Install frontend dependencies
make install

# Run the frontend dev server (default port 5173)
make run
```

### TTS Backend (optional)

The backend provides text-to-speech via Microsoft Edge TTS:

```bash
# Install Python dependencies
make install-tts

# Run the TTS server (port 8765)
make run-tts
```

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
│   │   ├── App.jsx                        # Scene, animation loop, UI
│   │   ├── main.jsx                       # React entry point
│   │   └── avatar/
│   │       ├── constants.js               # Shared color palette
│   │       ├── buildAvatar.js             # Procedural mesh construction
│   │       ├── resetDefaults.js           # Per-frame state reset
│   │       └── animations/
│   │           ├── body.js                # Body locomotion (walk, jump, sit, etc.)
│   │           ├── arms.js                # Arm gestures (wave, peace, heart, etc.)
│   │           ├── face.js                # Facial expressions (happy, angry, etc.)
│   │           ├── full.js                # Full-body overrides (twirl, kicks, etc.)
│   │           └── registry.js            # Animation option metadata
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── server.py                          # FastAPI TTS server
│   └── requirements.txt
├── Makefile
└── README.md
```

## How It Works

Each animation frame follows this pipeline:

1. **Reset** all parts to default pose
2. **Breathing** (universal, rate varies by expression)
3. **Head bob** (skipped for tired/sleeping)
4. If a **Full Override** is active, it controls everything
5. Otherwise, layers compose in order: **Body** → **Arms** → **Face**
6. **Rotation** (auto-spin or mouse tracking, skipped for directional animations)

The arms layer resets arm rotations before applying, so explicit arm gestures cleanly override the body animation's default arm movement.

## License

MIT
