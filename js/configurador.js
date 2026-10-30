/* =========================================================
   CONFIGURADOR DE PERSONAGEM E CENÁRIO
   - dois .stl (personagem e cenário/base) por clique ou arrastar e soltar
   - preview dividido (ou combinado), escala, rotação, cor, material,
     acabamento e iluminação
   - salva na seleção (localStorage) e gera o resumo da encomenda
   Os arquivos ficam só na sessão (URL.createObjectURL).
   ========================================================= */
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  esc, brl, fmtMB, validarArquivoSTL, STL_MAX_MB, webglDisponivel, aviso,
} from "./util.js";
import { UPLOAD_ATIVO } from "./upload-storage.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------
   PREÇOS INDICATIVOS — AJUSTE ESTES VALORES ao seu custo real.
   São uma estimativa para o visitante ter uma ideia; o valor final
   é sempre confirmado por você na encomenda.
   --------------------------------------------------------------- */
const PRECOS = {
  base: 70,                 // R$ fixos por peça (preparo, impressão mínima)
  porCm3: 0.8,              // R$ por cm³ de material
  preenchimento: 0.35,      // fração do volume que vira material (casca + miolo)
  material: { pla: 1, resina: 1.4, metal: 1.3 },
  acabamento: { fosco: 1, acetinado: 1.08, brilhante: 1.15 },
  arredondarPara: 5,        // arredonda para cima, de 5 em 5 reais
  maxDimensaoCm: 60,        // acima disso: sob consulta
  maxVolumeCm3: 5000,       // acima disso: sob consulta
};
const TAM_BASE_CM = { personagem: 10, cenario: 20 };  // 100 % de escala = este tamanho (maior dimensão)

const MATERIAIS = {
  pla:    { nome: "PLA",                rug: 0.62, met: 0.05 },
  resina: { nome: "Resina",             rug: 0.30, met: 0.05 },
  metal:  { nome: "PLA metalizado",     rug: 0.38, met: 0.75 },
};
const ACABAMENTOS = { fosco: { nome: "Fosco", d: 0.2 }, acetinado: { nome: "Acetinado", d: 0 }, brilhante: { nome: "Brilhante", d: -0.25 } };
const CORES = [
  { nome: "Off-white", hex: "#ede6d9" }, { nome: "Laranja queimado", hex: "#b5502a" },
  { nome: "Verde-musgo", hex: "#5b6b3c" }, { nome: "Preto", hex: "#2a2723" }, { nome: "Cru", hex: "#c9b99a" },
];
const LUZES = {
  estudio:   { nome: "Estúdio",   amb: [0xffffff, 0.55], key: [0xffffff, 1.2, [60, 90, 80]], rim: [0xb5502a, 0.5, [-80, 20, -60]] },
  galeria:   { nome: "Galeria (quente)", amb: [0xfff0dc, 0.6], key: [0xffe2bd, 1.3, [50, 100, 60]], rim: [0x5b6b3c, 0.35, [-70, 30, -50]] },
  contraluz: { nome: "Contraluz", amb: [0xffffff, 0.25], key: [0xffffff, 0.5, [40, 60, 80]], rim: [0xffffff, 1.5, [-30, 60, -90]] },
  neutra:    { nome: "Neutra (chapada)", amb: [0xffffff, 1.0], key: [0xffffff, 0.45, [0, 100, 100]], rim: [0xffffff, 0.2, [0, -50, -100]] },
};

const estado = {
  modo: "dividido",            // "dividido" | "juntos"
  luz: "estudio", luzIntensidade: 1,
  alvos: {
    personagem: novoAlvo("personagem", "Personagem", "#ede6d9"),
    cenario: novoAlvo("cenario", "Cenário", "#5b6b3c"),
  },
  salvoId: null,
};
function novoAlvo(id, rotulo, cor) {
  return {
    id, rotulo, arquivo: null, url: null, geo: null, volumeBruto: 0, carregando: false, reqId: 0, exemplo: false,
    cfg: { escala: 100, rot: 0, cor, material: "pla", acabamento: "fosco", zUp: true },
    grupo: new THREE.Group(), orient: new THREE.Group(), mesh: null, mat: null,
  };
}

/* ================================================================
   PALCO 3D — um renderizador, duas "janelas" (scissor)
   ================================================================ */
let renderer, palco, canvas, sujo = true;
const paineis = {};      // por alvo: { el, scene, camera, rig, theta, phi, raio, alvo }
let sceneJuntos, rigJuntos, camJuntos;

function iniciar3D() {
  palco = $("#cfg-palco"); canvas = $("#cfg-canvas");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setScissorTest(true);
  renderer.setClearColor(0xf3eee3, 1);

  for (const id of ["personagem", "cenario"]) {
    const a = estado.alvos[id];
    const scene = new THREE.Scene(); scene.background = new THREE.Color(id === "personagem" ? 0xf3eee3 : 0xece5d6);
    const rig = criarLuzes(scene);
    const chao = criarChao(); scene.add(chao);
    a.grupo.add(a.orient); scene.add(a.grupo);
    colocarPlaceholder(a);
    paineis[id] = { id, el: $(`.cfg-painel[data-alvo="${id}"]`), scene, rig, chao, camera: new THREE.PerspectiveCamera(35, 1, 0.5, 4000), theta: 0.7, phi: 0.35, raio: 60, alvo: new THREE.Vector3() };
  }
  sceneJuntos = new THREE.Scene(); sceneJuntos.background = new THREE.Color(0xf3eee3);
  rigJuntos = criarLuzes(sceneJuntos);
  const chaoJ = criarChao(); sceneJuntos.add(chaoJ);
  paineis.juntos = { id: "juntos", el: paineis.personagem.el, scene: sceneJuntos, rig: rigJuntos, chao: chaoJ, camera: new THREE.PerspectiveCamera(35, 1, 0.5, 4000), theta: 0.7, phi: 0.35, raio: 90, alvo: new THREE.Vector3() };

  pronto = true;
  posicionarTudo();
  aplicarLuz();
  new ResizeObserver(() => { medir(); }).observe(palco);
  medir();
  ligarOrbita();
  (function laco() { requestAnimationFrame(laco); if (sujo) { desenhar(); sujo = false; } })();
}

function criarLuzes(scene) {
  const amb = new THREE.AmbientLight(0xffffff, 0.5), key = new THREE.DirectionalLight(0xffffff, 1), rim = new THREE.DirectionalLight(0xffffff, 0.5);
  scene.add(amb, key, rim);
  return { amb, key, rim };
}
function criarChao() {
  const g = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x2a2723, transparent: true, opacity: 0.08 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.02;
  return g;
}

function aplicarLuz() {
  const L = LUZES[estado.luz], k = estado.luzIntensidade;
  [paineis.personagem.rig, paineis.cenario.rig, rigJuntos].forEach((r) => {
    r.amb.color.setHex(L.amb[0]); r.amb.intensity = L.amb[1] * k;
    r.key.color.setHex(L.key[0]); r.key.intensity = L.key[1] * k; r.key.position.set(...L.key[2]);
    r.rim.color.setHex(L.rim[0]); r.rim.intensity = L.rim[1] * k; r.rim.position.set(...L.rim[2]);
  });
  sujo = true;
}

function medir() {
  const w = palco.clientWidth || 600, h = palco.clientHeight || 400;
  renderer.setSize(w, h, false);
  sujo = true;
}

function retanguloDe(painel) {
  const c = canvas.getBoundingClientRect(), r = painel.el.getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height, H: c.height };
}

function desenhar() {
  const lista = estado.modo === "juntos" ? [paineis.juntos] : [paineis.personagem, paineis.cenario];
  renderer.setScissor(0, 0, canvas.clientWidth, canvas.clientHeight);
  renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
  renderer.clear();
  for (const p of lista) {
    const r = retanguloDe(p);
    if (r.w < 4 || r.h < 4) continue;
    const yGl = r.H - (r.y + r.h);
    renderer.setViewport(r.x, yGl, r.w, r.h);
    renderer.setScissor(r.x, yGl, r.w, r.h);
    p.camera.aspect = r.w / r.h; p.camera.updateProjectionMatrix();
    p.camera.position.set(
      p.alvo.x + p.raio * Math.sin(p.theta) * Math.cos(p.phi),
      p.alvo.y + p.raio * Math.sin(p.phi),
      p.alvo.z + p.raio * Math.cos(p.theta) * Math.cos(p.phi)
    );
    p.camera.lookAt(p.alvo);
    renderer.render(p.scene, p.camera);
  }
}

/* ---- órbita por mouse/toque/teclado em cada painel ---- */
function ligarOrbita() {
  for (const id of ["personagem", "cenario"]) {
    const el = paineis[id].el;
    let arr = null;
    const pegar = () => (estado.modo === "juntos" ? paineis.juntos : paineis[id]);
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, label, input")) return;
      arr = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!arr || arr.id !== e.pointerId) return;
      const p = pegar();
      p.theta -= (e.clientX - arr.x) * 0.01; p.phi = Math.max(-0.2, Math.min(1.3, p.phi + (e.clientY - arr.y) * 0.008));
      arr.x = e.clientX; arr.y = e.clientY; sujo = true;
    });
    const fim = () => { arr = null; };
    el.addEventListener("pointerup", fim); el.addEventListener("pointercancel", fim);
    el.addEventListener("wheel", (e) => { e.preventDefault(); zoom(pegar(), e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
    el.addEventListener("keydown", (e) => {
      const p = pegar(); let usou = true;
      if (e.key === "ArrowLeft") p.theta += 0.1; else if (e.key === "ArrowRight") p.theta -= 0.1;
      else if (e.key === "ArrowUp") p.phi = Math.min(1.3, p.phi + 0.07); else if (e.key === "ArrowDown") p.phi = Math.max(-0.2, p.phi - 0.07);
      else if (e.key === "+" || e.key === "=") zoom(p, 1 / 1.12); else if (e.key === "-") zoom(p, 1.12);
      else usou = false;
      if (usou) { e.preventDefault(); sujo = true; }
    });
    $$("[data-zoom]", el).forEach((b) => b.addEventListener("click", () => zoom(pegar(), b.dataset.zoom === "+" ? 1 / 1.15 : 1.15)));
  }
}
function zoom(p, f) { p.raio = Math.max(8, Math.min(1500, p.raio * f)); sujo = true; }

/* ================================================================
   MODELOS
   ================================================================ */
let pronto = false;   // vira true quando as cenas já existem

function colocarPlaceholder(a) {
  limparMalha(a);
  a.placeholder = true;                       // antes do material: ele fica em "fio de arame"
  const geo = a.id === "personagem"
    ? new THREE.CylinderGeometry(2.4, 3, 9, 20)
    : new THREE.CylinderGeometry(9, 10, 2, 40);
  a.mesh = new THREE.Mesh(geo, materialDe(a));
  a.orient.rotation.set(0, 0, 0);
  a.orient.add(a.mesh);
  if (pronto) posicionarTudo();
}

function materialDe(a) {
  if (!a.mat) a.mat = new THREE.MeshStandardMaterial({ color: a.cfg.cor });
  const m = MATERIAIS[a.cfg.material], ac = ACABAMENTOS[a.cfg.acabamento];
  a.mat.color.set(a.cfg.cor);
  a.mat.metalness = m.met;
  a.mat.roughness = Math.max(0.08, Math.min(1, m.rug + ac.d));
  a.mat.wireframe = !!a.placeholder;
  a.mat.needsUpdate = true;
  return a.mat;
}

function limparMalha(a) {
  if (a.mesh) { a.orient.remove(a.mesh); if (a.mesh.geometry && a.mesh.geometry !== a.geo) a.mesh.geometry.dispose(); a.mesh = null; }
}

/** Aplica escala, rotação, orientação e posiciona a peça com a base em y=0. */
function aplicarTransformacao(a) {
  if (!a.mesh) return;
  a.orient.rotation.set(a.placeholder ? 0 : (a.cfg.zUp ? -Math.PI / 2 : 0), 0, 0);
  a.grupo.rotation.y = THREE.MathUtils.degToRad(a.cfg.rot);
  const geo = a.mesh.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox; const sz = new THREE.Vector3(); bb.getSize(sz);
  const maior = Math.max(sz.x, sz.y, sz.z) || 1;
  const cm = TAM_BASE_CM[a.id] * (a.cfg.escala / 100);
  a.mesh.scale.setScalar(cm / maior);            // 1 unidade da cena = 1 cm
  a.grupo.updateMatrixWorld(true);
}

function posicionarTudo() {
  ["personagem", "cenario"].forEach((id) => aplicarTransformacao(estado.alvos[id]));
  // base de cada peça em y = 0, centrada em x/z
  const caixas = {};
  ["personagem", "cenario"].forEach((id) => {
    const a = estado.alvos[id];
    a.grupo.position.set(0, 0, 0); a.grupo.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(a.grupo);
    const c = box.getCenter(new THREE.Vector3());
    a.grupo.position.set(-c.x, -box.min.y, -c.z);
    a.grupo.updateMatrixWorld(true);
    caixas[id] = new THREE.Box3().setFromObject(a.grupo);
  });

  // modo "juntos": os dois na mesma cena, o personagem sobre a base
  const p = estado.alvos.personagem, c = estado.alvos.cenario;
  if (estado.modo === "juntos") {
    sceneJuntos.add(p.grupo, c.grupo);
    const alturaBase = caixas.cenario.max.y - caixas.cenario.min.y;
    if (!c.placeholder) p.grupo.position.y += alturaBase;
  } else {
    paineis.personagem.scene.add(p.grupo); paineis.cenario.scene.add(c.grupo);
  }
  enquadrar();
  sujo = true;
}

function enquadrar() {
  const ajusta = (painel, objetos) => {
    const box = new THREE.Box3();
    objetos.forEach((g) => box.union(new THREE.Box3().setFromObject(g)));
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), centro = box.getCenter(new THREE.Vector3());
    const maior = Math.max(size.x, size.y, size.z, 1);
    painel.alvo.copy(centro);
    painel.raio = maior * 2.3 / 1;
    const r = Math.max(size.x, size.z) * 0.75;
    painel.chao.scale.setScalar(Math.max(r, 4)); painel.chao.position.x = centro.x; painel.chao.position.z = centro.z;
  };
  ajusta(paineis.personagem, [estado.alvos.personagem.grupo]);
  ajusta(paineis.cenario, [estado.alvos.cenario.grupo]);
  ajusta(paineis.juntos, [estado.alvos.personagem.grupo, estado.alvos.cenario.grupo]);
}

function volumeDe(geometry) {
  const pos = geometry.attributes.position, idx = geometry.index;
  let v = 0;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v / 6);
}

/** Valida, lê e mostra um .stl. `fonte` = { file } ou { url, nome, tamanho, exemplo } */
async function receberArquivo(id, fonte) {
  const a = estado.alvos[id];
  limparErro(id);
  let url = fonte.url, nome = fonte.nome, tamanho = fonte.tamanho;

  if (fonte.file) {
    const f = fonte.file;
    const erro = await validarArquivoSTL(f);
    if (erro) { mostrarErro(id, erro); return false; }
    nome = f.name; tamanho = f.size;
    url = URL.createObjectURL(f);
  }

  const req = ++a.reqId;
  a.carregando = true; atualizarInfo(id, "Lendo o arquivo…");
  $(`.cfg-painel[data-alvo="${id}"]`).classList.add("carregando");
  try {
    const geo = await new STLLoader().loadAsync(url);
    if (req !== a.reqId) { geo.dispose(); if (fonte.file) URL.revokeObjectURL(url); return false; }
    const pos = geo.attributes && geo.attributes.position;
    if (!pos || pos.count < 3) throw new Error("sem triângulos");
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const dims = bb.getSize(new THREE.Vector3());
    if (![dims.x, dims.y, dims.z].every(Number.isFinite) || Math.max(dims.x, dims.y, dims.z) <= 0) throw new Error("dimensões inválidas");

    geo.center();                                    // centraliza
    // libera o arquivo/geometria anterior
    if (a.url && a.arquivo && a.arquivo.deSessao) URL.revokeObjectURL(a.url);
    if (a.geo) a.geo.dispose();
    limparMalha(a);
    a.geo = geo; a.placeholder = false; a.exemplo = !!fonte.exemplo;
    a.arquivo = { nome, tamanho, deSessao: !!fonte.file };
    a.url = url;
    a.volumeBruto = volumeDe(geo);
    a.cfg.escala = 100;                              // reescala automática: 100 % = tamanho-base
    a.mesh = new THREE.Mesh(geo, materialDe(a));
    a.orient.add(a.mesh);
    sincronizarControles(id);
    posicionarTudo();
    const tris = Math.round(pos.count / 3);
    let info = `${nome} · ${fmtMB(tamanho)} · ${tris.toLocaleString("pt-BR")} triângulos`;
    if (tris > 1500000) info += " — arquivo muito detalhado, o preview pode ficar lento.";
    atualizarInfo(id, info, true);
    estado.salvoId = null;
    atualizarResumo();
    return true;
  } catch (e) {
    console.warn("[configurador] falha ao ler STL", e);
    if (fonte.file) URL.revokeObjectURL(url);
    if (req === a.reqId) {
      mostrarErro(id, `Não consegui abrir “${nome || "o arquivo"}”. Ele pode estar corrompido ou não ser um STL de verdade. Tente exportá-lo de novo do programa 3D.`);
      atualizarInfo(id, a.arquivo ? `${a.arquivo.nome} · ${fmtMB(a.arquivo.tamanho)}` : "Nenhum arquivo enviado", !!a.arquivo);
    }
    return false;
  } finally {
    if (req === a.reqId) { a.carregando = false; $(`.cfg-painel[data-alvo="${id}"]`).classList.remove("carregando"); }
  }
}

function removerArquivo(id) {
  const a = estado.alvos[id];
  a.reqId++;
  if (a.url && a.arquivo && a.arquivo.deSessao) URL.revokeObjectURL(a.url);
  if (a.geo) a.geo.dispose();
  a.geo = null; a.url = null; a.arquivo = null; a.volumeBruto = 0; a.exemplo = false;
  colocarPlaceholder(a);
  atualizarInfo(id, "Nenhum arquivo enviado", false);
  limparErro(id); estado.salvoId = null; atualizarResumo();
}

/* ================================================================
   INTERFACE (arquivos, controles, resumo)
   ================================================================ */
function mostrarErro(id, msg) { const e = $(`#erro-${id}`); e.textContent = msg; e.hidden = false; $(`.cfg-caixa[data-alvo="${id}"]`).classList.add("com-erro"); }
function limparErro(id) { const e = $(`#erro-${id}`); e.textContent = ""; e.hidden = true; $(`.cfg-caixa[data-alvo="${id}"]`).classList.remove("com-erro"); }
function atualizarInfo(id, txt, ok) {
  $(`#info-${id}`).textContent = txt;
  $(`.cfg-painel[data-alvo="${id}"] .cfg-vazio`).hidden = !!estado.alvos[id].arquivo || !!estado.alvos[id].carregando;
  $(`[data-remover="${id}"]`).hidden = !estado.alvos[id].arquivo;
}

function ligarArquivos() {
  for (const id of ["personagem", "cenario"]) {
    const input = $(`#arq-${id}`), caixa = $(`.cfg-caixa[data-alvo="${id}"]`), painel = $(`.cfg-painel[data-alvo="${id}"]`);
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (f) await receberArquivo(id, { file: f });
      input.value = "";              // permite escolher o mesmo arquivo de novo
    });
    const alvos = [caixa, painel];
    alvos.forEach((el) => {
      el.addEventListener("dragenter", (e) => { e.preventDefault(); el.classList.add("arrastando"); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; el.classList.add("arrastando"); });
      el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("arrastando"); });
      el.addEventListener("drop", async (e) => {
        e.preventDefault(); e.stopPropagation(); el.classList.remove("arrastando");
        const arquivos = [...(e.dataTransfer.files || [])];
        if (!arquivos.length) { mostrarErro(id, "Não recebi nenhum arquivo. Arraste um arquivo .stl do seu computador."); return; }
        const ok = await receberArquivo(id, { file: arquivos[0] });
        if (ok && arquivos.length > 1) aviso("Recebi só o primeiro arquivo. Use a outra área para o segundo modelo.");
      });
    });
    $(`[data-remover="${id}"]`).addEventListener("click", () => removerArquivo(id));
    $(`[data-exemplo="${id}"]`).addEventListener("click", () => receberArquivo(id, { url: "assets/models/cabeca.stl", nome: "cabeca.stl (peça de exemplo do ateliê)", tamanho: 9903284, exemplo: true }));
  }
  // evita que soltar um arquivo fora das áreas faça o navegador abrir/baixar o .stl
  ["dragover", "drop"].forEach((n) => window.addEventListener(n, (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files")) e.preventDefault(); }));
}

function ligarControles() {
  for (const id of ["personagem", "cenario"]) {
    const a = estado.alvos[id], sec = $(`.cfg-caixa[data-alvo="${id}"]`);
    const mudou = () => { materialDe(a); posicionarTudo(); estado.salvoId = null; atualizarResumo(); };
    $(`[data-c="escala"]`, sec).addEventListener("input", (e) => { a.cfg.escala = +e.target.value; $(`[data-v="escala"]`, sec).textContent = a.cfg.escala + " %"; mudou(); });
    $(`[data-c="rot"]`, sec).addEventListener("input", (e) => { a.cfg.rot = +e.target.value; $(`[data-v="rot"]`, sec).textContent = a.cfg.rot + "°"; mudou(); });
    $(`[data-c="cor"]`, sec).addEventListener("input", (e) => { a.cfg.cor = e.target.value; marcarCor(sec, a.cfg.cor); mudou(); });
    $(`[data-c="material"]`, sec).addEventListener("change", (e) => { a.cfg.material = e.target.value; mudou(); });
    $(`[data-c="acabamento"]`, sec).addEventListener("change", (e) => { a.cfg.acabamento = e.target.value; mudou(); });
    $(`[data-c="zup"]`, sec).addEventListener("change", (e) => { a.cfg.zUp = e.target.checked; mudou(); });
    const chips = $(`.cfg-cores`, sec);
    chips.innerHTML = CORES.map((c) => `<button type="button" class="cfg-chip" style="--c:${c.hex}" data-hex="${c.hex}" aria-label="Cor ${esc(c.nome)}" aria-pressed="false"></button>`).join("");
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("[data-hex]"); if (!b) return;
      a.cfg.cor = b.dataset.hex; $(`[data-c="cor"]`, sec).value = a.cfg.cor; marcarCor(sec, a.cfg.cor); mudou();
    });
    marcarCor(sec, a.cfg.cor);
    $(`[data-c="cor"]`, sec).value = a.cfg.cor;
  }
  $("#cfg-luz").innerHTML = Object.entries(LUZES).map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join("");
  $("#cfg-luz").addEventListener("change", (e) => { estado.luz = e.target.value; aplicarLuz(); });
  $("#cfg-luz-int").addEventListener("input", (e) => { estado.luzIntensidade = +e.target.value / 100; $("#cfg-luz-int-v").textContent = e.target.value + " %"; aplicarLuz(); });

  $$("[data-modo]").forEach((b) => b.addEventListener("click", () => {
    estado.modo = b.dataset.modo;
    $$("[data-modo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    palco.classList.toggle("juntos", estado.modo === "juntos");
    posicionarTudo();
    requestAnimationFrame(() => { sujo = true; });
  }));
}
function marcarCor(sec, hex) {
  $$(".cfg-chip", sec).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hex.toLowerCase() === hex.toLowerCase())));
}
function sincronizarControles(id) {
  const a = estado.alvos[id], sec = $(`.cfg-caixa[data-alvo="${id}"]`);
  $(`[data-c="escala"]`, sec).value = a.cfg.escala; $(`[data-v="escala"]`, sec).textContent = a.cfg.escala + " %";
}

/* ---------- preço indicativo e resumo ---------- */
function calcularPeca(a) {
  if (!a.arquivo) return null;
  const mesh = a.mesh; const k = mesh ? mesh.scale.x : 1;
  const volCm3 = a.volumeBruto * k * k * k;
  const cm = TAM_BASE_CM[a.id] * (a.cfg.escala / 100);
  const sob = cm > PRECOS.maxDimensaoCm || volCm3 > PRECOS.maxVolumeCm3 || !(volCm3 > 0);
  let valor = null;
  if (!sob) {
    valor = (PRECOS.base + volCm3 * PRECOS.preenchimento * PRECOS.porCm3) * PRECOS.material[a.cfg.material] * PRECOS.acabamento[a.cfg.acabamento];
    valor = Math.ceil(valor / PRECOS.arredondarPara) * PRECOS.arredondarPara;
  }
  return { cm, volCm3, valor };
}

function gerarResumo() {
  const linhas = ["CONFIGURAÇÃO PERSONALIZADA — Galeria Ogeid", "Data: " + new Date().toLocaleDateString("pt-BR"), ""];
  let total = 0, sob = false, qtd = 0;
  for (const id of ["personagem", "cenario"]) {
    const a = estado.alvos[id], c = calcularPeca(a);
    linhas.push(a.rotulo.toUpperCase());
    if (!a.arquivo) { linhas.push("  (sem arquivo)"); linhas.push(""); continue; }
    qtd++;
    const cor = CORES.find((x) => x.hex.toLowerCase() === a.cfg.cor.toLowerCase());
    linhas.push(`  Arquivo: ${a.arquivo.nome} (${fmtMB(a.arquivo.tamanho)})`);
    linhas.push(`  Tamanho aproximado: ${c.cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm (maior dimensão) · escala ${a.cfg.escala} % · rotação ${a.cfg.rot}°`);
    linhas.push(`  Material: ${MATERIAIS[a.cfg.material].nome} · acabamento: ${ACABAMENTOS[a.cfg.acabamento].nome} · cor: ${cor ? cor.nome + " " : ""}${a.cfg.cor}`);
    linhas.push(`  Valor indicativo: ${c.valor ? brl(c.valor) : "sob consulta"}`);
    linhas.push("");
    if (c.valor) total += c.valor; else sob = true;
  }
  linhas.push(`Iluminação do preview: ${LUZES[estado.luz].nome} (não altera a peça)`);
  const totalTxt = !qtd ? "—" : (total ? brl(total) + (sob ? " + itens sob consulta" : "") : "Sob consulta");
  linhas.push(`TOTAL INDICATIVO: ${totalTxt}`);
  linhas.push("", "Os arquivos .stl não são enviados pelo site. Depois de fazer a encomenda, combine com o ateliê o envio dos arquivos.");
  return { texto: linhas.join("\n"), total, sob, qtd, totalTxt };
}

let ultimoResumo = null;
function atualizarResumo() {
  ultimoResumo = gerarResumo();
  $("#cfg-resumo").textContent = ultimoResumo.texto;
  $("#cfg-total").textContent = ultimoResumo.totalTxt;
  const pode = ultimoResumo.qtd > 0;
  $("#cfg-salvar").disabled = !pode; $("#cfg-copiar").disabled = !pode;
  $("#cfg-dica-salvar").textContent = pode ? "" : "Envie ao menos um arquivo .stl para salvar a configuração.";
  const enc = $("#cfg-encomendar");
  enc.hidden = !estado.salvoId;
  if (estado.salvoId && window.Selecao) enc.href = window.Selecao.linkEncomenda();
}

function miniatura() {
  try {
    desenhar();                                    // desenha agora, no mesmo instante da captura
    const w = 180, h = 135, c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), src = canvas;
    const r = src.width / src.height, rd = w / h;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (r > rd) { sw = src.height * rd; sx = (src.width - sw) / 2; } else { sh = src.width / rd; sy = (src.height - sh) / 2; }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  } catch (e) { return ""; }
}

function ligarAcoes() {
  $("#cfg-salvar").addEventListener("click", () => {
    if (!window.Selecao) { aviso("A seleção não está disponível nesta página."); return; }
    const r = gerarResumo();
    if (!r.qtd) return;
    const id = "config:" + Date.now();
    window.Selecao.adicionar({
      id, tipo: "configuracao", titulo: "Configuração personalizada",
      imagem: miniatura(), preco: r.totalTxt === "—" ? "Sob consulta" : r.totalTxt + " (indicativo)",
      precoNum: r.total || null, resumo: r.texto,
      arquivos: ["personagem", "cenario"].map((k) => estado.alvos[k].arquivo && estado.alvos[k].arquivo.nome).filter(Boolean),
    });
    estado.salvoId = id; atualizarResumo();
    aviso("Configuração salva na sua seleção.");
    $("#cfg-encomendar").focus();
  });
  $("#cfg-copiar").addEventListener("click", async () => {
    const t = gerarResumo().texto;
    try { await navigator.clipboard.writeText(t); aviso("Resumo copiado."); }
    catch (e) { window.prompt("Copie o resumo:", t); }
  });
  $("#cfg-futuro").hidden = !UPLOAD_ATIVO;
}

/* ================================================================
   INÍCIO
   ================================================================ */
function iniciar() {
  $("#cfg-limite").textContent = STL_MAX_MB + " MB";
  if (!webglDisponivel()) {
    $("#cfg-sem3d").hidden = false; $("#cfg-app").hidden = true; return;
  }
  iniciar3D();
  ligarArquivos(); ligarControles(); ligarAcoes();
  for (const id of ["personagem", "cenario"]) atualizarInfo(id, "Nenhum arquivo enviado", false);
  atualizarResumo();
}
iniciar();

window.__cfg = { estado, receberArquivo, gerarResumo, calcularPeca, PRECOS };  // depuração/testes
