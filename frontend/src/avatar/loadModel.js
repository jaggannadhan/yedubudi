import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { buildAvatar } from "./buildAvatar";

const MODEL_PATH = "/models/character.fbx";
const ANIM_DIR = "/models/animations/";

/**
 * Load a GLTF/FBX character model.
 * Falls back to primitive buildAvatar() if model file is not found.
 *
 * @returns {{ model, mixer, clips, useFallback: false } | { avatar, parts, useFallback: true }}
 */
export async function loadModel() {
  try {
    // Check if model file exists before attempting full load
    const probe = await fetch(MODEL_PATH, { method: "HEAD" });
    if (!probe.ok) throw new Error("Model file not found at " + MODEL_PATH);

    const ext = MODEL_PATH.split(".").pop().toLowerCase();
    let model, animations;

    if (ext === "glb" || ext === "gltf") {
      const gltf = await new GLTFLoader().loadAsync(MODEL_PATH);
      model = gltf.scene;
      animations = gltf.animations;
    } else {
      model = await new FBXLoader().loadAsync(MODEL_PATH);
      animations = model.animations;
    }

    // Mixamo models are in centimeters — scale to match our world units
    model.scale.setScalar(0.01);

    // Enable shadows on all meshes
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Create mixer and register embedded clips
    const mixer = new THREE.AnimationMixer(model);
    const clips = {};
    for (const clip of animations) {
      clips[clip.name] = clip;
    }

    console.log("[loadModel] GLTF model loaded successfully");
    return { model, mixer, clips, useFallback: false };
  } catch (err) {
    console.warn("[loadModel] Falling back to primitive avatar:", err.message);
    const { avatar, parts } = buildAvatar();
    return { avatar, parts, useFallback: true };
  }
}

/**
 * Load individual animation clips from separate FBX/GLB files.
 * Mixamo exports one animation per file.
 *
 * @param {THREE.AnimationMixer} mixer
 * @param {Record<string, string>} clipFiles - { commandName: "Filename.fbx" }
 * @returns {Record<string, THREE.AnimationClip>} loaded clips keyed by command name
 */
export async function loadAnimationClips(mixer, clipFiles) {
  const loaded = {};
  const fbxLoader = new FBXLoader();
  const gltfLoader = new GLTFLoader();

  const entries = Object.entries(clipFiles);
  // Load all clips in parallel for speed
  const results = await Promise.allSettled(
    entries.map(async ([commandName, fileName]) => {
      const path = ANIM_DIR + fileName;
      const ext = fileName.split(".").pop().toLowerCase();
      let clip;

      if (ext === "fbx") {
        const fbx = await fbxLoader.loadAsync(path);
        clip = fbx.animations[0];
      } else {
        const gltf = await gltfLoader.loadAsync(path);
        clip = gltf.animations[0];
      }

      if (clip) {
        clip.name = commandName;
        return { commandName, clip };
      }
      throw new Error("No animation data in " + fileName);
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { commandName, clip } = result.value;
      loaded[commandName] = clip;
    } else {
      console.warn("[loadAnimationClips]", result.reason?.message);
    }
  }

  console.log(
    `[loadAnimationClips] Loaded ${Object.keys(loaded).length}/${entries.length} clips`
  );
  return loaded;
}
