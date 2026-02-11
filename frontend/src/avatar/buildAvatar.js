import * as THREE from "three";
import { COLORS } from "./constants";

export function buildAvatar() {
  // Shared gradient for toon shading
  const grad = new THREE.DataTexture(
    new Uint8Array([80, 160, 220, 255]), 4, 1, THREE.RedFormat
  );
  grad.minFilter = THREE.NearestFilter;
  grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;

  const toon = (c) =>
    new THREE.MeshToonMaterial({ color: new THREE.Color(c), gradientMap: grad });

  const avatar = new THREE.Group();
  const P = {};

  // === TORSO ===
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.32, 0.9, 16), toon(COLORS.shirt)
  );
  torso.position.y = 0.45;
  torso.castShadow = true;
  P.torso = torso;
  avatar.add(torso);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.04, 8, 16), toon(COLORS.shirt)
  );
  collar.position.set(0, 0.88, 0.05);
  collar.rotation.x = Math.PI / 2;
  avatar.add(collar);

  // === HEAD ===
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.3;
  P.headGroup = headGroup;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 32, 32), toon(COLORS.skin)
  );
  head.scale.set(1, 1.05, 0.95);
  head.castShadow = true;
  headGroup.add(head);

  // Ears
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16), toon(COLORS.skin)
    );
    ear.position.set(s * 0.42, 0, 0);
    ear.scale.set(0.6, 1, 0.8);
    headGroup.add(ear);
  });

  // Hair
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    toon(COLORS.hair)
  );
  hairTop.position.y = 0.02;
  hairTop.scale.set(1.05, 1.1, 1.05);
  headGroup.add(hairTop);

  const bangs = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.25), toon(COLORS.hair)
  );
  bangs.position.set(0, 0.32, 0.28);
  bangs.rotation.x = -0.2;
  headGroup.add(bangs);

  [-1, 1].forEach((s) => {
    const tuft = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16), toon(COLORS.hair)
    );
    tuft.position.set(s * 0.38, 0.2, 0.1);
    tuft.scale.set(0.8, 1.2, 0.7);
    headGroup.add(tuft);
  });

  // Eyes
  [-1, 1].forEach((s) => {
    const eg = new THREE.Group();
    eg.position.set(s * 0.16, 0.06, 0.36);
    const white = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshToonMaterial({ color: COLORS.eye })
    );
    white.scale.set(1, 1.2, 0.5);
    eg.add(white);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.pupil })
    );
    pupil.position.z = 0.03;
    pupil.scale.set(1, 1.2, 0.5);
    eg.add(pupil);
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    shine.position.set(s === -1 ? 0.02 : -0.02, 0.03, 0.045);
    eg.add(shine);
    headGroup.add(eg);
    if (s === -1) P.leftEye = eg; else P.rightEye = eg;
  });

  // Brows
  [-1, 1].forEach((s) => {
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.025, 0.04),
      new THREE.MeshBasicMaterial({ color: COLORS.hair })
    );
    brow.position.set(s * 0.16, 0.2, 0.38);
    brow.rotation.z = s * -0.15;
    headGroup.add(brow);
    if (s === -1) P.leftBrow = brow; else P.rightBrow = brow;
  });

  // Nose
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12), toon(COLORS.skin)
  );
  nose.position.set(0, -0.03, 0.42);
  nose.scale.set(1, 0.8, 0.8);
  headGroup.add(nose);

  // Mouth
  const mouthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    new THREE.MeshBasicMaterial({ color: COLORS.mouth })
  );
  mouthMesh.position.set(0, -0.15, 0.39);
  mouthMesh.scale.set(1.3, 0.35, 0.4);
  P.mouth = mouthMesh;
  headGroup.add(mouthMesh);

  // Blush
  [-1, 1].forEach((s) => {
    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.blush, transparent: true, opacity: 0.35 })
    );
    blush.position.set(s * 0.28, -0.08, 0.37);
    blush.rotation.y = s * 0.3;
    headGroup.add(blush);
  });

  avatar.add(headGroup);

  // === ARMS — with elbow joints ===
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.48, 0.85, 0);

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.08, 0.45, 12), toon(COLORS.shirt)
    );
    upper.position.y = -0.22;
    upper.castShadow = true;
    shoulder.add(upper);

    // Elbow pivot
    const elbowGroup = new THREE.Group();
    elbowGroup.position.y = -0.45;
    shoulder.add(elbowGroup);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.06, 0.35, 12), toon(COLORS.skin)
    );
    forearm.position.y = -0.13;
    forearm.castShadow = true;
    elbowGroup.add(forearm);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 12), toon(COLORS.skin)
    );
    hand.position.y = -0.33;
    hand.scale.set(1, 0.8, 0.8);
    elbowGroup.add(hand);

    const key = side === -1 ? "left" : "right";
    P[key + "Arm"] = shoulder;
    P[key + "Elbow"] = elbowGroup;
    P[key + "Hand"] = hand;

    // Gesture meshes (right arm only)
    if (side === 1) {
      const gestSkin = toon(COLORS.skin);

      // Thumbs up
      const thumbsUp = new THREE.Group();
      thumbsUp.position.y = -0.33;
      thumbsUp.visible = false;
      const fist1 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), gestSkin);
      fist1.scale.set(1, 0.7, 0.9);
      thumbsUp.add(fist1);
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), gestSkin);
      thumb.position.y = 0.09;
      thumbsUp.add(thumb);
      const thumbTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), gestSkin);
      thumbTip.position.y = 0.15;
      thumbsUp.add(thumbTip);
      elbowGroup.add(thumbsUp);
      P.thumbsUp = thumbsUp;

      // Peace sign
      const peace = new THREE.Group();
      peace.position.y = -0.33;
      peace.visible = false;
      const fist2 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), gestSkin);
      fist2.scale.set(1, 0.7, 0.9);
      peace.add(fist2);
      [-1, 1].forEach((fs) => {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8), gestSkin);
        finger.position.set(fs * 0.025, 0.09, 0);
        finger.rotation.z = fs * 0.15;
        peace.add(finger);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), gestSkin);
        tip.position.set(fs * 0.044, 0.155, 0);
        peace.add(tip);
      });
      elbowGroup.add(peace);
      P.peace = peace;

      // Pointing finger
      const pointing = new THREE.Group();
      pointing.position.y = -0.33;
      pointing.visible = false;
      const fist3 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), gestSkin);
      fist3.scale.set(1, 0.7, 0.9);
      pointing.add(fist3);
      const pFinger = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.14, 8), gestSkin);
      pFinger.position.set(0, 0.09, 0);
      pointing.add(pFinger);
      const pTip = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), gestSkin);
      pTip.position.y = 0.16;
      pointing.add(pTip);
      elbowGroup.add(pointing);
      P.pointing = pointing;
    }

    avatar.add(shoulder);
  });

  // === LEGS ===
  [-1, 1].forEach((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.15, 0.02, 0);

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.09, 0.45, 12), toon(COLORS.pants)
    );
    upper.position.y = -0.22;
    upper.castShadow = true;
    hip.add(upper);

    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.08, 0.4, 12), toon(COLORS.pants)
    );
    lower.position.y = -0.6;
    lower.castShadow = true;
    hip.add(lower);

    const shoe = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12), toon(COLORS.shoes)
    );
    shoe.position.set(0, -0.82, 0.03);
    shoe.scale.set(1, 0.6, 1.4);
    shoe.castShadow = true;
    hip.add(shoe);

    P[side === -1 ? "leftLeg" : "rightLeg"] = hip;
    avatar.add(hip);
  });

  // === HEART (floating above head) ===
  const heartShape = new THREE.Shape();
  const hx = 0.05, hy = 0.05;
  heartShape.moveTo(hx, hy);
  heartShape.bezierCurveTo(hx, hy, hx - 0.01, 0, 0, 0);
  heartShape.bezierCurveTo(-0.06, 0, -0.06, 0.07, -0.06, 0.07);
  heartShape.bezierCurveTo(-0.06, 0.11, -0.035, 0.154, hx, 0.19);
  heartShape.bezierCurveTo(0.12, 0.154, 0.16, 0.11, 0.16, 0.07);
  heartShape.bezierCurveTo(0.16, 0.07, 0.16, 0, 0.1, 0);
  heartShape.bezierCurveTo(0.07, 0, hx, hy, hx, hy);
  const heartGeom = new THREE.ExtrudeGeometry(heartShape, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3,
  });
  heartGeom.center();
  const heartMesh = new THREE.Mesh(
    heartGeom, new THREE.MeshBasicMaterial({ color: 0xff4466, side: THREE.DoubleSide })
  );
  heartMesh.scale.set(2.5, 2.5, 2.5);
  heartMesh.rotation.z = Math.PI;
  heartMesh.position.set(0, 2.15, 0.15);
  heartMesh.visible = false;
  avatar.add(heartMesh);
  P.heart = heartMesh;

  // === SHADOW ===
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -0.82;
  avatar.add(shadowDisc);

  return { avatar, parts: P };
}
