// محرك المباراة: ملعب من الأعلى، تتحكم في لاعبك فقط والباقي ذكاء اصطناعي
// الإحداثيات بالمتر: الطول 105 (x) والعرض 68 (y). فريقك يهاجم دائماً نحو x = 105
(function () {
  const L = 105, W = 68, GH = 3.66;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = Math.hypot;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  // أماكن الخطة 4-3-3 كنسبة من الملعب، للفريق الذي يهاجم نحو اليمين
  const BASE = {
    GK: [0.03, 0.5], DL: [0.21, 0.13], DCL: [0.17, 0.37], DCR: [0.17, 0.63], DR: [0.21, 0.87],
    CML: [0.36, 0.3], CM: [0.32, 0.5], CMR: [0.36, 0.7], AM: [0.44, 0.5],
    FL: [0.52, 0.16], FC: [0.56, 0.5], FR: [0.52, 0.84],
  };
  const USER_SLOT = { FC: 'FC', FL: 'FL', FR: 'FR', AM: 'CM', CM: 'CM', DL: 'DL', DR: 'DR', DC: 'DCL' };

  // ألوان أرضية الملعب حسب المستوى: من التراب إلى العشب المخطط
  const GROUNDS = [
    { a: '#a8875a', b: '#9e7f53', line: 'rgba(250,245,230,.75)', patch: '#8f7247' },
    { a: '#5f8a3e', b: '#587f39', line: 'rgba(250,250,240,.8)', patch: '#7d8a4a' },
    { a: '#3f8a3a', b: '#387d34', line: 'rgba(255,255,255,.85)' },
    { a: '#2f8a3c', b: '#2a7c36', line: 'rgba(255,255,255,.9)' },
    { a: '#2c8a40', b: '#257a38', line: 'rgba(255,255,255,.95)' },
  ];

  function start(opts) {
    const root = opts.root;
    root.innerHTML = `
      <div class="match">
        <canvas class="pitch"></canvas>
        <div class="hud">
          <button class="hud-pause" id="m-pause" aria-label="إيقاف مؤقت">II</button>
          <div class="score">
            <span class="sc-team sc-home"><i class="kit"></i><b class="nm"></b></span>
            <span class="sc-num"><b id="m-s0">0</b><em>-</em><b id="m-s1">0</b></span>
            <span class="sc-team sc-away"><b class="nm"></b><i class="kit"></i></span>
            <span class="sc-clock" id="m-clock">0'</span>
          </div>
          <canvas class="minimap" width="210" height="136"></canvas>
          <div class="stam"><span>لياقتك</span><i><b id="m-stam"></b></i></div>
        </div>
        <div class="toast" id="m-toast" hidden></div>
        <div class="ctrl">
          <div class="joy-zone" id="m-joy"><div class="joy" hidden><i></i></div></div>
          <div class="btns">
            <button class="b b-sprint" id="m-sprint">ركض</button>
            <button class="b b-pass" id="m-pass">تمرير</button>
            <button class="b b-shoot" id="m-shoot">تسديد</button>
          </div>
        </div>
        <div class="keys-hint">الأسهم: حركة · X: تمرير/اطلب الكرة (اضغط مطولاً لتمريرة بينية) · C: تسديد/افتكاك (اضغط مطولاً لقوة أكبر) · Shift: ركض · P: إيقاف</div>
        <div class="pause-menu" id="m-menu" hidden>
          <div class="pm-card">
            <h3>المباراة متوقفة</h3>
            <button class="btn primary" id="m-resume">استمر في اللعب</button>
            <button class="btn" id="m-simulate">محاكاة باقي المباراة</button>
          </div>
        </div>
      </div>`;

    const canvas = root.querySelector('.pitch');
    const ctx = canvas.getContext('2d');
    const mini = root.querySelector('.minimap');
    const mctx = mini.getContext('2d');
    const $ = id => root.querySelector('#' + id);
    const ground = GROUNDS[opts.tier] || GROUNDS[2];
    const sound = FC.Sound;

    // ---------- الفرق واللاعبون ----------
    const teams = [opts.ours, opts.theirs].map((sq, ti) => ({
      ...sq, index: ti, attackRight: ti === 0, players: [],
    }));
    const userSlot = USER_SLOT[FC.POSITIONS[opts.user.pos].slot];
    let user = null;
    teams.forEach(t => {
      t.players = t.squad.players.map(sp => {
        const p = {
          team: t.index, slot: sp.slot, base: BASE[sp.slot], number: sp.number, name: sp.name, attrs: sp.attrs,
          x: 0, y: 0, vx: 0, vy: 0, fx: t.attackRight ? 1 : -1, fy: 0,
          isGK: sp.slot === 'GK', isUser: false, tackleCd: 0, decideT: 0, safeT: 0, stunT: 0, holdT: 0, callT: 0,
        };
        if (t.index === 0 && sp.slot === userSlot) {
          p.isUser = true; p.attrs = opts.user.attrs; p.number = opts.user.number; p.name = opts.user.name;
          if (opts.user.pos === 'CAM') p.base = BASE.AM;
          user = p;
        }
        return p;
      });
    });
    const all = teams[0].players.concat(teams[1].players);

    const ball = { x: L / 2, y: W / 2, vx: 0, vy: 0, owner: null, lastTouch: null, noTouch: null, noTouchT: 0, pass: null, shot: null, tried: new Set(), gkTried: new Set(), assist: null };
    const score = [opts.startScore ? opts.startScore[0] : 0, opts.startScore ? opts.startScore[1] : 0];
    const stats = { goals: 0, assists: 0, shots: 0, shotsOn: 0, passOk: 0, passBad: 0, tackles: 0, intercepts: 0, lost: 0, dribbles: 0, sprint: 0 };
    const GAME_RATE = 5400 / (opts.minutes * 60); // ثانية مباراة لكل ثانية حقيقية
    let gameSec = (opts.startMinute || 0) * 60;
    const enteredAt = opts.startMinute || 0;
    let half = gameSec >= 2700 ? 2 : 1;
    let phase = 'restart', phaseT = 1.2, phaseNext = null;
    let paused = false, ended = false;
    let stamina = clamp(opts.energy, 30, 100);
    let lastPossTeam = 0;
    const events = [];

    // ---------- الإدخال ----------
    const input = { jx: 0, jy: 0, keys: new Set(), sprint: false, pass: null, shoot: null };
    let portrait = false;

    function inputVector() {
      let sx = input.jx, sy = input.jy;
      const k = input.keys;
      if (k.has('ArrowLeft') || k.has('KeyA')) sx -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) sx += 1;
      if (k.has('ArrowUp') || k.has('KeyW')) sy -= 1;
      if (k.has('ArrowDown') || k.has('KeyS')) sy += 1;
      let m = hyp(sx, sy);
      if (m < 0.15) return { x: 0, y: 0, m: 0 };
      if (m > 1) { sx /= m; sy /= m; m = 1; }
      // تحويل اتجاه الشاشة إلى اتجاه الملعب (في الوضع العمودي فريقك يهاجم للأعلى)
      return portrait ? { x: -sy, y: sx, m } : { x: sx, y: sy, m };
    }

    const press = (which, down) => {
      if (paused || ended) return;
      if (down) { if (!input[which]) input[which] = { t: performance.now() }; }
      else if (input[which]) {
        const held = (performance.now() - input[which].t) / 1000;
        input[which] = null;
        if (which === 'pass') userPass(held); else userShoot(held);
      }
    };

    const onKey = (e, down) => {
      if (e.code === 'KeyP' || e.code === 'Escape') { if (down) togglePause(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyX' || e.code === 'KeyJ') { if (!e.repeat) press('pass', down); return; }
      if (e.code === 'KeyC' || e.code === 'KeyK' || e.code === 'Space') { if (!e.repeat) press('shoot', down); return; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.sprint = down; return; }
      if (down) input.keys.add(e.code); else input.keys.delete(e.code);
    };
    const kd = e => onKey(e, true), ku = e => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // عصا التحكم: تظهر حيث تلمس في النصف الأيسر
    const joyZone = $('m-joy'), joy = joyZone.querySelector('.joy'), knob = joy.querySelector('i');
    let joyId = null, joyX = 0, joyY = 0;
    joyZone.addEventListener('pointerdown', e => {
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY;
      joyZone.setPointerCapture(e.pointerId);
      const r = joyZone.getBoundingClientRect();
      joy.style.left = (e.clientX - r.left) + 'px'; joy.style.top = (e.clientY - r.top) + 'px';
      joy.hidden = false; knob.style.transform = 'translate(-50%,-50%)';
    });
    joyZone.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - joyX, dy = e.clientY - joyY;
      const m = hyp(dx, dy), R = 48;
      if (m > R) { dx *= R / m; dy *= R / m; }
      input.jx = dx / R; input.jy = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; input.jx = input.jy = 0; joy.hidden = true; };
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);

    const bindBtn = (id, fnDown, fnUp) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); fnDown(); });
      const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); fnUp(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    bindBtn('m-pass', () => press('pass', true), () => press('pass', false));
    bindBtn('m-shoot', () => press('shoot', true), () => press('shoot', false));
    bindBtn('m-sprint', () => { input.sprint = true; }, () => { input.sprint = false; });

    $('m-pause').addEventListener('click', togglePause);
    $('m-resume').addEventListener('click', togglePause);
    $('m-simulate').addEventListener('click', simulateRest);

    function togglePause() {
      if (ended) return;
      paused = !paused;
      $('m-menu').hidden = !paused;
      if (!paused) last = performance.now();
    }

    // ---------- أدوات ----------
    const teamOf = p => teams[p.team];
    const ax = (t, x) => (t.attackRight ? x : L - x); // x داخل إطار هجوم الفريق
    const goalX = t => (t.attackRight ? L : 0);
    const maxSpd = p => 5.6 + p.attrs.pace * 0.034;
    const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);

    function segDist(px, py, ax1, ay1, bx, by) {
      const dx = bx - ax1, dy = by - ay1;
      const l2 = dx * dx + dy * dy || 1;
      const t = clamp(((px - ax1) * dx + (py - ay1) * dy) / l2, 0, 1);
      return hyp(px - (ax1 + t * dx), py - (ay1 + t * dy));
    }

    function toast(text, ms = 1600) {
      const el = $('m-toast');
      el.textContent = text; el.hidden = false;
      clearTimeout(toast.t);
      toast.t = setTimeout(() => { el.hidden = true; }, ms);
    }

    function minute() { return Math.min(90, Math.floor(gameSec / 60)); }

    // ---------- الركلات ----------
    function kick(p, tx, ty, speed, kind, target) {
      const d = hyp(tx - ball.x, ty - ball.y) || 1;
      ball.owner = null;
      ball.vx = (tx - ball.x) / d * speed;
      ball.vy = (ty - ball.y) / d * speed;
      ball.lastTouch = p; ball.noTouch = p; ball.noTouchT = 0.28;
      ball.tried = new Set(); ball.gkTried = new Set();
      ball.pass = kind === 'pass' ? { by: p, to: target } : null;
      ball.shot = kind === 'shot' ? { by: p } : null;
      p.decideT = 0.4;
      sound.kick(kind === 'shot' ? 1 : 0.6);
    }

    function passTo(p, r, through) {
      let tx = r.x, ty = r.y;
      const d0 = hyp(tx - p.x, ty - p.y);
      let speed = clamp(d0 * 0.95 + 6, 11, 27);
      const t = d0 / (speed * 0.75);
      tx += r.vx * t; ty += r.vy * t;
      if (through) {
        const t2 = teamOf(r);
        tx += (t2.attackRight ? 1 : -1) * 6;
        speed = clamp(speed + 2, 12, 28);
      }
      const err = (100 - p.attrs.passing) / 100 * 0.14 * gauss() * (p.stunT > 0 ? 2 : 1);
      const ang = Math.atan2(ty - ball.y, tx - ball.x) + err;
      const d = hyp(tx - ball.x, ty - ball.y);
      kick(p, ball.x + Math.cos(ang) * d, ball.y + Math.sin(ang) * d, speed, 'pass', r);
    }

    function shoot(p, aimY, power) {
      const t = teamOf(p);
      const gx = goalX(t);
      const speed = 17 + power * 15;
      const ang0 = Math.atan2(aimY - ball.y, gx - ball.x);
      const distG = Math.abs(gx - ball.x);
      const err = (0.035 + (100 - p.attrs.shooting) / 100 * 0.11 + (power > 0.96 ? 0.06 : 0) + distG / 900) * gauss();
      const ang = ang0 + err;
      kick(p, ball.x + Math.cos(ang) * 50, ball.y + Math.sin(ang) * 50, speed, 'shot');
      if (p.isUser) stats.shots++;
    }

    // ---------- تحكم المستخدم ----------
    function userPass(held) {
      if (phase !== 'play' && phase !== 'restart') return;
      if (ball.owner !== user) { user.callTimer = 2.2; return; } // اطلب الكرة
      const iv = inputVector();
      const dx = iv.m ? iv.x : user.fx, dy = iv.m ? iv.y : user.fy;
      let best = null, bestS = -1e9;
      for (const q of teams[0].players) {
        if (q === user) continue;
        const ox = q.x - user.x, oy = q.y - user.y;
        const d = hyp(ox, oy);
        if (d < 2) continue;
        const cos = (ox * dx + oy * dy) / d;
        const s = cos * 30 - Math.abs(d - 16) * 0.6;
        if (s > bestS) { bestS = s; best = q; }
      }
      if (best) { passTo(user, best, held > 0.3); if (phase === 'restart') { phase = 'play'; } }
    }

    function userShoot(held) {
      if (phase !== 'play' && phase !== 'restart') return;
      if (ball.owner === user) {
        const iv = inputVector();
        // اتجاه الإدخال الجانبي يختار الزاوية
        const side = clamp(iv.y * 1.6, -1, 1);
        const aimY = W / 2 + side * (GH - 0.6);
        shoot(user, aimY, clamp(held / 0.8, 0.3, 1));
        if (phase === 'restart') phase = 'play';
        return;
      }
      // افتكاك الكرة
      if (user.tackleCd > 0) return;
      const c = ball.owner;
      user.tackleCd = 0.8;
      if (c && c.team === 1 && dist(user, c) < 2.4) {
        const d = dist(user, c) || 1;
        user.vx += (c.x - user.x) / d * 5; user.vy += (c.y - user.y) / d * 5;
        if (c.safeT <= 0 && Math.random() < clamp(0.5 + (user.attrs.defending - c.attrs.dribbling) / 110, 0.15, 0.9)) {
          winBall(user, c); stats.tackles++;
          sound.kick(0.4);
        } else {
          user.stunT = 0.45; c.safeT = 0.4;
        }
      } else if (!c && dist(user, ball) < 2.6) {
        user.vx += (ball.x - user.x) * 2; user.vy += (ball.y - user.y) * 2;
      }
    }

    function winBall(p, from) {
      ball.owner = p; ball.lastTouch = p; ball.pass = null; ball.shot = null;
      p.safeT = 0.6; p.decideT = 0.25;
      if (from) { from.stunT = 0.5; if (from.isUser) stats.lost++; }
      lastPossTeam = p.team;
    }

    // ---------- استلام الكرة ----------
    function receive(p) {
      const prev = ball.pass;
      if (prev && prev.by.team === p.team && prev.by !== p) {
        if (prev.by.isUser) stats.passOk++;
        ball.assist = { by: prev.by, t: gameSec };
      } else if (prev && prev.by.team !== p.team) {
        if (prev.by.isUser) stats.passBad++;
        if (p.isUser) stats.intercepts++;
        ball.assist = null;
      } else if (!prev || prev.by.team !== p.team) {
        ball.assist = null;
      }
      if (p.isUser) p.callTimer = 0;
      winBall(p, null);
      if (p.isGK) p.holdT = rnd(0.7, 1.2);
    }

    // ---------- الذكاء الاصطناعي ----------
    function targetFor(p) {
      const t = teamOf(p);
      const bxa = ax(t, ball.x);
      const hasBall = ball.owner && ball.owner.team === t.index;
      if (p.isGK) {
        const gx = bxa < 30 ? 2.4 : 1.8 + Math.min(4, (bxa - 30) / 15);
        const gy = W / 2 + clamp((ball.y - W / 2) * 0.22, -3, 3);
        return [ax(t, gx), gy];
      }
      let tx = p.base[0] * L + (bxa - L * 0.45) * 0.55 + (hasBall ? 9 : -3);
      const isDef = p.slot[0] === 'D', isFwd = p.slot[0] === 'F';
      // عند الاستحواذ: المهاجمون يركضون خلف الكرة والوسط يساندها
      if (hasBall && isFwd) tx = Math.max(tx, bxa + 7);
      if (hasBall && p.slot[0] === 'C') tx = Math.max(tx, bxa - 8);
      tx = clamp(tx, isDef ? 6 : 14, isFwd ? L - 10 : isDef ? 62 : 84);
      // لا يتقدم الدفاع أمام الكرة كثيراً عندما يدافع الفريق
      if (!hasBall && tx > bxa + 4 && isDef) tx = Math.max(bxa - 4, 6);
      let ty = (p.base[1] * 0.84 + 0.08) * W;
      ty = ty * 0.75 + ball.y * 0.25;
      return [ax(t, tx), clamp(ty, 2, W - 2)];
    }

    function moveToward(p, tx, ty, urgency, dt) {
      const dx = tx - p.x, dy = ty - p.y;
      const d = hyp(dx, dy);
      let sp = maxSpd(p) * urgency;
      if (d < 3) sp *= d / 3;
      const dvx = d > 0.05 ? dx / d * sp : 0, dvy = d > 0.05 ? dy / d * sp : 0;
      const a = Math.min(1, dt * 5);
      p.vx += (dvx - p.vx) * a; p.vy += (dvy - p.vy) * a;
    }

    // أقرب نقطة على مسار الكرة يستطيع اللاعب بلوغها قبلها
    function interceptPoint(p) {
      const k = 0.85, sp = maxSpd(p);
      for (let tau = 0; tau <= 2.5; tau += 0.1) {
        const f = (1 - Math.exp(-k * tau)) / k;
        const bx = ball.x + ball.vx * f, by = ball.y + ball.vy * f;
        if (hyp(bx - p.x, by - p.y) / sp <= tau + 0.1) return [bx, by];
      }
      const f = (1 - Math.exp(-k * 2.5)) / k;
      return [ball.x + ball.vx * f, ball.y + ball.vy * f];
    }

    function nearestOpp(p) {
      let best = null, bd = 1e9;
      for (const q of teams[1 - p.team].players) {
        const d = dist(p, q);
        if (d < bd) { bd = d; best = q; }
      }
      return [best, bd];
    }

    function bestPass(p) {
      const t = teamOf(p);
      const opps = teams[1 - p.team].players;
      let best = null, bestS = -1e9;
      for (const r of t.players) {
        if (r === p) continue;
        const d = dist(p, r);
        if (d < 4 || d > 38) continue;
        let open = 99;
        for (const o of opps) {
          open = Math.min(open, segDist(o.x, o.y, p.x, p.y, r.x, r.y) * 1.2, dist(o, r));
        }
        if (open < 1.6) continue;
        const prog = ax(t, r.x) - ax(t, p.x);
        let s = prog * (prog > 0 ? 0.6 : 1) + Math.min(open, 6) * 1.5 - d * 0.1;
        if (r.isGK) s -= 25;
        if (ball.assist && ball.assist.by === r && gameSec - ball.assist.t < 20) s -= 14; // لا ترجعها لمن مررها لك
        if (r.isUser) s += 5 + (r.callTimer > 0 ? 25 : 0);
        if (s > bestS) { bestS = s; best = r; }
      }
      // اللاعب طلب الكرة: مرّرها حتى لو لم يكن الخيار الأفضل تماماً
      if (user.team === p.team && user.callTimer > 0 && best !== user && dist(p, user) < 40 && Math.random() < 0.7) {
        return { r: user, s: 30 };
      }
      return best ? { r: best, s: bestS } : null;
    }

    function carrierAI(p, dt) {
      const t = teamOf(p);
      const gx = goalX(t);
      const [opp, od] = nearestOpp(p);
      p.decideT -= dt;
      if (p.isGK) {
        p.holdT -= dt;
        moveToward(p, p.x, p.y, 0, dt);
        if (p.holdT > 0) return;
        const bp = bestPass(p);
        if (bp && bp.s > -5) passTo(p, bp.r, false);
        else kick(p, ax(t, 60), rnd(10, W - 10), 26, 'pass', null);
        return;
      }
      if (p.decideT <= 0) {
        p.decideT = rnd(0.25, 0.5);
        const dG = hyp(gx - p.x, W / 2 - p.y);
        const wide = Math.abs(p.y - W / 2);
        if (dG < 28 && wide < 20) {
          let pr = dG < 12 ? 0.8 : dG < 18 ? 0.5 : dG < 24 ? 0.22 : 0.08;
          if (od < 2.5) pr += 0.15;
          if (Math.random() < pr) {
            const aim = W / 2 + (Math.random() < 0.5 ? -1 : 1) * rnd(1, GH - 0.5);
            shoot(p, aim, rnd(0.55, 0.95));
            return;
          }
        }
        // مساحة أمامه؟ يتقدم بالكرة بدل التمرير
        const dir = t.attackRight ? 1 : -1;
        let ahead = 99;
        for (const o of teams[1 - p.team].players) {
          const fwd = (o.x - p.x) * dir;
          if (fwd > -1 && fwd < 12 && Math.abs(o.y - p.y) < fwd * 0.8 + 2) ahead = Math.min(ahead, hyp(o.x - p.x, o.y - p.y));
        }
        const bp = bestPass(p);
        const isDef = p.slot[0] === 'D';
        const calling = bp && bp.r.isUser && bp.r.callTimer > 0;
        const byline = ax(t, p.x) > L - 18 && wide > 12; // قرب خط المرمى على الجناح: عرضية
        if (byline && bp && bp.s > -12) { passTo(p, bp.r, false); return; }
        const space = ahead > 7 && !(isDef && ax(t, p.x) < 30);
        const takeOn = !isDef && Math.random() < p.attrs.dribbling / 260;
        if (bp && (calling || (!takeOn && ((od < 3 && bp.s > 0) || (!space && bp.s > (isDef ? 2 : 6)))) || bp.s > 22)) {
          passTo(p, bp.r, bp.r.slot[0] === 'F' && Math.random() < 0.35);
          return;
        }
      }
      // المراوغة نحو المرمى مع الابتعاد عن أقرب خصم
      let tx = gx, ty = W / 2 + (p.y - W / 2) * 0.6;
      if (ax(t, p.x) > L - 20) { tx = ax(t, L - 8); ty = W / 2 + (p.y - W / 2) * 0.3; } // يدخل نحو المنطقة
      if (opp && od < 5) {
        const away = (p.y - opp.y) || (Math.random() - 0.5);
        ty += Math.sign(away) * 8;
      }
      moveToward(p, tx, clamp(ty, 3, W - 3), 0.82, dt);
    }

    function teamAI(t, dt) {
      const owner = ball.owner;
      const hasBall = owner && owner.team === t.index;
      // من يضغط على حامل الكرة أو يطارد الكرة الحرة
      let chasers = [];
      const receiver = !owner && ball.pass && ball.pass.to && ball.pass.to.team === t.index && !ball.pass.to.isUser ? ball.pass.to : null;
      if (!hasBall && !receiver) {
        const cand = t.players.filter(p => !p.isGK && !p.isUser)
          .map(p => {
            const [ix, iy] = owner ? [owner.x, owner.y] : interceptPoint(p);
            return { p, d: hyp(p.x - ix, p.y - iy) / maxSpd(p) };
          })
          .sort((a, b) => a.d - b.d);
        const n = owner ? (ax(t, ball.x) < L * 0.55 ? 2 : 1) : 1;
        chasers = cand.slice(0, n).map(c => c.p);
      }
      for (const p of t.players) {
        if (p.isUser) continue;
        if (p === owner) { carrierAI(p, dt); continue; }
        if (p.isGK) { keeperAI(p, t, dt); continue; }
        if (p === receiver) {
          const [ix, iy] = interceptPoint(p);
          moveToward(p, ix, iy, 1, dt);
          continue;
        }
        if (chasers.includes(p)) {
          const [tx, ty] = owner ? [owner.x, owner.y] : interceptPoint(p);
          moveToward(p, tx, ty, 0.97, dt);
          if (owner && owner.team !== p.team) tryTackle(p, owner);
          continue;
        }
        const [tx, ty] = targetFor(p);
        moveToward(p, tx, ty, hasBall ? 0.72 : 0.8, dt);
      }
    }

    function tryTackle(p, c) {
      if (p.tackleCd > 0 || c.safeT > 0 || c.isGK || dist(p, c) > 1.6) return;
      p.tackleCd = rnd(0.6, 1.1);
      let pr = 0.27 + (p.attrs.defending - c.attrs.dribbling) / 170 + (p.attrs.physical - c.attrs.physical) / 400;
      if (c.isUser) pr *= 0.75;
      if (Math.random() < clamp(pr, 0.05, 0.6)) {
        if (Math.random() < 0.55) winBall(p, c);
        else {
          ball.owner = null; ball.lastTouch = p; ball.pass = null;
          const a = rnd(0, Math.PI * 2);
          ball.vx = Math.cos(a) * 4; ball.vy = Math.sin(a) * 4;
          ball.noTouch = c; ball.noTouchT = 0.4;
          if (c.isUser) stats.lost++;
          c.stunT = 0.4;
        }
      } else if (c.isUser) {
        stats.dribbles++;
        c.safeT = 0.35;
      }
    }

    function keeperAI(p, t, dt) {
      const ownX = t.attackRight ? 0 : L;
      if (ball.shot && !ball.owner) {
        const vxTo = ownX - ball.x;
        if (Math.sign(ball.vx) === Math.sign(vxTo) && Math.abs(ball.vx) > 2) {
          const tt = (ownX - ball.x) / ball.vx;
          const yc = clamp(ball.y + ball.vy * tt, W / 2 - GH - 1, W / 2 + GH + 1);
          moveToward(p, ax(t, 1.6), yc, 1, dt);
          return;
        }
      }
      // يخرج للكرة الحرة داخل منطقته
      const bxa = ax(t, ball.x);
      if (!ball.owner && bxa < 15 && Math.abs(ball.y - W / 2) < 18) {
        const mates = t.players.filter(q => !q.isGK).map(q => dist(q, ball));
        if (dist(p, ball) < Math.min(...mates) + 1) { moveToward(p, ball.x, ball.y, 1, dt); return; }
      }
      const [tx, ty] = targetFor(p);
      moveToward(p, tx, ty, 0.7, dt);
    }

    // ---------- اللاعب الذي تتحكم فيه ----------
    function userUpdate(dt) {
      const iv = inputVector();
      const own = ball.owner === user;
      const canSprint = stamina > 12 && input.sprint;
      let sp = maxSpd(user) * (canSprint ? 1.05 : 0.8) * (own ? 0.92 : 1) * (0.75 + stamina / 400);
      if (user.stunT > 0) sp *= 0.5;
      const a = Math.min(1, dt * (own ? 7 : 9));
      user.vx += (iv.x * sp * iv.m - user.vx) * a;
      user.vy += (iv.y * sp * iv.m - user.vy) * a;
      const moving = hyp(user.vx, user.vy) > 2;
      if (canSprint && iv.m > 0.3) {
        stamina = Math.max(0, stamina - dt * (10 - user.attrs.physical * 0.05));
        stats.sprint += dt;
      } else {
        stamina = Math.min(100, stamina + dt * (moving ? 2 : 4.5));
      }
      user.callTimer = Math.max(0, (user.callTimer || 0) - dt);
    }

    // ---------- الفيزياء ----------
    function physics(dt, ballLive) {
      for (const p of all) {
        p.tackleCd -= dt; p.safeT -= dt; p.stunT -= dt;
        p.x = clamp(p.x + p.vx * dt, -3, L + 3);
        p.y = clamp(p.y + p.vy * dt, -3, W + 3);
        const s = hyp(p.vx, p.vy);
        if (s > 0.6) { p.fx = p.vx / s; p.fy = p.vy / s; }
      }
      // منع التداخل بين اللاعبين
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
        if (d > 0 && d < 1.3) {
          const push = (1.3 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      if (!ballLive) return;
      let px = ball.x, py = ball.y;
      if (ball.owner) {
        const o = ball.owner;
        ball.x = o.x + o.fx * 0.75; ball.y = o.y + o.fy * 0.75;
        ball.vx = o.vx; ball.vy = o.vy;
        if (ball.x >= 0 && ball.x <= L && ball.y >= 0 && ball.y <= W) return;
        // حامل الكرة خرج بها من الملعب
        ball.lastTouch = o; ball.owner = null; ball.shot = null;
        px = clamp(ball.x, 0.01, L - 0.01); py = clamp(ball.y, 0.01, W - 0.01);
      } else {
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const f = Math.exp(-dt * 0.85);
      ball.vx *= f; ball.vy *= f;
      if (hyp(ball.vx, ball.vy) < 0.3) { ball.vx = ball.vy = 0; }
      ball.noTouchT -= dt;
      }

      // هدف أو خروج
      if (ball.x < 0 || ball.x > L) {
        const lineX = ball.x < 0 ? 0 : L;
        const t = (lineX - px) / ((ball.x - px) || 1e-6);
        const yc = py + (ball.y - py) * t;
        if (Math.abs(yc - W / 2) < GH) { goal(ball.x > L ? 0 : 1); return; }
        // الكرة خرجت من خط المرمى: ركنية أو ركلة مرمى
        const defTeam = ball.x > L ? 1 : 0;
        if (ball.lastTouch && ball.lastTouch.team === defTeam) {
          restart(1 - defTeam, lineX === 0 ? 0.6 : L - 0.6, yc < W / 2 ? 0.6 : W - 0.6, 'ركنية');
        } else {
          restart(defTeam, defTeam === 0 ? 5.5 : L - 5.5, W / 2 + (yc < W / 2 ? -9 : 9), 'ركلة مرمى', true);
        }
        return;
      }
      if (ball.y < 0 || ball.y > W) {
        const t = ball.lastTouch ? 1 - ball.lastTouch.team : 0;
        restart(t, clamp(ball.x, 1, L - 1), ball.y < 0 ? 0.4 : W - 0.4, 'رمية تماس');
        return;
      }

      // الحارس يتصدى
      if (ball.shot) {
        for (const t of teams) {
          const g = t.players[0];
          const ownX = t.attackRight ? 0 : L;
          if (ball.gkTried.has(g) || Math.sign(ball.vx) !== Math.sign(ownX - ball.x)) continue;
          const reach = 1.3 + g.attrs.keeping / 100 * 1.7;
          if (dist(g, ball) < reach) {
            ball.gkTried.add(g);
            const sp = hyp(ball.vx, ball.vy);
            const pr = clamp(0.36 + g.attrs.keeping / 250 - (sp - 20) / 25 - (ball.shot.by.attrs.shooting - g.attrs.keeping) / 250, 0.1, 0.85);
            if (Math.random() < pr) {
              if (ball.shot.by.isUser) stats.shotsOn++;
              if (sp < 23 && Math.random() < 0.6) { receive(g); g.holdT = rnd(0.8, 1.4); toast('تصدى الحارس', 900); }
              else {
                ball.vx = -ball.vx * rnd(0.2, 0.4); ball.vy = rnd(-9, 9);
                ball.shot = null; ball.lastTouch = g; ball.tried = new Set();
                toast('أبعدها الحارس', 900);
              }
              sound.kick(0.5);
              return;
            }
          }
        }
      }

      // أقرب لاعب يستلم الكرة
      const sp = hyp(ball.vx, ball.vy);
      if (sp < 7) ball.tried.clear(); // كرة بطيئة: يحق للجميع محاولة استلامها من جديد
      let best = null, bd = 1e9;
      for (const p of all) {
        if (p === ball.noTouch && ball.noTouchT > 0) continue;
        if (ball.tried.has(p)) continue;
        const d = dist(p, ball);
        const reach = p.isGK && ax(teamOf(p), ball.x) < 17 ? 1.4 : 1.0;
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (best) {
        let pr = 1;
        const intended = ball.pass && ball.pass.to === best;
        if (!intended && sp > 9) pr = clamp(0.55 + best.attrs.defending / 250 - sp / 55, 0.15, 0.9);
        if (ball.shot && !best.isGK) pr = Math.min(pr, 0.35);
        if (Math.random() < pr) receive(best);
        else ball.tried.add(best);
      }
    }

    // ---------- الأحداث ----------
    function goal(teamIdx) {
      score[teamIdx]++;
      const t = teams[teamIdx];
      let scorer = ball.shot ? ball.shot.by : ball.lastTouch;
      if (scorer && scorer.team !== teamIdx) scorer = null; // هدف عكسي
      let text = `هدف! ${t.name}`;
      if (scorer && scorer.isUser) { stats.goals++; stats.shotsOn++; text = `هدف! ${user.name} يسجل`; }
      if (scorer && ball.assist && ball.assist.by.team === teamIdx && ball.assist.by !== scorer && gameSec - ball.assist.t < 15) {
        if (ball.assist.by.isUser) { stats.assists++; text += ` · تمريرة حاسمة منك`; }
      }
      events.push({ min: minute(), team: teamIdx, user: !!(scorer && scorer.isUser) });
      $('m-s0').textContent = score[0]; $('m-s1').textContent = score[1];
      toast(text, 2200);
      sound.goal(teamIdx === 0);
      ball.owner = null; ball.vx *= 0.2; ball.vy *= 0.2; ball.shot = null;
      phase = 'goal'; phaseT = 2.4; phaseNext = () => kickoff(1 - teamIdx);
    }

    function restart(teamIdx, x, y, label, gk) {
      ball.owner = null; ball.vx = ball.vy = 0; ball.x = x; ball.y = y; ball.shot = null; ball.pass = null;
      const t = teams[teamIdx];
      let taker = t.players[0];
      if (!gk) {
        let bd = 1e9;
        for (const p of t.players) { if (p.isGK) continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; taker = p; } }
      }
      taker.x = clamp(x + (x < 1 ? -0.6 : x > L - 1 ? 0.6 : 0), -1, L + 1);
      taker.y = y + (y < 1 ? -0.5 : y > W - 1 ? 0.5 : 0);
      taker.vx = taker.vy = 0;
      const fd = hyp(L / 2 - x, W / 2 - y) || 1;
      taker.fx = (L / 2 - x) / fd; taker.fy = (W / 2 - y) / fd;
      for (const p of teams[1 - teamIdx].players) {
        const d = hyp(p.x - x, p.y - y);
        if (d < 6) { p.x += (p.x - x) / (d || 1) * (6 - d); p.y += (p.y - y) / (d || 1) * (6 - d); }
      }
      winBall(taker, null);
      taker.safeT = 2; taker.decideT = taker.isUser ? 99 : rnd(0.6, 1);
      taker.holdT = 0.6;
      phase = 'restart'; phaseT = taker.isUser ? 99 : 0.9; phaseNext = null;
      sound.whistle(0.25);
      if (label) toast(label, 900);
    }

    function kickoff(teamIdx) {
      for (const t of teams) for (const p of t.players) {
        const fx = Math.min(p.base[0] * 0.95, 0.46);
        p.x = ax(t, fx * L); p.y = (p.base[1] * 0.84 + 0.08) * W; p.vx = p.vy = 0;
      }
      const t = teams[teamIdx];
      const kicker = t.players.find(p => p.slot === 'FC');
      kicker.x = L / 2 + (t.attackRight ? -0.8 : 0.8); kicker.y = W / 2;
      ball.x = L / 2; ball.y = W / 2; ball.vx = ball.vy = 0;
      winBall(kicker, null);
      kicker.safeT = 2; kicker.decideT = kicker.isUser ? 99 : 0.8;
      phase = 'restart'; phaseT = kicker.isUser ? 99 : 1.2; phaseNext = null;
      sound.whistle(0.4);
    }

    function simulateRest() {
      // يحاكي الدقائق المتبقية بحسب قوة الفريقين
      const remain = Math.max(0, 90 - minute()) / 90;
      const diff = (teams[0].strength - teams[1].strength) / 10;
      const g0 = FC.Career.poisson(clamp(1.3 + diff * 0.6, 0.2, 4) * remain);
      const g1 = FC.Career.poisson(clamp(1.2 - diff * 0.6, 0.2, 4) * remain);
      score[0] += g0; score[1] += g1;
      finish();
    }

    function finish() {
      if (ended) return;
      ended = true;
      sound.whistle(1);
      cleanup();
      const minutesPlayed = Math.max(1, minute() - enteredAt);
      gameSec = 5400;
      opts.onEnd({ ours: score[0], theirs: score[1], stats, minutes: minutesPlayed, played: true, events });
    }

    // ---------- الرسم ----------
    let cw = 0, ch = 0, dpr = 1, camX = L / 2, camY = W / 2;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.clientWidth; ch = canvas.clientHeight;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      portrait = ch > cw * 1.05;
    }
    window.addEventListener('resize', resize);
    resize();

    function view() {
      const s = portrait ? ch / 68 : cw / 56;
      return { s, rot: portrait ? -Math.PI / 2 : 0 };
    }
    function toScreen(x, y) {
      const { s } = view();
      const dx = (x - camX) * s, dy = (y - camY) * s;
      return portrait ? [cw / 2 + dy, ch / 2 - dx] : [cw / 2 + dx, ch / 2 + dy];
    }

    function draw() {
      const { s, rot } = view();
      const tx = user.x * 0.7 + ball.x * 0.3, ty = user.y * 0.7 + ball.y * 0.3;
      camX += (tx - camX) * 0.08; camY += (ty - camY) * 0.08;
      const halfLong = (portrait ? ch : cw) / 2 / s, halfShort = (portrait ? cw : ch) / 2 / s;
      camX = clamp(camX, halfLong - 6, L - halfLong + 6);
      camY = W < halfShort * 2 - 8 ? W / 2 : clamp(camY, halfShort - 4, W - halfShort + 4);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = ground.b;
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.translate(-camX, -camY);

      // العشب أو التراب
      ctx.fillStyle = ground.a;
      ctx.fillRect(-8, -8, L + 16, W + 16);
      for (let i = 0; i < 20; i += 2) { ctx.fillStyle = ground.b; ctx.fillRect(i * L / 20, -8, L / 20, W + 16); }
      if (ground.patch) {
        ctx.fillStyle = ground.patch;
        for (const [px, py, r] of PATCHES) { ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.6, 0.4, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = ground.line; ctx.lineWidth = 0.14;
      ctx.strokeRect(0, 0, L, W);
      ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, W); ctx.stroke();
      ctx.beginPath(); ctx.arc(L / 2, W / 2, 9.15, 0, Math.PI * 2); ctx.stroke();
      for (const side of [0, 1]) {
        const x0 = side ? L - 16.5 : 0, x1 = side ? L - 5.5 : 0;
        ctx.strokeRect(x0, W / 2 - 20.16, 16.5, 40.32);
        ctx.strokeRect(x1, W / 2 - 9.16, 5.5, 18.32);
        ctx.beginPath(); ctx.arc(side ? L - 11 : 11, W / 2, 0.25, 0, Math.PI * 2); ctx.fillStyle = ground.line; ctx.fill();
        ctx.beginPath();
        if (side) ctx.arc(L - 11, W / 2, 9.15, Math.PI - 0.93, Math.PI + 0.93);
        else ctx.arc(11, W / 2, 9.15, -0.93, 0.93);
        ctx.stroke();
        // المرمى والشباك
        const gx = side ? L : -2;
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(gx, W / 2 - GH, 2, GH * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.05;
        for (let k = 0; k <= 14; k++) { ctx.beginPath(); ctx.moveTo(gx, W / 2 - GH + k * GH / 7); ctx.lineTo(gx + 2, W / 2 - GH + k * GH / 7); ctx.stroke(); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.22;
        ctx.strokeRect(gx, W / 2 - GH, 2, GH * 2);
        ctx.strokeStyle = ground.line; ctx.lineWidth = 0.14;
      }

      // اللاعبون
      for (const p of all) {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(p.x + 0.25, p.y + 0.3, 0.8, 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (const p of all) {
        const t = teams[p.team];
        const [c1, c2] = p.isGK ? (p.team === 0 ? ['#2d2d2d', '#f2b134'] : ['#f2d034', '#1b2a33']) : t.colors;
        if (p.isUser) {
          ctx.strokeStyle = '#ffc94a'; ctx.lineWidth = 0.22;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.35, 0, Math.PI * 2); ctx.stroke();
          if (p.callTimer > 0) {
            ctx.strokeStyle = 'rgba(255,201,74,.5)';
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 + (p.callTimer % 0.5) * 2, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 0.78, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c2; ctx.lineWidth = 0.22; ctx.stroke();
        // اتجاه الجسم
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(p.x + p.fx * 0.55, p.y + p.fy * 0.55, 0.22, 0, Math.PI * 2); ctx.fill();
      }
      // الكرة
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(ball.x + 0.18, ball.y + 0.22, 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbfbf6';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.restore();

      // الأرقام والسهم بإحداثيات الشاشة حتى لا تدور مع الملعب
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(9, s * 0.8)}px "Readex Pro", system-ui, sans-serif`;
      for (const p of all) {
        const [sx, sy] = toScreen(p.x, p.y);
        if (sx < -20 || sy < -20 || sx > cw + 20 || sy > ch + 20) continue;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillText(p.number, sx, sy + 0.5);
      }
      const [ux, uy] = toScreen(user.x, user.y);
      ctx.fillStyle = '#ffc94a';
      ctx.beginPath(); ctx.moveTo(ux, uy - s * 1.6); ctx.lineTo(ux - 7, uy - s * 1.6 - 10); ctx.lineTo(ux + 7, uy - s * 1.6 - 10); ctx.closePath(); ctx.fill();
      ctx.font = `600 12px "Readex Pro", system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(user.name, ux, uy - s * 1.6 - 20);

      // شريط قوة التسديد
      if (input.shoot && ball.owner === user) {
        const pw = clamp((performance.now() - input.shoot.t) / 800, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(ux - 22, uy + s * 1.4, 44, 6);
        ctx.fillStyle = pw > 0.96 ? '#e5533d' : '#ffc94a'; ctx.fillRect(ux - 22, uy + s * 1.4, 44 * pw, 6);
      }
      drawMini();
    }

    function drawMini() {
      const rotM = portrait;
      if (rotM && mini.width !== 136) { mini.width = 136; mini.height = 210; }
      if (!rotM && mini.width !== 210) { mini.width = 210; mini.height = 136; }
      const w = mini.width, h = mini.height;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, w, h);
      mctx.fillStyle = 'rgba(14,32,24,.72)'; mctx.fillRect(0, 0, w, h);
      mctx.strokeStyle = 'rgba(255,255,255,.35)'; mctx.lineWidth = 1;
      const m = (x, y) => rotM ? [y / W * w, h - x / L * h] : [x / L * w, y / W * h];
      mctx.strokeRect(2, 2, w - 4, h - 4);
      const [a1, b1] = m(L / 2, 0), [a2, b2] = m(L / 2, W);
      mctx.beginPath(); mctx.moveTo(a1, b1); mctx.lineTo(a2, b2); mctx.stroke();
      for (const p of all) {
        const [x, y] = m(p.x, p.y);
        mctx.fillStyle = p.isUser ? '#ffc94a' : teams[p.team].colors[0];
        mctx.beginPath(); mctx.arc(x, y, p.isUser ? 4 : 3, 0, Math.PI * 2); mctx.fill();
        if (!p.isUser) { mctx.strokeStyle = 'rgba(0,0,0,.5)'; mctx.stroke(); }
      }
      const [bx, by] = m(ball.x, ball.y);
      mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(bx, by, 2.2, 0, Math.PI * 2); mctx.fill();
    }

    // ---------- الحلقة الرئيسية ----------
    let last = performance.now(), raf = 0;
    let lblPass = '', lblShoot = '';
    function frame(now) {
      raf = requestAnimationFrame(frame);
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (paused || ended) return;

      if (phase === 'play') {
        gameSec += dt * GAME_RATE;
        if (half === 1 && gameSec >= 2700) {
          half = 2; gameSec = 2700;
          toast('نهاية الشوط الأول', 1800);
          phase = 'goal'; phaseT = 2; phaseNext = () => kickoff(1);
        } else if (gameSec >= 5400) { gameSec = 5400; finish(); return; }
      } else {
        phaseT -= dt;
        if (phaseT <= 0) {
          if (phaseNext) { const f = phaseNext; phaseNext = null; f(); }
          else phase = 'play';
        }
      }

      // الذكاء الاصطناعي يعمل دائماً، والكرة تتحرك فقط أثناء اللعب
      if (phase === 'play' || phase === 'goal') {
        for (const t of teams) teamAI(t, dt);
      } else {
        for (const t of teams) for (const p of t.players) {
          if (p.isUser || p === ball.owner) { if (p === ball.owner && !p.isUser) { p.vx *= 0.8; p.vy *= 0.8; } continue; }
          const [tx, ty] = targetFor(p);
          moveToward(p, tx, ty, 0.6, dt);
        }
      }
      userUpdate(dt);
      if (phase === 'restart' && ball.owner === user) { user.vx = user.vy = 0; }
      if (phase === 'restart' && ball.owner !== user) { for (const p of all) if (p === ball.owner) { p.vx = p.vy = 0; } }
      if (phase === 'play' || phase === 'goal') physics(dt, phase === 'play');
      else for (const p of all) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (phase === 'restart' && ball.owner) { ball.x = ball.owner.x + ball.owner.fx * 0.75; ball.y = ball.owner.y + ball.owner.fy * 0.75; }

      $('m-clock').textContent = minute() + "'";
      $('m-stam').style.width = stamina + '%';
      const own = ball.owner === user;
      const lp = own ? 'تمرير' : 'اطلب';
      const ls = own ? 'تسديد' : 'افتك';
      if (lp !== lblPass) { $('m-pass').textContent = lblPass = lp; }
      if (ls !== lblShoot) { $('m-shoot').textContent = lblShoot = ls; }
      draw();
    }

    // بداية المباراة
    const homeEl = root.querySelector('.sc-home'), awayEl = root.querySelector('.sc-away');
    homeEl.querySelector('.nm').textContent = teams[0].name;
    homeEl.querySelector('.kit').style.background = teams[0].colors[0];
    awayEl.querySelector('.nm').textContent = teams[1].name;
    awayEl.querySelector('.kit').style.background = teams[1].colors[0];
    $('m-s0').textContent = score[0]; $('m-s1').textContent = score[1];
    FC.Match.debug = { all, ball, teams, stats }; // للاختبار من وحدة التحكم
    kickoff(opts.userIsHome ? 0 : 1);
    if (opts.startMinute) toast(`تدخل بديلاً في الدقيقة ${opts.startMinute}`, 2200);
    else toast('صافرة البداية', 1200);
    raf = requestAnimationFrame(frame);

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', resize);
    }

    return { stop: () => { ended = true; cleanup(); } };
  }

  // بقع ثابتة في الملاعب الترابية والبلدية
  const PATCHES = [];
  for (let i = 0; i < 70; i++) PATCHES.push([Math.random() * L, Math.random() * W, 0.4 + Math.random() * 1.6]);

  FC.Match = { start };
})();
