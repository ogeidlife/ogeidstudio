# Galeria Ogeid — o que foi feito e como usar

## Arquivos

**Novos:** `galeria.html`, `configurador.html`, `css/galeria.css`,
`js/galeria.js`, `js/configurador.js`, `js/ar.js`, `js/visualizador3d.js`,
`js/carrinho.js`, `js/util.js`, `js/produto-extras.js`, `js/upload-storage.js`.

**Alterado:** `index.html` (só acrescentei: link do `galeria.css`, aba "Galeria", bloco de botões
"Entrar na galeria / Configurar personagem / Ver catálogo / Encomendar", e o `carrinho.js`).
O visualizador da cabeça (`js/viewer.js`) e o contador de visitas continuam como estavam.

## ⚠️ O que o .zip não trazia
`css/style.css`, `data/produtos.json`, `catalogo.html`, `produto.html`, `encomenda.html` e `cadastro.html`
não estavam no arquivo enviado. Por isso:
- `galeria.css` é independente (classes `gx-…`) e usa as mesmas cores do seu viewer; carregue-o **depois** do `style.css`.
- Li o formato do catálogo em `catalogo.js`, `produto.js` e `admin.html`. Os campos novos que criei
  (`modelo3d`, `arLarguraCm`) o painel admin **preserva** ao salvar.

### Colar nas páginas existentes
**catalogo.html** e **encomenda.html** — antes de `</body>` (dá o botão "Seleção" em todo o site):
```html
<link rel="stylesheet" href="css/galeria.css?v=1">   <!-- no <head> -->
<script src="js/carrinho.js" defer></script>
```
**produto.html** — o mesmo `<link>` no `<head>` e, antes de `</body>`:
```html
<script src="js/carrinho.js" defer></script>
<script src="js/produto-extras.js" defer></script>
```
Isso insere, logo após o botão `#btn-encomendar`: *Adicionar à seleção*, *Ver no meu espaço* (AR) e
*Ver em 3D* (só em peças com modelo) e *Ver na galeria*.

## Como adicionar um produto
1. Foto em `assets/img/` e o produto no painel admin (como já faz). A galeria usa `capaEstatica` (ou a 1ª de `imagens`).
2. Para ter 3D/AR, acrescente em `data/produtos.json` no produto:
```json
"modelo3d": {
  "stl":  "assets/models/chaveiro.stl",
  "glb":  "assets/models/chaveiro.glb",
  "usdz": "assets/models/chaveiro.usdz",
  "alturaCm": 8,
  "orientacao": [-90, 0, 0]
}
```
- `stl` **ou** `glb` basta. Com os dois, o **GLB é preferido** (ideal para AR); o STL serve de reserva.
- `alturaCm`: altura real da peça — é o tamanho que aparece na AR.
- `orientacao`: graus X,Y,Z aplicados só ao STL (`[-90,0,0]` serve para STL exportado com Z para cima).
- `usdz` (opcional): habilita o botão de AR nativo do iPhone (Quick Look).
- Obras planas (quadros/prints) não precisam de modelo: a AR mostra a foto como moldura de ~30 cm;
  mude com `"arLarguraCm": 50`.
- Peças **com** modelo ficam em **pedestais** no centro da galeria; as **sem** modelo vão para as paredes.
  A sala cresce sozinha conforme o número de produtos.
- A `cabeca` já está configurada por padrão (`assets/models/cabeca.stl`).

Converter STL → GLB: Blender (Import STL → Export glTF 2.0 .glb) ou gltf.report.

## Preços do configurador
Em `js/configurador.js`, objeto `PRECOS` (topo do arquivo): **os valores são exemplos provisórios** — ajuste
`base`, `porCm3`, fatores de material/acabamento e os limites que viram "sob consulta".

## Arquivos dos clientes
Os `.stl` enviados ficam só na sessão (`URL.createObjectURL`); nada é guardado. A integração futura está isolada
em `js/upload-storage.js` (desligada, com o passo a passo para Firebase Storage sem expor segredos).

## Controles da galeria
WASD/setas andam · Shift corre · Q/R giram a câmera (ou arraste) · **E/Enter** abre a obra próxima
(ou o botão "Ver", ou clique/toque na obra). Celular: joystick + botões de girar. "Lista de obras" é a
alternativa acessível/sem caminhar.

## Requisitos de AR
WebXR `immersive-ar` só roda em **https**, no Chrome Android (com Google Play Services for AR). Em iPhone/desktop o site
mostra a explicação e abre o visualizador 3D (e, se houver `usdz`, o AR do iPhone).
