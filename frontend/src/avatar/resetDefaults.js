export function resetDefaults(P, avatar) {
  // Body position
  avatar.position.x = 0;
  avatar.position.y = 0;
  avatar.position.z = 0;
  avatar.rotation.x = 0;
  avatar.rotation.z = 0;

  // Head
  P.headGroup.position.y = 1.3;
  P.headGroup.rotation.set(0, 0, 0);

  // Arms + elbows
  P.leftArm.rotation.set(0, 0, 0);
  P.rightArm.rotation.set(0, 0, 0);
  P.leftElbow.rotation.set(0, 0, 0);
  P.rightElbow.rotation.set(0, 0, 0);

  // Legs (reset all axes — roundhouse uses .z)
  P.leftLeg.rotation.set(0, 0, 0);
  P.rightLeg.rotation.set(0, 0, 0);

  // Gesture meshes
  P.rightHand.visible = true;
  P.thumbsUp.visible = false;
  P.peace.visible = false;
  P.pointing.visible = false;
  P.heart.visible = false;

  // Face
  P.leftBrow.position.y = 0.2;
  P.rightBrow.position.y = 0.2;
  P.leftBrow.rotation.z = 0.15;
  P.rightBrow.rotation.z = -0.15;
  P.leftEye.scale.y = 1;
  P.rightEye.scale.y = 1;
  P.mouth.scale.set(1.3, 0.35, 0.4);
  P.mouth.position.y = -0.15;
}
