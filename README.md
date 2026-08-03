# 🌷 Tiny Garden

Plant an interactive flower garden on any web page — no dependencies, one file.

Move your mouse and flowers grow under it. Every flower is drawn procedurally in
SVG: gradient stems, leaves, a spring-in animation and a gentle sway in the wind.
Turn the camera on and you can garden with your body instead — wave a hand to
plant, open your mouth to eat a flower down to its calyx.

> Grown from the flower garden on my homepage. Many people asked how it was made,
> so here it is — plant your own. 🌱

<!-- TODO: record a short GIF of the demo and put it here -->
<!-- ![demo](demo.gif) -->

**[Live demo →](https://uu-coming.github.io/tiny-garden/)**

## What's in here

| | |
|---|---|
| [`garden.js`](garden.js) | the library — the only file you need |
| [`index.html`](index.html) | the demo: flower picker, camera soil, gesture gardening |
| [`flowers/`](flowers/) | all ten flower heads as standalone SVG files |
| [`FLOWER-STYLE.md`](FLOWER-STYLE.md) | how the flowers are drawn, and prompts for making more |

## Quick start

Copy `garden.js` into your project, give it a container, done:

```html
<div id="my-garden" style="height: 60vh"></div>

<script src="garden.js"></script>
<script>
  Garden.plant('#my-garden', {
    flowers: ['daisy', 'tulip', 'lavender'],  // which flowers to grow
    height: 'medium',                         // how tall they get
  });
</script>
```

Via CDN (after this repo is on GitHub):

```html
<script src="https://cdn.jsdelivr.net/gh/uu-coming/tiny-garden@main/garden.js"></script>
```

That's it. Flowers grow where visitors move their mouse, or drag a finger on
touch screens.

## Options

All options are optional.

| Option | Type | Default | What it does |
|---|---|---|---|
| `mode` | `'meadow'` \| `'free'` | `'meadow'` | meadow: flowers root in a band along the bottom like a flower border, and the pointer's height sets how tall each one grows. free: flowers plant exactly where the pointer is. |
| `flowers` | `string[]` | all species | Which flowers can grow. See the species list below. |
| `height` | `'short'` \| `'medium'` \| `'tall'` \| `[min, max]` | `'medium'` | Total plant height in pixels. Presets: short `[40, 100]`, medium `[60, 180]`, tall `[90, 300]`. |
| `size` | `number` 0.4–2 | `1` | Scales the flower heads and leaves. |
| `density` | `number` 0–1 | original garden's density | How many flowers each gesture plants, and how tightly they cluster. Omit it to keep the tuning this project came with. |
| `ground` | `number` 0–1 | `0.3` | meadow only: how deep the rooting band is, as a fraction of the container height. Bigger = more staggered depth. |
| `hill` | `boolean` | `false` | Draw a sketched hillside and only allow planting below its curve (free mode only). |
| `sound` | `boolean` | `false` | A soft brush "shua shua" sound on planting. |
| `maxFlowers` | `number` | `350` | Oldest flowers are removed beyond this, so the page stays fast. |
| `onPlant` | `(species) => void` | — | Called every time a flower is planted. Build a counter, a receipt, achievements… |

## The flowers

`daisy` · `tulip` · `sunflower` · `corn poppy` · `lavender` · `forgetmenot` ·
`hydrangea` · `delphinium` · `camellia` · `cosmos`

The full list is exported as `Garden.SPECIES`. In meadow mode, point higher to
grow a taller flower — and taller flowers stand behind shorter ones, so the
garden layers itself like a real flower border.

On narrow containers (≤ 620 px) a simpler six-petal flower is drawn instead, to
keep small screens fast.

Each flower head is also available as a standalone SVG in [`flowers/`](flowers/),
and [`FLOWER-STYLE.md`](FLOWER-STYLE.md) explains the rules they are drawn by —
including prompts if you would like to generate an eleventh.

## Instance API

`Garden.plant()` returns an instance:

```js
const g = Garden.plant('#my-garden', { flowers: ['cosmos'] });

g.plantAt(x, y);         // plant one flower at container-local coordinates
g.spray(cx, cy, 6);      // scatter n flowers around a point (client coordinates)
g.setFlowers(['tulip']); // change species on the fly (planted flowers stay)
g.setDensity(0.9);       // change density on the fly
g.setHeight('tall');     // change stem height on the fly
g.setSize(0.8);          // change flower size on the fly
g.clear();               // remove all flowers
g.destroy();             // remove flowers, svg layer, and event listeners
```

There is also a standalone preview helper — handy for building species pickers
like the ID cards in the demo:

```js
const svg = Garden.preview('camellia', 64); // a 64×64 <svg> of just the flower head
picker.appendChild(svg);
```

## Extras

The core library only grows flowers. The [demo page](index.html) shows what you
can build around it.

**Camera soil** — a blurred live webcam feed as the ground, so visitors plant
flowers over their own reflection. Put a `<video>` behind the garden layer, blur
it with CSS, and start it with `getUserMedia` (needs https or localhost, and the
visitor's permission — always fall back gracefully):

```html
<video id="cam" autoplay playsinline muted
       style="position:absolute; inset:0; width:100%; height:100%;
              object-fit:cover; transform:scaleX(-1); filter:blur(16px)"></video>
```

**Gesture gardening** — your hands grow flowers, your mouth eats them. The demo
tracks one hand and one face through the webcam with
[MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) Hand + Face
Landmarkers (Apache 2.0, runs fully in the browser — nothing is uploaded):

- **Wave** to sprinkle flowers where your hand goes; **pinch** thumb and index
  finger for a whole bouquet.
- **Open your mouth** and the nearest flower is eaten — every petal is pulled in
  at once, and the green calyx that held the flower opens on the bare stem.

Two details that matter if you build this yourself: run **at most one model per
frame** (both together cost more than a frame's budget, and the page will stutter
under screen recording), and detect an open mouth from **two signals** — the
`jawOpen` blendshape *or* the lip gap measured against mouth width — with
different open and close thresholds so it can't flicker.

**A flower counter (or a garden receipt)** — use `onPlant`:

```js
const counts = {};
Garden.plant('#my-garden', {
  onPlant(species) {
    counts[species] = (counts[species] || 0) + 1;
    // render your receipt ✿
  }
});
```

## Notes

- No dependencies, no build step. Works as a plain `<script>` tag; also loadable
  with `require()`.
- Respects `prefers-reduced-motion` — the sway animation is skipped for users who
  ask for less motion.
- Sound is off by default (autoplaying audio on other people's pages is rude);
  switch it on with `sound: true`.
- The gesture features in the demo load MediaPipe from a CDN, so the first run
  needs a network connection. Everything else works offline.

## License

[CC BY-NC 4.0](LICENSE) © uu-coming

Free to use, adapt, and share in personal, non-commercial projects — just keep
the credit. **Commercial use is not permitted**; if you'd like to use Tiny Garden
commercially, please get in touch first.

If you plant a garden somewhere, I'd love to see it — open an issue with a link. 🌼
