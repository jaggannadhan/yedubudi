export const BODY_SELF_ROTATING = new Set([
  "walk-lr", "walk-fb", "jump-fwd", "lie-up", "lie-side",
]);

export function applyBody(name, P, avatar, t) {
  switch (name) {
    case "idle": {
      P.rightArm.rotation.x = Math.sin(t * 2) * 0.05;
      P.leftArm.rotation.x = -Math.sin(t * 2) * 0.05;
      break;
    }

    case "walk": {
      const sw = Math.sin(t * 5);
      P.rightArm.rotation.x = sw * 0.6;
      P.leftArm.rotation.x = -sw * 0.6;
      P.rightArm.rotation.z = -0.08;
      P.leftArm.rotation.z = 0.08;
      P.leftLeg.rotation.x = sw * 0.5;
      P.rightLeg.rotation.x = -sw * 0.5;
      avatar.position.y = Math.abs(sw) * 0.04;
      break;
    }

    case "walk-lr": {
      const lrRange = 3.5;
      const lrSpeed = 0.6;
      const lrCycle = ((t * lrSpeed) % 2);
      const lrDir = lrCycle < 1 ? 1 : -1;
      const lrProgress = lrCycle < 1 ? lrCycle : (2 - lrCycle);
      avatar.position.x = -lrRange + lrProgress * 2 * lrRange;
      avatar.rotation.y = lrDir === 1 ? Math.PI / 2 : -Math.PI / 2;
      const lrSw = Math.sin(t * 5);
      P.rightArm.rotation.x = lrSw * 0.6;
      P.leftArm.rotation.x = -lrSw * 0.6;
      P.rightArm.rotation.z = -0.08;
      P.leftArm.rotation.z = 0.08;
      P.leftLeg.rotation.x = lrSw * 0.5;
      P.rightLeg.rotation.x = -lrSw * 0.5;
      avatar.position.y = Math.abs(lrSw) * 0.04;
      break;
    }

    case "walk-fb": {
      const fbRange = 3.0;
      const fbSpeed = 0.5;
      const fbCycle = ((t * fbSpeed) % 2);
      const fbDir = fbCycle < 1 ? 1 : -1;
      const fbProgress = fbCycle < 1 ? fbCycle : (2 - fbCycle);
      avatar.position.z = -fbRange + fbProgress * 2 * fbRange;
      avatar.rotation.y = fbDir === 1 ? 0 : Math.PI;
      const fbSw = Math.sin(t * 5);
      P.rightArm.rotation.x = fbSw * 0.6;
      P.leftArm.rotation.x = -fbSw * 0.6;
      P.rightArm.rotation.z = -0.08;
      P.leftArm.rotation.z = 0.08;
      P.leftLeg.rotation.x = fbSw * 0.5;
      P.rightLeg.rotation.x = -fbSw * 0.5;
      avatar.position.y = Math.abs(fbSw) * 0.04;
      break;
    }

    case "jump": {
      const jmpCycle = (t * 1.5) % 1;
      if (jmpCycle < 0.2) {
        const sq = jmpCycle / 0.2;
        avatar.position.y = -0.15 * sq;
        P.leftLeg.rotation.x = 0.3 * sq;
        P.rightLeg.rotation.x = 0.3 * sq;
        P.rightArm.rotation.z = -0.2 * sq;
        P.leftArm.rotation.z = 0.2 * sq;
        P.headGroup.rotation.x = 0.05 * sq;
      } else if (jmpCycle < 0.6) {
        const airP = (jmpCycle - 0.2) / 0.4;
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
        const landP = (jmpCycle - 0.6) / 0.4;
        avatar.position.y = -0.15 * (1 - landP);
        P.leftLeg.rotation.x = 0.3 * (1 - landP);
        P.rightLeg.rotation.x = 0.3 * (1 - landP);
        P.rightArm.rotation.z = 1.2 * (1 - landP);
        P.leftArm.rotation.z = -1.2 * (1 - landP);
      }
      break;
    }

    case "jump-fwd": {
      const jfSpeed = 0.8;
      const jfRange = 2.5;
      const jfFull = ((t * jfSpeed) % 2);
      const jfDir = jfFull < 1 ? 1 : -1;
      const jfLin = jfFull < 1 ? jfFull : (2 - jfFull);
      avatar.position.z = -jfRange + jfLin * 2 * jfRange;
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
