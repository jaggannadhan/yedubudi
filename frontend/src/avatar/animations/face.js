export function applyFace(name, P, t) {
  if (name === "auto") return;

  switch (name) {
    case "happy": {
      P.mouth.scale.set(1.6, 0.5, 0.4);
      P.leftEye.scale.y = 0.85;
      P.rightEye.scale.y = 0.85;
      P.leftBrow.position.y = 0.23;
      P.rightBrow.position.y = 0.23;
      break;
    }

    case "angry": {
      P.leftBrow.rotation.z = -0.25;
      P.rightBrow.rotation.z = 0.25;
      P.leftBrow.position.y = 0.16;
      P.rightBrow.position.y = 0.16;
      P.leftEye.scale.y = 0.65;
      P.rightEye.scale.y = 0.65;
      P.mouth.scale.set(1.0, 0.25, 0.4);
      P.mouth.position.y = -0.18;
      P.headGroup.rotation.x = -0.1;
      P.headGroup.rotation.z = Math.sin(t * 25) * 0.02;
      break;
    }

    case "laughing": {
      P.mouth.scale.set(1.5, 0.7 + Math.abs(Math.sin(t * 6)) * 0.3, 0.4);
      P.leftEye.scale.y = 0.4;
      P.rightEye.scale.y = 0.4;
      P.leftBrow.position.y = 0.24;
      P.rightBrow.position.y = 0.24;
      P.headGroup.rotation.x = 0.1;
      P.headGroup.rotation.z = Math.sin(t * 3) * 0.06;
      break;
    }

    case "tired": {
      P.headGroup.position.y = 1.28;
      P.headGroup.rotation.x = 0.15 + Math.sin(t * 0.8) * 0.05;
      P.leftEye.scale.y = 0.35;
      P.rightEye.scale.y = 0.35;
      P.leftBrow.position.y = 0.17;
      P.rightBrow.position.y = 0.17;
      P.leftBrow.rotation.z = 0.05;
      P.rightBrow.rotation.z = -0.05;
      const yawnCycle = (t * 0.3) % 1;
      const yawnOpen = yawnCycle < 0.3 ? Math.sin(yawnCycle / 0.3 * Math.PI) * 0.8 : 0;
      P.mouth.scale.set(1.1 + yawnOpen * 0.3, 0.3 + yawnOpen * 0.6, 0.4);
      break;
    }

    case "sleeping": {
      P.headGroup.position.y = 1.25;
      P.headGroup.rotation.x = 0.3;
      P.headGroup.rotation.z = Math.sin(t * 0.5) * 0.04;
      P.leftEye.scale.y = 0.05;
      P.rightEye.scale.y = 0.05;
      P.leftBrow.position.y = 0.18;
      P.rightBrow.position.y = 0.18;
      P.leftBrow.rotation.z = 0.05;
      P.rightBrow.rotation.z = -0.05;
      P.mouth.scale.set(0.8, 0.2, 0.4);
      break;
    }

    case "focused": {
      P.leftBrow.position.y = 0.18;
      P.rightBrow.position.y = 0.22;
      P.leftBrow.rotation.z = 0.0;
      P.rightBrow.rotation.z = -0.2;
      P.mouth.scale.set(1.0, 0.3, 0.4);
      break;
    }

    case "talking": {
      P.headGroup.position.y = 1.3 + Math.sin(t * 3) * 0.02;
      P.headGroup.rotation.z = Math.sin(t * 2.5) * 0.06;
      P.headGroup.rotation.x = Math.sin(t * 1.8) * 0.04;
      P.mouth.scale.y = 0.35 + Math.abs(Math.sin(t * 8)) * 0.65;
      break;
    }
  }
}
