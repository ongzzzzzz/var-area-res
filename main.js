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

let showIdeal = false;

class VarAreaExperiment {
  constructor() {
    // resistor parameters
    this.L = 0.01; // meters (1 cm)
    this.ell = 0.008; // meters (0.8cm)
    this.r0 = 0.0004; // meters (0.4 mm)
    this.rho = 1e-4; // ohm·m (lowkey vibes since theres such a range)
    this.totalR = 1.0;

    // simulation parameters
    this.samples = 512;
    this.dx = this.L / (this.samples - 1);

    this.rng = new Mulberry32(Math.floor(Math.random() * 1e9));
    this.currentA = 0.25; // amps
    this.noiseStd = 0.5; // volts
    this.probeX = 0.35; // m, starting position
    this.k_b = 1.380649e-23; // boltzmann my goat
    this.tempK = 300; // Kelvin for Johnson noise
    this.noiseBW = 9e9; // Hz effective bandwidth (wide to make noise visible)


    // simulation variables
    this.showTruth = true;
    this.radiusAt = (x => this.r0 * Math.exp(-x/this.ell));
    this.areaAt = (x => Math.PI * Math.pow(this.radiusAt(x), 2));
    this.cumulative = new Array(this.samples).fill(0);
    for (let i = 1; i < this.samples; i++) {
      const x = i * this.dx;
      const dR = (this.rho * this.dx) / this.areaAt(x);
      this.cumulative[i] = this.cumulative[i - 1] + dR;
    }
    this.readings = [];
    this.tableBody = null;
    this.iValue = null;
    this.xValue = null;

    // layout parameters
    this.regionPadX = 25;
    this.regionPadY = 25;
    this.regionGapY = 40;

    this.panel = null;
    this.layout();
    this.buildUI();
    this.updatePanelPosition();
    this.updateTable();
  }

  layout() {
    const pad = 30;
    const panelW = 320; // keep drawable region clear of the control panel
    const availableW = max(320, width - panelW - pad * 4);

    this.barRect = {
      x: pad,
      y: height * 0.15 + this.regionPadY,
      w: availableW,
      h: height * 0.3,
    };

    this.graphRect = {
      x: pad,
      y: this.barRect.y + this.barRect.h + this.regionGapY + this.regionPadY,
      w: availableW,
      h: height * 0.3,
    };

    this.updatePanelPosition();
  }

  buildUI() {
    // remove prior controls
    if (this.panel) this.panel.remove();

    this.panel = createDiv("");
    this.panel.id("control-panel");

    const sliderRow = createDiv().parent(this.panel).addClass("row");

    // Current slider
    const iBlock = this.makeControlBlock("Drive Current (A)");
    this.iSlider = createSlider(0.01, 0.75, this.currentA, 0);
    this.iSlider.input(() => (this.currentA = this.iSlider.value()));
    this.iValue = createSpan(`${fmtNum(this.currentA, 3)} A`).addClass("value-pill");
    iBlock.child(this.iValue);
    iBlock.child(this.iSlider);
    sliderRow.child(iBlock);

    // Probe slider
    const xBlock = this.makeControlBlock("Probe Position x (m)");
    this.xSlider = createSlider(0, this.L, this.probeX, 0);
    this.xSlider.input(() => (this.probeX = this.xSlider.value()));
    this.xValue = createSpan(`${fmtNum(this.probeX * 1000, 3)} mm`).addClass("value-pill");
    xBlock.child(this.xValue);
    xBlock.child(this.xSlider);
    sliderRow.child(xBlock);

    // Buttons row
    const btnRow = createDiv().parent(this.panel).addClass("row");

    this.measureBtn = createButton("Add Reading");
    this.measureBtn.mousePressed(() => {
      const idx = constrain(Math.floor(this.probeX / this.dx), 0, this.cumulative.length - 1);
      const res_curr = this.cumulative[idx];

      const vIdeal = this.currentA * res_curr;
      const johnsonStd = Math.sqrt(4 * this.k_b * this.tempK * res_curr * this.noiseBW);
      const ampStd = 0.003; // 3 mV_rms instrument noise
      const totalStd = Math.sqrt(johnsonStd * johnsonStd + ampStd * ampStd);
      const vMeas = vIdeal + totalStd * randomGaussian();
      this.readings.push([this.probeX, vMeas]);
      this.updateTable();
    });
    btnRow.child(this.measureBtn);

    this.clearBtn = createButton("Clear Data");
    this.clearBtn.mousePressed(() => {
      this.readings = [];
      this.updateTable();
    });
    btnRow.child(this.clearBtn);

    // Table of readings
    const tableWrap = createDiv().parent(this.panel).addClass("table-wrap");
    createElement("h4", "Readings").parent(tableWrap);
    const tableEl = createElement("table").parent(tableWrap);
    const thead = createElement("thead").parent(tableEl);
    const headRow = createElement("tr").parent(thead);
    ["#", "x (m)", "V (V)"].forEach(label => {
      createElement("th", label).parent(headRow);
    });
    this.tableBody = createElement("tbody").parent(tableEl);

    // Toggles
    const toggleRow = createDiv().parent(this.panel).addClass("row");
    this.truthChk = createCheckbox("Reveal A(x)", this.showTruth);
    this.truthChk.changed(() => (this.showTruth = this.truthChk.checked()));
    toggleRow.child(this.truthChk);

    // this.idealChk = createCheckbox("Show ideal V(x)", this.showIdeal);
    // this.idealChk.changed(() => (this.showIdeal = this.idealChk.checked()));
    // toggleRow.child(this.idealChk);

    this.updatePanelPosition();
  }

  makeControlBlock(label) {
    const block = createDiv().addClass("block");
    createSpan(label).parent(block).addClass("label");
    return block;
  }

  updatePanelPosition() {
    if (!this.panel || !this.barRect || !this.graphRect) return;
    // revert to CSS-defined sizing/position
    this.panel.style("top", "");
    this.panel.style("height", "");
    this.panel.style("max-height", "");
    this.panel.style("overflow-y", "");
  }

  drawResistor() {
    const { x, y, w, h } = this.barRect;
    push();
    translate(x, y);

    // outline box for experiment region
    stroke(70, 90, 140);
    strokeWeight(2);
    noFill();
    rect(-this.regionPadX, -this.regionPadY, w + 2 * this.regionPadX, h + 2 * this.regionPadY, 12);

    // decorative base
    noStroke();
    fill(24, 26, 40);
    rect(0, 0, w, h, 10);

    // axisymmetric profile using radiusAt(x)
    if (this.showTruth) {
      const steps = 100;
      const centerY = h * 0.5;
      const maxR = this.radiusAt(0);
      const scale = (h * 0.45) / maxR; // fit profile within bar height
      stroke(120, 170, 255, 220);
      strokeWeight(2);
      fill(45, 70, 120, 140);
      beginShape();
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const ax = t * w;
        const ay = centerY - scale * this.radiusAt(t * this.L);
        vertex(ax, ay);
      }
      for (let i = steps - 1; i >= 0; i--) {
        const t = i / (steps - 1);
        const ax = t * w;
        const ay = centerY + scale * this.radiusAt(t * this.L);
        vertex(ax, ay);
      }
      endShape(CLOSE);
    }

    // terminals
    stroke(255, 120, 80);
    strokeWeight(3);
    fill(255, 120, 80);
    rect(-16, h * 0.35, 16, h * 0.3, 4);
    rect(w, h * 0.35, 16, h * 0.3, 4);
    line(-30, h * 0.5, -16, h * 0.5);
    line(w + 16, h * 0.5, w + 30, h * 0.5);

    // probe marker
    const px = map(this.probeX, 0, this.L, 0, w);
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
    text(`x = L`, w, h + 18);

    pop();
  }

  drawGraph() {
    const { x, y, w, h } = this.graphRect;
    push();
    translate(x, y);

    // outline box for graph region
    stroke(70, 90, 140);
    strokeWeight(2);
    noFill();
    rect(-this.regionPadX, -this.regionPadY, w + 2 * this.regionPadX, h + 2 * this.regionPadY, 12);

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
      text(fmtNum((i / xticks) * this.L, 2), tx, h + 8);
    }

    // y-axis label
    push();
    translate(-10, h * 0.5);
    rotate(-HALF_PI);
    noStroke();
    fill(170);
    textAlign(CENTER, CENTER);
    text("Voltage V (V)", 0, 0);
    pop();

    // y ticks and scaling
    // const vmax = Math.min(2.0, Math.ceil(this.readings.length == 0 ? 100 : Math.max(...this.readings))); // fixed range 0-2 V
    const vmax = 8.0;
    const yticks = 5;
    textAlign(LEFT, CENTER);
    for (let j = 0; j <= yticks; j++) {
      const ty = map(j, 0, yticks, h, 0);
      stroke(90);
      line(-6, ty, 0, ty);
      noStroke();
      text(fmtNum((j / yticks) * vmax, 2), 6, ty);
    }

    // ideal V(x) curve
    if (showIdeal) {
      noFill();
      stroke(90, 190, 255);
      strokeWeight(2);
      beginShape();
      for (let i = 0; i < this.cumulative.length; i++) {
        const xPos = i * this.dx;
        const v = this.currentA * this.cumulative[i];
        const gx = map(xPos, 0, this.L, 0, w);
        const gy = map(v, 0, vmax, h, 0);
        vertex(gx, gy);
      }
      endShape();
    }

    // scatter plot of recorded readings
    stroke(255, 180, 120);
    fill(255, 180, 120, 190);
    strokeWeight(6);
    this.readings.forEach(([px, v]) => {
      const gx = map(px, 0, this.L, 0, w);
      const gy = map(v, 0, vmax, h, 0);
      point(gx, gy);
    });

    pop();
  }

  updateTable() {
    if (!this.tableBody) return;
    this.tableBody.html("");
    if (this.readings.length === 0) {
      const row = createElement("tr").parent(this.tableBody);
      createElement("td", "—").attribute("colspan", 3).parent(row);
      return;
    }
    this.readings.forEach(([xVal, vVal], idx) => {
      const row = createElement("tr").parent(this.tableBody);
      createElement("td", `${idx + 1}`).parent(row);
      createElement("td", fmtNum(xVal, 3)).parent(row);
      createElement("td", fmtNum(vVal, 3)).parent(row);
    });
  }

  drawMeter() {
    // const reading = this.measureVoltage(this.probeX);
    // const boxW = 220;
    // const boxH = 80;
    // const x = width - boxW - 24;
    // const y = 24;
    // push();
    // translate(x, y);
    // fill(26, 30, 44);
    // stroke(90, 120, 220);
    // strokeWeight(2);
    // rect(0, 0, boxW, boxH, 12);

    // noStroke();
    // fill(140, 180, 255);
    // textSize(14);
    // textAlign(LEFT, CENTER);
    // text("Voltmeter @ probe", 14, 18);
    // textSize(32);
    // text(`${fmtNum(reading, 4)} V`, 14, 52);
    // pop();
  }

  drawLegend() {
    // const lines = [
    //   `Current source I = ${fmtNum(this.currentA, 2)} A`,
    //   `Resistivity rho = ${fmtNum(this.rho * 1e8, 2)} x10^-8 ohm*m`,
    //   `Total R = ${fmtNum(this.areaProfile.totalR, 2)} ohm`,
    //   `Data points = ${this.log.data.length}`,
    // ];
    // fill(180);
    // noStroke();
    // textAlign(LEFT, TOP);
    // textSize(14);
    // text(lines.join("\n"), width - 280, height - 120);
  }

  draw() {
    this.currentA = this.iSlider?.value() ?? this.currentA;
    this.noiseStd = this.nSlider?.value() ?? this.noiseStd;
    this.probeX = this.xSlider?.value() ?? this.probeX;

    if (this.iValue) this.iValue.html(`${fmtNum(this.currentA, 3)} A`);
    if (this.xValue) this.xValue.html(`${fmtNum(this.probeX * 1000, 3)} mm`);

    this.drawResistor();
    this.drawGraph();
    this.drawMeter();
    this.drawLegend();
  }

}
