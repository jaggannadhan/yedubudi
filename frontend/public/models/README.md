# Mixamo Model Setup

## 1. Download Character

1. Go to [mixamo.com](https://www.mixamo.com) (free Adobe account required)
2. Pick a character (e.g., "X Bot", "Y Bot", or upload your own)
3. Download: Format **FBX Binary**, **With Skin**
4. Save as `character.fbx` in this directory

## 2. Download Animations

For each animation below:
1. Search the name on Mixamo
2. Select it and click Download
3. Settings: **Without Skin**, **FBX Binary**, **30 FPS**, check **In Place** for locomotion clips
4. Save to the `animations/` subdirectory with the filename listed

| Command | Search Term | Filename |
|---------|------------|----------|
| idle | Breathing Idle | `Idle.fbx` |
| walk | Walking | `Walking.fbx` |
| sit | Sitting | `Sitting.fbx` |
| jump | Jump | `Jump.fbx` |
| lie-up | Lying Down Idle | `Lying Down.fbx` |
| turn-left | Left Turn | `Left Turn.fbx` |
| turn-right | Right Turn | `Right Turn.fbx` |
| wave | Waving | `Waving.fbx` |
| hands-up | Victory Idle | `Hands Up.fbx` |
| thumbs-up | Thumbs Up | `Thumbs Up.fbx` |
| peace | Waving (variant) | `Peace Sign.fbx` |
| pointing | Pointing | `Pointing.fbx` |
| heart | Blow A Kiss | `Blow Kiss.fbx` |
| talk | Talking | `Talking.fbx` |
| happy | Happy Idle | `Happy Idle.fbx` |
| angry | Angry | `Angry.fbx` |
| laughing | Laughing | `Laughing.fbx` |
| tired | Yawning | `Yawning.fbx` |
| sleeping | Sleeping Idle | `Sleeping Idle.fbx` |
| focused | Thinking | `Thinking.fbx` |
| twirl | Spin | `Spin.fbx` |
| front-kick | Front Kick | `Front Kick.fbx` |
| roundhouse | Roundhouse Kick | `Roundhouse Kick.fbx` |
| mr-bean | Silly Dancing | `Silly Dancing.fbx` |

**Important**: Use the SAME character for all animation downloads to ensure consistent bone naming.

## Directory Structure

```
models/
  character.fbx
  animations/
    Idle.fbx
    Walking.fbx
    ... (all clips above)
```
