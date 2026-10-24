import { Quaternion, Vector3 } from "three";

/**
 * Shoemake's arcball, as in the exercise: the drawn circle (80% of the viewport) is a
 * virtual trackball. A point inside lifts onto the sphere, a point outside snaps to the
 * rim (which gives roll). The rotation between two points is applied with its angle
 * doubled, so dragging across the whole ball turns the object a full revolution and
 * closed mouse loops come back to where they started.
 */
export const BALL_FRACTION = 0.8;

export function projectToBall(x: number, y: number, w: number, h: number): Vector3 {
  const s = (Math.min(w, h) * BALL_FRACTION) / 2;
  const p = new Vector3((x - w / 2) / s, (h / 2 - y) / s, 0);
  const d = p.x * p.x + p.y * p.y;
  if (d <= 1) p.z = Math.sqrt(1 - d);
  else p.normalize();
  return p;
}

export function arcRotation(from: Vector3, to: Vector3): Quaternion {
  const q = new Quaternion().setFromUnitVectors(from, to);
  return q.multiply(q);
}
