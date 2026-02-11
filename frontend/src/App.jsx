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
  const autopilotQueueRef = useRef([]);
  const abortRef = useRef(null);
  const schedulerRef = useRef(null);

  // Refs for animation loop (avoids scene rebuild)
  const bodyRef = useRef("idle");
  const armRef = useRef("auto");
  const faceRef = useRef("auto");
  const fullRef = useRef(null);
  const rotatingRef = useRef(false);

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
    const onMouseLeave = () => { mouseX = 0; };
    container.addEventListener("mousemove", onMouse);
    container.addEventListener("mouseleave", onMouseLeave);

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
      container.removeEventListener("mouseleave", onMouseLeave);
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

  const playNext = () => {
    const queue = autopilotQueueRef.current;
    if (queue.length === 0) {
      setAutopilot(false);
      setAutopilotStatus("Sequence complete");
      setBody("idle");
      setArms("auto");
      setFace("auto");
      setFull(null);
      return;
    }
    const cmd = queue.shift();

    // Handle "missing actions" feedback
    if (cmd.missing) {
      setMissingActions(cmd.missing);
      playNext();
      return;
    }

    // Apply animation
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
    setAutopilot(true);
    setAutopilotStatus("Thinking...");
    setMissingActions([]);

    try {
      const resp = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt || undefined }),
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
    setAutopilot(false);
    setAutopilotStatus("");
    setMissingActions([]);
    setBody("idle");
    setArms("auto");
    setFace("auto");
    setFull(null);
  };

  // === UI ===
  const [paneOpen, setPaneOpen] = useState(false);
  const [openSections, setOpenSections] = useState({ chat: true });

  const isFullActive = full !== null;
  const isLocked = isFullActive || autopilot;

  const toggleSection = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const layers = [
    { key: "body", label: "Body", options: bodyOptions, value: body, setter: setBody, dimmed: isLocked },
    { key: "arms", label: "Arms", options: armOptions, value: arms, setter: setArms, dimmed: isLocked },
    { key: "face", label: "Face", options: faceOptions, value: face, setter: setFace, dimmed: isLocked },
    { key: "full", label: "Full Body", options: fullOptions, value: full, setter: setFull, dimmed: autopilot },
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
          {layers.map(({ key, label, options, value, setter, dimmed }) => (
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
                        onClick={() => !dimmed && setter(opt.key)}
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
