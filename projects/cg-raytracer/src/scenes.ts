// The two scenes of the exercise, transcribed from ex4c.cc and ex4b.cc.

export type Vec3 = [number, number, number];
export const TEX = { none: 0, checker: 1, warning: 2, earth: 3 } as const;

export interface Material {
  diffuse: Vec3;
  specular?: Vec3;
  shininess?: number;
  reflection?: Vec3;
  transparency?: Vec3;
  ior?: number;
  ambient?: Vec3;
  tex?: number;
}

export interface SceneDef {
  label: string;
  camera: { pos: Vec3; target: Vec3 };
  background: Vec3;
  ambient: Vec3;
  /** Sphere lights; radius 0 is the original's point light. */
  lights: { center: Vec3; radius: number; color: Vec3 }[];
  spheres: { center: Vec3; radius: number; mat: Material }[];
  plane: { y: number; half: number; mat: Material };
  cylinder?: { a: Vec3; b: Vec3; radius: number; mat: Material };
}

const white: Vec3 = [1, 1, 1];
const s = (k: number): Vec3 => [k, k, k];

export const SCENES: Record<string, SceneDef> = {
  final: {
    label: "ex4c: soft shadows, glass, earth",
    camera: { pos: [-1, 2, 25], target: [0, 0, 0] },
    background: [0, 0, 0],
    ambient: s(0.1),
    lights: [
      { center: [10, 100, 10], radius: 2, color: white },
      { center: [10, 20, -10], radius: 2, color: white },
    ],
    spheres: [
      {
        center: [10, 0, 4],
        radius: 7,
        mat: { diffuse: white, specular: white, shininess: 16, ambient: white, tex: TEX.earth },
      },
      {
        center: [-10, 0, -20],
        radius: 10,
        mat: {
          diffuse: [0, 0, 1],
          reflection: s(0.5),
          transparency: white,
          ior: 2,
          specular: white,
          shininess: 16,
        },
      },
    ],
    plane: { y: -10, half: 100, mat: { diffuse: s(0.5), reflection: s(0.4), tex: TEX.checker } },
    cylinder: {
      a: [-15, -20, 0],
      b: [-15, 20, 0],
      radius: 4,
      mat: { diffuse: [0, 1, 0.4], specular: white, shininess: 16, tex: TEX.checker },
    },
  },
  spheres: {
    label: "ex4b: four spheres, point lights",
    camera: { pos: [-1, 6, 25], target: [0, 0, 0] },
    background: [0.5, 0.5, 1],
    ambient: s(0.1),
    lights: [
      { center: [10, 100, 10], radius: 0, color: white },
      { center: [10, 20, 30], radius: 0, color: white },
    ],
    spheres: [
      {
        center: [10, 0, -2],
        radius: 4,
        mat: { diffuse: white, specular: white, shininess: 16, tex: TEX.checker },
      },
      {
        center: [0, 0, -10],
        radius: 4,
        mat: {
          diffuse: [1, 0.8, 0],
          reflection: s(0.2),
          specular: white,
          shininess: 256,
          tex: TEX.warning,
        },
      },
      {
        center: [-10, 0, -2],
        radius: 4,
        mat: {
          diffuse: [0, 0, 1],
          reflection: s(0.5),
          transparency: s(0.5),
          ior: 2,
          specular: white,
          shininess: 16,
        },
      },
      {
        center: [0, 0, 10],
        radius: 4,
        mat: { diffuse: s(0.1), transparency: s(0.9), ior: 1.5, specular: white, shininess: 64 },
      },
    ],
    plane: {
      y: -4,
      half: 100,
      mat: { diffuse: [0.2, 0.1, 0.2], reflection: [1, 0.5, 1], tex: TEX.checker },
    },
  },
};
