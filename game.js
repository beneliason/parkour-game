const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 540;

// ─── Constants ───────────────────────────────────────────────────────────────
const GRAVITY      = 0.55;
const JUMP_FORCE   = -13;
const BOUNCE_FORCE = -18;
const MOVE_SPEED   = 5.5;
const FRICTION     = 0.82;
const MAX_JUMPS    = 3;

// ─── Sprite ──────────────────────────────────────────────────────────────────
const avatar = new Image();
avatar.src = 'avatar.png';

// Source regions within avatar.png (the new spritesheet).
// Row 1 (y=76-400):  RUN1-A, RUN1-B, RUN2-A, RUN2-B, JUMP-launch, JUMP-air, JUMP-fall
// Row 2 (y=529-797): IDLE, LAND/STOP, CROUCH, CLIMB-A, CLIMB-B
// topFrac = fraction of sh before the character's first visible pixel,
// used to anchor the jump dots at a consistent distance above the head.
const FRAMES = {
  run:    { sx: 56,   sy: 76,  sw: 146, sh: 324, topFrac: 0.05, scale: 1 },
  run2:   { sx: 429,  sy: 76,  sw: 159, sh: 324, topFrac: 0.05, scale: 1 },
  jump_l: { sx: 846,  sy: 76,  sw: 179, sh: 324, topFrac: 0.02, scale: 1 },
  jump:   { sx: 1067, sy: 46,  sw: 181, sh: 354, topFrac: 0.02, scale: 1 },
  jump_f: { sx: 1293, sy: 76,  sw: 184, sh: 324, topFrac: 0.02, scale: 1 },
  land:   { sx: 98,   sy: 529, sw: 150, sh: 268, topFrac: 0.02, scale: 268 / 324 },
};

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

// ─── Particles ───────────────────────────────────────────────────────────────
const particles = [];

function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.12;
    p.life -= 0.04;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camera.x - 3, p.y - camera.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
}

// ─── Levels ──────────────────────────────────────────────────────────────────
// Platform types:
//   normal   – standard solid platform
//   moving   – slides back and forth (axis: 'x'|'y', range, speed, phase)
//   crumble  – shakes then falls after being stood on
//   bouncy   – launches player up hard
//
// Each level: { startX, startY, finishX, checkpoints[], platforms[], spikes[] }
// Checkpoints: { x, y } — pole drawn at (x, y); player respawns at (x+10, y-h)

const LEVELS = [
  // ── Level 1: Warmup sampler (3550px) ──────────────────────────────────────
  {
    startX: 60, startY: 380,
    finishX: 3550,
    checkpoints: [
      { x: 1540, y: 340 },  // rest ledge after S2 moving platforms
      { x: 2420, y: 320 },  // safe landing after S3 crumbles
    ],
    platforms: [
      // S1: Warmup (normal)
      { type: 'normal',  x: -100, y: 460, width: 360,  height: 20 },
      { type: 'normal',  x: 330,  y: 400, width: 140,  height: 20 },
      { type: 'normal',  x: 540,  y: 340, width: 120,  height: 20 },
      { type: 'normal',  x: 730,  y: 270, width: 100,  height: 20 },
      // S2: Moving platforms
      { type: 'moving',  x: 920,  y: 270, width: 100, height: 20, axis: 'x', range: 130, speed: 1.4, phase: 0 },
      { type: 'moving',  x: 1110, y: 210, width: 90,  height: 20, axis: 'y', range: 70,  speed: 2.0, phase: 1 },
      { type: 'moving',  x: 1290, y: 270, width: 100, height: 20, axis: 'x', range: 110, speed: 1.8, phase: 2 },
      { type: 'normal',  x: 1470, y: 340, width: 260, height: 20 },
      // S3: Crumbling platforms
      { type: 'crumble', x: 1700, y: 290, width: 100, height: 20 },
      { type: 'crumble', x: 1870, y: 240, width: 90,  height: 20 },
      { type: 'crumble', x: 2030, y: 190, width: 80,  height: 20 },
      { type: 'crumble', x: 2180, y: 250, width: 90,  height: 20 },
      { type: 'normal',  x: 2340, y: 320, width: 260, height: 20 },
      // S4: Spikes + bouncy
      { type: 'normal',  x: 2570, y: 380, width: 100, height: 20 },
      { type: 'bouncy',  x: 2740, y: 400, width: 90,  height: 20 },
      { type: 'normal',  x: 2920, y: 170, width: 130, height: 20 },
      // S5: Mix finale
      { type: 'moving',  x: 3120, y: 230, width: 90,  height: 20, axis: 'x', range: 90,  speed: 2.5, phase: 0.5 },
      { type: 'crumble', x: 3280, y: 170, width: 80,  height: 20 },
      { type: 'moving',  x: 3420, y: 200, width: 100, height: 20, axis: 'y', range: 55,  speed: 2.8, phase: 1.5 },
      // Finish
      { type: 'normal',  x: 3550, y: 260, width: 300, height: 20, isFinish: true },
    ],
    spikes: [
      { x: 330,  y: 383, width: 65,  height: 17 },
      { x: 662,  y: 345, width: 64,  height: 22 },
      { x: 832,  y: 330, width: 84,  height: 28 },
      { x: 1803, y: 270, width: 63,  height: 20 },
      { x: 1963, y: 218, width: 63,  height: 22 },
      { x: 2113, y: 168, width: 63,  height: 22 },
      { x: 2673, y: 375, width: 63,  height: 25 },
      { x: 2920, y: 153, width: 65,  height: 17 },
      { x: 3213, y: 215, width: 63,  height: 20 },
      { x: 3363, y: 175, width: 53,  height: 20 },
      { x: 3550, y: 243, width: 65,  height: 17 },
    ],
  },

  // ── Level 2: Moving focus (~4600px) ───────────────────────────────────────
  {
    startX: 60, startY: 400,
    finishX: 4600,
    checkpoints: [
      { x: 1660, y: 320 },  // rest ledge after S2 moving cluster
      { x: 3370, y: 175 },  // high platform after bouncy
    ],
    platforms: [
      // S1: Intro
      { type: 'normal',  x: -100, y: 440, width: 300, height: 20 },
      { type: 'normal',  x: 280,  y: 390, width: 120, height: 20 },
      { type: 'moving',  x: 500,  y: 350, width: 100, height: 20, axis: 'x', range: 90,  speed: 1.6, phase: 0 },
      { type: 'normal',  x: 700,  y: 300, width: 130, height: 20 },
      // S2: Moving cluster (faster than L1)
      { type: 'moving',  x: 920,  y: 280, width: 90,  height: 20, axis: 'x', range: 130, speed: 2.1, phase: 0 },
      { type: 'moving',  x: 1110, y: 240, width: 90,  height: 20, axis: 'y', range: 85,  speed: 2.3, phase: 1 },
      { type: 'moving',  x: 1300, y: 260, width: 90,  height: 20, axis: 'x', range: 115, speed: 1.9, phase: 2 },
      { type: 'moving',  x: 1490, y: 295, width: 85,  height: 20, axis: 'y', range: 95,  speed: 2.6, phase: 0.5 },
      { type: 'normal',  x: 1660, y: 320, width: 250, height: 20 },  // CP1 ledge
      // S3: Crumble + moving interleaved
      { type: 'crumble', x: 1900, y: 280, width: 90,  height: 20 },
      { type: 'moving',  x: 2060, y: 250, width: 85,  height: 20, axis: 'x', range: 100, speed: 2.0, phase: 0 },
      { type: 'crumble', x: 2245, y: 220, width: 85,  height: 20 },
      { type: 'moving',  x: 2410, y: 195, width: 85,  height: 20, axis: 'y', range: 65,  speed: 2.6, phase: 1 },
      { type: 'normal',  x: 2580, y: 260, width: 140, height: 20 },
      // S4: Wide gaps + bouncy launch
      { type: 'moving',  x: 2810, y: 300, width: 85,  height: 20, axis: 'x', range: 145, speed: 2.3, phase: 0 },
      { type: 'moving',  x: 3020, y: 255, width: 85,  height: 20, axis: 'y', range: 90,  speed: 2.9, phase: 0.5 },
      { type: 'bouncy',  x: 3200, y: 370, width: 85,  height: 20 },
      { type: 'normal',  x: 3370, y: 175, width: 230, height: 20 },  // CP2 high ledge
      // S5: Fast moving finale
      { type: 'moving',  x: 3590, y: 210, width: 75,  height: 20, axis: 'x', range: 125, speed: 3.1, phase: 0 },
      { type: 'crumble', x: 3800, y: 180, width: 75,  height: 20 },
      { type: 'moving',  x: 3950, y: 195, width: 75,  height: 20, axis: 'y', range: 70,  speed: 3.1, phase: 1 },
      { type: 'crumble', x: 4120, y: 160, width: 70,  height: 20 },
      { type: 'moving',  x: 4275, y: 185, width: 80,  height: 20, axis: 'x', range: 100, speed: 2.9, phase: 2 },
      { type: 'normal',  x: 4460, y: 255, width: 160, height: 20 },
      // Finish
      { type: 'normal',  x: 4600, y: 270, width: 300, height: 20, isFinish: true },
    ],
    spikes: [
      { x: 404,  y: 378, width: 92,  height: 22 },
      { x: 610,  y: 340, width: 86,  height: 22 },
      { x: 835,  y: 288, width: 81,  height: 22 },
      { x: 1993, y: 258, width: 63,  height: 22 },
      { x: 2148, y: 228, width: 93,  height: 22 },
      { x: 2330, y: 198, width: 75,  height: 22 },
      { x: 2724, y: 248, width: 81,  height: 22 },
      { x: 2909, y: 278, width: 107, height: 27 },
      { x: 3108, y: 333, width: 87,  height: 37 },
      { x: 3883, y: 163, width: 63,  height: 22 },
      { x: 4033, y: 163, width: 83,  height: 22 },
      { x: 4203, y: 143, width: 68,  height: 22 },
      { x: 4600, y: 253, width: 65,  height: 17 },
    ],
  },

  // ── Level 3: Crumble gauntlet (~5800px) ───────────────────────────────────
  {
    startX: 60, startY: 400,
    finishX: 5800,
    checkpoints: [
      { x: 1740, y: 290 },  // safe ledge after first crumble chains
      { x: 4030, y: 255 },  // safe ledge mid-level
    ],
    platforms: [
      // S1: Quick warmup into crumbles
      { type: 'normal',  x: -100, y: 440, width: 280, height: 20 },
      { type: 'normal',  x: 260,  y: 400, width: 110, height: 20 },
      { type: 'crumble', x: 450,  y: 360, width: 90,  height: 20 },
      { type: 'crumble', x: 610,  y: 320, width: 85,  height: 20 },
      { type: 'normal',  x: 775,  y: 270, width: 120, height: 20 },
      // S2: Long crumble chain
      { type: 'crumble', x: 975,  y: 270, width: 80,  height: 20 },
      { type: 'crumble', x: 1125, y: 240, width: 80,  height: 20 },
      { type: 'crumble', x: 1275, y: 210, width: 80,  height: 20 },
      { type: 'crumble', x: 1425, y: 240, width: 80,  height: 20 },
      { type: 'crumble', x: 1575, y: 270, width: 80,  height: 20 },
      { type: 'normal',  x: 1740, y: 290, width: 240, height: 20 },  // CP1 rest
      // S3: Moving + crumble mix
      { type: 'moving',  x: 1970, y: 265, width: 85,  height: 20, axis: 'x', range: 110, speed: 2.1, phase: 0 },
      { type: 'crumble', x: 2155, y: 235, width: 80,  height: 20 },
      { type: 'moving',  x: 2315, y: 205, width: 85,  height: 20, axis: 'y', range: 75,  speed: 2.6, phase: 0.5 },
      { type: 'crumble', x: 2490, y: 190, width: 80,  height: 20 },
      { type: 'moving',  x: 2650, y: 220, width: 85,  height: 20, axis: 'x', range: 115, speed: 2.3, phase: 1 },
      { type: 'normal',  x: 2850, y: 285, width: 140, height: 20 },
      // S4: Dense crumble with bouncy
      { type: 'crumble', x: 3070, y: 265, width: 80,  height: 20 },
      { type: 'crumble', x: 3220, y: 235, width: 80,  height: 20 },
      { type: 'bouncy',  x: 3370, y: 370, width: 85,  height: 20 },
      { type: 'normal',  x: 3530, y: 165, width: 125, height: 20 },
      { type: 'crumble', x: 3735, y: 175, width: 80,  height: 20 },
      { type: 'crumble', x: 3885, y: 200, width: 80,  height: 20 },
      { type: 'normal',  x: 4030, y: 255, width: 250, height: 20 },  // CP2
      // S5: Crumble gauntlet finale
      { type: 'crumble', x: 4270, y: 245, width: 75,  height: 20 },
      { type: 'crumble', x: 4415, y: 215, width: 75,  height: 20 },
      { type: 'crumble', x: 4560, y: 185, width: 75,  height: 20 },
      { type: 'moving',  x: 4715, y: 205, width: 80,  height: 20, axis: 'x', range: 120, speed: 2.9, phase: 0 },
      { type: 'crumble', x: 4905, y: 185, width: 75,  height: 20 },
      { type: 'crumble', x: 5050, y: 215, width: 75,  height: 20 },
      { type: 'moving',  x: 5205, y: 235, width: 80,  height: 20, axis: 'y', range: 80,  speed: 3.1, phase: 1 },
      { type: 'crumble', x: 5375, y: 205, width: 75,  height: 20 },
      { type: 'normal',  x: 5540, y: 260, width: 150, height: 20 },
      // Finish
      { type: 'normal',  x: 5800, y: 270, width: 300, height: 20, isFinish: true },
    ],
    spikes: [
      { x: 374,  y: 388, width: 72,  height: 22 },
      { x: 544,  y: 348, width: 62,  height: 22 },
      { x: 699,  y: 308, width: 72,  height: 22 },
      { x: 899,  y: 258, width: 72,  height: 22 },
      { x: 1058, y: 228, width: 63,  height: 22 },
      { x: 1208, y: 198, width: 63,  height: 22 },
      { x: 1358, y: 218, width: 63,  height: 22 },
      { x: 1508, y: 248, width: 63,  height: 22 },
      { x: 2055, y: 213, width: 96,  height: 27 },
      { x: 2240, y: 183, width: 71,  height: 27 },
      { x: 2400, y: 168, width: 86,  height: 27 },
      { x: 2575, y: 193, width: 71,  height: 27 },
      { x: 2769, y: 253, width: 77,  height: 27 },
      { x: 3000, y: 243, width: 66,  height: 27 },
      { x: 3155, y: 213, width: 61,  height: 27 },
      { x: 3530, y: 148, width: 65,  height: 17 },
      { x: 3659, y: 148, width: 72,  height: 27 },
      { x: 3818, y: 178, width: 63,  height: 27 },
      { x: 4348, y: 193, width: 63,  height: 27 },
      { x: 4493, y: 163, width: 63,  height: 27 },
      { x: 4638, y: 163, width: 73,  height: 27 },
      { x: 4828, y: 163, width: 73,  height: 27 },
      { x: 4983, y: 193, width: 63,  height: 27 },
      { x: 5128, y: 193, width: 73,  height: 27 },
      { x: 5293, y: 183, width: 78,  height: 27 },
      { x: 5463, y: 183, width: 73,  height: 27 },
      { x: 5800, y: 253, width: 65,  height: 17 },
    ],
  },

  // ── Level 4: Mixed chaos (~7000px) ────────────────────────────────────────
  {
    startX: 60, startY: 400,
    finishX: 7000,
    checkpoints: [
      { x: 2150, y: 290 },  // after S2 moving gauntlet
      { x: 4990, y: 265 },  // safe ledge mid-level
    ],
    platforms: [
      // S1: Immediate challenge
      { type: 'normal',  x: -100, y: 440, width: 270, height: 20 },
      { type: 'moving',  x: 255,  y: 400, width: 90,  height: 20, axis: 'x', range: 80,  speed: 2.1, phase: 0 },
      { type: 'crumble', x: 435,  y: 360, width: 85,  height: 20 },
      { type: 'moving',  x: 600,  y: 305, width: 85,  height: 20, axis: 'y', range: 75,  speed: 2.4, phase: 0.5 },
      { type: 'normal',  x: 770,  y: 265, width: 125, height: 20 },
      // S2: Moving gauntlet
      { type: 'moving',  x: 975,  y: 265, width: 85,  height: 20, axis: 'x', range: 130, speed: 2.5, phase: 0 },
      { type: 'moving',  x: 1165, y: 225, width: 85,  height: 20, axis: 'y', range: 85,  speed: 2.9, phase: 1 },
      { type: 'moving',  x: 1355, y: 245, width: 85,  height: 20, axis: 'x', range: 120, speed: 2.3, phase: 2 },
      { type: 'moving',  x: 1545, y: 205, width: 85,  height: 20, axis: 'y', range: 95,  speed: 3.1, phase: 0.5 },
      { type: 'bouncy',  x: 1730, y: 375, width: 85,  height: 20 },
      { type: 'normal',  x: 1910, y: 165, width: 130, height: 20 },
      { type: 'normal',  x: 2120, y: 290, width: 250, height: 20 },  // CP1
      // S3: Crumble chains
      { type: 'crumble', x: 2360, y: 270, width: 80,  height: 20 },
      { type: 'crumble', x: 2510, y: 240, width: 80,  height: 20 },
      { type: 'crumble', x: 2660, y: 210, width: 80,  height: 20 },
      { type: 'moving',  x: 2820, y: 230, width: 85,  height: 20, axis: 'x', range: 105, speed: 2.6, phase: 0 },
      { type: 'crumble', x: 3005, y: 200, width: 80,  height: 20 },
      { type: 'crumble', x: 3155, y: 230, width: 80,  height: 20 },
      { type: 'normal',  x: 3325, y: 280, width: 135, height: 20 },
      // S4: All types mixed
      { type: 'moving',  x: 3540, y: 270, width: 80,  height: 20, axis: 'x', range: 120, speed: 2.9, phase: 0 },
      { type: 'crumble', x: 3730, y: 240, width: 75,  height: 20 },
      { type: 'moving',  x: 3885, y: 200, width: 80,  height: 20, axis: 'y', range: 80,  speed: 3.1, phase: 1 },
      { type: 'bouncy',  x: 4070, y: 375, width: 85,  height: 20 },
      { type: 'crumble', x: 4250, y: 165, width: 75,  height: 20 },
      { type: 'moving',  x: 4405, y: 190, width: 80,  height: 20, axis: 'x', range: 110, speed: 3.3, phase: 0.5 },
      { type: 'normal',  x: 4600, y: 260, width: 155, height: 20 },
      { type: 'crumble', x: 4840, y: 260, width: 75,  height: 20 },
      { type: 'normal',  x: 4990, y: 265, width: 255, height: 20 },  // CP2
      // S5: Final sprint
      { type: 'moving',  x: 5230, y: 260, width: 80,  height: 20, axis: 'x', range: 130, speed: 3.1, phase: 0 },
      { type: 'crumble', x: 5425, y: 230, width: 75,  height: 20 },
      { type: 'moving',  x: 5575, y: 200, width: 80,  height: 20, axis: 'y', range: 80,  speed: 3.3, phase: 1 },
      { type: 'crumble', x: 5745, y: 220, width: 75,  height: 20 },
      { type: 'moving',  x: 5905, y: 240, width: 80,  height: 20, axis: 'x', range: 120, speed: 2.9, phase: 2 },
      { type: 'crumble', x: 6095, y: 210, width: 75,  height: 20 },
      { type: 'moving',  x: 6250, y: 230, width: 80,  height: 20, axis: 'y', range: 75,  speed: 3.5, phase: 0.5 },
      { type: 'normal',  x: 6430, y: 275, width: 130, height: 20 },
      { type: 'crumble', x: 6640, y: 245, width: 75,  height: 20 },
      { type: 'normal',  x: 6795, y: 265, width: 150, height: 20 },
      // Finish
      { type: 'normal',  x: 7000, y: 275, width: 300, height: 20, isFinish: true },
    ],
    spikes: [
      { x: 350,  y: 388, width: 81,  height: 27 },
      { x: 525,  y: 340, width: 71,  height: 25 },
      { x: 690,  y: 283, width: 76,  height: 27 },
      { x: 900,  y: 253, width: 71,  height: 22 },
      { x: 1055, y: 243, width: 106, height: 22 },
      { x: 1245, y: 223, width: 106, height: 22 },
      { x: 1440, y: 183, width: 101, height: 27 },
      { x: 1633, y: 343, width: 93,  height: 37 },
      { x: 1910, y: 148, width: 65,  height: 17 },
      { x: 2420, y: 218, width: 86,  height: 27 },
      { x: 2570, y: 188, width: 86,  height: 27 },
      { x: 2740, y: 208, width: 76,  height: 27 },
      { x: 2910, y: 178, width: 91,  height: 27 },
      { x: 3090, y: 208, width: 61,  height: 27 },
      { x: 3240, y: 208, width: 81,  height: 27 },
      { x: 3462, y: 248, width: 74,  height: 32 },
      { x: 3655, y: 218, width: 71,  height: 27 },
      { x: 3810, y: 178, width: 71,  height: 27 },
      { x: 3993, y: 343, width: 73,  height: 37 },
      { x: 4170, y: 143, width: 76,  height: 27 },
      { x: 4330, y: 168, width: 71,  height: 27 },
      { x: 4520, y: 238, width: 76,  height: 27 },
      { x: 4760, y: 238, width: 76,  height: 27 },
      { x: 5348, y: 208, width: 73,  height: 27 },
      { x: 5498, y: 178, width: 73,  height: 27 },
      { x: 5668, y: 198, width: 73,  height: 27 },
      { x: 5828, y: 218, width: 73,  height: 27 },
      { x: 6018, y: 188, width: 73,  height: 27 },
      { x: 6173, y: 208, width: 73,  height: 27 },
      { x: 6353, y: 253, width: 73,  height: 27 },
      { x: 6563, y: 223, width: 73,  height: 27 },
      { x: 6718, y: 243, width: 73,  height: 27 },
      { x: 7000, y: 258, width: 65,  height: 17 },
    ],
  },
];

// ─── Active level state ───────────────────────────────────────────────────────
let platforms   = [];
let spikes      = [];
let checkpoints = [];
let FINISH_X    = 0;

const gameState = {
  level:      0,
  lives:      3,
  checkpoint: -1,        // index into checkpoints[] (-1 = none reached yet)
  phase:      'playing', // 'playing' | 'levelComplete' | 'allDone'
  phaseTimer: 0,
  cpFlash:    0,         // countdown frames for "Checkpoint!" flash text
  failCount:  0,         // game-overs on current level; 3 → back to Level 1
};

function loadLevel(index) {
  const levelChanged   = index !== gameState.level;
  gameState.level      = index;
  gameState.checkpoint = -1;
  gameState.phase      = 'playing';
  gameState.phaseTimer = 0;
  gameState.cpFlash    = 0;
  if (levelChanged) gameState.failCount = 0;

  const lvl = LEVELS[index];
  FINISH_X = lvl.finishX;

  // Deep-copy so crumble/moving state never bleeds between resets
  platforms   = lvl.platforms.map(p => ({ ...p }));
  spikes      = lvl.spikes.map(s => ({ ...s }));
  checkpoints = lvl.checkpoints.map(cp => ({ ...cp, reached: false }));

  // Init platform state
  for (const p of platforms) {
    if (p.type === 'moving') {
      p.ox = p.x;
      p.oy = p.y;
      p.dx = 0;
      p.dy = 0;
    }
    if (p.type === 'crumble') {
      p.crumbleState = 'solid';
      p.crumbleTimer = 0;
      p.fallVy       = 0;
      p._origY       = p.y;
    }
  }

  // Reset player to level start
  player.x         = lvl.startX;
  player.y         = lvl.startY;
  player.vx        = 0;
  player.vy        = 0;
  player.jumpsLeft = MAX_JUMPS;
  player.onGround  = false;
  player.finished  = false;
  player.runTimer  = 0;
  player.runAlt    = false;
  camera.x         = 0;
  camera.y         = lvl.startY - canvas.height * 0.55;
  particles.length = 0;
}

// ─── Platform logic ───────────────────────────────────────────────────────────
function updatePlatforms() {
  const t = Date.now() / 1000;
  for (const p of platforms) {
    if (p.type === 'moving') {
      const prevX = p.x;
      const prevY = p.y;
      if (p.axis === 'x') {
        p.x = p.ox + Math.sin(t * p.speed + p.phase) * p.range;
      } else {
        p.y = p.oy + Math.sin(t * p.speed + p.phase) * p.range;
      }
      p.dx = p.x - prevX;
      p.dy = p.y - prevY;
    }

    if (p.type === 'crumble') {
      if (p.crumbleState === 'shaking') {
        p.crumbleTimer--;
        if (p.crumbleTimer <= 0) {
          p.crumbleState = 'falling';
          p.fallVy = 0;
        }
      }
      if (p.crumbleState === 'falling') {
        p.fallVy += 0.6;
        p.y += p.fallVy;
      }
    }
  }
}

// ─── Camera ──────────────────────────────────────────────────────────────────
const camera = { x: 0, y: 0 };

function updateCamera() {
  const targetX = player.x - canvas.width * 0.35;
  camera.x += (targetX - camera.x) * 0.1;
  if (camera.x < -80) camera.x = -80;

  // Vertical: keep player at ~55% down; lookahead on vy so the camera leads jumps
  const targetY = (player.y + player.vy * 6) - canvas.height * 0.55;
  camera.y += (targetY - camera.y) * 0.12;
}

// ─── Player ──────────────────────────────────────────────────────────────────
const player = {
  x: 60,
  y: 380,
  width:  28,
  height: 36,
  vx: 0,
  vy: 0,
  jumpsLeft: MAX_JUMPS,
  onGround: false,
  facingRight: true,
  finished: false,
  invincible: 0,
  runTimer: 0,
  runAlt: false,

  jump() {
    if (this.jumpsLeft <= 0) return;
    const isAirJump = !this.onGround;
    this.vy = JUMP_FORCE;
    this.jumpsLeft--;
    const color = isAirJump ? '#f59e0b' : '#818cf8';
    spawnParticles(this.x + this.width / 2, this.y + this.height, color);
  },

  update() {
    if (this.finished) return;

    // Horizontal input
    const left  = keys['ArrowLeft']  || keys['KeyA'];
    const right = keys['ArrowRight'] || keys['KeyD'];
    if (left)  { this.vx = -MOVE_SPEED; this.facingRight = false; }
    if (right) { this.vx =  MOVE_SPEED; this.facingRight = true;  }
    if (!left && !right) { this.vx *= FRICTION; this.runTimer = 0; this.runAlt = false; }

    // Animate run frames: alternate every 10 ticks while moving on ground
    if (this.onGround && Math.abs(this.vx) > 1) {
      this.runTimer++;
      if (this.runTimer >= 10) { this.runTimer = 0; this.runAlt = !this.runAlt; }
    }

    // Gravity
    this.vy += GRAVITY;

    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Platform collision
    this.onGround = false;
    for (const p of platforms) {
      if (p.type === 'crumble' && p.crumbleState === 'falling') continue;

      const prevBottom = this.y + this.height - this.vy;
      const overlapX   = this.x + this.width > p.x && this.x < p.x + p.width;

      if (overlapX && prevBottom <= p.y + 2 && this.y + this.height >= p.y) {
        this.y = p.y - this.height;
        this.onGround = true;

        if (p.type === 'bouncy') {
          this.vy = BOUNCE_FORCE;
          spawnParticles(this.x + this.width / 2, this.y + this.height, '#10b981', 12);
        } else {
          this.vy = 0;
          this.jumpsLeft = MAX_JUMPS;
        }

        if (p.type === 'moving') {
          this.x += p.dx;
          this.y += p.dy;
        }

        if (p.type === 'crumble' && p.crumbleState === 'solid') {
          p.crumbleState = 'shaking';
          p.crumbleTimer = 45; // ~0.75s at 60fps
        }
      }
    }

    // Checkpoint detection
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (!cp.reached && this.x + this.width >= cp.x) {
        cp.reached = true;
        gameState.checkpoint = i;
        gameState.cpFlash    = 90;
        spawnParticles(cp.x, cp.y, '#fbbf24', 20);
      }
    }

    // Tick down invulnerability
    if (this.invincible > 0) this.invincible--;

    // Spike collision → death (skip while invincible)
    if (this.invincible <= 0) {
      for (const s of spikes) {
        if (
          this.x + this.width  > s.x &&
          this.x               < s.x + s.width &&
          this.y + this.height > s.y &&
          this.y               < s.y + s.height
        ) {
          handleDeath();
          return;
        }
      }
    }

    // Fell off the world → death
    if (this.y > canvas.height + 150) {
      handleDeath();
      return;
    }

    // Reached finish
    if (this.x >= FINISH_X + 50 && !this.finished) {
      this.finished        = true;
      gameState.phase      = 'levelComplete';
      gameState.phaseTimer = 120; // 2 seconds at 60fps
    }
  },

  draw() {
    const px = Math.round(this.x - camera.x);
    const py = Math.round(this.y - camera.y);
    const w  = this.width;
    const h  = this.height;

    // Choose pose
    let frame;
    if (!this.onGround) {
      if (this.vy < -5)      frame = FRAMES.jump_l; // rising strongly → launch
      else if (this.vy < 5)  frame = FRAMES.jump;   // wide apex window
      else                   frame = FRAMES.jump_f;  // clearly falling
    } else if (Math.abs(this.vx) > 1) {
      frame = this.runAlt ? FRAMES.run2 : FRAMES.run;
    } else {
      frame = FRAMES.land;
    }

    // Scale sprite to fit visually (height = 2.2× collision box, adjusted per frame)
    const drawH = Math.round(h * 2.2 * frame.scale);
    const drawW = Math.round(frame.sw / frame.sh * drawH);
    // Bottom-align to player feet, horizontally centered on collision box
    const drawX = px + (w - drawW) / 2;
    const drawY = py + h - drawH;

    // Flash while invincible (blink every 6 frames)
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) return;

    if (avatar.complete) {
      ctx.save();
      if (!this.facingRight) {
        ctx.translate(drawX + drawW / 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(avatar, frame.sx, frame.sy, frame.sw, frame.sh, -drawW / 2, drawY, drawW, drawH);
      } else {
        ctx.drawImage(avatar, frame.sx, frame.sy, frame.sw, frame.sh, drawX, drawY, drawW, drawH);
      }
      ctx.restore();
    }

    // Jump dots – anchored to the tallest frame's visual top so position never shifts between states
    const dotSpacing = 11;
    const startDotX  = px + w / 2 - (MAX_JUMPS * dotSpacing) / 2 + 2;
    const spriteTopY = py + h - Math.round(h * 2.2); // top of the tallest (run/jump) frame
    const dotY       = spriteTopY - 10;
    for (let i = 0; i < MAX_JUMPS; i++) {
      ctx.fillStyle = i < this.jumpsLeft ? '#f59e0b' : '#374151';
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

// ─── Death & respawn ──────────────────────────────────────────────────────────
function handleDeath() {
  spawnParticles(player.x + player.width / 2, player.y + player.height / 2, '#ef4444', 14);
  gameState.lives--;

  if (gameState.lives <= 0) {
    // Game over
    gameState.lives = 3;
    gameState.failCount++;
    if (gameState.failCount >= 3 && gameState.level > 0) {
      // 3 failures on this level → back to Level 1
      gameState.failCount = 0;
      loadLevel(0);
    } else {
      loadLevel(gameState.level);
    }
  } else if (gameState.checkpoint >= 0) {
    // Respawn at last reached checkpoint
    respawnAtCheckpoint();
  } else {
    // No checkpoint yet → back to level start
    loadLevel(gameState.level);
  }
}

function respawnAtCheckpoint() {
  const cp = checkpoints[gameState.checkpoint];
  player.x         = cp.x + 10;
  player.y         = cp.y - player.height;
  player.vx        = 0;
  player.vy        = 0;
  player.jumpsLeft  = MAX_JUMPS;
  player.onGround   = false;
  player.finished   = false;
  player.invincible = 90;  // ~1.5s grace period after respawn
  camera.x          = player.x - canvas.width * 0.35;
  camera.y          = player.y - canvas.height * 0.55;
  particles.length = 0;

  // Reset crumble platforms that are before this checkpoint
  for (const p of platforms) {
    if (p.type === 'crumble' && p.x < cp.x) {
      p.crumbleState = 'solid';
      p.crumbleTimer = 0;
      p.fallVy       = 0;
      p.y            = p._origY;
    }
  }
}

// ─── Input ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat) {
    if (gameState.phase === 'playing') player.jump();
  }
  if (e.code === 'KeyR') {
    gameState.lives = 3;
    loadLevel(gameState.level);
  }
  if (e.code === 'KeyM') music.toggle();
  if (e.code === 'KeyN') music.nextTrack();
});

// ─── Background ──────────────────────────────────────────────────────────────
const starLayers = [
  { stars: Array.from({ length: 60 }, () => ({ x: Math.random() * 4000, y: Math.random() * 540 })), speed: 0.1,  size: 1   },
  { stars: Array.from({ length: 30 }, () => ({ x: Math.random() * 4000, y: Math.random() * 400 })), speed: 0.25, size: 1.5 },
];

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0,   '#06060f');
  grad.addColorStop(0.6, '#0d0d1f');
  grad.addColorStop(1,   '#111128');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const layer of starLayers) {
    for (const s of layer.stars) {
      const sx = ((s.x - camera.x * layer.speed) % canvas.width + canvas.width) % canvas.width;
      ctx.fillRect(sx, s.y, layer.size, layer.size);
    }
  }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawSpikeRow(sx, sy, width, height) {
  const tipH  = height;
  const count = Math.floor(width / 14);
  const tipW  = width / count;

  ctx.fillStyle   = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur  = 6;

  for (let i = 0; i < count; i++) {
    const bx = sx + i * tipW;
    ctx.beginPath();
    ctx.moveTo(bx, sy + tipH);
    ctx.lineTo(bx + tipW / 2, sy);
    ctx.lineTo(bx + tipW, sy + tipH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawCheckpoints() {
  for (const cp of checkpoints) {
    const cx = cp.x - camera.x;
    const cy = cp.y - camera.y;
    if (cx < -30 || cx > canvas.width + 30) continue;

    const poleH = 52;
    const poleW = 4;

    // Pole
    ctx.fillStyle = cp.reached ? '#fbbf24' : '#4b5563';
    if (cp.reached) { ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 12; }
    ctx.fillRect(cx - poleW / 2, cy - poleH, poleW, poleH);
    ctx.shadowBlur = 0;

    // Triangular flag pointing right
    ctx.fillStyle = cp.reached ? '#fbbf24' : '#4b5563';
    if (cp.reached) { ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8; }
    ctx.beginPath();
    ctx.moveTo(cx + poleW / 2,      cy - poleH);
    ctx.lineTo(cx + poleW / 2 + 20, cy - poleH + 11);
    ctx.lineTo(cx + poleW / 2,      cy - poleH + 22);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    let shakeX = 0;
    let shakeY = 0;
    if (p.type === 'crumble' && p.crumbleState === 'shaking') {
      shakeX = (Math.random() - 0.5) * 4;
      shakeY = (Math.random() - 0.5) * 2;
    }
    if (p.type === 'crumble' && p.crumbleState === 'falling' && p.y - camera.y > canvas.height + 40) continue;

    const sx = p.x - camera.x + shakeX;
    const sy = p.y - camera.y + shakeY;

    if (sx + p.width < 0 || sx > canvas.width) continue;

    const colors = {
      normal:  { base: '#1e1b4b', top: '#4f46e5' },
      moving:  { base: '#1a2e1a', top: '#22c55e' },
      crumble: { base: '#3b1f1f', top: '#f97316' },
      bouncy:  { base: '#1a2535', top: '#06b6d4' },
    };
    const c = p.isFinish ? { base: '#064e3b', top: '#10b981' } : (colors[p.type] || colors.normal);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(sx + 4, sy + 4, p.width, p.height);

    ctx.fillStyle = c.base;
    ctx.fillRect(sx, sy, p.width, p.height);

    ctx.shadowColor = c.top;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = c.top;
    ctx.fillRect(sx, sy, p.width, 3);
    ctx.shadowBlur  = 0;

    if (p.type === 'bouncy') {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth   = 2;
      const midX = sx + p.width / 2;
      ctx.beginPath(); ctx.moveTo(midX - 10, sy + 8); ctx.lineTo(midX - 5, sy + 14); ctx.lineTo(midX, sy + 8); ctx.lineTo(midX + 5, sy + 14); ctx.lineTo(midX + 10, sy + 8); ctx.stroke();
    }

    if (p.type === 'crumble' && p.crumbleState === 'shaking') {
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + 20, sy); ctx.lineTo(sx + 25, sy + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + p.width - 20, sy); ctx.lineTo(sx + p.width - 28, sy + 20); ctx.stroke();
    }

    if (p.isFinish) {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('FINISH', sx + p.width / 2 - 28, sy - 10);
    }
  }
}

function drawSpikes() {
  for (const s of spikes) {
    const sx = s.x - camera.x;
    const sy = s.y - camera.y;
    if (sx + s.width < 0 || sx > canvas.width) continue;
    drawSpikeRow(sx, sy, s.width, s.height);
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD() {
  // Bottom hint bar
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = '13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Move: A/D or ←/→  |  Jump: Space/W/↑  |  Restart: R  |  M: Mute', 12, canvas.height - 12);

  if (music.isMuted()) {
    ctx.fillStyle = 'rgba(239,68,68,0.85)';
    ctx.font      = 'bold 13px monospace';
    ctx.fillText('[MUTED]', canvas.width - 75, canvas.height - 12);
  }

  // Lives (top left) – heart icons
  ctx.font = 'bold 18px monospace';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < gameState.lives ? '#ef4444' : '#374151';
    ctx.fillText('♥', 12 + i * 24, 28);
  }

  // Level indicator (top center)
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font      = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${gameState.level + 1} / ${LEVELS.length}`, canvas.width / 2, 24);
  ctx.textAlign = 'left';

  // Checkpoint flash text
  if (gameState.cpFlash > 0) {
    const alpha     = Math.min(1, gameState.cpFlash / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#fbbf24';
    ctx.font        = 'bold 22px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('Checkpoint!', canvas.width / 2, canvas.height / 2 - 80);
    ctx.textAlign   = 'left';
    ctx.globalAlpha = 1;
    gameState.cpFlash--;
  }

  // Platform type legend (top right)
  const legend = [
    { color: '#4f46e5', label: 'Normal' },
    { color: '#22c55e', label: 'Moving' },
    { color: '#f97316', label: 'Crumbles' },
    { color: '#06b6d4', label: 'Bouncy' },
    { color: '#ef4444', label: 'Spikes' },
  ];
  let lx = canvas.width - 10;
  ctx.font = '12px monospace';
  for (let i = legend.length - 1; i >= 0; i--) {
    const item  = legend[i];
    const textW = ctx.measureText(item.label).width;
    lx -= textW + 22;
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, 10, 12, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(item.label, lx + 16, 21);
  }
}

function drawLevelCompleteScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle   = '#10b981';
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur  = 20;
  ctx.font        = 'bold 48px monospace';
  ctx.textAlign   = 'center';
  ctx.fillText('LEVEL COMPLETE!', canvas.width / 2, canvas.height / 2 - 20);
  ctx.shadowBlur  = 0;

  if (gameState.level + 1 < LEVELS.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font      = '20px monospace';
    ctx.fillText(`Loading Level ${gameState.level + 2}…`, canvas.width / 2, canvas.height / 2 + 34);
  }
  ctx.textAlign = 'left';
}

function drawAllDoneScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle   = '#f59e0b';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur  = 30;
  ctx.font        = 'bold 52px monospace';
  ctx.textAlign   = 'center';
  ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 40);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font      = '20px monospace';
  ctx.fillText('All levels complete!', canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = '16px monospace';
  ctx.fillText('Press R to play again from Level 1', canvas.width / 2, canvas.height / 2 + 52);
  ctx.textAlign = 'left';
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function gameLoop() {
  updatePlatforms();
  if (gameState.phase === 'playing') {
    player.update();
  }
  updateCamera();
  updateParticles();

  drawBackground();
  drawCheckpoints();
  drawSpikes();
  drawPlatforms();
  drawParticles();
  player.draw();
  drawHUD();

  if (gameState.phase === 'levelComplete') {
    drawLevelCompleteScreen();
    gameState.phaseTimer--;
    if (gameState.phaseTimer <= 0) {
      if (gameState.level + 1 < LEVELS.length) {
        gameState.lives = 3;
        loadLevel(gameState.level + 1);
      } else {
        gameState.phase = 'allDone';
      }
    }
  }

  if (gameState.phase === 'allDone') {
    drawAllDoneScreen();
  }

  requestAnimationFrame(gameLoop);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
loadLevel(0);

// ─── Music ───────────────────────────────────────────────────────────────────
const music = (function () {
  let actx = null;
  let masterGain = null;
  let nextTime = 0;
  let step = 0;
  let songIdx = 0;
  let pendingSwitch = false;

  const hz = n => 440 * 2 ** ((n - 69) / 12);

  const SONGS = [
    {
      // C minor pentatonic — driving parkour energy
      name: 'Rooftop Run', bpm: 138,
      mel: [
        hz(67), null,   hz(70), hz(72),  hz(75), null,   hz(72), hz(70),
        hz(67), hz(65), hz(63), null,    hz(65), null,   hz(67), null,
        hz(72), null,   hz(70), hz(67),  hz(65), hz(63), hz(65), null,
        hz(67), null,   hz(70), null,    hz(72), hz(70), hz(67), null,
      ],
      bass: [
        hz(48), hz(48), hz(55), hz(58),
        hz(53), hz(53), hz(51), hz(55),
        hz(48), hz(55), hz(53), hz(51),
        hz(53), hz(48), hz(55), hz(55),
      ],
    },
    {
      // D major pentatonic — bright and upbeat
      name: 'Sky High', bpm: 120,
      mel: [
        hz(74), null,   hz(71), hz(69),  hz(66), null,   hz(69), hz(71),
        hz(74), hz(76), hz(74), hz(71),  hz(69), null,   hz(66), null,
        hz(76), null,   hz(74), hz(71),  hz(69), hz(66), hz(69), null,
        hz(71), null,   hz(74), null,    hz(76), hz(74), hz(71), null,
      ],
      bass: [
        hz(50), hz(50), hz(57), hz(54),
        hz(59), hz(59), hz(52), hz(57),
        hz(50), hz(57), hz(54), hz(59),
        hz(52), hz(50), hz(57), hz(57),
      ],
    },
    {
      // F minor pentatonic — fast and intense
      name: 'Speed Demon', bpm: 165,
      mel: [
        hz(77), hz(75), hz(72), hz(70),  hz(65), hz(68), hz(70), hz(72),
        hz(75), null,   hz(72), hz(70),  hz(68), hz(65), hz(68), null,
        hz(72), hz(70), hz(68), hz(65),  hz(68), hz(70), hz(72), hz(75),
        hz(77), hz(75), hz(72), null,    hz(70), hz(68), hz(65), null,
      ],
      bass: [
        hz(53), hz(53), hz(60), hz(58),
        hz(56), hz(56), hz(63), hz(60),
        hz(53), hz(60), hz(58), hz(56),
        hz(63), hz(53), hz(60), hz(60),
      ],
    },
    {
      // E minor pentatonic — slow and atmospheric
      name: 'Moonlit', bpm: 100,
      mel: [
        hz(71), null,   null,   hz(67),  hz(64), null,   hz(74), null,
        hz(71), null,   hz(69), null,    hz(67), null,   null,   hz(64),
        hz(74), null,   null,   hz(71),  hz(69), hz(67), null,   hz(64),
        hz(67), null,   hz(71), null,    hz(74), null,   hz(71), null,
      ],
      bass: [
        hz(52), hz(52), hz(59), hz(55),
        hz(57), hz(57), hz(62), hz(59),
        hz(52), hz(59), hz(57), hz(55),
        hz(62), hz(52), hz(59), hz(59),
      ],
    },
  ];

  function tone(freq, start, dur, type, vol) {
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.connect(env); env.connect(masterGain);
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(vol, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.start(start); osc.stop(start + dur + 0.01);
  }

  function noise(start, dur, cutoff, vol) {
    const len = Math.ceil(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    const flt = actx.createBiquadFilter();
    const env = actx.createGain();
    flt.type = 'highpass'; flt.frequency.value = cutoff;
    src.buffer = buf;
    src.connect(flt); flt.connect(env); env.connect(masterGain);
    env.gain.setValueAtTime(vol, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.start(start); src.stop(start + dur + 0.01);
  }

  function schedule() {
    if (!actx) return;
    if (pendingSwitch) {
      nextTime = actx.currentTime + 0.05;
      step = 0;
      pendingSwitch = false;
    }
    const song = SONGS[songIdx];
    const S = 60 / song.bpm / 2;
    while (nextTime < actx.currentTime + 0.25) {
      const t  = nextTime;
      const i  = step % 32;
      const bi = step % 8;

      if (song.mel[i]) tone(song.mel[i], t, S * 0.75, 'square', 0.13);
      if (i % 2 === 0) tone(song.bass[i >> 1], t, S * 1.5, 'sawtooth', 0.09);

      if (bi === 0 || bi === 4) {
        const osc = actx.createOscillator();
        const env = actx.createGain();
        osc.connect(env); env.connect(masterGain);
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        env.gain.setValueAtTime(0.6, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
      }
      if (bi === 2 || bi === 6) noise(t, 0.12, 1500, 0.2);
      if (i % 2 === 1) noise(t, 0.03, 8000, 0.05);

      step++;
      nextTime += S;
    }
  }

  function init() {
    if (actx) return;
    actx = new (window.AudioContext || window['webkitAudioContext'])();
    const comp = actx.createDynamicsCompressor();
    comp.connect(actx.destination);
    masterGain = actx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(comp);
    nextTime = actx.currentTime + 0.1;
    setInterval(schedule, 50);
  }

  let muted = false;
  function toggle() {
    init();
    if (!actx) return;
    muted = !muted;
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, actx.currentTime, 0.05);
  }

  function nextTrack() {
    songIdx = (songIdx + 1) % SONGS.length;
    pendingSwitch = true;
    init();
  }

  document.addEventListener('keydown', init, { once: true });
  return { toggle, nextTrack, isMuted: () => muted, trackName: () => SONGS[songIdx].name };
})();

const muteBtn      = document.getElementById('muteBtn');
const nextTrackBtn = document.getElementById('nextTrackBtn');
const trackNameEl  = document.getElementById('trackName');

function syncMusicUI() {
  muteBtn.textContent = music.isMuted() ? '♪ OFF' : '♪ ON';
  muteBtn.classList.toggle('muted', music.isMuted());
  trackNameEl.textContent = music.trackName();
}

muteBtn.addEventListener('click', () => { music.toggle(); syncMusicUI(); });
nextTrackBtn.addEventListener('click', () => { music.nextTrack(); syncMusicUI(); });

const _origToggle    = music.toggle.bind(music);
const _origNextTrack = music.nextTrack.bind(music);
music.toggle    = () => { _origToggle();    syncMusicUI(); };
music.nextTrack = () => { _origNextTrack(); syncMusicUI(); };

gameLoop();
