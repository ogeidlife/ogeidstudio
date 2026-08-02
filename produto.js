/* =========================================================
   Carrega os dados de UM produto a partir de data/produtos.json
   e preenche a página (título, preço, descrição, specs, galeria,
   link de encomenda). Cada página de produto só precisa definir
   a variável PRODUCT_KEY antes de chamar este script.
   ========================================================= */
(async function () {
  if (typeof PRODUCT_KEY === "undefined") return;

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
    const params = new URLSearchParams({
      produto: p.titulo,
      imagem: imagemPrincipal,
      preco: p.preco,
    });
    document.getElementById("btn-encomendar").href = "encomenda.html?" + params.toString();

    // inicia a galeria de fotos (função definida em js/gallery.js)
    if (window.initGallery) {
      initGallery("#img-principal", "#miniaturas", p.imagens);
    }
  } catch (err) {
    console.error("Não consegui carregar data/produtos.json", err);
  }
})();
