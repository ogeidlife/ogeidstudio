/* =========================================================
   Monta os cards do catálogo a partir de data/produtos.json.
   Cada card mostra o gif animado tocando sozinho, e "pausa"
   numa foto parada enquanto o mouse está em cima.
   ========================================================= */
async function montarCatalogo() {
  const grid = document.getElementById("catalog-grid");
  if (!grid) return;

  try {
    const res = await fetch("data/produtos.json", { cache: "no-store" });
    const todos = await res.json();

    const itens = Object.keys(todos)
      .map((key) => ({ key, ...todos[key] }))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    grid.innerHTML = "";
    itens.forEach((p) => {
      const card = document.createElement("a");
      card.href = `produto.html?key=${encodeURIComponent(p.key)}`;
      card.className = "catalog-card" + (p.destaque ? " featured" : "");

      const capaEstatica = p.capaEstatica || (p.imagens && p.imagens[0]) || "";
      const capaAnimada = p.capaAnimada || "";
      const capaInicial = capaAnimada || capaEstatica;

      card.innerHTML = `
        <div class="catalog-thumb" id="thumb-${p.key}">
          <img src="${capaInicial}" alt="${p.titulo}"
               onerror="this.closest('.catalog-thumb').classList.add('sem-imagem'); this.style.display='none';">
          <div class="catalog-thumb-placeholder"></div>
        </div>
        <span class="catalog-index">${p.numero}</span>
        <h3>${p.titulo}</h3>
        <p>${p.descricao}</p>
        <span class="go">Ver peça
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </span>
      `;

      // o gif fica tocando sozinho; ao passar o mouse, "pausa" numa foto parada
      if (capaAnimada && capaEstatica) {
        const img = card.querySelector(".catalog-thumb img");
        const thumb = card.querySelector(".catalog-thumb");
        thumb.addEventListener("mouseenter", () => { img.src = capaEstatica; });
        thumb.addEventListener("mouseleave", () => { img.src = capaAnimada; });
      }

      grid.appendChild(card);
    });
  } catch (err) {
    console.error("Não consegui carregar o catálogo", err);
  }
}

montarCatalogo();

// quando você clica num produto e depois volta, o navegador às vezes
// restaura essa página do próprio cache (bfcache) em vez de recarregar
// do zero. Se alguma foto ainda estava carregando no instante em que
// você saiu, o pedido dela é cancelado e ela fica "quebrada" nessa
// versão salva. Remontar o catálogo nesse momento resolve sem precisar
// dar F5.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    montarCatalogo();
  }
});