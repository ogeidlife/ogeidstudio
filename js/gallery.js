/* =========================================================================
 * GALERIA DE FOTOS + LIGHTBOX (Otimizado: Foto Única + Swipe + Zoom)
 * -------------------------------------------------------------------------
 * API pública mantida intacta:
 *   window.initGallery(mainSelector, thumbsSelector, images)
 *   window.openZoom(src)
 * ========================================================================= */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * Constantes
   * -------------------------------------------------------------------- */
  const SWIPE_THRESHOLD = 30;      // Pixels mínimos para considerar um deslize
  const MIN_ZOOM = 1;              // Zoom mínimo no lightbox
  const MAX_ZOOM = 4;              // Zoom máximo no lightbox
  const DBLCLICK_ZOOM = 2.5;       // Nível de zoom ao dar duplo clique
  const ZOOM_STEP = 0.35;          // Incremento do zoom via scroll

  /* ----------------------------------------------------------------------
   * Utilidades DOM
   * -------------------------------------------------------------------- */
  function el(tag, { className, attrs, text } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, attrs[key]);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function distanceBetween(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  function midpointBetween(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function createArrowIcon(direction) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute(
      "d",
      direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"
    );
    svg.appendChild(path);
    return svg;
  }

  function createCloseIcon() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    for (const d of ["M6 6l12 12", "M18 6l-12 12"]) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  /* ----------------------------------------------------------------------
   * ImageCache
   * -------------------------------------------------------------------- */
  class ImageCache {
    constructor() {
      this._promises = new Map();
    }

    load(src) {
      if (!src) return Promise.reject(new Error("src vazio"));
      if (this._promises.has(src)) return this._promises.get(src);

      const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Falha ao carregar: " + src));
        img.src = src;
      });

      this._promises.set(src, promise);
      return promise;
    }

    test(src) {
      return this.load(src).then(
        () => src,
        () => null
      );
    }
  }

  const imageCache = new ImageCache();

  /* ----------------------------------------------------------------------
   * Lightbox (Overlay de Zoom)
   * -------------------------------------------------------------------- */
  class Lightbox {
    constructor() {
      this.list = [];
      this.index = 0;
      this.onNavigate = null;

      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;

      this._pointers = new Map();
      this._pinchStartDistance = 0;
      this._pinchStartScale = 1;
      this._dragging = false;
      this._dragStart = null;
      this._dragOrigin = null;
      this._triggerEl = null;
      this._raf = null;

      this._buildDOM();
      this._bindEvents();
    }

    _buildDOM() {
      this.overlay = el("div", {
        className: "lightbox-overlay",
        attrs: {
          id: "lightbox-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Visualização ampliada da imagem",
        },
      });

      this.stage = el("div", { className: "lightbox-stage" });
      this.loader = el("div", { className: "lightbox-loader", attrs: { "aria-hidden": "true" } });
      this.img = el("img", { className: "lightbox-img", attrs: { id: "lightbox-img", alt: "", draggable: "false" } });
      this.counter = el("div", { className: "lightbox-counter", attrs: { "aria-live": "polite" } });

      this.closeBtn = el("button", { className: "lightbox-close", attrs: { type: "button", "aria-label": "Fechar (Esc)" } });
      this.closeBtn.appendChild(createCloseIcon());

      this.prevBtn = el("button", { className: "lightbox-arrow prev", attrs: { type: "button", "aria-label": "Imagem anterior" } });
      this.prevBtn.appendChild(createArrowIcon("prev"));

      this.nextBtn = el("button", { className: "lightbox-arrow next", attrs: { type: "button", "aria-label": "Próxima imagem" } });
      this.nextBtn.appendChild(createArrowIcon("next"));

      this.stage.append(this.loader, this.img);
      this.overlay.append(this.stage, this.counter, this.closeBtn, this.prevBtn, this.nextBtn);
      document.body.appendChild(this.overlay);
    }

    _bindEvents() {
      this.overlay.addEventListener("click", (e) => {
        if (e.target === this.overlay || e.target === this.stage) this.close();
      });

      this.closeBtn.addEventListener("click", () => this.close());
      this.prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.navigate(-1);
      });
      this.nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.navigate(1);
      });

      document.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        switch (e.key) {
          case "Escape": this.close(); break;
          case "ArrowLeft": this.navigate(-1); break;
          case "ArrowRight": this.navigate(1); break;
        }
      });

      this.stage.addEventListener("wheel", (e) => {
        if (!this.isOpen()) return;
        e.preventDefault();
        const rect = this.img.getBoundingClientRect();
        const originX = e.clientX - rect.left - rect.width / 2;
        const originY = e.clientY - rect.top - rect.height / 2;
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        this._zoomBy(delta, originX, originY);
      }, { passive: false });

      this.img.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (this.scale > MIN_ZOOM) {
          this._setZoom(MIN_ZOOM, 0, 0);
        } else {
          const rect = this.img.getBoundingClientRect();
          const originX = e.clientX - rect.left - rect.width / 2;
          const originY = e.clientY - rect.top - rect.height / 2;
          this._setZoom(DBLCLICK_ZOOM, originX, originY);
        }
      });

      this.stage.addEventListener("pointerdown", (e) => this._onPointerDown(e));
      this.stage.addEventListener("pointermove", (e) => this._onPointerMove(e));
      this.stage.addEventListener("pointerup", (e) => this._onPointerUp(e));
      this.stage.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    }

    _onPointerDown(e) {
      if (!this.isOpen()) return;
      this.stage.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        const [p1, p2] = [...this._pointers.values()];
        this._pinchStartDistance = distanceBetween(p1, p2);
        this._pinchStartScale = this.scale;
        this._dragging = false;
      } else if (this._pointers.size === 1 && this.scale > MIN_ZOOM) {
        this._dragging = true;
        this._dragStart = { x: e.clientX, y: e.clientY };
        this._dragOrigin = { x: this.translateX, y: this.translateY };
      } else if (this._pointers.size === 1) {
        this._swipeStart = { x: e.clientX, y: e.clientY };
      }
    }

    _onPointerMove(e) {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        const [p1, p2] = [...this._pointers.values()];
        const dist = distanceBetween(p1, p2);
        if (this._pinchStartDistance > 0) {
          const ratio = dist / this._pinchStartDistance;
          const newScale = clamp(this._pinchStartScale * ratio, MIN_ZOOM, MAX_ZOOM);
          this._applyZoom(newScale, this.translateX, this.translateY);
        }
        return;
      }

      if (this._dragging) {
        const dx = e.clientX - this._dragStart.x;
        const dy = e.clientY - this._dragStart.y;
        this.translateX = this._dragOrigin.x + dx;
        this.translateY = this._dragOrigin.y + dy;
        this._clampTranslate();
        this._scheduleRender();
      }
    }

    _onPointerUp(e) {
      if (this._pointers.has(e.pointerId) && this._pointers.size === 1 && this.scale === MIN_ZOOM && this._swipeStart) {
        const dx = e.clientX - this._swipeStart.x;
        const dy = e.clientY - this._swipeStart.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          this.navigate(dx < 0 ? 1 : -1);
        }
      }
      this._pointers.delete(e.pointerId);
      this._swipeStart = null;
      if (this._pointers.size < 2) this._pinchStartDistance = 0;
      if (this._pointers.size === 0) this._dragging = false;
    }

    _zoomBy(delta, originX, originY) {
      this._setZoom(clamp(this.scale + delta, MIN_ZOOM, MAX_ZOOM), originX, originY);
    }

    _setZoom(newScale, originX, originY) {
      this._applyZoom(clamp(newScale, MIN_ZOOM, MAX_ZOOM), this.translateX, this.translateY, originX, originY);
    }

    _applyZoom(newScale, currentX, currentY, originX = 0, originY = 0) {
      const prevScale = this.scale;
      this.scale = newScale;

      if (this.scale === MIN_ZOOM) {
        this.translateX = 0;
        this.translateY = 0;
      } else if (originX !== undefined && prevScale !== newScale) {
        const factor = newScale / prevScale - 1;
        this.translateX = currentX - originX * factor;
        this.translateY = currentY - originY * factor;
      }

      this._clampTranslate();
      this._scheduleRender();
    }

    _clampTranslate() {
      if (this.scale <= MIN_ZOOM) {
        this.translateX = 0;
        this.translateY = 0;
        return;
      }
      const rect = this.stage.getBoundingClientRect();
      const maxX = (rect.width * (this.scale - 1)) / 2;
      const maxY = (rect.height * (this.scale - 1)) / 2;
      this.translateX = clamp(this.translateX, -maxX, maxX);
      this.translateY = clamp(this.translateY, -maxY, maxY);
    }

    _scheduleRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        this.img.classList.toggle("is-zoomed", this.scale > MIN_ZOOM);
        this._raf = null;
      });
    }

    navigate(delta) {
      if (this.list.length <= 1) return;
      this._goTo((this.index + delta + this.list.length) % this.list.length);
    }

    _goTo(index) {
      this.index = clamp(index, 0, this.list.length - 1);
      if (typeof this.onNavigate === "function") {
        this.onNavigate(this.index);
      } else {
        this._show(this.list[this.index]);
      }
      this._updateCounter();
    }

    _show(src) {
      this.loader.classList.add("show");
      this.img.classList.remove("loaded");
      this._resetZoom();

      imageCache.load(src).then(
        (loadedImg) => {
          this.img.src = loadedImg.src;
          this.loader.classList.remove("show");
          this.img.classList.add("loaded");
        },
        () => this.loader.classList.remove("show")
      );
    }

    _resetZoom() {
      this.scale = MIN_ZOOM;
      this.translateX = 0;
      this.translateY = 0;
      this.img.style.transform = "";
      this.img.classList.remove("is-zoomed");
    }

    _updateCounter() {
      if (this.list.length > 1) {
        this.counter.textContent = `${this.index + 1} / ${this.list.length}`;
        this.counter.classList.add("show");
      } else {
        this.counter.classList.remove("show");
      }
      const hasMultiple = this.list.length > 1;
      this.prevBtn.classList.toggle("show", hasMultiple);
      this.nextBtn.classList.toggle("show", hasMultiple);
    }

    open(src, opts = {}) {
      this.list = opts.list && opts.list.length ? opts.list : [src];
      this.index = opts.list ? clamp(opts.index || 0, 0, this.list.length - 1) : 0;
      this.onNavigate = opts.onNavigate || null;
      this._triggerEl = document.activeElement;

      this._show(this.list[this.index]);
      this._updateCounter();

      this.overlay.classList.add("show");
      document.body.classList.add("lightbox-lock");
      this.closeBtn.focus();
    }

    close() {
      if (!this.isOpen()) return;
      this.overlay.classList.remove("show");
      document.body.classList.remove("lightbox-lock");
      this._resetZoom();
      if (this._triggerEl && typeof this._triggerEl.focus === "function") {
        this._triggerEl.focus();
      }
    }

    isOpen() {
      return this.overlay.classList.contains("show");
    }
  }

  let lightboxInstance = null;
  function getLightbox() {
    if (!lightboxInstance) lightboxInstance = new Lightbox();
    return lightboxInstance;
  }

  /* ----------------------------------------------------------------------
   * Gallery (Instância na página)
   * Exibe apenas uma imagem compacta e escuta deslize (swipe) ou clique.
   * -------------------------------------------------------------------- */
  class Gallery {
    constructor(mainEl, thumbsEl, images) {
      this.mainEl = mainEl;
      this.thumbsEl = thumbsEl || null;
      this.frame = mainEl.closest(".gallery-main") || mainEl.parentElement;
      this.rawImages = images;

      this.list = [];
      this.current = 0;
      this._swipeStart = null;
      this._isSwiping = false;

      this._init();
    }

    async _init() {
      const tested = await Promise.all(this.rawImages.map((src) => imageCache.test(src)));
      const valid = tested.filter(Boolean);
      this.list = valid.length ? valid : [this.rawImages[0]];

      // Esconde o container de miniaturas extras para não encompridar a página
      if (this.thumbsEl) {
        this.thumbsEl.style.display = "none";
      }

      this._prepareMainImage();
      this._buildCounter();
      this._bindEvents();

      this.show(0);
    }

    _prepareMainImage() {
      this.mainEl.decoding = "async";
      this.mainEl.loading = "eager";
      this.mainEl.tabIndex = 0;
      this.mainEl.style.cursor = "pointer";
      this.mainEl.setAttribute("role", "button");
      this.mainEl.setAttribute("aria-label", "Ampliar imagem em zoom");
    }

    _buildCounter() {
      if (!this.frame || this.list.length <= 1) return;
      // Garante indicador visual simples de página (ex: 1/5) sob a foto
      let counterEl = this.frame.querySelector(".gallery-counter");
      if (!counterEl) {
        counterEl = el("div", {
          className: "gallery-counter",
          attrs: { "aria-live": "polite" },
        });
        this.frame.appendChild(counterEl);
      }
      this.counterEl = counterEl;
    }

    _bindEvents() {
      const target = this.mainEl;

      // 1. Gestos Touch / Mouse para Arrastar (Swipe)
      const onPointerDown = (e) => {
        this._swipeStart = { x: e.clientX, y: e.clientY };
        this._isSwiping = false;
      };

      const onPointerMove = (e) => {
        if (!this._swipeStart) return;
        const dx = e.clientX - this._swipeStart.x;
        const dy = e.clientY - this._swipeStart.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          this._isSwiping = true;
        }
      };

      const onPointerUp = (e) => {
        if (!this._swipeStart) return;
        const dx = e.clientX - this._swipeStart.x;
        const dy = e.clientY - this._swipeStart.y;

        // Se moveu mais horizontalmente do que o limite, troca de imagem
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) && this.list.length > 1) {
          this.show(this.current + (dx < 0 ? 1 : -1));
        } else if (!this._isSwiping) {
          // Se apenas clicou sem arrastar, abre o zoom instantaneamente
          this._openZoomHere();
        }

        this._swipeStart = null;
        this._isSwiping = false;
      };

      target.addEventListener("pointerdown", onPointerDown);
      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", onPointerUp);
      target.addEventListener("pointercancel", () => {
        this._swipeStart = null;
        this._isSwiping = false;
      });

      // Suporte a Teclado (Enter / Espaço / Setas)
      target.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._openZoomHere();
        } else if (e.key === "ArrowLeft" && this.list.length > 1) {
          e.preventDefault();
          this.show(this.current - 1);
        } else if (e.key === "ArrowRight" && this.list.length > 1) {
          e.preventDefault();
          this.show(this.current + 1);
        }
      });
    }

    _openZoomHere() {
      getLightbox().open(this.list[this.current], {
        list: this.list,
        index: this.current,
        onNavigate: (i) => this.show(i),
      });
    }

    show(index) {
      this.current = (index + this.list.length) % this.list.length;
      const src = this.list[this.current];

      imageCache.load(src).then((loadedImg) => {
        if (this.list[this.current] === src) {
          this.mainEl.src = loadedImg.src;
        }
      });

      this._updateCounter();

      // Pré-carrega a imagem anterior e próxima para transição rápida no deslize
      if (this.list.length > 1) {
        const next = this.list[(this.current + 1) % this.list.length];
        const prev = this.list[(this.current - 1 + this.list.length) % this.list.length];
        imageCache.load(next);
        imageCache.load(prev);
      }

      // Sincroniza com o Lightbox se já estiver aberto
      const lb = getLightbox();
      if (lb.isOpen() && lb.onNavigate) {
        lb.index = this.current;
        lb._updateCounter();
      }
    }

    _updateCounter() {
      if (this.counterEl && this.list.length > 1) {
        this.counterEl.textContent = `${this.current + 1} / ${this.list.length}`;
      }
    }
  }

  /* ----------------------------------------------------------------------
   * API Pública
   * -------------------------------------------------------------------- */
  function initGallery(mainSelector, thumbsSelector, images) {
    const mainEl = document.querySelector(mainSelector);
    const thumbsEl = thumbsSelector ? document.querySelector(thumbsSelector) : null;
    if (!mainEl || !images || !images.length) return;

    if (mainEl.dataset.galleryInitialized === "true") return;
    mainEl.dataset.galleryInitialized = "true";

    new Gallery(mainEl, thumbsEl, images);
  }

  function openZoom(src) {
    getLightbox().open(src);
  }

  window.initGallery = initGallery;
  window.openZoom = openZoom;
})();