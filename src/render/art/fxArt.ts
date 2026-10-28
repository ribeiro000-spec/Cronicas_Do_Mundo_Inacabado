import { C, PB, bayer, blob, dither, hash, ints, noise2, ramp, selout, thick } from './paint';

/* Efeitos em alta resolução. A maioria é desenhada em branco/cinza com transparência,
 * para ser colorida em tempo de jogo com setTint (o mesmo corte vira fogo, gelo, sombra…). */

const W = (a: number) => C('#ffffff', Math.max(0, Math.min(255, Math.round(a))));

function radial(w: number, h: number, fn: (d: number, x: number, y: number) => number): PB {
  const pb = new PB(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      const a = fn(d, x, y);
      if (a > 0) pb.set(x, y, W(a));
    }
  return pb;
}

/** Arco de corte (crescente) — núcleo claro e borda transparente. */
function arc(size: number, thickness: number, span: number, taper = true): PB {
  const pb = new PB(size, size);
  const c = size / 2;
  const R = size / 2 - 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (Math.abs(a) > span) continue;
      const k = 1 - Math.abs(a) / span; // 1 no meio do arco
      const th = thickness * (taper ? Math.pow(k, 0.6) : 1);
      const inner = R - th;
      if (r < inner || r > R) continue;
      const across = (r - inner) / th; // 0 por dentro, 1 por fora
      let alpha = 255 * Math.pow(across, 1.4) * Math.min(1, k * 2.2);
      if (across > 0.82) alpha = 255;
      if (alpha < 30 && bayer(x, y) > 0.5) continue;
      pb.set(x, y, W(alpha));
    }
  return pb;
}

function thrust(): PB {
  const pb = new PB(96, 28);
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 96; x++) {
      const k = x / 96;
      const half = 2 + k * 10;
      const d = Math.abs(y + 0.5 - 14) / half;
      if (d > 1) continue;
      pb.set(x, y, W(255 * k * (1 - d * d)));
    }
  return pb;
}

function star(size: number, arms = 4): PB {
  const pb = new PB(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy) / c;
      const a = Math.atan2(dy, dx);
      const spike = Math.pow(Math.abs(Math.cos((a * arms) / 2)), 8);
      const lim = 0.25 + spike * 0.75;
      if (r > lim) continue;
      pb.set(x, y, W(255 * (1 - r / lim) ** 0.6));
    }
  return pb;
}

function orb(color: string): PB {
  const pal = ints(ramp(color, 5, 0.45, 12));
  const pb = new PB(22, 22);
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 22; x++) {
      const d = Math.hypot((x + 0.5 - 11) / 11, (y + 0.5 - 11) / 11);
      if (d > 1) continue;
      if (d > 0.62) pb.set(x, y, C(color, Math.round(160 * (1 - d) * 2.6)));
      else pb.set(x, y, dither(1 - d * 1.1 + ((x < 10 && y < 10) ? 0.15 : 0), x, y, pal));
    }
  pb.rect(7, 7, 3, 2, C('#ffffff'));
  return pb;
}

function arrow(): PB {
  const pb = new PB(30, 9);
  const shaft = ints(ramp('#9a6a3c', 4, 0.4, 12));
  for (let x = 4; x < 23; x++) {
    pb.set(x, 4, shaft[2]);
    pb.set(x, 5, shaft[1]);
  }
  pb.poly(
    [
      [22, 1],
      [30, 4.5],
      [22, 8],
    ],
    (_x, y) => (y < 4.5 ? C('#e8ecf2') : C('#9aa2ae')),
  );
  for (let i = 0; i < 5; i++) {
    pb.set(i, 2 + (i % 2), C('#e8e0c8'));
    pb.set(i + 1, 6 - (i % 2), C('#c8402a'));
  }
  return pb;
}

function web(): PB {
  const pb = new PB(22, 22);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI;
    thick(pb, 11 - Math.cos(a) * 10, 11 - Math.sin(a) * 10, 11 + Math.cos(a) * 10, 11 + Math.sin(a) * 10, 1, C('#eef0f6'));
  }
  for (const r of [4, 7, 10])
    for (let a = 0; a < Math.PI * 2; a += 0.12) pb.set(Math.round(11 + Math.cos(a) * r), Math.round(11 + Math.sin(a) * r), C('#d8dce8', 200));
  return pb;
}

function runeCircle(): PB {
  const pb = new PB(128, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const dx = (x + 0.5 - 64) / 64;
      const dy = (y + 0.5 - 32) / 32;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      let on = (d <= 1 && d > 0.93) || (d < 0.78 && d > 0.74) || (d < 0.42 && d > 0.38);
      // glifos entre os anéis
      if (d > 0.8 && d < 0.9 && Math.sin(a * 12) > 0.4 && Math.abs(Math.sin(a * 36)) < 0.5) on = true;
      // estrela de 6 pontas
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI;
        const lx = Math.cos(ang);
        const ly = Math.sin(ang);
        const dist = Math.abs(dx * -ly + dy * lx);
        if (d < 0.74 && dist < 0.025 * (1 + Math.abs(dy))) on = true;
      }
      if (on) pb.set(x, y, W(255));
    }
  return pb;
}

function flame(w: number, h: number): PB {
  const pb = new PB(w, h);
  const pal = ints(['#7a1a0a', '#c8381a', '#f07a24', '#ffc040', '#fff2a8']);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y / h; // 0 topo
      const half = (w / 2) * Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 0.7 * (0.75 + k * 0.25);
      const dx = Math.abs(x + 0.5 - w / 2 + Math.sin(k * 6) * (1 - k) * 1.5);
      if (dx > half) continue;
      const t = (1 - dx / half) * 0.6 + k * 0.45 + (noise2(x * 0.5, y * 0.3, 3) - 0.5) * 0.3;
      pb.set(x, y, dither(t, x, y, pal));
    }
  return pb;
}

function iceSpike(): PB {
  const pb = new PB(18, 30);
  const pal = ints(ramp('#8ad0ff', 5, 0.45, 10));
  pb.poly(
    [
      [9, 0],
      [16, 22],
      [9, 30],
      [2, 22],
    ],
    (x) => dither(x < 9 ? 0.85 : 0.45, x, 0, pal),
  );
  thick(pb, 9, 2, 9, 26, 1, C('#ffffff', 200));
  selout(pb, -0.5);
  return pb;
}

function dagger(): PB {
  const pb = new PB(24, 9);
  for (let x = 0; x < 24; x++) {
    const k = x / 24;
    const half = x > 16 ? (24 - x) * 0.5 : 3;
    for (let y = 0; y < 9; y++) {
      const d = Math.abs(y + 0.5 - 4.5);
      if (d > half) continue;
      pb.set(x, y, W(120 + 135 * k * (1 - d / 4)));
    }
  }
  return pb;
}

function hammer(): PB {
  const pb = new PB(36, 52);
  const pal = ints(ramp('#ffe08a', 5, 0.4, 14));
  for (let y = 18; y < 52; y++) for (let x = 16; x < 20; x++) pb.set(x, y, dither(x < 18 ? 0.8 : 0.5, x, y, pal));
  for (let y = 2; y < 20; y++)
    for (let x = 2; x < 34; x++) {
      const dx = (x + 0.5 - 18) / 16;
      const t = 0.75 - dx * 0.35 - (y - 2) * 0.01;
      pb.set(x, y, dither(t, x, y, pal));
    }
  for (let x = 2; x < 34; x++) pb.set(x, 10, pal[1]);
  selout(pb, -0.4);
  return pb;
}

function claw(): PB {
  const pb = new PB(48, 48);
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const x = 8 + k * 10 + t * 16;
      const y = 6 + t * 36;
      const w = Math.sin(t * Math.PI) * 3;
      for (let o = -w; o <= w; o++) pb.set(Math.round(x + o), Math.round(y), W(255 * (1 - Math.abs(o) / (w + 1))));
    }
  return pb;
}

export function drawFxHD(key: string): PB {
  switch (key) {
    case 'shadow':
      return radial(32, 14, (d) => (d > 1 ? 0 : 70 + (d < 0.7 ? 20 : 0)));
    case 'slash':
      return arc(96, 16, 1.25);
    case 'slash_heavy':
      return arc(128, 26, 1.6);
    case 'slash_thin':
      return arc(80, 8, 1.05);
    case 'thrust':
      return thrust();
    case 'orb':
      return orb('#7aa8ff');
    case 'orb_red':
      return orb('#ff5a4a');
    case 'orb_dark':
      return orb('#9a6aff');
    case 'arrow':
      return arrow();
    case 'web':
      return web();
    case 'spark':
      return star(10, 4);
    case 'star':
      return star(28, 4);
    case 'star8':
      return star(36, 8);
    case 'dot':
      return radial(4, 4, (d) => (d > 1 ? 0 : 255));
    case 'mote':
      return radial(8, 8, (d) => (d > 1 ? 0 : 255 * (1 - d) ** 1.5));
    case 'ring':
      return radial(128, 64, (d) => (d <= 1 && d > 0.9 ? 255 : d <= 0.9 && d > 0.8 ? 90 : 0));
    case 'shock':
      return radial(128, 64, (d) => (d > 1 ? 0 : d > 0.7 ? 255 * ((d - 0.7) / 0.3) ** 0.7 : 0));
    case 'disk':
      return radial(128, 64, (d) => (d > 1 ? 0 : d > 0.9 ? 230 : 70 + d * 40));
    case 'rune':
      return runeCircle();
    case 'fire':
      return flame(14, 20);
    case 'flame_big':
      return flame(28, 40);
    case 'heal': {
      const pb = new PB(12, 12);
      pb.rect(4, 0, 4, 12, C('#ffffff'));
      pb.rect(0, 4, 12, 4, C('#ffffff'));
      return pb;
    }
    case 'leaf': {
      const pb = new PB(8, 5);
      blob(pb, 4, 2.5, 3.5, 2, ints(ramp('#7fbf55', 4, 0.4, 14)), 3, 0.05, 0.1);
      return pb;
    }
    case 'roots': {
      const pb = new PB(44, 40);
      const bark = ints(ramp('#6b4a2e', 5, 0.45, 14));
      const leaf = ints(ramp('#5fa63f', 4, 0.4, 18));
      for (let k = 0; k < 6; k++) {
        let x = 4 + k * 7;
        for (let y = 39; y > 6 + (k % 2) * 8; y--) {
          const w = Math.max(1, ((y - 6) / 34) * 3);
          for (let o = 0; o < w; o++) pb.set(Math.round(x + o), y, dither(0.6 - o * 0.2, x, y, y < 14 ? leaf : bark));
          x += Math.sin(y * 0.5 + k) * 0.6;
        }
      }
      selout(pb, -0.5);
      return pb;
    }
    case 'bubble':
      return radial(56, 68, (d) => (d > 1 ? 0 : d > 0.88 ? 230 : d > 0.8 ? 90 : 40));
    case 'bomb': {
      const pb = new PB(16, 18);
      blob(pb, 8, 11, 6, 6, ints(ramp('#3a3a48', 5, 0.45, 12)), 5, 0.02, 0.05);
      pb.rect(7, 2, 2, 4, C('#8a6a4a'));
      pb.rect(7, 0, 2, 2, C('#ffb040'));
      selout(pb, -0.5);
      return pb;
    }
    case 'light':
      return radial(96, 48, (d) => (d > 1 ? 0 : 255 * (1 - d) ** 2));
    case 'glow':
      return radial(48, 48, (d) => (d > 1 ? 0 : 255 * (1 - d) ** 2.2));
    case 'shard': {
      const pb = new PB(16, 26);
      const pal = ints(['#7a4ad0', '#b48cff', '#e0ccff', '#ffffff']);
      pb.poly(
        [
          [8, 0],
          [15, 10],
          [8, 26],
          [1, 10],
        ],
        (x, y) => dither((x < 8 ? 0.85 : 0.5) - y * 0.01, x, y, pal),
      );
      thick(pb, 8, 3, 8, 22, 1, C('#7cf0ff'));
      selout(pb, -0.4);
      return pb;
    }
    case 'ice':
      return iceSpike();
    case 'dagger':
      return dagger();
    case 'hammer':
      return hammer();
    case 'claw':
      return claw();
    case 'smoke':
      return radial(28, 28, (d, x, y) => (d > 1 ? 0 : 200 * (1 - d) ** 1.2 * (0.7 + noise2(x * 0.3, y * 0.3, 9) * 0.6)));
    case 'dust':
      return radial(20, 12, (d, x, y) => (d > 1 ? 0 : 180 * (1 - d) * (bayer(x, y) > 0.3 ? 1 : 0.4)));
    case 'fog':
      return radial(200, 100, (d, x, y) => (d > 1 ? 0 : 140 * (1 - d) ** 1.6 * (0.6 + noise2(x * 0.04, y * 0.06, 5) * 0.8)));
    case 'ray': {
      const pb = new PB(56, 180);
      for (let y = 0; y < 180; y++)
        for (let x = 0; x < 56; x++) {
          const k = y / 180;
          const cx = 28 + (k - 0.5) * 20;
          const half = 8 + k * 18;
          const d = Math.abs(x + 0.5 - cx) / half;
          if (d > 1) continue;
          pb.set(x, y, W(150 * (1 - d) ** 1.5 * Math.sin(Math.PI * k)));
        }
      return pb;
    }
    case 'feather':
    case 'petal': {
      const pb = new PB(6, 4);
      pb.rect(0, 1, 5, 2, C('#ffffff'));
      pb.set(5, 2, C('#ffffff'));
      return pb;
    }
  }
  const pb = new PB(4, 4);
  pb.rect(0, 0, 4, 4, C('#ff00ff'));
  return pb;
}

export const FX_KEYS_HD = [
  'shadow', 'slash', 'slash_heavy', 'slash_thin', 'thrust', 'orb', 'orb_red', 'orb_dark', 'arrow', 'web', 'spark', 'star', 'star8',
  'dot', 'mote', 'ring', 'shock', 'disk', 'rune', 'fire', 'flame_big', 'heal', 'leaf', 'roots', 'bubble', 'bomb', 'light', 'glow',
  'shard', 'ice', 'dagger', 'hammer', 'claw', 'smoke', 'dust', 'fog', 'ray', 'petal',
];

export { hash };
