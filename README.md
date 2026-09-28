# MapRoulette – no automatic map layer fallback

A userscript that stops [MapRoulette](https://maproulette.org) from replacing
your chosen map layer with the default one as soon as a single tile fails to
load.

## Why

Since [maproulette-frontend#2708](https://github.com/maproulette/maproulette-frontend/pull/2708)
(v3.17.11), MapRoulette switches the whole task map to the default layer on the
**first** tile error. With slow imagery servers (WMS/TMS behind a proxy that
answers `504`, `503` or `429` now and then), one failed tile out of dozens is
enough to lose the layer you picked, even though the rest is loading fine.

## What it does

- Suppresses Leaflet's `tileerror` event on tile layers, so MapRoulette's
  fallback never triggers.
- Retries each failed tile up to 3 times (after 2 s, 4 s, then 8 s).

Trade-off: if a layer is really down, you will see missing tiles instead of an
automatic switch. Change the layer manually in that case.

## Install

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/)
   or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the install link:
   **[maproulette-no-map-fallback.user.js](https://github.com/atchisson/maproulette-no-map-fallback/releases/latest/download/maproulette-no-map-fallback.user.js)**
3. Reload MapRoulette.

The script updates itself from the latest GitHub release.

## Releasing

Bump `@version` in `maproulette-no-map-fallback.user.js` and push to `main`.
The [release workflow](.github/workflows/release.yml) checks the script and,
if no `v<version>` tag exists yet, publishes a GitHub release with the script
attached. Userscript managers pick up the update from there.

## License

[MIT](LICENSE)
