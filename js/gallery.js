/* =========================================================================
 * GALERIA DE FOTOS + LIGHTBOX (zoom)
 * -------------------------------------------------------------------------
 * Usado nas páginas de produto (troca de foto principal + miniaturas) e em
 * qualquer outra página que precise abrir uma imagem em zoom (ex.: página
 * de encomenda).
 *
 * API pública mantida (nada mais no projeto precisa mudar):
 *   window.initGallery(mainSelector, thumbsSelector, images)
 *   window.openZoom(src)
 *
 * Arquitetura:
 *   ImageCache -> cache/preload compartilhado de imagens
 *   Lightbox   -> overlay de zoom (singleton), com pan, pinch e navegação
 *   Gallery    -> uma instância por produto (imagem principal + miniaturas)
 *
 * Sem jQuery, sem libs externas, sem frameworks. Sem variáveis globais além
 * das duas funções públicas exigidas.
 * ========================================================================= */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * Constantes
   * -------------------------------------------------------------------- */
  const SWIPE_THRESHOLD = 40;      // px mínimos para considerar um swipe
  const WHEEL_NAV_COOLDOWN = 350;  // ms entre trocas de imagem via scroll
  const MIN_ZOOM = 1;              // zoom mínimo no lightbox
  const MAX_ZOOM = 4;              // zoom máximo no lightbox
  const DBLCLICK_ZOOM = 2.5;       // nível de zoom ao dar duplo clique
  const ZOOM_STEP = 0.35;          // incremento por "clique" de scroll

  /* ----------------------------------------------------------------------
   * Utilidades
   * -------------------------------------------------------------------- */

  /** Cria um elemento DOM sem usar innerHTML (evita XSS). */
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

  /** Cria um ícone de seta (SVG) sem depender de innerHTML com string fixa. */
  function createArrowIcon(direction) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
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
    svg.setAttribute("focusable", "false");
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
   * Cache + pré-carregamento compartilhado por todas as galerias da página.
   * Garante que a mesma imagem nunca é buscada/decodificada duas vezes.
   * -------------------------------------------------------------------- */
  class ImageCache {
    constructor() {
      /** @type {Map<string, Promise<HTMLImageElement>>} */
      this._promises = new Map();
    }

    /** Carrega (ou reaproveita do cache) uma imagem. Nunca rejeita "alto". */
    load(src) {
      if (!src) return Promise.reject(new Error("src vazio"));
      if (this._promises.has(src)) return this._promises.get(src);

      const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager"; // já é um preload deliberado
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Falha ao carregar: " + src));
        img.src = src;
      });

      this._promises.set(src, promise);
      return promise;
    }

    /** Testa se uma imagem existe/carrega, sem nunca rejeitar. */
    test(src) {
      return this.load(src).then(
        () => src,
        () => null
      );
    }

    has(src) {
      return this._promises.has(src);
    }
  }

  const imageCache = new ImageCache();

  /* ----------------------------------------------------------------------
   * Lightbox
   * Overlay único (singleton) reaproveitado por todas as galerias e por
   * chamadas diretas a window.openZoom(). Suporta zoom real (wheel, duplo
   * clique, pinch), arrastar quando ampliado, navegação por teclado/swipe
   * e contador de imagens.
   * -------------------------------------------------------------------- */
  class Lightbox {
    constructor() {
      this.list = [];
      this.index = 0;
      this.onNavigate = null; // callback opcional (sincroniza com a galeria)

      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;

      this._pointers = new Map(); // pointerId -> {x, y} (suporte a pinch)
      this._pinchStartDistance = 0;
      this._pinchStartScale = 1;
      this._pinchStartMidpoint = null;
      this._dragging = false;
      this._dragStart = null;
      this._dragOrigin = null;

      this._lastWheelNav = 0;
      this._triggerEl = null; // elemento que abriu o lightbox (p/ devolver foco)
      this._raf = null; // requestAnimationFrame pendente p/ aplicar transform

      this._buildDOM();
      this._bindEvents();
    }

    /* ---- Construção do DOM (uma única vez, sem inner HTML) ---- */
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

      this.loader = el("div", {
        className: "lightbox-loader",
        attrs: { "aria-hidden": "true" },
      });

      this.img = el("img", {
        className: "lightbox-img",
        attrs: { id: "lightbox-img", alt: "", draggable: "false" },
      });

      this.counter = el("div", {
        className: "lightbox-counter",
        attrs: { "aria-live": "polite" },
      });

      this.closeBtn = el("button", {
        className: "lightbox-close",
        attrs: { type: "button", "aria-label": "Fechar (Esc)" },
      });
      this.closeBtn.appendChild(createCloseIcon());

      this.prevBtn = el("button", {
        className: "lightbox-arrow prev",
        attrs: { type: "button", "aria-label": "Imagem anterior" },
      });
      this.prevBtn.appendChild(createArrowIcon("prev"));

      this.nextBtn = el("button", {
        className: "lightbox-arrow next",
        attrs: { type: "button", "aria-label": "Próxima imagem" },
      });
      this.nextBtn.appendChild(createArrowIcon("next"));

      this.stage.append(this.loader, this.img);
      this.overlay.append(this.stage, this.counter, this.closeBtn, this.prevBtn, this.nextBtn);
      document.body.appendChild(this.overlay);
    }

    /* ---- Eventos (registrados uma única vez) ---- */
    _bindEvents() {
      // clique fora da imagem fecha
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

      // teclado: Esc, setas, Home, End
      document.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        switch (e.key) {
          case "Escape":
            this.close();
            break;
          case "ArrowLeft":
            this.navigate(-1);
            break;
          case "ArrowRight":
            this.navigate(1);
            break;
          case "Home":
            e.preventDefault();
            this._goTo(0);
            break;
          case "End":
            e.preventDefault();
            this._goTo(this.list.length - 1);
            break;
        }
      });

      // roda do mouse: zoom (Ctrl/⌘ + scroll ou scroll simples)
      this.stage.addEventListener(
        "wheel",
        (e) => {
          if (!this.isOpen()) return;
          e.preventDefault();
          const rect = this.img.getBoundingClientRect();
          const originX = e.clientX - rect.left - rect.width / 2;
          const originY = e.clientY - rect.top - rect.height / 2;
          const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
          this._zoomBy(delta, originX, originY);
        },
        { passive: false }
      );

      // duplo clique: alterna entre 1x e nível de zoom rápido
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

      // arrastar (mouse e touch) via Pointer Events — cobre também o pinch
      this.stage.addEventListener("pointerdown", (e) => this._onPointerDown(e));
      this.stage.addEventListener("pointermove", (e) => this._onPointerMove(e));
      this.stage.addEventListener("pointerup", (e) => this._onPointerUp(e));
      this.stage.addEventListener("pointercancel", (e) => this._onPointerUp(e));
      this.stage.addEventListener("pointerleave", (e) => this._onPointerUp(e));

      // recentraliza/reclampa ao redimensionar a janela
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() => {
          if (this.isOpen()) this._clampTranslate();
        });
        this._resizeObserver.observe(this.stage);
      } else {
        window.addEventListener("resize", () => {
          if (this.isOpen()) this._clampTranslate();
        });
      }
    }

    /* ---- Pointer / gestos (arrastar quando ampliado + pinch to zoom) ---- */
    _onPointerDown(e) {
      if (!this.isOpen()) return;
      this.stage.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        const [p1, p2] = [...this._pointers.values()];
        this._pinchStartDistance = distanceBetween(p1, p2);
        this._pinchStartScale = this.scale;
        this._pinchStartMidpoint = midpointBetween(p1, p2);
        this._dragging = false;
      } else if (this._pointers.size === 1 && this.scale > MIN_ZOOM) {
        this._dragging = true;
        this._dragStart = { x: e.clientX, y: e.clientY };
        this._dragOrigin = { x: this.translateX, y: this.translateY };
      } else if (this._pointers.size === 1) {
        // usado para detectar swipe horizontal quando não há zoom
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
        // sem zoom ativo: trata como swipe de navegação
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

    /* ---- Zoom ---- */
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
        // mantém o ponto sob o cursor/dedo fixo ao dar zoom
        const factor = newScale / prevScale - 1;
        this.translateX = currentX - originX * factor;
        this.translateY = currentY - originY * factor;
      }

      this._clampTranslate();
      this._scheduleRender();
    }

    /** Impede que a imagem seja arrastada para fora da área visível. */
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

    /** Agenda a aplicação do transform no próximo frame (evita reflow). */
    _scheduleRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        this.img.classList.toggle("is-zoomed", this.scale > MIN_ZOOM);
        this._raf = null;
      });
    }

    /* ---- Navegação entre imagens ---- */
    navigate(delta) {
      if (this.list.length <= 1) return;
      this._goTo((this.index + delta + this.list.length) % this.list.length);
    }

    _goTo(index) {
      this.index = clamp(index, 0, this.list.length - 1);
      if (typeof this.onNavigate === "function") {
        this.onNavigate(this.index); // deixa a galeria dona da imagem gerenciar
      } else {
        this._show(this.list[this.index]);
      }
      this._updateCounter();
    }

    /* ---- Exibição / carregamento ---- */
    _show(src) {
      this.loader.classList.add("show");
      this.img.classList.remove("loaded");
      this._resetZoom();

      imageCache.load(src).then(
        (loadedImg) => {
          this.img.src = loadedImg.src;
          this.img.alt = "";
          this.loader.classList.remove("show");
          this.img.classList.add("loaded");
        },
        () => {
          this.loader.classList.remove("show");
        }
      );

      // pré-carrega vizinhas para troca instantânea ao navegar
      if (this.list.length > 1) {
        const next = this.list[(this.index + 1) % this.list.length];
        const prev = this.list[(this.index - 1 + this.list.length) % this.list.length];
        imageCache.load(next);
        imageCache.load(prev);
      }
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

    /* ---- API pública do Lightbox ---- */

    /**
     * Abre o lightbox.
     * @param {string} src imagem inicial
     * @param {object} [opts]
     * @param {string[]} [opts.list] lista completa (para navegação)
     * @param {number} [opts.index] índice inicial dentro da lista
     * @param {(index:number)=>void} [opts.onNavigate] callback ao navegar
     */
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

  // singleton: um único overlay reaproveitado por toda a página
  let lightboxInstance = null;
  function getLightbox() {
    if (!lightboxInstance) lightboxInstance = new Lightbox();
    return lightboxInstance;
  }

  /* ----------------------------------------------------------------------
   * Gallery
   * Uma instância por bloco de produto: imagem principal + miniaturas +
   * setas + contador. Suporta mouse, teclado, swipe e delega o zoom real
   * para o Lightbox singleton.
   * -------------------------------------------------------------------- */
  class Gallery {
    constructor(mainEl, thumbsEl, images) {
      this.mainEl = mainEl;
      this.thumbsEl = thumbsEl || null;
      this.frame = mainEl.closest(".gallery-main");
      this.rawImages = images;

      this.list = [];
      this.current = 0;
      this.thumbButtons = [];
      this.prevArrow = null;
      this.nextArrow = null;
      this.counterEl = null;

      this._lastWheelNav = 0;
      this._swipeStart = null;

      this._init();
    }

    async _init() {
      // só considera fotos que realmente existem, pra não mostrar
      // miniatura/seta de navegação quando só tem 1 foto de verdade
      const tested = await Promise.all(this.rawImages.map((src) => imageCache.test(src)));
      const valid = tested.filter(Boolean);
      this.list = valid.length ? valid : [this.rawImages[0]];

      this._prepareMainImage();
      this._buildThumbs();
      this._buildArrows();
      this._buildCounter();
      this._bindEvents();

      this.show(0);
    }

    _prepareMainImage() {
      this.mainEl.decoding = "async";
      this.mainEl.loading = "eager"; // é a imagem principal, sempre visível
      this.mainEl.tabIndex = 0;
      this.mainEl.setAttribute("role", "button");
      this.mainEl.setAttribute("aria-label", "Ampliar imagem do produto");
    }

    _buildThumbs() {
      if (!this.thumbsEl) return;

      if (this.list.length <= 1) {
        this.thumbsEl.style.display = "none";
        this.thumbsEl.replaceChildren();
        return;
      }

      this.thumbsEl.style.display = "";
      const fragment = document.createDocumentFragment();
      this.thumbButtons = [];

      this.list.forEach((src, i) => {
        const btn = el("button", {
          className: "gallery-thumb",
          attrs: {
            type: "button",
            "aria-label": `Ver foto ${i + 1} de ${this.list.length}`,
            "aria-current": "false",
          },
        });
        const thumbImg = el("img", {
          attrs: {
            src,
            alt: "",
            loading: "lazy",
            decoding: "async",
          },
        });
        btn.appendChild(thumbImg);
        btn.addEventListener("click", () => this.show(i));
        fragment.appendChild(btn);
        this.thumbButtons.push(btn);
      });

      this.thumbsEl.replaceChildren(fragment);
      this._observeThumbVisibility();
    }

    /** Usa IntersectionObserver para pré-carregar a foto em alta assim que
     *  a miniatura correspondente entra na área visível (útil em galerias
     *  longas com miniaturas em carrossel horizontal). */
    _observeThumbVisibility() {
      if (typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const idx = this.thumbButtons.indexOf(entry.target);
            if (idx !== -1) imageCache.load(this.list[idx]);
            observer.unobserve(entry.target);
          });
        },
        { root: this.thumbsEl, threshold: 0.5 }
      );
      this.thumbButtons.forEach((btn) => observer.observe(btn));
      this._thumbObserver = observer;
    }

    _buildArrows() {
      if (!this.frame || this.list.length <= 1) return;

      this.prevArrow = el("button", {
        className: "gallery-arrow prev",
        attrs: { type: "button", "aria-label": "Foto anterior" },
      });
      this.prevArrow.appendChild(createArrowIcon("prev"));

      this.nextArrow = el("button", {
        className: "gallery-arrow next",
        attrs: { type: "button", "aria-label": "Próxima foto" },
      });
      this.nextArrow.appendChild(createArrowIcon("next"));

      this.prevArrow.addEventListener("click", (e) => {
        e.stopPropagation();
        this.show(this.current - 1);
      });
      this.nextArrow.addEventListener("click", (e) => {
        e.stopPropagation();
        this.show(this.current + 1);
      });

      this.frame.append(this.prevArrow, this.nextArrow);
    }

    _buildCounter() {
      if (!this.frame || this.list.length <= 1) return;
      this.counterEl = el("div", {
        className: "gallery-counter",
        attrs: { "aria-live": "polite" },
      });
      this.frame.appendChild(this.counterEl);
    }

    _bindEvents() {
      // clique / teclado (Enter, Espaço) abrem o zoom
      this.mainEl.addEventListener("click", () => this._openZoomHere());
      this.mainEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._openZoomHere();
        }
      });

      if (this.list.length <= 1) return; // sem navegação a configurar

      // duplo clique também abre o zoom (comportamento explícito e óbvio)
      this.mainEl.addEventListener("dblclick", () => this._openZoomHere());

      // roda do mouse sobre a imagem principal navega entre as fotos
      const target = this.frame || this.mainEl;
      target.addEventListener(
        "wheel",
        (e) => {
          const now = Date.now();
          if (now - this._lastWheelNav < WHEEL_NAV_COOLDOWN) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          this._lastWheelNav = now;
          this.show(this.current + (e.deltaY > 0 ? 1 : -1));
        },
        { passive: false }
      );

      // teclado: setas / Home / End quando a galeria está focada
      target.addEventListener("keydown", (e) => {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            this.show(this.current - 1);
            break;
          case "ArrowRight":
            e.preventDefault();
            this.show(this.current + 1);
            break;
          case "Home":
            e.preventDefault();
            this.show(0);
            break;
          case "End":
            e.preventDefault();
            this.show(this.list.length - 1);
            break;
        }
      });

      // swipe (touch) esquerda/direita
      target.addEventListener(
        "touchstart",
        (e) => {
          const t = e.changedTouches[0];
          this._swipeStart = { x: t.clientX, y: t.clientY };
        },
        { passive: true }
      );
      target.addEventListener(
        "touchend",
        (e) => {
          if (!this._swipeStart) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - this._swipeStart.x;
          const dy = t.clientY - this._swipeStart.y;
          this._swipeStart = null;
          if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
            this.show(this.current + (dx < 0 ? 1 : -1));
          }
        },
        { passive: true }
      );
    }

    _openZoomHere() {
      getLightbox().open(this.list[this.current], {
        list: this.list,
        index: this.current,
        onNavigate: (i) => this.show(i),
      });
    }

    /** Troca a imagem principal exibida (com wrap-around). */
    show(index) {
      this.current = (index + this.list.length) % this.list.length;
      const src = this.list[this.current];

      // troca instantânea se já estiver em cache; senão aguarda o load
      // para não mostrar um frame quebrado.
      imageCache.load(src).then((loadedImg) => {
        // evita condição de corrida: só aplica se ainda for a imagem atual
        if (this.list[this.current] === src) {
          this.mainEl.src = loadedImg.src;
        }
      });

      this._updateActiveThumb();
      this._updateCounter();
      this._preloadNeighbors();

      // se o lightbox estiver aberto mostrando esta galeria, mantém em sincronia
      const lb = getLightbox();
      if (lb.isOpen() && lb.onNavigate) {
        lb.index = this.current;
        lb._updateCounter();
      }
    }

    _updateActiveThumb() {
      this.thumbButtons.forEach((btn, i) => {
        const active = i === this.current;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-current", String(active));
      });
    }

    _updateCounter() {
      if (this.counterEl) {
        this.counterEl.textContent = `${this.current + 1} / ${this.list.length}`;
      }
    }

    _preloadNeighbors() {
      if (this.list.length <= 1) return;
      const next = this.list[(this.current + 1) % this.list.length];
      const prev = this.list[(this.current - 1 + this.list.length) % this.list.length];
      imageCache.load(next);
      imageCache.load(prev);
    }
  }

  /* ----------------------------------------------------------------------
   * API pública
   * -------------------------------------------------------------------- */

  /**
   * Inicializa a galeria de um produto.
   * @param {string} mainSelector   seletor do <img> principal
   * @param {string} thumbsSelector seletor do container das miniaturas
   * @param {string[]} images       lista de caminhos de imagem
   */
  function initGallery(mainSelector, thumbsSelector, images) {
    const mainEl = document.querySelector(mainSelector);
    const thumbsEl = thumbsSelector ? document.querySelector(thumbsSelector) : null;
    if (!mainEl || !images || !images.length) return;

    // evita inicializar a mesma imagem principal duas vezes (listeners
    // duplicados) caso a função seja chamada mais de uma vez por engano
    if (mainEl.dataset.galleryInitialized === "true") return;
    mainEl.dataset.galleryInitialized = "true";

    new Gallery(mainEl, thumbsEl, images);
  }

  /**
   * Abre a imagem em zoom. Mantém compatibilidade com chamadas diretas
   * (ex.: página de encomenda), fora do contexto de uma Gallery.
   * @param {string} src
   */
  function openZoom(src) {
    getLightbox().open(src);
  }

  window.initGallery = initGallery;
  window.openZoom = openZoom;
})();
