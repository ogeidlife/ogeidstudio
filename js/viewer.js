/* =========================================================
   VISUALIZADOR 3D — carrega o .stl e gira quando o usuário
   clica (ou toca, no celular) e arrasta sobre a peça.
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
  const group = new THREE.Group();      // gira com o arraste do usuário
  const orientFix = new THREE.Group();  // correção fixa de orientação do modelo
  group.add(orientFix);
  scene.add(group);

  // ---------------------------------------------------------------
  // CORREÇÃO DE ORIENTAÇÃO DO MODELO
  // Muitos .stl (principalmente exportados do Blender) vêm com o
  // "topo" no eixo Z, mas aqui na cena o "topo" é o eixo Y.
  // Isso faz o rosto ficar virado pra cima/baixo em vez de pra frente.
  // Ajuste os valores abaixo (em radianos: Math.PI/2 = 90°) até o
  // rosto aparecer de frente quando a página carrega.
  // Valores comuns pra testar: Math.PI/2, -Math.PI/2, Math.PI, 0
  const ORIENT_X = -Math.PI / 2;
  const ORIENT_Y = 0;
  const ORIENT_Z = 0;
  orientFix.rotation.set(ORIENT_X, ORIENT_Y, ORIENT_Z);
  // ---------------------------------------------------------------

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
        orientFix.add(mesh);
      },
      undefined,
      () => {
        // fallback: se o .stl ainda não foi adicionado, mostra uma forma provisória
        const geo = new THREE.IcosahedronGeometry(48, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2a2723, metalness: 0.1, roughness: 0.8, wireframe: true,
        });
        mesh = new THREE.Mesh(geo, mat);
        orientFix.add(mesh);
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

  // rotação só acontece enquanto o usuário clica (ou toca) e arrasta
  let isDragging = false;
  let lastX = 0, lastY = 0;
  let velY = 1, velX = 1; // pra dar uma leve "inércia" ao soltar
  const IDLE_SPEED = 0.0050; // velocidade do giro automático quando ninguém mexe

  function dragStart(x, y) {
    isDragging = true;
    lastX = x; lastY = y;
    canvas.style.cursor = "grabbing";
  }
  function dragMove(x, y) {
    if (!isDragging) return;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x; lastY = y;
    velY = dx * 0.006;
    velX = dy * 0.006;
    group.rotation.y += velY;
    group.rotation.x += velX;
  }
  function dragEnd() {
    isDragging = false;
    canvas.style.cursor = "grab";
  }

  // mouse
  stage.addEventListener("mousedown", (e) => dragStart(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => dragMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", dragEnd);

  // toque (celular/tablet)
  stage.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    dragStart(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (t) dragMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchend", dragEnd);

  function animate() {
    requestAnimationFrame(animate);
    if (group && !isDragging) {
      // gira sozinha devagar quando ninguém está mexendo,
      // e some suavemente qualquer "inércia" deixada pelo arraste
      group.rotation.y += velY + IDLE_SPEED;
      group.rotation.x += velX;
      velY *= 0.94;
      velX *= 0.94;
    }
    renderer.render(scene, camera);
  }
  animate();
}