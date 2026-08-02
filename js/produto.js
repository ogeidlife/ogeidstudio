/* =========================================================
   Carrega os dados de UM produto a partir de data/produtos.json
   e preenche a página (título, preço, descrição, specs, galeria,
   link de encomenda). A peça é escolhida pelo endereço da página:
   produto.html?key=cabeca
   ========================================================= */
(async function () {
  const params = new URLSearchParams(window.location.search);
  const PRODUCT_KEY = params.get("key") || (typeof PRODUCT_KEY_FALLBACK !== "undefined" ? PRODUCT_KEY_FALLBACK : null);
  if (!PRODUCT_KEY) return;

  try {
    const res = await fetch("data/produtos.json", { cache: "no-store" });
    const todos = await res.json();
    const p = todos[PRODUCT_KEY];
    if (!p) return;

    document.title = p.titulo + " — Ateliê";
    document.getElementById("eyebrow").textContent = p.numero;
    document.getElementById("titulo").textContent = p.titulo;
    document.getElementById("preco").textContent = p.preco;
    document.getElementById("descricao").textContent = p.descricao;

    const specsBox = document.getElementById("specs");
    specsBox.innerHTML = "";
    p.specs.forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${s.label}</span><span>${s.valor}</span>`;
      specsBox.appendChild(li);
    });

    const imagemPrincipal = p.imagens[0] || "";
    const orderParams = new URLSearchParams({
      produto: p.titulo,
      imagem: imagemPrincipal,
      preco: p.preco,
    });
    document.getElementById("btn-encomendar").href = "encomenda.html?" + orderParams.toString();

    // inicia a galeria de fotos (função definida em js/gallery.js)
    if (window.initGallery) {
      initGallery("#img-principal", "#miniaturas", p.imagens);
    }
  } catch (err) {
    console.error("Não consegui carregar data/produtos.json", err);
  }
})();