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

    // ---------- اللاعبون ----------
    const geo = {
      torso: new THREE.CapsuleGeometry(0.19, 0.4, 4, 10),
      head: new THREE.SphereGeometry(0.13, 14, 10),
      hair: new THREE.SphereGeometry(0.138, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      upperArm: new THREE.CapsuleGeometry(0.065, 0.2, 3, 8),
      foreArm: new THREE.CapsuleGeometry(0.052, 0.22, 3, 8),
      thigh: new THREE.CapsuleGeometry(0.085, 0.26, 3, 8),
      shin: new THREE.CapsuleGeometry(0.064, 0.34, 3, 8),
      shoe: new THREE.BoxGeometry(0.11, 0.08, 0.26),
      shadow: new THREE.PlaneGeometry(1.3, 1.3),
    };
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, opacity: 0.55 });
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const skinMats = SKINS.map(mat), hairMats = HAIRS.map(mat);
    const shoeMat = mat('#1a1a1a');

    function makePlayer(p, kit) {
      const shirt = mat(kit[0]), shorts = mat(kit[1]), socks = mat(kit[0]);
      const skin = skinMats[(p.number * 7 + p.team * 3) % SKINS.length];
      const hair = hairMats[(p.number * 5 + p.team) % HAIRS.length];
      const g = new THREE.Group();
      const body = new THREE.Group(); // كل الجسم ما عدا الظل، يميل ويدور
      g.add(body);

      const torso = new THREE.Mesh(geo.torso, shirt);
      torso.position.y = 1.27; torso.scale.set(1.15, 1, 0.72);
      const head = new THREE.Mesh(geo.head, skin); head.position.y = 1.72;
      const hairM = new THREE.Mesh(geo.hair, hair); hairM.position.y = 1.735; hairM.rotation.x = -0.25;
      body.add(torso, head, hairM);

      const limb = (x, y, parts) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        for (const [gm, m, off] of parts) { const mesh = new THREE.Mesh(gm, m); mesh.position.y = off; pivot.add(mesh); }
        body.add(pivot);
        return pivot;
      };
      const armL = limb(0.27, 1.5, [[geo.upperArm, shirt, -0.12], [geo.foreArm, skin, -0.38]]);
      const armR = limb(-0.27, 1.5, [[geo.upperArm, shirt, -0.12], [geo.foreArm, skin, -0.38]]);
      const legParts = [[geo.thigh, shorts, -0.17], [geo.shin, socks, -0.55]];
      const legL = limb(0.11, 0.93, legParts), legR = limb(-0.11, 0.93, legParts);
      for (const leg of [legL, legR]) { const s = new THREE.Mesh(geo.shoe, shoeMat); s.position.set(0, -0.88, 0.05); leg.add(s); }
      armL.rotation.z = 0.12; armR.rotation.z = -0.12;

      const shadow = new THREE.Mesh(geo.shadow, shadowMat);
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
      g.add(shadow);
      scene.add(g);
      return { g, body, armL, armR, legL, legR, phase: Math.random() * 6 };
    }

    const models = new Map();
    for (const t of opts.teams) {
      for (const p of t.players) {
        const kit = p.isGK ? (t.index === 0 ? ['#2d2d2d', '#1a1a1a'] : ['#e9d238', '#1b2a33']) : t.colors;
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
    const BR = 0.2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 18, 14), new THREE.MeshLambertMaterial({ map: ballTexture() }));
    scene.add(ball);
    const ballShadow = new THREE.Mesh(geo.shadow, shadowMat);
    ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.025;
    scene.add(ballShadow);

    // ---------- الكاميرا ----------
    const cam = { x: 0, z: 0 };
    let zoom = opts.zoom || 1;
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = camera.aspect < 1.4 ? 38 : 30;
      camera.updateProjectionMatrix();
    }
    resize();

    function animatePlayer(p, m, dt) {
      m.g.position.set(X(p.x), 0, Z(p.y));
      const sp = Math.hypot(p.vx, p.vy);
      const targetRot = Math.atan2(p.fx, p.fy);
      let dr = targetRot - m.g.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      m.g.rotation.y += dr * Math.min(1, dt * 12);

      // دورة الجري: سرعة الخطوات تتبع سرعة اللاعب
      m.phase += sp * dt * 1.9;
      const amp = Math.min(1, sp / 7) * 0.85;
      let legL = Math.sin(m.phase) * amp, legR = -legL;
      let armL = -legL * 0.8, armR = -legR * 0.8;
      let lean = Math.min(0.22, sp * 0.025), roll = 0, lift = Math.abs(Math.sin(m.phase)) * amp * 0.06;

      if (p.kickT < 0.32) { // ضربة الكرة بالقدم اليمنى
        const k = Math.sin(Math.PI * p.kickT / 0.32);
        legR = -1.35 * k + 0.3; armL = 0.6 * k; armR = -0.4 * k;
      }
      if (p.headT < 0.45) { // ضربة رأسية: قفزة
        lift = Math.sin(Math.PI * p.headT / 0.45) * 0.45;
        armL = armR = -1.2; lean = -0.25;
      }
      if (p.slideT < 0.6) { // تدخل بالانزلاق
        const k = Math.min(1, p.slideT / 0.12);
        lean = -1.15 * k; legR = -1.4 * k; legL = -1.0 * k; lift = -0.55 * k;
      }
      if (p.diveT < 0.9) { // الحارس يرتمي
        const k = Math.sin(Math.min(1, p.diveT / 0.25) * Math.PI / 2);
        roll = -p.diveDir * 1.35 * k; lift = 0.35 * k; armL = armR = -2.6 * k;
      }
      if (p.celebT < 2.4) { // احتفال بالهدف: الذراعان للأعلى
        armL = armR = -2.7; lift = Math.abs(Math.sin(p.celebT * 9)) * 0.25;
      }
      m.legL.rotation.x = legL; m.legR.rotation.x = legR;
      m.armL.rotation.x = armL; m.armR.rotation.x = armR;
      m.body.rotation.x = lean;
      m.body.rotation.z = roll;
      m.body.position.y = lift;
    }

    let t = 0;
    function frame(state, dt) {
      t += dt;
      for (const [p, m] of models) animatePlayer(p, m, dt);
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
      const tx = X(u.x * 0.55 + b.x * 0.45), tz = Z(u.y * 0.5 + b.y * 0.5);
      cam.x += (tx - cam.x) * Math.min(1, dt * 2.2);
      cam.z += (tz - cam.z) * Math.min(1, dt * 1.6);
      const cx = Math.max(-L / 2 + 8, Math.min(L / 2 - 8, cam.x));
      const dist = 30 * zoom;
      camera.position.set(cx, dist * 0.5, cam.z * 0.6 + dist);
      camera.lookAt(cx, 0, cam.z * 0.9 - 1);
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

    return { frame, resize, dispose, setZoom(z) { zoom = z; } };
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
