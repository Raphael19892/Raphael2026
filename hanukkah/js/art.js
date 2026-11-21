/* ============================================================
   art.js — כל האיורים של האפליקציה, מצוירים כ-SVG בקוד.
   אין קבצי תמונה: הכול נטען מיד ועובד גם בלי אינטרנט.
   ============================================================ */
window.HK = window.HK || {};
(function (HK) {
  'use strict';

  var uidN = 0;
  function uid() { uidN += 1; return 'k' + uidN + Math.random().toString(36).slice(2, 6); }

  // מחולל מספרים אקראיים קבוע (כדי שאיור ייראה אותו דבר בכל פעם)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // הגדרות צבע משותפות. § מוחלף במזהה ייחודי לכל SVG.
  var DEFS =
    '<defs>' +
    '<linearGradient id="§gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f6c445"/><stop offset="1" stop-color="#b07d12"/></linearGradient>' +
    '<linearGradient id="§goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b07d12"/><stop offset=".35" stop-color="#ffe58a"/><stop offset=".6" stop-color="#f6c445"/><stop offset="1" stop-color="#9c6b0c"/></linearGradient>' +
    '<linearGradient id="§flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset=".35" stop-color="#ffa62b"/><stop offset=".7" stop-color="#ffe066"/><stop offset="1" stop-color="#fffbe6"/></linearGradient>' +
    '<radialGradient id="§glow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".85"/><stop offset=".4" stop-color="#ffc94d" stop-opacity=".35"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="§bigglow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="§sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040a26"/><stop offset=".6" stop-color="#13235e"/><stop offset="1" stop-color="#2c4597"/></linearGradient>' +
    '<linearGradient id="§dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a6b"/><stop offset=".55" stop-color="#5b5fb3"/><stop offset="1" stop-color="#f2a65a"/></linearGradient>' +
    '<linearGradient id="§day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fa3ff"/><stop offset="1" stop-color="#bfe3ff"/></linearGradient>' +
    '<linearGradient id="§wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a0663a"/><stop offset="1" stop-color="#6b3f20"/></linearGradient>' +
    '<linearGradient id="§stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e8c4"/><stop offset="1" stop-color="#d6bd8a"/></linearGradient>' +
    '<linearGradient id="§hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6b4f"/><stop offset="1" stop-color="#173d2c"/></linearGradient>' +
    '<linearGradient id="§hillN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2f6e"/><stop offset="1" stop-color="#0c1640"/></linearGradient>' +
    '<radialGradient id="§donut" cx=".45" cy=".4"><stop offset="0" stop-color="#f7c47a"/><stop offset=".75" stop-color="#d98a3d"/><stop offset="1" stop-color="#a65a22"/></radialGradient>' +
    '<radialGradient id="§coin" cx=".4" cy=".35"><stop offset="0" stop-color="#fff6c2"/><stop offset=".55" stop-color="#f6c445"/><stop offset="1" stop-color="#b07d12"/></radialGradient>' +
    '<linearGradient id="§clay" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a4b25"/><stop offset=".4" stop-color="#d0864a"/><stop offset="1" stop-color="#7a3f1d"/></linearGradient>' +
    '</defs>';

  function wrap(vb, body, extra) {
    var id = uid();
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" ' + (extra || '') + '>' + DEFS + body + '</svg>';
    return s.replace(/§/g, id);
  }

  /* ---------- אבני בניין ---------- */
  function flame(x, y, s, cls) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')"><g class="' + (cls || 'flicker') + '">' +
      '<circle cx="0" cy="-10" r="26" fill="url(#§glow)"/>' +
      '<path d="M0,-30 C8,-18 11,-8 6,0 C3,4 -3,4 -6,0 C-11,-8 -8,-18 0,-30Z" fill="url(#§flame)"/>' +
      '<path d="M0,-16 C3,-10 4,-5 2,-1 C1,1 -1,1 -2,-1 C-4,-5 -3,-10 0,-16Z" fill="#fff" opacity=".85"/>' +
      '</g></g>';
  }

  function starPath(cx, cy, r1, r2, n) {
    n = n || 5; r2 = r2 || r1 * 0.45;
    var d = '';
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? r2 : r1, a = Math.PI / n * i - Math.PI / 2;
      d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }

  function starsField(seed, n, w, h, maxY) {
    var r = rng(seed), s = '';
    for (var i = 0; i < n; i++) {
      var x = r() * w, y = r() * (maxY || h), rr = 0.6 + r() * 1.8;
      s += '<circle class="twk" style="animation-delay:' + (r() * 3).toFixed(2) + 's" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="#fff" opacity="' + (0.5 + r() * 0.5).toFixed(2) + '"/>';
    }
    return s;
  }

  function moon(x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 2.2) + '" fill="url(#§bigglow)"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff5d6"/>' +
      '<circle cx="' + (x + r * 0.45) + '" cy="' + (y - r * 0.2) + '" r="' + r * 0.9 + '" fill="#13235e" opacity=".0"/>' +
      '<circle cx="' + (x - r * 0.3) + '" cy="' + (y + r * 0.2) + '" r="' + r * 0.18 + '" fill="#efe0b0"/>' +
      '<circle cx="' + (x + r * 0.25) + '" cy="' + (y - r * 0.3) + '" r="' + r * 0.12 + '" fill="#efe0b0"/>';
  }

  // דמות פשוטה וחמודה
  function person(x, y, o) {
    o = o || {};
    var sc = o.s || 1, robe = o.robe || '#3b6fd8', skin = o.skin || '#f1c27d', g = '';
    g += '<g transform="translate(' + x + ',' + y + ') scale(' + (o.flip ? -sc : sc) + ',' + sc + ')">';
    g += '<ellipse cx="0" cy="2" rx="18" ry="4" fill="#000" opacity=".2"/>';
    g += '<path d="M-16,0 L-11,-46 Q0,-52 11,-46 L16,0Z" fill="' + robe + '"/>';
    if (o.belt) g += '<rect x="-12" y="-26" width="24" height="4" fill="' + o.belt + '"/>';
    if (o.stripe) g += '<path d="M-3,-48 L-4,0 M3,-48 L4,0" stroke="' + o.stripe + '" stroke-width="2.5"/>';
    // ידיים
    if (o.armUp) g += '<path d="M10,-40 L22,-62" stroke="' + robe + '" stroke-width="7" stroke-linecap="round"/><circle cx="22" cy="-63" r="4" fill="' + skin + '"/>';
    else g += '<path d="M10,-40 L16,-22" stroke="' + robe + '" stroke-width="7" stroke-linecap="round"/><circle cx="16" cy="-20" r="4" fill="' + skin + '"/>';
    g += '<path d="M-10,-40 L-16,-22" stroke="' + robe + '" stroke-width="7" stroke-linecap="round"/><circle cx="-16" cy="-20" r="4" fill="' + skin + '"/>';
    if (o.hold === 'shield') g += '<circle cx="-18" cy="-24" r="11" fill="url(#§gold)" stroke="#8a5d0b" stroke-width="2"/><path d="' + starPath(-18, -24, 6, 2.6, 6) + '" fill="#1d3b8f"/>';
    if (o.hold === 'spear') g += '<path d="M16,-80 L16,-8" stroke="#6b3f20" stroke-width="3"/><path d="M16,-90 L12,-78 L20,-78Z" fill="#cfd6e4"/>';
    if (o.hold === 'flag') g += '<path d="M22,-95 L22,-60" stroke="#6b3f20" stroke-width="3"/><path d="M22,-95 L44,-89 L22,-82Z" fill="#7cc4ff"/>';
    if (o.hold === 'jar') g += '<g transform="translate(-18,-26) scale(.22)">' + jarBody() + '</g>';
    if (o.hold === 'candle') g += '<rect x="13" y="-34" width="6" height="14" fill="#fff"/>' + flame(16, -34, 0.35);
    // ראש
    g += '<circle cx="0" cy="-58" r="12" fill="' + skin + '"/>';
    g += '<circle cx="-4" cy="-59" r="1.6" fill="#2b1b0f"/><circle cx="4" cy="-59" r="1.6" fill="#2b1b0f"/>';
    g += '<path d="M-4,-53 Q0,-50 4,-53" stroke="#a0522d" stroke-width="1.4" fill="none"/>';
    if (o.beard) g += '<path d="M-11,-56 Q-12,-38 0,-' + (o.beard === 'long' ? 32 : 40) + ' Q12,-38 11,-56 Q6,-50 0,-50 Q-6,-50 -11,-56Z" fill="' + (o.beardColor || '#ececec') + '"/><path d="M-4,-52 Q0,-50 4,-52" stroke="#a0522d" stroke-width="1.2" fill="none"/>';
    if (o.helmet) g += '<path d="M-13,-60 Q0,-80 13,-60Z" fill="#b9c3d6"/><path d="M-2,-74 Q10,-90 18,-74 Q8,-80 -2,-74Z" fill="#d33"/>';
    else if (o.turban) g += '<path d="M-13,-62 Q0,-78 13,-62 Q0,-66 -13,-62Z" fill="' + o.turban + '"/>';
    else if (o.kippah) g += '<path d="M-8,-68 Q0,-74 8,-68Z" fill="' + o.kippah + '"/>';
    else if (o.hair) g += '<path d="M-12,-60 Q-10,-74 0,-72 Q10,-74 12,-60 Q6,-68 0,-67 Q-6,-68 -12,-60Z" fill="' + o.hair + '"/>';
    if (o.longHair) g += '<path d="M-12,-60 Q-16,-44 -10,-40 L-9,-58Z M12,-60 Q16,-44 10,-40 L9,-58Z" fill="' + o.longHair + '"/><path d="M-12,-60 Q-10,-74 0,-72 Q10,-74 12,-60 Q6,-68 0,-67 Q-6,-68 -12,-60Z" fill="' + o.longHair + '"/>';
    g += '</g>';
    return g;
  }

  function jarBody() {
    // פך שמן (ציור בגודל ~100x100)
    return '<path d="M38,14 L62,14 L60,24 Q78,30 80,56 Q80,86 50,90 Q20,86 20,56 Q22,30 40,24Z" fill="url(#§clay)"/>' +
      '<rect x="36" y="8" width="28" height="8" rx="3" fill="#6b3a1a"/>' +
      '<path d="M22,50 Q50,58 78,50" stroke="#f3c27a" stroke-width="3" fill="none" opacity=".7"/>' +
      '<circle cx="50" cy="66" r="9" fill="#c0392b"/><path d="M45,66 L55,66 M50,61 L50,71" stroke="#ffd" stroke-width="2"/>' +
      '<ellipse cx="38" cy="44" rx="5" ry="12" fill="#fff" opacity=".18"/>';
  }

  function hills(color, y, seed, w) {
    var r = rng(seed), d = 'M0,' + (y + 30), x = 0;
    while (x < w) {
      var nx = x + 60 + r() * 60, cy = y - r() * 40;
      d += ' Q' + ((x + nx) / 2).toFixed(0) + ',' + cy.toFixed(0) + ' ' + nx.toFixed(0) + ',' + (y + r() * 15).toFixed(0);
      x = nx;
    }
    return '<path d="' + d + ' L' + w + ',400 L0,400Z" fill="' + color + '"/>';
  }

  function oliveTree(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + (s || 1) + ')">' +
      '<path d="M-3,0 Q-6,-18 0,-30 L4,-30 Q2,-18 5,0Z" fill="#6b4a2b"/>' +
      '<ellipse cx="0" cy="-38" rx="22" ry="14" fill="#4f7a3a"/><ellipse cx="-12" cy="-32" rx="12" ry="9" fill="#5d8c45"/><ellipse cx="12" cy="-34" rx="12" ry="9" fill="#456c33"/>' +
      '<circle cx="-6" cy="-36" r="2" fill="#2d3b1c"/><circle cx="8" cy="-40" r="2" fill="#2d3b1c"/><circle cx="2" cy="-30" r="2" fill="#2d3b1c"/></g>';
  }

  function house(x, y, w, h, o) {
    o = o || {};
    var s = '<g transform="translate(' + x + ',' + y + ')">' +
      '<rect x="0" y="' + (-h) + '" width="' + w + '" height="' + h + '" fill="' + (o.wall || '#e9d6ac') + '"/>' +
      '<rect x="-3" y="' + (-h - 6) + '" width="' + (w + 6) + '" height="8" fill="' + (o.roof || '#c9b07a') + '"/>';
    if (o.window) {
      var wx = w / 2 - 14, wy = -h + 12;
      s += '<rect x="' + wx + '" y="' + wy + '" width="28" height="24" rx="3" fill="' + (o.lit ? '#ffcf5c' : '#26346e') + '"/>';
      if (o.lit) s += '<circle cx="' + (wx + 14) + '" cy="' + (wy + 12) + '" r="22" fill="url(#§glow)"/>' + miniChanukiah(wx + 14, wy + 20, 0.22, 8);
    }
    s += '<rect x="' + (w / 2 - 6) + '" y="-16" width="12" height="16" rx="5" fill="#7a4b26"/></g>';
    return s;
  }

  function miniChanukiah(cx, cy, s, litCount) {
    var g = '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')">';
    g += '<path d="M-80,0 L80,0" stroke="#f6c445" stroke-width="6"/><path d="M0,0 L0,30 M-18,34 L18,34" stroke="#f6c445" stroke-width="6"/>';
    for (var i = 0; i < 8; i++) {
      var x = i < 4 ? 80 - i * 20 : -20 - (i - 4) * 20;
      g += '<rect x="' + (x - 4) + '" y="-22" width="8" height="22" fill="#fff"/>';
      if (i < litCount) g += '<path d="M' + x + ',-36 Q' + (x + 6) + ',-28 ' + x + ',-22 Q' + (x - 6) + ',-28 ' + x + ',-36Z" fill="#ffb020"/>';
    }
    g += '<rect x="-4" y="-40" width="8" height="22" fill="#fff"/><path d="M0,-54 Q6,-46 0,-40 Q-6,-46 0,-54Z" fill="#ffb020"/>';
    return g + '</g>';
  }

  /* ---------- החנוכייה הגדולה ---------- */
  // slots: 0 = הנר הימני ביותר. opts.present[i] אם יש נר, opts.lit[i] אם דולק
  var CANDLE_COLORS = ['#5aa9ff', '#ffffff', '#ffd166', '#7cc4ff', '#ff8fab', '#a0e7a0', '#c9a7ff', '#ffffff'];
  function slotX(i) { return i < 4 ? 360 - i * 40 : 160 - (i - 4) * 40; }

  function chanukiah(opts) {
    opts = opts || {};
    var present = opts.present || [1, 1, 1, 1, 1, 1, 1, 1];
    var lit = opts.lit || [1, 1, 1, 1, 1, 1, 1, 1];
    var g = '';
    g += '<ellipse cx="200" cy="150" rx="210" ry="130" fill="url(#§bigglow)" class="aura" opacity="' + (opts.aura === false ? 0 : 1) + '"/>';
    // קשתות דקורטיביות
    for (var k = 0; k < 4; k++) {
      var d = 40 + k * 40;
      g += '<path d="M' + (200 - d) + ',172 Q200,' + (172 + d * 1.15) + ' ' + (200 + d) + ',172" stroke="url(#§goldH)" stroke-width="7" fill="none"/>';
    }
    g += '<rect x="192" y="120" width="16" height="185" rx="6" fill="url(#§goldH)"/>';
    g += '<path d="M140,318 L260,318 Q252,296 222,292 L178,292 Q148,296 140,318Z" fill="url(#§gold)"/>';
    g += '<rect x="30" y="166" width="340" height="12" rx="6" fill="url(#§goldH)"/>';
    // שמש
    g += '<path d="M184,92 L216,92 L211,110 L189,110Z" fill="url(#§gold)"/>';
    g += '<rect x="196" y="108" width="8" height="14" fill="url(#§goldH)"/>';
    // גביעים
    for (var i = 0; i < 8; i++) {
      var x = slotX(i);
      g += '<path d="M' + (x - 15) + ',150 L' + (x + 15) + ',150 L' + (x + 10) + ',168 L' + (x - 10) + ',168Z" fill="url(#§gold)"/>';
    }
    // נרות
    for (i = 0; i < 8; i++) {
      x = slotX(i);
      var col = CANDLE_COLORS[i];
      g += '<g class="cnd' + (present[i] ? '' : ' gone') + '" data-slot="' + i + '">' +
        '<rect x="' + (x - 18) + '" y="40" width="36" height="112" fill="transparent"/>' +
        '<rect x="' + (x - 7) + '" y="92" width="14" height="58" rx="3" fill="' + col + '"/>' +
        '<rect x="' + (x - 7) + '" y="92" width="4" height="58" fill="#fff" opacity=".35"/>' +
        '<path d="M' + (x - 7) + ',104 L' + (x + 7) + ',98 M' + (x - 7) + ',118 L' + (x + 7) + ',112 M' + (x - 7) + ',132 L' + (x + 7) + ',126" stroke="#fff" stroke-width="2" opacity=".35"/>' +
        '<path d="M' + x + ',92 L' + x + ',86" stroke="#333" stroke-width="2"/>' +
        '<g class="fl' + (present[i] && lit[i] ? ' on' : '') + '" data-f="' + i + '">' + flame(x, 88, 0.9) + '</g>' +
        '</g>';
    }
    // נר השמש
    g += '<g class="cnd shamash" data-slot="s">' +
      '<rect x="180" y="-10" width="40" height="104" fill="transparent"/>' +
      '<rect x="193" y="30" width="14" height="62" rx="3" fill="#fff8e1"/>' +
      '<rect x="193" y="30" width="4" height="62" fill="#fff" opacity=".5"/>' +
      '<path d="M200,30 L200,24" stroke="#333" stroke-width="2"/>' +
      '<g class="fl' + (opts.shamash === false ? '' : ' on') + '" data-f="s">' + flame(200, 26, 1) + '</g>' +
      '</g>';
    return wrap('-10 -40 420 370', g, 'class="chanukiah"');
  }

  /* ---------- אייקונים (100x100) ---------- */
  var icons = {
    dreidel: function (color, letter) {
      color = color || '#2a5bd7';
      return wrap('0 0 100 100',
        '<rect x="45" y="6" width="10" height="18" rx="4" fill="url(#§goldH)"/>' +
        '<path d="M22,24 L78,24 L78,62 L50,94 L22,62Z" fill="' + color + '"/>' +
        '<path d="M22,24 L40,24 L40,62 L50,94 L22,62Z" fill="#fff" opacity=".18"/>' +
        '<path d="M22,62 L78,62" stroke="#fff" stroke-width="2" opacity=".4"/>' +
        '<text x="56" y="54" font-size="30" font-weight="700" text-anchor="middle" fill="#ffe58a" font-family="Arial,sans-serif">' + (letter || 'ג') + '</text>');
    },
    sufganiya: function () {
      return wrap('0 0 100 100',
        '<ellipse cx="50" cy="82" rx="36" ry="6" fill="#000" opacity=".2"/>' +
        '<ellipse cx="50" cy="58" rx="38" ry="28" fill="url(#§donut)"/>' +
        '<path d="M16,52 Q22,30 50,30 Q78,30 84,52 Q74,44 66,48 Q58,40 50,46 Q40,40 32,48 Q24,44 16,52Z" fill="#fffdf6"/>' +
        '<circle cx="28" cy="40" r="1.5" fill="#fff"/><circle cx="70" cy="38" r="1.5" fill="#fff"/>' +
        '<path d="M44,36 Q50,24 58,34 Q56,42 50,42 Q44,42 44,36Z" fill="#d7263d"/><circle cx="52" cy="33" r="2" fill="#ff8fa3"/>');
    },
    coin: function () {
      return wrap('0 0 100 100',
        '<circle cx="50" cy="52" r="40" fill="#9c6b0c"/><circle cx="50" cy="48" r="40" fill="url(#§coin)"/>' +
        '<circle cx="50" cy="48" r="31" fill="none" stroke="#b07d12" stroke-width="3"/>' +
        '<path d="M30,52 L70,52 M50,52 L50,66 M42,68 L58,68 M30,52 L30,40 M36,52 L36,40 M42,52 L42,40 M58,52 L58,40 M64,52 L64,40 M70,52 L70,40 M50,52 L50,34" stroke="#9c6b0c" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="36" cy="30" rx="10" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 36 30)"/>');
    },
    jar: function () { return wrap('0 0 100 100', jarBody()); },
    latke: function () {
      return wrap('0 0 100 100',
        '<ellipse cx="50" cy="70" rx="42" ry="10" fill="#e8eef9"/>' +
        '<path d="M14,62 Q12,44 32,40 Q46,32 64,38 Q86,42 86,60 Q80,72 50,72 Q20,72 14,62Z" fill="#c98a2e"/>' +
        '<path d="M22,56 Q34,46 48,50 M54,46 Q66,42 76,52 M32,62 Q48,58 64,62" stroke="#8a5a1a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M36,36 Q46,26 58,32" stroke="#ffd88a" stroke-width="3" fill="none"/>');
    },
    candle: function () {
      return wrap('0 0 100 100',
        '<rect x="40" y="38" width="20" height="54" rx="4" fill="#7cc4ff"/><rect x="40" y="38" width="6" height="54" fill="#fff" opacity=".4"/>' +
        '<path d="M50,38 L50,32" stroke="#333" stroke-width="2"/>' + flame(50, 34, 0.9));
    },
    star: function () {
      return wrap('0 0 100 100', '<path d="' + starPath(50, 52, 44, 20) + '" fill="url(#§gold)" stroke="#b07d12" stroke-width="3" stroke-linejoin="round"/><path d="' + starPath(44, 44, 10, 4) + '" fill="#fff" opacity=".5"/>');
    },
    olive: function () {
      return wrap('0 0 100 100',
        '<path d="M14,86 Q50,50 88,16" stroke="#6b4a2b" stroke-width="4" fill="none"/>' +
        '<ellipse cx="34" cy="56" rx="16" ry="6" fill="#5d8c45" transform="rotate(-40 34 56)"/>' +
        '<ellipse cx="66" cy="24" rx="16" ry="6" fill="#5d8c45" transform="rotate(-40 66 24)"/>' +
        '<ellipse cx="60" cy="52" rx="16" ry="6" fill="#4f7a3a" transform="rotate(30 60 52)"/>' +
        '<ellipse cx="44" cy="70" rx="10" ry="13" fill="#2f4a1f"/><ellipse cx="62" cy="38" rx="9" ry="12" fill="#3f5f26"/>' +
        '<ellipse cx="41" cy="65" rx="3" ry="5" fill="#fff" opacity=".3"/>');
    },
    torah: function () {
      return wrap('0 0 100 100',
        '<rect x="16" y="14" width="12" height="72" rx="6" fill="url(#§wood)"/><rect x="72" y="14" width="12" height="72" rx="6" fill="url(#§wood)"/>' +
        '<rect x="26" y="20" width="48" height="60" fill="#fdf3d8"/>' +
        '<path d="M32,32 L68,32 M32,40 L68,40 M32,48 L68,48 M32,56 L68,56 M32,64 L60,64" stroke="#8a7a5a" stroke-width="2.5"/>' +
        '<circle cx="22" cy="12" r="5" fill="url(#§gold)"/><circle cx="78" cy="12" r="5" fill="url(#§gold)"/>');
    },
    shield: function () {
      return wrap('0 0 100 100',
        '<path d="M50,8 L86,20 Q86,64 50,92 Q14,64 14,20Z" fill="url(#§gold)" stroke="#9c6b0c" stroke-width="3"/>' +
        '<path d="' + starPath(50, 46, 22, 10, 6) + '" fill="#1d3b8f"/>');
    },
    menorah: function () { return chanukiah(); },
    davidstar: function () {
      return wrap('0 0 100 100', '<path d="M50,10 L86,72 L14,72Z M50,90 L14,28 L86,28Z" fill="none" stroke="url(#§gold)" stroke-width="8" stroke-linejoin="round"/>');
    },
    flame: function () { return wrap('-40 -60 80 80', flame(0, 10, 1.6)); }
  };

  /* ---------- סצנות (400x300) ---------- */
  function sceneNight(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="url(#§sky)"/>' + starsField(7, 45, 400, 300, 170) + moon(330, 60, 24);
    g += hills('#1a2a66', 210, 3, 400);
    g += house(30, 260, 90, 80, { window: 1, lit: 1 }) + house(140, 250, 110, 100, { window: 1, lit: 1, wall: '#efdfb8' }) + house(270, 262, 100, 70, { window: 1, lit: 1, wall: '#e2cb98' });
    g += '<rect y="258" width="400" height="42" fill="#0d1a4a"/>';
    g += '<path d="M0,262 L400,262" stroke="#2a3f8f" stroke-width="3"/>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function templeBuilding(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="-110" y="-20" width="220" height="20" fill="url(#§stone)"/>' +
      '<rect x="-90" y="-80" width="180" height="62" fill="url(#§stone)"/>' +
      '<rect x="-40" y="-150" width="80" height="72" fill="#f9ecd0"/>' +
      '<rect x="-46" y="-156" width="92" height="8" fill="url(#§gold)"/>' +
      '<rect x="-96" y="-86" width="192" height="8" fill="url(#§gold)"/>' +
      '<path d="M-14,-78 L-14,-110 Q0,-124 14,-110 L14,-78Z" fill="#6b3f20"/>' +
      '<rect x="-60" y="-70" width="10" height="44" fill="#e7d3a4"/><rect x="50" y="-70" width="10" height="44" fill="#e7d3a4"/>' +
      '<rect x="-80" y="-70" width="10" height="44" fill="#e7d3a4"/><rect x="70" y="-70" width="10" height="44" fill="#e7d3a4"/>' +
      '<path d="M-40,-158 L-34,-166 L-28,-158 M-10,-158 L-4,-166 L2,-158 M20,-158 L26,-166 L32,-158" stroke="#f6c445" stroke-width="3" fill="none"/>' +
      '</g>';
  }

  function sceneTemple(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="url(#§' + (o.night ? 'sky' : 'dusk') + ')"/>';
    if (o.night) g += starsField(11, 40, 400, 300, 140) + moon(60, 50, 18);
    else g += '<circle cx="320" cy="210" r="40" fill="#ffd27a" opacity=".8"/>';
    g += hills('#6d5a8c', 200, 5, 400) + templeBuilding(200, 230, 1);
    g += hills(o.night ? '#16285e' : '#3d6a4a', 245, 9, 400);
    g += oliveTree(40, 280, 1) + oliveTree(360, 284, 0.9);
    if (o.glow) g += '<circle cx="200" cy="120" r="90" fill="url(#§bigglow)"/>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function templeMenorah(cx, cy, s, litAll) {
    var g = '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')">';
    if (litAll) g += '<ellipse cx="0" cy="-60" rx="150" ry="80" fill="url(#§bigglow)"/>';
    for (var k = 1; k <= 3; k++) {
      var d = k * 30;
      g += '<path d="M' + (-d) + ',-70 L' + (-d) + ',-40 Q' + (-d) + ',' + (-40 + d) + ' 0,' + (-40 + d) + ' Q' + d + ',' + (-40 + d) + ' ' + d + ',-40 L' + d + ',-70" stroke="url(#§goldH)" stroke-width="7" fill="none"/>';
    }
    g += '<rect x="-5" y="-75" width="10" height="125" fill="url(#§goldH)"/>';
    g += '<path d="M-40,58 L40,58 L26,46 L-26,46Z" fill="url(#§gold)"/>';
    for (k = -3; k <= 3; k++) {
      g += '<path d="M' + (k * 30 - 9) + ',-80 L' + (k * 30 + 9) + ',-80 L' + (k * 30 + 5) + ',-70 L' + (k * 30 - 5) + ',-70Z" fill="url(#§gold)"/>';
      if (litAll) g += flame(k * 30, -80, 0.6);
    }
    return g + '</g>';
  }

  function sceneTempleInside(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="' + (o.dark ? '#1a1430' : '#3a2a1a') + '"/>';
    g += '<rect x="0" y="0" width="400" height="300" fill="url(#§wood)" opacity=".35"/>';
    g += '<rect x="30" y="20" width="40" height="230" fill="#c9b07a" opacity=".5"/><rect x="330" y="20" width="40" height="230" fill="#c9b07a" opacity=".5"/>';
    g += '<rect y="250" width="400" height="50" fill="#5a4026"/>';
    g += templeMenorah(200, 190, 1, o.lit);
    if (o.kohen) g += person(320, 262, { robe: '#ffffff', stripe: '#7cc4ff', turban: '#ffffff', beard: 1, beardColor: '#6b4a2b', hold: 'jar' });
    if (o.jar) g += '<g transform="translate(70,200) scale(.55)">' + jarBody() + '</g><circle cx="97" cy="228" r="40" fill="url(#§glow)"/>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function sceneGreeks(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="url(#§day)"/><circle cx="60" cy="50" r="26" fill="#fff3b0"/>';
    g += hills('#9fb58a', 210, 2, 400);
    // עמודים יווניים
    g += '<g transform="translate(250,250)"><path d="M-10,-130 L150,-130 L70,-165Z" fill="#e8e8f0"/><rect x="-10" y="-130" width="160" height="10" fill="#d8d8e4"/>';
    for (var i = 0; i < 5; i++) g += '<rect x="' + (i * 34) + '" y="-120" width="14" height="120" fill="#f2f2f8"/><rect x="' + (i * 34 - 3) + '" y="-124" width="20" height="6" fill="#d8d8e4"/>';
    g += '</g>';
    g += '<rect y="250" width="400" height="50" fill="#c9b78a"/>';
    g += person(60, 262, { robe: '#9a2a2a', helmet: 1, hold: 'spear' }) + person(110, 268, { robe: '#9a2a2a', helmet: 1, hold: 'spear', s: 1.1 });
    if (o.king) g += person(190, 266, { robe: '#6a2c8a', belt: '#f6c445', s: 1.2, hair: '#3a2a1a' }) + '<path d="M180,-0" />' +
      '<path d="M178,183 L182,173 L188,181 L192,171 L196,181 L202,173 L206,183Z" fill="url(#§gold)" transform="translate(-2,0)"/>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function sceneModiin(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="url(#§' + (o.night ? 'sky' : 'dusk') + ')"/>';
    if (o.night) g += starsField(21, 40, 400, 300, 150);
    g += hills('#5d6d9e', 190, 12, 400) + hills('#3d6a4a', 225, 14, 400);
    g += house(20, 240, 60, 50, { window: 1 }) + house(320, 236, 70, 54, { window: 1, wall: '#e2cb98' });
    g += oliveTree(100, 240, 1.1) + oliveTree(290, 238, 0.9);
    g += '<rect y="255" width="400" height="45" fill="#7a6a4a"/>';
    // מתתיהו ובניו
    g += person(200, 275, { robe: '#ffffff', stripe: '#3b6fd8', beard: 'long', turban: '#ffffff', s: 1.25, armUp: o.armUp });
    var robes = ['#3b6fd8', '#2a9d8f', '#e9a03b', '#7b5ea7', '#c0392b'];
    var xs = [100, 140, 260, 300, 340];
    if (o.sons !== false) for (var i = 0; i < 5; i++) g += person(xs[i] - (i < 2 ? 40 : 0) + 20, 282 - (i % 2) * 4, { robe: robes[i], beard: 1, beardColor: '#4a2e1a', kippah: '#1d3b8f', s: 0.9, hold: i === 2 ? 'shield' : null });
    return wrap('0 0 400 300', g, o.attrs);
  }

  function sceneMaccabees(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="url(#§dusk)"/>';
    g += hills('#7a6a9e', 180, 31, 400) + hills('#4d7a52', 220, 33, 400);
    // צבא גדול רחוק
    for (var i = 0; i < 18; i++) {
      var x = 230 + (i % 9) * 18, y = 196 + Math.floor(i / 9) * 10;
      g += '<g opacity=".7"><circle cx="' + x + '" cy="' + (y - 10) + '" r="4" fill="#5a2a2a"/><rect x="' + (x - 4) + '" y="' + (y - 6) + '" width="8" height="12" fill="#7a2a2a"/><path d="M' + (x + 5) + ',' + (y - 22) + ' L' + (x + 5) + ',' + (y + 4) + '" stroke="#555" stroke-width="1.5"/></g>';
    }
    if (o.elephant) g += '<g transform="translate(330,190)" opacity=".8"><ellipse cx="0" cy="0" rx="26" ry="16" fill="#6c6c7a"/><rect x="-20" y="8" width="8" height="16" fill="#6c6c7a"/><rect x="12" y="8" width="8" height="16" fill="#6c6c7a"/><path d="M-24,-4 Q-38,6 -34,22" stroke="#6c6c7a" stroke-width="6" fill="none"/><rect x="-10" y="-30" width="20" height="16" fill="#9a2a2a"/></g>';
    g += '<rect y="255" width="400" height="45" fill="#5a6a3a"/>';
    g += person(70, 280, { robe: '#3b6fd8', beard: 1, beardColor: '#3a2a1a', hold: 'shield', kippah: '#f6c445', s: 1 });
    g += person(120, 284, { robe: '#2a9d8f', beard: 1, beardColor: '#3a2a1a', hold: 'shield', kippah: '#1d3b8f', s: 1.05 });
    g += person(175, 278, { robe: '#1d3b8f', beard: 1, beardColor: '#2a1a0a', hold: 'flag', armUp: 1, kippah: '#f6c445', s: 1.25 });
    if (o.label !== false) g += '<text x="198" y="181" font-size="7" fill="#1d3b8f" font-family="Arial" text-anchor="middle">מי כמוך</text>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function sceneLightDark(o) {
    o = o || {};
    var lvl = o.level == null ? 1 : o.level;
    var g = '<rect width="400" height="300" fill="#060a1e"/>';
    g += '<circle cx="200" cy="170" r="' + (60 + lvl * 140) + '" fill="url(#§bigglow)"/>';
    g += '<circle cx="200" cy="170" r="' + (30 + lvl * 60) + '" fill="url(#§glow)"/>';
    g += starsField(41, 30, 400, 300, 300);
    g += '<rect x="190" y="180" width="20" height="70" rx="4" fill="#fff8e1"/>' + flame(200, 180, 1.4);
    g += '<rect x="150" y="250" width="100" height="10" rx="5" fill="url(#§goldH)"/>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function sceneFamily(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="#2a1e44"/>';
    g += '<rect x="0" y="0" width="400" height="300" fill="url(#§wood)" opacity=".25"/>';
    // חלון
    g += '<rect x="110" y="30" width="180" height="140" rx="6" fill="url(#§sky)" stroke="#c9b07a" stroke-width="8"/>' + '<g transform="translate(112,32)">' + starsField(51, 14, 176, 136, 64) + '</g>';
    g += '<path d="M200,30 L200,170 M110,100 L290,100" stroke="#c9b07a" stroke-width="5"/>';
    g += '<rect x="96" y="168" width="208" height="12" fill="#c9b07a"/>';
    g += '<g transform="translate(150,104) scale(.25)">' + '<g>' + chanukiahInner() + '</g></g>';
    g += '<rect y="250" width="400" height="50" fill="#4a2e1a"/>';
    g += person(70, 270, { robe: '#3b6fd8', beard: 1, beardColor: '#3a2a1a', kippah: '#1d3b8f', s: 1.2, hold: 'candle', armUp: 0 });
    g += person(330, 270, { robe: '#c0392b', longHair: '#5a3a1a', s: 1.15 });
    g += person(260, 276, { robe: '#f6c445', kippah: '#3b6fd8', s: 0.8 }) + person(140, 278, { robe: '#7b5ea7', longHair: '#2a1a0a', s: 0.75 });
    g += '<g transform="translate(200,262) scale(.35)"><g>' + icons.sufganiya().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g></g>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  function chanukiahInner() {
    // גרסה לשיבוץ בתוך סצנה (ללא svg עוטף), 8 נרות דולקים
    var g = '';
    for (var k = 0; k < 4; k++) { var d = 40 + k * 40; g += '<path d="M' + (200 - d) + ',172 Q200,' + (172 + d * 1.15) + ' ' + (200 + d) + ',172" stroke="#f6c445" stroke-width="7" fill="none"/>'; }
    g += '<rect x="192" y="120" width="16" height="185" fill="#f6c445"/><rect x="30" y="166" width="340" height="12" fill="#f6c445"/><path d="M140,318 L260,318 L222,292 L178,292Z" fill="#f6c445"/>';
    for (var i = 0; i < 8; i++) { var x = slotX(i); g += '<rect x="' + (x - 7) + '" y="92" width="14" height="58" fill="' + CANDLE_COLORS[i] + '"/>' + flame(x, 88, 0.9, 'x'); }
    g += '<rect x="193" y="30" width="14" height="62" fill="#fff8e1"/>' + flame(200, 26, 1, 'x');
    return g;
  }

  function sceneTable(o) {
    o = o || {};
    var g = '<rect width="400" height="300" fill="#24306e"/>';
    g += '<rect x="0" y="0" width="400" height="180" fill="url(#§sky)" opacity=".5"/>';
    g += '<rect x="40" y="20" width="140" height="120" rx="6" fill="url(#§sky)" stroke="#c9b07a" stroke-width="7"/>' + moon(140, 60, 14);
    g += '<g transform="translate(66,70) scale(.22)">' + chanukiahInner() + '</g>';
    g += '<rect y="190" width="400" height="110" fill="url(#§wood)"/><rect y="186" width="400" height="10" fill="#c78b54"/>';
    g += '<g transform="translate(220,90) scale(.9)">' + icons.dreidel('#2a5bd7', 'נ').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    g += '<g transform="translate(300,150) scale(.6)">' + icons.coin().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    g += '<g transform="translate(330,170) scale(.5)">' + icons.coin().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    g += '<ellipse cx="110" cy="236" rx="80" ry="18" fill="#e8eef9"/>';
    g += '<g transform="translate(46,170) scale(.7)">' + icons.sufganiya().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    g += '<g transform="translate(100,176) scale(.7)">' + icons.sufganiya().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    g += '<g transform="translate(250,200) scale(.8)">' + icons.latke().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    return wrap('0 0 400 300', g, o.attrs);
  }

  /* ---------- סצנה למשחק "מצא את ההבדלים" ---------- */
  // רשימת הבדלים אפשריים: כל אחד עם אזור פגיעה
  var DIFFS = [
    { id: 'moon', x: 330, y: 56, r: 30 },
    { id: 'star', x: 250, y: 40, r: 22 },
    { id: 'dreidel', x: 210, y: 210, r: 30 },
    { id: 'donut3', x: 150, y: 236, r: 26 },
    { id: 'candle8', x: 29, y: 92, r: 14 },
    { id: 'curtain', x: 28, y: 140, r: 18 },
    { id: 'coin', x: 300, y: 240, r: 22 },
    { id: 'frame', x: 340, y: 150, r: 26 },
    { id: 'plate', x: 90, y: 262, r: 28 },
    { id: 'cat', x: 370, y: 270, r: 26 }
  ];
  function diffScene(f) {
    f = f || {};
    var g = '<rect width="400" height="300" fill="#24306e"/>';
    // חלון
    g += '<rect x="20" y="20" width="200" height="140" rx="6" fill="url(#§sky)" stroke="#c9b07a" stroke-width="7"/>';
    g += '<g transform="translate(24,24)">' + starsField(77, 12, 190, 60, 60).replace(/class="twk" /g, '') + '</g>';
    g += '<path d="' + starPath(250, 40, 12, 5) + '" fill="' + (f.star ? '#24306e' : '#ffe58a') + '"/>';
    if (!f.moon) g += moon(330, 56, 18);
    // וילון
    g += '<path d="M20,20 Q50,60 34,160 L20,160Z" fill="' + (f.curtain ? '#2a9d8f' : '#c0392b') + '"/>';
    g += '<path d="M220,20 Q190,60 206,160 L220,160Z" fill="#c0392b"/>';
    // חנוכייה בחלון
    g += '<g transform="translate(70,100)"><path d="M-46,10 L46,10 M0,10 L0,40 M-14,42 L14,42" stroke="#f6c445" stroke-width="5"/>';
    for (var i = 0; i < 8; i++) {
      var x = (i < 4 ? 46 - i * 11 : -6 - (i - 4) * 11) - 2;
      g += '<rect x="' + (x - 3) + '" y="-6" width="7" height="16" fill="#fff"/>';
      var off = (i === 7 && f.candle8);
      if (!off) g += '<path d="M' + (x + 0.5) + ',-18 Q' + (x + 5) + ',-11 ' + (x + 0.5) + ',-6 Q' + (x - 4) + ',-11 ' + (x + 0.5) + ',-18Z" fill="#ffb020"/>';
    }
    g += '<rect x="-3.5" y="-16" width="7" height="18" fill="#fff"/><path d="M0,-28 Q5,-21 0,-16 Q-5,-21 0,-28Z" fill="#ffb020"/></g>';
    g += '<circle cx="190" cy="100" r="0" />';
    // תמונה על הקיר
    g += '<rect x="312" y="122" width="56" height="56" rx="4" fill="' + (f.frame ? '#2a9d8f' : '#f6c445') + '"/><rect x="320" y="130" width="40" height="40" fill="#fdf3d8"/><path d="M340,136 L354,160 L326,160Z M340,166 L326,142 L354,142Z" fill="none" stroke="#1d3b8f" stroke-width="2.5"/>';
    // שולחן
    g += '<rect y="200" width="400" height="100" fill="url(#§wood)"/><rect y="196" width="400" height="10" fill="#c78b54"/>';
    g += '<ellipse cx="100" cy="262" rx="76" ry="16" fill="' + (f.plate ? '#7cc4ff' : '#e8eef9') + '"/>';
    var donut = icons.sufganiya().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    g += '<g transform="translate(36,212) scale(.5)">' + donut + '</g><g transform="translate(78,214) scale(.5)">' + donut + '</g>';
    if (!f.donut3) g += '<g transform="translate(122,212) scale(.5)">' + donut + '</g>';
    g += '<g transform="translate(176,170) scale(.7)">' + icons.dreidel(f.dreidel ? '#d7263d' : '#2a5bd7', 'ה').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
    var coin = icons.coin().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    g += '<g transform="translate(250,222) scale(.4)">' + coin + '</g>';
    if (!f.coin) g += '<g transform="translate(282,224) scale(.4)">' + coin + '</g>';
    if (f.cat) g += '<g transform="translate(370,282)"><ellipse cx="0" cy="-12" rx="18" ry="13" fill="#e9a03b"/><circle cx="12" cy="-28" r="10" fill="#e9a03b"/><path d="M5,-36 L7,-46 L13,-37Z M14,-37 L20,-45 L21,-34Z" fill="#e9a03b"/><circle cx="10" cy="-29" r="1.5" fill="#000"/><circle cx="16" cy="-29" r="1.5" fill="#000"/><path d="M-18,-10 Q-30,-20 -24,-32" stroke="#e9a03b" stroke-width="5" fill="none"/></g>';
    return wrap('0 0 400 300', g, 'class="diffsvg"');
  }

  function toDataURL(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

  HK.art = {
    rng: rng, wrap: wrap, flame: flame, starPath: starPath,
    chanukiah: chanukiah, icons: icons, person: person,
    scenes: {
      night: sceneNight, temple: sceneTemple, templeInside: sceneTempleInside, greeks: sceneGreeks,
      modiin: sceneModiin, maccabees: sceneMaccabees, lightDark: sceneLightDark, family: sceneFamily, table: sceneTable
    },
    DIFFS: DIFFS, diffScene: diffScene, toDataURL: toDataURL
  };
})(window.HK);
