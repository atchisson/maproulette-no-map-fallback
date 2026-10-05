// ==UserScript==
// @name         MapRoulette – no automatic map layer fallback
// @namespace    https://github.com/atchisson/maproulette-no-map-fallback
// @version      1.3.1
// @description  Stops MapRoulette from replacing your chosen map layer with the default one as soon as a single tile fails (retries failed tiles instead), and makes "Disable Task Confirmation Modal" apply to every completion status, not only "I fixed it!"; shows the task completion keyboard shortcuts on their buttons; keeps ONE iD window open across tasks (with the companion iD script) so several tasks end up in a single changeset.
// @author       atchisson
// @license      MIT
// @homepageURL  https://github.com/atchisson/maproulette-no-map-fallback
// @supportURL   https://github.com/atchisson/maproulette-no-map-fallback/issues
// @downloadURL  https://github.com/atchisson/maproulette-no-map-fallback/releases/latest/download/maproulette-no-map-fallback.user.js
// @updateURL    https://github.com/atchisson/maproulette-no-map-fallback/releases/latest/download/maproulette-no-map-fallback.user.js
// @match        https://maproulette.org/*
// @match        https://*.maproulette.org/*
// @run-at       document-start
// @inject-into  page
// @sandbox      JavaScript
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const MAX_RETRIES = 3; // attempts per tile
  const BASE_DELAY_MS = 2000; // 2 s, 4 s, 8 s

  // With GM_* grants, "window" may be the userscript manager's wrapper.
  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  // Bonus features, toggled from the userscript manager menu.
  const SETTINGS = [
    { key: "oneClickCompletion", label: "One-click completion for every status" },
    { key: "shortcutHints", label: "Show keyboard shortcuts on buttons" },
    { key: "keepEditorWindow", label: "Keep one iD window across tasks (needs the iD script)" },
  ];
  const settings = {};
  for (const { key } of SETTINGS) settings[key] = GM_getValue(key, true);

  function registerToggle(setting) {
    GM_registerMenuCommand(
      `${settings[setting.key] ? "✅" : "⬜"} ${setting.label}`,
      () => {
        settings[setting.key] = !settings[setting.key];
        GM_setValue(setting.key, settings[setting.key]);
        registerToggle(setting); // same id: relabels the entry in place
        scheduleLabelShortcuts();
      },
      { id: setting.key, autoClose: false },
    );
  }

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

  // "Disable Task Confirmation Modal" (user settings) only skips the modal for
  // "I fixed it!": ActiveTaskControls.initiateCompletion confirms directly for
  // TASK_STATUS_FIXED and opens the modal with
  // setState({ confirmingTask, confirmingStatus, ... }) for any other status.
  // That setState call is rewritten into the same direct confirmation.
  const NO_CONFIRM_STATUSES = new Set([
    2, // false positive ("Not an issue")
    3, // skipped
    5, // already fixed
    6, // too hard ("Can't complete")
  ]);

  function skipsConfirmation(component, update) {
    if (!settings.oneClickCompletion) return false;
    if (!update || typeof update !== "object" || !update.confirmingTask) return false;
    if (typeof component.initiateCompletion !== "function") return false;
    if (typeof component.confirmCompletion !== "function") return false;
    if (!NO_CONFIRM_STATUSES.has(update.confirmingStatus)) return false;
    // Revision submission / dispute: keep the modal so a comment can be left.
    if (update.submitRevision !== undefined) return false;
    const { challenge, user } = component.props || {};
    const requireConfirmation =
      challenge && (challenge.requireConfirmation || (challenge.parent && challenge.parent.requireConfirmation));
    return !requireConfirmation && !!(user && user.settings && user.settings.disableTaskConfirm);
  }

  function patchSetState(proto) {
    if (proto.__mrOneClickPatched) return;
    proto.__mrOneClickPatched = true;

    const originalSetState = proto.setState;
    proto.setState = function (update, callback) {
      if (skipsConfirmation(this, update)) {
        const direct = Object.assign({}, update);
        delete direct.confirmingTask; // no confirmingTask, no modal
        return originalSetState.call(this, direct, () => {
          if (typeof callback === "function") callback.call(this);
          this.confirmCompletion();
        });
      }
      return originalSetState.apply(this, arguments);
    };
  }

  // React stores its fiber / props on DOM nodes under "__react<Name>$<random>".
  function reactValue(node, ...prefixes) {
    const key = Object.keys(node).find((k) => prefixes.some((p) => k.startsWith(p)));
    return key && node[key];
  }

  function reactFiber(node) {
    return reactValue(node, "__reactFiber$", "__reactInternalInstance$");
  }

  // React.Component.prototype, reached through the fiber of a rendered node.
  function findComponentPrototype(node) {
    for (let fiber = reactFiber(node); fiber; fiber = fiber.return) {
      const instance = fiber.stateNode;
      if (instance && typeof instance.setState === "function" && typeof instance.forceUpdate === "function") {
        let proto = Object.getPrototypeOf(instance);
        while (proto && !Object.prototype.hasOwnProperty.call(proto, "setState")) {
          proto = Object.getPrototypeOf(proto);
        }
        if (proto && proto.isReactComponent) return proto;
      }
    }
    return null;
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const proto = findComponentPrototype(node);
        if (proto) {
          observer.disconnect();
          patchSetState(proto);
          return;
        }
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  // Show the task completion keyboard shortcuts (hardcoded in
  // ActiveTaskControls.openCompletionModal) on their buttons. A button is
  // recognised by its click handler, e.g. () => !disabled && complete(TaskStatus.falsePositive),
  // which keeps the status name once minified: ()=>!t&&e(jv.falsePositive).
  const SHORTCUT_KEYS = {
    fixed: "f",
    falsePositive: "q",
    skipped: "w",
    alreadyFixed: "x",
    tooHard: "d",
  };
  const COMPLETE_HANDLER = /&&\s*[\w$]+\(\s*[\w$]+\.(fixed|falsePositive|skipped|alreadyFixed|tooHard)\s*\)\s*$/;
  const handlerKeys = new WeakMap();

  function shortcutKey(onClick) {
    if (typeof onClick !== "function") return null;
    if (!handlerKeys.has(onClick)) {
      const match = COMPLETE_HANDLER.exec(Function.prototype.toString.call(onClick));
      handlerKeys.set(onClick, match ? SHORTCUT_KEYS[match[1]] : null);
    }
    return handlerKeys.get(onClick);
  }

  function taskControls(node) {
    for (let fiber = reactFiber(node); fiber; fiber = fiber.return) {
      const instance = fiber.stateNode;
      if (instance && typeof instance.initiateCompletion === "function") return instance;
    }
    return null;
  }

  // ActiveTaskControls activates its shortcuts in componentDidUpdate, which
  // does not always touch the DOM: relabel after each of its updates.
  function watchUpdates(controls) {
    const proto = Object.getPrototypeOf(controls);
    if (!proto || proto.__mrShortcutWatch) return;
    proto.__mrShortcutWatch = true;
    const originalDidUpdate = proto.componentDidUpdate;
    proto.componentDidUpdate = function () {
      scheduleLabelShortcuts();
      if (originalDidUpdate) return originalDidUpdate.apply(this, arguments);
    };
  }

  // The shortcuts only work while ActiveTaskControls has activated its
  // "taskCompletion" group (not in edit mode, not for tag fix suggestions).
  function shortcutsActive(controls) {
    const group = controls.props && controls.props.activeKeyboardShortcuts &&
      controls.props.activeKeyboardShortcuts.taskCompletion;
    return !!group && Object.keys(group).length > 0;
  }

  function labelShortcuts() {
    for (const node of document.querySelectorAll("button, a")) {
      const props = reactValue(node, "__reactProps$", "__reactEventHandlers$");
      const key = settings.shortcutHints && props && shortcutKey(props.onClick);
      const controls = key && taskControls(node);
      if (controls) watchUpdates(controls);
      if (controls && shortcutsActive(controls)) {
        if (node.dataset.mrShortcut !== key) node.dataset.mrShortcut = key;
      } else if (node.dataset.mrShortcut) {
        delete node.dataset.mrShortcut;
      }
    }
  }

  let labelScheduled = false;
  function scheduleLabelShortcuts() {
    if (labelScheduled) return;
    labelScheduled = true;
    requestAnimationFrame(() => {
      labelScheduled = false;
      try {
        labelShortcuts();
      } catch (e) {
        console.error("[MR no-fallback]", e);
      }
    });
  }

  // A pseudo-element keeps React's DOM untouched.
  const style = document.createElement("style");
  style.textContent = `
    [data-mr-shortcut]::after {
      content: attr(data-mr-shortcut);
      display: inline-block;
      margin-left: 0.5em;
      padding: 0 0.35em;
      border: 1px solid currentColor;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.8em;
      line-height: 1.4;
      text-transform: uppercase;
      opacity: 0.75;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  new MutationObserver(scheduleLabelShortcuts).observe(document, { childList: true, subtree: true });

  for (const setting of SETTINGS) registerToggle(setting);

  // ---- One iD window for several tasks -----------------------------------
  //
  // MapRoulette opens iD with window.open() and, before each new task, closes the
  // previous editor window (Editor.js: `editorWindowReference.close()`), so every task
  // lands in a fresh tab and the edits of the previous one are lost from the session.
  //
  // With the companion iD userscript installed, the iD tab announces itself ready
  // (postMessage). From then on, opening an iD URL does not open anything: the task's
  // location (map, object, changeset comment/source) is sent to the existing tab, and
  // MapRoulette gets a handle whose close() does nothing. Without the announcement,
  // everything behaves exactly as before.
  //
  // The command is a message, not a URL fragment: what to do with it is decided by the
  // iD side, so a change in iD's URL handling does not break anything here.
  const OSM_ORIGIN = "https://www.openstreetmap.org";
  const CHANNEL = "sb-osm";
  let idWindow = null; // the real iD window we opened, if any
  let idReady = false; // true once the iD script in that window has announced itself
  // The comment/source of the command that opened that window (see the "pret" handler).
  let openingCommand = null;

  // The command for an iD URL, or null if the URL is not an iD editor URL.
  function idCommand(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl), page.location.href);
    } catch (e) {
      return null;
    }
    if (url.origin !== OSM_ORIGIN) return null;
    const isEdit = /^\/edit\/?$/.test(url.pathname) && url.searchParams.get("editor") === "id";
    if (!isEdit && !/^\/id\/?$/.test(url.pathname)) return null;

    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const command = { canal: CHANNEL, type: "aller" };
    const [zoom, lat, lon] = (hash.get("map") || "").split("/").map(Number);
    if ([zoom, lat, lon].every(Number.isFinite)) command.carte = { zoom, centre: [lon, lat] };
    const ids = (hash.get("id") || "").split(",").filter((id) => /^[nwr]\d+$/.test(id));
    if (ids.length) command.ids = ids;
    if (hash.has("comment")) command.comment = hash.get("comment");
    if (hash.has("source")) command.source = hash.get("source");
    return command;
  }

  // What MapRoulette keeps as `editorWindowReference`. It only reads `closed` and calls
  // close() (Editor.js); anything else is forwarded to the real window.
  const editorHandle = new Proxy(
    {},
    {
      get(_, prop) {
        const w = idWindow;
        if (prop === "closed") return !w || w.closed;
        if (prop === "close") {
          // Once the iD script is ready the window is kept: that is the whole point.
          return () => {
            if (!idReady && w && !w.closed) w.close();
          };
        }
        if (!w) return undefined;
        const value = w[prop];
        return typeof value === "function" ? value.bind(w) : value;
      },
    },
  );

  function patchWindowOpen() {
    const originalOpen = page.open;
    if (typeof originalOpen !== "function" || originalOpen.__mrKeepEditorPatched) return;

    page.addEventListener("message", (event) => {
      const data = event.data;
      if (
        event.origin === OSM_ORIGIN &&
        idWindow &&
        event.source === idWindow &&
        data &&
        data.canal === CHANNEL &&
        data.type === "pret"
      ) {
        idReady = true;
        // The first task's comment/source only live in the opening URL, and iD copies
        // them into its settings only when the save panel opens. The iD script merges a
        // new task's comment with what the settings hold, so without this the first
        // task's comment would be lost from the merged changeset. Send it once, as a
        // reduced command (no map/object: the URL already applied them). With no edit in
        // progress yet, iD treats it as a replacement, which fills the settings.
        const opening = openingCommand;
        openingCommand = null;
        if (opening && (opening.comment !== undefined || opening.source !== undefined)) {
          const reduced = { canal: CHANNEL, type: "aller" };
          if (opening.comment !== undefined) reduced.comment = opening.comment;
          if (opening.source !== undefined) reduced.source = opening.source;
          idWindow.postMessage(reduced, OSM_ORIGIN);
        }
        console.info("[MR no-fallback] iD window is ready: it will be reused across tasks");
      }
    });

    page.open = function (url) {
      const command = settings.keepEditorWindow ? idCommand(url) : null;
      if (!command) return originalOpen.apply(this, arguments);

      if (idWindow && !idWindow.closed && idReady) {
        idWindow.postMessage(command, OSM_ORIGIN);
        try {
          idWindow.focus();
        } catch (e) {
          /* focus is a courtesy */
        }
        return editorHandle;
      }

      // First task, or the iD script is not there: the original behaviour, with the
      // window remembered so that it can be reused once it announces itself.
      const opened = originalOpen.apply(this, arguments);
      if (!opened) return opened;
      idWindow = opened;
      idReady = false;
      openingCommand = command;
      return editorHandle;
    };
    page.open.__mrKeepEditorPatched = true;
  }

  patchWindowOpen();

  // Patch as soon as Leaflet defines window.L (before the first map render).
  if (page.L) {
    patch(page.L);
  } else {
    let current;
    Object.defineProperty(page, "L", {
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
