/* =========================================================
   EXTRAS DA PÁGINA DE PRODUTO (produto.html?key=...)
   Acrescenta, sem mexer no resto da página:
     • "Adicionar à seleção"
     • "Ver no meu espaço" (AR) e "Ver em 3D" — só se a peça tiver modelo
     • "Ver na galeria"
   Uso: no produto.html, antes de </body>:
     <script src="js/carrinho.js" defer></script>
     <script src="js/produto-extras.js" defer></script>
   (não precisa de importmap: este script injeta um se faltar)
   ========================================================= */
(function () {
  "use strict";

  // O Three.js é carregado por "import maps". Se a página não tiver um, cria aqui —
  // precisa acontecer ANTES de qualquer módulo ser carregado.
  if (!document.querySelector('script[type="importmap"]')) {
    var im = document.createElement("script");
    im.type = "importmap";
    im.textContent = JSON.stringify({ imports: {
      three: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
    } });
    document.head.appendChild(im);
  }

  var params = new URLSearchParams(location.search);
  var key = params.get("key") || (typeof PRODUCT_KEY_FALLBACK !== "undefined" ? PRODUCT_KEY_FALLBACK : null);
  if (!key) return;

  function iniciar() {
    var encomendar = document.getElementById("btn-encomendar");
    if (!encomendar) return;

    import("./util.js").then(function (U) {
      return U.carregarProdutos().then(function (lista) {
        var p = lista.find(function (x) { return x.key === key; });
        if (!p) return;
        var modelo = U.modeloDe(p);

        var caixa = document.createElement("div");
        caixa.className = "gx-acoes gx-acoes-produto";
        caixa.setAttribute("role", "group");
        caixa.setAttribute("aria-label", "Mais formas de ver e guardar esta peça");

        function botao(texto, fn, classe) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "gx-btn " + (classe || ""); b.textContent = texto;
          b.addEventListener("click", fn);
          caixa.appendChild(b);
          return b;
        }

        botao("Adicionar à seleção", function () {
          // usa o preço e a variação que o cliente escolheu na página agora
          var precoAtual = (document.getElementById("preco") || {}).textContent || p.preco;
          var chips = [].slice.call(document.querySelectorAll(".variacao-chip.selected"));
          var variacao = chips.map(function (c) { return c.textContent; }).join(" · ");
          U.adicionarProdutoASelecao(p, { preco: precoAtual, variacao: variacao });
        });

        if (modelo) {
          botao("Ver no meu espaço", function () {
            import("./ar.js").then(function (m) { m.abrirAR(p); }).catch(erroModulo);
          }, "gx-btn-acento");
          botao("Ver em 3D", function () {
            import("./visualizador3d.js").then(function (m) { m.abrirVisualizador3D(p); }).catch(erroModulo);
          });
        }

        var gal = document.createElement("a");
        gal.className = "gx-btn"; gal.href = "galeria.html#obra=" + encodeURIComponent(p.key);
        gal.textContent = "Ver na galeria";
        caixa.appendChild(gal);

        encomendar.parentNode.insertBefore(caixa, encomendar.nextSibling);
      });
    }).catch(function (e) { console.warn("[produto-extras]", e); });
  }

  function erroModulo(e) {
    console.warn(e);
    alert("Não consegui carregar o visualizador 3D agora. Verifique sua conexão e tente de novo.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
