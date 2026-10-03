// Procedural texture generation (canvas-based) so we don't need external art assets yet.
// Every texture here is generated at runtime and can be swapped for real textures later
// without touching any other code — just replace the function body.
import * as THREE from 'three';

function makeCanvas(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function noise(ctx, size, amount, alpha = 0.06) {
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
}

// Tree bark for the treeline "walls" -- irregular vertical ridges (each one a
// jittered polyline, not a straight repeat) plus a few dark knots. Used on
// trunks and, tinted per-room via material.color, on the low hedge strip that
// fills the gaps between them (see Facility._wall).
export function wallTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a3a24';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    let x = Math.random() * size;
    const shade = 0.15 + Math.random() * 0.35;
    ctx.strokeStyle = `rgba(20,14,6,${shade})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = size / 8; y <= size; y += size / 8) {
      x += (Math.random() - 0.5) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // knots
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 14;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(15,10,4,0.6)');
    grad.addColorStop(1, 'rgba(15,10,4,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, size, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Forest floor: mossy grass/dirt blotches (radial gradients, not a tile grid)
// plus scattered leaf-litter flecks.
export function floorTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5c6e3a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 14 + Math.random() * 40;
    const dirt = Math.random() < 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, dirt ? 'rgba(70,55,30,0.35)' : 'rgba(90,110,50,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,40,0.5)' : 'rgba(60,80,35,0.5)';
    ctx.fillRect(x, y, 2 + Math.random() * 2, 1 + Math.random());
  }

  noise(ctx, size, 12);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

// Leaf canopy overhead, replacing the old ceiling tile: dense overlapping leaf
// blotches plus a couple of brighter gaps where daylight filters through. No
// literal fixture baked in -- the lanterns in LIGHTS get their own meshes now
// (Facility._buildLights), so the canopy itself stays a plain texture.
export function ceilingTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d5a2a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 12 + Math.random() * 30;
    const shade = 0.5 + Math.random() * 0.5;
    const rr = (40 + shade * 30) | 0;
    const gg = (70 + shade * 40) | 0;
    const bb = (25 + shade * 20) | 0;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rr},${gg},${bb},0.5)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 2; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 10 + Math.random() * 16;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(220,225,180,0.35)');
    grad.addColorStop(1, 'rgba(220,225,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, size, 10);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// The chapter-2 reveal: cold institutional concrete, the opposite of every
// bark/leaf texture above. Used only for the arena + corr3 (Facility.js's
// chapter===2 branch) -- the point where the "forest" turns out to have been
// corridors all along, so this needs to read as unmistakably built.
export function facilityWallTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7a828c';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(30,34,38,0.4)';
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += size / 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 15 + Math.random() * 40;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(20,24,28,0.3)');
    grad.addColorStop(1, 'rgba(20,24,28,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, size, 12);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Grey tile, chapter-2 counterpart to floorTexture's grass.
export function facilityFloorTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, size, size);

  const tile = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const shade = 4 + Math.random() * 8;
      ctx.fillStyle = `rgba(0,0,0,${shade / 100})`;
      ctx.fillRect(x * tile, y * tile, tile, tile);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.strokeRect(x * tile, y * tile, tile, tile);
    }
  }

  noise(ctx, size, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

// Fluorescent ceiling tile, chapter-2 counterpart to ceilingTexture's canopy.
export function facilityCeilingTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c7cdd2';
  ctx.fillRect(0, 0, size, size);

  const tile = size / 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tile, 0);
    ctx.lineTo(i * tile, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * tile);
    ctx.lineTo(size, i * tile);
    ctx.stroke();
  }

  ctx.fillStyle = '#f2f6ff';
  ctx.fillRect(tile * 1.2, tile * 1.2, tile * 1.6, tile * 1.6 * 0.4);

  noise(ctx, size, 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// Furry skin: short directional strokes instead of pure noise, so it reads as
// combed fur rather than static. Darker root -> lighter tip on each stroke.
export function furTexture(baseColor = '#7a6b55') {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const base = new THREE.Color(baseColor);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 6;
    const drift = (Math.random() - 0.5) * 2;
    const shade = 0.6 + Math.random() * 0.7; // darker or lighter than base
    const c = base.clone().multiplyScalar(shade);
    ctx.strokeStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + drift, y + len);
    ctx.stroke();
  }
  noise(ctx, size, 10, 0.1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Sick, scarred flesh for the facility's failed experiments (Mutant, Doppelganger):
// mottled blotches, dark vein cracks, and a couple of raw wound patches that get
// tinted emissive in the material so they read as glowing seams in the dark.
export function organicTexture(baseColor = '#7a5a5a') {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const base = new THREE.Color(baseColor);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 10 + Math.random() * 30;
    const shade = 0.55 + Math.random() * 0.5;
    const c = base.clone().multiplyScalar(shade);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.5)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // branching vein cracks -- these get lit up by the material's emissive map role
  ctx.strokeStyle = 'rgba(20,5,5,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 26;
      y += (Math.random() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  noise(ctx, size, 16, 0.08);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Same vein pattern as organicTexture but rendered as a glow mask (black canvas,
// bright cracks) for use as an emissiveMap so the seams actually shine.
export function veinGlowTexture(glowColor = '#ff3344') {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 4;
  for (let i = 0; i < 9; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 26;
      y += (Math.random() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Black/yellow hazard stripes, painted at an angle like real warning tape.
// Used to dress up crates, the gate frame, and boss-arena markers.
export function hazardTexture() {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a12';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e8c93a';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-size, -size);
  for (let x = 0; x < size * 2; x += size / 4) {
    ctx.fillRect(x, 0, size / 8, size * 2);
  }
  ctx.restore();
  noise(ctx, size, 10, 0.08);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

// Rough wood planking for the cabin -- replaces the old flat-color bed frame.
export function woodTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(0, 0, size, size);

  const plank = size / 5;
  for (let i = 0; i <= 5; i++) {
    ctx.strokeStyle = 'rgba(30,18,8,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * plank);
    ctx.lineTo(size, i * plank);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = `rgba(40,24,10,${0.1 + Math.random() * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 10, size * 0.7, y + (Math.random() - 0.5) * 10, size, y);
    ctx.stroke();
  }
  noise(ctx, size, 10, 0.06);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Brushed metal for lab tables, doors, and the commander's armour.
export function metalTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8f9499';
  ctx.fillRect(0, 0, size, size);

  // horizontal brush streaks
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * size;
    const alpha = Math.random() * 0.12;
    ctx.strokeStyle = Math.random() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }

  // a few rust blooms so it reads as "abandoned", not "new"
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 10 + Math.random() * 25;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(120,60,25,0.35)');
    grad.addColorStop(1, 'rgba(120,60,25,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, size, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Wall-mounted placard: a one-off drawing (not tiled, unlike everything above)
// so the facility reads as an institution with signage instead of a generic
// pretty room -- 구역 번호판/경고 표지판. `tone` picks the palette; the icon is
// drawn as shapes rather than a glyph, same reasoning as the rest of this file.
const SIGN_TONES = {
  warning: { bg: '#171410', band: '#e8c93a', text: '#f4e9b8', accent: '#e8c93a' },
  restricted: { bg: '#1a0d0d', band: '#c23b3b', text: '#f0d8d8', accent: '#e05050' },
  info: { bg: '#10161c', band: '#6ea8c9', text: '#dce8f0', accent: '#6ea8c9' },
  exit: { bg: '#0c1a10', band: '#3fbf6f', text: '#dff4e6', accent: '#4fe085' },
};

export function signTexture({ label = '', sub = '', tone = 'info', icon = 'triangle' } = {}) {
  const w = 256;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pal = SIGN_TONES[tone] ?? SIGN_TONES.info;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = pal.band;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  // thin inner hairline so it reads as a plate, not a poster
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // icon, top-left -- plain shapes so there's no font/glyph dependency
  ctx.strokeStyle = pal.accent;
  ctx.fillStyle = pal.accent;
  ctx.lineWidth = 3;
  const ix = 34;
  const iy = 40;
  if (icon === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(ix, iy + 22);
    ctx.lineTo(ix - 20, iy - 18);
    ctx.lineTo(ix + 20, iy - 18);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(ix - 2, iy - 12, 4, 14);
    ctx.beginPath();
    ctx.arc(ix, iy + 6, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'lock') {
    ctx.strokeRect(ix - 14, iy - 2, 28, 20);
    ctx.beginPath();
    ctx.arc(ix, iy - 6, 10, Math.PI, 0);
    ctx.stroke();
  } else if (icon === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(ix - 16, iy);
    ctx.lineTo(ix + 14, iy);
    ctx.lineTo(ix + 4, iy - 10);
    ctx.moveTo(ix + 14, iy);
    ctx.lineTo(ix + 4, iy + 10);
    ctx.stroke();
  } else if (icon === 'eye') {
    ctx.beginPath();
    ctx.moveTo(ix - 18, iy);
    ctx.quadraticCurveTo(ix, iy - 16, ix + 18, iy);
    ctx.quadraticCurveTo(ix, iy + 16, ix - 18, iy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ix, iy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = pal.text;
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(label, 72, 52);
  if (sub) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(sub, 72, 82);
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex; // ClampToEdge default -- one placard, not a tiled pattern
}
