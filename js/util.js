/* =========================================================
   Utilidades compartilhadas da Galeria Ogeid
   (catálogo, preços, modelos 3D, diálogos acessíveis, avisos)
   Não depende do Three.js — pode ser importado em qualquer página.
   ========================================================= */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---------- preços ---------- */

/** "R$ 1.200,00" -> 1200 · "Sob consulta" / "R$ 0,00" -> null */
export function parsePreco(txt) {
  if (typeof txt === "number") return txt > 0 ? txt : null;
  const m = String(txt || "").match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  return n > 0 ? n : null;
}

export function brl(n) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Texto de preço pronto para exibir: o original, ou "Sob consulta". */
export function rotuloPreco(txt) {
  return parsePreco(txt) ? String(txt).trim() : "Sob consulta";
}

/* ---------- catálogo ---------- */

/**
 * Modelos 3D conhecidos antes de existir o campo "modelo3d" no JSON.
 * (a Cabeça Ogeid já usa assets/models/cabeca.stl na home)
 */
const MODELOS_PADRAO = {
  cabeca: { stl: "assets/models/cabeca.stl", alturaCm: 10, orientacao: [-90, 0, 0] },
};

/**
 * Lê o modelo 3D de um produto. Formato no data/produtos.json:
 *   "modelo3d": { "stl": "assets/models/x.stl", "glb": "assets/models/x.glb",
 *                 "usdz": "assets/models/x.usdz", "alturaCm": 12,
 *                 "orientacao": [-90, 0, 0] }
 * Todos os campos são opcionais, mas é preciso ter "stl" ou "glb".
 * "orientacao" (graus X, Y, Z) só vale para STL — GLB já vem com o eixo certo.
 */
export function modeloDe(p) {
  const m = p && (p.modelo3d || MODELOS_PADRAO[p.key]);
  if (!m) return null;
  const stl = m.stl || null;
  const glb = m.glb || m.gltf || null;
  if (!stl && !glb) return null;
  return {
    stl, glb,
    usdz: m.usdz || null,
    alturaCm: Number(m.alturaCm) > 0 ? Number(m.alturaCm) : 10,
    orientacao: Array.isArray(m.orientacao) && m.orientacao.length === 3 ? m.orientacao : [-90, 0, 0],
  };
}

export function imagemCapa(p) {
  return p.capaEstatica || (p.imagens && p.imagens[0]) || "";
}

export async function carregarProdutos() {
  const res = await fetch("data/produtos.json", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const todos = await res.json();
  return Object.keys(todos)
    .map((key) => ({ key, ...todos[key] }))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

/* ---------- WebGL ---------- */

export function webglDisponivel() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

/* ---------- validação de arquivos .stl ---------- */

export const STL_MAX_MB = 50;

function fmtMB(bytes) {
  return (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
}
export { fmtMB };

/**
 * Confere extensão, tamanho e estrutura de um .stl ANTES de entregar ao
 * Three.js. Devolve uma mensagem em português, ou null se estiver tudo certo.
 */
export async function validarArquivoSTL(file) {
  const nome = file && file.name ? file.name : "arquivo";
  if (!file) return "Nenhum arquivo foi recebido.";
  if (!/\.stl$/i.test(nome)) {
    return `O arquivo "${nome}" não é um .stl. Envie um arquivo com a extensão .stl.`;
  }
  if (file.size === 0) return `O arquivo "${nome}" está vazio.`;
  if (file.size > STL_MAX_MB * 1048576) {
    return `O arquivo "${nome}" tem ${fmtMB(file.size)} e passa do limite de ${STL_MAX_MB} MB. Reduza a malha (simplifique o modelo) e tente de novo.`;
  }
  if (file.size < 84) {
    return `O arquivo "${nome}" é pequeno demais para ser um STL válido.`;
  }
  try {
    const cab = await file.slice(0, 84).arrayBuffer();
    const tri = new DataView(cab).getUint32(80, true);
    const binarioOk = tri > 0 && 84 + 50 * tri <= file.size;
    if (!binarioOk) {
      const texto = await file.slice(0, Math.min(file.size, 4096)).text();
      const asciiOk = /^\s*solid/i.test(texto) && /facet/i.test(texto);
      if (!asciiOk) {
        return `Não consegui reconhecer "${nome}" como um STL válido (nem binário, nem ASCII). O arquivo pode estar corrompido ou ter sido salvo em outro formato.`;
      }
    }
  } catch (e) {
    return `Não consegui ler o arquivo "${nome}". Tente selecioná-lo de novo.`;
  }
  return null;
}

/* ---------- diálogo acessível (foco preso, Esc, devolve o foco) ---------- */

const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Abre um elemento como diálogo modal. Devolve a função que fecha.
 * O elemento precisa ter role="dialog" (ou receber aqui) e um botão de fechar.
 */
export function abrirDialogo(el, { onClose } = {}) {
  const anterior = document.activeElement;
  el.hidden = false;
  if (!el.getAttribute("role")) el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;

  const visiveis = () => [...el.querySelectorAll(FOCAVEIS)].filter((n) => n.getClientRects().length > 0);
  let fechado = false;

  function aoTeclar(e) {
    if (e.key === "Escape") { e.stopPropagation(); fechar(); return; }
    if (e.key !== "Tab") return;
    const l = visiveis();
    if (!l.length) { e.preventDefault(); return; }
    const a = l[0], z = l[l.length - 1];
    if (e.shiftKey && (document.activeElement === a || document.activeElement === el)) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  function aoClicarFora(e) { if (e.target === el) fechar(); }

  function fechar() {
    if (fechado) return;
    fechado = true;
    el.hidden = true;
    el.removeEventListener("keydown", aoTeclar);
    el.removeEventListener("click", aoClicarFora);
    if (anterior && anterior.focus && document.contains(anterior)) anterior.focus();
    if (onClose) onClose();
  }

  el.addEventListener("keydown", aoTeclar);
  el.addEventListener("click", aoClicarFora);
  el.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar, { once: true }));
  (el.querySelector("[data-foco]") || visiveis()[0] || el).focus();
  return fechar;
}

/* ---------- aviso rápido (toast) ---------- */

export function aviso(msg, ms = 3200) {
  let box = document.getElementById("gx-avisos");
  if (!box) {
    box = document.createElement("div");
    box.id = "gx-avisos";
    box.className = "gx-avisos";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const n = document.createElement("div");
  n.className = "gx-aviso";
  n.textContent = msg;
  box.appendChild(n);
  setTimeout(() => n.remove(), ms);
}

/* ---------- seleção (sacola) — atalho para js/carrinho.js ---------- */

/** Adiciona um produto do catálogo à seleção. Devolve true se deu certo. */
export function adicionarProdutoASelecao(p, { preco, variacao, imagem } = {}) {
  if (!window.Selecao) { aviso("A seleção não está disponível nesta página."); return false; }
  const precoTxt = preco || p.preco;
  window.Selecao.adicionar({
    id: "produto:" + p.key + (variacao ? ":" + variacao : ""),
    tipo: "produto",
    key: p.key,
    titulo: p.titulo,
    numero: p.numero || "",
    imagem: imagem || imagemCapa(p),
    preco: rotuloPreco(precoTxt),
    precoNum: parsePreco(precoTxt),
    variacao: variacao || "",
  });
  aviso(`“${p.titulo}” foi para a sua seleção.`);
  return true;
}
