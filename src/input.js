// Unified input: keyboard fallback + USB serial from the ESP32-S3 (lines: "roll,pitch,btn,spin").
//
// Calibration
//   C : hold the controller level and still for 1.5 s -> sets the neutral position and removes gyro drift
//   K : tilt as far as is comfortable in every direction for 4 s -> sets the tilt range per axis
//   - / = : less / more sensitive      U : swap roll and pitch (if the sensor is mounted sideways)
//   R / I / Y : invert roll / pitch / spin       G : show live numbers
const DEAD = 3;          // degrees of tilt ignored around neutral
const CAL_TIME = 1500;   // ms
const RANGE_TIME = 4000; // ms

const norm = (deg, range) => {
  const s = Math.sign(deg), a = Math.max(0, Math.abs(deg) - DEAD);
  return s * Math.min(1, a / Math.max(1, range - DEAD));
};

export class Controller {
  constructor() {
    this.roll = 0; this.pitch = 0; this.boost = false;
    this.raw = { roll: 0, pitch: 0, btn: 0, spin: 0 };
    this.offset = { roll: 0, pitch: 0, spin: 0 };
    this.range = { roll: 28, pitch: 28 };     // full tilt in degrees, per SENSOR axis
    this.keys = new Set();
    this.serialActive = false;
    this.lastData = 0;
    this.invertRoll = false; this.invertPitch = false; this.invertSpin = false; this.swapAxes = false;
    this.wiz = null; this.hasSaved = false;
    try {
      const sv = JSON.parse(localStorage.getItem('garuda-ctl-v1') || 'null');
      if (sv) { this.hasSaved = true; this.range = sv.range; this.invertRoll = sv.invertRoll; this.invertPitch = sv.invertPitch; this.invertSpin = sv.invertSpin; this.swapAxes = sv.swapAxes; }
    } catch (e) { /* no saved settings */ }
    this.viewFlip = false; this.spinRate = 0;
    this.cal = null; this.rng = null;
    this.source = 'Keyboard'; this.padSpin = 0;
    addEventListener('gamepadconnected', () => this.onStatus('Gamepad connected'));
    this.onStatus = () => {};
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.calibrate();
      if (e.code === 'KeyK') this.calibrateRange();
      if (e.code === 'KeyO') this.startWizard();
      if (e.code === 'KeyR') this.invertRoll = !this.invertRoll;
      if (e.code === 'KeyI') this.invertPitch = !this.invertPitch;
      if (e.code === 'KeyY') this.invertSpin = !this.invertSpin;
      if (e.code === 'KeyU') { this.swapAxes = !this.swapAxes; this.onStatus('Roll / pitch axes ' + (this.swapAxes ? 'swapped' : 'normal')); }
      if (e.code === 'Minus') this.scaleRange(1.12);
      if (e.code === 'Equal') this.scaleRange(1 / 1.12);
      if (['KeyR', 'KeyI', 'KeyY', 'KeyU', 'Minus', 'Equal'].includes(e.code)) this.save();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  save() {
    try {
      localStorage.setItem('garuda-ctl-v1', JSON.stringify({ range: this.range, invertRoll: this.invertRoll, invertPitch: this.invertPitch, invertSpin: this.invertSpin, swapAxes: this.swapAxes }));
    } catch (e) { /* storage unavailable */ }
  }

  // first connected gamepad (browsers only report it after a button is pressed)
  pad() {
    try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of l) if (p && p.connected) return p; } catch (e) { /* ignore */ }
    return null;
  }

  get live() { return this.serialActive && performance.now() - this.lastData < 700; }

  scaleRange(f) {
    this.range.roll = Math.min(70, Math.max(10, this.range.roll * f));
    this.range.pitch = Math.min(70, Math.max(10, this.range.pitch * f));
    this.onStatus(`Tilt range: full steering at ${this.range.roll.toFixed(0)}° (${f > 1 ? 'less' : 'more'} sensitive)`);
  }

  // Averages 1.5 s of readings while the controller is held level and still.
  calibrate() {
    if (!this.live) { this.onStatus('Connect the controller first'); return; }
    this.cal = { t0: performance.now(), n: 0, r: 0, p: 0, s: 0 };
    this.onStatus('Calibrating - hold the controller level and still...');
  }

  // Records the largest comfortable tilt in each direction.
  calibrateRange() {
    if (!this.live) { this.onStatus('Connect the controller first'); return; }
    this.rng = { t0: performance.now(), mr: 0, mp: 0 };
    this.onStatus('Range calibration - tilt fully left, right, forward and back for 4 s...');
  }

  // Guided orientation setup: works out how the sensor is mounted from three poses (level, left, front-up).
  startWizard() {
    if (!this.live) { this.onStatus('Connect the controller first'); return; }
    this.wiz = { step: 0, t0: performance.now(), n: 0, r: 0, p: 0, base: null, left: null };
    this.onStatus('Setup 1/3 - hold the controller level and still');
  }

  wizFeed() {
    const w = this.wiz, now = performance.now(), el = now - w.t0;
    if (el > 900) { w.n++; w.r += this.raw.roll; w.p += this.raw.pitch; }
    if (el < 2600 || w.n < 10) return;
    const m = { roll: w.r / w.n, pitch: w.p / w.n };
    if (w.step === 0) {
      w.base = m; this.offset = { roll: m.roll, pitch: m.pitch, spin: this.raw.spin };
      w.step = 1; this.onStatus('Setup 2/3 - tilt it LEFT and hold');
    } else if (w.step === 1) {
      w.left = { roll: m.roll - w.base.roll, pitch: m.pitch - w.base.pitch };
      w.step = 2; this.onStatus('Setup 3/3 - level it first, then tilt the FRONT edge UP (nose up) and hold');
    } else {
      const up = { roll: m.roll - w.base.roll, pitch: m.pitch - w.base.pitch };
      const lA = Math.abs(w.left.roll) >= Math.abs(w.left.pitch) ? 'roll' : 'pitch';
      const uA = Math.abs(up.roll) >= Math.abs(up.pitch) ? 'roll' : 'pitch';
      if (lA === uA || Math.abs(w.left[lA]) < 8 || Math.abs(up[uA]) < 8) {
        this.wiz = null; this.onStatus('Setup failed - tilt clearly in each direction. Press O to try again'); return;
      }
      this.swapAxes = lA === 'pitch';
      this.invertRoll = w.left[lA] > 0;
      this.invertPitch = up[uA] > 0;
      const rng = { roll: this.range.roll, pitch: this.range.pitch };
      rng[lA] = Math.min(60, Math.max(12, Math.abs(w.left[lA]) * 0.85));
      rng[uA] = Math.min(60, Math.max(12, Math.abs(up[uA]) * 0.85));
      this.range = rng;
      this.wiz = null; this.hasSaved = true; this.save();
      this.onStatus('Controller setup complete');
      return;
    }
    w.t0 = now; w.n = 0; w.r = 0; w.p = 0;
  }

  // called for every line from the controller
  feed() {
    const now = performance.now();
    if (this.wiz) this.wizFeed();
    if (this.cal) {
      const c = this.cal;
      c.n++; c.r += this.raw.roll; c.p += this.raw.pitch; c.s += this.raw.spin;
      if (now - c.t0 >= CAL_TIME && c.n > 10) {
        this.offset = { roll: c.r / c.n, pitch: c.p / c.n, spin: c.s / c.n };
        this.cal = null;
        this.onStatus('Calibrated - neutral position set');
      }
    }
    if (this.rng) {
      const g = this.rng;
      g.mr = Math.max(g.mr, Math.abs(this.raw.roll - this.offset.roll));
      g.mp = Math.max(g.mp, Math.abs(this.raw.pitch - this.offset.pitch));
      if (now - g.t0 >= RANGE_TIME) {
        this.range = { roll: Math.min(70, Math.max(12, g.mr * 0.85)), pitch: Math.min(70, Math.max(12, g.mp * 0.85)) };
        this.rng = null;
        this.save();
        this.onStatus(`Range set: roll ±${this.range.roll.toFixed(0)}°, pitch ±${this.range.pitch.toFixed(0)}°`);
      }
    }
  }

  async connect() {
    if (!('serial' in navigator)) { this.onStatus('Web Serial needs Chrome or Edge'); return false; }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.serialActive = true;
      this.onStatus('Controller connected');
      this.readLoop(port);
      return true;
    } catch (e) { this.onStatus('Connect cancelled'); return false; }
  }

  async readLoop(port) {
    const dec = new TextDecoderStream();
    port.readable.pipeTo(dec.writable).catch(() => {});
    const reader = dec.readable.getReader();
    let buf = '', first = true;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          const p = line.split(',');
          if (p.length >= 3) {
            const r = parseFloat(p[0]), pt = parseFloat(p[1]);
            if (Number.isFinite(r) && Number.isFinite(pt)) {
              this.raw = { roll: r, pitch: pt, btn: +p[2] || 0, spin: parseFloat(p[3]) || 0 };
              this.lastData = performance.now();
              if (first) { first = false; if (this.hasSaved) this.calibrate(); else this.startWizard(); }
              this.feed();
            }
          }
        }
      }
    } catch (e) { /* unplugged */ }
    this.serialActive = false;
    this.onStatus('Controller disconnected - keyboard active');
  }

  update(dt) {
    let tr, tp, boost;
    if (this.live) {
      let dr = this.raw.roll - this.offset.roll, dp = this.raw.pitch - this.offset.pitch, rr = this.range.roll, rp = this.range.pitch;
      if (this.swapAxes) { [dr, dp] = [dp, dr]; [rr, rp] = [rp, rr]; }
      tr = norm(dr, rr);
      tp = norm(dp, rp);
      boost = !!this.raw.btn;
      this.source = 'ESP32';
    } else {
      const k = this.keys;
      tr = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
      tp = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
      boost = k.has('Space') || k.has('ShiftLeft');
      const gp = this.pad();
      if (gp) {
        const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
        const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        tr = Math.max(-1, Math.min(1, tr + dz(gp.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0)));
        tp = Math.max(-1, Math.min(1, tp + dz(gp.axes[1] || 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0)));
        boost = boost || b(0) || b(6) || b(7);          // A / cross, or either trigger
        this.padSpin = (b(5) ? 420 : 0) - (b(4) ? 420 : 0); // bumpers spin
      } else this.padSpin = 0;
      this.source = gp ? 'Gamepad' : 'Keyboard';
    }
    if (this.live) { if (this.invertRoll) tr = -tr; if (this.invertPitch) tp = -tp; }   // sensor mounting only affects the ESP32
    if (this.viewFlip) tr = -tr;           // front view mirrors left and right
    let sp = 0;
    if (this.live) { const s = this.raw.spin - this.offset.spin; sp = Math.abs(s) > 80 ? s : 0; }
    else sp = (this.keys.has('KeyX') ? 420 : 0) - (this.keys.has('KeyZ') ? 420 : 0) + this.padSpin;
    this.spinRate = this.invertSpin ? -sp : sp;
    const a = 1 - Math.exp(-dt * 9);
    this.roll += (tr - this.roll) * a;
    this.pitch += (tp - this.pitch) * a;
    this.boost = boost;
  }
}
