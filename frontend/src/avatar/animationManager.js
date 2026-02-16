import * as THREE from "three";

const DEFAULT_CROSSFADE = 0.3; // seconds

// Mixamo upper-body bone names (spine, arms, head + fingers)
const UPPER_BONE_NAMES = new Set([
  "mixamorigSpine", "mixamorigSpine1", "mixamorigSpine2",
  "mixamorigNeck", "mixamorigHead", "mixamorigHeadTop_End",
  "mixamorigLeftShoulder", "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand",
  "mixamorigLeftHandThumb1", "mixamorigLeftHandThumb2", "mixamorigLeftHandThumb3",
  "mixamorigLeftHandIndex1", "mixamorigLeftHandIndex2", "mixamorigLeftHandIndex3",
  "mixamorigLeftHandMiddle1", "mixamorigLeftHandMiddle2", "mixamorigLeftHandMiddle3",
  "mixamorigLeftHandRing1", "mixamorigLeftHandRing2", "mixamorigLeftHandRing3",
  "mixamorigLeftHandPinky1", "mixamorigLeftHandPinky2", "mixamorigLeftHandPinky3",
  "mixamorigRightShoulder", "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand",
  "mixamorigRightHandThumb1", "mixamorigRightHandThumb2", "mixamorigRightHandThumb3",
  "mixamorigRightHandIndex1", "mixamorigRightHandIndex2", "mixamorigRightHandIndex3",
  "mixamorigRightHandMiddle1", "mixamorigRightHandMiddle2", "mixamorigRightHandMiddle3",
  "mixamorigRightHandRing1", "mixamorigRightHandRing2", "mixamorigRightHandRing3",
  "mixamorigRightHandPinky1", "mixamorigRightHandPinky2", "mixamorigRightHandPinky3",
]);

// Reusable quaternion to avoid per-frame allocations
const _quat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class AnimationManager {
  /**
   * @param {THREE.Object3D} model - The loaded 3D model
   * @param {THREE.AnimationMixer} mixer - Primary mixer for body animations
   */
  constructor(model, mixer) {
    this.model = model;
    this.clips = {};

    // Primary mixer: body / full-body animations
    this.bodyMixer = mixer;
    this.bodyActions = {};
    this.currentBodyAction = null;
    this.currentBodyName = null;

    // Secondary mixer: upper-body overlay (arms, gestures)
    this.upperMixer = new THREE.AnimationMixer(model);
    this.upperActions = {};
    this.currentUpperAction = null;
    this.currentUpperName = null;

    // Bone references
    this._headBone = null;
    this._neckBone = null;
    this._hasLayers = false;
    this._lowerSnapshot = []; // pre-allocated snapshot storage

    this._initBones();
  }

  /** Discover Mixamo bones and build layer groups */
  _initBones() {
    const lowerBones = [];
    this.model.traverse((child) => {
      if (!child.isBone) return;
      if (child.name === "mixamorigHead") this._headBone = child;
      else if (child.name === "mixamorigNeck") this._neckBone = child;
      if (!UPPER_BONE_NAMES.has(child.name)) {
        lowerBones.push(child);
      }
    });
    this._hasLayers = lowerBones.length > 0;
    // Pre-allocate snapshot storage (no per-frame allocations)
    this._lowerSnapshot = lowerBones.map((bone) => ({
      bone,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }));
    if (this._hasLayers) {
      console.log(`[AnimationManager] Layered mode: ${lowerBones.length} lower-body bones`);
    }
  }

  /** Register a clip by command name (on both mixers) */
  addClip(name, clip) {
    this.clips[name] = clip;

    const bodyAction = this.bodyMixer.clipAction(clip);
    bodyAction.enabled = true;
    bodyAction.setEffectiveTimeScale(1);
    bodyAction.setEffectiveWeight(0);
    this.bodyActions[name] = bodyAction;

    const upperAction = this.upperMixer.clipAction(clip);
    upperAction.enabled = true;
    upperAction.setEffectiveTimeScale(1);
    upperAction.setEffectiveWeight(0);
    this.upperActions[name] = upperAction;
  }

  /** Register multiple clips at once */
  addClips(clipMap) {
    for (const [name, clip] of Object.entries(clipMap)) {
      this.addClip(name, clip);
    }
  }

  // ── Playback ──────────────────────────────────────────────

  /** Play on the body layer (lower body, or full body when no upper overlay) */
  playBody(name, { loop = true, crossfade = DEFAULT_CROSSFADE } = {}) {
    if (name === this.currentBodyName) return;
    const next = this.bodyActions[name];
    if (!next) { console.warn(`[AnimationManager] No clip: "${name}"`); return; }

    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.reset().setEffectiveWeight(1).play();
    if (this.currentBodyAction) this.currentBodyAction.crossFadeTo(next, crossfade, true);
    this.currentBodyAction = next;
    this.currentBodyName = name;
  }

  /** Play on the upper body layer (spine, arms, head) */
  playUpper(name, { loop = true, crossfade = DEFAULT_CROSSFADE } = {}) {
    if (!this._hasLayers) { this.playBody(name, { loop, crossfade }); return; }
    if (name === this.currentUpperName) return;
    const next = this.upperActions[name];
    if (!next) { console.warn(`[AnimationManager] No clip: "${name}"`); return; }

    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.reset().setEffectiveWeight(1).play();
    if (this.currentUpperAction) this.currentUpperAction.crossFadeTo(next, crossfade, true);
    this.currentUpperAction = next;
    this.currentUpperName = name;
  }

  /** Stop the upper body overlay */
  clearUpper() {
    if (this.currentUpperAction) {
      this.currentUpperAction.fadeOut(DEFAULT_CROSSFADE);
    }
    this.currentUpperAction = null;
    this.currentUpperName = null;
  }

  /** Full-body play (body + clear upper) — for full overrides and simple mode */
  play(name, opts) {
    this.clearUpper();
    this.playBody(name, opts);
  }

  // ── Update ────────────────────────────────────────────────

  /** Save lower-body bone transforms into pre-allocated storage */
  _saveLower() {
    for (const entry of this._lowerSnapshot) {
      entry.pos.copy(entry.bone.position);
      entry.quat.copy(entry.bone.quaternion);
      entry.scale.copy(entry.bone.scale);
    }
  }

  /** Restore lower-body bone transforms from storage */
  _restoreLower() {
    for (const entry of this._lowerSnapshot) {
      entry.bone.position.copy(entry.pos);
      entry.bone.quaternion.copy(entry.quat);
      entry.bone.scale.copy(entry.scale);
    }
  }

  /** Advance animation — call once per frame */
  update(delta) {
    // 1. Update body mixer (sets ALL bones to body animation pose)
    this.bodyMixer.update(delta);

    // 2. If upper overlay is active, blend it onto upper body only
    if (this.currentUpperAction && this._hasLayers) {
      this._saveLower();           // snapshot lower-body bones
      this.upperMixer.update(delta); // overwrites ALL bones with upper clip
      this._restoreLower();        // restore lower-body → body anim kept on legs
    }
  }

  /**
   * Apply look-at head tracking after animation update.
   * Multiplies a yaw rotation onto neck (40%) and head (60%) bones.
   * @param {number} mouseX - normalized -1..1
   */
  applyLookAt(mouseX) {
    const maxYaw = Math.PI * 0.25; // 45° max
    const yaw = mouseX * maxYaw;

    if (this._neckBone) {
      _quat.setFromAxisAngle(_yAxis, yaw * 0.4);
      this._neckBone.quaternion.multiply(_quat);
    }
    if (this._headBone) {
      _quat.setFromAxisAngle(_yAxis, yaw * 0.6);
      this._headBone.quaternion.multiply(_quat);
    }
  }

  // ── Queries ───────────────────────────────────────────────

  isFinished() {
    if (!this.currentBodyAction) return true;
    return (
      this.currentBodyAction.loop === THREE.LoopOnce &&
      this.currentBodyAction.time >= this.currentBodyAction.getClip().duration
    );
  }

  hasClip(name) { return name in this.clips; }

  dispose() {
    this.bodyMixer.stopAllAction();
    this.upperMixer.stopAllAction();
  }
}
