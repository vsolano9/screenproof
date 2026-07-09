# screenproof config example

Drop a `screenproof.json` next to where you run screenproof (or pass `--config <file>`). Every key is optional and merges over the built-in defaults.

## Keys

- `rules`: rule id to level (`error`, `warning`, `info`, `off`). The example turns on the two opt-in rules (`screenshot-primary-size-missing`, `screenshot-locale-parity`) and promotes the alpha check to an error.
- `locales.allow`: when set, only these locale folder names are valid (allow-list).
- `locales.extra`: extra locale codes to accept in addition to the built-in App Store list.
- `locales.ignore`: folders to skip entirely (the example skips an `archive/` folder).
- `dimensions`: device-class overrides. A known class id (see the README table) replaces that class's size lists; an unknown id adds a new custom class. Sizes are `[width, height]` pairs. Use this to add a new Apple size the day it ships, without waiting for a screenproof release.
