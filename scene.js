(() => {
  'use strict';

  // All coordinates are source-image pixels. Retune this single configuration
  // after an image revision; the renderer keeps its state inside this closure.
  const SCENE = {
    width: 1536,
    height: 1024,
    pixelSize: 2,
    framesPerSecond: 30,
    cat: {
      atlas: 'cat-atlas.webp?v=10',
      columns: 4,
      cellWidth: 200,
      cellHeight: 120,
      x: -31,
      y: 410,
      width: 200,
      height: 120,
      // The generated cat's contact line is at source y=110, below its body.
      contactLine: 110,
      breathAmount: .024,
      breathSeconds: 4.8,
      cycleSeconds: 22,
      // Hold distinct drawn poses; avoid cross-fading eyes or doubling tails.
      poses: [
        [0, 2.4], [1, .22], [0, .55], [2, .2],
        [3, 1.9], [4, .14], [3, 1.25], [5, .72],
        [3, .55], [2, .2], [6, .25], [7, 4.9],
        [1, .18], [7, 2.4], [1, .22], [0, 5.92]
      ]
    },
    steam: { x: 1421, y: 405, height: 82, width: 54, seconds: 4.8, puffs: 11 },
    lamps: [[42, 103], [1494, 103]],
    bridge: [[19, 244], [51, 245], [74, 246], [95, 248], [114, 250], [131, 251], [144, 252], [155, 254], [165, 254], [172, 255], [180, 256], [185, 257], [191, 258], [199, 259], [208, 261], [216, 264]],
    shoreLights: [[165, 231], [160, 237], [156, 237], [62, 238], [210, 237]],
    waterReflections: [[74, 301, 34, 56], [181, 292, 20, 52]],
    marquee: [
      [431, 182], [456, 182], [481, 182], [506, 182], [531, 182], [556, 182], [581, 182], [606, 182], [631, 182], [656, 182], [681, 182], [706, 182],
      [710, 207], [710, 232], [710, 257], [710, 282], [710, 307], [710, 332], [710, 357], [710, 382],
      [418, 382], [418, 357], [418, 332], [418, 307], [418, 282], [418, 257], [418, 232], [418, 207]
    ],
    playfieldEdges: [
      [[422, 414], [365, 531], 13],
      [[373, 538], [725, 538], 27],
      [[733, 531], [696, 414], 13]
    ],
    nativeLights: [[474, 425, 19], [560, 440, 21], [654, 423, 19], [676, 454, 18], [458, 475, 19], [554, 522, 16]],
    lettering: {
      // Native pixels retain the drawn letter shapes and their warm red edge.
      letters: [[450, 198, 39, 49], [489, 198, 22, 49], [511, 198, 35, 49], [546, 198, 31, 49], [577, 198, 32, 49], [609, 198, 35, 49], [644, 198, 42, 49]],
      score: [499, 360, 132, 25],
      start: [494, 649, 135, 21]
    },
    pinball: {
      radius: 3,
      roundSeconds: 3.5,
      // Timed contacts use separate return lanes around the large globe.
      // The short drain/relaunch hold separates the left and right rounds.
      paths: [
        [[0, 660, 513], [.35, 680, 483], [.6, 679, 471], [.95, 646, 489], [1.18, 617, 511], [1.55, 658, 480], [1.82, 670, 469], [2.16, 644, 489], [2.55, 653, 514]],
        [[0, 437, 508], [.34, 455, 485], [.56, 464, 490], [.84, 504, 512], [1.17, 507, 482], [1.4, 518, 466], [1.64, 508, 475], [2.04, 504, 512], [2.55, 456, 514]]
      ]
    },
    flippers: {
      asset: 'flipper.webp?v=1', width: 60, height: 20,
      sourcePivot: [7, 10], pivots: [[477, 510], [635, 510]],
      restDegrees: 12,
      activeDegrees: 28,
      // Each round's paddle fires as the ball reaches its contact point.
      leftContact: .84, rightContact: 1.18,
      upSeconds: .08, holdSeconds: .12, downSeconds: .14
    },
    buttons: [[514, 602], [587, 602]]
  };

  const root = document.querySelector('.arcade');
  if (!root) return;
  const canvas = root.querySelector('.scene-animation');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const button = root.querySelector('.motion-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const atlas = new Image();
  const flipperImage = new Image();
  const sourceArt = root.querySelector('.scene-art');
  const frameDuration = 1000 / SCENE.framesPerSecond;
  const TAU = Math.PI * 2;
  const logicalScale = 1 / SCENE.pixelSize;
  let imageReady = false;
  let flipperReady = false;
  let manualChoice = false;
  let playing = !reducedMotion.matches;
  let inView = true;
  let animationFrame = 0;
  let elapsed = 0;
  let lastClock = null;
  let lastPaint = -Infinity;

  canvas.width = SCENE.width * logicalScale;
  canvas.height = SCENE.height * logicalScale;
  context.setTransform(logicalScale, 0, 0, logicalScale, 0, 0);
  context.imageSmoothingEnabled = false;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smooth = value => value * value * (3 - 2 * value);
  const pixel = value => Math.round(value / SCENE.pixelSize) * SCENE.pixelSize;
  const noise = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const edgeBulbs = [];
  SCENE.playfieldEdges.forEach(([start, end, count]) => {
    for (let i = 0; i < count; i += 1) {
      const ratio = i / (count - 1);
      edgeBulbs.push([pixel(start[0] + (end[0] - start[0]) * ratio), pixel(start[1] + (end[1] - start[1]) * ratio)]);
    }
  });

  const glowTiles = new Map();
  const nativeTiles = { lights: [], letters: [], bridge: [], shore: [], reflections: [], score: null, start: null };

  function makeNativeTile(rect, brightness, radial = false) {
    const [x, y, width, height] = rect;
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(width / SCENE.pixelSize);
    tile.height = Math.ceil(height / SCENE.pixelSize);
    const paint = tile.getContext('2d');
    paint.imageSmoothingEnabled = false;
    const sourceScaleX = sourceArt.naturalWidth / SCENE.width;
    const sourceScaleY = sourceArt.naturalHeight / SCENE.height;
    // Brightness filtering happens once at load time, never inside the loop.
    paint.filter = `brightness(${brightness})`;
    paint.drawImage(sourceArt, x * sourceScaleX, y * sourceScaleY, width * sourceScaleX, height * sourceScaleY, 0, 0, tile.width, tile.height);
    paint.filter = 'none';
    paint.globalCompositeOperation = 'destination-in';
    if (radial) {
      const radius = Math.min(tile.width, tile.height) / 2;
      const mask = paint.createRadialGradient(tile.width / 2, tile.height / 2, 0, tile.width / 2, tile.height / 2, radius);
      mask.addColorStop(0, 'rgba(0,0,0,1)');
      mask.addColorStop(.62, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      paint.fillStyle = mask;
      paint.fillRect(0, 0, tile.width, tile.height);
    } else {
      // Feather the outer two pixels of display crops. Shared seams between
      // letters remain quiet while their actual luminous artwork is dimmed.
      const featherX = Math.min(2 / tile.width, .2);
      const featherY = Math.min(2 / tile.height, .2);
      const maskX = paint.createLinearGradient(0, 0, tile.width, 0);
      maskX.addColorStop(0, 'rgba(0,0,0,0)');
      maskX.addColorStop(featherX, 'rgba(0,0,0,1)');
      maskX.addColorStop(1 - featherX, 'rgba(0,0,0,1)');
      maskX.addColorStop(1, 'rgba(0,0,0,0)');
      paint.fillStyle = maskX;
      paint.fillRect(0, 0, tile.width, tile.height);
      const maskY = paint.createLinearGradient(0, 0, 0, tile.height);
      maskY.addColorStop(0, 'rgba(0,0,0,0)');
      maskY.addColorStop(featherY, 'rgba(0,0,0,1)');
      maskY.addColorStop(1 - featherY, 'rgba(0,0,0,1)');
      maskY.addColorStop(1, 'rgba(0,0,0,0)');
      paint.fillStyle = maskY;
      paint.fillRect(0, 0, tile.width, tile.height);
    }
    paint.globalCompositeOperation = 'source-over';
    return tile;
  }

  function nativeVariants(rect, radial = false) {
    return { rect, dim: makeNativeTile(rect, .25, radial), resting: makeNativeTile(rect, .68, radial), lit: makeNativeTile(rect, 1.3, radial) };
  }

  function cacheMachineArt() {
    if (!sourceArt.complete || !sourceArt.naturalWidth) return;
    try {
      nativeTiles.lights = SCENE.nativeLights.map(([x, y, radius]) => nativeVariants([x - radius, y - radius, radius * 2, radius * 2], true));
      nativeTiles.letters = SCENE.lettering.letters.map(rect => nativeVariants(rect));
      nativeTiles.score = nativeVariants(SCENE.lettering.score);
      nativeTiles.start = nativeVariants(SCENE.lettering.start);
      nativeTiles.bridge = SCENE.bridge.map(([x, y]) => nativeVariants([x - 4, y - 4, 8, 8], true));
      nativeTiles.shore = SCENE.shoreLights.map(([x, y]) => nativeVariants([x - 3, y - 3, 6, 6], true));
      nativeTiles.reflections = SCENE.waterReflections.map(rect => nativeVariants(rect, true));
      canvas.dataset.machineArt = 'ready';
      draw(elapsed, !playing && !manualChoice);
    } catch {
      // The source plate and rim animation remain usable if a crop fails.
      canvas.dataset.machineArt = 'unavailable';
    }
  }

  function nativeLight(tile, brightness) {
    if (!tile) return;
    const [x, y, width, height] = tile.rect;
    const low = brightness < .68 ? tile.dim : tile.resting;
    const high = brightness < .68 ? tile.resting : tile.lit;
    const mix = brightness < .68 ? clamp((brightness - .25) / .43) : clamp((brightness - .68) / .62);
    context.drawImage(low, x, y, width, height);
    if (mix > 0) {
      context.globalAlpha = mix;
      context.drawImage(high, x, y, width, height);
      context.globalAlpha = 1;
    }
  }

  function bloom(x, y, radius, color, opacity) {
    const key = `${radius}:${color}`;
    let tile = glowTiles.get(key);
    if (!tile) {
      tile = document.createElement('canvas');
      tile.width = tile.height = radius * 2 / SCENE.pixelSize;
      const paint = tile.getContext('2d');
      const center = tile.width / 2;
      const glow = paint.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, `rgba(${color},1)`);
      glow.addColorStop(.3, `rgba(${color},.4)`);
      glow.addColorStop(1, `rgba(${color},0)`);
      paint.fillStyle = glow;
      paint.fillRect(0, 0, tile.width, tile.height);
      glowTiles.set(key, tile);
    }
    context.globalAlpha = opacity;
    context.drawImage(tile, pixel(x - radius), pixel(y - radius), radius * 2, radius * 2);
    context.globalAlpha = 1;
  }

  function bulb(x, y, brightness, color, size = 4, radius = 12) {
    // The little dark sockets make a real off state on the already lit plate.
    context.fillStyle = 'rgba(15,35,42,.72)';
    context.fillRect(pixel(x - size / 2), pixel(y - size / 2), size, size);
    if (brightness < .035) return;
    bloom(x, y, radius, color, .3 * brightness);
    context.fillStyle = `rgba(${color},${brightness})`;
    context.fillRect(pixel(x - size / 2), pixel(y - size / 2), size, size);
    if (brightness > .55) {
      context.fillStyle = `rgba(255,247,198,${(brightness - .55) * 1.9})`;
      context.fillRect(pixel(x - 1), pixel(y - 1), 2, 2);
    }
  }

  function drawMachine(seconds, still) {
    const chase = still ? 8 : seconds * 7;
    edgeBulbs.forEach(([x, y], index) => {
      const distance = ((index - chase) % edgeBulbs.length + edgeBulbs.length) % edgeBulbs.length;
      // Three travelling lights followed by a softer six-bulb trail.
      const on = distance < 3 ? .92 : distance < 9 ? .35 * (1 - (distance - 3) / 6) : .07;
      bulb(x, y, on, '115,246,178', 4, 10);
    });

    const headChase = still ? 6 : Math.floor(seconds * 4.1);
    SCENE.marquee.forEach(([x, y], index) => {
      const group = ((index - headChase) % 7 + 7) % 7;
      const on = group < 2 ? .86 : group === 2 ? .3 : .05;
      const color = index % 3 === 0 ? '255,187,70' : '80,215,242';
      bulb(x, y, on, color, 4, 9);
    });

    drawNativeAttract(seconds, still);
    drawFlippers(seconds, still);
    drawPinball(seconds, still);

    SCENE.buttons.forEach(([x, y], index) => {
      const phase = still ? .5 : (seconds + index * 1.8) % 4.1;
      const on = phase < 1.15 || (phase > 1.46 && phase < 1.73);
      context.fillStyle = on ? 'rgba(251,75,43,.8)' : 'rgba(89,27,35,.78)';
      context.fillRect(pixel(x - 5), pixel(y - 8), 10, 16);
      if (on) {
        bloom(x, y, 15, '255,75,39', .2);
        context.fillStyle = '#ffe8aa';
        context.fillRect(pixel(x - 2), pixel(y - 5), 2, 4);
        context.fillRect(pixel(x - 2), pixel(y + 3), 2, 2);
      }
    });
  }

  function drawNativeAttract(seconds, still) {
    // Staggered two-beat pulses resemble bumper lamps in attract mode. The
    // actual painted star-shaped lights go dark rather than gaining sparkles.
    const cycle = seconds % 8.4;
    const sequence = Math.floor(seconds * 2.4) % SCENE.nativeLights.length;
    SCENE.nativeLights.forEach(([x, y, radius], index) => {
      const beat = (seconds + index * .37) % 1.8;
      const burst = beat < .12 || (beat > .21 && beat < .36);
      const allTogether = !still && cycle > 6.8 && cycle < 7.08;
      const chasing = index === sequence || index === (sequence + 3) % SCENE.nativeLights.length;
      const on = still ? .94 : allTogether || (chasing && burst) ? 1.3 : chasing ? .88 : .25;
      nativeLight(nativeTiles.lights[index], on);
      if (on > 1) bloom(x, y, radius + 5, '255,174,39', .17);
    });

    const letterLead = Math.floor(seconds * 3.4) % nativeTiles.letters.length;
    const marqueeBeat = seconds % 7.2;
    nativeTiles.letters.forEach((tile, index) => {
      let on = .85;
      if (!still) {
        const distance = (index - letterLead + 7) % 7;
        on = distance === 0 ? 1.3 : distance === 1 ? 1.06 : .6;
        if (marqueeBeat > 5.9 && marqueeBeat < 6.12) on = 1.3;
        if (marqueeBeat > 6.23 && marqueeBeat < 6.38) on = .44;
      }
      nativeLight(tile, on);
    });
    // The birthday stays readable throughout the soft scoreboard breathing.
    const scoreGlow = still ? 1 : .93 + .23 * (.5 + .5 * Math.sin(seconds * 1.45));
    nativeLight(nativeTiles.score, scoreGlow);
    // A true attract prompt: clear lit and dim holds with a gentle warm edge.
    const startOn = still || seconds % 1.6 < 1.06;
    nativeLight(nativeTiles.start, startOn ? 1.3 : .25);
    canvas.dataset.attract = still ? 'still' : String(Math.floor(cycle * 4));
  }

  function ballPosition(seconds) {
    const game = SCENE.pinball;
    const round = Math.floor(seconds / game.roundSeconds);
    const local = seconds % game.roundSeconds;
    const path = game.paths[round % game.paths.length];
    if (local > path[path.length - 1][0]) return null;
    for (let index = 1; index < path.length; index += 1) {
      const [endTime, endX, endY] = path[index];
      if (local > endTime) continue;
      const [startTime, startX, startY] = path[index - 1];
      const amount = clamp((local - startTime) / (endTime - startTime));
      return [startX + (endX - startX) * amount, startY + (endY - startY) * amount];
    }
    return null;
  }

  function flipperLift(seconds, side, still) {
    if (still) return 0;
    const round = Math.floor(seconds / SCENE.pinball.roundSeconds);
    const activeSide = round % SCENE.pinball.paths.length === 0 ? 1 : 0;
    if (activeSide !== side) return 0;
    const motion = SCENE.flippers;
    const contact = side === 0 ? motion.leftContact : motion.rightContact;
    const delta = seconds % SCENE.pinball.roundSeconds - contact + motion.upSeconds;
    if (delta < 0) return 0;
    if (delta < motion.upSeconds) return smooth(delta / motion.upSeconds);
    if (delta < motion.upSeconds + motion.holdSeconds) return 1;
    const returning = (delta - motion.upSeconds - motion.holdSeconds) / motion.downSeconds;
    return returning < 1 ? 1 - smooth(returning) : 0;
  }

  function drawFallbackFlipper() {
    // Keep both paddles present if the sprite request is unavailable.
    context.rotate(9 * Math.PI / 180);
    context.fillStyle = '#6b2329';
    context.beginPath();
    context.moveTo(-7, -6); context.lineTo(-3, -9); context.lineTo(46, -4);
    context.lineTo(53, 0); context.lineTo(49, 6); context.lineTo(-3, 9);
    context.lineTo(-7, 5); context.closePath(); context.fill();
    context.fillStyle = '#ed492f';
    context.beginPath();
    context.moveTo(-5, -5); context.lineTo(-2, -7); context.lineTo(45, -3);
    context.lineTo(50, 0); context.lineTo(46, 4); context.lineTo(-2, 6);
    context.lineTo(-5, 3); context.closePath(); context.fill();
    context.fillStyle = '#fff0c5';
    context.beginPath();
    context.moveTo(-2, -5); context.lineTo(43, -2); context.lineTo(46, 0);
    context.lineTo(-2, -1); context.closePath(); context.fill();
  }

  function drawFlippers(seconds, still) {
    const config = SCENE.flippers;
    config.pivots.forEach(([x, y], side) => {
      const lift = flipperLift(seconds, side, still);
      context.save();
      context.translate(x, y);
      context.rotate((side === 0 ? 1 : -1) * (config.restDegrees - lift * config.activeDegrees) * Math.PI / 180);
      if (side === 1) context.scale(-1, 1);
      if (flipperReady) {
        context.drawImage(flipperImage, -config.sourcePivot[0], -config.sourcePivot[1], config.width, config.height);
      } else {
        drawFallbackFlipper();
      }
      context.restore();
    });
  }

  function drawPinball(seconds, still) {
    if (still) return;
    const center = ballPosition(seconds);
    if (!center) return;
    // A tiny reflected metal ball, with a two-sample motion trace rather than
    // stars or particles. Straight segments change direction at real contacts.
    for (let sample = 2; sample > 0; sample -= 1) {
      const previous = ballPosition(Math.max(0, seconds - sample * .027));
      if (!previous || Math.hypot(previous[0] - center[0], previous[1] - center[1]) > 15) continue;
      context.fillStyle = `rgba(214,193,142,${sample === 1 ? .18 : .08})`;
      context.fillRect(pixel(previous[0] - 1), pixel(previous[1] - 1), 2, 2);
    }
    const x = pixel(center[0] - SCENE.pinball.radius);
    const y = pixel(center[1] - SCENE.pinball.radius);
    context.fillStyle = 'rgba(17,31,42,.8)';
    context.fillRect(x + 1, y + 4, 6, 4);
    context.fillStyle = '#78919c';
    context.fillRect(x + 2, y, 2, 6);
    context.fillRect(x, y + 2, 6, 2);
    context.fillStyle = '#d4d8ca';
    context.fillRect(x + 2, y, 2, 4);
    context.fillRect(x, y + 2, 4, 2);
    context.fillStyle = '#fff0b4';
    context.fillRect(x + 2, y, 2, 2);
  }

  function drawRoom(seconds, still) {
    SCENE.lamps.forEach(([x, y], index) => {
      const seed = index * 4.71;
      const breathing = still ? .64 : .62 + Math.sin(seconds * .83 + seed) * .05 + Math.sin(seconds * 2.17 + seed) * .018;
      const cycle = (seconds + index * 13.7) % 43;
      const flicker = !still && cycle > 31.04 && cycle < 31.19 ? .6 : 1;
      bloom(x, y + 6, 66, '255,174,70', breathing * .18 * flicker);
      bloom(x, y, 15, '255,230,144', breathing * .35 * flicker);
      context.fillStyle = `rgba(255,240,173,${breathing * .16 * flicker})`;
      context.fillRect(pixel(x - 7), pixel(y - 5), 14, 8);
    });
    SCENE.bridge.forEach(([x, y], index) => {
      const cycle = 4.4 + (index % 4) * .7;
      const phase = (seconds + index * .63) % cycle;
      const on = still ? .96 : phase < .32 ? .25 : phase < .74 ? 1.3 : phase < .96 ? .4 : .9;
      nativeLight(nativeTiles.bridge[index], on);
      if (on > 1) bloom(x, y, 7, '255,204,80', .32);
    });
    SCENE.shoreLights.forEach(([x, y], index) => {
      const phase = (seconds + index * 1.9) % (6.1 + index * .5);
      const on = still ? .8 : phase < .65 ? .25 : phase < 1.1 ? 1.3 : .76;
      nativeLight(nativeTiles.shore[index], on);
      if (on > 1) bloom(x, y, 5, '255,202,91', .22);
    });
    nativeTiles.reflections.forEach((tile, index) => {
      const shimmer = still ? .94 : .88 + Math.sin(seconds * 1.8 + index * 3.2) * .16 + Math.sin(seconds * 3.4 + index) * .06;
      nativeLight(tile, shimmer);
    });
  }

  function drawSteam(seconds, still) {
    const { x, y, height, width, seconds: life, puffs } = SCENE.steam;
    const clock = still ? 1.65 : seconds;
    const parcels = [];
    for (let index = 0; index < puffs; index += 1) {
      const age = ((clock / life + index / puffs) % 1 + 1) % 1;
      const turn = clock * 1.1 + index * 1.89;
      const swirl = Math.sin(age * 6.7 + turn * .35) * (2 + age * 9);
      parcels.push({
        x: swirl + Math.sin(turn) * age * 3,
        y: -4 - age * height,
        radiusX: 3.2 + age * 7.2,
        radiusY: 6 + age * 7,
        alpha: Math.pow(Math.sin(Math.PI * age), .75) * (1 - age) * .78,
        age,
        seed: index
      });
    }
    // Filled, soft-edged pixel clusters form rising parcels of vapor. Their
    // silhouette curls and thins as it rises; nothing is drawn as a rigid line.
    for (let py = -height - 6; py < 0; py += SCENE.pixelSize) {
      const row = parcels.map(parcel => ({
        center: parcel.x + Math.sin(py * .14 + clock * 1.7 + parcel.seed) * (1.5 + parcel.age * 2.3),
        radius: parcel.radiusX,
        alpha: Math.exp(-Math.pow((py - parcel.y) / parcel.radiusY, 2) * 1.8) * parcel.alpha
      })).filter(parcel => parcel.alpha > .002);
      for (let px = -width / 2; px <= width / 2; px += SCENE.pixelSize) {
        let density = 0;
        for (const parcel of row) {
          const dx = (px - parcel.center) / parcel.radius;
          density += Math.exp(-dx * dx * 1.8) * parcel.alpha;
        }
        if (density < .012) continue;
        const grain = .72 + noise(px * .4 + Math.floor(clock * 3) * .23, py * .24) * .36;
        density = Math.min(density * grain, .52);
        if (density < .012) continue;
        context.fillStyle = `rgba(250,229,206,${density.toFixed(3)})`;
        context.fillRect(pixel(x + px), pixel(y + py), SCENE.pixelSize, SCENE.pixelSize);
      }
    }
  }

  function catPose(seconds, still) {
    if (still) return 0;
    let cursor = seconds % SCENE.cat.cycleSeconds;
    for (const [pose, duration] of SCENE.cat.poses) {
      if (cursor < duration) return pose;
      cursor -= duration;
    }
    return 0;
  }

  function drawCat(seconds, still) {
    if (!imageReady) return;
    const cat = SCENE.cat;
    const pose = catPose(seconds, still);
    if (canvas.dataset.catPose !== String(pose)) canvas.dataset.catPose = String(pose);
    const scaleX = cat.width / cat.cellWidth;
    const breath = still ? 0 : Math.sin(seconds / cat.breathSeconds * TAU) * cat.breathAmount;
    const scaleY = cat.height / cat.cellHeight * (1 + breath);
    const contact = cat.y + cat.contactLine * cat.height / cat.cellHeight;
    const top = contact - cat.contactLine * scaleY;
    const sourceX = (pose % cat.columns) * cat.cellWidth;
    const sourceY = Math.floor(pose / cat.columns) * cat.cellHeight;
    // Contact stays still while the chest rises. The tip of the ringed tail
    // makes two small relaxed flicks using the same sprite pixels.
    const tail = {x: 41, y: 98, width: 64, height: 12};
    const tailPhase = (seconds + 1.7) % 9.6;
    const tailLift = still || tailPhase > 1.8 ? 0 : Math.sin(tailPhase / 1.8 * TAU * 2) * 2.3 * Math.sin(tailPhase / 1.8 * Math.PI);
    context.save();
    context.beginPath();
    context.rect(cat.x, top, cat.width, cat.height * (1 + breath));
    context.rect(cat.x + tail.x * scaleX, top + tail.y * scaleY, tail.width * scaleX, tail.height * scaleY);
    context.clip('evenodd');
    context.drawImage(atlas, sourceX, sourceY, cat.cellWidth, cat.cellHeight, cat.x, top, cat.width, cat.cellHeight * scaleY);
    context.restore();
    for (let strip = 0; strip < tail.width; strip += 2) {
      const lift = tailLift * smooth(strip / tail.width);
      context.drawImage(atlas, sourceX + tail.x + strip, sourceY + tail.y, 2, tail.height,
        cat.x + (tail.x + strip) * scaleX, top + tail.y * scaleY - lift, 2 * scaleX, tail.height * scaleY);
    }
  }

  function draw(seconds = elapsed, still = !playing) {
    const second = String(Math.floor(seconds));
    if (canvas.dataset.sceneSecond !== second) canvas.dataset.sceneSecond = second;
    context.clearRect(0, 0, SCENE.width, SCENE.height);
    drawRoom(seconds, still);
    drawMachine(seconds, still);
    drawSteam(seconds, still);
    drawCat(seconds, still);
  }

  function canAnimate() {
    return playing && !document.hidden && inView;
  }

  function tick(now) {
    animationFrame = 0;
    if (!canAnimate()) { lastClock = null; return; }
    // Use elapsed time even when the browser supplies fewer frames. Capping
    // each tick makes a quiet tab's cat take minutes to reach its next pose.
    if (lastClock !== null) elapsed += (now - lastClock) / 1000;
    lastClock = now;
    if (now - lastPaint >= frameDuration - 1) {
      draw(elapsed, false);
      lastPaint = now;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    root.dataset.motion = playing ? 'playing' : 'paused';
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
    button.title = playing ? 'Pause animation' : 'Play animation';
    if (canAnimate()) {
      if (!animationFrame) {
        lastClock = null;
        lastPaint = -Infinity;
        animationFrame = requestAnimationFrame(tick);
      }
    } else {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      lastClock = null;
      // Manual pause holds the current composition. A reduced-motion start
      // gets a quiet sleeping pose and fixed, comfortably lit steam/lights.
      if (!manualChoice && reducedMotion.matches) draw(0, true);
    }
  }

  button.addEventListener('click', () => {
    manualChoice = true;
    playing = !playing;
    syncPlayback();
  });
  reducedMotion.addEventListener('change', () => {
    if (!manualChoice) playing = !reducedMotion.matches;
    syncPlayback();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0 });
    observer.observe(root.querySelector('.scene'));
  }
  atlas.addEventListener('load', () => {
    imageReady = true;
    draw(elapsed, !playing && !manualChoice);
  });
  atlas.addEventListener('error', () => {
    // Lighting and steam remain functional if the optional sprite fails.
    root.dataset.cat = 'unavailable';
  });
  atlas.src = SCENE.cat.atlas;
  flipperImage.addEventListener('load', () => {
    flipperReady = true;
    canvas.dataset.flippers = 'ready';
    draw(elapsed, !playing && !manualChoice);
  });
  flipperImage.addEventListener('error', () => { canvas.dataset.flippers = 'fallback'; });
  flipperImage.src = SCENE.flippers.asset;
  sourceArt.addEventListener('load', cacheMachineArt);
  if (sourceArt.complete && sourceArt.naturalWidth) cacheMachineArt();
  draw(0, !playing);
  syncPlayback();
})();
