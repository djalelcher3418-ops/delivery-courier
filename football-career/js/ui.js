// الشاشات: البداية، إنشاء اللاعب، المركز الرئيسي، التدريب، الترتيب، ما بعد المباراة، نهاية الموسم
(function () {
  const C = FC.Career;
  const app = () => document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' ألف' : String(n);
  const kit = (c) => `<i class="kit" style="background:${c[0]};border-color:${c[1]}"></i>`;
  let match = null;

  function render(html, after) {
    app().innerHTML = html;
    app().scrollTop = 0;
    window.scrollTo(0, 0);
    if (after) after(app());
  }
  const on = (root, sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => { FC.Sound.unlock(); goFullscreen(); fn(el, e); }));

  // ملء الشاشة وتثبيت الوضع الأفقي (يعمل في متصفح الهاتف وفي التطبيق لاحقاً)
  function goFullscreen() {
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => { /* غير مسموح هنا: لا بأس */ });
  }

  const UI = {
    // ---------- شاشة البداية ----------
    title() {
      const s = C.load();
      render(`
        <main class="screen title-screen">
          <canvas class="title-bg" aria-hidden="true"></canvas>
          <div class="title-inner">
            <p class="eyebrow">من ملعب الحي إلى أكبر الملاعب</p>
            <h1 class="logo">حلم<br>الملاعب</h1>
            <p class="lede">اصنع لاعبك وعمره 16 سنة، تدرّب، العب المباريات بنفسك، واصعد من دوري الأحياء إلى دوري النخبة.</p>
            <div class="stack">
              ${s && !s.retired ? `<button class="btn primary big" data-a="cont">تابع مسيرة ${esc(s.player.name)}<small>${esc(C.clubName())} · الموسم ${s.season}</small></button>` : ''}
              <button class="btn ${s && !s.retired ? '' : 'primary big'}" data-a="new">مسيرة جديدة</button>
            </div>
          </div>
        </main>`, root => {
        on(root, '[data-a=cont]', () => UI.hub());
        on(root, '[data-a=new]', () => {
          if (s && !s.retired) UI.confirm('ستُحذف مسيرتك الحالية. هل تبدأ من جديد؟', 'ابدأ من جديد', () => UI.create());
          else UI.create();
        });
        drawTitleBg(root.querySelector('.title-bg'));
      });
    },

    confirm(text, yes, fn) {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `<div class="modal-card"><p>${esc(text)}</p><div class="row"><button class="btn primary" data-y>${esc(yes)}</button><button class="btn" data-n>تراجع</button></div></div>`;
      document.body.appendChild(wrap);
      wrap.querySelector('[data-y]').onclick = () => { wrap.remove(); fn(); };
      wrap.querySelector('[data-n]').onclick = () => wrap.remove();
    },

    // ---------- إنشاء اللاعب ----------
    create() {
      const f = { name: '', nation: FC.NATIONS[0], pos: 'ST', style: 'fast', foot: 'R', number: 9 };
      const posCards = Object.entries(FC.POSITIONS).map(([k, p]) => `<button type="button" class="chip-card" data-pos="${k}"><b>${k}</b><span>${p.name}</span></button>`).join('');
      const styleCards = Object.entries(FC.STYLES).map(([k, s]) => `<button type="button" class="chip-card" data-style="${k}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('');
      render(`
        <main class="screen">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>لاعب جديد</h2></header>
          <form class="create" id="create-form" autocomplete="off">
            <label class="field"><span>اسم اللاعب</span><input id="c-name" maxlength="18" placeholder="مثال: ياسين حداد" required></label>
            <div class="row2">
              <label class="field"><span>الجنسية</span><select id="c-nation">${FC.NATIONS.map(n => `<option>${n}</option>`).join('')}</select></label>
              <label class="field"><span>رقم القميص</span><input id="c-number" type="number" min="1" max="99" value="9"></label>
            </div>
            <fieldset><legend>المركز</legend><div class="chip-grid">${posCards}</div></fieldset>
            <fieldset><legend>أسلوب اللعب</legend><div class="chip-grid four">${styleCards}</div></fieldset>
            <fieldset><legend>القدم المفضلة</legend><div class="seg"><button type="button" data-foot="R">اليمنى</button><button type="button" data-foot="L">اليسرى</button></div></fieldset>
            <div class="preview" id="c-preview"></div>
            <button class="btn primary big" type="submit">ابدأ المسيرة</button>
          </form>
        </main>`, root => {
        const sel = () => {
          root.querySelectorAll('[data-pos]').forEach(b => b.classList.toggle('on', b.dataset.pos === f.pos));
          root.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === f.style));
          root.querySelectorAll('[data-foot]').forEach(b => b.classList.toggle('on', b.dataset.foot === f.foot));
          root.querySelector('#c-preview').innerHTML = `<span>المهارات التي ستتطور أسرع في مركز ${FC.POSITIONS[f.pos].name}:</span> ` +
            Object.entries(FC.POSITIONS[f.pos].w).filter(([, w]) => w >= 0.2).map(([k]) => `<b>${FC.ATTRS[k].name}</b>`).join('، ');
        };
        on(root, '[data-pos]', el => { f.pos = el.dataset.pos; sel(); });
        on(root, '[data-style]', el => { f.style = el.dataset.style; sel(); });
        on(root, '[data-foot]', el => { f.foot = el.dataset.foot; sel(); });
        on(root, '[data-a=back]', () => UI.title());
        sel();
        root.querySelector('#create-form').addEventListener('submit', e => {
          e.preventDefault();
          FC.Sound.unlock();
          f.name = root.querySelector('#c-name').value.trim() || 'اللاعب';
          f.nation = root.querySelector('#c-nation').value;
          f.number = Math.max(1, Math.min(99, parseInt(root.querySelector('#c-number').value, 10) || 9));
          C.create(f);
          UI.hub();
        });
      });
    },

    // ---------- المركز الرئيسي ----------
    hub() {
      const s = C.state;
      if (!s) return UI.title();
      if (s.retired) return UI.retired();
      if (s.week >= FC.SEASON_WEEKS) return UI.seasonEnd();
      const p = s.player, ovr = C.overall(), tier = C.tier();
      const fx = C.nextFixture();
      const homeI = fx.home ? s.club : fx.opp, awayI = fx.home ? fx.opp : s.club;
      const place = C.standings().findIndex(r => r.club === s.club) + 1;
      const starter = C.isStarter();
      const attrs = Object.entries(FC.ATTRS).map(([k, a]) => {
        const v = p.attrs[k];
        const key = FC.POSITIONS[p.pos].w[k] >= 0.2;
        return `<li class="${key ? 'key' : ''}"><span>${a.name}</span><i><b style="width:${v}%"></b></i><em>${Math.floor(v)}</em></li>`;
      }).join('');
      render(`
        <main class="screen hub">
          <section class="pcard" style="--kit:${C.clubColors()[0]};--kit2:${C.clubColors()[1]}">
            <div class="ovr"><b>${ovr}</b><span>${p.pos}</span></div>
            <div class="pinfo">
              <h2>${esc(p.name)} <small>#${p.number}</small></h2>
              <p>${esc(p.nation)} · ${p.age} سنة · ${FC.POSITIONS[p.pos].name}</p>
              <p class="club">${kit(C.clubColors())} ${esc(C.clubName())}</p>
            </div>
            <div class="tier-tag"><span>${tier.label}</span>${tier.name}</div>
          </section>

          <section class="meters">
            <div class="meter"><span>الطاقة</span><i><b class="${s.energy < 40 ? 'warn' : ''}" style="width:${s.energy}%"></b></i><em>${Math.round(s.energy)}</em></div>
            <div class="meter"><span>ثقة المدرب</span><i><b class="${s.trust < 50 ? 'warn' : ''}" style="width:${s.trust}%"></b></i><em>${Math.round(s.trust)}</em></div>
            <div class="facts">
              <span class="pill ${starter ? 'good' : 'bad'}">${starter ? 'أساسي' : 'احتياطي'}</span>
              <span class="pill">المركز ${place} في الدوري</span>
              <span class="pill">المال: ${money(s.money)}</span>
              <span class="pill">الشهرة: ${Math.round(s.fame)}</span>
            </div>
          </section>

          <section class="fixture">
            <p class="eyebrow">الجولة ${s.week + 1} من ${FC.SEASON_WEEKS} · الموسم ${s.season} · ${tier.ground}</p>
            <div class="vs">
              <div class="side ${homeI === s.club ? 'me' : ''}">${kit(C.clubColors(homeI))}<b>${esc(C.clubName(homeI))}</b><small>القوة ${C.teamStrength(homeI)}</small></div>
              <span class="v">ضد</span>
              <div class="side ${awayI === s.club ? 'me' : ''}">${kit(C.clubColors(awayI))}<b>${esc(C.clubName(awayI))}</b><small>القوة ${C.teamStrength(awayI)}</small></div>
            </div>
            <button class="btn primary big" data-a="play">إلى المباراة</button>
          </section>

          <section class="actions">
            <button class="act" data-a="train" ${s.trainedThisWeek >= 2 || s.energy < 20 ? 'disabled' : ''}><b>تدريب</b><small>${s.trainedThisWeek >= 2 ? 'انتهت حصص الأسبوع' : s.energy < 20 ? 'طاقتك منخفضة' : `باقي ${2 - s.trainedThisWeek} حصة · -20 طاقة`}</small></button>
            <button class="act" data-a="rest" ${s.trainedThisWeek >= 2 ? 'disabled' : ''}><b>راحة</b><small>+30 طاقة</small></button>
            <button class="act" data-a="table"><b>الترتيب</b><small>${tier.name}</small></button>
            <button class="act" data-a="career"><b>مسيرتي</b><small>${s.career.apps} مباراة · ${s.career.goals} هدف</small></button>
          </section>

          <div class="cols">
            <section class="panel">
              <h3>المهارات <small>أقصى ما يمكن بلوغه: ${p.potential}</small></h3>
              <ul class="attrs">${attrs}</ul>
            </section>
            <section class="panel">
              <h3>الأخبار</h3>
              <ul class="news">${s.news.map(n => `<li><small>م${n.season} · ج${n.week}</small>${esc(n.text)}</li>`).join('')}</ul>
            </section>
          </div>

          <footer class="foot"><button class="link" data-a="settings">الإعدادات</button><button class="link" data-a="home">الشاشة الأولى</button></footer>
        </main>`, root => {
        on(root, '[data-a=play]', () => UI.preMatch());
        on(root, '[data-a=train]', () => UI.training());
        on(root, '[data-a=rest]', () => { C.rest(); UI.hub(); });
        on(root, '[data-a=table]', () => UI.table());
        on(root, '[data-a=career]', () => UI.career());
        on(root, '[data-a=settings]', () => UI.settings());
        on(root, '[data-a=home]', () => UI.title());
      });
    },

    // ---------- التدريب ----------
    training(last) {
      const s = C.state, p = s.player;
      const drills = {
        pace: 'جري سرعات 30 متر', shooting: 'تسديد على المرمى', passing: 'تمريرات قصيرة وطويلة',
        dribbling: 'مراوغة بين الأقماع', defending: 'تمركز وافتكاك', physical: 'صالة الأثقال',
      };
      const can = s.energy >= 20 && s.trainedThisWeek < 2;
      render(`
        <main class="screen">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>التدريب</h2></header>
          <p class="sub">الطاقة ${Math.round(s.energy)} · باقي ${Math.max(0, 2 - s.trainedThisWeek)} حصة هذا الأسبوع. كلما اقتربت المهارة من حدك الأقصى (${p.potential}) صار التطور أبطأ.</p>
          ${last ? `<div class="result-banner"><b>+${last.gain}</b> ${FC.ATTRS[last.attr].name}${last.ovrAfter > last.ovrBefore ? ` · التقييم العام صار ${last.ovrAfter}` : ''}</div>` : ''}
          <div class="drills">
            ${Object.entries(drills).map(([k, d]) => `
              <button class="drill" data-k="${k}" ${can ? '' : 'disabled'}>
                <span class="dn">${FC.ATTRS[k].name}</span><small>${d}</small>
                <em>${Math.floor(p.attrs[k])}</em>
              </button>`).join('')}
          </div>
        </main>`, root => {
        on(root, '[data-a=back]', () => UI.hub());
        on(root, '[data-k]', el => {
          const r = C.train(el.dataset.k);
          if (r) UI.training({ ...r, attr: el.dataset.k });
        });
      });
    },

    // ---------- الترتيب ----------
    table() {
      const s = C.state;
      const rows = C.standings();
      render(`
        <main class="screen">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>${C.tier().name}</h2></header>
          <p class="sub">الجولة ${s.week} من ${FC.SEASON_WEEKS}. البطل يُتوَّج باللقب، والتقييم الجيد يجلب عروضاً من الدرجات الأعلى.</p>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>#</th><th class="tn">النادي</th><th>لعب</th><th>ف</th><th>ت</th><th>خ</th><th>+/-</th><th>نقاط</th></tr></thead>
            <tbody>${rows.map((r, i) => `<tr class="${r.club === s.club ? 'me' : ''}"><td>${i + 1}</td><td class="tn">${kit(C.clubColors(r.club))}${esc(C.clubName(r.club))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody>
          </table></div>
        </main>`, root => on(root, '[data-a=back]', () => UI.hub()));
    },

    // ---------- المسيرة ----------
    career() {
      const s = C.state, cs = s.career;
      const avg = cs.apps ? (cs.ratingSum / cs.apps).toFixed(2) : '-';
      render(`
        <main class="screen">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>مسيرتي</h2></header>
          <div class="bigstats">
            <div><b>${cs.apps}</b><span>مباراة</span></div><div><b>${cs.goals}</b><span>هدف</span></div>
            <div><b>${cs.assists}</b><span>تمريرة حاسمة</span></div><div><b>${avg}</b><span>متوسط التقييم</span></div>
            <div><b>${cs.motm}</b><span>رجل المباراة</span></div><div><b>${s.trophies.length}</b><span>لقب</span></div>
          </div>
          ${s.trophies.length ? `<section class="panel"><h3>الألقاب</h3><ul class="news">${s.trophies.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
          <section class="panel"><h3>المواسم</h3>
            ${s.history.length ? `<div class="table-wrap"><table class="tbl">
              <thead><tr><th>الموسم</th><th class="tn">النادي</th><th>الترتيب</th><th>م</th><th>أهداف</th><th>حاسمة</th><th>تقييم</th><th>عام</th></tr></thead>
              <tbody>${s.history.map(h => `<tr><td>${h.season}</td><td class="tn">${esc(h.clubName)}<small> · ${FC.TIERS[h.tier].label}</small></td><td>${h.place}</td><td>${h.apps}</td><td>${h.goals}</td><td>${h.assists}</td><td>${h.avg.toFixed(1)}</td><td>${h.ovr}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="sub">أكمل موسمك الأول ليظهر هنا.</p>'}
          </section>
        </main>`, root => on(root, '[data-a=back]', () => UI.hub()));
    },

    // ---------- الإعدادات ----------
    settings() {
      const st = C.settings();
      render(`
        <main class="screen">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>الإعدادات</h2></header>
          <section class="panel">
            <h3>مدة المباراة</h3>
            <p class="sub">الوقت الحقيقي لمباراة كاملة من 90 دقيقة.</p>
            <div class="seg">${[3, 5, 8, 12].map(m => `<button data-m="${m}" class="${st.matchMinutes === m ? 'on' : ''}">${m} دقائق</button>`).join('')}</div>
          </section>
          <section class="panel">
            <h3>الكاميرا</h3>
            <div class="seg">${[[0.8, 'قريبة'], [1, 'عادية'], [1.25, 'بعيدة']].map(([z, n]) => `<button data-z="${z}" class="${(st.zoom || 1) === z ? 'on' : ''}">${n}</button>`).join('')}</div>
          </section>
          <section class="panel">
            <h3>التحكم</h3>
            <ul class="help">
              <li><b>الحركة:</b> المس يسار الشاشة واسحب إصبعك. العصا تظهر حيث تلمس.</li>
              <li><b>بالكرة:</b> تمرير أرضي، بينية أمام زميلك، عرضية عالية، وتسديد (اضغط مطولاً لقوة أكبر، والقوة الزائدة تطير فوق العارضة). اتجاه العصا يختار الزميل أو زاوية التسديد.</li>
              <li><b>بدون كرة:</b> «اطلب» ليمرر لك زميلك، «اطلب بينية» لتنطلق خلف الدفاع، «افتك» لأخذ الكرة، واضغط مطولاً على «ضغط» ليركض لاعبك نحو الكرة.</li>
              <li><b>ركض:</b> اضغط مطولاً، واللياقة تنقص.</li>
            </ul>
          </section>
          <section class="panel danger">
            <h3>المسيرة</h3>
            <button class="btn" data-a="reset">حذف المسيرة والبدء من جديد</button>
          </section>
        </main>`, root => {
        on(root, '[data-a=back]', () => UI.hub());
        on(root, '[data-m]', el => { C.state.settings.matchMinutes = +el.dataset.m; C.save(); UI.settings(); });
        on(root, '[data-z]', el => { C.state.settings.zoom = +el.dataset.z; C.save(); UI.settings(); });
        on(root, '[data-a=reset]', () => UI.confirm('حذف المسيرة نهائياً؟', 'احذف', () => { C.reset(); UI.title(); }));
      });
    },

    // ---------- قبل المباراة ----------
    preMatch() {
      const s = C.state;
      const fx = C.nextFixture();
      const starter = C.isStarter();
      const st = C.settings();
      render(`
        <main class="screen prematch">
          <header class="bar"><button class="link" data-a="back">→ رجوع</button><h2>يوم المباراة</h2></header>
          <section class="panel">
            <p class="eyebrow">${fx.home ? 'على أرضنا' : 'خارج الديار'} · ${C.tier().ground}</p>
            <h3 class="vs-title">${esc(C.clubName())} <span>ضد</span> ${esc(C.clubName(fx.opp))}</h3>
            ${starter
              ? `<p>المدرب وضعك في <b>التشكيلة الأساسية</b> في مركز ${FC.POSITIONS[s.player.pos].name}. المباراة ${st.matchMinutes} دقائق من الوقت الحقيقي.</p>`
              : `<p>أنت على <b>دكة البدلاء</b>. ثقة المدرب ${Math.round(s.trust)} من 100. ستدخل في الدقيقة 60 إذا احتاجك الفريق، فأثبت نفسك.</p>`}
            ${s.energy < 40 ? `<p class="warn-text">طاقتك ${Math.round(s.energy)} فقط: ستتعب بسرعة أثناء الركض.</p>` : ''}
            <button class="btn primary big" data-a="go">${starter ? 'انزل إلى الملعب' : 'اجلس على الدكة'}</button>
          </section>
          <section class="panel">
            <h3>تذكير بالتحكم</h3>
            <ul class="help">
              <li><b>الحركة:</b> المس يسار الشاشة واسحب إصبعك. العصا تظهر حيث تلمس.</li>
              <li><b>بالكرة:</b> تمرير أرضي، بينية أمام زميلك، عرضية عالية، وتسديد (اضغط مطولاً لقوة أكبر، والقوة الزائدة تطير فوق العارضة). اتجاه العصا يختار الزميل أو زاوية التسديد.</li>
              <li><b>بدون كرة:</b> «اطلب» ليمرر لك زميلك، «اطلب بينية» لتنطلق خلف الدفاع، «افتك» لأخذ الكرة، واضغط مطولاً على «ضغط» ليركض لاعبك نحو الكرة.</li>
              <li><b>ركض:</b> اضغط مطولاً، واللياقة تنقص.</li>
            </ul>
          </section>
        </main>`, root => {
        on(root, '[data-a=back]', () => UI.hub());
        on(root, '[data-a=go]', () => UI.startMatch(starter));
      });
    },

    startMatch(starter) {
      const s = C.state;
      const fx = C.nextFixture();
      const ourStr = C.teamStrength(s.club), oppStr = C.teamStrength(fx.opp);
      const ours = C.squad(ourStr, C.clubColors(), C.clubName());
      const theirs = C.squad(oppStr, C.clubColors(fx.opp), C.clubName(fx.opp));
      // ألوان متشابهة؟ الخصم يلبس القميص الاحتياطي
      if (similar(ours.colors[0], theirs.colors[0])) theirs.colors = [theirs.colors[1], theirs.colors[0]];
      let startMinute = 0, startScore = [0, 0];
      if (!starter) {
        startMinute = 60;
        const [a, b] = C.simScore(ourStr, oppStr, fx.home ? 3 : -3);
        startScore = [Math.round(a * 0.66), Math.round(b * 0.66)];
      }
      document.body.classList.add('in-match');
      app().innerHTML = '';
      const p = s.player;
      match = FC.Match.start({
        root: app(),
        ours: { name: ours.name, colors: ours.colors, strength: ourStr, squad: ours },
        theirs: { name: theirs.name, colors: theirs.colors, strength: oppStr, squad: theirs },
        userIsHome: fx.home,
        user: { name: p.name.split(' ')[0], number: p.number, pos: p.pos, attrs: p.attrs },
        minutes: C.settings().matchMinutes,
        startMinute, startScore,
        energy: s.energy,
        tier: s.tier,
        zoom: C.settings().zoom || 1,
        onZoom: z => { s.settings.zoom = z; C.save(); },
        onEnd: res => {
          document.body.classList.remove('in-match');
          match = null;
          const out = C.finishMatch(res);
          UI.postMatch(res, out, fx);
        },
      });
    },

    // ---------- بعد المباراة ----------
    postMatch(res, out, fx) {
      const s = C.state, st = res.stats;
      const word = res.ours > res.theirs ? 'فوز' : res.ours < res.theirs ? 'خسارة' : 'تعادل';
      const rc = out.rating >= 8 ? 'great' : out.rating >= 6.5 ? 'good' : out.rating >= 5.5 ? 'ok' : 'bad';
      const growth = Object.entries(out.growth).map(([k, v]) => `<span class="pill good">+${v} ${FC.ATTRS[k].name}</span>`).join('');
      const trustD = Math.round(out.trustAfter - out.trustBefore);
      render(`
        <main class="screen post">
          <section class="final">
            <p class="eyebrow">نهاية المباراة · ${word}</p>
            <div class="final-score"><span>${esc(C.clubName())}</span><div class="fs-num"><b>${res.ours}</b><em>-</em><b>${res.theirs}</b></div><span>${esc(C.clubName(fx.opp))}</span></div>
          </section>
          <section class="rating-row">
            <div class="rating ${rc}"><b>${out.rating.toFixed(1)}</b><span>تقييمك</span></div>
            <div class="rating-notes">
              ${out.motm ? '<p class="motm">رجل المباراة</p>' : ''}
              <p>لعبت ${res.minutes} دقيقة.</p>
              <p>ثقة المدرب: ${Math.round(out.trustAfter)} <span class="${trustD >= 0 ? 'up' : 'down'}">(${trustD >= 0 ? '+' : ''}${trustD})</span></p>
              ${out.pay ? `<p>الأجر الأسبوعي: ${money(out.pay)}</p>` : '<p>لاعب هاوٍ: لا أجر بعد.</p>'}
            </div>
          </section>
          <section class="panel">
            <h3>إحصائياتك</h3>
            <div class="statgrid">
              <div><b>${st.goals}</b><span>أهداف</span></div><div><b>${st.assists}</b><span>تمريرات حاسمة</span></div>
              <div><b>${st.shotsOn}/${st.shots}</b><span>تسديدات على المرمى</span></div>
              <div><b>${st.passOk}/${st.passOk + st.passBad}</b><span>تمريرات ناجحة</span></div>
              <div><b>${st.tackles}</b><span>افتكاك</span></div><div><b>${st.intercepts}</b><span>قطع كرات</span></div>
              <div><b>${st.dribbles}</b><span>مراوغات ناجحة</span></div><div><b>${st.lost}</b><span>كرات ضائعة</span></div>
            </div>
            ${growth ? `<h3>تطورت من المباراة</h3><div class="facts">${growth}</div>` : ''}
          </section>
          <button class="btn primary big" data-a="next">${out.seasonOver ? 'نهاية الموسم' : 'متابعة'}</button>
        </main>`, root => on(root, '[data-a=next]', () => (s.week >= FC.SEASON_WEEKS ? UI.seasonEnd() : UI.hub())));
    },

    // ---------- نهاية الموسم ----------
    seasonEnd() {
      const s = C.state;
      const sum = C.seasonSummary();
      if (!s.pendingOffers) { s.pendingOffers = C.makeOffers(); C.save(); }
      const offers = s.pendingOffers;
      render(`
        <main class="screen">
          <section class="final">
            <p class="eyebrow">نهاية الموسم ${s.season} · ${C.tier().name}</p>
            <h2 class="season-place">${sum.place === 1 ? 'أبطال الدوري!' : `المركز ${sum.place} من 8`}</h2>
          </section>
          <div class="bigstats">
            <div><b>${sum.apps}</b><span>مباراة</span></div><div><b>${sum.goals}</b><span>هدف</span></div>
            <div><b>${sum.assists}</b><span>حاسمة</span></div><div><b>${sum.avg ? sum.avg.toFixed(2) : '-'}</b><span>متوسط التقييم</span></div>
          </div>
          <section class="panel">
            <h3>عروض الانتقال</h3>
            ${offers.length ? `<div class="offers">${offers.map((o, i) => `
              <div class="offer">
                <div>${kit(FC.TIERS[o.tier].clubs[o.club].slice(1))}<b>${esc(FC.TIERS[o.tier].clubs[o.club][0])}</b></div>
                <small>${FC.TIERS[o.tier].name} · ${o.role}</small>
                <p>الأجر: ${o.pay ? money(o.pay) + ' أسبوعياً' : 'بدون أجر'}</p>
                <button class="btn primary" data-o="${i}">وقّع العقد</button>
              </div>`).join('')}</div>` : `<p class="sub">لا عروض هذا الموسم. ارفع تقييمك العام ومتوسط تقييمك في المباريات (فوق 6.5) لتلفت أنظار الأندية الأكبر.</p>`}
            <button class="btn" data-a="stay">البقاء في ${esc(C.clubName())}</button>
          </section>
        </main>`, root => {
        const done = (offer) => { delete s.pendingOffers; C.endSeason(offer); UI.hub(); };
        on(root, '[data-o]', el => done(offers[+el.dataset.o]));
        on(root, '[data-a=stay]', () => done(null));
      });
    },

    retired() {
      const s = C.state, cs = s.career;
      render(`
        <main class="screen">
          <section class="final">
            <p class="eyebrow">الاعتزال</p>
            <h2 class="season-place">${esc(s.player.name)} يعتزل في سن ${s.player.age}</h2>
          </section>
          <div class="bigstats">
            <div><b>${cs.apps}</b><span>مباراة</span></div><div><b>${cs.goals}</b><span>هدف</span></div>
            <div><b>${cs.assists}</b><span>حاسمة</span></div><div><b>${s.trophies.length}</b><span>لقب</span></div>
          </div>
          <button class="btn primary big" data-a="new">مسيرة جديدة</button>
        </main>`, root => on(root, '[data-a=new]', () => UI.create()));
    },
  };

  function similar(a, b) {
    const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const [x, y] = [h(a), h(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
  }

  // خلفية شاشة البداية: خطوط ملعب ليلي تحت الأضواء
  function drawTitleBg(cv) {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = r.width * d; cv.height = r.height * d;
    const g = cv.getContext('2d');
    g.scale(d, d);
    const w = r.width, h = r.height;
    g.strokeStyle = 'rgba(232,240,230,.10)';
    g.lineWidth = 2;
    const cx = w * 0.5, cy = h * 0.62, s = Math.max(w, h) / 70;
    g.beginPath(); g.arc(cx, cy, 9.15 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.stroke();
    g.strokeRect(cx - 20 * s, h - 16.5 * s, 40 * s, 16.5 * s + 4);
    g.strokeRect(cx - 9 * s, h - 5.5 * s, 18 * s, 5.5 * s + 4);
    const glow = g.createRadialGradient(w * 0.85, -h * 0.05, 0, w * 0.85, -h * 0.05, h * 0.9);
    glow.addColorStop(0, 'rgba(255,214,140,.22)'); glow.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
  }

  FC.UI = UI;
})();
