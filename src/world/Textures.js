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

// Backrooms-style wall: sickly yellow, faint damp stains, subtle wallpaper seams.
export function wallTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c9b459';
  ctx.fillRect(0, 0, size, size);

  // faint vertical wallpaper seams
  ctx.strokeStyle = 'rgba(90,75,20,0.15)';
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += size / 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  // damp stains
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 60;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(70,60,15,0.25)');
    grad.addColorStop(1, 'rgba(70,60,15,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, size, 14);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Worn carpet/tile floor.
export function floorTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a6f3a';
  ctx.fillRect(0, 0, size, size);

  const tile = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const shade = 6 + Math.random() * 10;
      ctx.fillStyle = `rgba(0,0,0,${shade / 100})`;
      ctx.fillRect(x * tile, y * tile, tile, tile);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x * tile, y * tile, tile, tile);
    }
  }

  noise(ctx, size, 10);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

// Ceiling tile with the occasional flickering fluorescent light panel baked into the pattern.
export function ceilingTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8cf9a';
  ctx.fillRect(0, 0, size, size);

  const tile = size / 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
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

  // one glowing light panel
  ctx.fillStyle = '#fff9dd';
  ctx.fillRect(tile * 1.2, tile * 1.2, tile * 1.6, tile * 1.6 * 0.4);

  noise(ctx, size, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// Simple furry-ish skin for creatures using blotchy noise as a stand-in for fur.
export function furTexture(baseColor = '#7a6b55') {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 30, 0.1);
  const tex = new THREE.CanvasTexture(canvas);
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
