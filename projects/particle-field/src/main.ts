import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Clock,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fragmentShader, vertexShader } from "./shaders.ts";

const COUNT = matchMedia("(pointer: coarse)").matches ? 60_000 : 150_000;

const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.minDistance = 2;
controls.maxDistance = 20;

// Particles start uniformly inside a sphere; the shader does all the motion.
const positions = new Float32Array(COUNT * 3);
const seeds = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const r = 3 * Math.cbrt(Math.random());
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  positions.set(
    [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
    i * 3,
  );
  seeds[i] = Math.random();
}
const geometry = new BufferGeometry();
geometry.setAttribute("position", new BufferAttribute(positions, 3));
geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));

const uniforms = {
  uTime: { value: 0 },
  uPulse: { value: 0 },
  uPixelRatio: { value: renderer.getPixelRatio() },
};
const material = new ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
});
scene.add(new Points(geometry, material));

// A click sends a pulse through the field that decays over about a second.
let pulse = 0;
renderer.domElement.addEventListener("click", () => {
  pulse = 1;
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  pulse = Math.max(0, pulse - dt);
  uniforms.uTime.value = clock.elapsedTime;
  uniforms.uPulse.value = pulse * pulse;
  controls.update();
  renderer.render(scene, camera);
});
