/* =========================================================
   VISUALIZADOR 3D — carrega o .stl e roda conforme o mouse
   move sobre o palco (hero-stage). Não precisa clicar/arrastar,
   basta passar o mouse por cima.
   ========================================================= */
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const stage  = document.getElementById("hero-stage");
const canvas = document.getElementById("viewer-canvas");

if (stage && canvas) {
  const STL_PATH = "assets/models/cabeca.stl"; // <- troque pelo seu arquivo .stl

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  camera.position.set(0, 0, 180);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(80, 120, 140);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb5502a, 0.6);
  rim.position.set(-120, -40, -80);
  scene.add(rim);

  let mesh = null;
  const group = new THREE.Group();
  scene.add(group);

  function fitAndCenter(geometry) {
    geometry.center();
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 50;
    const scale = 55 / radius;
    return scale;
  }

  function loadModel(path) {
    const loader = new STLLoader();
    loader.load(
      path,
      (geometry) => {
        const scale = fitAndCenter(geometry);
        const material = new THREE.MeshStandardMaterial({
          color: 0xede6d9,
          metalness: 0.15,
          roughness: 0.55,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        group.add(mesh);
      },
      undefined,
      () => {
        // fallback: se o .stl ainda não foi adicionado, mostra uma forma provisória
        const geo = new THREE.IcosahedronGeometry(48, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2a2723, metalness: 0.1, roughness: 0.8, wireframe: true,
        });
        mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
        console.warn(
          "[viewer] Não encontrei " + STL_PATH +
          " — mostrando placeholder. Coloque seu arquivo .stl em assets/models/cabeca.stl"
        );
      }
    );
  }

  loadModel(STL_PATH);

  function resize() {
    const size = stage.clientWidth;
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // rotação alvo controlada pelo mouse sobre o palco
  let targetX = 0, targetY = 0;
  let idleAngle = 0;

  stage.addEventListener("mousemove", (e) => {
    const rect = stage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width * 2 - 1;   // -1 a 1
    const ny = (e.clientY - rect.top) / rect.height * 2 - 1;   // -1 a 1
    targetY = nx * 0.9;   // esquerda/direita -> gira no eixo Y
    targetX = ny * 0.5;   // cima/baixo -> gira no eixo X
  });

  stage.addEventListener("mouseleave", () => {
    targetX = 0; targetY = 0;
  });

  function animate() {
    requestAnimationFrame(animate);
    idleAngle += 0.0025;
    if (group) {
      group.rotation.y += (targetY + idleAngle - group.rotation.y) * 0.06;
      group.rotation.x += (targetX - group.rotation.x) * 0.06;
    }
    renderer.render(scene, camera);
  }
  animate();
}
