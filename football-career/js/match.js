// محرك المباراة: تتحكم في لاعبك فقط والباقي ذكاء اصطناعي، والرسم ثلاثي الأبعاد في render3d.js
// الإحداثيات بالمتر: الطول 105 (x) والعرض 68 (y) والارتفاع z. فريقك يهاجم دائماً نحو x = 105 (يمين الشاشة)
(function () {
  const L = 105, W = 68, GH = 3.66, BAR = 2.44, G = 9.8;
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

  // خطوة فيزياء للكرة: في الهواء جاذبية ومقاومة هواء، وعلى الأرض احتكاك وارتداد
  function stepBall(b, dt) {
    if (b.z > 0 || b.vz > 0) {
      b.vz -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const drag = Math.exp(-dt * 0.12);
      b.vx *= drag; b.vy *= drag;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -2.5) { b.vz = -b.vz * 0.45; b.vx *= 0.8; b.vy *= 0.8; } else b.vz = 0;
      }
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const f = Math.exp(-dt * 0.85);
      b.vx *= f; b.vy *= f;
      if (hyp(b.vx, b.vy) < 0.3) b.vx = b.vy = 0;
    }
  }

  function start(opts) {
    const root = opts.root;
    root.innerHTML = `
      <div class="match">
        <div class="view"></div>
        <div class="hud">
          <button class="hud-pause" id="m-pause" aria-label="إيقاف مؤقت">II</button>
          <div class="score">
            <span class="sc-team"><i class="kit"></i><b class="nm"></b></span>
            <span class="sc-num"><b id="m-s0">0</b><em>-</em><b id="m-s1">0</b></span>
            <span class="sc-team"><b class="nm"></b><i class="kit"></i></span>
            <span class="sc-clock" id="m-clock">0'</span>
          </div>
          <canvas class="minimap" width="210" height="136"></canvas>
          <div class="stam"><span>لياقتك</span><i><b id="m-stam"></b></i></div>
        </div>
        <div class="toast" id="m-toast" hidden></div>
        <div class="ctrl">
          <div class="joy-zone" id="m-joy"><div class="joy rest"><i></i></div></div>
          <div class="pad">
            <button class="b b-cross" data-b="cross">عرضية</button>
            <button class="b b-shoot" data-b="shoot">تسديد</button>
            <button class="b b-through" data-b="through">بينية</button>
            <button class="b b-pass" data-b="pass">تمرير</button>
            <button class="b b-sprint" data-b="sprint">ركض</button>
          </div>
        </div>
        <div class="pause-menu" id="m-menu" hidden>
          <div class="pm-card">
            <h3>المباراة متوقفة</h3>
            <div class="pm-zoom"><span>الكاميرا</span>
              <button data-z="0.8">قريبة</button><button data-z="1">عادية</button><button data-z="1.25">بعيدة</button>
            </div>
            <button class="btn primary" id="m-resume">استمر في اللعب</button>
            <button class="btn" id="m-simulate">محاكاة باقي المباراة</button>
          </div>
        </div>
      </div>`;

    const $ = id => root.querySelector('#' + id);
    const mini = root.querySelector('.minimap');
    const mctx = mini.getContext('2d');
    const sound = FC.Sound;

    // ---------- الفرق واللاعبون ----------
    const teams = [opts.ours, opts.theirs].map((sq, ti) => ({ ...sq, index: ti, attackRight: ti === 0, players: [] }));
    const userSlot = USER_SLOT[FC.POSITIONS[opts.user.pos].slot];
    let user = null;
    teams.forEach(t => {
      t.players = t.squad.players.map(sp => {
        const p = {
          team: t.index, slot: sp.slot, base: BASE[sp.slot], number: sp.number, name: sp.name, attrs: sp.attrs,
          x: 0, y: 0, vx: 0, vy: 0, fx: t.attackRight ? 1 : -1, fy: 0,
          isGK: sp.slot === 'GK', isUser: false, tackleCd: 0, decideT: 0, safeT: 0, stunT: 0, holdT: 0, callTimer: 0, callThrough: false,
          kickT: 9, headT: 9, slideT: 9, diveT: 9, diveDir: 1, celebT: 9,
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

    const ball = {
      x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, noTouch: null, noTouchT: 0,
      pass: null, shot: null, tried: new Set(), gkTried: new Set(), assist: null, path: [],
    };
    const score = [opts.startScore ? opts.startScore[0] : 0, opts.startScore ? opts.startScore[1] : 0];
    const stats = { goals: 0, assists: 0, shots: 0, shotsOn: 0, passOk: 0, passBad: 0, tackles: 0, intercepts: 0, lost: 0, dribbles: 0, sprint: 0 };
    const GAME_RATE = 5400 / (opts.minutes * 60); // ثانية مباراة لكل ثانية حقيقية
    let gameSec = (opts.startMinute || 0) * 60;
    const enteredAt = opts.startMinute || 0;
    let half = gameSec >= 2700 ? 2 : 1;
    let phase = 'restart', phaseT = 1.2, phaseNext = null;
    let paused = false, ended = false;
    let stamina = clamp(opts.energy, 30, 100);
    const events = [];

    const view = FC.Render3D.create(root.querySelector('.view'), { tier: opts.tier, teams, zoom: opts.zoom });

    // ---------- الإدخال: عصا تحكم وأزرار مثل PES على الهاتف ----------
    const input = { jx: 0, jy: 0, sprint: false, held: {} };

    function inputVector() {
      let x = input.jx, y = input.jy;
      let m = hyp(x, y);
      if (m < 0.18) return { x: 0, y: 0, m: 0 };
      if (m > 1) { x /= m; y /= m; m = 1; }
      return { x: x / m, y: y / m, m };
    }

    const joyZone = $('m-joy'), joy = joyZone.querySelector('.joy'), knob = joy.querySelector('i');
    let joyId = null, joyX = 0, joyY = 0;
    joyZone.addEventListener('pointerdown', e => {
      if (joyId !== null) return;
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY;
      try { joyZone.setPointerCapture(e.pointerId); } catch (err) { /* لمسة بلا معرّف */ }
      const r = joyZone.getBoundingClientRect();
      joy.style.left = (e.clientX - r.left) + 'px'; joy.style.top = (e.clientY - r.top) + 'px';
      joy.classList.remove('rest');
      knob.style.transform = 'translate(-50%,-50%)';
    });
    joyZone.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - joyX, dy = e.clientY - joyY;
      const m = hyp(dx, dy), R = 50;
      if (m > R) { dx *= R / m; dy *= R / m; }
      input.jx = dx / R; input.jy = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const joyEnd = e => {
      if (e.pointerId !== joyId) return;
      joyId = null; input.jx = input.jy = 0;
      joy.classList.add('rest'); joy.style.left = joy.style.top = '';
      knob.style.transform = 'translate(-50%,-50%)';
    };
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);

    root.querySelectorAll('[data-b]').forEach(b => {
      const which = b.dataset.b;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* لمسة بلا معرّف */ }
        b.classList.add('on');
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* لا اهتزاز */ }
        buttonDown(which);
      });
      const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); buttonUp(which); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });

    function buttonDown(which) {
      if (paused || ended) return;
      if (which === 'sprint') { input.sprint = true; return; }
      input.held[which] = performance.now();
      const own = ball.owner === user;
      if (which === 'pass') own ? userPass(false) : callForBall(false);
      else if (which === 'through') own ? userPass(true) : callForBall(true);
      else if (which === 'cross' && own) userCross();
      else if (which === 'shoot' && !own) userTackle();
    }
    function buttonUp(which) {
      if (which === 'sprint') { input.sprint = false; return; }
      const t0 = input.held[which];
      delete input.held[which];
      if (paused || ended || t0 == null) return;
      if (which === 'shoot' && ball.owner === user) userShoot((performance.now() - t0) / 1000);
    }

    $('m-pause').addEventListener('click', togglePause);
    $('m-resume').addEventListener('click', togglePause);
    $('m-simulate').addEventListener('click', simulateRest);
    root.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
      view.setZoom(+b.dataset.z);
      if (opts.onZoom) opts.onZoom(+b.dataset.z);
      markZoom(+b.dataset.z);
    }));
    function markZoom(z) { root.querySelectorAll('[data-z]').forEach(b => b.classList.toggle('on', +b.dataset.z === z)); }
    markZoom(opts.zoom || 1);

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

    // مسار الكرة المتوقع للثلاث ثوانٍ القادمة (يُحسب مرة كل إطار)
    function predictPath() {
      const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz };
      const path = ball.path;
      path.length = 0;
      for (let i = 1; i <= 60; i++) { stepBall(b, 0.05); path.push({ t: i * 0.05, x: b.x, y: b.y, z: b.z }); }
    }

    // أقرب نقطة على مسار الكرة يستطيع اللاعب بلوغها قبلها، والكرة منخفضة بما يكفي لاستلامها
    function interceptPoint(p, maxZ = 1.1) {
      if (ball.owner) return [ball.x, ball.y];
      const sp = maxSpd(p);
      for (const pt of ball.path) {
        if (pt.z > maxZ) continue;
        if (hyp(pt.x - p.x, pt.y - p.y) / sp <= pt.t + 0.1) return [pt.x, pt.y];
      }
      const e = ball.path[ball.path.length - 1];
      return e ? [e.x, e.y] : [ball.x, ball.y];
    }

    // ---------- الركلات ----------
    function kick(p, tx, ty, speed, kind, target, vz = 0) {
      const d = hyp(tx - ball.x, ty - ball.y) || 1;
      ball.owner = null;
      ball.vx = (tx - ball.x) / d * speed;
      ball.vy = (ty - ball.y) / d * speed;
      ball.vz = vz; ball.z = Math.max(ball.z, vz > 0 ? 0.05 : 0);
      ball.lastTouch = p; ball.noTouch = p; ball.noTouchT = 0.28;
      ball.tried = new Set(); ball.gkTried = new Set();
      ball.pass = kind === 'pass' ? { by: p, to: target } : null;
      ball.shot = kind === 'shot' ? { by: p } : null;
      p.decideT = 0.4;
      p.kickT = 0;
      sound.kick(kind === 'shot' ? 1 : 0.6);
    }

    function passTo(p, r, through) {
      let tx = r.x, ty = r.y;
      const d0 = hyp(tx - p.x, ty - p.y);
      let speed = clamp(d0 * 0.95 + 6, 11, 27);
      const t = d0 / (speed * 0.75);
      tx += r.vx * t; ty += r.vy * t;
      if (through) {
        tx += (teamOf(r).attackRight ? 1 : -1) * 6;
        speed = clamp(speed + 2, 12, 28);
      }
      const err = (100 - p.attrs.passing) / 100 * 0.14 * gauss() * (p.stunT > 0 ? 2 : 1);
      const ang = Math.atan2(ty - ball.y, tx - ball.x) + err;
      const d = hyp(tx - ball.x, ty - ball.y);
      kick(p, ball.x + Math.cos(ang) * d, ball.y + Math.sin(ang) * d, speed, 'pass', r);
    }

    // تمريرة عالية نحو الزميل. arriveZ: ارتفاع الكرة عند وصولها (1.7 = في مستوى الرأس للعرضيات)
    function loftTo(p, r, arriveZ = 0.3) {
      const d0 = dist(p, r);
      const hs = clamp(d0 * 0.55 + 7, 12, 24);
      const T = d0 / hs;
      let tx = r.x + r.vx * T, ty = r.y + r.vy * T;
      const err = (100 - p.attrs.passing) / 100 * 3.5;
      tx += gauss() * err; ty += gauss() * err;
      const d = hyp(tx - ball.x, ty - ball.y);
      const h = clamp(d * 0.55 + 7, 12, 24);
      // زمن الطيران مع مقاومة الهواء، ثم السرعة العمودية التي توصل الكرة إلى الارتفاع المطلوب
      const T2 = -Math.log(1 - Math.min(0.95, d * 0.12 / h)) / 0.12;
      const vz = clamp((arriveZ + 0.5 * G * T2 * T2) / T2, 3, 16);
      // نطيل الهدف قليلاً حتى يكمل الكرة طريقها خلفه إن لم تُلمس
      kick(p, ball.x + (tx - ball.x) * 1.0, ball.y + (ty - ball.y) * 1.0, h, 'pass', r, vz);
    }
    const isBoxTarget = (t, q) => ax(t, q.x) > L - 20 && Math.abs(q.y - W / 2) < 16;

    function shoot(p, aimY, power) {
      const t = teamOf(p);
      const gx = goalX(t);
      const speed = 17 + power * 15;
      const distG = Math.abs(gx - ball.x);
      const sk = (100 - p.attrs.shooting) / 100;
      const err = (0.035 + sk * 0.11 + (power > 0.96 ? 0.06 : 0) + distG / 900) * gauss();
      const ang = Math.atan2(aimY - ball.y, gx - ball.x) + err;
      // الارتفاع: التسديدة القوية جداً قد تطير فوق العارضة
      const vz = 1 + power * 2.6 + gauss() * (0.8 + sk * 2.4) + (power > 0.96 ? 2.2 : 0);
      kick(p, ball.x + Math.cos(ang) * 50, ball.y + Math.sin(ang) * 50, speed, 'shot', null, Math.max(0, vz));
      if (p.isUser) stats.shots++;
    }

    // ---------- تحكم المستخدم ----------
    function pickTeammate(filter) {
      const iv = inputVector();
      const dx = iv.m ? iv.x : user.fx, dy = iv.m ? iv.y : user.fy;
      let best = null, bestS = -1e9;
      for (const q of teams[0].players) {
        if (q === user || (filter && !filter(q))) continue;
        const ox = q.x - user.x, oy = q.y - user.y;
        const d = hyp(ox, oy);
        if (d < 2) continue;
        const cos = (ox * dx + oy * dy) / d;
        const s = cos * 30 - Math.abs(d - 16) * 0.6;
        if (s > bestS) { bestS = s; best = q; }
      }
      return best;
    }

    function startPlay() { if (phase === 'restart') phase = 'play'; }

    function userPass(through) {
      if (phase !== 'play' && phase !== 'restart') return;
      const r = pickTeammate();
      if (r) { passTo(user, r, through); startPlay(); }
    }

    function userCross() {
      if (phase !== 'play' && phase !== 'restart') return;
      // العرضية تبحث أولاً عن زميل داخل منطقة الجزاء
      const inBox = q => q.x > L - 20 && Math.abs(q.y - W / 2) < 22;
      const r = (ball.x > L - 35 && pickTeammate(inBox)) || pickTeammate();
      if (r) { loftTo(user, r, isBoxTarget(teams[0], r) ? 1.7 : 0.3); startPlay(); }
    }

    function userShoot(held) {
      if (phase !== 'play' && phase !== 'restart') return;
      const iv = inputVector();
      const side = clamp(iv.y * 1.6, -1, 1); // الاتجاه الجانبي يختار الزاوية
      shoot(user, W / 2 + side * (GH - 0.6), clamp(held / 0.8, 0.3, 1));
      startPlay();
    }

    function callForBall(through) {
      user.callTimer = 2.2;
      user.callThrough = through;
    }

    function userTackle() {
      if (user.tackleCd > 0) return;
      const c = ball.owner;
      user.tackleCd = 0.8;
      if (c && c.team === 1 && dist(user, c) < 2.6) {
        const d = dist(user, c) || 1;
        user.vx += (c.x - user.x) / d * 5; user.vy += (c.y - user.y) / d * 5;
        user.fx = (c.x - user.x) / d; user.fy = (c.y - user.y) / d;
        user.slideT = 0;
        if (c.safeT <= 0 && Math.random() < clamp(0.5 + (user.attrs.defending - c.attrs.dribbling) / 110, 0.15, 0.9)) {
          winBall(user, c); stats.tackles++;
          sound.kick(0.4);
        } else {
          user.stunT = 0.6; c.safeT = 0.4;
        }
      } else if (!c && dist(user, ball) < 2.8 && ball.z < 1) {
        user.vx += (ball.x - user.x) * 2; user.vy += (ball.y - user.y) * 2;
        user.slideT = 0;
      }
    }

    function winBall(p, from) {
      ball.owner = p; ball.lastTouch = p; ball.pass = null; ball.shot = null;
      ball.z = 0; ball.vz = 0;
      p.safeT = 0.6; p.decideT = 0.25;
      if (from) { from.stunT = 0.5; if (from.isUser) stats.lost++; }
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

    // ضربة رأسية: تسديد قرب المرمى، إبعاد قرب مرماك، أو تمريرة
    function header(p) {
      const t = teamOf(p);
      p.headT = 0;
      ball.tried = new Set([p]);
      const prev = ball.pass;
      if (prev && prev.by.team === p.team && prev.by !== p) ball.assist = { by: prev.by, t: gameSec };
      if (ax(t, p.x) > L - 20 && Math.abs(p.y - W / 2) < 16) {
        const aim = W / 2 + (p.isUser ? clamp(inputVector().y * 1.6, -1, 1) : (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 1)) * (GH - 0.5);
        const gx = goalX(t);
        const err = (0.05 + (100 - p.attrs.shooting) / 100 * 0.12) * gauss();
        const ang = Math.atan2(aim - ball.y, gx - ball.x) + err;
        kick(p, ball.x + Math.cos(ang) * 40, ball.y + Math.sin(ang) * 40, 12 + p.attrs.physical / 10, 'shot', null, rnd(-1.5, 2));
        if (p.isUser) stats.shots++;
        p.kickT = 9;
        toast('ضربة رأسية!', 800);
      } else if (ax(t, p.x) < 35) {
        kick(p, ax(t, p.x + (t.attackRight ? 25 : -25)), clamp(p.y + rnd(-15, 15), 3, W - 3), 16, 'clear', null, 6);
        p.kickT = 9;
      } else {
        const mates = t.players.filter(q => q !== p && !q.isGK && dist(q, p) < 18);
        const r = mates.sort((a, b) => ax(t, b.x) - ax(t, a.x))[0];
        if (r) passTo(p, r, false); else kick(p, ax(t, ax(t, p.x) + 10), p.y, 10, 'clear', null, 1);
        p.kickT = 9;
      }
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
        for (const o of opps) open = Math.min(open, segDist(o.x, o.y, p.x, p.y, r.x, r.y) * 1.2, dist(o, r));
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
        else {
          const far = t.players.filter(q => q.slot[0] === 'F').sort(() => Math.random() - 0.5)[0];
          loftTo(p, far);
        }
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
            shoot(p, W / 2 + (Math.random() < 0.5 ? -1 : 1) * rnd(1, GH - 0.5), rnd(0.55, 0.95));
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
        if (calling) { passTo(p, bp.r, user.callThrough); return; }
        // قرب خط المرمى على الجناح: عرضية عالية نحو المنطقة
        if (ax(t, p.x) > L - 22 && wide > 12) {
          const targets = t.players.filter(q => q !== p && ax(t, q.x) > L - 20 && Math.abs(q.y - W / 2) < 14);
          if (targets.length && Math.random() < 0.7) { loftTo(p, targets[Math.floor(Math.random() * targets.length)], 1.7); return; }
          if (bp && bp.s > -12) { passTo(p, bp.r, false); return; }
        }
        const space = ahead > 7 && !(isDef && ax(t, p.x) < 30);
        const takeOn = !isDef && Math.random() < p.attrs.dribbling / 260;
        if (bp && ((!takeOn && ((od < 3 && bp.s > 0) || (!space && bp.s > (isDef ? 2 : 6)))) || bp.s > 22)) {
          passTo(p, bp.r, bp.r.slot[0] === 'F' && Math.random() < 0.35);
          return;
        }
      }
      // المراوغة نحو المرمى مع الابتعاد عن أقرب خصم
      let tx = gx, ty = W / 2 + (p.y - W / 2) * 0.6;
      if (ax(t, p.x) > L - 20) { tx = ax(t, L - 8); ty = W / 2 + (p.y - W / 2) * 0.3; }
      if (opp && od < 5) ty += Math.sign((p.y - opp.y) || (Math.random() - 0.5)) * 8;
      moveToward(p, tx, clamp(ty, 3, W - 3), 0.82, dt);
    }

    function teamAI(t, dt) {
      const owner = ball.owner;
      const hasBall = owner && owner.team === t.index;
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
        if (p.slideT < 0.5) { p.vx *= 0.94; p.vy *= 0.94; continue; }
        if (p === owner) { carrierAI(p, dt); continue; }
        if (p.isGK) { keeperAI(p, t, dt); continue; }
        if (p === receiver) {
          const [ix, iy] = interceptPoint(p, 2.4);
          moveToward(p, ix, iy, 1, dt);
          continue;
        }
        if (chasers.includes(p)) {
          const [tx, ty] = interceptPoint(p);
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
      if (Math.random() < 0.3) p.slideT = 0;
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
      if (ball.shot && !ball.owner && Math.sign(ball.vx) === Math.sign(ownX - ball.x) && Math.abs(ball.vx) > 2) {
        const tt = (ownX - ball.x) / ball.vx;
        const yc = clamp(ball.y + ball.vy * tt, W / 2 - GH - 1, W / 2 + GH + 1);
        moveToward(p, ax(t, 1.6), yc, 1, dt);
        return;
      }
      // يخرج للكرة الحرة داخل منطقته
      if (!ball.owner && ax(t, ball.x) < 15 && Math.abs(ball.y - W / 2) < 18) {
        const mates = t.players.filter(q => !q.isGK).map(q => dist(q, ball));
        if (dist(p, ball) < Math.min(...mates) + 1) {
          const [ix, iy] = interceptPoint(p, 2.6);
          moveToward(p, ix, iy, 1, dt);
          return;
        }
      }
      const [tx, ty] = targetFor(p);
      moveToward(p, tx, ty, 0.7, dt);
    }

    // ---------- اللاعب الذي تتحكم فيه ----------
    function userUpdate(dt) {
      let iv = inputVector();
      const own = ball.owner === user;
      // زر العرضية بدون كرة = ضغط: يركض لاعبك تلقائياً نحو الكرة
      if (!own && input.held.cross != null && iv.m === 0) {
        const [tx, ty] = interceptPoint(user);
        const d = hyp(tx - user.x, ty - user.y);
        if (d > 0.5) iv = { x: (tx - user.x) / d, y: (ty - user.y) / d, m: 1 };
      }
      const canSprint = stamina > 12 && input.sprint;
      let sp = maxSpd(user) * (canSprint ? 1.05 : 0.8) * (own ? 0.92 : 1) * (0.75 + stamina / 400);
      if (user.stunT > 0) sp *= 0.5;
      if (user.slideT < 0.45) { user.vx *= 0.95; user.vy *= 0.95; }
      else {
        const a = Math.min(1, dt * (own ? 7 : 9));
        user.vx += (iv.x * sp * iv.m - user.vx) * a;
        user.vy += (iv.y * sp * iv.m - user.vy) * a;
      }
      const moving = hyp(user.vx, user.vy) > 2;
      if (canSprint && iv.m > 0.3) {
        stamina = Math.max(0, stamina - dt * (10 - user.attrs.physical * 0.05));
        stats.sprint += dt;
      } else {
        stamina = Math.min(100, stamina + dt * (moving ? 2 : 4.5));
      }
      user.callTimer = Math.max(0, user.callTimer - dt);
    }

    // ---------- الفيزياء ----------
    function physics(dt, ballLive) {
      for (const p of all) {
        p.tackleCd -= dt; p.safeT -= dt; p.stunT -= dt;
        p.kickT += dt; p.headT += dt; p.slideT += dt; p.diveT += dt; p.celebT += dt;
        p.x = clamp(p.x + p.vx * dt, -3, L + 3);
        p.y = clamp(p.y + p.vy * dt, -3, W + 3);
        const s = hyp(p.vx, p.vy);
        if (s > 0.6 && p.slideT > 0.5 && p.diveT > 0.9) { p.fx = p.vx / s; p.fy = p.vy / s; }
      }
      // منع التداخل بين اللاعبين
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
        if (d > 0 && d < 1.0) {
          const push = (1.0 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      if (!ballLive) return;
      let px = ball.x, py = ball.y, pz = ball.z;
      if (ball.owner) {
        const o = ball.owner;
        ball.x = o.x + o.fx * 0.7; ball.y = o.y + o.fy * 0.7; ball.z = 0;
        ball.vx = o.vx; ball.vy = o.vy;
        if (ball.x >= 0 && ball.x <= L && ball.y >= 0 && ball.y <= W) return;
        // حامل الكرة خرج بها من الملعب
        ball.lastTouch = o; ball.owner = null; ball.shot = null;
        px = clamp(ball.x, 0.01, L - 0.01); py = clamp(ball.y, 0.01, W - 0.01); pz = 0;
      } else {
        stepBall(ball, dt);
        ball.noTouchT -= dt;
      }

      // هدف أو القائم أو خروج من خط المرمى
      if (ball.x < 0 || ball.x > L) {
        const lineX = ball.x < 0 ? 0 : L;
        const f = (lineX - px) / ((ball.x - px) || 1e-6);
        const yc = py + (ball.y - py) * f, zc = pz + (ball.z - pz) * f;
        const off = Math.abs(yc - W / 2);
        if (off < GH && zc < BAR) { goal(ball.x > L ? 0 : 1); return; }
        if ((off < GH + 0.25 && zc < BAR + 0.2) || (off < GH + 0.2 && zc < BAR + 0.25)) {
          // ارتطام بالقائم أو العارضة
          ball.x = lineX + (lineX ? -0.2 : 0.2);
          ball.vx = -ball.vx * 0.5; ball.vy += rnd(-3, 3); ball.vz = Math.abs(ball.vz) * 0.3;
          ball.shot = null; ball.tried = new Set();
          toast(zc > BAR - 0.1 ? 'العارضة!' : 'القائم!', 900);
          sound.kick(0.9);
          return;
        }
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

      // الحارس يتصدى (يرتمي إن لزم)
      if (ball.shot) {
        for (const t of teams) {
          const g = t.players[0];
          const ownX = t.attackRight ? 0 : L;
          if (ball.gkTried.has(g) || Math.sign(ball.vx) !== Math.sign(ownX - ball.x)) continue;
          const reach = 1.3 + g.attrs.keeping / 100 * 1.7;
          const hd = dist(g, ball);
          if (hd < reach && ball.z < 2.7) {
            ball.gkTried.add(g);
            if (hd > 0.9 || ball.z > 1.6) { g.diveT = 0; g.diveDir = Math.sign((ball.y - g.y) * (t.attackRight ? 1 : -1)) || 1; }
            const sp = hyp(ball.vx, ball.vy);
            const pr = clamp(0.36 + g.attrs.keeping / 250 - (sp - 20) / 25 - (ball.shot.by.attrs.shooting - g.attrs.keeping) / 250, 0.1, 0.85);
            if (Math.random() < pr) {
              if (ball.shot.by.isUser) stats.shotsOn++;
              if (sp < 23 && Math.random() < 0.6) { receive(g); g.holdT = rnd(0.9, 1.5); toast('تصدى الحارس', 900); }
              else {
                ball.vx = -ball.vx * rnd(0.2, 0.4); ball.vy = rnd(-9, 9); ball.vz = rnd(1, 4);
                ball.shot = null; ball.lastTouch = g; ball.tried = new Set();
                toast('أبعدها الحارس', 900);
              }
              sound.kick(0.5);
              return;
            }
          }
        }
      }

      // استلام الكرة: بالقدم إذا كانت منخفضة، وبالرأس إذا كانت في مستوى الرأس
      const sp = hyp(ball.vx, ball.vy);
      if (sp < 7 && ball.z < 0.5) ball.tried.clear(); // كرة بطيئة: يحق للجميع محاولة استلامها من جديد
      let best = null, bd = 1e9, bestHead = null, bh = 1e9;
      for (const p of all) {
        if (p === ball.noTouch && ball.noTouchT > 0) continue;
        if (ball.tried.has(p)) continue;
        const d = dist(p, ball);
        const gkBox = p.isGK && ax(teamOf(p), ball.x) < 17;
        if (ball.z < (gkBox ? 2.6 : 1.0)) {
          const reach = gkBox ? 1.4 : 1.0;
          if (d < reach && d < bd) { bd = d; best = p; }
        } else if (ball.z < 2.6 && d < 0.9 && d < bh) { bh = d; bestHead = p; }
      }
      if (best) {
        let pr = 1;
        const intended = ball.pass && ball.pass.to === best;
        if (!intended && sp > 9) pr = clamp(0.55 + best.attrs.defending / 250 - sp / 55, 0.15, 0.9);
        if (ball.shot && !best.isGK) pr = Math.min(pr, 0.35);
        if (Math.random() < pr) receive(best);
        else ball.tried.add(best);
      } else if (bestHead) {
        ball.tried.add(bestHead);
        const intended = ball.pass && ball.pass.to === bestHead;
        if (Math.random() < clamp(0.35 + bestHead.attrs.physical / 250 + (intended ? 0.2 : 0), 0.2, 0.9)) header(bestHead);
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
        if (ball.assist.by.isUser) { stats.assists++; text += ' · تمريرة حاسمة منك'; }
      }
      for (const p of t.players) if (!p.isGK) p.celebT = 0;
      events.push({ min: minute(), team: teamIdx, user: !!(scorer && scorer.isUser) });
      $('m-s0').textContent = score[0]; $('m-s1').textContent = score[1];
      toast(text, 2400);
      sound.goal(teamIdx === 0);
      ball.owner = null; ball.vx *= 0.15; ball.vy *= 0.15; ball.vz = 0; ball.z = Math.min(ball.z, 1); ball.shot = null;
      phase = 'goal'; phaseT = 2.6; phaseNext = () => kickoff(1 - teamIdx);
    }

    function restart(teamIdx, x, y, label, gk) {
      ball.owner = null; ball.vx = ball.vy = ball.vz = 0; ball.z = 0; ball.x = x; ball.y = y; ball.shot = null; ball.pass = null;
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
        p.fx = t.attackRight ? 1 : -1; p.fy = 0; p.celebT = 9;
      }
      const t = teams[teamIdx];
      const kicker = t.players.find(p => p.slot === 'FC');
      kicker.x = L / 2 + (t.attackRight ? -0.8 : 0.8); kicker.y = W / 2;
      ball.x = L / 2; ball.y = W / 2; ball.z = 0; ball.vx = ball.vy = ball.vz = 0;
      winBall(kicker, null);
      kicker.safeT = 2; kicker.decideT = kicker.isUser ? 99 : 0.8;
      phase = 'restart'; phaseT = kicker.isUser ? 99 : 1.2; phaseNext = null;
      sound.whistle(0.4);
      if (kicker.isUser) toast('ضربة البداية: مرّر الكرة', 1500);
    }

    function simulateRest() {
      // يحاكي الدقائق المتبقية بحسب قوة الفريقين
      const remain = Math.max(0, 90 - minute()) / 90;
      const diff = (teams[0].strength - teams[1].strength) / 10;
      score[0] += FC.Career.poisson(clamp(1.3 + diff * 0.6, 0.2, 4) * remain);
      score[1] += FC.Career.poisson(clamp(1.2 - diff * 0.6, 0.2, 4) * remain);
      finish();
    }

    function finish() {
      if (ended) return;
      ended = true;
      sound.whistle(1);
      const minutesPlayed = Math.max(1, minute() - enteredAt);
      gameSec = 5400;
      cleanup();
      opts.onEnd({ ours: score[0], theirs: score[1], stats, minutes: minutesPlayed, played: true, events });
    }

    // ---------- الخريطة الصغيرة ----------
    function drawMini() {
      const w = mini.width, h = mini.height;
      mctx.clearRect(0, 0, w, h);
      mctx.fillStyle = 'rgba(14,32,24,.72)'; mctx.fillRect(0, 0, w, h);
      mctx.strokeStyle = 'rgba(255,255,255,.35)'; mctx.lineWidth = 1;
      mctx.strokeRect(2, 2, w - 4, h - 4);
      mctx.beginPath(); mctx.moveTo(w / 2, 2); mctx.lineTo(w / 2, h - 2); mctx.stroke();
      const m = (x, y) => [2 + x / L * (w - 4), 2 + y / W * (h - 4)];
      for (const p of all) {
        const [x, y] = m(p.x, p.y);
        mctx.fillStyle = p.isUser ? '#ffc94a' : teams[p.team].colors[0];
        mctx.beginPath(); mctx.arc(x, y, p.isUser ? 5 : 3.5, 0, Math.PI * 2); mctx.fill();
        if (!p.isUser) { mctx.strokeStyle = 'rgba(0,0,0,.5)'; mctx.stroke(); }
      }
      const [bx, by] = m(ball.x, ball.y);
      mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(bx, by, 2.6, 0, Math.PI * 2); mctx.fill();
    }

    // ---------- الحلقة الرئيسية ----------
    let last = performance.now(), raf = 0, lbl = '';
    const btn = which => root.querySelector(`[data-b="${which}"]`);
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (paused || ended) return;

      if (phase === 'play') {
        gameSec += dt * GAME_RATE;
        if (half === 1 && gameSec >= 2700) {
          half = 2; gameSec = 2700;
          toast('نهاية الشوط الأول', 1800);
          sound.whistle(0.6);
          phase = 'goal'; phaseT = 2; phaseNext = () => kickoff(1);
        } else if (gameSec >= 5400) { gameSec = 5400; finish(); return; }
      } else {
        phaseT -= dt;
        if (phaseT <= 0) {
          if (phaseNext) { const f = phaseNext; phaseNext = null; f(); } else phase = 'play';
        }
      }

      if (!ball.owner) predictPath();
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
      if (phase === 'restart' && ball.owner) { ball.owner.vx = ball.owner.vy = 0; }
      if (phase === 'play' || phase === 'goal') physics(dt, phase === 'play');
      else {
        for (const p of all) { p.x += p.vx * dt; p.y += p.vy * dt; p.kickT += dt; p.celebT += dt; p.slideT += dt; p.diveT += dt; p.headT += dt; }
        if (ball.owner) { ball.x = ball.owner.x + ball.owner.fx * 0.7; ball.y = ball.owner.y + ball.owner.fy * 0.7; }
      }

      $('m-clock').textContent = minute() + "'";
      $('m-stam').style.width = stamina + '%';
      const own = ball.owner === user;
      const key = own ? 'own' : 'off';
      if (key !== lbl) {
        lbl = key;
        btn('pass').textContent = own ? 'تمرير' : 'اطلب';
        btn('through').textContent = own ? 'بينية' : 'اطلب بينية';
        btn('shoot').textContent = own ? 'تسديد' : 'افتك';
        btn('cross').textContent = own ? 'عرضية' : 'ضغط';
        root.querySelector('.pad').classList.toggle('own', own);
      }
      view.frame({ user, ball }, dt);
      drawMini();
    }

    // بداية المباراة
    const names = root.querySelectorAll('.sc-team');
    names[0].querySelector('.nm').textContent = teams[0].name;
    names[0].querySelector('.kit').style.background = teams[0].colors[0];
    names[1].querySelector('.nm').textContent = teams[1].name;
    names[1].querySelector('.kit').style.background = teams[1].colors[0];
    $('m-s0').textContent = score[0]; $('m-s1').textContent = score[1];
    FC.Match.debug = { all, ball, teams, stats, input }; // للاختبار
    kickoff(opts.userIsHome ? 0 : 1);
    if (opts.startMinute) toast(`تدخل بديلاً في الدقيقة ${opts.startMinute}`, 2200);
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(frame);

    // إيقاف تلقائي عند الخروج من التطبيق
    const onHide = () => { if (document.hidden && !paused && !ended) togglePause(); };
    document.addEventListener('visibilitychange', onHide);

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onHide);
      view.dispose();
    }

    return { stop: () => { ended = true; cleanup(); } };
  }

  FC.Match = { start };
})();
