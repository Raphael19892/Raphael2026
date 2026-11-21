/* ============================================================
   app.js — מסכים, ניווט, הישגים ותעודה
   ============================================================ */
window.HK = window.HK || {};
(function (HK) {
  'use strict';
  var ui = HK.ui, A = HK.audio, store = HK.store, icons = HK.art.icons;
  var $app, cleanup = null, depth = 0;

  /* ---------- רשימת המשחקים ---------- */
  HK.GAME_LIST = [
    { id: 'candles', title: 'הדלקת נרות', desc: 'מדליקים את החנוכייה בסדר הנכון', icon: function () { return icons.candle(); }, levels: 8, medalAt: 8, medal: 'מדליק הנרות', names: function (n) { return 'לילה ' + n; }, color: 'c-gold' },
    { id: 'dreidel', title: 'סביבון', desc: 'סובבו ואספו מטבעות', icon: function () { return icons.dreidel('#2a5bd7', 'ג'); }, levels: 1, medalAt: 1, medal: 'אלוף הסביבון', names: function () { return 'משחק סביבון'; }, color: 'c-blue' },
    { id: 'quiz', title: 'חידון חנוכה', desc: 'שאלות, ניקוד ומשוב מיידי', icon: function () { return icons.torah(); }, levels: 2, medalAt: 1, medal: 'חכם החנוכה', names: function (n) { return ['מתחילים', 'אלופים'][n - 1]; }, color: 'c-purple' },
    { id: 'memory', title: 'משחק זיכרון', desc: 'מוצאים זוגות של סמלי החג', icon: function () { return icons.sufganiya(); }, levels: 3, medalAt: 1, medal: 'זיכרון של מכבי', names: function (n) { return [4, 6, 8][n - 1] + ' זוגות'; }, color: 'c-pink' },
    { id: 'diff', title: 'מצא את ההבדלים', desc: 'עין חדה כמו של מכבי', icon: function () { return icons.davidstar(); }, levels: 3, medalAt: 1, medal: 'עין חדה', names: function (n) { return [3, 4, 5][n - 1] + ' הבדלים'; }, color: 'c-teal' },
    { id: 'runner', title: 'איסוף מטבעות', desc: 'הרפתקה בדרך לירושלים', icon: function () { return icons.coin(); }, levels: 3, medalAt: 1, medal: 'רץ אל המקדש', names: function (n) { return 'שלב ' + n; }, color: 'c-orange' },
    { id: 'puzzle', title: 'פאזל חנוכה', desc: 'מרכיבים תמונות של החג', icon: function () { return icons.jar(); }, levels: 3, medalAt: 1, medal: 'מרכיב התמונות', names: function (n) { return ['3×3', '4×3', '4×4'][n - 1]; }, color: 'c-green' }
  ];
  function gameById(id) { return HK.GAME_LIST.filter(function (g) { return g.id === id; })[0]; }
  function levelUnlocked(g, n) { return n === 1 || store.best(g.id + ':' + (n - 1)) > 0; }
  function gameStars(g) { var t = 0; for (var n = 1; n <= g.levels; n++) t += store.best(g.id + ':' + n); return t; }

  /* ---------- התקדמות כללית ---------- */
  function progress() {
    var total = HK.GAME_LIST.length + HK.STORIES.length + HK.LEARN.length, done = 0, left = [];
    HK.GAME_LIST.forEach(function (g) { if (store.hasMedal(g.id)) done++; else left.push('🎮 ' + g.title); });
    HK.STORIES.forEach(function (s) { if (store.isDone('story:' + s.id)) done++; else left.push('📖 ' + s.title); });
    HK.LEARN.forEach(function (l) { if (store.isDone('learn:' + l.id)) done++; else left.push('📜 ' + l.title); });
    return { done: done, total: total, pct: Math.round(done / total * 100), left: left, complete: done === total };
  }
  function medalCount() { return HK.GAME_LIST.filter(function (g) { return store.hasMedal(g.id); }).length; }

  /* ---------- ניווט ---------- */
  function go(hash) { depth++; location.hash = hash; }
  function back(fallback) {
    if (depth > 0) { depth--; history.back(); }
    else location.replace(fallback || '#/home');
  }
  HK.go = go;

  function topbar(title, parent) {
    var t = ui.h('<div class="topbar"><button class="icon-btn back" aria-label="חזרה">➜</button><h1>' + title + '</h1><div class="hud-pill" id="hudStars">⭐ ' + store.totalStars() + '</div></div>');
    t.querySelector('.back').onclick = function () { A.play('tap'); back(parent); };
    return t;
  }
  ui.refreshHud = function () {
    var el = document.getElementById('hudStars');
    if (el) { el.textContent = '⭐ ' + store.totalStars(); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  };

  function screen(cls) { var s = ui.h('<div class="screen ' + cls + '"></div>'); return s; }
  function mount(s) {
    $app.innerHTML = ''; $app.appendChild(s);
    $app.scrollTop = 0; window.scrollTo(0, 0);
  }

  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    HK.voice.stop();
    document.querySelectorAll('.modal-back').forEach(function (m) { m.remove(); });
    var parts = (location.hash || '#/home').slice(2).split('/');
    var r = parts[0] || 'home';
    var fn = ROUTES[r] || ROUTES.home;
    fn(parts[1], parts[2]);
  }

  /* ======================= מסך הבית ======================= */
  var ROUTES = {};
  ROUTES.home = function () {
    var p = progress(), d = store.data;
    var s = screen('home');
    s.innerHTML =
      '<div class="home-top">' +
      '<button class="icon-btn" id="setBtn" aria-label="הגדרות">⚙️</button>' +
      '<button class="icon-btn" id="musBtn" aria-label="מוזיקה">' + (d.settings.music ? '🎵' : '🔇') + '</button>' +
      '<div class="spacer"></div>' +
      '<div class="hud-pill" id="hudStars">⭐ ' + store.totalStars() + '</div><div class="hud-pill">🏅 ' + medalCount() + '/7</div>' +
      '</div>' +
      '<div class="home-hero"><div class="hero-glow"></div>' + HK.art.chanukiah() + '</div>' +
      '<h1 class="home-title"><span>ברוכים הבאים</span><span class="gold">לעולם החנוכה!</span></h1>' +
      (d.name ? '<div class="hello">שלום, ' + escapeHtml(d.name) + '! 👋</div>' : '') +
      '<div class="journey"><div class="pbar"><i style="width:' + p.pct + '%"></i></div><div class="journey-txt">🕯️ המסע שלך: <b>' + p.done + '</b> מתוך ' + p.total + ' פעילויות (' + p.pct + '%)</div></div>' +
      '<button class="btn btn-gold btn-huge" id="startBtn"><span class="play-ico">▶</span> ' + (p.done ? 'ממשיכים במסע!' : 'התחילו לשחק!') + '</button>' +
      '<div class="home-grid">' +
      '<button class="tile c-blue" data-go="#/games"><div class="tile-ico">' + icons.dreidel('#f6c445', 'נ') + '</div><b>משחקים</b><small>7 משחקים</small></button>' +
      '<button class="tile c-purple" data-go="#/stories"><div class="tile-ico">' + icons.torah() + '</div><b>סיפורי חנוכה</b><small>5 סיפורים</small></button>' +
      '<button class="tile c-teal" data-go="#/learn"><div class="tile-ico">' + icons.candle() + '</div><b>הלכות ומנהגים</b><small>לומדים על החג</small></button>' +
      '<button class="tile c-gold" data-go="#/awards"><div class="tile-ico">' + icons.star() + '</div><b>ההישגים שלי</b><small>' + store.totalStars() + ' כוכבים</small></button>' +
      '</div>' +
      (installEvt ? '<button class="btn btn-ghost install-btn" id="instBtn">📲 התקינו את האפליקציה בטלפון</button>' : '') +
      '<div class="foot">חג חנוכה שמח! 🕎</div>';
    mount(s);
    s.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { A.play('tap'); go(b.dataset.go); }; });
    s.querySelector('#setBtn').onclick = function () { A.play('tap'); go('#/settings'); };
    s.querySelector('#musBtn').onclick = function () {
      d.settings.music = !d.settings.music; store.save();
      if (d.settings.music) HK.music.start(); else HK.music.stop();
      this.textContent = d.settings.music ? '🎵' : '🔇'; A.play('tap');
    };
    s.querySelector('#startBtn').onclick = function () { A.play('pop'); HK.fx.burstAt(this, 20); nextActivity(); };
    var ib = s.querySelector('#instBtn'); if (ib) ib.onclick = doInstall;
    // נגיעה בחנוכייה – ניצוצות
    s.querySelector('.home-hero').onclick = function (e) { HK.fx.burst(e.clientX, e.clientY, 16); A.play('star'); };
    if (!d.welcomed) setTimeout(welcome, 400);
  };

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function welcome() {
    var m = ui.modal({
      icon: '🕎', title: 'שלום! איך קוראים לך?',
      html: '<p>נכתוב את השם שלך על תעודת אלוף החנוכה!</p><input class="name-in" id="nameIn" maxlength="20" placeholder="השם שלי..." autocomplete="off">',
      buttons: [
        { label: 'יאללה, מתחילים! ✨', action: function () { saveName(); } },
        { label: 'אחר כך', cls: 'btn-ghost', action: function () { store.data.welcomed = true; store.save(); } }
      ]
    });
    var inp = m.querySelector('#nameIn');
    function saveName() { store.data.name = inp.value.trim(); store.data.welcomed = true; store.save(); route(); HK.voice.speak('ברוכים הבאים לעולם החנוכה' + (store.data.name ? ', ' + store.data.name : '')); }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { m.close(); saveName(); } });
  }

  var ORDER = [
    ['game', 'candles'], ['story', 'hashmonaim'], ['game', 'memory'], ['learn', 'why'], ['game', 'dreidel'],
    ['story', 'matityahu'], ['game', 'quiz'], ['learn', 'eight'], ['game', 'diff'], ['story', 'yehuda'],
    ['game', 'puzzle'], ['learn', 'brachot'], ['game', 'runner'], ['story', 'pach'], ['learn', 'food'],
    ['story', 'or'], ['learn', 'dreidel'], ['learn', 'mitzvah']
  ];
  function nextActivity() {
    for (var i = 0; i < ORDER.length; i++) {
      var o = ORDER[i];
      if (o[0] === 'game') {
        var g = gameById(o[1]);
        if (!store.hasMedal(g.id)) {
          for (var n = 1; n <= g.levels; n++) if (!store.best(g.id + ':' + n)) return go('#/play/' + g.id + '/' + n);
          return go('#/game/' + g.id);
        }
      } else if (o[0] === 'story' && !store.isDone('story:' + o[1])) return go('#/story/' + o[1]);
      else if (o[0] === 'learn' && !store.isDone('learn:' + o[1])) return go('#/learn/' + o[1]);
    }
    go('#/cert');
  }

  /* ======================= אזור המשחקים ======================= */
  ROUTES.games = function () {
    var s = screen('list');
    s.appendChild(topbar('🎮 משחקים', '#/home'));
    var grid = ui.h('<div class="game-grid"></div>');
    HK.GAME_LIST.forEach(function (g, i) {
      var st = gameStars(g), max = g.levels * 3, has = store.hasMedal(g.id);
      var card = ui.h('<button class="gcard ' + g.color + '" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="gcard-ico">' + g.icon() + '</div>' +
        '<div class="gcard-body"><b>' + g.title + '</b><small>' + g.desc + '</small>' +
        '<div class="mini-bar"><i style="width:' + Math.round(st / max * 100) + '%"></i></div>' +
        '<span class="gcard-stars">⭐ ' + st + '/' + max + '</span></div>' +
        (has ? '<div class="gmedal">🏅</div>' : '') + '</button>');
      card.onclick = function () { A.play('tap'); go(g.levels === 1 ? '#/play/' + g.id + '/1' : '#/game/' + g.id); };
      grid.appendChild(card);
    });
    s.appendChild(grid);
    mount(s);
  };

  ROUTES.game = function (id) {
    var g = gameById(id); if (!g) return ROUTES.games();
    var s = screen('levels');
    s.appendChild(topbar(g.title, '#/games'));
    var head = ui.h('<div class="lv-head"><div class="lv-ico">' + g.icon() + '</div><p>' + g.desc + '</p>' + (store.hasMedal(g.id) ? '<div class="lv-medal">🏅 ' + g.medal + '</div>' : '<div class="lv-medal dim">🏅 ' + (g.medalAt > 1 ? 'סיימו את כל ' + g.levels + ' השלבים לקבלת מדליה' : 'סיימו שלב כדי לקבל מדליה') + '</div>') + '</div>');
    s.appendChild(head);
    var grid = ui.h('<div class="lv-grid ' + (g.levels === 8 ? 'eight' : '') + '"></div>');
    for (var n = 1; n <= g.levels; n++) (function (n) {
      var un = levelUnlocked(g, n), b = store.best(g.id + ':' + n);
      var stars = '<div class="lv-stars">' + [0, 1, 2].map(function (k) { return '<i class="' + (k < b ? 'on' : '') + '">★</i>'; }).join('') + '</div>';
      var cell = ui.h('<button class="lv ' + (un ? '' : 'locked') + (b ? ' done' : '') + '" style="animation-delay:' + (n * 0.04) + 's">' +
        (g.id === 'candles' ? '<div class="lv-candles">' + '<i></i>'.repeat(n) + '</div>' : '') +
        '<span class="lv-num">' + (un ? n : '🔒') + '</span><small>' + g.names(n) + '</small>' + stars + '</button>');
      cell.onclick = function () {
        if (!un) { A.play('bad'); ui.toast('🔒 סיימו את השלב הקודם כדי לפתוח'); cell.classList.remove('shake'); void cell.offsetWidth; cell.classList.add('shake'); return; }
        A.play('tap'); go('#/play/' + g.id + '/' + n);
      };
      grid.appendChild(cell);
    })(n);
    s.appendChild(grid);
    mount(s);
  };

  ROUTES.play = function (id, lvl) {
    var g = gameById(id), level = Math.max(1, Math.min(+lvl || 1, g ? g.levels : 1));
    if (!g || !levelUnlocked(g, level)) return location.replace('#/game/' + id);
    var s = screen('play');
    s.appendChild(topbar(g.title + (g.levels > 1 ? ' · ' + g.names(level) : ''), g.levels === 1 ? '#/games' : '#/game/' + g.id));
    var area = ui.h('<div class="play-area"></div>');
    s.appendChild(area);
    mount(s);
    var api = {
      finish: function (stars, o) {
        o = o || {};
        var key = g.id + ':' + level;
        var wasNextLocked = level < g.levels && !levelUnlocked(g, level + 1);
        var gained = store.record(key, stars);
        var medal = null, unlocked = null;
        if (stars > 0) {
          if (level >= g.medalAt && store.medal(g.id)) medal = g.medal;
          if (wasNextLocked && levelUnlocked(g, level + 1)) unlocked = 'נפתח שלב חדש: ' + g.names(level + 1) + '!';
        }
        var btns = [];
        if (stars > 0 && level < g.levels) btns.push({ label: 'לשלב הבא ⬅', action: function () { location.replace('#/play/' + g.id + '/' + (level + 1)); } });
        btns.push({ label: stars > 0 ? 'שוב 🔄' : 'נסו שוב 🔄', cls: stars > 0 && level < g.levels ? 'btn-blue' : 'btn-gold', action: function () { route(); } });
        btns.push({ label: 'לתפריט', cls: 'btn-ghost', action: function () { back(g.levels === 1 ? '#/games' : '#/game/' + g.id); } });
        if (stars === 0) {
          A.play('bad');
          ui.modal({ icon: '💪', title: 'כמעט!', html: '<p class="rtext">' + (o.text || 'נסו שוב, אתם יכולים!') + '</p>', buttons: btns });
          return;
        }
        ui.reward({ title: ['', 'יפה מאוד!', 'מצוין!', 'מושלם!'][stars], stars: stars, text: o.text, gained: gained, medal: medal, unlocked: unlocked, say: o.say, buttons: btns });
      }
    };
    cleanup = HK.games[g.id].start(area, level, api);
  };

  /* ======================= סיפורים ======================= */
  ROUTES.stories = function () {
    var s = screen('list');
    s.appendChild(topbar('📖 סיפורי חנוכה', '#/home'));
    var grid = ui.h('<div class="story-grid"></div>');
    HK.STORIES.forEach(function (st, i) {
      var done = store.isDone('story:' + st.id);
      var c = ui.h('<button class="scard" style="animation-delay:' + (i * 0.06) + 's"><div class="scard-art">' + st.cover() + '</div><div class="scard-body"><b>' + st.emoji + ' ' + st.title + '</b><small>' + st.chapters.length + ' פרקים' + (done ? ' · ✔ נקרא' : '') + '</small></div>' + (done ? '<div class="gmedal">⭐</div>' : '') + '</button>');
      c.onclick = function () { A.play('tap'); go('#/story/' + st.id); };
      grid.appendChild(c);
    });
    s.appendChild(grid);
    mount(s);
  };

  ROUTES.story = function (id) {
    var st = HK.STORIES.filter(function (x) { return x.id === id; })[0];
    if (!st) return ROUTES.stories();
    var s = screen('story');
    s.appendChild(topbar(st.title, '#/stories'));
    var body = ui.h('<div class="story-body">' +
      '<div class="st-art" id="art"></div>' +
      '<div class="st-card"><div class="st-chap" id="chap"></div><p id="txt"></p></div>' +
      '<div class="st-dots" id="dots"></div>' +
      '<div class="st-nav"><button class="btn btn-blue" id="prev">➡ הקודם</button><button class="btn btn-round" id="say" aria-label="הקראה">🔊</button><button class="btn btn-gold" id="next">הבא ⬅</button></div>' +
      '</div>');
    s.appendChild(body); mount(s);
    var i = 0, artEl = body.querySelector('#art'), txt = body.querySelector('#txt');
    var dots = body.querySelector('#dots');
    st.chapters.forEach(function (c, k) { var d = ui.h('<button class="dot" aria-label="פרק ' + (k + 1) + '"></button>'); d.onclick = function () { i = k; show(); }; dots.appendChild(d); });
    function show() {
      var ch = st.chapters[i];
      artEl.innerHTML = ch.art(); artEl.classList.remove('kb'); void artEl.offsetWidth; artEl.classList.add('kb');
      body.querySelector('#chap').textContent = 'פרק ' + (i + 1) + ' מתוך ' + st.chapters.length;
      txt.textContent = ch.text; txt.parentNode.classList.remove('enter'); void txt.offsetWidth; txt.parentNode.classList.add('enter');
      dots.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); d.classList.toggle('seen', k < i); });
      body.querySelector('#prev').style.visibility = i ? 'visible' : 'hidden';
      body.querySelector('#next').innerHTML = i < st.chapters.length - 1 ? 'הבא ⬅' : 'סיום 🎉';
      A.play('flip');
      HK.voice.speak(ch.text);
    }
    artEl.addEventListener('click', function (e) { HK.fx.burst(e.clientX, e.clientY, 14); A.play('star'); });
    body.querySelector('#prev').onclick = function () { if (i > 0) { i--; show(); } };
    body.querySelector('#say').onclick = function () { A.play('tap'); HK.voice.speak(st.chapters[i].text); };
    body.querySelector('#next').onclick = function () {
      if (i < st.chapters.length - 1) { i++; show(); return; }
      HK.voice.stop(); finishStory();
    };
    function finishStory() {
      var gained = store.record('story:' + st.id, 1); store.markDone('story:' + st.id);
      var q = st.quiz;
      var html = '<p class="rtext">שאלה קטנה לבונוס ⭐</p><h3 class="sq">' + q.q + '</h3><div class="sq-ans">' + q.a.map(function (a, k) { return '<button class="q-ans" data-k="' + k + '">' + a + '</button>'; }).join('') + '</div>';
      var m = ui.modal({ icon: '📖', title: 'סיימת את הסיפור!', html: html, buttons: [{ label: 'דלגו', cls: 'btn-ghost', action: function () { done(0); } }] });
      HK.voice.speak('סיימת את הסיפור! ' + q.q);
      m.querySelectorAll('.sq-ans .q-ans').forEach(function (b) {
        b.onclick = function () {
          var ok = +b.dataset.k === q.c;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) m.querySelectorAll('.sq-ans .q-ans')[q.c].classList.add('right');
          A.play(ok ? 'good' : 'bad');
          m.querySelectorAll('.sq-ans .q-ans').forEach(function (x) { x.disabled = true; });
          setTimeout(function () { m.close(); done(ok ? 1 : 0); }, 1200);
        };
      });
      function done(bonus) {
        var g2 = bonus ? store.record('storyq:' + st.id, 1) : 0;
        ui.reward({
          title: 'סיפור נפלא!', stars: 1 + bonus + (bonus ? 1 : 0), text: 'קראת את "' + st.title + '"' + (bonus ? ' וענית נכון!' : ''), gained: gained + g2,
          buttons: [{ label: 'לסיפור הבא ⬅', action: function () { var k = HK.STORIES.indexOf(st); location.replace(k < HK.STORIES.length - 1 ? '#/story/' + HK.STORIES[k + 1].id : '#/stories'); } }, { label: 'לכל הסיפורים', cls: 'btn-ghost', action: function () { back('#/stories'); } }]
        });
      }
    }
    show();
    cleanup = function () { HK.voice.stop(); };
  };

  /* ======================= לימוד והעשרה ======================= */
  function tagHtml(t) { var T = HK.TAGS[t]; return '<span class="tag ' + T.cls + '">' + T.label + '</span>'; }
  ROUTES.learn = function (id) {
    if (id) return learnTopic(id);
    var s = screen('list');
    s.appendChild(topbar('📜 הלכות ומנהגים', '#/home'));
    s.appendChild(ui.h('<div class="legend"><b>איך לומדים כאן?</b> כל קטע מסומן:<div class="legend-tags">' +
      tagHtml('halacha') + '<small>מה שקבעה ההלכה</small>' + tagHtml('minhag') + '<small>מה שנהגו ישראל</small>' +
      tagHtml('sipur') + '<small>מה שקרה</small>' + tagHtml('makor') + '<small>איפה זה כתוב</small>' + tagHtml('raayon') + '<small>הסבר ומחשבה</small></div></div>'));
    var grid = ui.h('<div class="learn-grid"></div>');
    HK.LEARN.forEach(function (l, i) {
      var done = store.isDone('learn:' + l.id);
      var ic = l.icon === 'dreidel' ? icons.dreidel('#2a5bd7', 'פ') : icons[l.icon]();
      var c = ui.h('<button class="lcard' + (done ? ' done' : '') + '" style="animation-delay:' + (i * 0.05) + 's"><div class="lcard-ico">' + ic + '</div><b>' + l.title + '</b>' + (done ? '<span class="lcheck">✔</span>' : '') + '</button>');
      c.onclick = function () { A.play('tap'); go('#/learn/' + l.id); };
      grid.appendChild(c);
    });
    s.appendChild(grid);
    s.appendChild(ui.h('<h2 class="sec-title">❓ שאלות ותשובות לילדים</h2>'));
    var faq = ui.h('<div class="faq"></div>');
    HK.FAQ.forEach(function (f) {
      var c = ui.h('<button class="faq-card"><div class="faq-inner"><div class="faq-q">' + f.q + '<small>געו לגלות 👆</small></div><div class="faq-a">' + f.a + '</div></div></button>');
      c.onclick = function () { c.classList.toggle('flipped'); A.play('flip'); if (c.classList.contains('flipped')) HK.voice.speak(f.a); };
      faq.appendChild(c);
    });
    s.appendChild(faq);
    mount(s);
  };

  function learnTopic(id) {
    var l = HK.LEARN.filter(function (x) { return x.id === id; })[0];
    if (!l) return location.replace('#/learn');
    var s = screen('learn-topic');
    s.appendChild(topbar(l.title, '#/learn'));
    var list = ui.h('<div class="lt-list"></div>');
    l.items.forEach(function (it, k) {
      var c = ui.h('<div class="lt-item ' + HK.TAGS[it.tag].cls + '-b" style="animation-delay:' + (k * 0.08) + 's">' + tagHtml(it.tag) + '<p class="' + (it.big ? 'bracha' : '') + '">' + it.text + '</p><button class="mini-say" aria-label="הקראה">🔊</button></div>');
      c.querySelector('.mini-say').onclick = function () { A.play('tap'); HK.voice.speak(it.text); };
      list.appendChild(c);
    });
    s.appendChild(list);
    var btn = ui.h('<button class="btn btn-gold btn-big done-btn">סיימתי ללמוד! ✔</button>');
    btn.onclick = function () {
      var gained = store.record('learn:' + l.id, 1); store.markDone('learn:' + l.id);
      var k = HK.LEARN.indexOf(l), nxt = HK.LEARN[k + 1];
      ui.reward({
        title: 'למדת משהו חדש!', stars: 1, text: '"' + l.title + '" – כל הכבוד!', gained: gained,
        buttons: [nxt ? { label: 'לנושא הבא ⬅', action: function () { location.replace('#/learn/' + nxt.id); } } : { label: 'לכל הנושאים', action: function () { back('#/learn'); } }, { label: 'חזרה', cls: 'btn-ghost', action: function () { back('#/learn'); } }]
      });
    };
    s.appendChild(btn);
    mount(s);
    cleanup = function () { HK.voice.stop(); };
  }

  /* ======================= הישגים ======================= */
  ROUTES.awards = function () {
    var p = progress(), s = screen('awards');
    s.appendChild(topbar('🏆 ההישגים שלי', '#/home'));
    var letters = ['נ', 'ג', 'ה', 'פ'].map(function (l) { return '<span class="' + (store.data.lettersSeen[l] ? 'on' : '') + '">' + l + '</span>'; }).join('');
    var html = '<div class="aw-hero"><div class="aw-star">' + icons.star() + '<b>' + store.totalStars() + '</b></div><div><div class="aw-big">' + store.totalStars() + ' כוכבים</div><div class="aw-sub">' + medalCount() + ' מדליות · ' + p.pct + '% מהמסע</div></div></div>';
    html += '<h2 class="sec-title">🏅 מדליות</h2><div class="medals">' + HK.GAME_LIST.map(function (g) {
      var has = store.hasMedal(g.id);
      return '<div class="medal ' + (has ? 'on' : '') + '"><div class="medal-disc"><div class="medal-ico">' + g.icon() + '</div></div><b>' + g.medal + '</b><small>' + g.title + '</small></div>';
    }).join('') + '</div>';
    html += '<h2 class="sec-title">🌀 אותיות הסביבון שגילית</h2><div class="letters">' + letters + '</div>';
    html += '<h2 class="sec-title">✅ המסע שלי</h2><div class="checklist">' +
      HK.STORIES.map(function (x) { return '<div class="' + (store.isDone('story:' + x.id) ? 'on' : '') + '">📖 ' + x.title + '</div>'; }).join('') +
      HK.LEARN.map(function (x) { return '<div class="' + (store.isDone('learn:' + x.id) ? 'on' : '') + '">📜 ' + x.title + '</div>'; }).join('') + '</div>';
    html += '<button class="btn ' + (p.complete ? 'btn-gold' : 'btn-blue') + ' btn-big cert-btn">' + (p.complete ? '🎓 לתעודת אלוף החנוכה!' : '🔒 תעודת אלוף החנוכה (' + p.done + '/' + p.total + ')') + '</button>';
    s.appendChild(ui.h('<div class="aw-body">' + html + '</div>'));
    mount(s);
    s.querySelector('.cert-btn').onclick = function () { A.play('tap'); go('#/cert'); };
  };

  /* ======================= תעודה ======================= */
  function hebDate() {
    try { return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); }
    catch (e) { return new Date().toLocaleDateString('he-IL'); }
  }
  ROUTES.cert = function () {
    var p = progress(), name = store.data.name || 'אלוף/ת החנוכה', s = screen('cert-screen');
    s.appendChild(topbar('🎓 התעודה שלי', '#/awards'));
    var cert = '<div class="cert ' + (p.complete ? '' : 'locked') + '" id="cert">' +
      '<div class="cert-in">' +
      '<div class="cert-menorah">' + HK.art.chanukiah() + '</div>' +
      '<div class="cert-title">תעודת אלוף החנוכה</div>' +
      '<div class="cert-sub">מוענקת בכבוד רב ל</div>' +
      '<div class="cert-name">' + escapeHtml(name) + '</div>' +
      '<div class="cert-text">על השלמת כל המשחקים, הסיפורים והלימוד בעולם החנוכה,<br>ועל הפצת האור והשמחה! ✨</div>' +
      '<div class="cert-stats"><span>⭐ ' + store.totalStars() + ' כוכבים</span><span>🏅 ' + medalCount() + ' מדליות</span></div>' +
      '<div class="cert-date">' + hebDate() + '</div>' +
      '</div>' +
      (p.complete ? '' : '<div class="cert-lock"><div>🔒</div><b>עוד ' + (p.total - p.done) + ' פעילויות לתעודה!</b><small>' + p.left.slice(0, 6).join(' · ') + (p.left.length > 6 ? ' ...' : '') + '</small></div>') +
      '</div>';
    s.appendChild(ui.h('<div class="cert-body">' + cert + '</div>'));
    if (p.complete) {
      var row = ui.h('<div class="cert-actions"><button class="btn btn-gold" id="saveImg">💾 שמירה כתמונה</button><button class="btn btn-blue" id="printBtn">🖨 הדפסה</button></div>');
      s.appendChild(row);
    } else {
      var nb = ui.h('<button class="btn btn-gold btn-big" style="margin:16px auto;display:block">▶ להמשך המסע</button>');
      nb.onclick = function () { nextActivity(); };
      s.appendChild(nb);
    }
    mount(s);
    if (p.complete) {
      HK.fx.confetti(); A.play('win');
      HK.voice.speak('מזל טוב ' + (store.data.name || '') + '! את תעודת אלוף החנוכה זכית לקבל!');
      s.querySelector('#saveImg').onclick = saveCert;
      s.querySelector('#printBtn').onclick = function () { window.print(); };
    }
  };

  function saveCert() {
    var cv = document.createElement('canvas'), W = 1200, H = 850; cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1640'); g.addColorStop(1, '#1d3b8f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#f6c445'; c.lineWidth = 14; c.strokeRect(30, 30, W - 60, H - 60);
    c.lineWidth = 3; c.strokeRect(54, 54, W - 108, H - 108);
    var img = new Image();
    img.onload = function () {
      c.drawImage(img, W / 2 - 170, 70, 340, 300);
      c.direction = 'rtl'; c.textAlign = 'center'; c.fillStyle = '#ffe58a';
      c.font = 'bold 72px Fredoka, Rubik, Arial'; c.fillText('תעודת אלוף החנוכה', W / 2, 440);
      c.fillStyle = '#fff'; c.font = '36px Rubik, Arial'; c.fillText('מוענקת בכבוד רב ל', W / 2, 505);
      c.fillStyle = '#f6c445'; c.font = 'bold 80px Fredoka, Rubik, Arial'; c.fillText(store.data.name || 'אלוף/ת החנוכה', W / 2, 600);
      c.fillStyle = '#cfe6ff'; c.font = '30px Rubik, Arial'; c.fillText('על השלמת כל המשחקים, הסיפורים והלימוד בעולם החנוכה!', W / 2, 665);
      c.fillStyle = '#fff'; c.font = '32px Rubik, Arial'; c.fillText('⭐ ' + store.totalStars() + ' כוכבים   ·   🏅 ' + medalCount() + ' מדליות', W / 2, 725);
      c.fillStyle = '#9fb8ff'; c.font = '28px Rubik, Arial'; c.fillText(hebDate(), W / 2, 780);
      var url = cv.toDataURL('image/png');
      try { var a = document.createElement('a'); a.download = 'תעודת-אלוף-החנוכה.png'; a.href = url; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { }
      ui.modal({ icon: '🎓', title: 'התעודה שלך', html: '<img src="' + url + '" alt="תעודת אלוף החנוכה" style="width:100%;border-radius:12px"><p class="rtext">אם ההורדה לא התחילה: לחיצה ארוכה על התמונה ← "שמירת תמונה"</p>', buttons: [{ label: 'סגור' }] });
    };
    img.src = HK.art.toDataURL(HK.art.chanukiah().replace('class="chanukiah"', 'width="420" height="370"'));
  }

  HK.app = {
    checkCertificate: function () {
      var p = progress();
      if (p.complete && !store.data.certShown) {
        store.data.certShown = true; store.save();
        setTimeout(function () {
          document.querySelectorAll('.modal-back').forEach(function (m) { m.remove(); });
          ui.modal({ icon: '🎓', title: 'זכית בתעודת אלוף החנוכה!', html: '<p class="rtext">השלמת את כל הפעילויות – כל הכבוד!</p>', buttons: [{ label: 'לתעודה שלי! 🏆', action: function () { go('#/cert'); } }] });
          HK.fx.confetti(); A.play('win');
        }, 2600);
      }
    }
  };

  /* ======================= הגדרות ======================= */
  ROUTES.settings = function () {
    var d = store.data, s = screen('settings');
    s.appendChild(topbar('⚙️ הגדרות', '#/home'));
    function tg(k, label) { return '<label class="toggle"><span>' + label + '</span><input type="checkbox" data-k="' + k + '" ' + (d.settings[k] ? 'checked' : '') + '><i></i></label>'; }
    s.appendChild(ui.h('<div class="set-body">' +
      '<div class="set-card"><label class="set-label">השם שלי (יופיע בתעודה)</label><input class="name-in" id="nm" maxlength="20" value="' + escapeHtml(d.name) + '" placeholder="השם שלי..."></div>' +
      '<div class="set-card">' + tg('music', '🎵 מוזיקת רקע') + tg('sfx', '🔔 צלילים') + tg('voice', '🗣️ קריינות בעברית') +
      '<button class="btn btn-blue" id="testVoice" style="margin-top:10px">🔊 בדיקת קריינות</button>' +
      '<p class="set-note" id="voiceNote"></p></div>' +
      '<div class="set-card"><b>📲 התקנה בטלפון אנדרואיד</b><p class="set-note">בדפדפן Chrome: תפריט ⋮ ← "הוספה למסך הבית" / "התקנת אפליקציה". האפליקציה תעבוד גם בלי אינטרנט!</p>' + (installEvt ? '<button class="btn btn-gold" id="inst2">📲 התקינו עכשיו</button>' : '') + '</div>' +
      '<div class="set-card"><b>👨‍👩‍👧 להורים</b><p class="set-note">התוכן נכתב בהקפדה ומבחין בין הלכה, מנהג, סיפור ומקור. ההתקדמות נשמרת במכשיר בלבד – אין איסוף מידע ואין פרסומות.</p>' +
      '<button class="btn btn-danger" id="reset">🗑 איפוס התקדמות</button></div>' +
      '</div>'));
    mount(s);
    s.querySelector('#nm').addEventListener('input', function () { d.name = this.value.trim(); d.welcomed = true; store.save(); });
    s.querySelectorAll('.toggle input').forEach(function (inp) {
      inp.onchange = function () {
        d.settings[inp.dataset.k] = inp.checked; store.save(); A.play('tap');
        if (inp.dataset.k === 'music') { if (inp.checked) HK.music.start(); else HK.music.stop(); }
        if (inp.dataset.k === 'voice' && !inp.checked) HK.voice.stop();
      };
    });
    s.querySelector('#testVoice').onclick = function () {
      HK.voice.speak('שלום! חג חנוכה שמח! נס גדול היה פה.');
      s.querySelector('#voiceNote').textContent = !HK.voice.available() ? 'הדפדפן לא תומך בקריינות.' :
        HK.voice.hasHebrew() ? '✔ נמצא קול בעברית.' : 'אם לא שומעים: הגדרות הטלפון ← שפה וקלט ← המרת טקסט לדיבור ← התקינו "עברית" ב-Google TTS.';
    };
    var i2 = s.querySelector('#inst2'); if (i2) i2.onclick = doInstall;
    s.querySelector('#reset').onclick = function () {
      ui.modal({
        icon: '⚠️', title: 'לאפס את כל ההתקדמות?', html: '<p>כל הכוכבים, המדליות והתעודה יימחקו.</p>',
        buttons: [{ label: 'כן, לאפס', cls: 'btn-danger', action: function () { store.reset(); ui.toast('ההתקדמות אופסה'); location.replace('#/home'); route(); } }, { label: 'ביטול', cls: 'btn-ghost' }]
      });
    };
  };

  /* ======================= התקנה (PWA) ======================= */
  var installEvt = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  function doInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; route(); });
  }

  /* ======================= רקע מונפש ======================= */
  function buildBg() {
    var bg = document.getElementById('bg'), html = '', r = HK.art.rng(99);
    for (var i = 0; i < 50; i++) html += '<i class="bgstar" style="left:' + (r() * 100) + '%;top:' + (r() * 100) + '%;animation-delay:' + (r() * 4).toFixed(2) + 's;transform:scale(' + (0.4 + r()).toFixed(2) + ')"></i>';
    for (i = 0; i < 8; i++) html += '<i class="bgspark" style="left:' + (r() * 100) + '%;animation-delay:' + (r() * 12).toFixed(1) + 's;animation-duration:' + (10 + r() * 8).toFixed(1) + 's"></i>';
    bg.innerHTML = html;
  }

  /* ======================= הפעלה ======================= */
  function boot() {
    $app = document.getElementById('app');
    HK.fx.init(); buildBg();
    var first = function () {
      A.unlock(); HK.music.start();
      removeEventListener('pointerdown', first, true);
    };
    addEventListener('pointerdown', first, true);
    addEventListener('hashchange', route);
    route();
    var sp = document.getElementById('splash');
    if (sp) setTimeout(function () { sp.classList.add('hide'); setTimeout(function () { sp.remove(); }, 600); }, 900);
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.HK);
