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

// Utility for simple string formatting of numbers on the UI.
function fmtNum(n, digits = 2) {
  return n.toFixed(digits);
}
