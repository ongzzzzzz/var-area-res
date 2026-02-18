// p5.js sketch for the variable-area resistor experiment.
// The bar is driven by a current source I. The measured voltage is
// V(x) = I * ∫_0^x rho / A(s) ds. Users probe x, log points, and compare to the hidden profile.

let sim;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  sim = new VarAreaExperiment();
}

function draw() {
  background(0);
  sim.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  sim.layout();
}

class VarAreaExperiment {
  constructor() {
    this.length = 1.0; // m
    this.rho = 1.7e-8; // ohm·m (copper-ish)
    this.areaProfile = new AreaProfile({ length: this.length });
    this.areaProfile.precompute(this.rho);

    this.currentA = 0.25; // amps
    this.noiseStd = 0.003; // volts
    this.probeX = 0.35; // m
    this.log = new MeasurementLog();
    this.showTruth = false;
    this.autoShowIdeal = false;

    this.panel = null;
    this.layout();
    this.buildUI();
  }

  layout() {
    const pad = 24;
    this.barRect = {
      x: pad,
      y: height * 0.15,
      w: width * 0.6,
      h: height * 0.18,
    };
    this.graphRect = {
      x: pad,
      y: this.barRect.y + this.barRect.h + 40,
      w: width - pad * 2,
      h: height * 0.35,
    };
  }

  buildUI() {
    // remove prior controls
    if (this.panel) this.panel.remove();

    this.panel = createDiv("");
    this.panel.id("control-panel");

    const sliderRow = createDiv().parent(this.panel).addClass("row");

    // Current slider
    const iBlock = this.makeControlBlock("Drive Current (A)");
    this.iSlider = createSlider(0.05, 0.8, this.currentA, 0.01);
    this.iSlider.input(() => (this.currentA = this.iSlider.value()));
    iBlock.child(this.iSlider);
    sliderRow.child(iBlock);

    // Noise slider
    const nBlock = this.makeControlBlock("Noise σ (V)");
    this.nSlider = createSlider(0, 0.02, this.noiseStd, 0.001);
    this.nSlider.input(() => (this.noiseStd = this.nSlider.value()));
    nBlock.child(this.nSlider);
    sliderRow.child(nBlock);

    // Probe slider
    const xBlock = this.makeControlBlock("Probe Position x (m)");
    this.xSlider = createSlider(0, this.length, this.probeX, 0.001);
    this.xSlider.input(() => (this.probeX = this.xSlider.value()));
    xBlock.child(this.xSlider);
    sliderRow.child(xBlock);

    // Buttons row
    const btnRow = createDiv().parent(this.panel).addClass("row");
    this.newBtn = createButton("New Sample");
    this.newBtn.mousePressed(() => this.regenerate());
    btnRow.child(this.newBtn);

    this.measureBtn = createButton("Add Reading");
    this.measureBtn.mousePressed(() => this.addReading());
    btnRow.child(this.measureBtn);

    this.scanBtn = createButton("Auto Scan 24 pts");
    this.scanBtn.mousePressed(() => this.autoScan());
    btnRow.child(this.scanBtn);

    this.clearBtn = createButton("Clear Data");
    this.clearBtn.mousePressed(() => this.log.clear());
    btnRow.child(this.clearBtn);

    // Toggles
    const toggleRow = createDiv().parent(this.panel).addClass("row");
    this.truthChk = createCheckbox("Reveal A(x)", this.showTruth);
    this.truthChk.changed(() => (this.showTruth = this.truthChk.checked()));
    toggleRow.child(this.truthChk);

    this.idealChk = createCheckbox("Show ideal V(x)", this.autoShowIdeal);
    this.idealChk.changed(() => (this.autoShowIdeal = this.idealChk.checked()));
    toggleRow.child(this.idealChk);
  }

  makeControlBlock(label) {
    const block = createDiv().addClass("block");
    createSpan(label).parent(block).addClass("label");
    return block;
  }

  regenerate() {
    this.areaProfile = new AreaProfile({ length: this.length });
    this.areaProfile.precompute(this.rho);
    this.log.clear();
  }

  measureVoltage(x) {
    const noiseless = this.currentA * this.areaProfile.resistanceUpTo(x);
    const noise = this.noiseStd * randomGaussian();
    return noiseless + noise;
  }

  addReading() {
    this.log.add(this.probeX, this.measureVoltage(this.probeX));
  }

  autoScan() {
    this.log.autoScan(this.length, (x) => this.measureVoltage(x), 24);
  }

  drawBar() {
    const { x, y, w, h } = this.barRect;
    push();
    translate(x, y);

    // decorative base
    noStroke();
    fill(24, 26, 40);
    rect(0, 0, w, h, 10);

    // hidden area profile shading
    const steps = 256;
    stroke(60, 120, 255, 180);
    noFill();
    beginShape();
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const ax = t * w;
      const aVal = this.areaProfile.areaAt(t * this.length);
      const norm = map(aVal, this.areaProfile.minArea, this.areaProfile.maxArea, 0.05, 1);
      const ay = h * (1 - norm * 0.75);
      vertex(ax, ay);
    }
    endShape();

    // mask to hide real profile when not revealed
    if (!this.showTruth) {
      fill(12, 14, 24, 230);
      noStroke();
      rect(0, 0, w, h);
    }

    // terminals
    fill(255, 120, 80);
    rect(-16, h * 0.35, 16, h * 0.3, 4);
    rect(w, h * 0.35, 16, h * 0.3, 4);
    stroke(255, 120, 80);
    strokeWeight(3);
    line(-30, h * 0.5, -16, h * 0.5);
    line(w + 16, h * 0.5, w + 30, h * 0.5);

    // probe marker
    const px = map(this.probeX, 0, this.length, 0, w);
    stroke(255, 220, 120);
    strokeWeight(2);
    line(px, -12, px, h + 12);
    fill(255, 220, 120);
    triangle(px - 6, -12, px + 6, -12, px, -22);

    // axis labels
    noStroke();
    fill(180);
    textAlign(CENTER, CENTER);
    textSize(14);
    text("x = 0", 0, h + 18);
    text(`x = ${fmtNum(this.length, 2)} m`, w, h + 18);

    pop();
  }

  drawGraph() {
    const { x, y, w, h } = this.graphRect;
    push();
    translate(x, y);

    // axes
    stroke(90);
    strokeWeight(1);
    line(0, h, w, h);
    line(0, 0, 0, h);

    // tick marks
    const xticks = 6;
    fill(160);
    textSize(12);
    textAlign(CENTER, TOP);
    for (let i = 0; i <= xticks; i++) {
      const tx = (i / xticks) * w;
      stroke(90);
      line(tx, h, tx, h + 6);
      noStroke();
      text(fmtNum((i / xticks) * this.length, 2), tx, h + 8);
    }

    // voltage scale estimate
    const vmax = max(this.currentA * this.areaProfile.totalR * 1.05, 0.05);
    const yTicks = 4;
    textAlign(LEFT, CENTER);
    for (let j = 0; j <= yTicks; j++) {
      const ty = map(j, 0, yTicks, h, 0);
      stroke(90);
      line(-6, ty, 0, ty);
      noStroke();
      text(`${fmtNum((j / yTicks) * vmax, 2)} V`, 6, ty);
    }

    // ideal curve (optional)
    if (this.autoShowIdeal || this.showTruth) {
      noFill();
      stroke(70, 200, 255);
      strokeWeight(2);
      beginShape();
      const samples = 220;
      for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const xPos = t * this.length;
        const v = this.currentA * this.areaProfile.resistanceUpTo(xPos);
        const gx = t * w;
        const gy = map(v, 0, vmax, h, 0);
        vertex(gx, gy);
      }
      endShape();
    }

    // measured points
    stroke(255, 180, 120);
    fill(255, 180, 120, 180);
    strokeWeight(6);
    this.log.data.forEach(({ x: px, v }) => {
      const gx = map(px, 0, this.length, 0, w);
      const gy = map(v, 0, vmax, h, 0);
      point(gx, gy);
    });

    // crosshair for current probe
    const cv = this.measureVoltage(this.probeX);
    const cx = map(this.probeX, 0, this.length, 0, w);
    const cy = map(cv, 0, vmax, h, 0);
    stroke(255, 220, 120, 180);
    strokeWeight(1);
    line(cx, h, cx, cy);
    line(0, cy, cx, cy);

    pop();
  }

  drawMeter() {
    const reading = this.measureVoltage(this.probeX);
    const boxW = 220;
    const boxH = 80;
    const x = width - boxW - 24;
    const y = 24;
    push();
    translate(x, y);
    fill(26, 30, 44);
    stroke(90, 120, 220);
    strokeWeight(2);
    rect(0, 0, boxW, boxH, 12);

    noStroke();
    fill(140, 180, 255);
    textSize(14);
    textAlign(LEFT, CENTER);
    text("Voltmeter @ probe", 14, 18);
    textSize(32);
    text(`${fmtNum(reading, 4)} V`, 14, 52);
    pop();
  }

  drawLegend() {
    const lines = [
      `Current source I = ${fmtNum(this.currentA, 2)} A`,
      `Resistivity rho = ${fmtNum(this.rho * 1e8, 2)} x10^-8 ohm*m`,
      `Total R = ${fmtNum(this.areaProfile.totalR, 2)} ohm`,
      `Data points = ${this.log.data.length}`,
    ];
    fill(180);
    noStroke();
    textAlign(LEFT, TOP);
    textSize(14);
    text(lines.join("\n"), width - 280, height - 120);
  }

  draw() {
    this.currentA = this.iSlider?.value() ?? this.currentA;
    this.noiseStd = this.nSlider?.value() ?? this.noiseStd;
    this.probeX = this.xSlider?.value() ?? this.probeX;

    this.drawBar();
    this.drawGraph();
    this.drawMeter();
    this.drawLegend();
  }
}
