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

    // inicia a galeria de fotos (função definida em js/gallery.js) — precisa estar
    // pronta antes das variações, porque trocar de variação pode pular a foto
    let gallery = null;
    if (window.initGallery) {
      gallery = initGallery("#img-principal", "#miniaturas", p.imagens);
    }

    // guarda a opção escolhida em cada grupo de variação (ex: { Cor: {valor:"Preto",...}, Tamanho: {...} })
    // cada opção pode ser só um texto ("Preto") ou um objeto { valor, preco, imagem }
    const selecao = {};

    function normalizarOpcao(opcao) {
      return typeof opcao === "string" ? { valor: opcao } : opcao;
    }

    // monta o texto "Cor: Preto · Tamanho: M" a partir do que está selecionado agora
    function textoVariacaoEscolhida() {
      if (!p.variacoes || !p.variacoes.length) return "";
      return p.variacoes.map((grupo) => `${grupo.nome}: ${selecao[grupo.nome].valor}`).join(" · ");
    }

    // preço atual: começa no preço base da peça; se alguma variação selecionada
    // tiver preço próprio, ele substitui o preço base (o último grupo com preço definido vence)
    function precoAtual() {
      let preco = p.preco;
      (p.variacoes || []).forEach((grupo) => {
        const opc = selecao[grupo.nome];
        if (opc && opc.preco) preco = opc.preco;
      });
      return preco;
    }

    // imagem atual: começa na primeira foto da peça; se alguma variação selecionada
    // tiver foto própria, a galeria pula pra ela (o último grupo com foto definida vence)
    function imagemAtual() {
      let imagem = imagemPrincipal;
      (p.variacoes || []).forEach((grupo) => {
        const opc = selecao[grupo.nome];
        if (opc && opc.imagem) imagem = opc.imagem;
      });
      return imagem;
    }

    // atualiza preço na tela, pula a galeria pra foto certa, e atualiza o botão
    // "Encomendar esta peça" pra levar preço/foto/variação certos junto
    function atualizarSelecao() {
      const preco = precoAtual();
      const imagem = imagemAtual();

      document.getElementById("preco").textContent = preco;
      if (gallery) gallery.goTo(imagem);

      const orderParams = new URLSearchParams({
        produto: p.titulo,
        imagem: imagem,
        preco: preco,
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
        selecao[grupo.nome] = normalizarOpcao(grupo.opcoes[0]);

        const wrap = document.createElement("div");
        wrap.className = "variacao-grupo";

        const label = document.createElement("p");
        label.className = "variacao-nome";
        label.textContent = grupo.nome;
        wrap.appendChild(label);

        const opcoesBox = document.createElement("div");
        opcoesBox.className = "variacao-opcoes";

        grupo.opcoes.forEach((opcaoBruta, i) => {
          const opcao = normalizarOpcao(opcaoBruta);
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "variacao-chip" + (i === 0 ? " selected" : "");
          chip.textContent = opcao.valor;
          chip.addEventListener("click", () => {
            opcoesBox.querySelectorAll(".variacao-chip").forEach((c) => c.classList.remove("selected"));
            chip.classList.add("selected");
            selecao[grupo.nome] = opcao;
            atualizarSelecao();
          });
          opcoesBox.appendChild(chip);
        });

        wrap.appendChild(opcoesBox);
        variacoesBox.appendChild(wrap);
      });
    }

    atualizarSelecao();
  } catch (err) {
    console.error("Não consegui carregar data/produtos.json", err);
  }
})();
