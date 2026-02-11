export function applyArms(name, P, t) {
  if (name === "auto") return;

  // Reset arms to clean state (overrides body's arm hints)
  P.leftArm.rotation.set(0, 0, 0);
  P.rightArm.rotation.set(0, 0, 0);
  P.leftElbow.rotation.set(0, 0, 0);
  P.rightElbow.rotation.set(0, 0, 0);

  switch (name) {
    case "wave": {
      P.rightArm.rotation.z = 1.5;
      P.rightArm.rotation.x = 0.3;
      P.rightElbow.rotation.z = 0.8 + Math.sin(t * 6) * 0.3;
      P.leftArm.rotation.z = 0.08;
      P.leftArm.rotation.x = Math.sin(t * 2) * 0.05;
      break;
    }

    case "hands-up": {
      P.rightArm.rotation.z = 1.4;
      P.rightArm.rotation.x = 0.2;
      P.leftArm.rotation.z = -1.4;
      P.leftArm.rotation.x = 0.2;
      P.rightElbow.rotation.z = 0.7 + Math.sin(t * 3) * 0.1;
      P.leftElbow.rotation.z = -0.7 - Math.sin(t * 3) * 0.1;
      break;
    }

    case "thumbs-up": {
      P.rightHand.visible = false;
      P.thumbsUp.visible = true;
      P.rightArm.rotation.z = 1.0;
      P.rightArm.rotation.x = 0.3;
      P.rightElbow.rotation.z = 0.5;
      P.leftArm.rotation.x = Math.sin(t * 2) * 0.05;
      break;
    }

    case "peace": {
      P.rightHand.visible = false;
      P.peace.visible = true;
      P.rightArm.rotation.z = 1.3;
      P.rightArm.rotation.x = 0.4;
      P.rightElbow.rotation.z = 0.6;
      P.leftArm.rotation.z = 0.3;
      P.leftArm.rotation.x = -0.2;
      break;
    }

    case "pointing": {
      P.rightHand.visible = false;
      P.pointing.visible = true;
      P.rightArm.rotation.x = -1.3;
      P.rightArm.rotation.z = -0.1;
      P.leftArm.rotation.x = Math.sin(t * 2) * 0.03;
      break;
    }

    case "heart": {
      P.heart.visible = true;
      P.heart.position.y = 2.15 + Math.sin(t * 2) * 0.06;
      P.heart.rotation.y = Math.sin(t * 1.5) * 0.3;
      const hScale = 2.5 + Math.sin(t * 3) * 0.15;
      P.heart.scale.set(hScale, hScale, hScale);
      P.rightArm.rotation.z = -0.8;
      P.rightArm.rotation.x = -0.5;
      P.leftArm.rotation.z = 0.8;
      P.leftArm.rotation.x = -0.5;
      P.rightElbow.rotation.x = -0.8;
      P.leftElbow.rotation.x = -0.8;
      break;
    }

    case "talk": {
      P.rightArm.rotation.z = -0.4 + Math.sin(t * 3) * 0.2;
      P.rightArm.rotation.x = -0.3 + Math.sin(t * 2.5) * 0.15;
      P.leftArm.rotation.z = 0.3 - Math.sin(t * 2.7) * 0.15;
      P.leftArm.rotation.x = -0.2 + Math.cos(t * 2.2) * 0.12;
      break;
    }
  }
}
