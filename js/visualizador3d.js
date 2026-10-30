/* =========================================================
   VISUALIZADOR 3D (janela) + carregador de peças
   - carregarObjeto(): lê GLB (preferido) ou STL e devolve a peça
     centralizada, com a base em y = 0.
   - abrirVisualizador3D(): janela para girar/aproximar a peça.
     É também a alternativa quando AR não está disponível.
   ========================================================= */
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { esc, abrirDialogo, webglDisponivel, modeloDe, imagemCapa, rotuloPreco } from "./util.js";

const REDUZIR = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Carrega a peça. Prefere GLB; se não existir ou falhar, usa o STL.
 * Devolve um Group com a base em y=0 e centro em x/z=0, na escala original
 * do arquivo (STL costuma vir em mm). Use escalarParaAltura() para dar tamanho.
 * root.userData = { altura, formato: "glb" | "stl" }
 */
export async function carregarObjeto(modelo, { cor = 0xede6d9 } = {}) {
  let obj = null, formato = null;

  if (modelo.glb) {
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(modelo.glb);
      obj = gltf.scene; formato = "glb";
    } catch (e) {
      if (!modelo.stl) throw e;
      console.warn("[3D] GLB não carregou, usando o STL:", e);
    }
  }
  if (!obj && modelo.stl) {
    const geo = await new STLLoader().loadAsync(modelo.stl);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor, metalness: 0.12, roughness: 0.55 }));
    const [rx, ry, rz] = modelo.orientacao.map((g) => THREE.MathUtils.degToRad(g));
    mesh.rotation.set(rx, ry, rz);
    obj = new THREE.Group();
    obj.add(mesh);
    formato = "stl";
  }
  if (!obj) throw new Error("Nenhum arquivo de modelo informado");

  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centro = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(centro.x, box.min.y, centro.z));

  const raiz = new THREE.Group();
  raiz.add(obj);
  raiz.userData = { altura: size.y || 1, largura: Math.max(size.x, size.z) || 1, formato };
  return raiz;
}

/** Dá à peça uma altura real, em unidades da cena (ex.: metros → 0.12 = 12 cm). */
export function escalarParaAltura(raiz, altura) {
  raiz.scale.setScalar(altura / raiz.userData.altura);
  return raiz;
}

/* ---------------- janela do visualizador ---------------- */

export function abrirVisualizador3D(produto) {
  const modelo = modeloDe(produto);
  const capa = imagemCapa(produto);

  const el = document.createElement("div");
  el.className = "gx-modal";
  el.setAttribute("aria-labelledby", "gx-v3d-titulo");
  el.innerHTML = `
    <div class="gx-modal-card gx-v3d">
      <button type="button" class="gx-fechar" data-fechar aria-label="Fechar visualizador">×</button>
      <p class="gx-eyebrow">${esc(produto.numero || "")}</p>
      <h2 id="gx-v3d-titulo">${esc(produto.titulo)}</h2>
      <div class="gx-v3d-palco" tabindex="0" aria-label="Visualizador 3D de ${esc(produto.titulo)}. Arraste ou use as setas para girar; + e − para aproximar.">
        <canvas class="gx-v3d-canvas"></canvas>
        <p class="gx-v3d-status" role="status">Carregando a peça…</p>
      </div>
      <p class="gx-v3d-dica">Arraste para girar · role ou use + / − para aproximar</p>
      <div class="gx-acoes">
        <a class="gx-btn gx-btn-primario" href="produto.html?key=${encodeURIComponent(produto.key || "")}">Ver página da peça</a>
        <button type="button" class="gx-btn" data-fechar data-foco>Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  let raf = 0, renderer = null;
  const fechar = abrirDialogo(el, {
    onClose() {
      cancelAnimationFrame(raf);
      if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); }
      el.remove();
    },
  });

  const palco = el.querySelector(".gx-v3d-palco");
  const canvas = el.querySelector("canvas");
  const status = el.querySelector(".gx-v3d-status");

  function mostrarImagem(msg) {
    palco.innerHTML = capa
      ? `<img class="gx-v3d-img" src="${esc(capa)}" alt="Foto de ${esc(produto.titulo)}"><p class="gx-v3d-status gx-v3d-status-fixo">${esc(msg)}</p>`
      : `<p class="gx-v3d-status gx-v3d-status-fixo">${esc(msg)}</p>`;
    palco.removeAttribute("tabindex");
  }

  if (!modelo) { mostrarImagem("Esta peça ainda não tem modelo 3D. Veja a foto ou abra a página da peça."); return fechar; }
  if (!webglDisponivel()) { mostrarImagem("Seu navegador não conseguiu iniciar gráficos 3D. Mostrando a foto da peça."); return fechar; }

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad98, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb5502a, 0.6); rim.position.set(-4, 1, -3); scene.add(rim);

  let yaw = 0.6, pitch = 0.15, dist = 5, alvoY = 1;

  function medir() {
    const w = palco.clientWidth || 320, h = palco.clientHeight || 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(medir); ro.observe(palco); medir();

  carregarObjeto(modelo).then((raiz) => {
    escalarParaAltura(raiz, 2);       // na janela a peça tem 2 unidades de altura
    scene.add(raiz);
    alvoY = 1; dist = 6.2;
    status.hidden = true;
  }).catch((e) => {
    console.warn("[3D] erro ao carregar", e);
    cancelAnimationFrame(raf);
    mostrarImagem("Não consegui carregar o modelo 3D agora. Mostrando a foto da peça.");
  });

  let arrastando = false, ux = 0, uy = 0, giro = !REDUZIR;
  palco.addEventListener("pointerdown", (e) => { arrastando = true; ux = e.clientX; uy = e.clientY; giro = false; palco.setPointerCapture(e.pointerId); });
  palco.addEventListener("pointermove", (e) => {
    if (!arrastando) return;
    yaw -= (e.clientX - ux) * 0.01; pitch = Math.max(-0.6, Math.min(1.1, pitch + (e.clientY - uy) * 0.008));
    ux = e.clientX; uy = e.clientY;
  });
  const soltar = () => { arrastando = false; };
  palco.addEventListener("pointerup", soltar); palco.addEventListener("pointercancel", soltar);
  palco.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.max(3, Math.min(12, dist + e.deltaY * 0.005)); }, { passive: false });
  palco.addEventListener("keydown", (e) => {
    const k = e.key; let usou = true;
    if (k === "ArrowLeft") yaw += 0.12; else if (k === "ArrowRight") yaw -= 0.12;
    else if (k === "ArrowUp") pitch = Math.min(1.1, pitch + 0.08); else if (k === "ArrowDown") pitch = Math.max(-0.6, pitch - 0.08);
    else if (k === "+" || k === "=") dist = Math.max(3, dist - 0.5); else if (k === "-") dist = Math.min(12, dist + 0.5);
    else usou = false;
    if (usou) { e.preventDefault(); giro = false; }
  });

  function loop() {
    raf = requestAnimationFrame(loop);
    if (giro && !arrastando) yaw += 0.006;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, alvoY + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, alvoY, 0);
    renderer.render(scene, camera);
  }
  loop();
  const fecharOriginal = fechar;
  return () => { ro.disconnect(); fecharOriginal(); };
}
