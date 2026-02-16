/**
 * Maps our command names to Mixamo animation filenames.
 * Each key is what AnimationManager knows the clip as.
 * Each value is the filename in /models/animations/.
 */
export const CLIP_FILES = {
  // Body
  "idle":         "Idle.fbx",
  "walk":         "Walking.fbx",
  "sit":          "Sitting.fbx",
  "jump":         "Jump.fbx",
  "lie-up":       "Lying Down.fbx",
  "lie-side":     "Lying Down.fbx",
  "turn-left":    "Left Turn.fbx",
  "turn-right":   "Right Turn.fbx",

  // Arms / gestures
  "wave":         "Waving.fbx",
  "hands-up":     "Hands Up.fbx",
  "thumbs-up":    "Thumbs Up.fbx",
  "peace":        "Peace Sign.fbx",
  "pointing":     "Pointing.fbx",
  "heart":        "Blow Kiss.fbx",
  "talk":         "Talking.fbx",

  // Face / expressions
  "happy":        "Happy Idle.fbx",
  "angry":        "Angry.fbx",
  "laughing":     "Laughing.fbx",
  "tired":        "Yawning.fbx",
  "sleeping":     "Sleeping Idle.fbx",
  "focused":      "Thinking.fbx",
  "talking":      "Talking.fbx",

  // Full-body overrides
  "twirl":        "Spin.fbx",
  "front-kick":   "Front Kick.fbx",
  "roundhouse":   "Roundhouse Kick.fbx",
  "mr-bean":      "Silly Dancing.fbx",
};

const STEP_BODIES = new Set([
  "step-front", "step-back", "step-left", "step-right",
]);
const TURN_BODIES = new Set(["turn-left", "turn-right"]);

const ONE_SHOT = new Set([
  "jump", "front-kick", "roundhouse", "twirl",
  "wave", "thumbs-up", "peace", "pointing", "heart", "tired",
]);

/**
 * Resolves a multi-layer LLM command to a single clip name.
 * Priority: full > step/turn > arms gesture > face expression > body > idle
 */
export function resolveClipName({ body, arms, face, full }) {
  if (full) return full;
  if (STEP_BODIES.has(body)) return "walk";
  if (TURN_BODIES.has(body)) return body;
  if (body === "idle" && arms && arms !== "auto") return arms;
  if (body === "idle" && (!arms || arms === "auto") && face && face !== "auto") return face;
  if (body && body !== "idle") return body;
  return "idle";
}

/**
 * Resolves multi-layer LLM command to separate body and upper-body clips.
 * Allows walking + waving simultaneously instead of picking one.
 *
 * When body is idle with an overlay, promotes the overlay to full body
 * (a dedicated wave/happy clip looks better than layering on idle).
 */
export function resolveClipLayers({ body, arms, face, full }) {
  if (full) return { bodyClip: full, upperClip: null };

  let bodyClip = "idle";
  if (STEP_BODIES.has(body)) bodyClip = "walk";
  else if (TURN_BODIES.has(body)) bodyClip = body;
  else if (body && body !== "idle") bodyClip = body;

  // Upper body overlay: arms gestures take priority over face expressions
  let upperClip = null;
  if (arms && arms !== "auto") upperClip = arms;
  else if (face && face !== "auto") upperClip = face;

  // If body is idle with an overlay, play the overlay full-body instead
  if (bodyClip === "idle" && upperClip) {
    return { bodyClip: upperClip, upperClip: null };
  }

  return { bodyClip, upperClip };
}

/**
 * Returns true if the clip should loop, false for one-shot playback.
 */
export function shouldLoop(clipName) {
  return !ONE_SHOT.has(clipName);
}
