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

const MAX_VARIANTS = 20; // safety cap

/**
 * Check if a file actually exists (not Vite's SPA fallback).
 * Vite returns 200 + text/html for missing files, so we check Content-Type.
 */
async function fileExists(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) return false;
  const ct = res.headers.get("content-type") || "";
  // Real FBX/GLB files won't be text/html — that's Vite's SPA fallback
  return !ct.startsWith("text/html");
}

/**
 * Probe for numbered variant files: "Name 1.fbx", "Name 2.fbx", ...
 * Stops at the first missing number. Returns an array of paths that exist.
 */
async function discoverVariants(baseName) {
  const ext = baseName.split(".").pop();
  const stem = baseName.slice(0, -(ext.length + 1)); // "Talking" from "Talking.fbx"
  const variants = [];

  // Check the base file first (e.g. "Talking.fbx")
  if (await fileExists(ANIM_DIR + baseName)) variants.push(baseName);

  // Probe numbered variants: "Talking 1.fbx", "Talking 2.fbx", ...
  for (let i = 1; i <= MAX_VARIANTS; i++) {
    const variantName = `${stem} ${i}.${ext}`;
    if (!(await fileExists(ANIM_DIR + variantName))) break;
    variants.push(variantName);
  }

  return variants;
}

/**
 * Load a single animation file and return the first clip.
 */
async function loadSingleClip(fileName, fbxLoader, gltfLoader) {
  const path = ANIM_DIR + fileName;
  const ext = fileName.split(".").pop().toLowerCase();

  if (ext === "fbx") {
    const fbx = await fbxLoader.loadAsync(path);
    return fbx.animations[0];
  } else {
    const gltf = await gltfLoader.loadAsync(path);
    return gltf.animations[0];
  }
}

/**
 * Load individual animation clips from separate FBX/GLB files.
 * Auto-discovers numbered variants (e.g. "Talking 1.fbx", "Talking 2.fbx").
 *
 * @param {THREE.AnimationMixer} mixer
 * @param {Record<string, string>} clipFiles - { commandName: "Filename.fbx" }
 * @returns {Record<string, THREE.AnimationClip[]>} arrays of variant clips keyed by command name
 */
export async function loadAnimationClips(mixer, clipFiles) {
  const loaded = {};
  const fbxLoader = new FBXLoader();
  const gltfLoader = new GLTFLoader();

  // Deduplicate base filenames (e.g. "talk" and "talking" both map to "Talking.fbx")
  const fileToCommands = {};
  for (const [cmd, fileName] of Object.entries(clipFiles)) {
    if (!fileToCommands[fileName]) fileToCommands[fileName] = [];
    fileToCommands[fileName].push(cmd);
  }

  // Discover all variants for each unique base file
  const discoveryResults = await Promise.allSettled(
    Object.keys(fileToCommands).map(async (baseName) => {
      const variants = await discoverVariants(baseName);
      return { baseName, variants };
    })
  );

  // Build a flat list of all files to load
  const filesToLoad = new Set();
  const fileVariantMap = {}; // baseName → variant filenames[]
  for (const result of discoveryResults) {
    if (result.status === "fulfilled") {
      const { baseName, variants } = result.value;
      fileVariantMap[baseName] = variants;
      for (const v of variants) filesToLoad.add(v);
    }
  }

  // Load all unique files in parallel
  const clipCache = {};
  const loadResults = await Promise.allSettled(
    [...filesToLoad].map(async (fileName) => {
      const clip = await loadSingleClip(fileName, fbxLoader, gltfLoader);
      if (!clip) throw new Error("No animation data in " + fileName);
      return { fileName, clip };
    })
  );

  for (const result of loadResults) {
    if (result.status === "fulfilled") {
      clipCache[result.value.fileName] = result.value.clip;
    } else {
      console.warn("[loadAnimationClips]", result.reason?.message);
    }
  }

  // Map command names to their variant clip arrays
  let totalVariants = 0;
  for (const [baseName, commands] of Object.entries(fileToCommands)) {
    const variantFiles = fileVariantMap[baseName] || [];
    const clips = variantFiles
      .map((f) => clipCache[f])
      .filter(Boolean)
      .map((clip, i) => {
        const c = clip.clone();
        c.name = `${commands[0]}_v${i}`;
        return c;
      });

    if (clips.length > 0) {
      for (const cmd of commands) {
        loaded[cmd] = clips;
      }
      totalVariants += clips.length;
    }
  }

  const cmdCount = Object.keys(loaded).length;
  console.log(
    `[loadAnimationClips] Loaded ${cmdCount} commands, ${totalVariants} total variants`
  );
  return loaded;
}
