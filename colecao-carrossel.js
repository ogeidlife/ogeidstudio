/* =========================================================
   VITRINE DA COLEÇÃO — carrossel giratório de pinturas na home.

   De onde vêm os dados:
   - data/produtos.json  → mesma base de dados do catálogo/admin
   - data/carrossel.json → quais peças aparecem aqui, em que ordem,
     e o comportamento (velocidade, autoplay, quantas ficam visíveis).
     Editável no painel admin, aba "Coleção". Se esse arquivo ainda
     não existir (primeira vez), o carrossel cai num modo padrão
     automático: usa as peças marcadas como "destaque" no catálogo
     ou, na falta delas, as primeiras peças cadastradas.

   Clicar/tocar numa pintura que já está no centro abre a página
   dela (produto.html?key=...). Clicar numa pintura lateral só a
   traz pro centro — é o mesmo gesto que funciona por toque no
   celular (tocar pra selecionar, tocar de novo pra abrir).
   ========================================================= */
(function () {
  const stage = document.getElementById("colecao-stage");
  if (!stage) return;

  const tituloEl = document.getElementById("colecao-titulo-atual");
  const ctaEl = document.getElementById("colecao-cta");
  const btnPrev = document.getElementById("colecao-prev");
  const btnNext = document.getElementById("colecao-next");

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CONFIG_PADRAO = {
    ativo: true,
    autoplay: true,
    velocidade: 4200, // ms entre trocas automáticas
    itensVisiveis: 5, // quantas pinturas ficam visíveis ao redor da central (ímpar fica melhor)
    itens: [],
  };

  function escapeAttr(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  async function carregarDados() {
    let produtos = {};
    let config = { ...CONFIG_PADRAO };

    try {
      const resProdutos = await fetch("data/produtos.json", { cache: "no-store" });
      if (resProdutos.ok) produtos = await resProdutos.json();
    } catch (err) {
      console.error("Não consegui carregar data/produtos.json", err);
    }

    try {
      const resConfig = await fetch("data/carrossel.json", { cache: "no-store" });
      if (resConfig.ok) {
        const json = await resConfig.json();
        config = { ...CONFIG_PADRAO, ...json };
      }
    } catch (err) {
      // arquivo ainda não existe — segue com o padrão, sem problema
    }

    return { produtos, config };
  }

  function escolherItens(produtos, config) {
    let keys = Array.isArray(config.itens) ? config.itens.filter((k) => produtos[k]) : [];

    if (!keys.length) {
      keys = Object.keys(produtos)
        .filter((k) => produtos[k].destaque)
        .sort((a, b) => (produtos[a].ordem || 0) - (produtos[b].ordem || 0));
    }
    if (!keys.length) {
      keys = Object.keys(produtos)
        .sort((a, b) => (produtos[a].ordem || 0) - (produtos[b].ordem || 0))
        .slice(0, 8);
    }
    return keys.map((k) => ({ key: k, ...produtos[k] }));
  }

  function mostrarVazio() {
    stage.innerHTML = `
      <p class="colecao-loading">
        A coleção ainda não tem peças cadastradas.
        <a href="catalogo.html" style="color:var(--accent); text-decoration:underline;">Ver catálogo</a>
      </p>`;
    if (ctaEl) ctaEl.style.display = "none";
    btnPrev.style.display = "none";
    btnNext.style.display = "none";
  }

  async function iniciar() {
    const { produtos, config } = await carregarDados();
    const itens = escolherItens(produtos, config);

    if (!itens.length) {
      mostrarVazio();
      return;
    }

    stage.innerHTML = "";
    const els = itens.map((p, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "colecao-item";
      el.setAttribute("role", "listitem");
      el.setAttribute("aria-label", "Ver a obra: " + (p.titulo || p.key));
      const capa = p.capaEstatica || (p.imagens && p.imagens[0]) || "";
      el.innerHTML = `
        <img src="${capa}" alt="${escapeAttr(p.titulo)}" draggable="false"
             loading="${i === 0 ? "eager" : "lazy"}" decoding="async">
        <span class="colecao-item-label">${escapeAttr(p.numero || "")}</span>
      `;
      el.addEventListener("click", () => onItemClick(i));
      stage.appendChild(el);
      return el;
    });

    const n = itens.length;
    let active = 0;
    let timer = null;
    let resumeTimeout = null;
    let justDragged = false;

    function layout() {
      const visiveis = Math.min(config.itensVisiveis || 5, n);
      const meio = Math.floor(visiveis / 2);

      els.forEach((el, i) => {
        let offset = i - active;
        if (offset > n / 2) offset -= n;
        if (offset < -n / 2) offset += n;
        const abs = Math.abs(offset);
        const dentro = abs <= meio;

        el.style.zIndex = String(100 - abs);
        el.style.opacity = dentro ? String(Math.max(0.25, 1 - abs * 0.28)) : "0";
        el.style.pointerEvents = dentro ? "auto" : "none";
        el.tabIndex = dentro ? 0 : -1;
        el.setAttribute("aria-hidden", dentro ? "false" : "true");
        el.classList.toggle("is-active", offset === 0);

        const tx = offset * 58; // % de deslocamento horizontal
        const tz = -abs * 150; // profundidade
        const ry = offset * -24; // rotação (graus)
        const scale = Math.max(0.5, 1 - abs * 0.17);
        el.style.transform =
          `translate(-50%,-50%) translateX(${tx}%) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;

        const img = el.querySelector("img");
        const p = itens[i];
        const capaParada = p.capaEstatica || (p.imagens && p.imagens[0]) || "";
        img.src = offset === 0 && p.capaAnimada ? p.capaAnimada : capaParada;
      });

      if (tituloEl) tituloEl.textContent = itens[active].titulo || "";
    }

    function irPara(i) {
      active = ((i % n) + n) % n;
      layout();
    }

    function pausarDepoisRetomar() {
      pararAutoplay();
      if (resumeTimeout) clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(iniciarAutoplay, 1300);
    }

    function onItemClick(i) {
      if (justDragged) { justDragged = false; return; }
      if (i === active) {
        window.location.href = "produto.html?key=" + encodeURIComponent(itens[i].key);
      } else {
        irPara(i);
        pausarDepoisRetomar();
      }
    }

    function iniciarAutoplay() {
      if (prefersReduced || config.autoplay === false || n < 2) return;
      pararAutoplay();
      timer = setInterval(() => irPara(active + 1), Math.max(1800, config.velocidade || 4200));
    }
    function pararAutoplay() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    // pausa a rotação automática ao interagir; retoma um pouco depois de sair
    stage.addEventListener("mouseenter", () => { pararAutoplay(); if (resumeTimeout) clearTimeout(resumeTimeout); });
    stage.addEventListener("mouseleave", () => { resumeTimeout = setTimeout(iniciarAutoplay, 900); });
    stage.addEventListener("focusin", pararAutoplay);
    stage.addEventListener("focusout", () => { resumeTimeout = setTimeout(iniciarAutoplay, 900); });

    // teclado: setas pra navegar, enter/espaço pra abrir a peça central
    stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); irPara(active + 1); pausarDepoisRetomar(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); irPara(active - 1); pausarDepoisRetomar(); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = "produto.html?key=" + encodeURIComponent(itens[active].key);
      }
    });

    btnPrev.addEventListener("click", () => { irPara(active - 1); pausarDepoisRetomar(); });
    btnNext.addEventListener("click", () => { irPara(active + 1); pausarDepoisRetomar(); });

    // arraste/deslize (mouse e toque) pra girar o carrossel
    let startX = 0, dx = 0, arrastando = false;
    stage.addEventListener("pointerdown", (e) => {
      arrastando = true; dx = 0; startX = e.clientX;
      pararAutoplay();
      if (resumeTimeout) clearTimeout(resumeTimeout);
    });
    stage.addEventListener("pointermove", (e) => {
      if (!arrastando) return;
      dx = e.clientX - startX;
    });
    function soltar() {
      if (!arrastando) return;
      arrastando = false;
      if (Math.abs(dx) > 40) {
        justDragged = true;
        dx < 0 ? irPara(active + 1) : irPara(active - 1);
      }
      dx = 0;
      pausarDepoisRetomar();
    }
    stage.addEventListener("pointerup", soltar);
    stage.addEventListener("pointerleave", () => { if (arrastando) soltar(); });

    layout();
    iniciarAutoplay();
  }

  iniciar();
})();
