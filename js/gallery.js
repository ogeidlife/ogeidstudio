/* =========================================================
   GALERIA DE FOTOS + ZOOM (lightbox)
   Usado nas páginas de produto (troca de foto principal e
   miniaturas) e na página de encomenda (zoom da foto do item).
   ========================================================= */

// cria (uma única vez) o overlay de zoom usado em qualquer página
function ensureLightbox() {
  let overlay = document.getElementById("lightbox-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "lightbox-overlay";
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = '<img id="lightbox-img" src="" alt="">';
  overlay.addEventListener("click", () => overlay.classList.remove("show"));
  document.body.appendChild(overlay);
  return overlay;
}

function openZoom(src) {
  const overlay = ensureLightbox();
  overlay.querySelector("img").src = src;
  overlay.classList.add("show");
}
window.openZoom = openZoom;

/**
 * Inicializa a galeria de um produto.
 * @param {string} mainSelector  seletor do <img> principal
 * @param {string} thumbsSelector seletor do container das miniaturas
 * @param {string[]} images       lista de caminhos de imagem
 */
function initGallery(mainSelector, thumbsSelector, images) {
  const mainImg = document.querySelector(mainSelector);
  const thumbsBox = document.querySelector(thumbsSelector);
  if (!mainImg || !images || !images.length) return;

  let current = 0;

  function show(index) {
    current = (index + images.length) % images.length;
    mainImg.src = images[current];
    if (thumbsBox) {
      [...thumbsBox.children].forEach((btn, i) => {
        btn.classList.toggle("active", i === current);
      });
    }
  }

  if (thumbsBox && images.length > 1) {
    thumbsBox.innerHTML = "";
    images.forEach((src, i) => {
      const btn = document.createElement("button");
      btn.innerHTML = `<img src="${src}" alt="Foto ${i + 1}" onerror="this.closest('button').style.display='none'">`;
      btn.addEventListener("click", () => show(i));
      thumbsBox.appendChild(btn);
    });
  }

  mainImg.addEventListener("click", () => openZoom(mainImg.src));

  const frame = mainImg.closest(".gallery-main");
  if (frame && images.length > 1) {
    const prev = document.createElement("div");
    prev.className = "gallery-arrow prev";
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>';
    prev.addEventListener("click", (e) => { e.stopPropagation(); show(current - 1); });

    const next = document.createElement("div");
    next.className = "gallery-arrow next";
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
    next.addEventListener("click", (e) => { e.stopPropagation(); show(current + 1); });

    frame.appendChild(prev);
    frame.appendChild(next);
  }

  show(0);
}
window.initGallery = initGallery;
