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

export default function App() {
  const mountRef = useRef(null);
  const [rotating, setRotating] = useState(true);

  // Layer states
  const [body, setBody] = useState("idle");
  const [arms, setArms] = useState("auto");
  const [face, setFace] = useState("auto");
  const [full, setFull] = useState(null);

  // Autopilot (LLM brain)
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState("");
  const autopilotQueueRef = useRef([]);
  const abortRef = useRef(null);
  const schedulerRef = useRef(null);

  // Refs for animation loop (avoids scene rebuild)
  const bodyRef = useRef("idle");
  const armRef = useRef("auto");
  const faceRef = useRef("auto");
  const fullRef = useRef(null);
  const rotatingRef = useRef(true);

  useEffect(() => { bodyRef.current = body; }, [body]);
  useEffect(() => { armRef.current = arms; }, [arms]);
  useEffect(() => { faceRef.current = face; }, [face]);
  useEffect(() => { fullRef.current = full; }, [full]);
  useEffect(() => { rotatingRef.current = rotating; }, [rotating]);

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
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x6688ff, 0.5);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    // === Avatar ===
    const { avatar, parts: P } = buildAvatar();
    scene.add(avatar);

    // === Mouse tracking ===
    let mouseX = 0;
    const onMouse = (e) => {
      const r = container.getBoundingClientRect();
      mouseX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    };
    container.addEventListener("mousemove", onMouse);

    // === Animation loop ===
    let frame;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const cb = bodyRef.current;
      const ca = armRef.current;
      const cf = faceRef.current;
      const fo = fullRef.current;

      // ── Reset all defaults ──
      resetDefaults(P, avatar);

      // ── Breathing (universal) ──
      const breathRate = cf === "sleeping" ? 1 : cf === "tired" ? 1.2 : 2;
      const breathAmp = cf === "tired" ? 0.03 : 0.02;
      P.torso.scale.x = 1 + Math.sin(t * breathRate) * breathAmp;
      P.torso.scale.z = 1 + Math.sin(t * breathRate) * breathAmp;

      // ── Apply layers ──
      if (fo) {
        // Full-body override — controls everything
        applyFull(fo, P, avatar, t);
      } else {
        // Head bob (skip for tired/sleeping)
        if (cf !== "sleeping" && cf !== "tired") {
          P.headGroup.position.y += Math.sin(t * 2) * 0.015;
          P.headGroup.rotation.z = Math.sin(t * 1.5) * 0.03;
        }
        // Compose: body → arms → face
        applyBody(cb, P, avatar, t);
        applyArms(ca, P, t);
        applyFace(cf, P, t);
      }

      // ── Rotation ──
      const activePose = fo || cb;
      const isSelfRot = BODY_SELF_ROTATING.has(activePose) || FULL_SELF_ROTATING.has(activePose);
      if (!isSelfRot) {
        if (rotatingRef.current) {
          avatar.rotation.y += 0.008;
        } else {
          const targetRot = mouseX * Math.PI * 0.5;
          avatar.rotation.y += (targetRot - avatar.rotation.y) * 0.05;
        }
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
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // === Autopilot functions ===
  const playNext = () => {
    const queue = autopilotQueueRef.current;
    if (queue.length === 0) {
      setAutopilotStatus("Sequence complete");
      return;
    }
    const cmd = queue.shift();
    if (cmd.full) {
      setFull(cmd.full);
      setBody("idle");
      setArms("auto");
      setFace("auto");
    } else {
      setFull(null);
      setBody(cmd.body || "idle");
      setArms(cmd.arms || "auto");
      setFace(cmd.face || "auto");
    }
    const parts = [];
    if (cmd.full) {
      parts.push(cmd.full);
    } else {
      parts.push(cmd.body || "idle");
      if (cmd.arms && cmd.arms !== "auto") parts.push(cmd.arms);
      if (cmd.face && cmd.face !== "auto") parts.push(cmd.face);
    }
    setAutopilotStatus(`${parts.join(" + ")}  (${cmd.duration}s)`);
    schedulerRef.current = setTimeout(playNext, (cmd.duration || 3) * 1000);
  };

  const startAutopilot = async (prompt) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    autopilotQueueRef.current = [];
    clearTimeout(schedulerRef.current);
    setAutopilot(true);
    setAutopilotStatus("Connecting...");

    try {
      const resp = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt || "Perform an entertaining animation sequence" }),
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
              setAutopilotStatus("Playing...");
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
    setAutopilot(false);
    setAutopilotStatus("");
    setBody("idle");
    setArms("auto");
    setFace("auto");
    setFull(null);
  };

  // === UI ===
  const isFullActive = full !== null;
  const isLocked = isFullActive || autopilot;

  const layers = [
    { label: "Body", options: bodyOptions, value: body, setter: setBody, dimmed: isLocked },
    { label: "Arms", options: armOptions, value: arms, setter: setArms, dimmed: isLocked },
    { label: "Face", options: faceOptions, value: face, setter: setFace, dimmed: isLocked },
    { label: "Full Body", options: fullOptions, value: full, setter: setFull, dimmed: autopilot },
  ];

  const btnStyle = (active, dimmed) => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: active ? "1px solid rgba(59,130,246,0.6)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
    color: dimmed ? "#475569" : "#e2e8f0",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Fredoka', 'Nunito', sans-serif",
    cursor: dimmed ? "default" : "pointer",
    backdropFilter: "blur(8px)",
    transition: "all 0.2s",
    opacity: dimmed && !active ? 0.4 : 1,
  });

  // Status text
  const statusParts = [];
  if (full) {
    const fo = fullOptions.find((o) => o.key === full);
    statusParts.push(fo ? fo.label : full);
  } else {
    statusParts.push(body);
    if (arms !== "auto") statusParts.push(arms);
    if (face !== "auto") statusParts.push(face);
  }

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

      {/* Header overlay */}
      <div style={{ position: "absolute", top: 20, left: 0, right: 0, textAlign: "center", zIndex: 2, pointerEvents: "none" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Cartoon Avatar</h1>
        <p style={{ fontSize: 14, color: "#64748b", margin: "6px 0 0" }}>
          Composable animation layers &mdash; mix body, arms &amp; face
        </p>
      </div>

      {/* Button bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        maxHeight: "45vh", overflowY: "auto", padding: "8px 0 12px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        background: "linear-gradient(transparent, rgba(0,0,0,0.4) 30%)",
      }}>
        {/* Status + controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
          <span style={{ color: "#94a3b8", fontSize: 12, letterSpacing: "0.03em" }}>
            {statusParts.map((s, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: "#475569" }}> + </span>}
                <span style={{ color: full ? "#f472b6" : i === 0 ? "#60a5fa" : i === 1 ? "#a78bfa" : "#34d399", fontWeight: 600 }}>{s}</span>
              </span>
            ))}
          </span>
          <button onClick={() => setRotating(!rotating)} style={btnStyle(false, false)}>
            {rotating ? "\u23F8 Pause" : "\u25B6 Spin"}
          </button>
        </div>

        {/* Autopilot */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <button
            onClick={() => autopilot ? stopAutopilot() : startAutopilot()}
            style={{
              ...btnStyle(autopilot, false),
              background: autopilot ? "rgba(244,114,182,0.25)" : "rgba(255,255,255,0.06)",
              borderColor: autopilot ? "rgba(244,114,182,0.6)" : "rgba(255,255,255,0.1)",
              color: autopilot ? "#f472b6" : "#e2e8f0",
              padding: "8px 16px",
              fontSize: 13,
            }}
          >
            {autopilot ? "\u25A0 Stop Autopilot" : "\u2728 Autopilot"}
          </button>
          {autopilotStatus && (
            <span style={{ color: "#94a3b8", fontSize: 11 }}>{autopilotStatus}</span>
          )}
        </div>

        {/* Layer rows */}
        {layers.map(({ label, options, value, setter, dimmed }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{
              color: dimmed ? "#334155" : "#475569",
              fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.12em",
              minWidth: 62, textAlign: "right", paddingRight: 4,
            }}>
              {label}
            </span>
            {options.map((opt) => {
              const active = value === opt.key;
              return (
                <button
                  key={opt.key ?? "none"}
                  onClick={() => !dimmed && setter(opt.key)}
                  style={btnStyle(active, dimmed)}
                  onMouseEnter={(e) => {
                    if (!active && !dimmed) {
                      e.target.style.background = "rgba(59,130,246,0.15)";
                      e.target.style.borderColor = "rgba(59,130,246,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active && !dimmed) {
                      e.target.style.background = "rgba(255,255,255,0.06)";
                      e.target.style.borderColor = "rgba(255,255,255,0.1)";
                    }
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
