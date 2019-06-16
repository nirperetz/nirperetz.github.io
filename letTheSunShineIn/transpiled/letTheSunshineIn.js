import * as THREE from '../node_modules/three/build/three.module.js';
import sun_fragment_shader from '../myShaders/sun_fragment_shader.glsl.js';
import sun_vertex_shader from '../myShaders/sun_vertex_shader.glsl.js';
// ------------------------------------------------
// GLOBALS
// ------------------------------------------------
let WHEEL_SENSITIVITY = 0.0005;
let GRAVITY = 0.0001;
let SCREEN_HEIGHT = window.innerHeight / 40;
let SUN_RADIUS = 7.5;
let WHEEL_START_POSITION = 0.9;
// ------------------------------------------------
// FUN STARTS HERE
// ------------------------------------------------
let main = function () {
    //mvc:
    //model
    let model = new Model();
    //view
    let view = new View();
    //controller
    let controller = new Controller(view, model);
    controller.start();
};
class View {
    constructor() {
        // Create a renderer with Antialiasing
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        // Configure renderer clear color
        this.renderer.setClearColor("#000000");
        // Configure renderer size
        this.renderer.setSize(window.innerWidth - 5, window.innerHeight - 5); // todo - temp solution for full screen
        // Append Renderer to DOM
        document.body.appendChild(this.renderer.domElement); // todo - should be in controller.
        let elem = this.renderer.domElement;
        elem.addEventListener("click", function (event) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            }
            else if (elem.mozRequestFullScreen) { /* Firefox */
                elem.mozRequestFullScreen();
            }
            else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
                elem.webkitRequestFullscreen();
            }
            else if (elem.msRequestFullscreen) { /* IE/Edge */
                elem.msRequestFullscreen();
            }
            elem.requestPointerLock();
        }, false);
    }
    render() {
    }
}
class Model {
    constructor() {
        // Create an empty scene
        this.scene = new THREE.Scene();
        // Create a basic perspective camera
        //let camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );
        this.camera = new THREE.OrthographicCamera(window.innerWidth / -40, window.innerWidth / 40, window.innerHeight / 40, window.innerHeight / -40, -500, 1000);
        this.camera.position.z = 4;
        // Create a Cube Mesh with basic material
        let BoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        let SphereGeometry = new THREE.SphereGeometry(SUN_RADIUS, 200, 200, 0, Math.PI * 2, 0, Math.PI * 2);
        // define uniforms for shaders
        this.uniforms1 = {
            "time": { value: 1.0 }
        };
        this.uniforms2 = {
            "time": { value: 1.0 },
            "texture": { value: new THREE.TextureLoader().load('textures/disturb.jpg') }
        };
        this.uniforms2["texture"].value.wrapS = this.uniforms2["texture"].value.wrapT = THREE.RepeatWrapping;
        let material = new THREE.ShaderMaterial({
            uniforms: this.uniforms2,
            vertexShader: sun_vertex_shader,
            fragmentShader: sun_fragment_shader
        });
        //material = new THREE.MeshBasicMaterial( { color: "#433F81" } );
        // create geometry object
        let sphere = new THREE.Mesh(SphereGeometry, material);
        // Add cube to Scene
        //this.GameObjects.push( sphere );
        this.sun = sphere;
        this.scene.add(sphere);
    }
    update(wheel, clock) {
        let delta = clock.getDelta();
        this.uniforms1["time"].value += delta * 5;
        this.uniforms2["time"].value = clock.elapsedTime;
        let x = wheel; // todo: document 0.24 (shader )
        let toScreenFactor = (SCREEN_HEIGHT - 0.24) * 2;
        this.sun.position.y = Math.pow(Math.sin(5 * x / Math.PI), 20) * toScreenFactor - SCREEN_HEIGHT - SUN_RADIUS + 0.24;
        // console.log("sun position: " + this.sun.position.y);
        // console.log("whell: " + wheel);
    }
}
class Controller {
    constructor(view, model) {
        this.scrolling = false;
        this.tutorial = false;
        this.view = view;
        this.model = model;
        this.clock = new THREE.Clock();
        this.wheel = WHEEL_START_POSITION;
        // add listner
        window.addEventListener("wheel", () => {
            // console.log("scrolled");
            this.wheel += WHEEL_SENSITIVITY;
            this.scrolling = true;
            // stop tutorial while scrolling.
            this.tutorial = false;
        }, true);
    }
    update() {
        if (this.tutorial) {
            // run tutorial
            console.log("TUTORIAL!!!!");
            this.tutorialCounter++;
            this.wheel = Math.sin(this.tutorialCounter * 0.004) * 0.35 + 0.3;
        }
        else {
            this.wheel -= GRAVITY;
        }
        if (this.wheel <= 0.3) {
            this.tutorial = true;
            this.tutorialCounter = 0;
        }
        this.wheel = Math.max(this.wheel, 0);
        this.wheel = Math.min(this.wheel, 1);
        // Render the scene
        requestAnimationFrame(() => this.update());
        this.model.update(this.wheel, this.clock);
        this.view.renderer.render(this.model.scene, this.model.camera);
    }
    start() {
        this.update();
    }
}
main();
//# sourceMappingURL=letTheSunshineIn.js.map