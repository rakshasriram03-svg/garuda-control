// Hanuman's movement. Everything happens automatically from the tilt controller (no buttons):
//   steer (tilt left/right) : turn          up (tilt back) : leap, then fly          down (tilt forward) : drop / land
//   - Fly low over a rooftop or street and he lands and runs.
//   - Running to a roof edge: he leaps to the next building if there is one in reach.
//   - Running into a wall: he vaults onto it, or flies up and over if it is too tall.
const G = 30;

export class Player {
  constructor(city) {
    this.city = city;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.speed = 0; this.mode = 'run';
    this.r = 1.0;            // body radius for walls
    this.noLand = 0; this.airTime = 0; this.jumpLatch = false; this.edgeCool = 0;
    this.t = 0;
    this.events = [];        // things the game may react to ("land", "jump", "takeoff")
  }

  get label() {
    if (this.mode === 'fly') return 'FLYING';
    if (this.mode === 'air') return 'LEAPING';
    return this.y > 1.5 ? 'ROOFTOP' : 'STREET';
  }
  get animSpeed() { return this.mode === 'run' ? this.speed : Math.hypot(this.vx, this.vz); }

  moveH(dx, dz) {
    const c = this.city;
    let blocked = null;
    const nx = this.x + dx;
    const bx = c.solidAt(nx, this.z, this.r, this.y);
    if (!bx) this.x = nx; else blocked = bx;
    const nz = this.z + dz;
    const bz = c.solidAt(this.x, nz, this.r, this.y);
    if (!bz) this.z = nz; else blocked = blocked || bz;
    return blocked;
  }

  // Looks ahead for a roof (or the street) he can leap to across a gap.
  planJump() {
    const c = this.city, y = this.y;
    for (let dist = 5; dist <= 17; dist += 1.5) {
      for (const o of [0, 0.2, -0.2, 0.4, -0.4]) {
        const a = this.yaw + o, dx = Math.sin(a), dz = -Math.cos(a);
        const tx = this.x + dx * dist, tz = this.z + dz * dist, gh = c.groundAt(tx, tz);
        if (gh < 0.5 || gh < y - 14 || gh > y + 6) continue;         // roofs a little higher, or well below
        let ok = true;
        for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) if (c.groundAt(tx + ox, tz + oz) < gh - 0.6) { ok = false; break; }
        if (!ok) continue;
        for (const f of [0.35, 0.7]) if (c.groundAt(this.x + dx * dist * f, this.z + dz * dist * f) > Math.max(y, gh) + 1) { ok = false; break; }
        if (!ok) continue;
        return { a, dx, dz, dist, gh };
      }
    }
    return null;
  }

  leap(plan) {
    const hs = Math.max(this.speed, 15), T = plan.dist / hs;
    this.vy = Math.min(24, Math.max(3, (plan.gh + 0.6 - this.y + 0.5 * G * T * T) / T));
    this.vx = plan.dx * hs; this.vz = plan.dz * hs;
    this.yaw = plan.a;
    this.mode = 'air'; this.airTime = 0; this.events.push('jump');
  }

  update(dt, inp) {
    this.t += dt;
    this.noLand = Math.max(0, this.noLand - dt);
    this.edgeCool = Math.max(0, this.edgeCool - dt);
    const c = this.city;
    if (inp.up < 0.3) this.jumpLatch = false;

    // ---------------------------------------------------------------- RUN (street or rooftop)
    if (this.mode === 'run') {
      this.yaw += inp.steer * 2.4 * dt;
      const target = inp.boost ? 25 : 17;
      this.speed += (target - this.speed) * (1 - Math.exp(-dt * 6));
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);

      // edge ahead? leap to the next roof if there is one
      const look = this.speed * 0.16 + 1.2;
      const ahead = c.groundAt(this.x + fx * look, this.z + fz * look);
      if (this.y - ahead > 2.2 && this.edgeCool === 0) {
        const plan = this.planJump();
        if (plan) { this.leap(plan); return; }
        this.edgeCool = 0.4;
      }

      const blocked = this.moveH(fx * this.speed * dt, fz * this.speed * dt);
      if (blocked) {
        const rise = blocked.top - this.y;
        if (rise <= 10.5) {                                   // vault onto it
          this.vy = Math.sqrt(2 * G * (rise + 1.8)); this.vx = fx * this.speed; this.vz = fz * this.speed;
          this.mode = 'air'; this.airTime = 0; this.events.push('jump');
        } else {                                              // too tall: fly up and over
          this.mode = 'fly'; this.vy = 12; this.noLand = 1.5; this.events.push('takeoff');
        }
        return;
      }
      const gh = c.groundAt(this.x, this.z);
      if (gh < this.y - 0.3) { this.mode = 'air'; this.vx = fx * this.speed; this.vz = fz * this.speed; this.vy = 0; this.airTime = 0; }
      else this.y = gh;

      if (inp.up > 0.65 && !this.jumpLatch) {                 // tilt back: leap
        this.jumpLatch = true;
        this.vy = 15; this.vx = fx * this.speed; this.vz = fz * this.speed;
        this.mode = 'air'; this.airTime = 0; this.events.push('jump');
      }
      return;
    }

    // ---------------------------------------------------------------- AIR (leaping / falling)
    if (this.mode === 'air') {
      this.airTime += dt;
      this.yaw += inp.steer * 1.2 * dt;
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const hs = Math.max(12, Math.hypot(this.vx, this.vz));
      const k = 1 - Math.exp(-dt * 2.5);
      this.vx += (fx * hs - this.vx) * k; this.vz += (fz * hs - this.vz) * k;
      this.vy -= G * dt;
      const blocked = this.moveH(this.vx * dt, this.vz * dt);
      if (blocked) { this.vx *= 0.2; this.vz *= 0.2; }
      this.y += this.vy * dt;
      const gh = c.groundAt(this.x, this.z);
      if (this.y <= gh && this.vy <= 0) {
        this.y = gh; this.mode = 'run'; this.speed = Math.max(12, Math.hypot(this.vx, this.vz) * 0.8); this.events.push('land');
      } else if (inp.up > 0.55 && this.airTime > 0.3 && this.vy < 6) {      // keep tilting back: take off
        this.mode = 'fly'; this.noLand = 1.0; this.events.push('takeoff');
      }
      return;
    }

    // ---------------------------------------------------------------- FLY
    this.yaw += inp.steer * 1.7 * dt;
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const target = inp.boost ? 50 : 32;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 2));
    this.vx = fx * this.speed; this.vz = fz * this.speed;
    const wallHit = this.moveH(this.vx * dt, this.vz * dt);
    let ty = inp.up * 20;                                       // tilt back climbs, tilt forward descends
    if (wallHit) ty = Math.max(ty, 16);                         // pull up over obstacles
    this.vy += (ty - this.vy) * (1 - Math.exp(-dt * 4));
    this.y += this.vy * dt;
    const gh = c.groundAt(this.x, this.z);
    if (this.y < gh + 0.5) { this.y = gh + 0.5; if (this.vy < 0) this.vy = 0; }
    if (this.y > 170) { this.y = 170; this.vy = Math.min(this.vy, 0); }
    // low over a roof or street: land and run
    if (this.noLand === 0 && this.y - gh < 3.4 && inp.up < 0.25 && this.vy <= 3) {
      this.y = gh; this.mode = 'run'; this.speed = 17; this.events.push('land');
    }
  }
}
