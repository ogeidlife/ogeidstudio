/* =========================================================================
 * GALERIA DE FOTOS + LIGHTBOX OVERLAY
 * -------------------------------------------------------------------------
 * API pública mantida:
 *   window.initGallery(mainSelector, thumbsSelector, images)
 *   window.openZoom(src)
 * ========================================================================= */
(function () {
  "use strict";

  const SWIPE_THRESHOLD = 30;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const DBLCLICK_ZOOM = 2.5;
  const ZOOM_STEP = 0.35;

  function el(tag, { className, attrs } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, attrs[key]);
    }
    return node;
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function distanceBetween(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  function createArrowIcon(direction) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6");
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
    for (const d of ["M6 6l12 12", "M18 6l-12 12"]) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  class ImageCache {
    constructor() { this._promises = new Map(); }
    load(src) {
      if (!src) return Promise.reject();
      if (this._promises.has(src)) return this._promises.get(src);
      const p = new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });
      this._promises.set(src, p);
      return p;
    }
    test(src) { return this.load(src).then(() => src, () => null); }
  }
  const imageCache = new ImageCache();

  class Lightbox {
    constructor() {
      this.list = [];
      this.index = 0;
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this._pointers = new Map();
      this._buildDOM();
      this._bindEvents();
    }

    _buildDOM() {
      this.overlay = el("div", { className: "lightbox-overlay", attrs: { id: "lightbox-overlay" } });
      this.stage = el("div", { className: "lightbox-stage" });
      this.loader = el("div", { className: "lightbox-loader" });
      this.img = el("img", { className: "lightbox-img", attrs: { id: "lightbox-img", draggable: "false" } });
      this.counter = el("div", { className: "lightbox-counter" });

      this.closeBtn = el("button", { className: "lightbox-close", attrs: { type: "button", "aria-label": "Fechar" } });
      this.closeBtn.appendChild(createCloseIcon());

      this.prevBtn = el("button", { className: "lightbox-arrow prev", attrs: { type: "button" } });
      this.prevBtn.appendChild(createArrowIcon("prev"));

      this.nextBtn = el("button", { className: "lightbox-arrow next", attrs: { type: "button" } });
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
      this.prevBtn.addEventListener("click", (e) => { e.stopPropagation(); this.navigate(-1); });
      this.nextBtn.addEventListener("click", (e) => { e.stopPropagation(); this.navigate(1); });

      document.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        if (e.key === "Escape") this.close();
        if (e.key === "ArrowLeft") this.navigate(-1);
        if (e.key === "ArrowRight") this.navigate(1);
      });

      this.stage.addEventListener("wheel", (e) => {
        if (!this.isOpen()) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        this.scale = clamp(this.scale + delta, MIN_ZOOM, MAX_ZOOM);
        if (this.scale === MIN_ZOOM) { this.translateX = 0; this.translateY = 0; }
        this._render();
      }, { passive: false });

      this.img.addEventListener("dblclick", () => {
        this.scale = this.scale > MIN_ZOOM ? MIN_ZOOM : DBLCLICK_ZOOM;
        this.translateX = 0; this.translateY = 0;
        this._render();
      });

      this.stage.addEventListener("pointerdown", (e) => {
        if (!this.isOpen()) return;
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pointers.size === 1) {
          this._dragStart = { x: e.clientX, y: e.clientY };
          this._dragOrigin = { x: this.translateX, y: this.translateY };
        }
      });

      this.stage.addEventListener("pointermove", (e) => {
        if (!this._pointers.has(e.pointerId)) return;
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pointers.size === 1 && this.scale > MIN_ZOOM) {
          this.translateX = this._dragOrigin.x + (e.clientX - this._dragStart.x);
          this.translateY = this._dragOrigin.y + (e.clientY - this._dragStart.y);
          this._render();
        }
      });

      const endPointer = (e) => {
        if (this._pointers.has(e.pointerId) && this._pointers.size === 1 && this.scale === MIN_ZOOM && this._dragStart) {
          const dx = e.clientX - this._dragStart.x;
          if (Math.abs(dx) > SWIPE_THRESHOLD) this.navigate(dx < 0 ? 1 : -1);
        }
        this._pointers.delete(e.pointerId);
      };

      this.stage.addEventListener("pointerup", endPointer);
      this.stage.addEventListener("pointercancel", endPointer);
    }

    _render() {
      this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    navigate(delta) {
      if (this.list.length <= 1) return;
      this.index = (this.index + delta + this.list.length) % this.list.length;
      if (this.onNavigate) this.onNavigate(this.index);
      this._show(this.list[this.index]);
      this._updateCounter();
    }

    _show(src) {
      this.loader.classList.add("show");
      this.scale = MIN_ZOOM;
      this.translateX = 0;
      this.translateY = 0;
      this._render();

      imageCache.load(src).then((loaded) => {
        this.img.src = loaded.src;
        this.loader.classList.remove("show");
      }, () => this.loader.classList.remove("show"));
    }

    _updateCounter() {
      if (this.list.length > 1) {
        this.counter.textContent = `${this.index + 1} / ${this.list.length}`;
        this.counter.classList.add("show");
      } else {
        this.counter.classList.remove("show");
      }
      const hasMulti = this.list.length > 1;
      this.prevBtn.classList.toggle("show", hasMulti);
      this.nextBtn.classList.toggle("show", hasMulti);
    }

    open(src, opts = {}) {
      this.list = opts.list && opts.list.length ? opts.list : [src];
      this.index = opts.list ? opts.index || 0 : 0;
      this.onNavigate = opts.onNavigate || null;

      this._show(this.list[this.index]);
      this._updateCounter();
      this.overlay.classList.add("show");
      document.body.classList.add("lightbox-lock");
    }

    close() {
      this.overlay.classList.remove("show");
      document.body.classList.remove("lightbox-lock");
    }

    isOpen() {
      return this.overlay.classList.contains("show");
    }
  }

  let lbInstance = null;
  function getLightbox() {
    if (!lbInstance) lbInstance = new Lightbox();
    return lbInstance;
  }

  class Gallery {
    constructor(mainEl, thumbsEl, images) {
      this.mainEl = mainEl;
      this.thumbsEl = thumbsEl;
      this.images = images;
      this.current = 0;
      this._init();
    }

    async _init() {
      const tested = await Promise.all(this.images.map(s => imageCache.test(s)));
      this.list = tested.filter(Boolean);
      if (!this.list.length) this.list = [this.images[0]];

      if (this.thumbsEl) this.thumbsEl.style.display = "none";

      this.mainEl.style.cursor = "pointer";
      this.show(0);

      // Eventos de Toque / Arraste simples na imagem principal
      let startX = 0, startY = 0, isTouch = false;

      this.mainEl.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isTouch = true;
      }, { passive: true });

      this.mainEl.addEventListener("touchend", (e) => {
        if (!isTouch) return;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - startX;
        const dy = endY - startY;

        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          this.show(this.current + (dx < 0 ? 1 : -1));
        }
        isTouch = false;
      }, { passive: true });

      // Clique direto abre a foto na frente imediatamente
      this.mainEl.addEventListener("click", () => {
        getLightbox().open(this.list[this.current], {
          list: this.list,
          index: this.current,
          onNavigate: (i) => this.show(i)
        });
      });
    }

    show(idx) {
      this.current = (idx + this.list.length) % this.list.length;
      const src = this.list[this.current];
      imageCache.load(src).then(img => {
        if (this.list[this.current] === src) {
          this.mainEl.src = img.src;
        }
      });
    }
  }

  window.initGallery = function (mainSel, thumbsSel, images) {
    const mainEl = document.querySelector(mainSel);
    if (!mainEl || !images || !images.length) return;
    if (mainEl.dataset.galleryInitialized === "true") return;
    mainEl.dataset.galleryInitialized = "true";
    new Gallery(mainEl, thumbsSel ? document.querySelector(thumbsSel) : null, images);
  };

  window.openZoom = function (src) {
    getLightbox().open(src);
  };
})();