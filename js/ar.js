/* =========================================================
   REALIDADE AUMENTADA (WebXR "immersive-ar")
   - detectarAR(): confere se o aparelho/navegador realmente oferece AR.
   - abrirAR(produto): abre a sessão de AR, ou — se não houver suporte —
     explica o motivo e oferece o visualizador 3D comum.
   Nunca finge que a AR está ativa.
   ========================================================= */
import * as THREE from "three";
import { esc, abrirDialogo, modeloDe, imagemCapa } from "./util.js";
import { carregarObjeto, escalarParaAltura, abrirVisualizador3D } from "./visualizador3d.js";

/** { ok: boolean, motivo: "" | "inseguro" | "sem-webxr" | "sem-ar" | "erro" } */
export async function detectarAR() {
  if (!window.isSecureContext) return { ok: false, motivo: "inseguro" };
  if (!("xr" in navigator) || !navigator.xr) return { ok: false, motivo: "sem-webxr" };
  try {
    const ok = await navigator.xr.isSessionSupported("immersive-ar");
    return { ok, motivo: ok ? "" : "sem-ar" };
  } catch (e) {
    return { ok: false, motivo: "erro" };
  }
}

const MENSAGENS = {
  inseguro: "O modo AR só funciona em conexão segura. Abra o site pelo endereço que começa com https://.",
  "sem-webxr": "Este navegador não oferece realidade aumentada pela web (WebXR). Isso é comum em iPhones, iPads e computadores. No Android, o Chrome atualizado costuma funcionar.",
  "sem-ar": "Este aparelho não informou suporte a AR no navegador. Aparelhos Android recentes com Chrome atualizado e os serviços do Google Play para AR instalados costumam funcionar.",
  erro: "Não consegui verificar se o seu aparelho aceita AR.",
  sessao: "A sessão de AR não pôde ser iniciada (a câmera pode ter sido negada ou o aparelho recusou). Você ainda pode ver a peça em 3D normalmente.",
};

/* ---------- aviso amigável quando não há AR ---------- */
export function mostrarFallbackAR(produto, motivo = "sem-webxr", detalhe = "") {
  const modelo = modeloDe(produto);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const quickLook = ios && modelo && modelo.usdz
    ? `<a class="gx-btn" rel="ar" href="${esc(modelo.usdz)}"><img src="${esc(imagemCapa(produto))}" alt="" width="1" height="1" style="position:absolute;opacity:0">Abrir no AR do iPhone</a>` : "";

  const el = document.createElement("div");
  el.className = "gx-modal";
  el.setAttribute("aria-labelledby", "gx-ar-titulo");
  el.innerHTML = `
    <div class="gx-modal-card gx-ar-aviso">
      <button type="button" class="gx-fechar" data-fechar aria-label="Fechar aviso">×</button>
      <p class="gx-eyebrow">Realidade aumentada</p>
      <h2 id="gx-ar-titulo">AR indisponível por aqui</h2>
      <p>${esc(MENSAGENS[motivo] || MENSAGENS["sem-webxr"])}</p>
      ${detalhe ? `<p class="gx-pequeno">Detalhe técnico: ${esc(detalhe)}</p>` : ""}
      <p>Sem problema: você pode girar e examinar “${esc(produto.titulo)}” no visualizador 3D.</p>
      <div class="gx-acoes">
        <button type="button" class="gx-btn gx-btn-primario" data-abrir3d data-foco>Abrir visualizador 3D</button>
        ${quickLook}
        <button type="button" class="gx-btn" data-fechar>Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const fechar = abrirDialogo(el, { onClose: () => el.remove() });
  el.querySelector("[data-abrir3d]").addEventListener("click", () => { fechar(); abrirVisualizador3D(produto); });
}

/* ---------- sessão de AR ---------- */

let emSessao = false;

export async function abrirAR(produto) {
  if (emSessao) return;
  const det = await detectarAR();
  if (!det.ok) { mostrarFallbackAR(produto, det.motivo); return; }
  try {
    emSessao = true;
    await iniciarSessao(produto);
  } catch (e) {
    console.warn("[AR] falhou", e);
    emSessao = false;
    mostrarFallbackAR(produto, "sessao", e && e.message ? e.message : "");
  }
}

async function iniciarSessao(produto) {
  const modelo = modeloDe(produto);

  // painel de controles sobre a câmera (DOM overlay)
  const overlay = document.createElement("div");
  overlay.className = "gx-ar-overlay";
  overlay.innerHTML = `
    <div class="gx-ar-topo"><p class="gx-ar-msg" role="status">Aponte para o chão ou uma mesa e mova devagar o aparelho…</p></div>
    <div class="gx-ar-gesto" hidden></div>
    <div class="gx-ar-base">
      <button type="button" data-a="esq" aria-label="Girar para a esquerda">⟲</button>
      <button type="button" data-a="dir" aria-label="Girar para a direita">⟳</button>
      <button type="button" data-a="menos" aria-label="Diminuir a peça">−</button>
      <button type="button" data-a="mais" aria-label="Aumentar a peça">+</button>
      <button type="button" data-a="reposicionar" aria-label="Escolher outro lugar" hidden>Reposicionar</button>
      <button type="button" data-a="sair" class="gx-ar-sair">Sair da AR</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("beforexrselect", (e) => e.preventDefault());

  // Importante: a sessão precisa ser pedida logo após o toque do usuário,
  // então o modelo só é carregado DEPOIS que a sessão já abriu.
  let session;
  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "local-floor"],
      domOverlay: { root: overlay },
    });
  } catch (e) {
    overlay.remove();
    throw e;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad98, 1.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(1, 3, 2); scene.add(sol);

  const reticulo = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xb5502a })
  );
  reticulo.matrixAutoUpdate = false; reticulo.visible = false; scene.add(reticulo);

  const msg = overlay.querySelector(".gx-ar-msg");
  const btnRepos = overlay.querySelector('[data-a="reposicionar"]');
  const gesto = overlay.querySelector(".gx-ar-gesto");

  let objeto = null, base = 1, fator = 1, yaw = 0, colocado = false, hitSource = null;

  function aplicar() {
    if (!objeto) return;
    objeto.scale.setScalar(base * fator);
    objeto.rotation.y = yaw;
  }

  // peça: GLB/STL em tamanho real, ou foto plana (obras sem modelo)
  (async () => {
    try {
      if (modelo) {
        objeto = await carregarObjeto(modelo);
        base = (modelo.alturaCm / 100) / objeto.userData.altura;
        if (objeto.userData.formato === "stl" && !modelo.glb) {
          // sem GLB: funciona, mas o ideal para AR é GLB (ver README)
          console.info("[AR] usando STL; adicione um .glb para melhor resultado no celular.");
        }
      } else {
        objeto = await criarQuadroPlano(produto);
        base = 1;
      }
      scene.add(objeto);
      objeto.visible = false;
      aplicar();
      msg.textContent = "Aponte para uma superfície e toque na tela para posicionar a peça.";
    } catch (e) {
      console.warn("[AR] peça não carregou", e);
      msg.textContent = "Não consegui carregar a peça para a AR. Toque em “Sair da AR” e use o visualizador 3D.";
    }
  })();

  session.addEventListener("select", () => {
    if (colocado || !objeto || !reticulo.visible) return;
    objeto.position.setFromMatrixPosition(reticulo.matrix);
    objeto.visible = true; colocado = true; reticulo.visible = false;
    btnRepos.hidden = false; gesto.hidden = false;
    msg.textContent = "Arraste para girar, use dois dedos (ou os botões) para ajustar o tamanho.";
  });

  overlay.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "esq") yaw += Math.PI / 12;
    else if (a === "dir") yaw -= Math.PI / 12;
    else if (a === "mais") fator = Math.min(6, fator * 1.12);
    else if (a === "menos") fator = Math.max(0.15, fator / 1.12);
    else if (a === "reposicionar") { colocado = false; if (objeto) objeto.visible = false; btnRepos.hidden = true; gesto.hidden = true; msg.textContent = "Aponte para outra superfície e toque para posicionar."; }
    else if (a === "sair") { session.end(); return; }
    aplicar();
  });

  // gestos: 1 dedo gira, 2 dedos mudam o tamanho
  const toques = new Map(); let d0 = 0, f0 = 1;
  gesto.addEventListener("beforexrselect", (e) => e.preventDefault());
  gesto.addEventListener("pointerdown", (e) => {
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) { const [a, b] = [...toques.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); f0 = fator; }
  });
  gesto.addEventListener("pointermove", (e) => {
    const t = toques.get(e.pointerId); if (!t) return;
    if (toques.size === 1) { yaw += (e.clientX - t.x) * 0.012; }
    t.x = e.clientX; t.y = e.clientY;
    if (toques.size === 2 && d0 > 0) {
      const [a, b] = [...toques.values()];
      fator = Math.max(0.15, Math.min(6, f0 * (Math.hypot(a.x - b.x, a.y - b.y) / d0)));
    }
    aplicar();
  });
  const solta = (e) => toques.delete(e.pointerId);
  gesto.addEventListener("pointerup", solta); gesto.addEventListener("pointercancel", solta);

  await renderer.xr.setSession(session);
  const espacoVisor = await session.requestReferenceSpace("viewer");
  hitSource = await session.requestHitTestSource({ space: espacoVisor });

  renderer.setAnimationLoop((t, frame) => {
    if (frame && hitSource && !colocado && objeto) {
      const res = frame.getHitTestResults(hitSource);
      if (res.length) {
        const pose = res[0].getPose(renderer.xr.getReferenceSpace());
        reticulo.visible = true; reticulo.matrix.fromArray(pose.transform.matrix);
      } else reticulo.visible = false;
    }
    renderer.render(scene, camera);
  });

  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    if (hitSource) hitSource.cancel();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
    renderer.dispose();
    overlay.remove();
    emSessao = false;
  });
}

/** Obras planas (quadros, prints): mostra a foto como uma moldura fina, ~30 cm. */
async function criarQuadroPlano(produto) {
  const url = imagemCapa(produto);
  if (!url) throw new Error("sem imagem");
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const larg = (Number(produto.arLarguraCm) || 30) / 100;
  const alt = larg * (tex.image.height / tex.image.width);
  const g = new THREE.Group();
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(larg + 0.01, alt + 0.01, 0.012), new THREE.MeshStandardMaterial({ color: 0x2a2723 }));
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  tela.position.z = 0.0065;
  moldura.position.y = alt / 2; tela.position.y = alt / 2;
  g.add(moldura, tela);
  g.userData = { altura: alt, formato: "plano" };
  return g;
}

/** Cria o botão "Ver no meu espaço" já ligado à AR (com o texto que você quiser). */
export function criarBotaoAR(produto, { rotulo = "Ver no meu espaço", classe = "gx-btn" } = {}) {
  const b = document.createElement("button");
  b.type = "button"; b.className = classe; b.textContent = rotulo;
  b.addEventListener("click", () => abrirAR(produto));
  return b;
}
