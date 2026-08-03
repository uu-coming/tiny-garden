# Drawing flowers in this style

Every flower in Tiny Garden is drawn in code as plain SVG shapes — no images, no
paths traced from illustrations. This document describes the rules they follow,
so you can add a new species that sits naturally beside the existing ten.

At the bottom there are ready-made prompts for generating one with an AI.

---

## 1. The look, in one paragraph

Flat pastel shapes with no outlines, built from a handful of ellipses. Depth
comes from *alternating two close shades* between neighbouring petals rather
than from shadows or gradients. Centres are small warm-yellow discs. Nothing is
photorealistic and nothing is hard-edged — a flower should read as a flower from
20 pixels away and still look considered at 200.

## 2. The five rules

**Build around the origin.** The flower head is drawn at `(0,0)` and positioned
later. Petals grow *upward*, which in SVG means **negative `cy`**. A petal at
`cy: -size * 0.5` sits above the centre.

**Everything scales from one number.** No fixed pixel values. Every coordinate
and radius is a fraction of `size`, so one flower works at any scale:

```js
rx: size * 0.24,  ry: size * 0.40,  cy: -size * 0.5
```

**Radiate by rotation, not by trigonometry.** Place one petal, then repeat it
with `transform: rotate(...)`. For `n` petals the step is `360 / n`:

```js
for (var i = 0; i < 14; i++) {
  fg.appendChild(el('ellipse', {
    cx: 0, cy: -size * 0.64, rx: size * 0.18, ry: size * 0.40,
    fill: i % 2 === 0 ? '#fef08a' : '#fde047',
    transform: 'rotate(' + (i * 360 / 14) + ')'
  }));
}
```

**Alternate two close shades.** `i % 2` picks between two tints that differ only
slightly. This is what separates overlapping petals without a single stroke.
Keep the two values close — if you can name them as different colours, they are
too far apart.

**Centre last, in concentric discs.** Two or three circles, largest first,
warm yellow to amber. Optional grain: a scatter of small low-opacity dots.

```js
fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.32, fill: '#b8860b' }));
fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.20, fill: '#8b6914' }));
```

## 3. Palette

Petals are pastel and desaturated; the darkest petal shade should still feel
light. The stems and leaves come from a shared palette so every species matches:

| role | values |
|---|---|
| stem | `#2e5c1a` → `#4a7235` (a gradient, dark at the root) |
| leaf | `#4a8a3a` |
| centre | warm yellows: `#fef08a` `#fde047` `#f5c400` `#b8860b` |
| petals | see below |

Existing petal families, as a reference for a new species:

```
pink      #ffd7e8  #ffb3d9  #ff8cba        blush     #f8bbd0  #f48fb1  #f06292
red       #ffcccc  #ff9999  #ff6666        cyan      #80deea  #4dd0e1  #26c6da
butter    #fff9c4  #fff59d  #fff176        lilac     #e1bee7  #ce93d8  #ba68c8
apricot   #ffe0b2  #ffcc80  #ffb74d        mint      #e8f5e9  #c8e6c9  #a5d6a7
```

## 4. Shape vocabulary

Nearly everything is an `<ellipse>`. Reach for anything else only when the
silhouette genuinely needs it.

| form | how it is built | example |
|---|---|---|
| simple radial | n ellipses rotated around the centre | daisy (18), sunflower (14), forget-me-not (5) |
| few large petals | 3–4 ellipses, wide `rx` | tulip, corn poppy |
| layered / double | 3–4 rings, each smaller and rotated off the last | camellia (6·6·5·5) |
| spike | rows of paired small ellipses climbing in `-cy`, colour lightening upward | lavender |
| cluster | many tiny 4-petal florets placed on rings | hydrangea |
| notched petal | one `<path>` with a double curve at the tip, then rotated | cosmos |

Two details worth copying:

- **Petals start at the disc edge, not the centre.** Offset by the centre radius
  plus half the petal length: `cy = -(size * 0.28 + size * petalLength)`.
- **Vary petal length slightly** between neighbours (`0.44` / `0.38`) — a
  perfectly even flower looks machine-made.

## 5. Checklist for a new species

- [ ] Drawn around `(0,0)`, petals extend to negative `cy`
- [ ] Every number is a multiple of `size`
- [ ] Neighbouring petals alternate two close shades
- [ ] No `stroke` (the daisy's `0.5px #e0ddd8` is the one exception, for white on white)
- [ ] Centre is concentric circles in warm yellow
- [ ] Readable as a silhouette at 20 px
- [ ] Total elements under ~50 (the eating animation runs one animation per petal)

Add it to `SPECIES` in `garden.js` and to the `_drawHead` switch — that is all
the wiring needed; planting, swaying, eating and the ID card come for free.

---

## 6. Prompts

### Generating a new species

> Draw a flower head as inline SVG shapes, in this style: flat pastel colours,
> no outlines, built almost entirely from `<ellipse>` elements. Build it around
> the origin `(0,0)` with petals extending upward as negative `cy`. Express every
> coordinate and radius as a fraction of a variable called `size` — never fixed
> pixels. Radiate petals with `transform="rotate(i * 360 / n)"`. Give neighbouring
> petals two *very close* shades of the same colour, alternating with `i % 2` —
> this is the only depth cue, there are no strokes or shadows. Finish with two or
> three concentric circles at the centre in warm yellow, largest first. Petals
> should begin at the edge of that centre disc, not at the origin. Keep the whole
> flower under 50 elements.
>
> The flower is: **[species]**. [one line on its silhouette — e.g. "five wide
> rounded petals, pale blue, a small bright centre"]

### Converting an existing drawing to this style

> Redraw this flower as flat SVG in the style described below, keeping only its
> silhouette and colour family. Replace every gradient, shadow and outline with
> flat fills. Rebuild the petals as `<ellipse>` elements rotated around the
> origin. Reduce the palette to two close pastel tints for the petals
> (alternating between neighbours) plus a warm yellow centre. Desaturate anything
> vivid until the darkest petal still reads as pastel.

### Matching the palette only

> Give me three pastel tints for a **[colour]** flower, in the manner of these
> sets: `#ffd7e8 #ffb3d9 #ff8cba` (pink), `#e1bee7 #ce93d8 #ba68c8` (lilac),
> `#80deea #4dd0e1 #26c6da` (cyan). Each set moves from very light to medium —
> the darkest is still soft. Return hex values only.

---

## 7. Worked example — forget-me-not

The simplest species in the set, five elements plus a centre:

```js
// five petals, two alternating blues
for (i = 0; i < 5; i++) {
  fg.appendChild(el('ellipse', {
    cx: 0, cy: -size * 0.39, rx: size * 0.26, ry: size * 0.32,
    fill: i % 2 === 0 ? '#b8d8e8' : '#9dcde6',
    transform: 'rotate(' + (i * 72) + ')'
  }));
}
// warm centre, two discs
fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.18, fill: '#fef08a' }));
fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.08, fill: '#fde047' }));
```

Note that with an odd petal count the alternation wraps — petals 0 and 4 end up
adjacent in the same shade. That irregularity is welcome; it stops the flower
looking stamped.

---

The ten existing flower heads are exported as standalone files in
[`flowers/`](flowers/) if you would rather trace over one than start blank.
