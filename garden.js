/*!
 * Tiny Garden (garden.js) — plant an interactive SVG flower garden on any web page.
 * License: CC BY-NC 4.0 — free for personal use, no commercial use.
 *
 * Usage:
 *   <div id="my-garden" style="height:60vh"></div>
 *   <script src="garden.js"></script>
 *   <script>
 *     Garden.plant('#my-garden', {
 *       flowers: ['daisy', 'tulip', 'lavender'],
 *       density: 0.6,
 *       height: 'medium',
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // ── tiny helpers ─────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function adjustHex(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return '#' + [r, g, b].map(function (c) {
      return Math.min(255, Math.round(c * f)).toString(16).padStart(2, '0');
    }).join('');
  }
  // underdamped spring: overshoots ~1.25× then settles
  function springEase(t) {
    var w = 2 * Math.PI * 3.5, zeta = 0.38;
    var wd = w * Math.sqrt(1 - zeta * zeta);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
  }

  var PALETTES = [
    { stem: '#2e5c1a', leaf: '#4a8a3a', petals: ['#ffd7e8', '#ffb3d9', '#ff8cba'], center: '#ffeb3b' },
    { stem: '#3a6e22', leaf: '#4a8a3a', petals: ['#ffcccc', '#ff9999', '#ff6666'], center: '#ffff99' },
    { stem: '#3d7028', leaf: '#4a8a3a', petals: ['#80deea', '#4dd0e1', '#26c6da'], center: '#e0f2f1' },
    { stem: '#447830', leaf: '#4a8a3a', petals: ['#fff9c4', '#fff59d', '#fff176'], center: '#cddc39' },
    { stem: '#365c20', leaf: '#4a8a3a', petals: ['#e1bee7', '#ce93d8', '#ba68c8'], center: '#fff9c4' },
    { stem: '#4a7235', leaf: '#4a8a3a', petals: ['#ffe0b2', '#ffcc80', '#ffb74d'], center: '#ffffff' },
    { stem: '#3b6825', leaf: '#4a8a3a', petals: ['#f8bbd0', '#f48fb1', '#f06292'], center: '#fff3e0' },
    { stem: '#426b30', leaf: '#4a8a3a', petals: ['#e8f5e9', '#c8e6c9', '#a5d6a7'], center: '#fff9c4' }
  ];

  var SPECIES = ['daisy', 'tulip', 'sunflower', 'corn poppy', 'lavender',
    'forgetmenot', 'hydrangea', 'delphinium', 'camellia', 'cosmos'];

  var HEIGHT_PRESETS = { short: [40, 100], medium: [60, 180], tall: [90, 300] };

  var _gid = 0;
  var _styleInjected = false;
  function injectStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '@keyframes garden-sway{' +
      '0%{transform:rotate(0deg)}30%{transform:rotate(1.2deg)}' +
      '70%{transform:rotate(-1.2deg)}100%{transform:rotate(0deg)}}';
    document.head.appendChild(s);
  }
  var reducedMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── one garden instance per container ────────────────────
  function GardenInstance(target, opts) {
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) throw new Error('Garden: container not found: ' + target);
    var o = opts || {};

    this.setFlowers(o.flowers);
    this.setDensity(o.density);
    this.setHeight(o.height);
    this.setSize(o.size);
    // 'meadow' (default): flowers root inside a ground band along the bottom,
    // and the pointer's height sets the plant's height.
    // 'free': plant anywhere (original behavior; `hill` applies here).
    this.mode = o.mode === 'free' ? 'free' : 'meadow';
    // how deep the root band is, as a fraction of the container height
    var gr = o.ground == null ? 0.3 : o.ground;
    this.ground = Math.max(0.05, Math.min(1, gr));

    this.maxFlowers = o.maxFlowers || 350;
    this.sound = !!o.sound;
    this.hill = !!o.hill;
    this.onPlant = typeof o.onPlant === 'function' ? o.onPlant : null;

    injectStyles();
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    this.svg = el('svg', {});
    this.svg.setAttribute('style',
      'position:absolute;inset:0;width:100%;height:100%;overflow:visible;display:block;pointer-events:none;');
    this.container.appendChild(this.svg);

    this.pool = [];
    this.plantedPositions = [];
    this.actx = null;
    this._handlers = [];

    if (this.hill) this._drawHill();
    this._bind();
  }

  GardenInstance.prototype._defs = function () {
    var d = this.svg.querySelector('defs');
    if (!d) { d = document.createElementNS(NS, 'defs'); this.svg.insertBefore(d, this.svg.firstChild); }
    return d;
  };

  // hillside arch: plantable area is everything below this curve
  GardenInstance.prototype._curveY = function (nx, height) {
    return height * (0.58 - 0.12 * (nx - 0.35) * (nx - 0.35));
  };

  GardenInstance.prototype._drawHill = function () {
    var width = this.container.clientWidth, height = this.container.clientHeight;
    var pathData = 'M0,' + this._curveY(0, height);
    for (var x = 0; x <= width; x += 12) {
      pathData += ' L' + x + ',' + this._curveY(x / width, height);
    }
    this.svg.appendChild(el('path', {
      d: pathData + ' L' + width + ',' + height + ' L0,' + height + ' Z',
      fill: '#c8e6c9', opacity: '0.22', 'pointer-events': 'none'
    }));
    this.svg.appendChild(el('path', {
      d: pathData, stroke: '#a5c8a8', 'stroke-width': '1.5',
      'stroke-dasharray': '6 5', fill: 'none', opacity: '0.5'
    }));
  };

  GardenInstance.prototype._isPlantable = function (x, y, width, height) {
    if (!this.hill) return y > 0 && y < height;
    return y > this._curveY(x / width, height);
  };

  GardenInstance.prototype._canPlantHere = function (x, y) {
    var md = this.minDist;
    return this.plantedPositions.every(function (p) {
      return Math.hypot(p.x - x, p.y - y) > md;
    });
  };

  // meadow spacing: compare root positions inside the ground band —
  // the band compresses everything vertically, so spread sideways more
  // generously than free mode or the border looks overcrowded
  GardenInstance.prototype._canPlantMeadow = function (x, rootY) {
    var md = this.minDist * 1.6;
    return this.plantedPositions.every(function (p) {
      return Math.hypot(p.x - x, (p.y - rootY) * 2.2) > md;
    });
  };

  GardenInstance.prototype._markPlanted = function (x, y) {
    this.plantedPositions.push({ x: x, y: y });
    if (this.plantedPositions.length > 400) this.plantedPositions.shift();
  };

  // painter's algorithm: flowers lower on screen paint on top
  GardenInstance.prototype._insertByDepth = function (g, depth) {
    g.dataset.depth = depth;
    var ref = null;
    for (var i = 0; i < this.svg.children.length; i++) {
      var child = this.svg.children[i];
      if (child.dataset && child.dataset.depth !== undefined &&
          parseFloat(child.dataset.depth) > depth) { ref = child; break; }
    }
    this.svg.insertBefore(g, ref);
  };

  GardenInstance.prototype._retire = function (g) {
    this.pool.push(g);
    if (this.pool.length > this.maxFlowers) {
      var old = this.pool.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }
  };

  // soft "shua shua" brush sound on planting
  GardenInstance.prototype._pop = function () {
    if (!this.sound) return;
    try {
      if (!this.actx) this.actx = new (global.AudioContext || global.webkitAudioContext)();
      var actx = this.actx;
      // browsers start the context suspended until the visitor interacts
      if (actx.state === 'suspended') actx.resume();
      var now = actx.currentTime;
      var bufferSize = actx.sampleRate * 0.35;
      var noiseBuffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
      var output = noiseBuffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      var noise = actx.createBufferSource();
      noise.buffer = noiseBuffer;
      var gain = actx.createGain();
      var filter = actx.createBiquadFilter();
      noise.connect(filter); filter.connect(gain); gain.connect(actx.destination);
      filter.type = 'highpass'; filter.frequency.value = 6000; filter.Q = 2;
      // same envelope shape as the original garden, lifted to an audible level:
      // there it only carried because dozens of plantings stacked up at once
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0024, now + 0.35);
      noise.start(now); noise.stop(now + 0.35);
    } catch (e) {}
  };

  GardenInstance.prototype._sway = function (g, rootX, rootY) {
    if (reducedMotion) return;
    g.style.animationDelay = (Math.random() * 2) + 's';
    g.style.animation = 'garden-sway ' + (3.5 + Math.random()).toFixed(1) + 's ease-in-out infinite';
    g.style.transformOrigin = rootX + 'px ' + rootY + 'px';
  };

  GardenInstance.prototype._springIn = function (g, fg, hx, hy) {
    var dur = 550, t0 = null;
    (function anim(ts) {
      if (!t0) t0 = ts;
      var prog = Math.min((ts - t0) / dur, 1);
      var s = springEase(prog);
      g.setAttribute('opacity', Math.min(prog * 5, 1));
      fg.setAttribute('transform', 'translate(' + hx + ',' + hy + ') scale(' + s + ')');
      if (prog < 1) requestAnimationFrame(anim);
      else fg.setAttribute('transform', 'translate(' + hx + ',' + hy + ') scale(1)');
    })(performance.now());
  };

  // ── the flowers ──────────────────────────────────────────
  // Small screens get a simpler 6-petal flower to stay light.
  GardenInstance.prototype._drawSimpleFlower = function (cx, cy) {
    var pal = pick(PALETTES);
    var size = rand(16, 28) * this.sizeScale;
    var maxH = this.heightRange[1];
    var stemH, rootY;
    if (this.mode === 'meadow') {
      var H = this.container.clientHeight;
      rootY = H - rand(4, Math.max(8, H * this.ground));
      stemH = Math.max(25, Math.min(Math.min(150, maxH * 0.6), (rootY - cy) * (0.9 + rand(0, 0.2))));
      cy = Math.max(size * 1.2, rootY - stemH);
      stemH = rootY - cy;
      if (!this._canPlantMeadow(cx, rootY)) return;
      this._markPlanted(cx, rootY);
    } else {
      if (!this._canPlantHere(cx, cy)) return;
      this._markPlanted(cx, cy);
      stemH = rand(15, Math.min(150, maxH * 0.45));
      rootY = cy + stemH;
    }
    var leafSize = rand(10, 18);

    var g = el('g', { opacity: 0 });

    var sgId = 'gjsg' + (++_gid);
    var rootX = cx + rand(-8, 8);
    var sGrad = el('linearGradient', { id: sgId, x1: rootX, y1: rootY, x2: cx, y2: cy, gradientUnits: 'userSpaceOnUse' });
    var s1 = document.createElementNS(NS, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', adjustHex(pal.stem, 0.78)); sGrad.appendChild(s1);
    var s2 = document.createElementNS(NS, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', adjustHex(pal.stem, 1.22)); sGrad.appendChild(s2);
    this._defs().appendChild(sGrad);
    g.appendChild(el('path', {
      d: 'M' + cx + ',' + cy + ' L' + rootX + ',' + rootY,
      fill: 'none', stroke: 'url(#' + sgId + ')',
      'stroke-width': 2.2, 'stroke-linecap': 'round'
    }));

    var leafX = cx + rand(-8, 8);
    var leafY = cy + stemH * rand(0.4, 0.65);
    var lw = leafSize * 0.38, lh = leafSize * 1.3;
    var lpd = 'M0,0 C' + lw + ',' + (-lh * 0.12) + ' ' + lw + ',' + (-lh * 0.88) + ' 0,' + (-lh) +
              ' C' + (-lw) + ',' + (-lh * 0.88) + ' ' + (-lw) + ',' + (-lh * 0.12) + ' 0,0 Z';
    var leafG = el('g', { transform: 'translate(' + leafX + ',' + leafY + ') rotate(' + rand(-55, 55) + ')', opacity: '0.88' });
    leafG.appendChild(el('path', { d: lpd, fill: pal.leaf }));
    g.appendChild(leafG);

    var fg = el('g', { transform: 'translate(' + cx + ',' + cy + ') scale(0)' });
    var petalCol = pick(pal.petals);
    for (var i = 0; i < 6; i++) {
      fg.appendChild(el('ellipse', {
        cx: 0, cy: -size * 0.5, rx: size * 0.24, ry: size * 0.4,
        fill: petalCol, transform: 'rotate(' + (i * 60) + ')'
      }));
    }
    fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.22, fill: pal.center }));
    g.appendChild(fg);
    g.dataset.flowerType = 'simple';

    this._insertByDepth(g, this.mode === 'meadow' ? rootY : cy);
    this._springIn(g, fg, cx, cy);
    this._sway(g, rootX, rootY);
    this._retire(g);
    if (this.onPlant) this.onPlant('simple');
    this._pop();
  };

  GardenInstance.prototype._drawFlower = function (cx, cy) {
    if (!this.flowers.length) return;
    if (this.container.clientWidth <= 620) return this._drawSimpleFlower(cx, cy);

    var pal = pick(PALETTES);
    var H = this.container.clientHeight;
    var type = pick(this.flowers);
    var minH = this.heightRange[0], maxH = this.heightRange[1];
    var isSpike = type === 'lavender' || type === 'delphinium';

    var size, hx, hy, rx, ry, kx, ky;

    if (this.mode === 'meadow') {
      // border-garden geometry: roots scatter inside a ground band along the
      // bottom (not one flat line), and the head grows up toward the pointer —
      // staggered depth within a bounded range, like a real flower border
      var band = Math.max(8, H * this.ground);
      var rootY = H - rand(4, band);
      var plantH = Math.max(minH, Math.min(maxH, (rootY - cy) * (0.9 + rand(0, 0.2))));
      // head size follows the plant's actual height, not its position within
      // the configured range — so raising `height`'s ceiling never shrinks
      // the heads of the short and medium ones
      var sizeF = 0.85 + 0.25 * Math.min(1, (plantH - minH) / 120);
      size = (28 + rand(12, 24)) * sizeF * this.sizeScale;
      if (type === 'camellia' || type === 'cosmos') size = Math.min(size, 46 * this.sizeScale);
      // spike flowers (lavender, delphinium) reach ~2× size above the head anchor
      var topMarginM = isSpike ? size * 2.1 : size * 1.2;
      hy = rootY - plantH;
      if (hy < topMarginM) { hy = topMarginM; plantH = rootY - hy; }
      if (plantH < 30) return;
      if (!this._canPlantMeadow(cx, rootY)) return;
      this._markPlanted(cx, rootY);
      hx = cx;
      var tiltM = rand(-0.12, 0.12) * plantH;
      rx = cx + tiltM;
      ry = rootY;
      kx = cx + tiltM * 0.5;
      ky = rootY - plantH * 0.35;
    } else {
      // free mode: plant exactly where the pointer is
      var normalizedY = cy / H;
      // flowers further back are only slightly larger — heavy perspective looks wrong in a bounded plot
      var heightFactor = 0.85 + (1 - normalizedY) * 0.25;
      size = (28 + rand(12, 24)) * heightFactor * this.sizeScale;
      if (type === 'camellia' || type === 'cosmos') size = Math.min(size, 46 * this.sizeScale);

      if (!this._canPlantHere(cx, cy)) return;
      this._markPlanted(cx, cy);

      var span = maxH - minH;
      // stemH is the TOTAL plant length: the head rises ~65% of it above the
      // planting point, the root drops ~35% below
      var stemH = minH + (1 - normalizedY) * span + rand(-0.13, 0.13) * span;
      var tilt = rand(-0.18, 0.18) * stemH;

      var headLift = -stemH * 0.65 + rand(-12, 12);
      hx = cx;
      // lavender & delphinium carry long flower spikes: keep the head near the planting point
      var hyRaw = isSpike
        ? cy + headLift * 0.42 + rand(-10, 10)
        : cy + headLift;
      // spike flowers (lavender, delphinium) reach ~2× size above the head anchor
      var topMargin = isSpike ? size * 2.1 : size * 1.2;
      hy = Math.max(topMargin, hyRaw);

      // head hit the top edge → shorten the stem proportionally, so flowers
      // planted near the top become short plants instead of leggy ones
      if (hy > hyRaw) {
        var liftRatio = (cy - hy) / (cy - hyRaw);
        stemH = Math.max(30, stemH * Math.max(0.35, liftRatio));
      }

      var rootDrop = stemH * 0.35;
      rx = cx + tilt;
      ry = cy + rootDrop;
      kx = cx + tilt * 0.5;
      ky = cy + rootDrop * 0.6;
    }

    var g = el('g', { opacity: 0 });

    // stem with gradient (dark root → light tip)
    var sgId = 'gjsg' + (++_gid);
    var sGrad = el('linearGradient', { id: sgId, x1: rx, y1: ry, x2: hx, y2: hy, gradientUnits: 'userSpaceOnUse' });
    var sStop1 = document.createElementNS(NS, 'stop'); sStop1.setAttribute('offset', '0%'); sStop1.setAttribute('stop-color', adjustHex(pal.stem, 0.78)); sGrad.appendChild(sStop1);
    var sStop2 = document.createElementNS(NS, 'stop'); sStop2.setAttribute('offset', '100%'); sStop2.setAttribute('stop-color', adjustHex(pal.stem, 1.22)); sGrad.appendChild(sStop2);
    this._defs().appendChild(sGrad);
    g.appendChild(el('path', {
      d: 'M' + hx + ',' + hy + ' Q' + kx + ',' + ky + ' ' + rx + ',' + ry,
      fill: 'none', stroke: 'url(#' + sgId + ')',
      'stroke-width': 3 * this.sizeScale, 'stroke-linecap': 'round'
    }));

    // three leaves spread along the stem
    for (var li = 0; li < 3; li++) {
      var t = li === 0 ? rand(0.3, 0.45) : li === 1 ? rand(0.5, 0.65) : rand(0.7, 0.85);
      var lx = (1 - t) * (1 - t) * hx + 2 * (1 - t) * t * kx + t * t * rx;
      var ly = (1 - t) * (1 - t) * hy + 2 * (1 - t) * t * ky + t * t * ry;
      var side = li % 2 === 0 ? 1 : -1;
      var angle = side * rand(32, 58);
      var lw = rand(12, 17) * this.sizeScale, lh = rand(26, 40) * this.sizeScale;
      var lpd = 'M0,0 C' + lw + ',' + (-lh * 0.12) + ' ' + lw + ',' + (-lh * 0.88) + ' 0,' + (-lh) +
                ' C' + (-lw) + ',' + (-lh * 0.88) + ' ' + (-lw) + ',' + (-lh * 0.12) + ' 0,0 Z';
      var leafG = el('g', { transform: 'translate(' + lx + ',' + ly + ') rotate(' + angle + ')', opacity: rand(0.88, 0.97) });
      leafG.appendChild(el('path', { d: lpd, fill: pal.leaf }));
      g.appendChild(leafG);
    }

    // flower head (built around origin, then placed)
    var fg = el('g', { transform: 'translate(' + hx + ',' + hy + ') scale(0)' });
    this._drawHead(fg, type, size);
    g.appendChild(fg);
    g.dataset.flowerType = type;

    // meadow: depth follows the root — roots deeper in the band stand in front
    this._insertByDepth(g, this.mode === 'meadow' ? ry : cy);
    this._springIn(g, fg, hx, hy);
    this._sway(g, rx, ry);
    this._retire(g);
    if (this.onPlant) this.onPlant(type);
    this._pop();
  };

  GardenInstance.prototype._drawHead = function (fg, type, size) {
    var i, a;

    if (type === 'daisy') {
      // 18 petals radiating from the disc edge, alternating lengths, grainy center
      var petalLengths = [0.44, 0.38], petalWidths = [0.12, 0.11];
      for (i = 0; i < 18; i++) {
        var pl = petalLengths[i % 2], pw = petalWidths[i % 2];
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -(size * 0.28 + size * pl), rx: size * pw, ry: size * pl,
          fill: i % 2 === 0 ? '#ffffff' : '#faf7f2',
          stroke: '#e0ddd8', 'stroke-width': '0.5',
          transform: 'rotate(' + (i * 20) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.28, fill: '#f5c400' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.22, fill: '#e8b200' }));
      var dotPositions = [
        [-0.10, -0.13], [0.00, -0.16], [0.10, -0.13],
        [-0.15, -0.02], [0.15, -0.02],
        [-0.11, 0.10], [0.00, 0.13], [0.11, 0.10],
        [-0.05, 0.02], [0.05, 0.02], [0.00, -0.04]
      ];
      dotPositions.forEach(function (p) {
        fg.appendChild(el('circle', { cx: size * p[0], cy: size * p[1], r: size * 0.032, fill: '#c89000', opacity: '0.72' }));
      });
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.09, fill: '#ffe566', opacity: '0.45' }));

    } else if (type === 'tulip') {
      // three creamy-pink petals
      fg.appendChild(el('ellipse', { cx: -size * 0.24, cy: -size * 0.1, rx: size * 0.3, ry: size * 0.46, fill: '#f9c6d9', transform: 'rotate(-18)' }));
      fg.appendChild(el('ellipse', { cx: size * 0.24, cy: -size * 0.1, rx: size * 0.3, ry: size * 0.46, fill: '#f5a9c0', transform: 'rotate(18)' }));
      fg.appendChild(el('ellipse', { cx: 0, cy: -size * 0.33, rx: size * 0.27, ry: size * 0.55, fill: '#fce4ec' }));

    } else if (type === 'sunflower') {
      for (i = 0; i < 14; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.64, rx: size * 0.18, ry: size * 0.40,
          fill: i % 2 === 0 ? '#fef08a' : '#fde047',
          transform: 'rotate(' + (i * 360 / 14) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.32, fill: '#b8860b' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.20, fill: '#8b6914' }));
      fg.appendChild(el('circle', { cx: -size * 0.08, cy: -size * 0.08, r: size * 0.08, fill: '#5c4609', opacity: '0.6' }));

    } else if (type === 'corn poppy') {
      // four big petals, creamy pink, pale center
      var poppyColors = ['#f8b4d0', '#f599c1', '#f8b4d0', '#f599c1'];
      for (i = 0; i < 4; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.49, rx: size * 0.43, ry: size * 0.49,
          fill: poppyColors[i], opacity: '0.9', transform: 'rotate(' + (i * 90) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.25, fill: '#e8d5c4' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.13, fill: '#f5e6d3' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.06, fill: '#fffacd', opacity: '0.4' }));

    } else if (type === 'lavender') {
      // one vertical spike, dark at the base fading light at the tip
      var lavColors = ['#8b4ba6', '#9557b0', '#9f63ba', '#a96fc4', '#b37bce', '#bd87d8',
        '#c793e2', '#d19fec', '#dbabf6', '#e5b7ff', '#efc3ff', '#f9cffe'];
      for (i = 0; i < 12; i++) {
        var lyv = -size * (0.08 + i * 0.16);
        fg.appendChild(el('ellipse', { cx: -size * 0.09, cy: lyv, rx: size * 0.11, ry: size * 0.17, fill: lavColors[i] }));
        fg.appendChild(el('ellipse', { cx: size * 0.09, cy: lyv, rx: size * 0.11, ry: size * 0.17, fill: lavColors[i] }));
      }

    } else if (type === 'forgetmenot') {
      for (i = 0; i < 5; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.39, rx: size * 0.26, ry: size * 0.32,
          fill: i % 2 === 0 ? '#b8d8e8' : '#9dcde6',
          transform: 'rotate(' + (i * 72) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.18, fill: '#fef08a' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.08, fill: '#fde047' }));

    } else if (type === 'delphinium') {
      // long zig-zag spike of florets topped with green buds
      var florets = [
        { dx: 0.00, dy: 0.08, rx: 0.13, ry: 0.15, rot: 18 },
        { dx: -0.22, dy: -0.12, rx: 0.12, ry: 0.14, rot: 0 },
        { dx: 0.20, dy: -0.36, rx: 0.11, ry: 0.13, rot: 36 },
        { dx: -0.18, dy: -0.58, rx: 0.10, ry: 0.12, rot: 0 },
        { dx: 0.17, dy: -0.78, rx: 0.09, ry: 0.11, rot: 36 },
        { dx: -0.14, dy: -0.96, rx: 0.08, ry: 0.10, rot: 0 },
        { dx: 0.12, dy: -1.12, rx: 0.08, ry: 0.09, rot: 36 },
        { dx: -0.09, dy: -1.26, rx: 0.07, ry: 0.08, rot: 0 },
        { dx: 0.07, dy: -1.38, rx: 0.06, ry: 0.08, rot: 36 }
      ];
      var delColors = ['#7aaee0', '#6898d8', '#8ab8e8', '#78a8e0'];
      florets.forEach(function (f, fi) {
        var fcx = size * f.dx, fcy = size * f.dy;
        var frx = size * f.rx, fry = size * f.ry;
        for (var pi = 0; pi < 5; pi++) {
          fg.appendChild(el('ellipse', {
            cx: fcx, cy: fcy - fry, rx: frx, ry: fry,
            fill: delColors[(fi + pi) % delColors.length],
            transform: 'rotate(' + (f.rot + pi * 72) + ', ' + fcx + ', ' + fcy + ')'
          }));
        }
        fg.appendChild(el('circle', { cx: fcx, cy: fcy, r: frx * 0.65, fill: 'white', opacity: '0.85' }));
        if (fi < 6) fg.appendChild(el('circle', { cx: fcx, cy: fcy, r: frx * 0.32, fill: '#d4e860' }));
      });
      var buds = [
        { dx: -0.06, dy: -1.50, rx: 0.05, ry: 0.09 },
        { dx: 0.05, dy: -1.60, rx: 0.05, ry: 0.08 },
        { dx: -0.04, dy: -1.69, rx: 0.04, ry: 0.07 },
        { dx: 0.03, dy: -1.77, rx: 0.04, ry: 0.07 },
        { dx: -0.02, dy: -1.85, rx: 0.03, ry: 0.06 },
        { dx: 0.02, dy: -1.92, rx: 0.03, ry: 0.05 },
        { dx: 0.00, dy: -1.98, rx: 0.02, ry: 0.04 }
      ];
      var budColors = ['#6aaa40', '#5a9a30', '#6aaa40', '#7abb50', '#8acc60', '#9add70', '#aade80'];
      buds.forEach(function (b, bi) {
        fg.appendChild(el('ellipse', {
          cx: size * b.dx, cy: size * b.dy, rx: size * b.rx, ry: size * b.ry, fill: budColors[bi]
        }));
      });

    } else if (type === 'hydrangea') {
      // full round cluster: rings of small florets in mixed purple-pink-blue
      var hcy = -size * 0.65;
      var hFlorets = [{ cx: 0, cy: hcy }];
      for (i = 0; i < 5; i++) {
        a = (i * 72 + rand(-15, 15)) * Math.PI / 180;
        var r1 = size * (0.20 + rand(-0.03, 0.03));
        hFlorets.push({ cx: Math.cos(a) * r1, cy: hcy + Math.sin(a) * r1 });
      }
      for (i = 0; i < 8; i++) {
        a = (i * 45 + rand(-12, 12)) * Math.PI / 180;
        var r2 = size * (0.38 + rand(-0.04, 0.04));
        hFlorets.push({ cx: Math.cos(a) * r2, cy: hcy + Math.sin(a) * r2 });
      }
      for (i = 0; i < 12; i++) {
        a = (i * 30 + rand(-10, 10)) * Math.PI / 180;
        var r3 = size * (0.56 + rand(-0.05, 0.05));
        hFlorets.push({ cx: Math.cos(a) * r3, cy: hcy + Math.sin(a) * r3 * 0.93 });
      }
      for (i = 0; i < 10; i++) {
        a = (i * 36 + 18 + rand(-12, 12)) * Math.PI / 180;
        var r4 = size * (0.70 + rand(-0.05, 0.05));
        hFlorets.push({ cx: Math.cos(a) * r4, cy: hcy + Math.sin(a) * r4 * 0.88 });
      }
      var hPetalColors = ['#d4c5e8', '#e0d0ed', '#c8d7eb', '#dcc8e0', '#d4c5e8', '#e8d4e8', '#d8cce5', '#cdd5ec'];
      var hCenterColors = ['#fef08a', '#fef3e2', '#fef08a', '#fef9c4'];
      hFlorets.forEach(function (f, idx) {
        var petal = hPetalColors[idx % hPetalColors.length];
        var ctr = hCenterColors[idx % hCenterColors.length];
        var fs = size * (0.20 + rand(-0.03, 0.03));
        var rotOff = rand(0, 45);
        for (var pi = 0; pi < 4; pi++) {
          var pa = (pi * 90 + 45 + rotOff) * Math.PI / 180;
          var pr = fs * 0.48;
          var cx2 = f.cx + Math.cos(pa) * pr;
          var cy2 = f.cy + Math.sin(pa) * pr;
          fg.appendChild(el('ellipse', {
            cx: cx2, cy: cy2, rx: fs * 0.48, ry: fs * 0.58, fill: petal,
            transform: 'rotate(' + ((pi * 90 + 45 + rotOff) + 90) + ',' + cx2 + ',' + cy2 + ')'
          }));
        }
        fg.appendChild(el('circle', { cx: f.cx, cy: f.cy, r: fs * 0.20, fill: ctr }));
      });

    } else if (type === 'camellia') {
      // four layers of rounded overlapping petals + golden stamen burst
      for (i = 0; i < 6; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.49, rx: size * 0.37, ry: size * 0.49,
          fill: i % 2 === 0 ? '#fce4ec' : '#fde8ef', transform: 'rotate(' + (i * 60) + ')'
        }));
      }
      for (i = 0; i < 6; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.36, rx: size * 0.29, ry: size * 0.37,
          fill: i % 2 === 0 ? '#f9c6d9' : '#f5b8d0', transform: 'rotate(' + (i * 60 + 30) + ')'
        }));
      }
      for (i = 0; i < 5; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.23, rx: size * 0.21, ry: size * 0.27,
          fill: i % 2 === 0 ? '#f5a9c0' : '#f09db5', transform: 'rotate(' + (i * 72 + 15) + ')'
        }));
      }
      for (i = 0; i < 5; i++) {
        fg.appendChild(el('ellipse', {
          cx: 0, cy: -size * 0.13, rx: size * 0.14, ry: size * 0.19,
          fill: i % 2 === 0 ? '#ec7aa1' : '#e86e96', transform: 'rotate(' + (i * 72 + 50) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.16, fill: '#fef08a' }));
      for (i = 0; i < 12; i++) {
        a = i * 30 * Math.PI / 180;
        var len = size * 0.13 + rand(-size * 0.01, size * 0.01);
        fg.appendChild(el('line', {
          x1: 0, y1: 0, x2: Math.cos(a) * len, y2: Math.sin(a) * len,
          stroke: '#d4960e', 'stroke-width': size * 0.009, opacity: '0.65'
        }));
        fg.appendChild(el('circle', {
          cx: Math.cos(a) * (len + size * 0.015), cy: Math.sin(a) * (len + size * 0.015),
          r: size * 0.015, fill: '#fde047'
        }));
      }

    } else { // cosmos
      // eight petals with a double-notched tip, soft pink
      var petalPath = 'M' + (-size * 0.043) + ',0' +
        ' C' + (-size * 0.17) + ',' + (-size * 0.29) + ' ' + (-size * 0.31) + ',' + (-size * 0.71) + ' ' + (-size * 0.26) + ',' + (-size * 0.89) +
        ' C' + (-size * 0.20) + ',' + (-size * 1.0) + ' ' + (-size * 0.057) + ',' + (-size * 0.97) + ' 0,' + (-size * 0.86) +
        ' C' + (size * 0.057) + ',' + (-size * 0.97) + ' ' + (size * 0.20) + ',' + (-size * 1.0) + ' ' + (size * 0.26) + ',' + (-size * 0.89) +
        ' C' + (size * 0.31) + ',' + (-size * 0.71) + ' ' + (size * 0.17) + ',' + (-size * 0.29) + ' ' + (size * 0.043) + ',0 Z';
      for (i = 0; i < 8; i++) {
        fg.appendChild(el('path', {
          d: petalPath, fill: i % 2 === 0 ? '#fde2ec' : '#f8d0e0',
          transform: 'rotate(' + (i * 45) + ')'
        }));
      }
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.16, fill: '#fef08a' }));
      fg.appendChild(el('circle', { cx: 0, cy: 0, r: size * 0.10, fill: '#fde047' }));
      fg.appendChild(el('circle', { cx: -size * 0.036, cy: -size * 0.029, r: size * 0.02, fill: '#c8860b', opacity: '0.5' }));
      fg.appendChild(el('circle', { cx: size * 0.029, cy: size * 0.021, r: size * 0.017, fill: '#c8860b', opacity: '0.45' }));
      fg.appendChild(el('circle', { cx: 0, cy: size * 0.043, r: size * 0.016, fill: '#c8860b', opacity: '0.4' }));
    }
  };

  // ── planting gestures ────────────────────────────────────
  // scatter a handful of flowers around a point (client coordinates)
  GardenInstance.prototype.spray = function (clientX, clientY, count) {
    var rect = this.container.getBoundingClientRect();
    var width = rect.width, height = rect.height;
    var isCluster = Math.random() < 0.4;
    var maxRadius = isCluster ? rand(20, 55) : rand(40, 100);
    var self = this;
    for (var i = 0; i < count; i++) {
      var angle = rand(0, Math.PI * 2);
      var radius = rand(5, maxRadius);
      var ox = (clientX - rect.left) + Math.cos(angle) * radius;
      var oy = (clientY - rect.top) + Math.sin(angle) * radius * 0.7;
      var margin = 30;
      var fx = Math.max(margin, Math.min(width - margin, ox));
      var fy = Math.max(margin, Math.min(height - margin, oy));
      if (this._isPlantable(fx, fy, width, height)) {
        (function (px, py, delay) {
          setTimeout(function () { self._drawFlower(px, py); }, delay);
        })(fx, fy, i * rand(15, 40));
      }
    }
  };

  // plant one flower at container-local coordinates
  GardenInstance.prototype.plantAt = function (x, y) {
    this._drawFlower(x, y);
  };

  // live setters — safe to call any time, existing flowers stay planted
  GardenInstance.prototype.setFlowers = function (flowers) {
    this.flowers = flowers == null ? SPECIES.slice()
      : flowers.filter(function (s) { return SPECIES.indexOf(s) !== -1; });
  };
  GardenInstance.prototype.setDensity = function (density) {
    if (density == null) {
      // the original garden's density: 45px between flowers, 1× spray counts
      this.minDist = 45;
      this.sprayScale = 1;
      return;
    }
    var d = Math.max(0, Math.min(1, density));
    this.minDist = 70 - 40 * d;          // how tightly flowers may cluster
    this.sprayScale = 0.4 + d;           // multiplies flowers-per-gesture
  };
  GardenInstance.prototype.setHeight = function (height) {
    var h = height == null ? 'medium' : height;
    this.heightRange = Array.isArray(h) ? h : (HEIGHT_PRESETS[h] || HEIGHT_PRESETS.medium);
  };
  GardenInstance.prototype.setSize = function (size) {
    this.sizeScale = size == null ? 1 : Math.max(0.4, Math.min(2, size));
  };

  GardenInstance.prototype.clear = function () {
    this.pool.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
    this.pool = [];
    this.plantedPositions = [];
  };

  GardenInstance.prototype.destroy = function () {
    var self = this;
    this._handlers.forEach(function (h) { self.container.removeEventListener(h[0], h[1], h[2]); });
    this._handlers = [];
    if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.pool = [];
    this.plantedPositions = [];
  };

  GardenInstance.prototype._bind = function () {
    var self = this;
    var lastTime = 0, lastX = -999, lastY = -999;
    function n(base) { return Math.max(1, Math.round(base * self.sprayScale)); }
    function on(type, fn, opts) {
      self.container.addEventListener(type, fn, opts);
      self._handlers.push([type, fn, opts]);
    }

    on('mousemove', function (e) {
      var now = performance.now();
      var dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (dist < 12 || now - lastTime < 130) return;
      lastX = e.clientX; lastY = e.clientY; lastTime = now;
      var speed = dist / Math.max(1, now - lastTime + 0.01);
      self.spray(e.clientX, e.clientY, n(speed > 3 ? 3 : 2));
    });

    on('click', function (e) {
      self.spray(e.clientX, e.clientY, n(6));
    });

    on('touchmove', function (e) {
      e.preventDefault();
      var t = e.touches[0];
      var now = performance.now();
      if (Math.hypot(t.clientX - lastX, t.clientY - lastY) < 12 || now - lastTime < 130) return;
      lastX = t.clientX; lastY = t.clientY; lastTime = now;
      self.spray(t.clientX, t.clientY, n(5));
    }, { passive: false });

    on('touchstart', function (e) {
      var t = e.touches[0];
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });

    on('touchend', function (e) {
      if (e.changedTouches.length > 0) {
        var t = e.changedTouches[0];
        self.spray(t.clientX, t.clientY, n(8));
      }
    });
  };

  // ── public API ───────────────────────────────────────────
  var Garden = {
    plant: function (target, opts) { return new GardenInstance(target, opts); },
    SPECIES: SPECIES.slice(),
    // standalone flower-head preview, e.g. for species pickers.
    // Returns a square <svg> element of the given pixel size.
    preview: function (species, px) {
      px = px || 64;
      var svg = el('svg', { width: px, height: px });
      var fg = el('g', {});
      svg.appendChild(fg);
      GardenInstance.prototype._drawHead(fg, species, 30);
      // getBBox needs the element rendered once
      svg.style.position = 'absolute';
      svg.style.visibility = 'hidden';
      document.body.appendChild(svg);
      var bb = fg.getBBox();
      document.body.removeChild(svg);
      svg.style.position = '';
      svg.style.visibility = '';
      var pad = 4;
      var side = Math.max(bb.width, bb.height) + pad * 2;
      var cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      svg.setAttribute('viewBox', (cx - side / 2) + ' ' + (cy - side / 2) + ' ' + side + ' ' + side);
      return svg;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Garden;
  global.Garden = Garden;
})(typeof window !== 'undefined' ? window : this);
