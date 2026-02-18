// Utility classes for the variable-area resistor experiment.
// All distances are in meters, areas in mm^2, voltage in volts, current in amps.

class Mulberry32 {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next() {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// Generates smooth, strictly positive cross-sectional area profiles A(x).
class AreaProfile {
  constructor(opts = {}) {
    this.length = opts.length ?? 1.0; // meters
    this.samples = opts.samples ?? 512;
    this.minArea = opts.minArea ?? 0.6; // mm^2
    this.maxArea = opts.maxArea ?? 3.2; // mm^2
    this.rng = new Mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9));
    this.area = new Array(this.samples).fill(1);
    this.dx = this.length / (this.samples - 1);
    this.cumulative = new Array(this.samples).fill(0);
    this.totalR = 1;
    this.generate();
  }

  generate() {
    const lobes = 2 + Math.floor(this.rng.next() * 3); // 2-4 bumps
    for (let i = 0; i < this.samples; i++) {
      const xNorm = i / (this.samples - 1);
      let val = 1.4;
      for (let k = 0; k < lobes; k++) {
        const phase = this.rng.next() * Math.PI * 2;
        const freq = 0.7 + this.rng.next() * 1.3;
        val += 0.6 * Math.sin(freq * Math.PI * xNorm + phase);
      }
      val += 0.3 * (this.rng.next() - 0.5);
      val = Math.min(this.maxArea, Math.max(this.minArea, val));
      this.area[i] = val;
    }
  }

  // Integrate resistivity / area to obtain cumulative resistance per unit current.
  // rho is in ohm*m, area in mm^2 -> convert to m^2.
  precompute(rho = 1.7e-8) {
    const scale = 1e-6; // mm^2 -> m^2
    this.cumulative[0] = 0;
    for (let i = 1; i < this.samples; i++) {
      const conductance = rho / (this.area[i] * scale);
      this.cumulative[i] = this.cumulative[i - 1] + conductance * this.dx;
    }
    this.totalR = this.cumulative[this.samples - 1];
  }

  areaAt(x) {
    const t = constrain(x / this.length, 0, 1);
    const idx = t * (this.samples - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(this.samples - 1, i0 + 1);
    const f = idx - i0;
    return lerp(this.area[i0], this.area[i1], f);
  }

  resistanceUpTo(x) {
    const t = constrain(x / this.length, 0, 1);
    const idx = t * (this.samples - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(this.samples - 1, i0 + 1);
    const f = idx - i0;
    return lerp(this.cumulative[i0], this.cumulative[i1], f);
  }
}

class MeasurementLog {
  constructor() {
    this.data = [];
  }

  clear() {
    this.data.length = 0;
  }

  add(x, v) {
    this.data.push({ x, v });
  }

  autoScan(length, fn, count = 24) {
    this.clear();
    const step = length / (count - 1);
    for (let i = 0; i < count; i++) {
      const x = i * step;
      this.add(x, fn(x));
    }
  }
}

// Utility for simple string formatting of numbers on the UI.
function fmtNum(n, digits = 2) {
  return n.toFixed(digits);
}
