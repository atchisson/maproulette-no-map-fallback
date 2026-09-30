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

## Bonus: one-click completion for every status

MapRoulette's **Disable Task Confirmation Modal** user setting only skips the
confirmation modal for **I fixed it!**. With this script, it also skips it for
**Not an issue**, **Skip**, **Already fixed** and **Can't complete**, so these
become one-click too (keyboard shortcuts included).

As with **I fixed it!**, the modal is still shown when:

- the setting is off,
- the challenge or project requires confirmation,
- you are submitting or disputing a revision after a review.

## Bonus: keyboard shortcuts shown on the buttons

MapRoulette has keyboard shortcuts for completing a task, but the buttons don't
show them. The script adds the key next to each label:

| Button           | Key |
| ---------------- | --- |
| I fixed it!      | `F` |
| Not an issue     | `Q` |
| Skip             | `W` |
| Already fixed    | `X` |
| Can't complete   | `D` |

The keys only appear while the shortcuts are active. MapRoulette turns them off
while an editor is open (edit mode).

## Turning the bonus features on or off

Both bonus features are on by default. Toggle them from the userscript
manager's menu (click the Violentmonkey / Tampermonkey icon while on
MapRoulette):

- ✅ One-click completion for every status
- ✅ Show keyboard shortcuts on buttons

The change applies right away, without reloading the page, and is remembered.
The map layer fix is always on.

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
