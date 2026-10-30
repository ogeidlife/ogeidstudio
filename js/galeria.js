/* =========================================================
   GALERIA OGEID — galeria 3D navegável (Three.js)
   - personagem em terceira pessoa (WASD/setas, joystick no celular)
   - obras do data/produtos.json em molduras na parede; peças com
     modelo 3D ficam em pedestais
   - hotspots: chegue perto (aparece o botão "Ver") ou clique/toque
   ========================================================= */
import * as THREE from "three";
import {
  esc, carregarProdutos, modeloDe, imagemCapa, rotuloPreco, webglDisponivel,
  abrirDialogo, aviso, adicionarProdutoASelecao,
} from "./util.js";
import { abrirAR } from "./ar.js";
import { abrirVisualizador3D, carregarObjeto, escalarParaAltura } from "./visualizador3d.js";

const REDUZIR = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s) => document.querySelector(s);

const COR = { fundo: 0xeee8da, parede: 0xf5f0e5, rodape: 0x2a2723, laranja: 0xb5502a, musgo: 0x5b6b3c, offwhite: 0xede6d9 };
const ESPACO_OBRA = 3.4;      // largura reservada por obra na parede
const RAIO_JOGADOR = 0.42;
const DIST_HOTSPOT = 3.1;     // distância para aparecer o botão "Ver"
const DIST_CARREGAR = 15;     // carrega imagem/modelo quando o visitante chega perto

const estado = { ativo: false, modal: false, itens: [], pedestais: [], produtos: [] };

main();

async function main() {
  const loading = $("#gx-loading"), loadingTxt = $("#gx-loading-txt");

  let produtos = [];
  try {
    produtos = await carregarProdutos();
  } catch (e) {
    console.error(e);
    return semGaleria("Não consegui carregar o catálogo (data/produtos.json). Se você abriu o arquivo direto do computador, abra o site por um servidor local ou pelo endereço publicado.", []);
  }
  estado.produtos = produtos;

  if (!webglDisponivel()) {
    return semGaleria("Seu navegador ou aparelho não conseguiu iniciar gráficos 3D (WebGL). Você pode ver todas as obras pela lista abaixo ou pelo catálogo.", produtos);
  }

  loadingTxt.textContent = "Montando as salas…";
  construirCena(produtos);
  montarListaObras(produtos);
  ligarInterface();

  loading.hidden = true;
  const iniciar = $("#gx-iniciar");
  $("#gx-start").hidden = false;
  iniciar.focus();
}

/* ---------- plano B (sem WebGL / sem catálogo) ---------- */
function semGaleria(mensagem, produtos) {
  $("#gx-loading").hidden = true;
  const box = $("#gx-sem3d");
  box.hidden = false;
  $("#gx-sem3d-msg").textContent = mensagem;
  $("#gx-sem3d-lista").innerHTML = produtos.map((p) =>
    `<li><a href="produto.html?key=${encodeURIComponent(p.key)}">${esc(p.titulo)}</a> <span>${esc(rotuloPreco(p.preco))}</span></li>`
  ).join("");
  $("#gx-hud").hidden = true;
}

/* ====================================================================
   CENA
   ==================================================================== */
let renderer, scene, camera, clock;
let sala = { W: 30, D: 20 };
let jogador, jogadorCorpo;
const colisores = [];            // círculos {x,z,r}
const clicaveis = [];            // malhas clicáveis (userData.item)
const pos = new THREE.Vector3(0, 0, 0);
let yaw = 0, heading = Math.PI;  // yaw = câmera; heading = para onde o personagem olha
let tempoAnim = 0;

function construirCena(produtos) {
  const canvas = $("#gx-canvas");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    estado.ativo = false;
    semGaleria("O navegador interrompeu os gráficos 3D (pouca memória). Recarregue a página para voltar à galeria.", estado.produtos);
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(COR.fundo);
  scene.fog = new THREE.Fog(COR.fundo, 26, 60);
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb9ad98, 1.15));
  const sol = new THREE.DirectionalLight(0xffffff, 1.0);
  sol.position.set(8, 14, 6);
  scene.add(sol);

  // separa: peças com modelo 3D -> pedestal; o resto -> parede
  const comModelo = [], naParede = [];
  produtos.forEach((p) => (modeloDe(p) ? comModelo : naParede).push(p));

  dimensionarSala(naParede.length);
  construirSala();
  distribuirParede(naParede);
  distribuirPedestais(comModelo);
  construirPlaca();
  construirJogador();

  // começa na entrada (parte de baixo da sala), olhando para o fundo
  pos.set(0, 0, sala.D / 2 - 5.5);
  jogador.position.copy(pos);
  yaw = 0; heading = Math.PI;

  redimensionar();
  window.addEventListener("resize", redimensionar);
  window.addEventListener("orientationchange", () => setTimeout(redimensionar, 200));
  renderer.setAnimationLoop(quadro);
}

function dimensionarSala(n) {
  let W = 26;
  const cap = (L) => Math.max(1, Math.floor((L - 3) / ESPACO_OBRA));
  for (;;) {
    const D = Math.max(16, Math.round(W / 1.5 / 2) * 2);
    if (cap(W) * 2 + cap(D) * 2 >= n) { sala = { W, D }; return; }
    W += 2;
  }
}

function texturaPiso() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#dcd4c1"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? "#d5ccb8" : "#e0d8c6"; g.fillRect(0, i * 64, 256, 64);
    g.fillStyle = "rgba(42,39,35,.16)"; g.fillRect(0, i * 64, 256, 2);
    g.fillRect(((i * 97) % 200) + 20, i * 64, 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(sala.W / 4, sala.D / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function construirSala() {
  const { W, D } = sala, H = 5;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: texturaPiso(), roughness: 0.9 }));
  piso.rotation.x = -Math.PI / 2;
  scene.add(piso);

  const matParede = new THREE.MeshStandardMaterial({ color: COR.parede, roughness: 1 });
  const matRodape = new THREE.MeshStandardMaterial({ color: COR.rodape, roughness: 0.8 });
  const matFaixa = new THREE.MeshStandardMaterial({ color: COR.laranja, roughness: 0.8 });
  // [comprimento, x, z, rotY]
  [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]].forEach(([L, x, z, r]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, H), matParede); p.position.y = H / 2; g.add(p);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 0.05), matRodape); rod.position.set(0, 0.09, 0.03); g.add(rod);
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.02), matFaixa); faixa.position.set(0, 3.55, 0.012); g.add(faixa);
    scene.add(g);
  });

  // tapete laranja no centro, marcando o caminho
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(3.2, D - 6), new THREE.MeshStandardMaterial({ color: COR.laranja, roughness: 1 }));
  tapete.rotation.x = -Math.PI / 2; tapete.position.y = 0.01; scene.add(tapete);
  const tapete2 = new THREE.Mesh(new THREE.PlaneGeometry(2.7, D - 6.6), new THREE.MeshStandardMaterial({ color: 0xc66a40, roughness: 1 }));
  tapete2.rotation.x = -Math.PI / 2; tapete2.position.y = 0.012; scene.add(tapete2);
}

/* --- etiquetas em canvas --- */
function desenharPlaca(item, w = 512, h = 168) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#f7f3ea"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#2a2723"; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = "#9a3f1e"; g.font = '500 24px "IBM Plex Mono", monospace'; g.textBaseline = "top";
  g.fillText(String(item.p.numero || "").slice(0, 24), 22, 18);
  g.fillStyle = "#2a2723"; g.font = '40px "Archivo Black", Impact, sans-serif';
  let t = String(item.p.titulo || ""); while (g.measureText(t).width > w - 44 && t.length > 4) t = t.slice(0, -2);
  if (t !== item.p.titulo) t += "…";
  g.fillText(t, 22, 56);
  g.fillStyle = "#4a443c"; g.font = '500 26px "IBM Plex Mono", monospace';
  g.fillText(rotuloPreco(item.p.preco), 22, 112);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function distribuirParede(produtos) {
  const { W, D } = sala;
  // N, E, S, W — sentido horário visto de cima
  const paredes = [
    { L: W, centro: new THREE.Vector3(0, 0, -D / 2), dentro: new THREE.Vector3(0, 0, 1), tang: new THREE.Vector3(1, 0, 0), rot: 0 },
    { L: D, centro: new THREE.Vector3(W / 2, 0, 0), dentro: new THREE.Vector3(-1, 0, 0), tang: new THREE.Vector3(0, 0, 1), rot: -Math.PI / 2 },
    { L: W, centro: new THREE.Vector3(0, 0, D / 2), dentro: new THREE.Vector3(0, 0, -1), tang: new THREE.Vector3(-1, 0, 0), rot: Math.PI },
    { L: D, centro: new THREE.Vector3(-W / 2, 0, 0), dentro: new THREE.Vector3(1, 0, 0), tang: new THREE.Vector3(0, 0, -1), rot: Math.PI / 2 },
  ];
  const n = produtos.length, soma = paredes.reduce((s, p) => s + p.L, 0);
  const qtd = paredes.map((p) => Math.floor(n * p.L / soma));
  let resto = n - qtd.reduce((a, b) => a + b, 0);
  for (let i = 0; resto > 0; i = (i + 1) % 4, resto--) qtd[i]++;

  let k = 0;
  paredes.forEach((par, wi) => {
    const cnt = qtd[wi];
    for (let i = 0; i < cnt; i++) {
      const p = produtos[k++]; if (!p) break;
      const off = (i + 0.5) * (par.L / cnt) - par.L / 2;
      const ponto = par.centro.clone().addScaledVector(par.tang, off);
      criarObraNaParede(p, ponto, par.dentro, par.rot);
    }
  });
}

function criarObraNaParede(p, ponto, dentro, rot) {
  const item = { p, tipo: "parede", ancora: ponto.clone().addScaledVector(dentro, 1.2), texEstado: null, aspecto: 0.8, imagem: imagemCapa(p) };
  const g = new THREE.Group();
  g.position.copy(ponto).addScaledVector(dentro, 0.05); g.position.y = 1.9; g.rotation.y = rot;

  const moldura = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.08), new THREE.MeshStandardMaterial({ color: COR.rodape, roughness: 0.6 }));
  const arte = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd9d1be, toneMapped: false }));
  arte.position.z = 0.045;
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.49), new THREE.MeshBasicMaterial({ map: desenharPlaca(item), toneMapped: false }));
  g.add(moldura, arte, placa);
  Object.assign(item, { grupo: g, moldura, arte, placa });
  ajustarMoldura(item);
  arte.userData.item = item; moldura.userData.item = item;
  clicaveis.push(arte, moldura);
  scene.add(g);
  estado.itens.push(item);
}

function ajustarMoldura(item) {
  const maxW = 2.3, maxH = 2.0;
  let w = maxW, h = w / item.aspecto;
  if (h > maxH) { h = maxH; w = h * item.aspecto; }
  item.moldura.scale.set(w + 0.18, h + 0.18, 1);
  item.arte.scale.set(w, h, 1);
  item.placa.position.set(0, -(h / 2) - 0.5, 0.045);
}

function distribuirPedestais(produtos) {
  const n = produtos.length;
  produtos.forEach((p, i) => {
    const x = (i - (n - 1) / 2) * 4.6, z = -1;
    const item = { p, tipo: "pedestal", ancora: new THREE.Vector3(x, 0, z), texEstado: null, modeloEstado: null, imagem: imagemCapa(p) };
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.05, 32), new THREE.MeshStandardMaterial({ color: COR.musgo, roughness: 0.85 }));
    base.position.y = 0.525;
    const topo = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.07, 32), new THREE.MeshStandardMaterial({ color: COR.offwhite, roughness: 0.6 }));
    topo.position.y = 1.085;
    // forma provisória até o modelo carregar
    const prov = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: COR.rodape, wireframe: true }));
    prov.position.y = 1.6;
    const giro = new THREE.Group(); giro.position.y = 1.12; giro.add(prov);
    // hitbox simples para o clique
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.3; hit.userData.item = item;
    // rótulo sempre de frente
    const rot = criarRotuloSprite(item);
    rot.position.y = 2.9;
    g.add(base, topo, giro, hit, rot);
    scene.add(g);
    Object.assign(item, { grupo: g, giro, prov, base });
    clicaveis.push(hit);
    colisores.push({ x, z, r: 1.0 });
    estado.itens.push(item); estado.pedestais.push(item);
  });
}

function criarRotuloSprite(item) {
  const tex = desenharPlaca(item);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthTest: true }));
  s.scale.set(1.8, 0.59, 1);
  return s;
}

function construirPlaca() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = "#2a2723"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '110px "Archivo Black", Impact, sans-serif'; g.fillText("GALERIA OGEID", 512, 100);
  g.fillStyle = "#9a3f1e"; g.font = '500 34px "IBM Plex Mono", monospace'; g.fillText("COLECIONÁVEIS AUTORAIS · DROP Nº 002", 512, 198);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.position.set(0, 3.0, -sala.D / 2 + 0.06);
  // se a fonte web só chegar depois, redesenha
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { construirPlacaTextura(m); });
  scene.add(m);
}
function construirPlacaTextura(m) {
  const c = m.material.map.image, g = c.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = "#2a2723"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '110px "Archivo Black", Impact, sans-serif'; g.fillText("GALERIA OGEID", 512, 100);
  g.fillStyle = "#9a3f1e"; g.font = '500 34px "IBM Plex Mono", monospace'; g.fillText("COLECIONÁVEIS AUTORAIS · DROP Nº 002", 512, 198);
  m.material.map.needsUpdate = true;
}

/* --- personagem --- */
function construirJogador() {
  jogador = new THREE.Group();
  jogadorCorpo = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.95, 20), new THREE.MeshStandardMaterial({ color: COR.musgo, roughness: 0.8 }));
  corpo.position.y = 0.5;
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), new THREE.MeshStandardMaterial({ color: COR.offwhite, roughness: 0.6 }));
  cabeca.position.y = 1.2;
  const cachecol = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 10, 24), new THREE.MeshStandardMaterial({ color: COR.laranja, roughness: 0.8 }));
  cachecol.rotation.x = Math.PI / 2; cachecol.position.y = 0.97;
  const olhoMat = new THREE.MeshBasicMaterial({ color: 0x2a2723 });
  const olhoG = new THREE.SphereGeometry(0.035, 8, 8);
  const o1 = new THREE.Mesh(olhoG, olhoMat); o1.position.set(0.09, 1.24, 0.24);
  const o2 = new THREE.Mesh(olhoG, olhoMat); o2.position.set(-0.09, 1.24, 0.24);
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0x2a2723, transparent: true, opacity: 0.18 }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.012;
  jogadorCorpo.add(corpo, cabeca, cachecol, o1, o2);
  jogador.add(jogadorCorpo, sombra);
  scene.add(jogador);
}

/* ====================================================================
   ENTRADA (teclado, ponteiro, joystick)
   ==================================================================== */
const teclas = Object.create(null);
const joy = { x: 0, y: 0 };
let proximo = null;           // obra ao alcance

function ligarInterface() {
  const TECLAS_JOGO = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "r", "shift"];
  window.addEventListener("keydown", (e) => {
    if (!estado.ativo || estado.modal) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const emControle = document.activeElement && ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
    if (TECLAS_JOGO.includes(k)) {
      if (emControle && k.startsWith("arrow")) return;   // deixa as setas funcionarem em botões/listas
      if (k !== "shift") e.preventDefault();
      teclas[k] = true;
    } else if ((k === "e" || (k === "enter" && !emControle)) && proximo) {
      e.preventDefault();
      abrirFicha(proximo.p);
    }
  });
  window.addEventListener("keyup", (e) => { teclas[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { for (const k in teclas) teclas[k] = false; joy.x = joy.y = 0; });

  // iniciar
  $("#gx-iniciar").addEventListener("click", () => {
    $("#gx-start").hidden = true;
    estado.ativo = true;
    $("#gx-canvas").focus();
    const m = location.hash.match(/obra=([^&]+)/);
    if (m) irAte(decodeURIComponent(m[1]));
  });
  $("#gx-ajuda").addEventListener("click", () => { estado.ativo = false; $("#gx-start").hidden = false; $("#gx-iniciar").focus(); });

  // arrastar para girar a câmera + clique nas obras
  const canvas = $("#gx-canvas");
  let arr = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!estado.ativo) return;
    arr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moveu: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!arr || arr.id !== e.pointerId) return;
    const dx = e.clientX - arr.x; arr.moveu += Math.abs(dx) + Math.abs(e.clientY - arr.y);
    yaw -= dx * 0.0055; arr.x = e.clientX; arr.y = e.clientY;
  });
  const fim = (e) => {
    if (!arr || arr.id !== e.pointerId) return;
    const clique = arr.moveu < 8 && performance.now() - arr.t < 450;
    arr = null;
    if (clique && !estado.modal) clicarNaCena(e.clientX, e.clientY);
  };
  canvas.addEventListener("pointerup", fim);
  canvas.addEventListener("pointercancel", () => { arr = null; });

  // botões táteis
  const hold = (el, fn) => {
    let t = null;
    const start = (e) => { e.preventDefault(); fn(); t = setInterval(fn, 40); };
    const stop = () => { clearInterval(t); t = null; };
    el.addEventListener("pointerdown", start);
    ["pointerup", "pointerleave", "pointercancel"].forEach((n) => el.addEventListener(n, stop));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  };
  hold($("#gx-gira-esq"), () => { yaw += 0.05; });
  hold($("#gx-gira-dir"), () => { yaw -= 0.05; });

  // joystick virtual
  const base = $("#gx-joy"), knob = $("#gx-joy-knob");
  let joyId = null;
  const mover = (e) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max, ny = dy / max;
    if (Math.hypot(nx, ny) < 0.18) { joy.x = joy.y = 0; } else { joy.x = nx; joy.y = ny; }
  };
  base.addEventListener("pointerdown", (e) => { joyId = e.pointerId; base.setPointerCapture(joyId); mover(e); });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) mover(e); });
  const soltarJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; knob.style.transform = ""; };
  base.addEventListener("pointerup", soltarJoy); base.addEventListener("pointercancel", soltarJoy);

  // botão "Ver" (aparece ao chegar perto) e lista
  $("#gx-prompt").addEventListener("click", () => { if (proximo) abrirFicha(proximo.p); });
  $("#gx-lista-abrir").addEventListener("click", abrirLista);
}

const raycaster = new THREE.Raycaster();
function clicarNaCena(cx, cy) {
  const r = $("#gx-canvas").getBoundingClientRect();
  const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(clicaveis, false)[0];
  if (!hit) return;
  const item = hit.object.userData.item;
  if (!item) return;
  // só abre se o visitante estiver razoavelmente perto; senão, caminha até lá
  const d = Math.hypot(pos.x - item.ancora.x, pos.z - item.ancora.z);
  if (d <= DIST_HOTSPOT + 2.5) abrirFicha(item.p);
  else { irPerto(item); aviso(`Indo até “${item.p.titulo}”…`); }
}

/* ====================================================================
   MOVIMENTO, COLISÃO E CÂMERA
   ==================================================================== */
function atualizar(dt) {
  tempoAnim += dt;
  let ix = 0, iz = 0;
  if (estado.ativo && !estado.modal) {
    ix = (teclas["d"] || teclas["arrowright"] ? 1 : 0) - (teclas["a"] || teclas["arrowleft"] ? 1 : 0) + joy.x;
    iz = (teclas["s"] || teclas["arrowdown"] ? 1 : 0) - (teclas["w"] || teclas["arrowup"] ? 1 : 0) + joy.y;
    if (teclas["q"]) yaw += 1.8 * dt;      // Q / R giram a câmera ("E" é a tecla de ação)
    if (teclas["r"]) yaw -= 1.8 * dt;
  }
  const mag = Math.hypot(ix, iz);
  let movendo = false;
  if (mag > 0.01) {
    if (mag > 1) { ix /= mag; iz /= mag; }
    // frente = longe da câmera
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = fx * -iz + rx * ix, mz = fz * -iz + rz * ix;
    const vel = (teclas["shift"] ? 5.2 : 3.2) * Math.min(1, mag);
    pos.x += mx * vel * dt; pos.z += mz * vel * dt;
    movendo = true;
    const alvo = Math.atan2(mx, mz);
    let d = alvo - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    heading += d * Math.min(1, dt * 12);
  }
  resolverColisoes();
  jogador.position.set(pos.x, 0, pos.z);
  jogador.rotation.y = heading;
  jogadorCorpo.position.y = movendo && !REDUZIR ? Math.abs(Math.sin(tempoAnim * 11)) * 0.05 : 0;

  atualizarCamera(dt);
  atualizarHotspots();
  if (!REDUZIR) estado.pedestais.forEach((p) => { p.giro.rotation.y += dt * 0.5; });
}

function resolverColisoes() {
  const mx = sala.W / 2 - 0.95, mz = sala.D / 2 - 0.95;
  pos.x = Math.max(-mx, Math.min(mx, pos.x));
  pos.z = Math.max(-mz, Math.min(mz, pos.z));
  for (const c of colisores) {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + RAIO_JOGADOR;
    if (d < min) {
      if (d < 1e-4) { pos.x = c.x + min; continue; }
      pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min;
    }
  }
}

const camAlvo = new THREE.Vector3();
let camInicial = true;
function atualizarCamera(dt) {
  const DIST = 5.2, mx = sala.W / 2 - 0.4, mz = sala.D / 2 - 0.4;
  let cx = pos.x + Math.sin(yaw) * DIST, cz = pos.z + Math.cos(yaw) * DIST;
  cx = Math.max(-mx, Math.min(mx, cx)); cz = Math.max(-mz, Math.min(mz, cz));  // a câmera nunca passa das paredes
  const dh = Math.hypot(cx - pos.x, cz - pos.z);
  const cy = 2.5 + (1 - Math.min(1, dh / DIST)) * 2.4;                          // encostou na parede? sobe e olha de cima
  camAlvo.set(cx, cy, cz);
  if (REDUZIR || camInicial) { camera.position.copy(camAlvo); camInicial = false; }
  else camera.position.lerp(camAlvo, 1 - Math.exp(-7 * dt));
  camera.lookAt(pos.x, 1.05, pos.z);
}

function atualizarHotspots() {
  let melhor = null, md = DIST_HOTSPOT;
  for (const it of estado.itens) {
    const d = Math.hypot(pos.x - it.ancora.x, pos.z - it.ancora.z);
    if (d < md) { md = d; melhor = it; }
    // carregamento preguiçoso por proximidade
    if (d < DIST_CARREGAR) {
      if (!it.texEstado && it.imagem) pedirTextura(it);
      if (it.tipo === "pedestal" && !it.modeloEstado) carregarModeloPedestal(it);
    }
  }
  if (melhor !== proximo) {
    if (proximo && proximo.moldura) proximo.moldura.material.color.setHex(COR.rodape);
    if (proximo && proximo.base) proximo.base.material.color.setHex(COR.musgo);
    proximo = melhor;
    if (proximo && proximo.moldura) proximo.moldura.material.color.setHex(COR.laranja);
    if (proximo && proximo.base) proximo.base.material.color.setHex(0x74883f);
    const bt = $("#gx-prompt");
    if (proximo) {
      $("#gx-prompt-nome").textContent = proximo.p.titulo;
      bt.hidden = false;
    } else bt.hidden = true;
  }
}

/* ---------- texturas (fila: no máx. 3 por vez, mais próximas primeiro) ---------- */
const fila = []; let baixando = 0;
function pedirTextura(it) {
  it.texEstado = "fila"; fila.push(it); processarFila();
}
function processarFila() {
  while (baixando < 3 && fila.length) {
    fila.sort((a, b) => Math.hypot(pos.x - a.ancora.x, pos.z - a.ancora.z) - Math.hypot(pos.x - b.ancora.x, pos.z - b.ancora.z));
    const it = fila.shift(); baixando++; it.texEstado = "baixando";
    carregarImagemReduzida(it.imagem).then(({ tex, aspecto }) => {
      it.texEstado = "ok";
      if (it.tipo === "parede") {
        it.arte.material.map = tex; it.arte.material.color.setHex(0xffffff); it.arte.material.needsUpdate = true;
        it.aspecto = aspecto; ajustarMoldura(it);
      }
    }).catch(() => { it.texEstado = "erro"; })
      .finally(() => { baixando--; processarFila(); });
  }
}
// as fotos de capa podem ter vários MB: reduz para ~640 px antes de mandar para a GPU
async function carregarImagemReduzida(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const blob = await resp.blob();
  try {
    const bmp = await createImageBitmap(blob, { resizeWidth: 640, resizeQuality: "medium", imageOrientation: "flipY" });
    const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4; tex.needsUpdate = true;
    return { tex, aspecto: bmp.width / bmp.height };
  } catch (e) {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, aspecto: tex.image.width / tex.image.height };
  }
}

function carregarModeloPedestal(it) {
  it.modeloEstado = "baixando";
  carregarObjeto(modeloDe(it.p)).then((raiz) => {
    escalarParaAltura(raiz, 1.05);
    it.giro.remove(it.prov);
    it.giro.add(raiz);
    it.modeloEstado = "ok";
  }).catch((e) => { console.warn("[galeria] modelo do pedestal não carregou", e); it.modeloEstado = "erro"; });
}

/* ---------- laço principal ---------- */
function quadro() {
  const dt = Math.min(clock.getDelta(), 0.05);
  atualizar(dt);
  renderer.render(scene, camera);
}
function redimensionar() {
  const c = $("#gx-canvas");
  const w = c.parentElement.clientWidth || window.innerWidth, h = c.parentElement.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 0.8 ? 70 : 55; camera.updateProjectionMatrix();
}

/* ====================================================================
   FICHA DA OBRA
   ==================================================================== */
function abrirFicha(p) {
  const el = $("#gx-ficha");
  const modelo = modeloDe(p);
  const img = imagemCapa(p);
  $("#gx-ficha-num").textContent = p.numero || "";
  $("#gx-ficha-titulo").textContent = p.titulo;
  $("#gx-ficha-desc").textContent = p.descricao || "";
  const preco = $("#gx-ficha-preco");
  const sob = rotuloPreco(p.preco) === "Sob consulta";
  preco.textContent = rotuloPreco(p.preco);
  preco.classList.toggle("gx-sob-consulta", sob);
  const im = $("#gx-ficha-img");
  im.src = img; im.alt = img ? `Foto de ${p.titulo}` : ""; im.hidden = !img;
  const specs = $("#gx-ficha-specs");
  specs.innerHTML = (p.specs || []).slice(0, 5).map((s) => `<li><span>${esc(s.label)}</span><span>${esc(s.valor)}</span></li>`).join("");

  $("#gx-ficha-ver").href = `produto.html?key=${encodeURIComponent(p.key)}`;
  $("#gx-ficha-3d").hidden = !modelo;

  // clona os botões para soltar ouvintes de aberturas anteriores
  ["#gx-ficha-add", "#gx-ficha-ar", "#gx-ficha-3d"].forEach((s) => { const b = $(s); b.replaceWith(b.cloneNode(true)); });
  $("#gx-ficha-add").addEventListener("click", () => adicionarProdutoASelecao(p));
  $("#gx-ficha-ar").addEventListener("click", () => abrirAR(p));
  $("#gx-ficha-3d").addEventListener("click", () => abrirVisualizador3D(p));
  $("#gx-ficha-ar").title = modelo ? "Ver a peça no seu espaço" : "Mostra a foto da obra no tamanho aproximado, na parede ou na mesa";

  estado.modal = true;
  for (const k in teclas) teclas[k] = false;
  abrirDialogo(el, { onClose() { estado.modal = false; } });
}

/* ====================================================================
   LISTA DE OBRAS (alternativa acessível + atalho de teletransporte)
   ==================================================================== */
function montarListaObras(produtos) {
  $("#gx-lista-itens").innerHTML = produtos.map((p) => `
    <li>
      <span class="gx-lista-nome"><b>${esc(p.titulo)}</b> <small>${esc(p.numero || "")} · ${esc(rotuloPreco(p.preco))}</small></span>
      <span class="gx-lista-acoes">
        <button type="button" class="gx-btn gx-btn-mini" data-ficha="${esc(p.key)}">Ver ficha</button>
        <button type="button" class="gx-btn gx-btn-mini" data-ir="${esc(p.key)}">Ir até lá</button>
      </span>
    </li>`).join("");
  $("#gx-lista-itens").addEventListener("click", (e) => {
    const f = e.target.closest("[data-ficha]"), i = e.target.closest("[data-ir]");
    if (f) { fecharLista && fecharLista(); abrirFicha(produtos.find((p) => p.key === f.dataset.ficha)); }
    if (i) { fecharLista && fecharLista(); irAte(i.dataset.ir); }
  });
}
let fecharLista = null;
function abrirLista() {
  estado.modal = true;
  fecharLista = abrirDialogo($("#gx-lista"), { onClose() { estado.modal = false; fecharLista = null; } });
}

function irPerto(item) {
  // fica de frente para a obra, a ~2,2 m
  const a = item.ancora;
  const dx = a.x - pos.x, dz = a.z - pos.z, d = Math.hypot(dx, dz) || 1;
  pos.x = a.x - (dx / d) * 0.2; pos.z = a.z - (dz / d) * 0.2;
  resolverColisoes();
}
function irAte(key) {
  const it = estado.itens.find((i) => i.p.key === key);
  if (!it) { aviso("Não encontrei essa obra na galeria."); return; }
  if (it.tipo === "parede") {
    // posiciona o visitante em frente à obra, olhando para ela
    const dentro = it.ancora.clone(); // âncora já está 1,2 à frente da parede
    pos.set(dentro.x, 0, dentro.z);
    const parede = it.grupo.position;
    heading = Math.atan2(parede.x - pos.x, parede.z - pos.z);
    yaw = heading + Math.PI;
  } else {
    pos.set(it.ancora.x, 0, it.ancora.z + 2.6);
    heading = Math.PI; yaw = 0;
  }
  resolverColisoes(); camInicial = true;
  aviso(`Você está diante de “${it.p.titulo}”.`);
}

// utilitário para testes/depuração
window.__galeria = { estado, get pos() { return pos; }, irAte, abrirFicha };
