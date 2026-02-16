import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { COLORS } from "./avatar/constants";
import { buildAvatar } from "./avatar/buildAvatar";
import { resetDefaults } from "./avatar/resetDefaults";
import { applyBody, BODY_SELF_ROTATING } from "./avatar/animations/body";
import { applyArms } from "./avatar/animations/arms";
import { applyFace } from "./avatar/animations/face";
import { applyFull, FULL_SELF_ROTATING } from "./avatar/animations/full";
import { bodyOptions, armOptions, faceOptions, fullOptions } from "./avatar/animations/registry";
import { loadModel, loadAnimationClips } from "./avatar/loadModel";
import { AnimationManager } from "./avatar/animationManager";
import { CLIP_FILES, resolveClipLayers, shouldLoop } from "./avatar/clipMap";

export default function App() {
  const mountRef = useRef(null);
  const posDisplayRef = useRef(null);
  const [rotating, setRotating] = useState(false);

  // Layer states
  const [body, setBody] = useState("idle");
  const [arms, setArms] = useState("auto");
  const [face, setFace] = useState("auto");
  const [full, setFull] = useState(null);

  // Autopilot (LLM brain)
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState("");
  const [missingActions, setMissingActions] = useState([]);
  const [promptInput, setPromptInput] = useState("");
  const [llmLog, setLlmLog] = useState([]);
  const autopilotQueueRef = useRef([]);
  const abortRef = useRef(null);
  const schedulerRef = useRef(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const [llmProvider, setLlmProvider] = useState("");

  // Refs for animation loop (avoids scene rebuild)
  const bodyRef = useRef("idle");
  const armRef = useRef("auto");
  const faceRef = useRef("auto");
  const fullRef = useRef(null);
  const rotatingRef = useRef(false);

  // Step movement system
  const STEP_BODIES = new Set(["step-front", "step-back", "step-left", "step-right"]);
  const STEP_SIZE = 1.0;
  const STEP_BOUNDS = { minX: -3, maxX: 3, minZ: -2, maxZ: 3 };
  // Local-space step directions (rotated by avatarRotRef to get world-space)
  const LOCAL_STEP_DIRS = {
    "step-front": { x: 0, z: STEP_SIZE },
    "step-back": { x: 0, z: -STEP_SIZE },
    "step-left": { x: -STEP_SIZE, z: 0 },
    "step-right": { x: STEP_SIZE, z: 0 },
  };
  const avatarPosRef = useRef({ x: 0, z: 0 });
  const promptStartPosRef = useRef({ x: 0, z: 0 });
  const stepFromRef = useRef({ x: 0, z: 0 });
  const stepToRef = useRef({ x: 0, z: 0 });
  const bodyStartRef = useRef(performance.now());
  const bodyDurationRef = useRef(1000);
  const nextStepDurationRef = useRef(1000);

  // Turn system
  const TURN_BODIES = new Set(["turn-left", "turn-right"]);
  const TURN_AMOUNT = Math.PI / 2; // 90 degrees per turn
  const avatarRotRef = useRef(0);
  const turnFromRef = useRef(0);
  const turnToRef = useRef(0);

  const setupStep = (key) => {
    const local = LOCAL_STEP_DIRS[key];
    if (!local) return;
    // Rotate local direction by avatar's current facing angle
    const rot = avatarRotRef.current;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const worldX = local.x * c + local.z * s;
    const worldZ = -local.x * s + local.z * c;
    const from = { ...avatarPosRef.current };
    const to = {
      x: Math.max(STEP_BOUNDS.minX, Math.min(STEP_BOUNDS.maxX, from.x + worldX)),
      z: Math.max(STEP_BOUNDS.minZ, Math.min(STEP_BOUNDS.maxZ, from.z + worldZ)),
    };
    stepFromRef.current = from;
    stepToRef.current = to;
  };

  const setupTurn = (key) => {
    turnFromRef.current = avatarRotRef.current;
    turnToRef.current = avatarRotRef.current + (key === "turn-left" ? TURN_AMOUNT : -TURN_AMOUNT);
  };

  useEffect(() => {
    bodyRef.current = body;
    bodyStartRef.current = performance.now();
    if (STEP_BODIES.has(body)) {
      bodyDurationRef.current = nextStepDurationRef.current;
      nextStepDurationRef.current = 1000;
      setupStep(body);
    } else if (TURN_BODIES.has(body)) {
      bodyDurationRef.current = 600;
      setupTurn(body);
    } else if (body === "jump") {
      bodyDurationRef.current = 800;
    } else if (body === "jump-fwd") {
      bodyDurationRef.current = 2000;
    }
  }, [body]);
  useEffect(() => { armRef.current = arms; }, [arms]);
  useEffect(() => { faceRef.current = face; }, [face]);
  useEffect(() => { fullRef.current = full; }, [full]);
  useEffect(() => { rotatingRef.current = rotating; }, [rotating]);

  // Fetch backend config (which LLM provider is active)
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => {
      setLlmProvider(`${c.provider}/${c.model}`);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    // === Scene ===
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40, container.clientWidth / container.clientHeight, 0.1, 100
    );
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // === Lights ===
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x6688ff, 0.5);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    // === Ground plane ===
    const groundGeo = new THREE.CircleGeometry(4, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // === Avatar (async — supports GLTF model or primitive fallback) ===
    let avatar = null;
    let P = null;           // parts dict (fallback mode only)
    let animMgr = null;     // AnimationManager (GLTF mode only)
    let useFallback = false;
    let modelReady = false;

    const initModel = async () => {
      setLoadingMsg("Loading model...");
      const result = await loadModel();
      if (result.useFallback) {
        useFallback = true;
        avatar = result.avatar;
        P = result.parts;
      } else {
        useFallback = false;
        avatar = result.model;
        animMgr = new AnimationManager(result.model, result.mixer);
        // Register any clips embedded in the base model
        for (const [name, clip] of Object.entries(result.clips)) {
          animMgr.addClip(name, clip);
        }
        // Load individual animation clips from files
        setLoadingMsg("Loading animations...");
        const clips = await loadAnimationClips(result.mixer, CLIP_FILES);
        animMgr.addClips(clips);
        animMgr.play("idle");
      }
      scene.add(avatar);
      modelReady = true;
      setLoading(false);
    };
    initModel();

    // === Mouse tracking ===
    let mouseX = 0;
    const onMouse = (e) => {
      const r = container.getBoundingClientRect();
      mouseX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    };
    const onMouseLeave = () => { mouseX = 0; };
    container.addEventListener("mousemove", onMouse);
    container.addEventListener("mouseleave", onMouseLeave);

    // === Animation loop ===
    let frame;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);

      if (!modelReady) {
        renderer.render(scene, camera);
        return;
      }

      const delta = clock.getDelta();
      const t = clock.elapsedTime;
      const cb = bodyRef.current;
      const ca = armRef.current;
      const cf = faceRef.current;
      const fo = fullRef.current;

      // ── Body animation progress (shared by both modes) ──
      const bodyProgress = Math.min(1, (performance.now() - bodyStartRef.current) / bodyDurationRef.current);

      if (useFallback) {
        // ═══════════ PRIMITIVE AVATAR MODE (original code) ═══════════
        resetDefaults(P, avatar);
        avatar.position.x = avatarPosRef.current.x;
        avatar.position.z = avatarPosRef.current.z;

        const isStep = STEP_BODIES.has(cb);
        if (isStep) {
          if (bodyProgress >= 1) {
            avatarPosRef.current = { ...stepToRef.current };
            avatar.position.x = stepToRef.current.x;
            avatar.position.z = stepToRef.current.z;
          } else {
            const eased = bodyProgress * bodyProgress * (3 - 2 * bodyProgress);
            avatar.position.x = stepFromRef.current.x + (stepToRef.current.x - stepFromRef.current.x) * eased;
            avatar.position.z = stepFromRef.current.z + (stepToRef.current.z - stepFromRef.current.z) * eased;
          }
        }

        const breathRate = cf === "sleeping" ? 1 : cf === "tired" ? 1.2 : 2;
        const breathAmp = cf === "tired" ? 0.03 : 0.02;
        P.torso.scale.x = 1 + Math.sin(t * breathRate) * breathAmp;
        P.torso.scale.z = 1 + Math.sin(t * breathRate) * breathAmp;

        if (fo) {
          applyFull(fo, P, avatar, t);
        } else {
          if (cf !== "sleeping" && cf !== "tired") {
            P.headGroup.position.y += Math.sin(t * 2) * 0.015;
            P.headGroup.rotation.z = Math.sin(t * 1.5) * 0.03;
          }
          applyBody(cb, P, avatar, t, bodyProgress);
          applyArms(ca, P, t);
          applyFace(cf, P, t);
        }
        // Head tracking (fallback mode) — subtle head turn toward mouse
        if (!fo && cf !== "sleeping") {
          P.headGroup.rotation.y += mouseX * 0.3;
        }
      } else {
        // ═══════════ GLTF MODEL MODE ═══════════
        // 1. Resolve command layers to body + upper-body clips
        const { bodyClip, upperClip } = resolveClipLayers({ body: cb, arms: ca, face: cf, full: fo });
        if (upperClip) {
          animMgr.playBody(bodyClip, { loop: shouldLoop(bodyClip) });
          animMgr.playUpper(upperClip, { loop: shouldLoop(upperClip) });
        } else {
          animMgr.play(bodyClip, { loop: shouldLoop(bodyClip) });
        }

        // 2. Advance mixers (body + upper overlay blending)
        animMgr.update(delta);

        // 3. Head tracking — applied after animation update
        animMgr.applyLookAt(mouseX);

        // 4. World-space position (step interpolation)
        avatar.position.x = avatarPosRef.current.x;
        avatar.position.z = avatarPosRef.current.z;

        const isStep = STEP_BODIES.has(cb);
        if (isStep) {
          if (bodyProgress >= 1) {
            avatarPosRef.current = { ...stepToRef.current };
            avatar.position.x = stepToRef.current.x;
            avatar.position.z = stepToRef.current.z;
          } else {
            const eased = bodyProgress * bodyProgress * (3 - 2 * bodyProgress);
            avatar.position.x = stepFromRef.current.x + (stepToRef.current.x - stepFromRef.current.x) * eased;
            avatar.position.z = stepFromRef.current.z + (stepToRef.current.z - stepFromRef.current.z) * eased;
          }
        }
      }

      // ── Rotation (shared by both modes) ──
      const activePose = fo || cb;
      const isSelfRot = BODY_SELF_ROTATING.has(activePose) || FULL_SELF_ROTATING.has(activePose);
      const isTurn = TURN_BODIES.has(cb) && !fo;
      if (isTurn) {
        if (bodyProgress >= 1) {
          avatarRotRef.current = turnToRef.current;
          avatar.rotation.y = turnToRef.current;
        } else {
          const eased = bodyProgress * bodyProgress * (3 - 2 * bodyProgress);
          avatar.rotation.y = turnFromRef.current + (turnToRef.current - turnFromRef.current) * eased;
        }
      } else if (!isSelfRot) {
        if (rotatingRef.current) {
          avatar.rotation.y += 0.008;
        } else {
          const mouseInfluence = useFallback ? 0.5 : 0.15;
          const targetRot = avatarRotRef.current + mouseX * Math.PI * mouseInfluence;
          avatar.rotation.y += (targetRot - avatar.rotation.y) * 0.05;
        }
      }

      // ── Update live position display ──
      if (posDisplayRef.current) {
        const px = avatar.position.x.toFixed(1);
        const pz = avatar.position.z.toFixed(1);
        const deg = Math.round(((avatar.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
        posDisplayRef.current.textContent = `pos: (${px}, ${pz})  rot: ${deg}°`;
      }

      renderer.render(scene, camera);
    };
    animate();

    // === Resize ===
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousemove", onMouse);
      container.removeEventListener("mouseleave", onMouseLeave);
      if (animMgr) animMgr.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // === Autopilot functions ===
  const speakText = async (text) => {
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      return new Promise((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        audio.play().catch(() => resolve(null));
      });
    } catch {
      return null;
    }
  };

  const commitBodyState = () => {
    if (STEP_BODIES.has(bodyRef.current)) {
      avatarPosRef.current = { ...stepToRef.current };
    }
    if (TURN_BODIES.has(bodyRef.current)) {
      avatarRotRef.current = turnToRef.current;
    }
  };

  const playNext = () => {
    const queue = autopilotQueueRef.current;
    if (queue.length === 0) {
      commitBodyState();
      setAutopilot(false);
      setAutopilotStatus("Sequence complete");
      setBody("idle");
      setArms("auto");
      setFace("auto");
      setFull(null);
      return;
    }
    const cmd = queue.shift();
    console.log("[autopilot] cmd:", JSON.stringify(cmd));
    setLlmLog((prev) => [...prev, cmd]);

    // Handle "missing actions" feedback
    if (cmd.missing) {
      setMissingActions(cmd.missing);
      playNext();
      return;
    }

    // Handle navigation commands (comeback / goto) — generate steps to target
    const navTarget = cmd.comeback
      ? { x: 0, z: 0 }
      : cmd.goto ? { x: cmd.goto.x, z: cmd.goto.z } : null;
    if (navTarget) {
      commitBodyState();
      const cur = avatarPosRef.current;
      const dx = navTarget.x - cur.x;
      const dz = navTarget.z - cur.z;
      const navSteps = [];
      // Generate X steps
      const xSteps = Math.round(Math.abs(dx) / STEP_SIZE);
      const xKey = dx > 0 ? "step-right" : "step-left";
      for (let i = 0; i < xSteps; i++) {
        navSteps.push({ body: xKey, arms: "auto", face: "auto", note: "navigating", duration: 1 });
      }
      // Generate Z steps
      const zSteps = Math.round(Math.abs(dz) / STEP_SIZE);
      const zKey = dz > 0 ? "step-front" : "step-back";
      for (let i = 0; i < zSteps; i++) {
        navSteps.push({ body: zKey, arms: "auto", face: "auto", note: "navigating", duration: 1 });
      }
      // Prepend nav steps to queue
      autopilotQueueRef.current.unshift(...navSteps);
      playNext();
      return;
    }

    // Commit previous step position before switching to next command
    commitBodyState();

    // Apply animation
    if (cmd.full) {
      setFull(cmd.full);
      setBody("idle");
      setArms("auto");
      setFace("auto");
    } else {
      setFull(null);
      const bodyKey = cmd.body || "idle";
      if (bodyKey === bodyRef.current) {
        // Same body key as current — restart manually (setBody won't trigger useEffect)
        commitBodyState();
        bodyStartRef.current = performance.now();
        if (STEP_BODIES.has(bodyKey)) {
          bodyDurationRef.current = (cmd.duration || 2) * 1000;
          setupStep(bodyKey);
        } else if (TURN_BODIES.has(bodyKey)) {
          bodyDurationRef.current = 600;
          setupTurn(bodyKey);
        } else if (bodyKey === "jump") {
          bodyDurationRef.current = 800;
        } else if (bodyKey === "jump-fwd") {
          bodyDurationRef.current = 2000;
        }
      } else {
        if (STEP_BODIES.has(bodyKey)) {
          nextStepDurationRef.current = (cmd.duration || 2) * 1000;
        }
        setBody(bodyKey);
      }
      setArms(cmd.arms || "auto");
      setFace(cmd.face || "auto");
    }

    const statusText = cmd.say
      ? `"${cmd.say.length > 40 ? cmd.say.slice(0, 40) + "..." : cmd.say}"`
      : (cmd.note || "...");
    setAutopilotStatus(statusText);

    if (cmd.say) {
      // Speak and wait for audio to finish before next command
      speakText(cmd.say).then((audioDur) => {
        // Use audio duration if available, otherwise fall back to cmd.duration
        const wait = audioDur != null ? 0 : (cmd.duration || 3) * 1000;
        schedulerRef.current = setTimeout(playNext, wait);
      });
    } else {
      schedulerRef.current = setTimeout(playNext, (cmd.duration || 3) * 1000);
    }
  };

  const startAutopilot = async (prompt) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    autopilotQueueRef.current = [];
    clearTimeout(schedulerRef.current);
    promptStartPosRef.current = { ...avatarPosRef.current };
    setAutopilot(true);
    setAutopilotStatus("Thinking...");
    setMissingActions([]);
    setLlmLog([]);

    try {
      const resp = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || undefined,
          session_id: sessionIdRef.current,
          position: { x: avatarPosRef.current.x, z: avatarPosRef.current.z },
          rotation: avatarRotRef.current,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        setAutopilotStatus(`Error: ${resp.status}`);
        setAutopilot(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let leftover = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        leftover += decoder.decode(value, { stream: true });
        const lines = leftover.split("\n");
        leftover = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const cmd = JSON.parse(line);
            if (cmd.error) {
              setAutopilotStatus(`Error: ${cmd.error}`);
              setAutopilot(false);
              return;
            }
            if (cmd.done) continue;
            autopilotQueueRef.current.push(cmd);
            if (!started) {
              started = true;
              playNext();
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setAutopilotStatus(`Error: ${err.message}`);
        setAutopilot(false);
      }
    }
  };

  const stopAutopilot = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    clearTimeout(schedulerRef.current);
    autopilotQueueRef.current = [];
    avatarPosRef.current = { x: 0, z: 0 };
    avatarRotRef.current = 0;
    setAutopilot(false);
    setAutopilotStatus("");
    setMissingActions([]);
    setBody("idle");
    setArms("auto");
    setFace("auto");
    setFull(null);
  };

  // === UI ===
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Preparing scene...");
  const [paneOpen, setPaneOpen] = useState(false);
  const [openSections, setOpenSections] = useState({ chat: true });

  const isFullActive = full !== null;
  const isLocked = isFullActive || autopilot;

  const toggleSection = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const handleBodyClick = (key) => {
    if (key === body) {
      // Re-trigger: restart the animation
      commitBodyState();
      bodyStartRef.current = performance.now();
      if (STEP_BODIES.has(key)) {
        setupStep(key);
      } else if (TURN_BODIES.has(key)) {
        setupTurn(key);
      }
    } else {
      setBody(key);
    }
  };

  const layers = [
    { key: "body", label: "Body", options: bodyOptions, value: body, onSelect: handleBodyClick, dimmed: isLocked },
    { key: "arms", label: "Arms", options: armOptions, value: arms, onSelect: setArms, dimmed: isLocked },
    { key: "face", label: "Face", options: faceOptions, value: face, onSelect: setFace, dimmed: isLocked },
    { key: "full", label: "Full Body", options: fullOptions, value: full, onSelect: setFull, dimmed: autopilot },
  ];

  const btnStyle = (active, dimmed) => ({
    padding: "5px 10px",
    borderRadius: 6,
    border: active ? "1px solid rgba(59,130,246,0.6)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
    color: dimmed ? "#475569" : "#e2e8f0",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'Fredoka', 'Nunito', sans-serif",
    cursor: dimmed ? "default" : "pointer",
    transition: "all 0.2s",
    opacity: dimmed && !active ? 0.4 : 1,
  });

  const sectionHeaderStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 0", cursor: "pointer", userSelect: "none",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  };

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bg2}, ${COLORS.bg1})`,
      position: "relative", overflow: "hidden",
      fontFamily: "'Fredoka', 'Nunito', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Full-screen canvas */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, cursor: rotating ? "default" : "grab" }} />

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(10, 10, 20, 0.85)", backdropFilter: "blur(8px)",
        }}>
          <div style={{
            width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)",
            borderTop: "3px solid #60a5fa", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginTop: 16,
            fontFamily: "'Fredoka', 'Nunito', sans-serif",
          }}>
            {loadingMsg}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Debug overlay (top-left) */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10, pointerEvents: "none",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {/* Live position */}
        <div style={{
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          borderRadius: 8, padding: "6px 12px", fontFamily: "monospace",
        }}>
          <span ref={posDisplayRef} style={{ color: "#4ade80", fontSize: 11 }}>pos: (0.0, 0.0)  rot: 0°</span>
          {llmProvider && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 12 }}>{llmProvider}</span>}
        </div>

        {/* LLM log */}
        {llmLog.length > 0 && (
        <div style={{
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          borderRadius: 8, padding: "8px 12px", maxWidth: 360, maxHeight: "35vh",
          overflowY: "auto", fontFamily: "monospace",
        }}>
          <p style={{ color: "#64748b", fontSize: 9, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            LLM Output
          </p>
          {llmLog.map((cmd, i) => (
            <div key={i} style={{ fontSize: 10, lineHeight: 1.4, marginBottom: 3 }}>
              {cmd.missing ? (
                <span style={{ color: "#94a3b8" }}>wishes: {cmd.missing.join(", ")}</span>
              ) : (
                <>
                  <span style={{ color: "#60a5fa" }}>{cmd.body || cmd.full || "—"}</span>
                  {cmd.arms && cmd.arms !== "auto" && <span style={{ color: "#a78bfa" }}> +{cmd.arms}</span>}
                  {cmd.face && cmd.face !== "auto" && <span style={{ color: "#f472b6" }}> +{cmd.face}</span>}
                  {cmd.say && <span style={{ color: "#fbbf24" }}> "{cmd.say.length > 30 ? cmd.say.slice(0, 30) + "..." : cmd.say}"</span>}
                  <span style={{ color: "#475569" }}> {cmd.duration}s</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Autopilot status overlay (shows on main screen when speaking) */}
      {autopilot && autopilotStatus && autopilotStatus !== "Sequence complete" && (
        <div style={{
          position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, pointerEvents: "none",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
          borderRadius: 12, padding: "8px 18px", maxWidth: "70%",
        }}>
          <p style={{ color: "#f472b6", fontSize: 13, fontWeight: 600, fontStyle: "italic", margin: 0, textAlign: "center" }}>
            {autopilotStatus}
          </p>
        </div>
      )}

      {/* Chat toggle button (bottom center) */}
      <button
        onClick={() => setPaneOpen(!paneOpen)}
        style={{
          position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 10, width: 52, height: 52, borderRadius: "50%",
          background: paneOpen ? "rgba(244,114,182,0.3)" : "rgba(59,130,246,0.25)",
          border: paneOpen ? "2px solid rgba(244,114,182,0.5)" : "2px solid rgba(59,130,246,0.4)",
          color: "#e2e8f0", fontSize: 22, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(10px)", transition: "all 0.3s",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        {paneOpen ? "\u2715" : "\uD83D\uDCAC"}
      </button>

      {/* Side pane */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: 320, zIndex: 5,
        background: "rgba(10,10,20,0.85)", backdropFilter: "blur(16px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        transform: paneOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Pane header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Controls</h2>
          <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>Talk to the avatar or control it manually</p>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>

          {/* ── Chat Section ── */}
          <div>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("chat")}>
              <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {"\uD83D\uDCAC"} Chat
              </span>
              <span style={{ color: "#475569", fontSize: 10 }}>{openSections.chat ? "\u25B2" : "\u25BC"}</span>
            </div>
            {openSections.chat && (
              <div style={{ padding: "10px 0 6px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !autopilot) startAutopilot(promptInput); }}
                    placeholder="Tell the avatar what to do..."
                    disabled={autopilot}
                    style={{
                      flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12,
                      fontFamily: "'Fredoka', 'Nunito', sans-serif", fontWeight: 500,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                      color: "#e2e8f0", outline: "none", opacity: autopilot ? 0.5 : 1,
                    }}
                  />
                  <button
                    onClick={() => autopilot ? stopAutopilot() : startAutopilot(promptInput)}
                    style={{
                      padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      fontFamily: "'Fredoka', 'Nunito', sans-serif", cursor: "pointer",
                      border: "none", transition: "all 0.2s",
                      background: autopilot ? "rgba(244,114,182,0.3)" : "rgba(59,130,246,0.3)",
                      color: autopilot ? "#f472b6" : "#60a5fa",
                    }}
                  >
                    {autopilot ? "\u25A0 Stop" : "\u25B6 Go"}
                  </button>
                </div>
                {autopilotStatus && (
                  <p style={{ color: "#f472b6", fontSize: 11, fontWeight: 600, fontStyle: "italic", margin: "8px 0 0" }}>
                    {autopilotStatus}
                  </p>
                )}
                {missingActions.length > 0 && (
                  <p style={{ fontSize: 10, color: "#64748b", margin: "6px 0 0" }}>
                    <span style={{ color: "#475569" }}>Wishes it could: </span>
                    {missingActions.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Animation Layer Sections ── */}
          {layers.map(({ key, label, options, value, onSelect, dimmed }) => (
            <div key={key}>
              <div style={sectionHeaderStyle} onClick={() => toggleSection(key)}>
                <span style={{ color: dimmed ? "#334155" : "#e2e8f0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {key === "body" ? "\uD83C\uDFC3" : key === "arms" ? "\uD83D\uDC4B" : key === "face" ? "\uD83D\uDE00" : "\u2B50"}{" "}{label}
                </span>
                <span style={{ color: "#475569", fontSize: 10 }}>{openSections[key] ? "\u25B2" : "\u25BC"}</span>
              </div>
              {openSections[key] && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 0" }}>
                  {options.map((opt) => {
                    const active = value === opt.key;
                    return (
                      <button
                        key={opt.key ?? "none"}
                        onClick={() => !dimmed && onSelect(opt.key)}
                        style={btnStyle(active, dimmed)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* ── Controls Section ── */}
          <div>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("controls")}>
              <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {"\u2699\uFE0F"} Controls
              </span>
              <span style={{ color: "#475569", fontSize: 10 }}>{openSections.controls ? "\u25B2" : "\u25BC"}</span>
            </div>
            {openSections.controls && (
              <div style={{ padding: "8px 0", display: "flex", gap: 6 }}>
                <button
                  onClick={() => setRotating(!rotating)}
                  style={btnStyle(false, false)}
                >
                  {rotating ? "\u23F8 Pause Spin" : "\u25B6 Auto Spin"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
