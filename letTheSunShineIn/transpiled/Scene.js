// ------------------------------------------------
// BASIC SETUP
// -----------------------------------------------
import * as THREE from '../node_modules/three/build/three.module.js';
import sun_fragment_shader from '../myShaders/sun_fragment_shader.glsl.js';
import sun_vertex_shader from '../myShaders/sun_vertex_shader.glsl.js';
// import default_fragment from '/myShaders/test_fragment_shader';
// Create an empty scene
let scene = new THREE.Scene();
// Create a basic perspective camera
let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// let width = window.innerWidth;
// let height = window.innerHeight;
// let camera = new THREE.OrthographicCamera( width / - 2, width / 2, height / 2, height / - 2, 0.1, 1000 );
camera.position.z = 4;
// Create a renderer with Antialiasing
let renderer = new THREE.WebGLRenderer({ antialias: true });
// Configure renderer clear color
renderer.setClearColor("#000000");
// Configure renderer size
renderer.setSize(window.innerWidth - 5, window.innerHeight - 5); // todo - temp solution for full screen
// Append Renderer to DOM
document.body.appendChild(renderer.domElement);
// const composer = new EffectComposer(renderer);
//  composer.addPass(new THREE.RenderPass(scene, camera));
//  const colorShader = {
//    uniforms: {
//      tDiffuse: { value: 2 },
//      color:    { value: new THREE.Color(0x88CCFF) },
//    },
//    vertexShader: `
//      varying vec2 vUv;
//      void main() {
//        vUv = uv;
//        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
//      }
//    `,
//    fragmentShader: `
//      uniform vec3 color;
//      uniform sampler2D tDiffuse;
//      varying vec2 vUv;
//      void main() {
//        vec4 previousPassColor = texture2D(tDiffuse, vUv);
//        gl_FragColor = vec4(
//            previousPassColor.rgb * color,
//            previousPassColor.a);
//      }
//    `,
//  };
//  const colorPass = new THREE.ShaderPass(colorShader);
//  colorPass.renderToScreen = true;
//  composer.addPass(colorPass);
// ------------------------------------------------
// GLOBALS
// ------------------------------------------------
let WHEEL_SENSITIVITY = 0.1;
// ------------------------------------------------
// FUN STARTS HERE
// ------------------------------------------------
// Create a Cube Mesh with basic material
let BoxGeometry = new THREE.BoxGeometry(1, 1, 1);
let SphereGeometry = new THREE.SphereGeometry(1, 50, 50, 0, Math.PI * 2, 0, Math.PI * 2);
//let material = new THREE.MeshBasicMaterial( { color: "#433F81" } );
let clock = new THREE.Clock();
let wheel = 0;
window.addEventListener("wheel", function (e) {
    console.log("scrolled");
    wheel += WHEEL_SENSITIVITY;
    // code to increment object.position.z 
}, true);
// define uniforms for shaders
let uniforms1 = {
    "time": { value: 1.0 }
};
let uniforms2 = {
    "time": { value: 1.0 },
    "texture": { value: new THREE.TextureLoader().load('textures/disturb.jpg') }
};
uniforms2["texture"].value.wrapS = uniforms2["texture"].value.wrapT = THREE.RepeatWrapping;
let material = new THREE.ShaderMaterial({
    uniforms: uniforms2,
    vertexShader: sun_vertex_shader,
    fragmentShader: sun_fragment_shader
});
// create geometry object
let sphere = new THREE.Mesh(SphereGeometry, material);
// Add cube to Scene
scene.add(sphere);
// Render Loop
let render = function () {
    requestAnimationFrame(render);
    let delta = clock.getDelta();
    uniforms1["time"].value += delta * 5;
    uniforms2["time"].value = clock.elapsedTime;
    sphere.position.y = wheel;
    wheel = Math.max(wheel - 0.02, -10);
    // Render the scene
    renderer.render(scene, camera);
};
render();
//# sourceMappingURL=Scene.js.map