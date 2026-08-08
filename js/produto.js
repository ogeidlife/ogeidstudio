/* =========================================================
   Carrega os dados de UM produto a partir de data/produtos.json
   e preenche a página (título, preço, descrição, specs, galeria,
   variações e link de encomenda). A peça é escolhida pelo
   endereço da página: produto.html?key=cabeca
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

    // guarda a opção escolhida em cada grupo de variação (ex: { Cor: "Preto", Tamanho: "M" })
    const selecao = {};

    // monta o texto "Cor: Preto · Tamanho: M" a partir do que está selecionado agora
    function textoVariacaoEscolhida() {
      if (!p.variacoes || !p.variacoes.length) return "";
      return p.variacoes.map((grupo) => `${grupo.nome}: ${selecao[grupo.nome]}`).join(" · ");
    }

    // atualiza o botão "Encomendar esta peça" pra levar a variação escolhida junto
    function atualizarLinkEncomenda() {
      const orderParams = new URLSearchParams({
        produto: p.titulo,
        imagem: imagemPrincipal,
        preco: p.preco,
      });
      const variacaoTexto = textoVariacaoEscolhida();
      if (variacaoTexto) orderParams.set("variacao", variacaoTexto);
      document.getElementById("btn-encomendar").href = "encomenda.html?" + orderParams.toString();
    }

    // desenha os grupos de variação (se a peça tiver) como "chips" clicáveis.
    // a primeira opção de cada grupo já vem selecionada, pra não travar o cliente.
    const variacoesBox = document.getElementById("variacoes");
    if (variacoesBox) {
      variacoesBox.innerHTML = "";
      (p.variacoes || []).forEach((grupo) => {
        if (!grupo.opcoes || !grupo.opcoes.length) return;
        selecao[grupo.nome] = grupo.opcoes[0];

        const wrap = document.createElement("div");
        wrap.className = "variacao-grupo";

        const label = document.createElement("p");
        label.className = "variacao-nome";
        label.textContent = grupo.nome;
        wrap.appendChild(label);

        const opcoesBox = document.createElement("div");
        opcoesBox.className = "variacao-opcoes";

        grupo.opcoes.forEach((opcao, i) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "variacao-chip" + (i === 0 ? " selected" : "");
          chip.textContent = opcao;
          chip.addEventListener("click", () => {
            opcoesBox.querySelectorAll(".variacao-chip").forEach((c) => c.classList.remove("selected"));
            chip.classList.add("selected");
            selecao[grupo.nome] = opcao;
            atualizarLinkEncomenda();
          });
          opcoesBox.appendChild(chip);
        });

        wrap.appendChild(opcoesBox);
        variacoesBox.appendChild(wrap);
      });
    }

    atualizarLinkEncomenda();

    // inicia a galeria de fotos (função definida em js/gallery.js)
    if (window.initGallery) {
      initGallery("#img-principal", "#miniaturas", p.imagens);
    }
  } catch (err) {
    console.error("Não consegui carregar data/produtos.json", err);
  }
})();
