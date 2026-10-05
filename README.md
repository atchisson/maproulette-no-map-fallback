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

## Bonus: one iD window for several tasks (one changeset)

MapRoulette closes the iD window before opening the next task, so every task
starts a fresh editor and your unsaved edits do not follow you. With the
[slightly-better-osm-org](https://github.com/atchisson/slightly-better-osm-org)
iD userscript installed as well, this script keeps **one** iD window open:

- The first task opens iD as usual. When the iD script is loaded, it tells
  MapRoulette it is ready (`postMessage`).
- From then on, "Edit in iD" does not open a new window. The task's location
  (map position, object, changeset comment and source) is sent to the open
  window, which moves there. Your edits stay in the same session, so several
  tasks, even from different challenges, end up in one changeset.
- Close the iD window yourself when you are done: the next task then opens a
  new one.

Without the iD script (or with this option off), nothing changes: MapRoulette
keeps its own behaviour. Toggle it from the userscript manager menu:

- ✅ Keep one iD window across tasks (needs the iD script)

Changeset comment and source are merged across tasks while edits are in
progress: hashtags are deduplicated (case-insensitively), the text parts are
joined with "; " and the sources with ";", all within OSM's 255-character limit
(extra text is dropped from the end, a hashtag is never cut). When nothing is
being edited (nothing changed yet, or the changeset was already uploaded), the
next task starts a new changeset and replaces them instead. Tasks still have to
be marked as fixed in MapRoulette one by one.

## Turning the bonus features on or off

The bonus features are on by default. Toggle them from the userscript
manager's menu (click the Violentmonkey / Tampermonkey icon while on
MapRoulette):

- ✅ One-click completion for every status
- ✅ Show keyboard shortcuts on buttons
- ✅ Keep one iD window across tasks (needs the iD script)

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
