/* =========================================================
   GALERIA DE FOTOS (produto) + ZOOM COM PAN (lightbox)
   - arraste a foto principal pros lados pra ver mais fotos
   - toque/clique na foto (sem arrastar) abre o zoom
   - dentro do zoom, arraste pra ver os detalhes
   ========================================================= */

// -------- ZOOM COM PAN --------
function ensureLightbox() {
  let overlay = document.getElementById("lightbox-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "lightbox-overlay";
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = '<button class="lightbox-close" aria-label="Fechar">&times;</button><img id="lightbox-img" src="" alt="">';
  document.body.appendChild(overlay);
  overlay.querySelector(".lightbox-close").addEventListener("click", () => closeZoom(overlay));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeZoom(overlay);
  });
  return overlay;
}

function closeZoom(overlay) {
  overlay.classList.remove("show");
  const img = overlay.querySelector("img");
  img.style.transform = "translate(0px,0px) scale(1)";
}

function openZoom(src) {
  const overlay = ensureLightbox();
  const img = overlay.querySelector("img");
  img.src = src;
  overlay.classList.add("show");

  const ZOOM = 2.2;
  let x = 0, y = 0, startX = 0, startY = 0, dragging = false, moved = 0;
  img.style.transform = `translate(0px,0px) scale(${ZOOM})`;
  img.style.cursor = "grab";

  function down(e) {
    dragging = true; moved = 0; img.style.cursor = "grabbing";
    startX = e.clientX - x;
    startY = e.clientY - y;
    img.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!dragging) return;
    const nx = e.clientX - startX;
    const ny = e.clientY - startY;
    moved += Math.abs(nx - x) + Math.abs(ny - y);
    x = nx; y = ny;
    img.style.transform = `translate(${x}px, ${y}px) scale(${ZOOM})`;
  }
  function up() {
    dragging = false; img.style.cursor = "grab";
    if (moved < 6) closeZoom(overlay);
  }

  img.onpointerdown = down;
  img.onpointermove = move;
  img.onpointerup = up;
  img.onpointerleave = () => { dragging = false; img.style.cursor = "grab"; };
}
window.openZoom = openZoom;

// -------- GALERIA DA PÁGINA DE PRODUTO --------
function testImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * @param {string} mainSelector  seletor do <img> principal
 * @param {string} thumbsSelector (não usado mais, mantido por compatibilidade)
 * @param {string[]} images       lista de caminhos de imagem
 */
async function initGallery(mainSelector, thumbsSelector, images) {
  const mainImg = document.querySelector(mainSelector);
  if (!mainImg || !images || !images.length) return;

  const thumbsBox = document.querySelector(thumbsSelector);
  if (thumbsBox) thumbsBox.style.display = "none"; // sem miniaturas

  const testadas = await Promise.all(images.map(testImage));
  const validas = testadas.filter(Boolean);
  const lista = validas.length ? validas : [images[0]];

  let current = 0;
  function show(i) {
    current = (i + lista.length) % lista.length;
    mainImg.src = lista[current];
  }
  show(0);

  if (lista.length <= 1) {
    mainImg.style.cursor = "zoom-in";
    mainImg.addEventListener("click", () => openZoom(mainImg.src));
    return;
  }

  // arraste pros lados pra trocar de foto; toque parado abre o zoom
  mainImg.style.cursor = "grab";
  let startX = 0, dx = 0, dragging = false;

  mainImg.addEventListener("pointerdown", (e) => {
    dragging = true; startX = e.clientX; dx = 0;
    mainImg.style.transition = "none";
    mainImg.setPointerCapture(e.pointerId);
  });
  mainImg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    mainImg.style.transform = `translateX(${dx * 0.4}px)`;
    mainImg.style.opacity = String(1 - Math.min(Math.abs(dx) / 350, 0.5));
  });
  mainImg.addEventListener("pointerup", () => {
    dragging = false;
    mainImg.style.transition = "transform .2s ease, opacity .2s ease";
    mainImg.style.transform = "";
    mainImg.style.opacity = "";
    if (Math.abs(dx) > 45) {
      dx < 0 ? show(current + 1) : show(current - 1);
    } else if (Math.abs(dx) < 6) {
      openZoom(mainImg.src);
    }
    dx = 0;
  });
  mainImg.addEventListener("pointerleave", () => {
    if (!dragging) return;
    dragging = false;
    mainImg.style.transition = "transform .2s ease, opacity .2s ease";
    mainImg.style.transform = "";
    mainImg.style.opacity = "";
    dx = 0;
  });
}
window.initGallery = initGallery;
