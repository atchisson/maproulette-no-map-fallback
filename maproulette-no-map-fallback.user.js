// ==UserScript==
// @name         MapRoulette – no automatic map layer fallback
// @namespace    https://github.com/atchisson/maproulette-no-map-fallback
// @version      1.1.0
// @description  Stops MapRoulette from replacing your chosen map layer with the default one as soon as a single tile fails; retries failed tiles instead.
// @author       atchisson
// @license      MIT
// @homepageURL  https://github.com/atchisson/maproulette-no-map-fallback
// @supportURL   https://github.com/atchisson/maproulette-no-map-fallback/issues
// @downloadURL  https://github.com/atchisson/maproulette-no-map-fallback/releases/latest/download/maproulette-no-map-fallback.user.js
// @updateURL    https://github.com/atchisson/maproulette-no-map-fallback/releases/latest/download/maproulette-no-map-fallback.user.js
// @match        https://maproulette.org/*
// @match        https://*.maproulette.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const MAX_RETRIES = 3; // attempts per tile
  const BASE_DELAY_MS = 2000; // 2 s, 4 s, 8 s

  function patch(L) {
    if (!L || !L.Evented || !L.GridLayer || L.__mrNoFallbackPatched) return;
    L.__mrNoFallbackPatched = true;

    const originalFire = L.Evented.prototype.fire;
    L.Evented.prototype.fire = function (type, data) {
      // MapRoulette (SourcedTileLayer.jsx) switches to the default layer on the
      // first "tileerror", so this event is not propagated.
      if (type === "tileerror" && this instanceof L.GridLayer) {
        const tile = data && data.tile;
        const coords = data && data.coords;
        const tries = tile ? Number(tile.dataset.mrRetries || 0) : MAX_RETRIES;
        if (tile && coords && typeof this.getTileUrl === "function" && tries < MAX_RETRIES) {
          tile.dataset.mrRetries = String(tries + 1);
          setTimeout(() => {
            if (!tile.isConnected) return; // tile removed in the meantime (zoom/pan)
            try {
              tile.src = this.getTileUrl(coords);
            } catch (e) {
              /* ignore */
            }
          }, BASE_DELAY_MS * 2 ** tries);
        }
        console.info("[MR no-fallback] tileerror suppressed", coords, "attempt", tries + 1);
        return this;
      }
      return originalFire.apply(this, arguments);
    };
  }

  // Patch as soon as Leaflet defines window.L (before the first map render).
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
