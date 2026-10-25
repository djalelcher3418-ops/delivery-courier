// رسم المباراة ثلاثي الأبعاد بمكتبة Three.js
// إحداثيات المحاكاة: x على طول الملعب (0..105)، y على عرضه (0..68)، z الارتفاع
// في Three.js: X = x - 52.5، Z = y - 34، Y = الارتفاع. الكاميرا على جانب الملعب مثل البث التلفزيوني
(function () {
  const L = 105, W = 68, GH = 3.66, BAR = 2.44;

  // أجواء كل مستوى: الأرضية، السماء، المدرجات، الأضواء
  const LOOKS = [
    { grassA: '#a8875a', grassB: '#9f8054', patch: '#8c6f45', line: 'rgba(250,245,230,.8)', outside: '#9a7b52', sky: '#a9cfe8', fogFar: 260, sun: 1.25, hemi: 0.75, stands: 0, trees: true, lights: false },
    { grassA: '#5f8a3e', grassB: '#57803a', patch: '#7a874a', line: 'rgba(255,255,250,.85)', outside: '#6d7d45', sky: '#a5cde6', fogFar: 260, sun: 1.2, hemi: 0.75, stands: 1, trees: true, lights: false },
    { grassA: '#418c3b', grassB: '#3a7f35', line: 'rgba(255,255,255,.9)', outside: '#3d6b39', sky: '#e8b88a', fogFar: 300, sun: 1.0, hemi: 0.7, stands: 2, trees: false, lights: true },
    { grassA: '#2f8a3c', grassB: '#297c36', line: 'rgba(255,255,255,.95)', outside: '#2b5f35', sky: '#0d1824', fogFar: 320, sun: 0.75, hemi: 0.55, stands: 3, trees: false, lights: true },
    { grassA: '#2c8c40', grassB: '#257c38', line: '#ffffff', outside: '#24553a', sky: '#08111b', fogFar: 340, sun: 0.8, hemi: 0.55, stands: 4, trees: false, lights: true },
  ];
  const SKINS = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3a', '#5e3b26'];
  const HAIRS = ['#1d1510', '#3a2618', '#6b4425', '#c49a5c', '#111111'];

  const X = x => x - L / 2;
  const Z = y => y - W / 2;

  function create(container, opts) {
    const look = LOOKS[opts.tier] || LOOKS[2];
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(look.sky);
    scene.fog = new THREE.Fog(look.sky, 120, look.fogFar);
    const camera = new THREE.PerspectiveCamera(30, 2, 1, 600);

    scene.add(new THREE.HemisphereLight(0xeef6ff, 0x55603a, look.hemi));
    const sun = new THREE.DirectionalLight(0xffffff, look.sun);
    sun.position.set(-40, 80, 50);
    scene.add(sun);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    buildPitch(scene, look, maxAniso);
    buildGoals(scene);
    buildSurroundings(scene, look);

    // ---------- اللاعبون: هيكل بمفاصل (ورك، ركبة، كاحل، كتف، مرفق، جذع، رقبة) ----------
    const geo = {
      pelvis: new THREE.CylinderGeometry(0.16, 0.15, 0.24, 10),
      torso: new THREE.CylinderGeometry(0.205, 0.15, 0.52, 10),
      neck: new THREE.CylinderGeometry(0.05, 0.056, 0.12, 8),
      head: new THREE.SphereGeometry(0.112, 14, 10),
      hair: new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      sleeve: new THREE.CylinderGeometry(0.072, 0.064, 0.16, 8),
      upperArm: new THREE.CylinderGeometry(0.052, 0.045, 0.27, 8),
      foreArm: new THREE.CylinderGeometry(0.045, 0.036, 0.25, 8),
      hand: new THREE.SphereGeometry(0.046, 8, 6),
      shortLeg: new THREE.CylinderGeometry(0.092, 0.084, 0.2, 8),
      thigh: new THREE.CylinderGeometry(0.075, 0.055, 0.43, 8),
      shin: new THREE.CylinderGeometry(0.056, 0.038, 0.43, 8),
      shoe: new THREE.BoxGeometry(0.095, 0.075, 0.25),
      number: new THREE.PlaneGeometry(0.24, 0.24),
      shadow: new THREE.PlaneGeometry(1.3, 1.3),
    };
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, opacity: 0.55 });
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const skinMats = SKINS.map(mat), hairMats = HAIRS.map(mat);
    const shoeMat = mat('#1a1a1a');
    const kitCache = new Map();
    const kitMats = kit => {
      const key = kit.join('|');
      if (!kitCache.has(key)) kitCache.set(key, { shirt: mat(kit[0]), shorts: mat(kit[1]), socks: mat(kit[0]) });
      return kitCache.get(key);
    };

    function makePlayer(p, kit) {
      const km = kitMats(kit);
      const skin = skinMats[(p.number * 7 + p.team * 3) % SKINS.length];
      const hair = hairMats[(p.number * 5 + p.team) % HAIRS.length];
      const part = (parent, g, m, x, y, z) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); parent.add(me); return me; };
      const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

      const root = new THREE.Group();
      root.scale.setScalar(0.95 + ((p.number * 37 + p.team * 11) % 10) / 100);
      const pelvis = joint(root, 0, 0.97, 0);
      part(pelvis, geo.pelvis, km.shorts, 0, 0, 0).scale.set(1, 1, 0.72);
      const spine = joint(pelvis, 0, 0.1, 0);
      part(spine, geo.torso, km.shirt, 0, 0.27, 0).scale.set(1, 1, 0.66);
      const num = part(spine, geo.number, numberMat(p.number, kit), 0, 0.32, -0.142);
      num.rotation.y = Math.PI;
      const neck = joint(spine, 0, 0.55, 0);
      part(neck, geo.neck, skin, 0, 0.05, 0);
      const head = joint(neck, 0, 0.1, 0);
      part(head, geo.head, skin, 0, 0.1, 0).scale.set(0.9, 1.08, 1);
      part(head, geo.hair, hair, 0, 0.12, -0.006);
      const arm = side => {
        const sh = joint(spine, side * 0.235, 0.48, 0);
        part(sh, geo.sleeve, km.shirt, 0, -0.07, 0);
        part(sh, geo.upperArm, skin, 0, -0.16, 0);
        const el = joint(sh, 0, -0.29, 0);
        part(el, geo.foreArm, skin, 0, -0.125, 0);
        part(el, geo.hand, skin, 0, -0.27, 0);
        return { sh, el };
      };
      const leg = side => {
        const hip = joint(pelvis, side * 0.095, -0.06, 0);
        part(hip, geo.shortLeg, km.shorts, 0, -0.09, 0);
        part(hip, geo.thigh, skin, 0, -0.215, 0);
        const knee = joint(hip, 0, -0.43, 0);
        part(knee, geo.shin, km.socks, 0, -0.215, 0);
        const ankle = joint(knee, 0, -0.43, 0);
        part(ankle, geo.shoe, shoeMat, 0, -0.02, 0.055);
        return { hip, knee, ankle };
      };
      const shadow = new THREE.Mesh(geo.shadow, shadowMat);
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
      root.add(shadow);
      scene.add(root);
      // L = جهة اليسار (+X في إحداثيات اللاعب)، R = اليمين
      return {
        root, pelvis, spine, neck, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
        phase: Math.random() * 6, sp: 0, prevS: 0, acc: 0, seed: Math.random() * 6,
      };
    }

    const models = new Map();
    for (const t of opts.teams) {
      for (const p of t.players) {
        const kit = p.isGK ? (t.index === 0 ? ['#2d2d2d', '#f2b134'] : ['#e9d238', '#1b2a33']) : t.colors;
        models.set(p, makePlayer(p, kit));
      }
    }

    // علامة لاعبك: حلقة على الأرض وسهم فوق رأسه
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    scene.add(ring);
    const callRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.5, depthWrite: false }));
    callRing.rotation.x = -Math.PI / 2; callRing.position.y = 0.03;
    scene.add(callRing);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffc94a }));
    arrow.rotation.x = Math.PI;
    scene.add(arrow);

    // الكرة: أكبر قليلاً من الحقيقة حتى تُرى على شاشة الهاتف
    const BR = 0.17;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 18, 14), new THREE.MeshLambertMaterial({ map: ballTexture() }));
    scene.add(ball);
    const ballShadow = new THREE.Mesh(geo.shadow, shadowMat);
    ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.025;
    scene.add(ballShadow);

    // ---------- الكاميرا ----------
    const cam = { x: 0, z: 0 };
    let zoom = opts.zoom || 1;
    let vw = 1, vh = 1;
    function resize() {
      vw = container.clientWidth; vh = container.clientHeight;
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / Math.max(1, vh);
      camera.fov = camera.aspect < 1.4 ? 38 : 30;
      camera.updateProjectionMatrix();
    }
    resize();
    const tmpV = new THREE.Vector3();
    function project(x, y, z) {
      tmpV.set(X(x), z, Z(y)).project(camera);
      return [(tmpV.x + 1) / 2 * vw, (1 - tmpV.y) / 2 * vh];
    }

    // ---------- الحركة: دورة جري بمفاصل + حركات كرة القدم ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ease = u => u * u * (3 - 2 * u);
    function animatePlayer(p, m, dt, time, ballPos) {
      m.root.position.set(X(p.x), 0, Z(p.y));
      const target = Math.atan2(p.fx, p.fy);
      const dr = Math.atan2(Math.sin(target - m.root.rotation.y), Math.cos(target - m.root.rotation.y));
      m.root.rotation.y += dr * Math.min(1, dt * 14);
      const yaw = m.root.rotation.y;
      const s = Math.hypot(p.vx, p.vy);
      m.sp += (s - m.sp) * Math.min(1, dt * 8);
      m.acc += ((s - m.prevS) / Math.max(dt, 1e-3) - m.acc) * Math.min(1, dt * 4);
      m.prevS = s;

      // الحركة بالنسبة لاتجاه الجسم: أمام، خلف، جانب
      const fwd = p.vx * Math.sin(yaw) + p.vy * Math.cos(yaw);
      const lat = p.vx * Math.cos(yaw) - p.vy * Math.sin(yaw);
      const k = clamp(m.sp / 8.5, 0, 1);
      const mv = ease(clamp((m.sp - 0.25) / 1.2, 0, 1));
      const back = fwd < -0.5 && -fwd > Math.abs(lat);
      const sideStep = !back && Math.abs(lat) > Math.abs(fwd) && m.sp > 0.8;
      const cycle = 1.2 + 0.28 * m.sp;
      m.phase += 2 * Math.PI * m.sp / cycle * dt;
      const ph = m.phase;

      const A = (0.3 + 0.78 * k) * mv * (back ? 0.55 : sideStep ? 0.3 : 1);
      const Ka = (0.45 + 1.55 * k) * mv * (back ? 0.6 : sideStep ? 0.5 : 1);
      const dirSign = back ? -1 : 1;
      const legPose = phi => {
        const swing = Math.max(0, Math.cos(phi + 0.6));
        return {
          hx: (-Math.sin(phi) * A - 0.06 * k * mv) * dirSign,
          hz: sideStep ? Math.sin(phi) * 0.3 * Math.sign(lat) : 0,
          hy: 0,
          kn: 0.1 + 0.12 * mv + Ka * Math.pow(swing, 1.3),
          an: 0.3 * swing * k - 0.08 * mv,
        };
      };
      const L = legPose(ph), R = legPose(ph + Math.PI);
      const armAmp = (0.22 + 0.9 * k) * mv;
      const aL = { x: Math.sin(ph) * armAmp * dirSign, z: 0.12, el: -(0.3 + 1.2 * k * mv) };
      const aR = { x: -Math.sin(ph) * armAmp * dirSign, z: -0.12, el: -(0.3 + 1.2 * k * mv) };
      let pelvisY = 0.97 - 0.035 * k * mv + Math.cos(2 * ph) * 0.028 * k * mv;
      let pelvisRotY = -Math.sin(ph) * 0.14 * k * mv;
      let pelvisRotZ = Math.sin(ph) * 0.04 * mv + clamp(-(p.turnRate || 0) * m.sp * 0.022, -0.35, 0.35);
      let pelvisRotX = 0;
      let spineX = 0.04 + 0.2 * k * mv + clamp(m.acc * 0.03, -0.15, 0.25) - (back ? 0.12 : 0);
      let spineY = Math.sin(ph) * 0.2 * k * mv;
      let neckX = 0;

      // واقف: تنفّس خفيف وركبتان مرتخيتان
      if (mv < 1) {
        const idle = 1 - mv;
        spineX += Math.sin(time * 2.2 + m.seed) * 0.015 * idle;
        L.kn += 0.06 * idle; R.kn += 0.06 * idle;
      }
      // الحارس في وضع الاستعداد عندما تقترب الكرة
      if (p.isGK && p.diveT > 1.1) {
        const near = clamp(1 - Math.hypot(ballPos.x - p.x, ballPos.y - p.y) / 30, 0, 1) * (1 - k);
        if (near > 0) {
          pelvisY -= 0.13 * near;
          L.hx -= 0.4 * near; R.hx -= 0.4 * near; L.kn += 0.75 * near; R.kn += 0.75 * near; L.an -= 0.35 * near; R.an -= 0.35 * near;
          L.hz += 0.12 * near; R.hz -= 0.12 * near;
          spineX += 0.32 * near;
          aL.x -= 0.5 * near; aR.x -= 0.5 * near; aL.z += 0.5 * near; aR.z -= 0.5 * near; aL.el += -0.4 * near; aR.el += -0.4 * near;
        }
      }
      // لمسة مراوغة: القدم تدفع الكرة
      if (p.touchT < 0.2 && p.kickT > p.kickPrep + 0.45) {
        const lg = p.touchN % 2 ? R : L;
        const u = Math.sin(Math.PI * p.touchT / 0.2);
        lg.hx -= 0.5 * u; lg.kn *= 1 - 0.5 * u;
      }
      // ضربة الكرة: رجوع القدم ثم التأرجح للأمام والمتابعة
      const kEnd = p.kickPrep + 0.45;
      if (p.kickT < kEnd) {
        const P = 0.55 + 0.6 * (p.kickPow || 0.6);
        const pr = Math.max(0.05, p.kickPrep), tk = p.kickT;
        let th, kn, w = 1;
        if (tk < pr) { const u = ease(tk / pr); th = 0.6 * P * u; kn = 0.4 + 1.3 * u; }
        else if (tk < pr + 0.2) { const v = (tk - pr) / 0.2, e = 1 - (1 - v) * (1 - v); th = 0.6 * P - 1.9 * P * e; kn = 1.7 * (1 - e) * (1 - e) + 0.05; }
        else { const v = (tk - pr - 0.2) / 0.25; th = -1.3 * P * (1 - v); kn = 0.3 * (1 - v); w = 1 - ease(v); }
        const blend = (a, b) => a + (b - a) * w;
        R.hx = blend(R.hx, th); R.kn = blend(R.kn, kn); R.an = blend(R.an, -0.2);
        if (p.kickKind === 'pass') R.hy = blend(0, -0.55); // باطن القدم
        L.hx = blend(L.hx, -0.25); L.kn = blend(L.kn, 0.4);
        aL.z = blend(aL.z, 0.3 + 0.9 * P); aL.x = blend(aL.x, -0.35); aR.x = blend(aR.x, 0.45); aR.z = blend(aR.z, -0.35);
        const twist = tk < pr ? -0.35 * P * ease(tk / pr) : 0.3 * P;
        spineY = blend(spineY, twist);
        if (p.kickKind === 'loft') spineX = blend(spineX, -0.2);
        if (p.kickKind === 'shot') spineX = blend(spineX, 0.22);
      }
      // ضربة رأسية: قفزة وإيماءة بالرأس
      if (p.headT < 0.55) {
        const u = p.headT / 0.55, j = Math.sin(Math.PI * u);
        pelvisY += j * 0.45;
        L.kn += 0.9 * j; R.kn += 0.9 * j; L.hx -= 0.4 * j; R.hx -= 0.4 * j;
        aL.x = -0.9 * j; aR.x = -0.9 * j; aL.z = 0.7 * j; aR.z = -0.7 * j;
        spineX = -0.35 + 0.8 * u; neckX = 0.3 * j;
      }
      // تدخل بالانزلاق: يجلس على الأرض وساق ممدودة
      if (p.slideT < 0.75) {
        const w = Math.min(1, p.slideT / 0.12) * (p.slideT > 0.55 ? (0.75 - p.slideT) / 0.2 : 1);
        const bl = (a, b) => a + (b - a) * w;
        pelvisY = bl(pelvisY, 0.3); spineX = bl(spineX, -0.95); pelvisRotZ = bl(pelvisRotZ, 0.2);
        R.hx = bl(R.hx, -1.45); R.kn = bl(R.kn, 0.05); L.hx = bl(L.hx, -0.55); L.kn = bl(L.kn, 1.7);
        aL.x = bl(aL.x, 0.7); aR.x = bl(aR.x, 0.7); aL.el = bl(aL.el, -0.2); aR.el = bl(aR.el, -0.2);
      }
      // الحارس يرتمي نحو الكرة
      if (p.diveT < 1.1) {
        const dx = p.diveX - p.x, dy = p.diveY - p.y;
        const side = Math.sign(dx * Math.cos(yaw) - dy * Math.sin(yaw)) || 1;
        const w = Math.sin(Math.min(1, p.diveT / 0.22) * Math.PI / 2) * (p.diveT > 0.8 ? (1.1 - p.diveT) / 0.3 : 1);
        const bl = (a, b) => a + (b - a) * w;
        pelvisRotZ = bl(pelvisRotZ, -side * 1.45); pelvisY = bl(pelvisY, 0.6);
        aL.x = bl(aL.x, -2.9); aR.x = bl(aR.x, -2.9); aL.el = bl(aL.el, -0.1); aR.el = bl(aR.el, -0.1);
        L.kn = bl(L.kn, 0.15); R.kn = bl(R.kn, 0.3); L.hx = bl(L.hx, 0); R.hx = bl(R.hx, 0.2);
        spineX = bl(spineX, 0);
      }
      // احتفال بالهدف: الذراعان مفتوحتان مثل الطائرة
      if (p.celebT < 2.4) {
        aL.x = 0; aR.x = 0; aL.z = 1.45; aR.z = -1.45; aL.el = -0.1; aR.el = -0.1;
        pelvisRotZ += Math.sin(p.celebT * 3) * 0.25;
      }
      if (p.stunT > 0) { spineX += 0.25; aL.z += 0.4; aR.z -= 0.4; }

      neckX += -spineX * 0.6;
      m.pelvis.position.y = pelvisY;
      m.pelvis.rotation.set(pelvisRotX, pelvisRotY, pelvisRotZ);
      m.spine.rotation.set(spineX, spineY, 0);
      m.neck.rotation.x = neckX;
      for (const [lg, ps] of [[m.legL, L], [m.legR, R]]) {
        lg.hip.rotation.set(ps.hx, ps.hy, ps.hz);
        lg.knee.rotation.x = ps.kn;
        lg.ankle.rotation.x = ps.an;
      }
      m.armL.sh.rotation.set(aL.x, 0, aL.z); m.armL.el.rotation.x = aL.el;
      m.armR.sh.rotation.set(aR.x, 0, aR.z); m.armR.el.rotation.x = aR.el;
    }

    let t = 0;
    function frame(state, dt) {
      t += dt;
      for (const [p, m] of models) animatePlayer(p, m, dt, t, state.ball);
      const u = state.user;
      ring.position.x = callRing.position.x = X(u.x);
      ring.position.z = callRing.position.z = Z(u.y);
      callRing.visible = u.callTimer > 0;
      if (callRing.visible) { const s = 1 + (t * 2 % 1) * 0.8; callRing.scale.set(s, s, s); callRing.material.opacity = 0.6 * (1 - (t * 2 % 1)); }
      arrow.position.set(X(u.x), 2.55 + Math.sin(t * 5) * 0.1, Z(u.y));

      const b = state.ball;
      ball.position.set(X(b.x), BR + b.z, Z(b.y));
      const bs = Math.hypot(b.vx, b.vy);
      if (bs > 0.1) {
        // تدحرج الكرة حول محور عمودي على اتجاه الحركة
        const axis = new THREE.Vector3(b.vy, 0, -b.vx).normalize();
        ball.rotateOnWorldAxis(axis, -bs * dt / BR);
      }
      ballShadow.position.x = X(b.x) + b.z * 0.25; ballShadow.position.z = Z(b.y) - b.z * 0.15;
      const ss = Math.max(0.25, 0.5 - b.z * 0.04);
      ballShadow.scale.set(ss, ss, ss);

      // كاميرا البث: تتبع لاعبك والكرة، من جانب الملعب
      const tx = X(u.x * 0.75 + b.x * 0.25), tz = Z(u.y * 0.8 + b.y * 0.2); // الكاميرا تتمحور حول لاعبك
      cam.x += (tx - cam.x) * Math.min(1, dt * 2.2);
      cam.z += (tz - cam.z) * Math.min(1, dt * 1.6);
      const cx = Math.max(-L / 2 + 8, Math.min(L / 2 - 8, cam.x));
      const dist = 30 * zoom;
      camera.position.set(cx, dist * 0.5, cam.z * 0.6 + dist);
      camera.lookAt(cx, 0, cam.z * 0.9 + 2.5 * zoom); // اللاعب أعلى قليلاً من منتصف الشاشة، بعيداً عن الأزرار
      renderer.render(scene, camera);
    }

    function dispose() {
      renderer.dispose();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
      });
      renderer.domElement.remove();
    }

    return { frame, resize, dispose, project, setZoom(z) { zoom = z; } };
  }

  // ---------- بناء الملعب ----------
  function buildPitch(scene, look, aniso) {
    const pxm = 20; // بكسل لكل متر
    const M = 4; // هامش حول الخطوط
    const cv = document.createElement('canvas');
    cv.width = (L + M * 2) * pxm; cv.height = (W + M * 2) * pxm;
    const g = cv.getContext('2d');
    g.fillStyle = look.grassA; g.fillRect(0, 0, cv.width, cv.height);
    const stripes = 18;
    for (let i = 0; i < stripes; i += 2) { g.fillStyle = look.grassB; g.fillRect((M + i * L / stripes) * pxm, 0, L / stripes * pxm, cv.height); }
    if (look.patch) {
      g.fillStyle = look.patch;
      for (let i = 0; i < 160; i++) {
        g.globalAlpha = 0.25 + Math.random() * 0.4;
        g.beginPath();
        g.ellipse(Math.random() * cv.width, Math.random() * cv.height, (0.4 + Math.random() * 2) * pxm, (0.3 + Math.random()) * pxm, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // ضجيج خفيف حتى لا يبدو العشب مسطحاً
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.04)';
      g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 3, 3);
    }
    g.save();
    g.translate(M * pxm, M * pxm);
    g.scale(pxm, pxm);
    g.strokeStyle = look.line; g.fillStyle = look.line; g.lineWidth = 0.12;
    g.strokeRect(0, 0, L, W);
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L / 2, W); g.stroke();
    g.beginPath(); g.arc(L / 2, W / 2, 9.15, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(L / 2, W / 2, 0.25, 0, Math.PI * 2); g.fill();
    for (const side of [0, 1]) {
      const sx = v => (side ? L - v : v);
      g.strokeRect(side ? L - 16.5 : 0, W / 2 - 20.16, 16.5, 40.32);
      g.strokeRect(side ? L - 5.5 : 0, W / 2 - 9.16, 5.5, 18.32);
      g.beginPath(); g.arc(sx(11), W / 2, 0.22, 0, Math.PI * 2); g.fill();
      g.beginPath();
      if (side) g.arc(L - 11, W / 2, 9.15, Math.PI - 0.93, Math.PI + 0.93); else g.arc(11, W / 2, 9.15, -0.93, 0.93);
      g.stroke();
      for (const cy of [0, W]) { g.beginPath(); g.arc(sx(0), cy, 1, 0, Math.PI * 2); g.stroke(); }
    }
    g.restore();

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L + M * 2, W + M * 2), new THREE.MeshLambertMaterial({ map: tex }));
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshLambertMaterial({ color: look.outside }));
    outside.rotation.x = -Math.PI / 2; outside.position.y = -0.02;
    scene.add(outside);
  }

  function buildGoals(scene) {
    const post = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const netTex = netTexture();
    const net = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const pg = new THREE.CylinderGeometry(0.06, 0.06, BAR + 0.06, 8);
    const bg = new THREE.CylinderGeometry(0.06, 0.06, GH * 2 + 0.12, 8);
    const depth = 2;
    for (const side of [-1, 1]) {
      const gx = side * L / 2;
      const grp = new THREE.Group();
      for (const s of [-1, 1]) { const p = new THREE.Mesh(pg, post); p.position.set(gx, BAR / 2, s * GH); grp.add(p); }
      const bar = new THREE.Mesh(bg, post); bar.rotation.x = Math.PI / 2; bar.position.set(gx, BAR, 0); grp.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GH * 2, BAR), net);
      back.rotation.y = Math.PI / 2; back.position.set(gx + side * depth, BAR / 2, 0); grp.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, GH * 2), net);
      top.rotation.x = -Math.PI / 2; top.position.set(gx + side * depth / 2, BAR, 0); grp.add(top);
      for (const s of [-1, 1]) {
        const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(depth, BAR), net);
        sideNet.position.set(gx + side * depth / 2, BAR / 2, s * GH); grp.add(sideNet);
      }
      scene.add(grp);
    }
  }

  function buildSurroundings(scene, look) {
    // لوحات إعلانية حول الملعب (من الدرجة الجهوية فما فوق)
    if (look.stands >= 1) {
      const adTex = adTexture();
      const adMat = new THREE.MeshBasicMaterial({ map: adTex });
      for (const [w, x, z, ry] of [[L + 10, 0, -W / 2 - 4.5, 0], [L + 10, 0, W / 2 + 4.5, Math.PI], [W + 6, -L / 2 - 5.5, 0, Math.PI / 2], [W + 6, L / 2 + 5.5, 0, -Math.PI / 2]]) {
        const ad = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), adMat);
        ad.position.set(x, 0.45, z); ad.rotation.y = ry;
        scene.add(ad);
      }
    } else {
      // سياج بسيط في ملعب الحي
      const fence = new THREE.MeshLambertMaterial({ color: 0x7a7f86 });
      for (const [w, x, z, ry] of [[L + 16, 0, -W / 2 - 7, 0], [W + 14, -L / 2 - 8, 0, Math.PI / 2], [W + 14, L / 2 + 8, 0, Math.PI / 2]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 0.08), fence);
        f.position.set(x, 0.7, z); f.rotation.y = ry; scene.add(f);
      }
    }
    // المدرجات: كلما ارتفع المستوى زادت صفوفها
    if (look.stands >= 1) {
      const crowd = new THREE.MeshLambertMaterial({ map: crowdTexture(look.stands) });
      const rows = [0, 6, 10, 15, 20][look.stands];
      const gap = 9;
      const sides = look.stands >= 3 ? 4 : look.stands === 2 ? 3 : 1;
      const defs = [
        [L + 20, 0, -W / 2 - gap, 0], [W + 10, -L / 2 - gap - 2, 0, Math.PI / 2], [W + 10, L / 2 + gap + 2, 0, -Math.PI / 2], [L + 20, 0, W / 2 + gap + 18, Math.PI],
      ].slice(0, sides);
      for (const [w, x, z, ry] of defs) {
        const stand = new THREE.Group();
        const slope = new THREE.Mesh(new THREE.PlaneGeometry(w, rows * 1.4), crowd);
        slope.rotation.x = -0.6;
        slope.position.set(0, rows * 0.4, -rows * 0.55);
        crowd.map.repeat.set(w / 20, 1);
        stand.add(slope);
        const roofH = rows * 0.82 + 3;
        if (look.stands >= 3) {
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, rows * 0.9), new THREE.MeshLambertMaterial({ color: 0x2a3138 }));
          roof.position.set(0, roofH, -rows * 0.55);
          stand.add(roof);
        }
        stand.position.set(x, 0, z); stand.rotation.y = ry;
        scene.add(stand);
      }
    }
    if (look.trees) {
      const trunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2c }), leaf = new THREE.MeshLambertMaterial({ color: 0x3f6b35 });
      const tg = new THREE.CylinderGeometry(0.25, 0.35, 3, 6), lg = new THREE.ConeGeometry(2.4, 6, 7);
      for (let i = 0; i < 26; i++) {
        const x = -70 + i * 5.6 + Math.random() * 2, z = -W / 2 - 16 - Math.random() * 14;
        const tr = new THREE.Mesh(tg, trunk); tr.position.set(x, 1.5, z);
        const lf = new THREE.Mesh(lg, leaf); lf.position.set(x, 5.5, z); lf.scale.setScalar(0.8 + Math.random() * 0.5);
        scene.add(tr, lf);
      }
    }
    if (look.lights) {
      const pole = new THREE.MeshLambertMaterial({ color: 0x4a5058 });
      const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (L / 2 + 14), z = sz * (W / 2 + 16);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 34, 6), pole); p.position.set(x, 17, z);
        const l = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.5), lamp); l.position.set(x, 34, z); l.lookAt(0, 0, 0);
        scene.add(p, l);
      }
    }
  }

  // ---------- قوام مرسومة بالكود ----------
  const numCache = new Map();
  function numberMat(n, kit) {
    const key = n + '|' + kit[1];
    if (numCache.has(key)) return numCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = kit[1];
    g.font = '700 46px "Readex Pro", Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 32, 36);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false });
    numCache.set(key, m);
    return m;
  }

  function radialTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function ballTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1d1d1d';
    for (const [x, y] of [[32, 64], [96, 30], [96, 98], [160, 64], [224, 30], [224, 98], [0, 10], [128, 118]]) {
      g.beginPath();
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); }
      g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function netTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3);
    return t;
  }

  function crowdTexture(level) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#3b4148'; g.fillRect(0, 0, 512, 256);
    const fill = [0, 0.35, 0.6, 0.85, 0.97][level];
    const cols = ['#d94a3d', '#f6f1e3', '#2b6cb0', '#f2b134', '#3f8f4f', '#1b1b1b', '#c9c9c9', '#8a5a3a'];
    for (let y = 4; y < 256; y += 9) {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 6, 512, 2);
      for (let x = 2; x < 512; x += 7) {
        if (Math.random() > fill) continue;
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, y, 5, 5);
        g.fillStyle = '#d9a77e'; g.fillRect(x + 1, y - 2, 3, 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }

  function adTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
    const g = c.getContext('2d');
    const ads = [['#1d3f8f', 'حلم الملاعب'], ['#d94a3d', 'رياضة للجميع'], ['#2a7c36', 'ملعب الحي'], ['#f2b134', 'كرة القدم']];
    ads.forEach(([bg, text], i) => {
      g.fillStyle = bg; g.fillRect(i * 256, 0, 256, 64);
      g.fillStyle = bg === '#f2b134' ? '#1b2a33' : '#ffffff';
      g.font = '700 34px "Readex Pro", Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.direction = 'rtl';
      g.fillText(text, i * 256 + 128, 34);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1);
    return t;
  }

  FC.Render3D = { create };
})();
