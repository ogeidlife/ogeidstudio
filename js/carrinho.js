/* =========================================================
   SELEÇÃO (sacola) — guarda no localStorage o que o visitante
   separou na galeria, no catálogo e no configurador.
   Script comum (não-módulo): pode entrar em qualquer página com
   <script src="js/carrinho.js" defer></script>.
   Expõe window.Selecao.
   ========================================================= */
(function () {
  "use strict";
  var CHAVE = "ogeid_selecao_v1";
  var memoria = null; // se o localStorage estiver bloqueado, vale só na página

  function ler() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return memoria || []; }
  }
  function gravar(lista) {
    memoria = lista;
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch (e) { /* sem espaço ou bloqueado */ }
  }

  function parsePreco(txt) {
    if (typeof txt === "number") return txt > 0 ? txt : null;
    var m = String(txt || "").match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
    if (!m) return null;
    var n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    return n > 0 ? n : null;
  }
  function brl(n) { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var lista = ler();
  var ouvintes = [];

  function avisar() {
    ouvintes.forEach(function (f) { try { f(lista); } catch (e) { /* ignora */ } });
    desenhar();
    document.dispatchEvent(new CustomEvent("selecao:mudou", { detail: lista }));
  }

  var Selecao = {
    itens: function () { return lista.slice(); },
    quantidade: function () { return lista.reduce(function (s, i) { return s + (i.qtd || 1); }, 0); },
    adicionar: function (item) {
      if (!item || !item.id) return;
      var existente = lista.find(function (i) { return i.id === item.id; });
      if (existente && item.tipo !== "configuracao") existente.qtd = (existente.qtd || 1) + 1;
      else lista.push(Object.assign({ qtd: 1 }, item));
      gravar(lista); avisar();
    },
    remover: function (id) {
      lista = lista.filter(function (i) { return i.id !== id; });
      gravar(lista); avisar();
    },
    mudarQtd: function (id, delta) {
      var it = lista.find(function (i) { return i.id === id; });
      if (!it) return;
      it.qtd = Math.max(1, Math.min(99, (it.qtd || 1) + delta));
      gravar(lista); avisar();
    },
    limpar: function () { lista = []; gravar(lista); avisar(); },
    /** { valor: soma dos itens com preço, sobConsulta: há itens sem preço? } */
    total: function () {
      var valor = 0, sob = false;
      lista.forEach(function (i) {
        var n = typeof i.precoNum === "number" ? i.precoNum : parsePreco(i.preco);
        if (n) valor += n * (i.qtd || 1); else sob = true;
      });
      return { valor: valor, sobConsulta: sob };
    },
    textoTotal: function () {
      var t = Selecao.total();
      if (!lista.length) return "—";
      if (!t.valor) return "Sob consulta";
      return brl(t.valor) + (t.sobConsulta ? " + itens sob consulta" : "");
    },
    resumoTexto: function () {
      var linhas = ["MINHA SELEÇÃO — Galeria Ogeid", ""];
      lista.forEach(function (i, n) {
        linhas.push((n + 1) + ". " + i.titulo + (i.qtd > 1 ? " (x" + i.qtd + ")" : "") + " — " + (i.preco || "Sob consulta"));
        if (i.variacao) linhas.push("   " + i.variacao);
        if (i.resumo) linhas.push(i.resumo.split("\n").map(function (l) { return "   " + l; }).join("\n"));
      });
      linhas.push("", "Total estimado: " + Selecao.textoTotal());
      linhas.push("Valores indicativos; o preço final é confirmado na encomenda.");
      return linhas.join("\n");
    },
    /** Link para o formulário de encomenda já existente (encomenda.html). */
    linkEncomenda: function () {
      if (!lista.length) return "encomenda.html";
      var p = new URLSearchParams();
      var nomes = lista.map(function (i) { return i.titulo + (i.qtd > 1 ? " x" + i.qtd : ""); }).join(" + ");
      p.set("produto", nomes.slice(0, 220));
      p.set("preco", Selecao.textoTotal());
      p.set("porte", "M");
      var img = (lista.find(function (i) { return i.imagem && i.imagem.indexOf("data:") !== 0; }) || {}).imagem;
      if (img) p.set("imagem", img);
      var detalhe = lista.map(function (i) {
        return i.tipo === "configuracao" ? (i.resumo || i.titulo).replace(/\n+/g, " | ") : (i.variacao || "");
      }).filter(Boolean).join(" || ");
      if (detalhe) p.set("variacao", detalhe.slice(0, 700));
      return "encomenda.html?" + p.toString();
    },
    aoMudar: function (fn) { ouvintes.push(fn); },
    abrir: function () { abrirPainel(); },
    fechar: function () { fecharPainel(); },
    parsePreco: parsePreco,
  };
  window.Selecao = Selecao;

  /* ---------------- interface ---------------- */
  var botao, painel, fundo, ultimoFoco = null;

  function montar() {
    if (botao) return;
    botao = document.createElement("button");
    botao.type = "button";
    botao.className = "gx-bag-btn";
    botao.setAttribute("aria-haspopup", "dialog");
    botao.addEventListener("click", abrirPainel);

    fundo = document.createElement("div");
    fundo.className = "gx-bag-fundo";
    fundo.hidden = true;
    fundo.addEventListener("click", function (e) { if (e.target === fundo) fecharPainel(); });

    painel = document.createElement("aside");
    painel.className = "gx-bag";
    painel.id = "gx-bag";
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-modal", "true");
    painel.setAttribute("aria-labelledby", "gx-bag-titulo");
    painel.tabIndex = -1;
    painel.innerHTML =
      '<header class="gx-bag-topo"><h2 id="gx-bag-titulo">Minha seleção</h2>' +
      '<button type="button" class="gx-fechar" data-bag-fechar aria-label="Fechar a seleção">×</button></header>' +
      '<div class="gx-bag-corpo" id="gx-bag-corpo"></div>' +
      '<footer class="gx-bag-rodape" id="gx-bag-rodape"></footer>';
    fundo.appendChild(painel);
    document.body.appendChild(botao);
    document.body.appendChild(fundo);

    painel.querySelector("[data-bag-fechar]").addEventListener("click", fecharPainel);
    painel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); fecharPainel(); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(painel.querySelectorAll('a[href],button:not([disabled])')).filter(function (n) { return n.getClientRects().length; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === painel)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    desenhar();
  }

  function desenhar() {
    if (!botao) return;
    var q = Selecao.quantidade();
    botao.innerHTML = 'Seleção <span class="gx-bag-n" aria-hidden="true">' + q + "</span>";
    botao.setAttribute("aria-label", "Abrir minha seleção — " + q + (q === 1 ? " item" : " itens"));

    var corpo = painel.querySelector("#gx-bag-corpo");
    var rodape = painel.querySelector("#gx-bag-rodape");
    if (!lista.length) {
      corpo.innerHTML = '<p class="gx-bag-vazia">Sua seleção está vazia. Passeie pela <a href="galeria.html">galeria</a> ou veja o <a href="catalogo.html">catálogo</a> e adicione as peças que você gostou.</p>';
      rodape.innerHTML = '<a class="gx-btn" href="catalogo.html">Ver catálogo</a>';
      return;
    }
    corpo.innerHTML = '<ul class="gx-bag-lista">' + lista.map(function (i) {
      var thumb = i.imagem ? '<img src="' + esc(i.imagem) + '" alt="" loading="lazy">' : '<span class="gx-bag-sem-img" aria-hidden="true"></span>';
      var det = i.tipo === "configuracao"
        ? '<small>' + esc((i.resumo || "").split("\n").slice(0, 3).join(" · ")) + "</small>"
        : (i.variacao ? "<small>" + esc(i.variacao) + "</small>" : "");
      return '<li class="gx-bag-item">' + thumb +
        '<div class="gx-bag-info"><strong>' + esc(i.titulo) + "</strong>" + det +
        '<span class="gx-bag-preco">' + esc(i.preco || "Sob consulta") + "</span>" +
        '<span class="gx-bag-qtd">' +
        (i.tipo === "configuracao" ? "" :
          '<button type="button" data-qtd="-1" data-id="' + esc(i.id) + '" aria-label="Diminuir quantidade de ' + esc(i.titulo) + '">−</button>' +
          '<span aria-label="Quantidade">' + (i.qtd || 1) + "</span>" +
          '<button type="button" data-qtd="1" data-id="' + esc(i.id) + '" aria-label="Aumentar quantidade de ' + esc(i.titulo) + '">+</button>') +
        "</span></div>" +
        '<button type="button" class="gx-bag-remover" data-remover="' + esc(i.id) + '" aria-label="Remover ' + esc(i.titulo) + ' da seleção">Remover</button></li>';
    }).join("") + "</ul>";

    rodape.innerHTML =
      '<p class="gx-bag-total"><span>Total estimado</span><strong>' + esc(Selecao.textoTotal()) + "</strong></p>" +
      '<p class="gx-bag-nota">Valores indicativos. “Sob consulta” significa que o preço é combinado na encomenda.</p>' +
      '<div class="gx-bag-acoes">' +
      '<a class="gx-btn gx-btn-primario" href="' + esc(Selecao.linkEncomenda()) + '">Encomendar seleção</a>' +
      '<button type="button" class="gx-btn" data-copiar>Copiar resumo</button>' +
      '<button type="button" class="gx-btn gx-btn-quieto" data-limpar>Esvaziar</button></div>';

    corpo.querySelectorAll("[data-remover]").forEach(function (b) {
      b.addEventListener("click", function () { Selecao.remover(b.getAttribute("data-remover")); focarPainelSeguro(); });
    });
    corpo.querySelectorAll("[data-qtd]").forEach(function (b) {
      b.addEventListener("click", function () { Selecao.mudarQtd(b.getAttribute("data-id"), parseInt(b.getAttribute("data-qtd"), 10)); });
    });
    rodape.querySelector("[data-limpar]").addEventListener("click", function () { Selecao.limpar(); focarPainelSeguro(); });
    rodape.querySelector("[data-copiar]").addEventListener("click", function (e) {
      var alvo = e.currentTarget, txt = Selecao.resumoTexto();
      var ok = function () { alvo.textContent = "Resumo copiado ✓"; setTimeout(function () { alvo.textContent = "Copiar resumo"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { window.prompt("Copie o resumo:", txt); });
      else window.prompt("Copie o resumo:", txt);
    });
  }

  function focarPainelSeguro() {
    if (!painel.contains(document.activeElement)) painel.focus();
  }

  function abrirPainel() {
    montar();
    ultimoFoco = document.activeElement;
    fundo.hidden = false;
    document.body.classList.add("gx-bag-aberta");
    painel.focus();
  }
  function fecharPainel() {
    if (!fundo || fundo.hidden) return;
    fundo.hidden = true;
    document.body.classList.remove("gx-bag-aberta");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus(); else botao.focus();
  }

  window.addEventListener("storage", function (e) {
    if (e.key === CHAVE) { lista = ler(); avisar(); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
