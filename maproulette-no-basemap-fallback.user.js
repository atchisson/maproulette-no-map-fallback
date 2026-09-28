// ==UserScript==
// @name         MapRoulette – pas de bascule automatique du fond de carte
// @namespace    https://maproulette.org/
// @version      1.0
// @description  Empêche MapRoulette de remplacer le fond de carte choisi par le fond par défaut dès qu'une tuile échoue ; retente plutôt les tuiles en erreur.
// @match        https://maproulette.org/*
// @match        https://*.maproulette.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const MAX_RETRIES = 3;       // tentatives par tuile
  const BASE_DELAY_MS = 2000;  // 2 s, 4 s, 8 s

  function patch(L) {
    if (!L || !L.Evented || !L.GridLayer || L.__mrNoFallbackPatched) return;
    L.__mrNoFallbackPatched = true;

    const originalFire = L.Evented.prototype.fire;
    L.Evented.prototype.fire = function (type, data) {
      // MapRoulette (SourcedTileLayer.jsx) bascule sur le fond par défaut au
      // premier "tileerror". On ne propage donc pas cet événement.
      if (type === "tileerror" && this instanceof L.GridLayer) {
        const tile = data && data.tile;
        const coords = data && data.coords;
        const tries = tile ? Number(tile.dataset.mrRetries || 0) : MAX_RETRIES;
        if (tile && coords && typeof this.getTileUrl === "function" && tries < MAX_RETRIES) {
          tile.dataset.mrRetries = String(tries + 1);
          setTimeout(() => {
            if (!tile.isConnected) return; // tuile retirée entre-temps (zoom/pan)
            try {
              tile.src = this.getTileUrl(coords);
            } catch (e) {
              /* ignore */
            }
          }, BASE_DELAY_MS * 2 ** tries);
        }
        console.info("[MR no-fallback] tileerror ignoré", coords, "tentative", tries + 1);
        return this;
      }
      return originalFire.apply(this, arguments);
    };
  }

  // Patch dès que Leaflet définit window.L (avant le premier rendu de carte).
  if (window.L) {
    patch(window.L);
  } else {
    let current;
    Object.defineProperty(window, "L", {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value) {
        current = value;
        try {
          patch(value);
        } catch (e) {
          console.error("[MR no-fallback]", e);
        }
      },
    });
  }
})();
