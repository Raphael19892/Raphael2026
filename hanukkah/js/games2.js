/* ============================================================
   games2.js — מצא את ההבדלים, איסוף מטבעות (ריצה), פאזל חנוכה
   ============================================================ */
window.HK = window.HK || {};
HK.games = HK.games || {};
(function (HK) {
  'use strict';
  var ui = HK.ui, A = HK.audio;

  /* ======================= 5. מצא את ההבדלים ======================= */
  HK.games.diff = {
    start: function (root, level, api) {
      var count = [3, 4, 5][level - 1];
      var chosen = ui.shuffle(HK.art.DIFFS).slice(0, count);
      var flags = {}; chosen.forEach(function (d) { flags[d.id] = true; });
      var found = {}, nFound = 0, mistakes = 0, hints = 0, timers = [];
      root.innerHTML =
        '<div class="game g-diff">' +
        '<div class="q-top"><div class="pill">🔍 נמצאו: <span class="frac"><b id="nf">0</b>/' + count + '</span></div><button class="pill pill-btn" id="hintBtn">💡 רמז</button></div>' +
        '<div class="instr small">מצאו <b>' + count + '</b> הבדלים בין שתי התמונות – געו בהבדל באחת מהן!</div>' +
        '<div class="diff-wrap"><div class="diff-pic" data-k="a">' + HK.art.diffScene({}) + '</div><div class="diff-pic" data-k="b">' + HK.art.diffScene(flags) + '</div></div>' +
        '</div>';
      var svgs = root.querySelectorAll('.diff-pic svg');
      var NS = 'http://www.w3.org/2000/svg';

      function toSvgPoint(svg, e) {
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
      }
      function mark(d) {
        svgs.forEach(function (s) {
          var c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', d.x); c.setAttribute('cy', d.y); c.setAttribute('r', d.r + 4);
          c.setAttribute('class', 'found-ring'); s.appendChild(c);
        });
      }
      function miss(svg, p) {
        var t = document.createElementNS(NS, 'text');
        t.setAttribute('x', p.x); t.setAttribute('y', p.y + 8); t.setAttribute('class', 'miss-x'); t.setAttribute('text-anchor', 'middle');
        t.textContent = '✕'; svg.appendChild(t);
        timers.push(setTimeout(function () { t.remove(); }, 700));
      }
      svgs.forEach(function (svg) {
        svg.addEventListener('pointerdown', function (e) {
          var p = toSvgPoint(svg, e), hit = null;
          chosen.forEach(function (d) { if (!found[d.id] && Math.hypot(p.x - d.x, p.y - d.y) < d.r * 1.35 + 6) hit = d; });
          if (hit) {
            found[hit.id] = 1; nFound++; mark(hit); A.play('good'); ui.vibrate(20);
            HK.fx.burst(e.clientX, e.clientY, 20);
            root.querySelector('#nf').textContent = nFound;
            root.querySelectorAll('.hint-ring').forEach(function (x) { x.remove(); });
            if (nFound === count) {
              timers.push(setTimeout(function () {
                var stars = (mistakes <= 2 && hints === 0) ? 3 : (mistakes <= 5 && hints <= 1) ? 2 : 1;
                api.finish(stars, { text: 'מצאת את כל ההבדלים! ' + (hints ? '(השתמשת ב-' + hints + ' רמזים)' : '') });
              }, 900));
            }
          } else {
            mistakes++; A.play('bad'); miss(svg, p);
          }
        });
      });
      root.querySelector('#hintBtn').onclick = function () {
        var d = chosen.filter(function (x) { return !found[x.id]; })[0]; if (!d) return;
        hints++; A.play('pop');
        var s = svgs[1], c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', d.x); c.setAttribute('cy', d.y); c.setAttribute('r', d.r + 14); c.setAttribute('class', 'hint-ring');
        s.appendChild(c);
        timers.push(setTimeout(function () { c.remove(); }, 2600));
      };
      return function () { timers.forEach(clearTimeout); };
    }
  };

  /* ======================= 6. איסוף מטבעות – הרפתקת ריצה ======================= */
  HK.games.runner = {
    start: function (root, level, api) {
      var goal = [15, 25, 35][level - 1];
      root.innerHTML =
        '<div class="game g-runner">' +
        '<div class="run-hud"><div class="pill">🪙 <span class="frac"><b id="rc">0</b>/' + goal + '</span></div><div class="pill hearts" id="hearts">❤️❤️❤️</div></div>' +
        '<canvas id="cv"></canvas>' +
        '<div class="run-start" id="startOv"><div class="run-start-box"><div class="run-title">המסע לירושלים 🏃‍♂️</div><p>אספו <b>' + goal + '</b> מטבעות זהב בדרך לבית המקדש!</p><p>👆 געו במסך כדי <b>לקפוץ</b> מעל אבנים ושיחים<br>👆👆 שתי נגיעות = קפיצה כפולה<br>🏺 פך שמן = מגן זוהר + בונוס!</p><button class="btn btn-gold btn-big" id="go">יוצאים לדרך! ▶</button></div></div>' +
        '</div>' +
        '<button class="btn btn-gold btn-big run-jump" id="jumpBtn">⬆ קפיצה!</button>';
      var cv = root.querySelector('#cv'), c = cv.getContext('2d');
      var W = 0, H = 0, S = 1, LW = 0, LH = 360, DPR = Math.min(devicePixelRatio || 1, 2);
      var GROUND = 300;
      function resize() {
        var r = cv.getBoundingClientRect();
        W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR;
        S = Math.min(H / 360, W / 480); LW = W / S; LH = H / S;
        GROUND = Math.round(LH - Math.max(60, LH * 0.17));
        if (st) st.p.y = Math.min(st.p.y, GROUND);
      }
      var st = null;
      resize(); addEventListener('resize', resize);

      var rand = Math.random;
      st = {
        running: false, over: false, t: 0, speed: 230 + level * 45, dist: 0,
        p: { x: 90, y: GROUND, vy: 0, jumps: 0, inv: 0, shield: 0 },
        hearts: 3, coins: 0, obs: [], items: [], nextObs: 500, nextCoins: 200, parts: []
      };
      var stars = []; for (var i = 0; i < 60; i++) stars.push({ x: rand() * 1600, y: rand() * 180, r: rand() * 1.6 + 0.4, tw: rand() * 6 });
      var mtn1 = [], mtn2 = []; for (i = 0; i < 40; i++) { mtn1.push(60 + rand() * 70); mtn2.push(30 + rand() * 50); }

      function jump() {
        if (!st.running) return;
        var p = st.p;
        if (p.jumps < 2) { p.vy = p.jumps === 0 ? -720 : -620; p.jumps++; A.play('jump'); }
      }
      function onDown(e) { if (e.target.closest('button')) return; e.preventDefault(); jump(); }
      root.querySelector('.g-runner').addEventListener('pointerdown', onDown);
      root.querySelector('#jumpBtn').addEventListener('pointerdown', function (e) { e.preventDefault(); jump(); });
      function onKey(e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } }
      addEventListener('keydown', onKey);

      root.querySelector('#go').onclick = function () {
        A.play('tap'); root.querySelector('#startOv').remove(); st.running = true; last = performance.now();
      };

      function spawn() {
        var x = LW + 60;
        if (st.dist >= st.nextObs) {
          var type = ['rock', 'bush', 'log'][Math.floor(rand() * 3)];
          var o = { type: type, x: x, w: type === 'log' ? 54 : type === 'bush' ? 42 : 34, h: type === 'log' ? 22 : type === 'bush' ? 34 : 28 };
          st.obs.push(o);
          // קשת מטבעות מעל המכשול
          if (rand() < 0.7) for (var k = 0; k < 3; k++) st.items.push({ kind: 'coin', x: x - 30 + k * 34 + o.w / 2 - 17, y: GROUND - 95 - (k === 1 ? 25 : 0) });
          st.nextObs = st.dist + 300 + rand() * 260 - Math.min(level * 25, 70);
        }
        if (st.dist >= st.nextCoins) {
          var n = 3 + Math.floor(rand() * 3), hgt = rand() < 0.5 ? 35 : 120;
          for (k = 0; k < n; k++) st.items.push({ kind: 'coin', x: x + 140 + k * 32, y: GROUND - hgt });
          if (rand() < 0.12) st.items.push({ kind: 'jar', x: x + 160 + n * 32 + 40, y: GROUND - 150 });
          st.nextCoins = st.dist + 380 + rand() * 300;
        }
      }
      function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
      function sparks(x, y, col, n) { for (var k = 0; k < n; k++) { var an = rand() * 6.28, sp = 60 + rand() * 160; st.parts.push({ x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, life: 0.6, col: col }); } }

      function update(dt) {
        st.t += dt;
        var sp = st.speed + Math.min(st.dist / 60, 70);
        st.dist += sp * dt;
        var p = st.p;
        p.vy += 1900 * dt; p.y += p.vy * dt;
        if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.jumps = 0; }
        if (p.inv > 0) p.inv -= dt; if (p.shield > 0) p.shield -= dt;
        spawn();
        var pb = { x: p.x - 13, y: p.y - 50, w: 26, h: 48 };
        st.obs.forEach(function (o) { o.x -= sp * dt; });
        st.items.forEach(function (it) { it.x -= sp * dt; });
        st.obs = st.obs.filter(function (o) { return o.x > -80; });
        st.items = st.items.filter(function (it) { return it.x > -40 && !it.got; });
        st.obs.forEach(function (o) {
          if (o.hitDone) return;
          var ob = { x: o.x + 5, y: GROUND - o.h + 5, w: o.w - 10, h: o.h - 5 };
          if (hit(pb, ob)) {
            o.hitDone = true;
            if (p.shield > 0) { sparks(o.x + o.w / 2, GROUND - o.h, '#7cc4ff', 14); A.play('pop'); o.smash = true; return; }
            if (p.inv > 0) return;
            st.hearts--; p.inv = 1.4; A.play('hurt'); ui.vibrate(80);
            root.querySelector('#hearts').textContent = '❤️'.repeat(Math.max(0, st.hearts)) + '🤍'.repeat(3 - Math.max(0, st.hearts));
            if (st.hearts <= 0) end(false);
          }
        });
        st.items.forEach(function (it) {
          var ib = it.kind === 'jar' ? { x: it.x - 16, y: it.y - 18, w: 32, h: 36 } : { x: it.x - 12, y: it.y - 12, w: 24, h: 24 };
          if (hit(pb, ib)) {
            it.got = true;
            if (it.kind === 'jar') { p.shield = 5; st.coins += 3; A.play('unlock'); sparks(it.x, it.y, '#ffe58a', 24); }
            else { st.coins++; A.play('coin'); sparks(it.x, it.y, '#ffe58a', 8); }
            var el = root.querySelector('#rc'); el.textContent = Math.min(st.coins, goal); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
            if (st.coins >= goal) end(true);
          }
        });
        st.parts.forEach(function (q) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; });
        st.parts = st.parts.filter(function (q) { return q.life > 0; });
      }

      function draw() {
        c.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
        var g = c.createLinearGradient(0, 0, 0, LH);
        var k = Math.min(1, st.dist / 9000); // השמיים מחשיכים בהדרגה - מגיעים בערב
        g.addColorStop(0, k > 0.5 ? '#0b1640' : '#24306e'); g.addColorStop(0.6, '#4a4aa0'); g.addColorStop(1, k > 0.5 ? '#6a5a9a' : '#f2a65a');
        c.fillStyle = g; c.fillRect(0, 0, LW, LH);
        // כוכבים
        stars.forEach(function (s) {
          var x = ((s.x - st.dist * 0.02) % 1600 + 1600) % 1600; if (x > LW) return;
          c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(st.t * 1.5 + s.tw)); c.fillStyle = '#fff';
          c.beginPath(); c.arc(x, s.y, s.r, 0, 6.28); c.fill();
        });
        c.globalAlpha = 1;
        // ירח
        c.fillStyle = 'rgba(255,240,200,.15)'; c.beginPath(); c.arc(LW * 0.3, 90, 40, 0, 6.28); c.fill();
        c.fillStyle = '#fff5d6'; c.beginPath(); c.arc(LW * 0.3, 90, 20, 0, 6.28); c.fill();
        // הרים רחוקים
        drawMtn(mtn1, 0.12, GROUND - 80, '#3a3f86', 140);
        // בית המקדש מרחוק
        var tx = LW - ((st.dist * 0.05) % (LW + 400));
        drawTemple(tx + 200, GROUND - 70);
        drawMtn(mtn2, 0.3, GROUND - 50, '#24306e', 110);
        // קרקע
        c.fillStyle = '#5a4a2e'; c.fillRect(0, GROUND, LW, LH - GROUND);
        c.fillStyle = '#7a6a3a'; c.fillRect(0, GROUND, LW, 8);
        c.fillStyle = '#4a3a22';
        var off = st.dist % 60;
        for (var x = -off; x < LW; x += 60) { c.fillRect(x, GROUND + 22, 18, 5); c.fillRect(x + 30, GROUND + 40, 12, 4); }
        // מכשולים
        st.obs.forEach(drawObs);
        // פריטים
        st.items.forEach(function (it) { if (it.kind === 'coin') drawCoin(it.x, it.y); else drawJar(it.x, it.y); });
        drawPlayer();
        st.parts.forEach(function (q) { c.globalAlpha = Math.max(0, q.life / 0.6); c.fillStyle = q.col; c.fillRect(q.x - 2, q.y - 2, 4, 4); });
        c.globalAlpha = 1;
      }
      function drawMtn(arr, f, base, col, step) {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, LH);
        var o = st.dist * f, start = Math.floor(o / step);
        for (var j = -1; j < LW / step + 2; j++) {
          var idx = ((start + j) % arr.length + arr.length) % arr.length;
          var x = j * step - (o % step);
          c.lineTo(x, base - arr[idx]); c.lineTo(x + step / 2, base - arr[idx] * 0.6);
        }
        c.lineTo(LW, LH); c.closePath(); c.fill();
      }
      function drawTemple(x, y) {
        c.fillStyle = 'rgba(255,220,140,.18)'; c.beginPath(); c.arc(x, y - 40, 60, 0, 6.28); c.fill();
        c.fillStyle = '#e8d6a8'; c.fillRect(x - 50, y - 30, 100, 30); c.fillRect(x - 20, y - 70, 40, 42);
        c.fillStyle = '#f6c445'; c.fillRect(x - 24, y - 74, 48, 5); c.fillRect(x - 54, y - 34, 108, 5);
      }
      function drawObs(o) {
        var x = o.x, y = GROUND;
        if (o.smash) c.globalAlpha = 0.3;
        if (o.type === 'rock') {
          c.fillStyle = '#8a8a9a'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y - o.h + 6); c.lineTo(x + 18, y - o.h); c.lineTo(x + o.w, y - 10); c.lineTo(x + o.w, y); c.fill();
          c.fillStyle = '#b0b0c0'; c.beginPath(); c.moveTo(x + 8, y - o.h + 8); c.lineTo(x + 18, y - o.h + 2); c.lineTo(x + 20, y - 14); c.fill();
        } else if (o.type === 'bush') {
          c.fillStyle = '#2f6b3a';
          c.beginPath(); c.arc(x + 12, y - 12, 13, 0, 6.28); c.arc(x + 28, y - 14, 15, 0, 6.28); c.arc(x + 20, y - 26, 12, 0, 6.28); c.fill();
          c.fillStyle = '#d33'; c.fillRect(x + 14, y - 22, 4, 4); c.fillRect(x + 28, y - 16, 4, 4);
        } else {
          c.fillStyle = '#7a4b26'; c.fillRect(x, y - o.h, o.w, o.h);
          c.fillStyle = '#a0663a'; c.beginPath(); c.ellipse(x + o.w, y - o.h / 2, 6, o.h / 2, 0, 0, 6.28); c.fill();
          c.strokeStyle = '#5a3416'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 6, y - o.h / 2); c.lineTo(x + o.w - 10, y - o.h / 2); c.stroke();
        }
        c.globalAlpha = 1;
      }
      function drawCoin(x, y) {
        var sx = Math.abs(Math.cos(st.t * 4 + x * 0.05));
        c.save(); c.translate(x, y); c.scale(Math.max(0.15, sx), 1);
        c.fillStyle = 'rgba(255,220,100,.25)'; c.beginPath(); c.arc(0, 0, 16, 0, 6.28); c.fill();
        c.fillStyle = '#b07d12'; c.beginPath(); c.arc(0, 1.5, 11, 0, 6.28); c.fill();
        c.fillStyle = '#f6c445'; c.beginPath(); c.arc(0, 0, 11, 0, 6.28); c.fill();
        c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(-3, -3, 3.5, 0, 6.28); c.fill();
        c.strokeStyle = '#b07d12'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 7.5, 0, 6.28); c.stroke();
        c.restore();
      }
      function drawJar(x, y) {
        var b = Math.sin(st.t * 3) * 4; y += b;
        c.fillStyle = 'rgba(255,220,120,.3)'; c.beginPath(); c.arc(x, y, 26, 0, 6.28); c.fill();
        c.fillStyle = '#c0753a'; c.beginPath(); c.ellipse(x, y + 4, 14, 15, 0, 0, 6.28); c.fill();
        c.fillRect(x - 6, y - 16, 12, 10);
        c.fillStyle = '#6b3a1a'; c.fillRect(x - 8, y - 19, 16, 5);
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(x, y + 6, 4, 0, 6.28); c.fill();
      }
      function drawPlayer() {
        var p = st.p, x = p.x, y = p.y;
        if (p.inv > 0 && Math.floor(p.inv * 10) % 2) c.globalAlpha = 0.35;
        if (p.shield > 0) { c.fillStyle = 'rgba(124,196,255,' + (0.25 + 0.1 * Math.sin(st.t * 10)) + ')'; c.beginPath(); c.arc(x, y - 28, 38, 0, 6.28); c.fill(); }
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, GROUND + 2, 16 * (1 - (GROUND - y) / 300), 4, 0, 0, 6.28); c.fill();
        var run = p.y >= GROUND ? Math.sin(st.t * 18) : 0.6;
        c.strokeStyle = '#3a2a1a'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - 3, y - 18); c.lineTo(x - 3 + run * 9, y - 2); c.moveTo(x + 3, y - 18); c.lineTo(x + 3 - run * 9, y - 2); c.stroke();
        c.fillStyle = '#2a5bd7'; c.beginPath(); c.moveTo(x - 13, y - 16); c.lineTo(x - 9, y - 44); c.lineTo(x + 9, y - 44); c.lineTo(x + 13, y - 16); c.closePath(); c.fill();
        c.fillStyle = '#f6c445'; c.fillRect(x - 11, y - 28, 22, 4);
        c.strokeStyle = '#2a5bd7'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(x + 6, y - 40); c.lineTo(x + 6 + run * -8, y - 26); c.stroke();
        c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(x, y - 54, 11, 0, 6.28); c.fill();
        c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(x + 4, y - 55, 1.6, 0, 6.28); c.fill();
        c.fillStyle = '#1d3b8f'; c.beginPath(); c.arc(x - 1, y - 62, 7, Math.PI, 0); c.fill();
        c.strokeStyle = '#a0522d'; c.lineWidth = 1.4; c.beginPath(); c.arc(x + 3, y - 51, 3, 0.2, 2.2); c.stroke();
        c.globalAlpha = 1;
      }

      var raf = 0, last = performance.now(), ended = false;
      function loop(now) {
        var dt = Math.min(0.033, (now - last) / 1000); last = now;
        if (st.running && !document.hidden) update(dt);
        draw();
        if (!ended) raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      function end(win) {
        if (!st.running) return;
        st.running = false;
        setTimeout(function () {
          ended = true;
          if (win) api.finish(st.hearts, { text: 'אספת ' + st.coins + ' מטבעות והגעת לירושלים! ' + (st.hearts < 3 ? 'בלי להיתקל במכשולים תקבלו 3 כוכבים.' : '') });
          else api.finish(0, { text: 'נתקלת ביותר מדי מכשולים. אספת ' + st.coins + ' מטבעות – נסו שוב!' });
        }, 700);
      }

      return function () { ended = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('keydown', onKey); };
    }
  };

  /* ======================= 7. פאזל חנוכה ======================= */
  var PUZ = [
    { cols: 3, rows: 3, scene: 'night', name: 'לילה של חנוכה' },
    { cols: 4, rows: 3, scene: 'temple', name: 'בית המקדש', o: { glow: 1 } },
    { cols: 4, rows: 4, scene: 'table', name: 'שולחן החג' }
  ];
  HK.games.puzzle = {
    start: function (root, level, api) {
      var P = PUZ[level - 1], n = P.cols * P.rows;
      var svg = HK.art.scenes[P.scene](P.o || {});
      var url = HK.art.toDataURL(svg.replace(/class="twk"[^ ]* /g, ''));
      var order = [];
      for (var i = 0; i < n; i++) order.push(i);
      do { order = ui.shuffle(order); } while (order.filter(function (v, k) { return v === k; }).length > Math.floor(n / 4));
      var moves = 0, sel = null, timers = [];
      root.innerHTML =
        '<div class="game g-puzzle">' +
        '<div class="q-top"><div class="pill">🧩 ' + P.name + '</div><div class="pill">👆 מהלכים: <b id="pm">0</b></div><button class="pill pill-btn" id="peek">👁 הצצה</button></div>' +
        '<div class="instr small">געו בשני חלקים כדי להחליף ביניהם (או גררו חלק למקומו)</div>' +
        '<div class="puz-wrap"><div class="puz" id="puz" style="--c:' + P.cols + ';--r:' + P.rows + '"></div><div class="puz-peek" id="peekImg" style="background-image:url(\'' + url + '\')"></div></div>' +
        '</div>';
      var grid = root.querySelector('#puz');
      var cells = [];
      for (i = 0; i < n; i++) {
        var cell = ui.h('<div class="pz" data-i="' + i + '"></div>');
        cell.style.backgroundImage = 'url("' + url + '")';
        cell.style.backgroundSize = (P.cols * 100) + '% ' + (P.rows * 100) + '%';
        grid.appendChild(cell); cells.push(cell);
      }
      function paint(i) {
        var v = order[i], cx = v % P.cols, cy = Math.floor(v / P.cols);
        cells[i].style.backgroundPosition = (cx / (P.cols - 1) * 100) + '% ' + (cy / (P.rows - 1) * 100) + '%';
        cells[i].classList.toggle('ok', v === i);
      }
      cells.forEach(function (c, k) { paint(k); });

      function swap(a, b) {
        var t = order[a]; order[a] = order[b]; order[b] = t;
        paint(a); paint(b); moves++; root.querySelector('#pm').textContent = moves;
        [a, b].forEach(function (k) { cells[k].classList.remove('pop'); void cells[k].offsetWidth; cells[k].classList.add('pop'); });
        if (order[a] === a || order[b] === b) { A.play('good'); } else A.play('swap');
        if (order.every(function (v, k) { return v === k; })) {
          grid.classList.add('solved'); A.play('win'); HK.fx.burstAt(grid, 40);
          timers.push(setTimeout(function () {
            var stars = moves <= n ? 3 : moves <= n * 1.6 ? 2 : 1;
            api.finish(stars, { text: 'הרכבת את "' + P.name + '" ב-' + moves + ' מהלכים!' });
          }, 1300));
        }
      }
      function idxAt(x, y) { var el = document.elementFromPoint(x, y); el = el && el.closest('.pz'); return el ? +el.dataset.i : null; }
      var down = null, wasSel = null;
      grid.addEventListener('pointerdown', function (e) {
        var i = idxAt(e.clientX, e.clientY); if (i == null) return;
        e.preventDefault();
        down = i; wasSel = sel;
        if (sel == null) { sel = i; cells[i].classList.add('sel'); A.play('tap'); }
      });
      grid.addEventListener('pointermove', function (e) {
        if (down == null) return;
        cells.forEach(function (c) { c.classList.remove('over'); });
        var i = idxAt(e.clientX, e.clientY); if (i != null && i !== down) cells[i].classList.add('over');
      });
      addEventListener('pointerup', up);
      function clearSel() { cells.forEach(function (c) { c.classList.remove('sel'); c.classList.remove('over'); }); sel = null; }
      function up(e) {
        if (down == null) return;
        var i = idxAt(e.clientX, e.clientY), d = down; down = null;
        cells.forEach(function (c) { c.classList.remove('over'); });
        if (i != null && i !== d) { clearSel(); swap(d, i); return; }
        if (i == null) return;
        if (wasSel != null && wasSel !== i) { clearSel(); swap(wasSel, i); }
        else if (wasSel === i) clearSel();
      }
      var peek = root.querySelector('#peekImg');
      root.querySelector('#peek').onclick = function () { peek.classList.add('show'); A.play('pop'); timers.push(setTimeout(function () { peek.classList.remove('show'); }, 1800)); };
      return function () { removeEventListener('pointerup', up); timers.forEach(clearTimeout); };
    }
  };
})(window.HK);
