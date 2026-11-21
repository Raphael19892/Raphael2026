/* ============================================================
   core.js — שמירת התקדמות, צלילים ומוזיקה, קריינות, אפקטים וחלונות
   ============================================================ */
window.HK = window.HK || {};
(function (HK) {
  'use strict';

  /* ================= שמירת התקדמות ================= */
  var KEY = 'hanukkah-kids-v1';
  function defaults() {
    return {
      name: '', best: {}, medals: {}, unlocked: {}, done: {}, lettersSeen: {},
      settings: { music: true, sfx: true, voice: true },
      created: Date.now(), certShown: false, welcomed: false
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var d = JSON.parse(raw), def = defaults();
      for (var k in def) if (!(k in d)) d[k] = def[k];
      for (k in def.settings) if (!(k in d.settings)) d.settings[k] = def.settings[k];
      return d;
    } catch (e) { return defaults(); }
  }
  var data = load();

  HK.store = {
    get data() { return data; },
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* פרטי/חסום */ } },
    reset: function () { data = defaults(); this.save(); },
    // רושם תוצאה. מחזיר כמה כוכבים חדשים נוספו לסך הכולל.
    record: function (key, stars) {
      var prev = data.best[key] || 0;
      if (stars > prev) { data.best[key] = stars; this.save(); return stars - prev; }
      return 0;
    },
    best: function (key) { return data.best[key] || 0; },
    totalStars: function () { var t = 0; for (var k in data.best) t += data.best[k]; return t; },
    medal: function (id) {
      if (data.medals[id]) return false;
      data.medals[id] = Date.now(); this.save(); return true;
    },
    hasMedal: function (id) { return !!data.medals[id]; },
    markDone: function (id) { var isNew = !data.done[id]; data.done[id] = true; this.save(); return isNew; },
    isDone: function (id) { return !!data.done[id]; },
    unlock: function (id) { data.unlocked[id] = true; this.save(); },
    isUnlocked: function (id) { return !!data.unlocked[id]; }
  };

  /* ================= צלילים (נוצרים בזמן אמת, בלי קבצים) ================= */
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
    return ctx;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function tone(freq, t0, dur, o) {
    o = o || {};
    var c = ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    var v = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.dest || sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function bell(m, t0, dur, vol, dest) {
    var f = mtof(m);
    tone(f, t0, dur, { vol: vol, dest: dest });
    tone(f * 2, t0, dur * 0.6, { vol: vol * 0.25, dest: dest });
    tone(f * 3.01, t0, dur * 0.3, { vol: vol * 0.08, dest: dest });
  }
  function noise(t0, dur, o) {
    o = o || {};
    var c = ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = o.q || 1.2;
    f.frequency.setValueAtTime(o.from || 800, t0); f.frequency.exponentialRampToValueAtTime(o.to || 3000, t0 + dur);
    var g = c.createGain(); g.gain.setValueAtTime(o.vol || 0.25, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t0);
  }

  var SFX = {
    tap: function (t) { tone(660, t, 0.08, { type: 'triangle', vol: 0.18, slide: 880 }); },
    pop: function (t) { tone(420, t, 0.12, { type: 'sine', vol: 0.3, slide: 900 }); },
    good: function (t) { [72, 76, 79, 84].forEach(function (m, i) { bell(m, t + i * 0.07, 0.4, 0.2); }); },
    bad: function (t) { tone(220, t, 0.18, { type: 'triangle', vol: 0.22, slide: 160 }); tone(180, t + 0.12, 0.25, { type: 'triangle', vol: 0.2, slide: 130 }); },
    coin: function (t) { tone(988, t, 0.08, { type: 'square', vol: 0.09 }); tone(1319, t + 0.07, 0.22, { type: 'square', vol: 0.09 }); },
    star: function (t) { [84, 88, 91, 96].forEach(function (m, i) { bell(m, t + i * 0.05, 0.5, 0.12); }); },
    flip: function (t) { noise(t, 0.12, { from: 1500, to: 4000, vol: 0.15 }); },
    whoosh: function (t) { noise(t, 0.6, { from: 300, to: 2400, vol: 0.2, q: 0.8 }); },
    light: function (t) { noise(t, 0.25, { from: 2500, to: 600, vol: 0.18, q: 0.7 }); bell(81, t + 0.1, 0.5, 0.12); },
    jump: function (t) { tone(380, t, 0.18, { type: 'square', vol: 0.08, slide: 760 }); },
    hurt: function (t) { tone(300, t, 0.3, { type: 'sawtooth', vol: 0.1, slide: 90 }); },
    win: function (t) {
      var seq = [67, 72, 76, 79, 76, 79, 84];
      seq.forEach(function (m, i) { bell(m, t + i * 0.11, 0.6, 0.2); });
      tone(mtof(48), t, 1.2, { type: 'triangle', vol: 0.15 });
    },
    unlock: function (t) { [79, 83, 86, 91].forEach(function (m, i) { bell(m, t + i * 0.09, 0.7, 0.16); }); },
    swap: function (t) { tone(520, t, 0.1, { type: 'triangle', vol: 0.18, slide: 340 }); }
  };

  HK.audio = {
    unlock: ensureAudio,
    play: function (name) {
      if (!data.settings.sfx) return;
      if (!ensureAudio() || !SFX[name]) return;
      try { SFX[name](ctx.currentTime + 0.01); } catch (e) { }
    }
  };

  /* ---------- מוזיקת רקע חגיגית ועדינה (לחן מקורי) ---------- */
  // שמיניות: מספר = תו MIDI, 0 = שקט
  var MELODY = [
    74, 0, 78, 81, 79, 78, 76, 0, 74, 76, 78, 79, 76, 0, 0, 0,
    71, 0, 74, 78, 76, 74, 73, 0, 71, 73, 74, 76, 74, 0, 0, 0,
    74, 0, 78, 81, 83, 81, 79, 0, 78, 79, 81, 78, 76, 0, 0, 0,
    79, 78, 76, 74, 73, 74, 76, 0, 78, 76, 73, 76, 74, 0, 0, 0
  ];
  var CHORDS = [[50, 57, 62], [55, 59, 62], [47, 54, 62], [45, 52, 57], [50, 57, 62], [55, 59, 62], [43, 50, 59], [45, 52, 57]];
  var music = { on: false, step: 0, next: 0, timer: null };
  var EIGHTH = 60 / 92 / 2;
  function scheduleMusic() {
    while (music.next < ctx.currentTime + 0.25) {
      var s = music.step % MELODY.length, m = MELODY[s];
      if (m) bell(m, music.next, EIGHTH * 2.2, 0.11, musicGain);
      if (s % 8 === 0) {
        var ch = CHORDS[(s / 8) % CHORDS.length];
        ch.forEach(function (n, i) { tone(mtof(n), music.next + i * 0.02, EIGHTH * 7.5, { type: 'sine', vol: i === 0 ? 0.09 : 0.045, attack: 0.25, dest: musicGain }); });
      }
      if (s % 4 === 2) tone(mtof(86 + (s % 16 === 2 ? 0 : 2)), music.next, 0.3, { vol: 0.015, dest: musicGain });
      music.next += EIGHTH; music.step++;
    }
  }
  HK.music = {
    start: function () {
      if (!data.settings.music || music.on) return;
      if (!ensureAudio()) return;
      music.on = true; music.next = ctx.currentTime + 0.1;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
      music.timer = setInterval(scheduleMusic, 90);
    },
    stop: function () {
      if (!music.on) return;
      music.on = false; clearInterval(music.timer);
      if (ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    },
    duck: function (d) { if (ctx && musicGain && music.on) musicGain.gain.setTargetAtTime(d ? 0.15 : 0.55, ctx.currentTime, 0.3); }
  };
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); HK.voice.stop(); }
    else ctx.resume();
  });

  /* ================= קריינות בעברית ================= */
  var heVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices();
    heVoice = vs.filter(function (v) { return /^(he|iw)/i.test(v.lang); })[0] || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function clean(t) {
    return String(t)
      .replace(/<[^>]+>/g, ' ')
      .replace(/[֑-ׇ]/g, '')       // הסרת ניקוד וטעמים לקריאה טבעית
      .replace(/ה'/g, 'השם').replace(/אלוקינו/g, 'אלוקינו')
      .replace(/[🕎⭐🏅🎉✨🔥🍩🪙]/g, '');
  }
  // באפליקציית האנדרואיד: קריינות דרך מנוע הדיבור של הטלפון (גשר AndroidTTS)
  var nativeEnd = null;
  HK.voice = {
    available: function () { return !!(window.AndroidTTS || window.speechSynthesis); },
    hasHebrew: function () { if (window.AndroidTTS) { try { return !!AndroidTTS.hasHebrew(); } catch (e) { return false; } } return !!heVoice; },
    _end: function () { HK.music.duck(false); var f = nativeEnd; nativeEnd = null; if (f) f(); },
    speak: function (text, onend) {
      if (data.settings.voice && window.AndroidTTS) {
        try { nativeEnd = onend || null; HK.music.duck(true); AndroidTTS.speak(clean(text)); return; } catch (e) { }
      }
      if (!data.settings.voice || !window.speechSynthesis) { if (onend) onend(); return; }
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(clean(text));
        u.lang = 'he-IL'; if (heVoice) u.voice = heVoice;
        u.rate = 0.92; u.pitch = 1.1;
        HK.music.duck(true);
        u.onend = u.onerror = function () { HK.music.duck(false); if (onend) onend(); };
        speechSynthesis.speak(u);
      } catch (e) { if (onend) onend(); }
    },
    stop: function () { if (window.AndroidTTS) { try { AndroidTTS.stop(); } catch (e) { } nativeEnd = null; } if (window.speechSynthesis) speechSynthesis.cancel(); HK.music.duck(false); }
  };

  /* ================= אפקטים: ניצוצות וקונפטי ================= */
  var fxCanvas, fxCtx, parts = [], fxRunning = false, DPR = 1;
  function fxInit() {
    fxCanvas = document.getElementById('fx');
    fxCtx = fxCanvas.getContext('2d');
    function rs() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      fxCanvas.width = innerWidth * DPR; fxCanvas.height = innerHeight * DPR;
    }
    rs(); addEventListener('resize', rs);
  }
  function fxLoop() {
    var c = fxCtx; c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= 1 / 60; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      var a = Math.min(1, p.life / p.max * 2);
      c.save(); c.globalAlpha = a; c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.color;
      if (p.kind === 'star') {
        c.beginPath();
        for (var k = 0; k < 10; k++) { var r = k % 2 ? p.size * 0.45 : p.size, an = Math.PI / 5 * k; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        c.closePath(); c.fill();
      } else if (p.kind === 'rect') { c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else { c.beginPath(); c.arc(0, 0, p.size / 2, 0, 6.283); c.fill(); }
      c.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop);
    else { fxRunning = false; c.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function addPart(p) { parts.push(p); if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); } }
  var GOLDS = ['#ffe58a', '#f6c445', '#fff3b0', '#ffffff', '#7cc4ff'];
  HK.fx = {
    init: fxInit,
    burst: function (x, y, n, opts) {
      opts = opts || {};
      n = n || 18;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, sp = (opts.speed || 4) * (0.4 + Math.random());
        addPart({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, g: 0.08, life: 0.9 + Math.random() * 0.5, max: 1.4, size: 6 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, color: (opts.colors || GOLDS)[i % (opts.colors || GOLDS).length], kind: Math.random() < 0.6 ? 'star' : 'dot' });
      }
    },
    burstAt: function (el, n) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      this.burst(r.left + r.width / 2, r.top + r.height / 2, n);
    },
    confetti: function () {
      var cols = ['#f6c445', '#ffffff', '#7cc4ff', '#2a5bd7', '#ffe58a', '#ff8fab'];
      for (var i = 0; i < 120; i++) {
        addPart({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, g: 0.04, life: 3 + Math.random() * 1.5, max: 4.5, size: 8 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, color: cols[i % cols.length], kind: i % 3 ? 'rect' : 'star' });
      }
    }
  };

  /* ================= עזרי ממשק ================= */
  function h(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

  function toast(text, ms) {
    var t = h('<div class="toast">' + text + '</div>');
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, ms || 2200);
  }

  // חלון מודאלי כללי
  function modal(o) {
    var m = h('<div class="modal-back"><div class="modal ' + (o.cls || '') + '">' +
      (o.icon ? '<div class="modal-icon">' + o.icon + '</div>' : '') +
      (o.title ? '<h2>' + o.title + '</h2>' : '') +
      (o.html || '') +
      '<div class="modal-btns"></div></div></div>');
    var box = m.querySelector('.modal-btns');
    (o.buttons || [{ label: 'סגור' }]).forEach(function (b) {
      var btn = h('<button class="btn ' + (b.cls || 'btn-gold') + '">' + b.label + '</button>');
      btn.onclick = function () {
        HK.audio.play('tap');
        if (b.keep) { if (b.action) b.action(m); return; }
        close(); if (b.action) b.action();
      };
      box.appendChild(btn);
    });
    function close() { m.classList.remove('show'); setTimeout(function () { m.remove(); }, 300); }
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('show'); });
    m.close = close;
    return m;
  }

  // חלון ניצחון עם כוכבים מונפשים
  function reward(o) {
    var stars = o.stars || 0, s = '';
    for (var i = 0; i < 3; i++) s += '<span class="rstar ' + (i < stars ? 'on' : '') + '" style="animation-delay:' + (0.35 + i * 0.3) + 's">' + HK.art.icons.star() + '</span>';
    var html = '<div class="rstars">' + s + '</div>' + (o.text ? '<p class="rtext">' + o.text + '</p>' : '');
    if (o.gained) html += '<p class="rgain">+' + o.gained + ' ⭐ נוספו לאוסף שלך!</p>';
    if (o.medal) html += '<div class="rmedal"><span class="medal-ico">🏅</span> קיבלת מדליה: <b>' + o.medal + '</b></div>';
    if (o.unlocked) html += '<div class="runlock">🔓 ' + o.unlocked + '</div>';
    var m = modal({ title: o.title || 'כל הכבוד!', html: html, buttons: o.buttons, cls: 'reward' });
    HK.audio.play('win');
    for (i = 0; i < stars; i++) (function (k) { setTimeout(function () { HK.audio.play('star'); var el = m.querySelectorAll('.rstar')[k]; HK.fx.burstAt(el, 14); }, 450 + k * 300); })(i);
    if (stars >= 2 || o.medal) setTimeout(function () { HK.fx.confetti(); }, 300);
    if (o.say) HK.voice.speak(o.say);
    setTimeout(function () { HK.ui.refreshHud(); HK.app && HK.app.checkCertificate && HK.app.checkCertificate(); }, 1600);
    return m;
  }

  HK.ui = { h: h, shuffle: shuffle, toast: toast, modal: modal, reward: reward, vibrate: vibrate, refreshHud: function () { } };
})(window.HK);
