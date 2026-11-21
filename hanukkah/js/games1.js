/* ============================================================
   games1.js — הדלקת נרות, סביבון, חידון, משחק זיכרון
   כל משחק: { start(root, level, api) -> cleanup }
   api.finish(stars, {text}) מציג חלון ניצחון ושומר התקדמות
   ============================================================ */
window.HK = window.HK || {};
HK.games = HK.games || {};
(function (HK) {
  'use strict';
  var ui = HK.ui, A = HK.audio;

  /* ======================= 1. הדלקת נרות ======================= */
  var NIGHT_FACTS = [
    'בלילה הראשון מברכים שלוש ברכות – כולל "שהחיינו"!',
    'בכל לילה מוסיפים נר – כמו שהאור הולך וגדל.',
    'את החנוכייה מניחים ליד החלון, כדי שכולם יראו את האור.',
    'הנרות צריכים לדלוק לפחות חצי שעה אחרי צאת הכוכבים.',
    'אחרי ההדלקה שרים "מעוז צור" ואומרים "הנרות הללו".',
    'בחנוכה אומרים הלל בכל יום ומוסיפים "על הניסים".',
    'בשבת חנוכה מדליקים את הנרות לפני כניסת השבת.',
    'בלילה השמיני כל החנוכייה דולקת! יש הקוראים ליום השמיני "זאת חנוכה".'
  ];

  HK.games.candles = {
    start: function (root, level, api) {
      var N = level; // מספר הלילה
      var present = [], lit = [];
      for (var i = 0; i < 8; i++) { present.push(i < N ? 1 : 0); lit.push(0); }
      root.innerHTML =
        '<div class="game g-candles">' +
        '<div class="instr" id="instr"></div>' +
        '<div class="menorah-stage" id="stage">' + HK.art.chanukiah({ present: present, lit: lit, shamash: false, aura: false }) + '</div>' +
        '<div class="night-badge">לילה ' + N + ' · ' + N + ' ' + (N === 1 ? 'נר' : 'נרות') + ' + שמש</div>' +
        '</div>';
      var stage = root.querySelector('#stage'), instr = root.querySelector('#instr');
      var phase = 'bless', order = [], idx = 0, mistakes = 0, timers = [];
      for (i = N - 1; i >= 0; i--) order.push(i); // מהשמאלי (החדש) ימינה

      function setInstr(t, speak) { instr.innerHTML = t; instr.classList.remove('pop'); void instr.offsetWidth; instr.classList.add('pop'); if (speak) HK.voice.speak(t); }

      function showBlessing() {
        var b = '<div class="bless">' +
          '<p>בָּרוּךְ אַתָּה ה\' אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ לְהַדְלִיק נֵר חֲנֻכָּה.</p>' +
          '<p>בָּרוּךְ אַתָּה ה\' אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁעָשָׂה נִסִּים לַאֲבוֹתֵינוּ בַּיָּמִים הָהֵם בַּזְּמַן הַזֶּה.</p>' +
          (N === 1 ? '<p>בָּרוּךְ אַתָּה ה\' אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁהֶחֱיָנוּ וְקִיְּמָנוּ וְהִגִּיעָנוּ לַזְּמַן הַזֶּה.</p><div class="note">✨ בלילה הראשון בלבד מוסיפים "שהחיינו"</div>' : '') +
          '</div>';
        ui.modal({
          title: 'לפני ההדלקה מברכים', html: b, cls: 'bless-modal',
          buttons: [
            { label: '🔊 הקשיבו', cls: 'btn-blue', keep: true, action: function (m) { HK.voice.speak(m.querySelector('.bless').innerText); } },
            { label: 'בירכנו! ✔', action: function () { HK.voice.stop(); phase = 'shamash'; setInstr('קודם מדליקים את <b>השמש</b> – געו בנר הגבוה שבאמצע 👆', true); hint('s'); } }
          ]
        });
      }

      function flameOn(slot) {
        var f = stage.querySelector('[data-f="' + slot + '"]');
        f.classList.add('on');
        A.play('light'); ui.vibrate(15);
        HK.fx.burstAt(f, 12);
      }
      function hint(slot) {
        stage.querySelectorAll('.cnd').forEach(function (c) { c.classList.remove('hint'); });
        if (slot != null) { var c = stage.querySelector('.cnd[data-slot="' + slot + '"]'); if (c) c.classList.add('hint'); }
      }
      function wrong(el, msg) {
        mistakes++; A.play('bad'); ui.vibrate([30, 40, 30]);
        el.classList.remove('shake'); void el.getBoundingClientRect(); el.classList.add('shake');
        setInstr(msg, true);
        if (mistakes >= 2 && phase === 'light') hint(order[idx]);
      }

      stage.addEventListener('click', function (e) {
        var c = e.target.closest('.cnd'); if (!c) return;
        var slot = c.getAttribute('data-slot');
        if (phase === 'bless') { showBlessing(); return; }
        if (phase === 'shamash') {
          if (slot === 's') {
            flameOn('s'); phase = 'light'; hint(null);
            setInstr(N === 1 ? 'עכשיו הדליקו את הנר של הלילה הראשון 🕯️' : 'עכשיו מדליקים מהנר <b>החדש – השמאלי ביותר</b>, וממשיכים ימינה ⬅️', true);
            if (N === 1) hint(0);
          } else if (present[+slot]) wrong(c, 'רגע! קודם מדליקים את <b>השמש</b> – הנר הגבוה באמצע.');
          return;
        }
        if (phase === 'light') {
          if (slot === 's') return;
          slot = +slot;
          if (!present[slot] || lit[slot]) return;
          if (slot === order[idx]) {
            lit[slot] = 1; flameOn(slot); idx++; hint(mistakes >= 2 && idx < order.length ? order[idx] : null);
            if (idx === order.length) {
              phase = 'done'; hint(null);
              setInstr('🎉 החנוכייה דולקת! הַנֵּרוֹת הַלָּלוּ קֹדֶשׁ הֵם');
              stage.querySelector('.aura').setAttribute('opacity', '1');
              timers.push(setTimeout(function () {
                var stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
                api.finish(stars, { text: 'הידעת? ' + NIGHT_FACTS[N - 1], say: 'כל הכבוד! הדלקת את נרות הלילה ה' + ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'][N - 1] });
              }, 1300));
            } else if (idx === 1 && N > 1) setInstr('יופי! עכשיו הנר הבא – ימינה ממנו ➡️');
          } else {
            wrong(c, 'כמעט! מדליקים קודם את <b>הנר החדש</b> – השמאלי ביותר מבין הנרות שעוד לא דלקו.');
          }
        }
      });

      setInstr('לילה ' + N + ' של חנוכה! קודם כול – מברכים 🙏');
      timers.push(setTimeout(showBlessing, 500));
      return function () { timers.forEach(clearTimeout); };
    }
  };

  /* ======================= 2. סביבון תלת-ממדי ======================= */
  var LETTERS = [
    { l: 'נ', w: 'נֵס', res: 'נ – נס! לא קורה כלום.', color: '#7cc4ff' },
    { l: 'ג', w: 'גָּדוֹל', res: 'ג – גדול! לוקחים את כל הקופה! 🤩', color: '#f6c445' },
    { l: 'ה', w: 'הָיָה', res: 'ה – היה! לוקחים חצי מהקופה.', color: '#a0e7a0' },
    { l: 'פ', w: 'פֹּה', res: 'פ – פה! מוסיפים מטבע לקופה.', color: '#ff8fab' }
  ];
  HK.games.dreidel = {
    start: function (root, level, api) {
      var faces = '', i;
      for (i = 0; i < 4; i++) faces += '<div class="dr-face" style="transform:rotateY(' + (i * 90) + 'deg) translateZ(60px)"><span>' + LETTERS[i].l + '</span></div>';
      var handle = '', tip = '';
      for (i = 0; i < 4; i++) handle += '<div class="dr-hf" style="transform:rotateY(' + (i * 90) + 'deg) translateZ(11px)"></div>';
      for (i = 0; i < 4; i++) tip += '<div class="dr-tip" style="transform:rotateY(' + (i * 90) + 'deg) translateZ(60px) rotateX(-42deg)"></div>';
      root.innerHTML =
        '<div class="game g-dreidel">' +
        '<div class="dr-score"><div class="pill">🪙 שלי: <b id="mine">10</b></div><div class="pill">🏺 בקופה: <b id="pot">4</b></div><div class="pill">🌀 <span class="frac"><b id="spins">0</b>/10</span></div></div>' +
        '<div class="dr-stage" id="stage"><div class="dr-shadow" id="shadow"></div><div class="dr3d"><div class="dr-spin" id="dr">' + faces + '<div class="dr-top"></div><div class="dr-handle">' + handle + '<div class="dr-hcap"></div></div>' + tip + '</div></div></div>' +
        '<div class="dr-result" id="res">געו בסביבון או החליקו כדי לסובב!</div>' +
        '<button class="btn btn-gold btn-big" id="spinBtn">🌀 סובבו!</button>' +
        '<div class="dr-legend">' + LETTERS.map(function (x) { return '<span><b style="color:' + x.color + '">' + x.l + '</b> ' + x.w + '</span>'; }).join('') + '</div>' +
        '<div class="dr-note">בארץ ישראל: נֵס גָּדוֹל הָיָה פֹּה · בחוץ לארץ: ...הָיָה שָׁם</div>' +
        '</div>';
      var dr = root.querySelector('#dr'), res = root.querySelector('#res'), btn = root.querySelector('#spinBtn'), stage = root.querySelector('#stage');
      var mine = 10, pot = 4, spins = 0, angle = 0, busy = false, raf = 0, timers = [];
      var elMine = root.querySelector('#mine'), elPot = root.querySelector('#pot'), elSpins = root.querySelector('#spins');

      function upd() {
        [[elMine, mine], [elPot, pot], [elSpins, spins]].forEach(function (p) { if (p[0].textContent != p[1]) { p[0].textContent = p[1]; p[0].classList.remove('bump'); void p[0].offsetWidth; p[0].classList.add('bump'); } });
      }
      function render(a, wob, lift) {
        dr.style.transform = 'translateY(' + (-lift) + 'px) rotateZ(' + wob + 'deg) rotateY(' + a + 'deg)';
      }
      render(-20, 0, 0);
      angle = -20;

      function spin() {
        if (busy || spins >= 10) return;
        busy = true; btn.disabled = true; A.unlock(); A.play('whoosh');
        res.textContent = 'מסתובב...'; res.className = 'dr-result';
        var r = Math.floor(Math.random() * 4);
        var start = angle, target0 = -r * 90;
        var delta = ((target0 - start) % 360 + 360) % 360;
        var end = start + 360 * (5 + Math.floor(Math.random() * 3)) + delta;
        var dur = 2600 + Math.random() * 600, t0 = performance.now();
        var lastTick = 0;
        function step(now) {
          var t = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - t, 3);
          angle = start + (end - start) * e;
          var wob = Math.sin(now / 90) * (2 + 10 * t * t) * (t < 0.92 ? 1 : (1 - t) / 0.08);
          var lift = Math.max(0, Math.sin(t * Math.PI) * 18);
          render(angle, wob, lift);
          shadow.style.transform = 'scale(' + (1 - lift / 60) + ')';
          if (t - lastTick > 0.07 && t < 0.8) { lastTick = t; A.play('tap'); }
          if (t < 1) raf = requestAnimationFrame(step);
          else land(r);
        }
        raf = requestAnimationFrame(step);
      }
      var shadow = root.querySelector('#shadow');
      function land(r) {
        spins++;
        var L = LETTERS[r], msg = L.res, gained = 0;
        HK.store.data.lettersSeen[L.l] = 1; HK.store.save();
        if (r === 1) { gained = pot; mine += pot; pot = 0; }
        else if (r === 2) { gained = Math.ceil(pot / 2); mine += gained; pot -= gained; }
        else if (r === 3) { if (mine > 0) { mine -= 1; pot += 1; } }
        res.innerHTML = '<span class="big-letter" style="color:' + L.color + '">' + L.l + '</span> ' + msg;
        res.classList.add('show');
        HK.voice.speak(msg);
        if (gained > 0) { A.play('good'); for (var k = 0; k < Math.min(gained, 8); k++) timers.push(setTimeout(function () { A.play('coin'); }, 200 + k * 110)); HK.fx.burstAt(root.querySelector('#mine'), 20); }
        else if (r === 3) A.play('bad'); else A.play('pop');
        if (pot < 2 && spins < 10) { timers.push(setTimeout(function () { pot += 2; upd(); ui.toast('🪙 החברים הוסיפו 2 מטבעות לקופה'); }, 1400)); }
        upd();
        if (spins >= 10) {
          timers.push(setTimeout(function () {
            var stars = mine >= 20 ? 3 : mine >= 14 ? 2 : 1;
            api.finish(stars, { text: 'סיימת עם ' + mine + ' מטבעות! ' + (stars < 3 ? 'עם 20 מטבעות ומעלה מקבלים 3 כוכבים.' : 'אלוף הסביבון!'), say: 'סיימת עם ' + mine + ' מטבעות' });
          }, 1800));
        } else { busy = false; btn.disabled = false; }
      }

      btn.onclick = spin;
      var sx = 0;
      stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
      stage.addEventListener('pointerup', function () { spin(); });
      return function () { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
    }
  };

  /* ======================= 3. חידון חנוכה ======================= */
  HK.games.quiz = {
    start: function (root, level, api) {
      var pool = ui.shuffle(HK.QUIZ.filter(function (q) { return q.l === level; })).slice(0, level === 3 ? 10 : 8);
      var qi = 0, score = 0, correct = 0, streak = 0, timers = [];
      root.innerHTML =
        '<div class="game g-quiz' + (level === 3 ? ' lv3' : '') + '">' +
        '<div class="q-top"><div class="pill" id="qprog"></div><div class="pill">🏆 ניקוד: <b id="qscore">0</b></div></div>' +
        '<div class="q-bar"><i id="qbar"></i></div>' +
        (level === 3 ? '<div class="q-scholar">📜 חידון לתלמידי חכמים · לפי השולחן ערוך והמשנה ברורה (או"ח סי\' תר"ע–תרפ"ד)</div>' : '') +
        '<div class="q-card" id="qcard"></div>' +
        '<div class="q-answers" id="qans"></div>' +
        '<div class="q-feedback" id="qfb"></div>' +
        '</div>';
      var card = root.querySelector('#qcard'), ans = root.querySelector('#qans'), fb = root.querySelector('#qfb');
      var MARK = ['א', 'ב', 'ג', 'ד'];

      function show() {
        var q = pool[qi];
        root.querySelector('#qprog').textContent = 'שאלה ' + (qi + 1) + ' מתוך ' + pool.length;
        root.querySelector('#qbar').style.width = (qi / pool.length * 100) + '%';
        card.innerHTML = '<button class="speak-btn" aria-label="הקראה">🔊</button><h3>' + q.q + '</h3>';
        card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
        card.querySelector('.speak-btn').onclick = function () { HK.voice.speak(q.q + '. ' + q.a.join(', ')); };
        fb.innerHTML = ''; fb.className = 'q-feedback';
        var order = ui.shuffle([0, 1, 2, 3].slice(0, q.a.length));
        ans.innerHTML = '';
        order.forEach(function (ai, k) {
          var b = ui.h('<button class="q-ans" style="animation-delay:' + (k * 0.07) + 's"><span class="q-mark">' + MARK[k] + '</span><span>' + q.a[ai] + '</span></button>');
          b.onclick = function () { choose(b, ai); };
          ans.appendChild(b);
        });
        HK.voice.speak(q.q);
      }
      function choose(b, ai) {
        if (ans.classList.contains('locked')) return;
        ans.classList.add('locked');
        var q = pool[qi], ok = ai === q.c;
        ans.querySelectorAll('.q-ans').forEach(function (x, k) { x.disabled = true; });
        var buttons = ans.querySelectorAll('.q-ans');
        buttons.forEach(function (x) { if (x.textContent.slice(1) === q.a[q.c]) x.classList.add('right'); });
        if (ok) {
          correct++; streak++; var pts = 100 + (streak > 1 ? (streak - 1) * 20 : 0); score += pts;
          b.classList.add('right'); A.play('good'); HK.fx.burstAt(b, 22);
          fb.innerHTML = '<b>✔ נכון! +' + pts + '</b>' + (streak > 1 ? ' <span class="streak">🔥 רצף ' + streak + '</span>' : '') + '<br>' + q.e + (q.s ? '<div class="q-src">📚 ' + q.s + '</div>' : '');
          fb.className = 'q-feedback good';
        } else {
          streak = 0; b.classList.add('wrong'); A.play('bad'); ui.vibrate(60);
          fb.innerHTML = '<b>✘ לא בדיוק...</b> התשובה הנכונה: <b>' + q.a[q.c] + '</b><br>' + q.e + (q.s ? '<div class="q-src">📚 ' + q.s + '</div>' : '');
          fb.className = 'q-feedback bad';
        }
        root.querySelector('#qscore').textContent = score;
        HK.voice.speak((ok ? 'נכון! ' : 'התשובה הנכונה: ' + q.a[q.c] + '. ') + q.e);
        var next = ui.h('<button class="btn btn-gold next-btn">' + (qi + 1 < pool.length ? 'לשאלה הבאה ⬅' : 'לתוצאות 🏆') + '</button>');
        next.onclick = function () {
          A.play('tap'); HK.voice.stop(); ans.classList.remove('locked'); qi++;
          if (qi < pool.length) show(); else finish();
        };
        fb.appendChild(next);
      }
      function finish() {
        root.querySelector('#qbar').style.width = '100%';
        var n = pool.length, stars = correct >= n ? 3 : correct >= n * 0.75 ? 2 : correct >= n * 0.5 ? 1 : 0;
        api.finish(stars, { text: 'ענית נכון על ' + correct + ' מתוך ' + pool.length + ' שאלות · ניקוד: ' + score, say: 'ענית נכון על ' + correct + ' שאלות' });
      }
      show();
      return function () { timers.forEach(clearTimeout); HK.voice.stop(); };
    }
  };

  /* ======================= 4. משחק זיכרון ======================= */
  var MEM_SYMS = ['menorah', 'dreidel', 'sufganiya', 'coin', 'jar', 'latke', 'candle', 'olive', 'torah', 'shield'];
  var MEM_NAMES = { menorah: 'חנוכייה', dreidel: 'סביבון', sufganiya: 'סופגנייה', coin: 'מטבע', jar: 'פך שמן', latke: 'לביבה', candle: 'נר', olive: 'זית', torah: 'ספר תורה', shield: 'מגן' };
  HK.games.memory = {
    start: function (root, level, api) {
      var pairs = [4, 6, 8][level - 1], cols = 4;
      var syms = ui.shuffle(MEM_SYMS).slice(0, pairs);
      var deck = ui.shuffle(syms.concat(syms));
      var moves = 0, found = 0, open = [], lock = false, t0 = Date.now(), timers = [], tick;
      root.innerHTML =
        '<div class="game g-memory">' +
        '<div class="q-top"><div class="pill">👆 מהלכים: <b id="moves">0</b></div><div class="pill">✨ זוגות: <span class="frac"><b id="found">0</b>/' + pairs + '</span></div><div class="pill">⏱ <b id="time">0</b></div></div>' +
        '<div class="mem-grid" style="--cols:' + cols + ';--rows:' + (pairs * 2 / cols) + '" id="grid"></div>' +
        '</div>';
      var grid = root.querySelector('#grid');
      deck.forEach(function (s, i) {
        var icon = s === 'dreidel' ? HK.art.icons.dreidel('#2a5bd7', ['נ', 'ג', 'ה', 'פ'][i % 4]) : HK.art.icons[s]();
        var c = ui.h('<button class="mcard" style="animation-delay:' + (i * 0.04) + 's" data-s="' + s + '"><div class="mc-inner"><div class="mc-front"><div class="mc-pattern">✡</div></div><div class="mc-back">' + icon + '<small>' + MEM_NAMES[s] + '</small></div></div></button>');
        c.onclick = function () { flip(c); };
        grid.appendChild(c);
      });
      tick = setInterval(function () { root.querySelector('#time').textContent = Math.floor((Date.now() - t0) / 1000); }, 500);

      function flip(c) {
        if (lock || c.classList.contains('open') || c.classList.contains('done')) return;
        A.play('flip'); c.classList.add('open'); open.push(c);
        if (open.length === 2) {
          moves++; root.querySelector('#moves').textContent = moves;
          var a = open[0], b = open[1];
          if (a.dataset.s === b.dataset.s) {
            open = [];
            timers.push(setTimeout(function () {
              a.classList.add('done'); b.classList.add('done'); A.play('good'); HK.fx.burstAt(a, 12); HK.fx.burstAt(b, 12);
              found++; root.querySelector('#found').textContent = found;
              HK.voice.speak(MEM_NAMES[a.dataset.s]);
              if (found === pairs) {
                clearInterval(tick);
                var stars = moves <= pairs + 2 ? 3 : moves <= pairs * 2 ? 2 : 1;
                timers.push(setTimeout(function () { api.finish(stars, { text: 'מצאת את כל ' + pairs + ' הזוגות ב-' + moves + ' מהלכים!' }); }, 800));
              }
            }, 350));
          } else {
            lock = true;
            timers.push(setTimeout(function () { a.classList.remove('open'); b.classList.remove('open'); open = []; lock = false; A.play('flip'); }, 900));
          }
        }
      }
      return function () { clearInterval(tick); timers.forEach(clearTimeout); };
    }
  };
})(window.HK);
