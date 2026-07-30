# V2 art — Krita layer exports

Export from `OneDrive\Pictures\mochibit.kra` via **File → Export Layers**.

Two settings matter:
- **Full canvas (250x199), not cropped to layer bounds.** If Krita trims a layer to
  its bounding box the cat won't line up with its background. `prep-layers.mjs`
  hard-fails and names the offending files if this happens.
- **PNG with alpha.**

Krita prefixes exports with the document name and an index
(`mochibit_003_uwu.png`). That's fine — the trait name is recovered from it.

## What goes where

| Folder | Layers |
|---|---|
| `faces/` | Alium, chupa, Korin, Frekcles, hehe, huh, whyy, uwu, silly, Wont u |
| `body/` | `Base Body` → rename to `base.png`, plus crimson, Lemonade, Gleep, dore, White cat, Black Cat, Tom |
| `backgrounds/` | Farcaster gate, and the four OG (White, Beach, Room, Mountains) |
| `mystery/` | MYSTERY → rename to `mystery.png` |

## Do not export

- Anything in the **`V1 faces`** group — those traits are spent on V1
- Anything in the body **`v1`** group
- `Background`, `Mochi`, any `Paint Layer N`, the `Mochi classic` group, the reference image
- `yellow`, `Blue`, `Red`, `green`, `Purple` — these are generated from hex in
  `scripts/traits.config.mjs`. Only export them if they aren't plain flat fills.

## Then

```
node scripts/prep-layers.mjs --inspect    # check names + read the body palette
node scripts/prep-layers.mjs              # writes layers/ for HashLips
```

Trait names ship exactly as written. `Frekcles` and `Alium` are intentional —
do not "correct" them.
