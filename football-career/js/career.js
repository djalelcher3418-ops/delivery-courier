// منطق المسيرة: الحفظ، التدريب، الدوري، العروض، نهاية الموسم
(function () {
  const SAVE_KEY = 'hilm-almalaib-v1';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const Career = {
    state: null,

    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) this.state = JSON.parse(raw);
      } catch (e) { this.state = null; }
      return this.state;
    },

    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* التخزين غير متاح */ }
    },

    reset() {
      this.state = null;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* لا شيء */ }
    },

    settings() {
      if (!this.state) return { matchMinutes: 5 };
      return this.state.settings;
    },

    create({ name, nation, pos, style, foot, number }) {
      const base = { pace: 44, shooting: 40, passing: 40, dribbling: 42, defending: 34, physical: 42 };
      const w = FC.POSITIONS[pos].w;
      // المهارات المهمة للمركز تبدأ أعلى قليلاً
      for (const k in base) base[k] += Math.round(w[k] * 22);
      const bonus = FC.STYLES[style].bonus;
      for (const k in bonus) base[k] += bonus[k];
      for (const k in base) base[k] = clamp(base[k] + Math.round(rnd(-2, 2)), 25, 60);

      this.state = {
        v: 1,
        player: { name, nation, pos, style, foot, number, age: 16, attrs: base, potential: Math.round(rnd(84, 94)) },
        tier: 0,
        club: Math.floor(Math.random() * 8),
        season: 1,
        week: 0,
        energy: 100,
        trust: 60,
        money: 0,
        fame: 0,
        trainedThisWeek: 0,
        settings: { matchMinutes: 5 },
        seasonStats: this.emptyStats(),
        career: this.emptyStats(),
        history: [],
        news: [],
        trophies: [],
      };
      this.newSeasonLeague();
      this.addNews(`انضممت إلى ${this.clubName()} في ${this.tier().name}. الحلم يبدأ من هنا.`);
      this.save();
      return this.state;
    },

    emptyStats() { return { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 }; },

    tier(t) { return FC.TIERS[t == null ? this.state.tier : t]; },
    clubName(i) { return this.tier().clubs[i == null ? this.state.club : i][0]; },
    clubColors(i) { const c = this.tier().clubs[i == null ? this.state.club : i]; return [c[1], c[2]]; },

    overall(attrs, pos) {
      const a = attrs || this.state.player.attrs;
      const w = FC.POSITIONS[pos || this.state.player.pos].w;
      let s = 0;
      for (const k in w) s += a[k] * w[k];
      return Math.round(s);
    },

    // جدول الدوري: كل فريق يلعب الآخرين ذهاباً وإياباً (طريقة الدوران)
    newSeasonLeague() {
      const s = this.state;
      const n = 8;
      const ids = [...Array(n).keys()];
      const rounds = [];
      for (let r = 0; r < n - 1; r++) {
        const games = [];
        for (let i = 0; i < n / 2; i++) {
          const a = ids[i], b = ids[n - 1 - i];
          games.push(r % 2 ? [b, a] : [a, b]);
        }
        rounds.push(games);
        ids.splice(1, 0, ids.pop());
      }
      const second = rounds.map(g => g.map(([a, b]) => [b, a]));
      s.fixtures = rounds.concat(second);
      s.table = ids.map(() => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
      // قوة كل نادٍ تتغير قليلاً كل موسم
      const str = this.tier().str;
      s.clubStr = [...Array(n)].map((_, i) => Math.round(str + rnd(-5, 5) + (i === s.club ? 0 : 0)));
      s.week = 0;
      s.seasonStats = this.emptyStats();
    },

    nextFixture() {
      const s = this.state;
      if (s.week >= FC.SEASON_WEEKS) return null;
      const g = s.fixtures[s.week].find(([a, b]) => a === s.club || b === s.club);
      const home = g[0] === s.club;
      return { home, opp: home ? g[1] : g[0] };
    },

    isStarter() { return this.state.trust >= 50; },

    addNews(text) {
      const s = this.state;
      s.news.unshift({ text, season: s.season, week: s.week + 1 });
      s.news = s.news.slice(0, 12);
    },

    // التدريب: الزيادة أكبر كلما كانت المهارة بعيدة عن قدرات اللاعب القصوى
    train(attr) {
      const s = this.state;
      if (s.energy < 20 || s.trainedThisWeek >= 2) return null;
      const a = s.player.attrs;
      const room = Math.max(0, s.player.potential - a[attr]);
      const ageFactor = s.player.age <= 21 ? 1.2 : s.player.age <= 27 ? 1 : 0.6;
      const gain = Math.round(clamp(room / 18 * rnd(0.6, 1.3) * ageFactor, 0.2, 2.5) * 10) / 10;
      const before = this.overall();
      a[attr] = Math.min(99, Math.round((a[attr] + gain) * 10) / 10);
      s.energy -= 20;
      s.trainedThisWeek++;
      this.save();
      return { gain, ovrBefore: before, ovrAfter: this.overall() };
    },

    rest() {
      const s = this.state;
      s.energy = Math.min(100, s.energy + 30);
      s.trainedThisWeek = 2;
      this.save();
    },

    teamStrength(club) { return this.state.clubStr[club]; },

    // نتيجة مباراة لم يلعبها المستخدم
    simScore(strA, strB, homeAdv = 3) {
      const diff = (strA + homeAdv - strB) / 10;
      const la = clamp(1.35 + diff * 0.6, 0.2, 4), lb = clamp(1.15 - diff * 0.6, 0.2, 4);
      return [this.poisson(la), this.poisson(lb)];
    },

    poisson(l) {
      let k = 0, p = 1;
      const L = Math.exp(-l);
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    },

    recordResult(home, away, gh, ga) {
      const t = this.state.table;
      const H = t[home], A = t[away];
      H.p++; A.p++;
      H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
      if (gh > ga) { H.w++; A.l++; H.pts += 3; }
      else if (gh < ga) { A.w++; H.l++; A.pts += 3; }
      else { H.d++; A.d++; H.pts++; A.pts++; }
    },

    standings() {
      return this.state.table
        .map((r, i) => ({ ...r, club: i, gd: r.gf - r.ga }))
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    },

    // تقييم أداء اللاعب في المباراة من 3 إلى 10
    rateMatch(st, ourGoals, theirGoals, minutes) {
      const pos = this.state.player.pos;
      const defender = ['CB', 'LB', 'RB'].includes(pos);
      let r = 6.0;
      r += st.goals * 1.1 + st.assists * 0.8;
      r += st.passOk * 0.06 - st.passBad * 0.1;
      r += st.shotsOn * 0.15 - (st.shots - st.shotsOn) * 0.05;
      r += st.tackles * (defender ? 0.25 : 0.15) + st.intercepts * 0.12;
      r -= st.lost * 0.06;
      if (ourGoals > theirGoals) r += 0.4; else if (ourGoals < theirGoals) r -= 0.3;
      if (defender) r += theirGoals === 0 ? 0.6 : -0.2 * theirGoals;
      if (minutes < 45) r = 6 + (r - 6) * 0.8;
      return Math.round(clamp(r, 3, 10) * 10) / 10;
    },

    // بعد مباراة المستخدم: تحديث الدوري والإحصائيات والثقة والنمو
    finishMatch(result) {
      const s = this.state;
      const fx = this.nextFixture();
      const home = fx.home ? s.club : fx.opp, away = fx.home ? fx.opp : s.club;
      const gh = fx.home ? result.ours : result.theirs, ga = fx.home ? result.theirs : result.ours;
      this.recordResult(home, away, gh, ga);
      // بقية مباريات الجولة
      for (const [a, b] of s.fixtures[s.week]) {
        if (a === home && b === away) continue;
        const [x, y] = this.simScore(s.clubStr[a], s.clubStr[b]);
        this.recordResult(a, b, x, y);
      }

      const rating = result.played ? this.rateMatch(result.stats, result.ours, result.theirs, result.minutes) : 0;
      const out = { rating, trustBefore: s.trust, growth: {}, pay: 0, motm: false };
      if (result.played) {
        const ss = s.seasonStats, cs = s.career;
        for (const o of [ss, cs]) {
          o.apps++; o.goals += result.stats.goals; o.assists += result.stats.assists; o.ratingSum += rating;
        }
        out.motm = rating >= 8 && result.ours >= result.theirs;
        if (out.motm) { ss.motm++; cs.motm++; }
        s.trust = clamp(s.trust + (rating - 6.3) * 7, 0, 100);
        s.fame = clamp(s.fame + Math.max(0, rating - 6) * (s.tier + 1) * 1.5 + result.stats.goals * (s.tier + 1), 0, 10000);
        // المباراة نفسها تطوّر المهارات المستعملة فيها
        const a = s.player.attrs;
        const bump = (k, v) => {
          if (v <= 0) return;
          const room = Math.max(0, s.player.potential - a[k]);
          const g = Math.round(Math.min(v, room / 25) * 10) / 10;
          if (g > 0) { a[k] = Math.min(99, Math.round((a[k] + g) * 10) / 10); out.growth[k] = g; }
        };
        bump('shooting', result.stats.shotsOn * 0.15 + result.stats.goals * 0.2);
        bump('passing', result.stats.passOk * 0.03);
        bump('defending', (result.stats.tackles + result.stats.intercepts) * 0.12);
        bump('pace', result.stats.sprint * 0.004);
        bump('dribbling', result.stats.dribbles * 0.1);
        s.energy = clamp(s.energy - (result.minutes > 45 ? 35 : 20), 0, 100);
      } else {
        s.trust = clamp(s.trust + 2, 0, 100);
      }
      out.trustAfter = s.trust;

      out.pay = this.weeklyPay();
      s.money += out.pay;
      s.energy = clamp(s.energy + 25, 0, 100);
      s.trainedThisWeek = 0;

      if (result.played) {
        const word = result.ours > result.theirs ? 'فوز' : result.ours < result.theirs ? 'خسارة' : 'تعادل';
        let line = `${word} ${result.ours}-${result.theirs} أمام ${this.clubName(fx.opp)}. تقييمك ${rating.toFixed(1)}`;
        if (result.stats.goals) line += `، ${result.stats.goals === 1 ? 'سجلت هدفاً' : `سجلت ${result.stats.goals} أهداف`}`;
        this.addNews(line + '.');
        if (s.trust >= 50 && out.trustBefore < 50) this.addNews('المدرب: «ستكون أساسياً في المباراة القادمة».');
        if (s.trust < 50 && out.trustBefore >= 50) this.addNews('المدرب يفكر في وضعك على الدكة.');
      }

      s.week++;
      out.seasonOver = s.week >= FC.SEASON_WEEKS;
      this.save();
      return out;
    },

    weeklyPay() {
      const s = this.state;
      const t = this.tier();
      if (!t.pay) return 0;
      const rel = clamp(1 + (this.overall() - t.str) / 20, 0.6, 2);
      return Math.round(t.pay * rel / 10) * 10;
    },

    // نهاية الموسم: الملخص والعروض من أندية أعلى
    seasonSummary() {
      const s = this.state;
      const st = this.standings();
      const place = st.findIndex(r => r.club === s.club) + 1;
      const ss = s.seasonStats;
      const avg = ss.apps ? ss.ratingSum / ss.apps : 0;
      return { place, avg, ...ss };
    },

    makeOffers() {
      const s = this.state;
      const sum = this.seasonSummary();
      const ovr = this.overall();
      const offers = [];
      for (let t = s.tier; t <= Math.min(FC.TIERS.length - 1, s.tier + 2); t++) {
        const tier = FC.TIERS[t];
        const jump = t - s.tier;
        if (jump === 0) continue;
        // كلما كان التقييم وثقة المدرب أعلى، كثرت العروض
        const need = tier.str - 9 + jump * 3;
        const score = ovr + (sum.avg - 6.5) * 6 + sum.goals * 0.4 + sum.assists * 0.3;
        if (score < need) continue;
        const picks = [...Array(8).keys()].sort(() => Math.random() - 0.5).slice(0, jump === 1 ? 2 : 1);
        for (const c of picks) {
          const rel = clamp(1 + (ovr - tier.str) / 20, 0.6, 2);
          offers.push({ tier: t, club: c, pay: Math.round(tier.pay * rel / 10) * 10, role: ovr >= tier.str - 2 ? 'أساسي' : 'بديل يحتاج إثبات نفسه' });
        }
      }
      return offers;
    },

    endSeason(offer) {
      const s = this.state;
      const sum = this.seasonSummary();
      s.history.push({
        season: s.season, tier: s.tier, club: s.club, clubName: this.clubName(), place: sum.place,
        apps: sum.apps, goals: sum.goals, assists: sum.assists, avg: Math.round(sum.avg * 10) / 10, ovr: this.overall(),
      });
      if (sum.place === 1) s.trophies.push(`${this.tier().name} — الموسم ${s.season}`);

      if (offer) {
        const oldName = this.clubName();
        s.tier = offer.tier; s.club = offer.club;
        const t = this.tier();
        s.trust = clamp(50 + (this.overall() - t.str) * 2.5, 30, 75);
        this.addNews(`انتقلت من ${oldName} إلى ${this.clubName()} في ${t.name}.`);
      } else {
        s.trust = clamp(s.trust + 5, 0, 100);
      }

      // العمر والتطور الطبيعي
      const p = s.player;
      p.age++;
      if (p.age >= 31) {
        const drop = (p.age - 30) * 0.8;
        p.attrs.pace = Math.max(30, Math.round((p.attrs.pace - drop * 1.5) * 10) / 10);
        p.attrs.physical = Math.max(30, Math.round((p.attrs.physical - drop) * 10) / 10);
      }
      s.season++;
      s.energy = 100;
      s.trainedThisWeek = 0;
      this.newSeasonLeague();
      if (sum.place === 1) this.addNews('توّجت باللقب الموسم الماضي!');
      this.addNews(`بداية الموسم ${s.season}. عمرك الآن ${p.age} سنة.`);
      s.retired = p.age >= FC.RETIRE_AGE;
      this.save();
    },

    // يولد لاعبي فريق للمباراة حول قوة النادي
    squad(strength, colors, name) {
      const slots = ['GK', 'DL', 'DCL', 'DCR', 'DR', 'CML', 'CM', 'CMR', 'FL', 'FC', 'FR'];
      return {
        name, colors, strength,
        players: slots.map((slot, i) => {
          const v = () => clamp(Math.round(strength + rnd(-7, 7)), 20, 95);
          return {
            slot, number: i + 1,
            name: FC.FIRST_NAMES[Math.floor(Math.random() * FC.FIRST_NAMES.length)],
            attrs: { pace: v(), shooting: v(), passing: v(), dribbling: v(), defending: v(), physical: v(), keeping: v() },
          };
        }),
      };
    },
  };

  FC.Career = Career;
})();
