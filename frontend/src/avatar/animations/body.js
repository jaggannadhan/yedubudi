export const BODY_SELF_ROTATING = new Set([
  "jump-fwd", "lie-up", "lie-side",
]);

export function applyBody(name, P, avatar, t, progress = 0) {
  switch (name) {
    case "idle": {
      P.rightArm.rotation.x = Math.sin(t * 2) * 0.05;
      P.leftArm.rotation.x = -Math.sin(t * 2) * 0.05;
      break;
    }

    case "step-front":
    case "step-back":
    case "step-left":
    case "step-right": {
      const p = progress; // 0 → 1
      // Leading leg depends on direction
      const isLeft = (name === "step-front" || name === "step-left");
      const lead = isLeft ? P.leftLeg : P.rightLeg;
      const trail = isLeft ? P.rightLeg : P.leftLeg;
      const leadArm = isLeft ? P.rightArm : P.leftArm;   // opposite arm swings
      const trailArm = isLeft ? P.leftArm : P.rightArm;

      if (p < 0.4) {
        // Phase 1: lead leg lifts and swings forward
        const phase = p / 0.4;
        lead.rotation.x = -0.5 * Math.sin(phase * Math.PI);
        leadArm.rotation.x = 0.4 * Math.sin(phase * Math.PI);
      } else if (p < 0.7) {
        // Phase 2: lead plants, trail lifts
        const phase = (p - 0.4) / 0.3;
        trail.rotation.x = -0.3 * Math.sin(phase * Math.PI);
        trailArm.rotation.x = 0.3 * Math.sin(phase * Math.PI);
      }
      // Phase 3 (0.7-1.0): settle — legs already at neutral from resetDefaults

      // Vertical bob during step
      avatar.position.y = Math.sin(p * Math.PI) * 0.04;
      // Arm swing offset
      leadArm.rotation.z = -0.08;
      trailArm.rotation.z = 0.08;
      break;
    }

    case "jump": {
      const p = Math.min(1, progress);
      if (p < 0.2) {
        const sq = p / 0.2;
        avatar.position.y = -0.15 * sq;
        P.leftLeg.rotation.x = 0.3 * sq;
        P.rightLeg.rotation.x = 0.3 * sq;
        P.rightArm.rotation.z = -0.2 * sq;
        P.leftArm.rotation.z = 0.2 * sq;
        P.headGroup.rotation.x = 0.05 * sq;
      } else if (p < 0.6) {
        const airP = (p - 0.2) / 0.4;
        avatar.position.y = Math.sin(airP * Math.PI) * 1.4;
        const armUp = Math.min(airP * 2, 1);
        P.rightArm.rotation.z = 1.2 * armUp;
        P.leftArm.rotation.z = -1.2 * armUp;
        P.rightElbow.rotation.z = 0.3 * armUp;
        P.leftElbow.rotation.z = -0.3 * armUp;
        P.leftLeg.rotation.x = -0.25;
        P.rightLeg.rotation.x = -0.25;
        P.mouth.scale.set(1.4, 0.6, 0.4);
        P.leftBrow.position.y = 0.25;
        P.rightBrow.position.y = 0.25;
      } else {
        const landP = (p - 0.6) / 0.4;
        avatar.position.y = -0.15 * (1 - landP);
        P.leftLeg.rotation.x = 0.3 * (1 - landP);
        P.rightLeg.rotation.x = 0.3 * (1 - landP);
        P.rightArm.rotation.z = 1.2 * (1 - landP);
        P.leftArm.rotation.z = -1.2 * (1 - landP);
      }
      break;
    }

    case "jump-fwd": {
      const p = Math.min(1, progress);
      const jfRange = 2.0;
      const jfFull = p * 2;
      const jfDir = jfFull < 1 ? 1 : -1;
      const jfLin = jfFull < 1 ? jfFull : (2 - jfFull);
      avatar.position.z += jfLin * jfRange;
      avatar.rotation.y = jfDir === 1 ? 0 : Math.PI;
      const jfBounce = (jfLin * 3) % 1;
      avatar.position.y = Math.sin(jfBounce * Math.PI) * 0.7;
      const leap = Math.sin(jfBounce * Math.PI);
      P.rightArm.rotation.x = -0.5 * leap;
      P.leftArm.rotation.x = 0.3 * leap;
      P.rightLeg.rotation.x = 0.3 * leap;
      P.leftLeg.rotation.x = -0.4 * leap;
      P.mouth.scale.set(1.3, 0.4 + leap * 0.3, 0.4);
      P.leftBrow.position.y = 0.2 + leap * 0.04;
      P.rightBrow.position.y = 0.2 + leap * 0.04;
      break;
    }

    case "sit": {
      avatar.position.y = -0.4;
      P.leftLeg.rotation.x = -1.4;
      P.rightLeg.rotation.x = -1.4;
      P.rightArm.rotation.x = -0.6;
      P.rightArm.rotation.z = -0.12;
      P.leftArm.rotation.x = -0.6;
      P.leftArm.rotation.z = 0.12;
      P.rightElbow.rotation.x = -0.4;
      P.leftElbow.rotation.x = -0.4;
      P.headGroup.rotation.x = 0.08;
      P.mouth.scale.set(1.2, 0.3, 0.4);
      P.leftEye.scale.y = 0.85;
      P.rightEye.scale.y = 0.85;
      break;
    }

    case "lie-up": {
      avatar.rotation.x = -Math.PI / 2;
      avatar.rotation.y = 0;
      avatar.position.y = -0.7;
      avatar.position.z = 1.0;
      P.rightArm.rotation.z = -0.2;
      P.leftArm.rotation.z = 0.2;
      P.leftEye.scale.y = 0.08;
      P.rightEye.scale.y = 0.08;
      P.mouth.scale.set(1.0, 0.25, 0.4);
      P.leftBrow.position.y = 0.19;
      P.rightBrow.position.y = 0.19;
      P.leftBrow.rotation.z = 0.05;
      P.rightBrow.rotation.z = -0.05;
      break;
    }

    case "lie-side": {
      avatar.rotation.z = Math.PI / 2;
      avatar.rotation.y = 0;
      avatar.position.y = -0.5;
      P.headGroup.rotation.z = -0.15;
      P.leftArm.rotation.z = -1.2;
      P.leftElbow.rotation.z = 1.0;
      P.rightArm.rotation.x = -0.2;
      P.rightArm.rotation.z = -0.1;
      P.leftLeg.rotation.x = -0.2;
      P.rightLeg.rotation.x = -0.35;
      P.leftEye.scale.y = 0.08;
      P.rightEye.scale.y = 0.08;
      P.mouth.scale.set(0.9, 0.22, 0.4);
      break;
    }
  }
}
