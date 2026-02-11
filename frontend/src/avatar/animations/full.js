export const FULL_SELF_ROTATING = new Set(["twirl", "roundhouse"]);

export function applyFull(name, P, avatar, t) {
  switch (name) {
    case "twirl": {
      avatar.rotation.y = t * 10;
      P.rightLeg.rotation.x = -0.3;
      P.rightLeg.rotation.z = -0.6;
      P.rightArm.rotation.x = -0.6;
      P.rightArm.rotation.z = -0.35;
      P.leftArm.rotation.x = -0.6;
      P.leftArm.rotation.z = 0.35;
      P.rightElbow.rotation.x = -0.6;
      P.leftElbow.rotation.x = -0.6;
      avatar.position.y = 0.06;
      P.mouth.scale.set(1.2, 0.35, 0.4);
      P.leftEye.scale.y = 0.8;
      P.rightEye.scale.y = 0.8;
      break;
    }

    case "front-kick": {
      const fkCycle = (t * 2) % 1;
      P.rightArm.rotation.x = -0.35;
      P.rightArm.rotation.z = -0.2;
      P.rightElbow.rotation.x = -0.7;
      P.leftArm.rotation.x = -0.35;
      P.leftArm.rotation.z = 0.2;
      P.leftElbow.rotation.x = -0.7;
      if (fkCycle < 0.25) {
        const ch = fkCycle / 0.25;
        P.rightLeg.rotation.x = -0.8 * ch;
      } else if (fkCycle < 0.45) {
        const sn = (fkCycle - 0.25) / 0.2;
        P.rightLeg.rotation.x = -0.8 - 0.5 * sn;
        P.headGroup.rotation.x = 0.06 * sn;
        P.mouth.scale.set(1.4, 0.55, 0.4);
        P.leftEye.scale.y = 0.75;
        P.rightEye.scale.y = 0.75;
      } else if (fkCycle < 0.65) {
        P.rightLeg.rotation.x = -1.3;
        P.headGroup.rotation.x = 0.06;
        P.mouth.scale.set(1.4, 0.55, 0.4);
      } else {
        const ret = (fkCycle - 0.65) / 0.35;
        P.rightLeg.rotation.x = -1.3 * (1 - ret);
        P.headGroup.rotation.x = 0.06 * (1 - ret);
      }
      break;
    }

    case "roundhouse": {
      const rhCycle = (t * 1.2) % 1;
      P.rightArm.rotation.x = -0.3;
      P.rightArm.rotation.z = 0.3;
      P.leftArm.rotation.x = -0.3;
      P.leftArm.rotation.z = -0.3;
      P.rightElbow.rotation.x = -0.5;
      P.leftElbow.rotation.x = -0.5;
      if (rhCycle < 0.2) {
        const ch = rhCycle / 0.2;
        P.rightLeg.rotation.x = -0.7 * ch;
        P.rightLeg.rotation.z = -0.3 * ch;
        avatar.rotation.y = 0;
      } else if (rhCycle < 0.6) {
        const ext = (rhCycle - 0.2) / 0.4;
        avatar.rotation.y = -Math.PI * 1.5 * ext;
        P.rightLeg.rotation.x = -0.7 - 0.5 * ext;
        P.rightLeg.rotation.z = -0.3 - 0.5 * ext;
        P.leftLeg.rotation.x = 0.1;
        P.headGroup.rotation.x = -0.08;
        P.mouth.scale.set(1.4, 0.55, 0.4);
        P.leftEye.scale.y = 0.7;
        P.rightEye.scale.y = 0.7;
        P.leftBrow.rotation.z = -0.2;
        P.rightBrow.rotation.z = 0.2;
        P.leftBrow.position.y = 0.17;
        P.rightBrow.position.y = 0.17;
      } else {
        const rec = (rhCycle - 0.6) / 0.4;
        avatar.rotation.y = -Math.PI * 1.5 * (1 - rec);
        P.rightLeg.rotation.x = -1.2 * (1 - rec);
        P.rightLeg.rotation.z = -0.8 * (1 - rec);
      }
      break;
    }

    case "mr-bean": {
      const k1 = Math.max(0, Math.sin(t * 4));
      const k2 = Math.max(0, Math.sin(t * 4 + Math.PI));
      P.rightLeg.rotation.x = -k1 * 0.9;
      P.leftLeg.rotation.x = -k2 * 0.9;
      P.rightArm.rotation.x = Math.sin(t * 5.3) * 0.8;
      P.rightArm.rotation.z = 0.5 + Math.sin(t * 6.1) * 0.4;
      P.leftArm.rotation.x = Math.sin(t * 3.7) * 0.7;
      P.leftArm.rotation.z = -0.5 - Math.sin(t * 4.3) * 0.35;
      P.rightElbow.rotation.x = -0.8 + Math.sin(t * 7) * 0.3;
      P.leftElbow.rotation.x = -0.8 + Math.sin(t * 5) * 0.3;
      P.headGroup.rotation.z = Math.sin(t * 7.2) * 0.15;
      P.headGroup.rotation.x = Math.sin(t * 4.8) * 0.12;
      avatar.position.y = Math.abs(Math.sin(t * 4)) * 0.1;
      P.mouth.scale.set(1.5, 0.4 + Math.abs(Math.sin(t * 3)) * 0.4, 0.4);
      P.leftEye.scale.y = 0.6 + Math.sin(t * 5) * 0.3;
      P.rightEye.scale.y = 0.6 + Math.sin(t * 5.5) * 0.3;
      P.leftBrow.position.y = 0.2 + Math.sin(t * 6) * 0.06;
      P.rightBrow.position.y = 0.2 + Math.sin(t * 4) * 0.06;
      break;
    }
  }
}
