(function () {
  'use strict';
  var SONGS = window.ERAS_CUP_SONGS || [];
  var ERA_NAMES = { debut: 'Taylor Swift', fearless: 'Fearless', 'speak-now': 'Speak Now', red: 'Red', '1989': '1989', reputation: 'reputation', lover: 'Lover', folklore: 'folklore', evermore: 'evermore', midnights: 'Midnights', ttpd: 'The Tortured Poets Department', showgirl: 'The Life of a Showgirl', other: 'Other songs' };
  var KEY = 'eras-cup-v1';
  var byTitle = {};
  SONGS.forEach(function (s) { byTitle[s.t] = s; });

  // state.out = [{ l: loserTitle, w: winnerTitle }], oldest first. state.champ = title or null.
  var state = { out: [], a: null, b: null, champ: null };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.out)) {
      saved.out = saved.out.filter(function (o) { return byTitle[o.l] && byTitle[o.w]; });
      state = { out: saved.out, a: byTitle[saved.a] ? saved.a : null, b: byTitle[saved.b] ? saved.b : null, champ: byTitle[saved.champ] ? saved.champ : null };
    }
  } catch (e) { /* storage unavailable: play without saving */ }

  var $ = function (id) { return document.getElementById(id); };
  var busy = false, lastOutCount = -1, openCombo = null;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eraVar(s) { return 'var(--era-' + s.e + ')'; }
  function outSet() { var m = {}; state.out.forEach(function (o) { m[o.l] = 1; }); return m; }
  function standing() { var m = outSet(); return SONGS.filter(function (s) { return !m[s.t]; }); }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  function cardHTML(slot) {
    var title = state[slot], s = title && byTitle[title], isFinal = document.body.classList.contains('final');
    var body = s
      ? '<div class="title">' + esc(s.t) + '</div>' + (s.by ? '<div class="feat">' + esc(s.by) + '</div>' : '') +
        '<div class="album"><span class="dot"></span>' + esc(s.a) + (s.y ? ' · ' + s.y : '') + '</div>'
      : '<div class="empty"><i data-lucide="music-2"></i>Choose a song from the dropdown</div>';
    return '<div class="combo" data-slot="' + slot + '">' +
        '<i data-lucide="search" class="ico ico-l"></i>' +
        '<input class="combo-input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" placeholder="' + (s ? 'Change song' : 'Search a song') + '" aria-label="Song ' + slot.toUpperCase() + '">' +
        '<i data-lucide="chevron-down" class="ico ico-r"></i>' +
        '<ul class="combo-list" role="listbox" hidden></ul>' +
      '</div>' +
      '<div class="song swap">' + body + '</div>' +
      '<button class="keep" type="button" data-keep="' + slot + '"' + (state.a && state.b ? '' : ' disabled') + '><i data-lucide="' + (isFinal ? 'trophy' : 'heart') + '"></i>' + (isFinal ? 'Crown this song' : 'Keep this song') + '</button>';
  }

  function renderCard(slot) {
    var el = $(slot === 'a' ? 'cardA' : 'cardB'), s = state[slot] && byTitle[state[slot]];
    el.className = 'card' + (s ? ' filled' : '');
    el.style.setProperty('--era', s ? eraVar(s) : 'var(--border)');
    el.innerHTML = cardHTML(slot);
  }

  function render() {
    var st = standing(), total = SONGS.length, outN = state.out.length;
    var isFinal = st.length === 2 && !state.champ;
    document.body.classList.toggle('final', isFinal);
    document.body.classList.toggle('done', !!state.champ);
    if (isFinal) { state.a = st[0].t; state.b = st[1].t; }

    $('standingCount').textContent = state.champ ? 1 : st.length;
    $('outCount').textContent = state.champ ? total - 1 : outN;
    if (lastOutCount !== -1 && lastOutCount !== outN) {
      ['standingCount', 'outCount'].forEach(function (id) { var n = $(id); n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); });
    }
    var done = state.champ ? total - 1 : outN;
    $('barFill').style.width = (total > 1 ? (done / (total - 1)) * 100 : 0) + '%';
    $('undoBtn').disabled = outN === 0 && !state.champ;
    $('totalCount').textContent = total;
    $('startLabel').textContent = outN ? 'Continue at battle #' + (outN + 1) : 'Start battling';

    $('kicker').textContent = isFinal ? 'Two songs remain' : (state.a && state.b ? 'Keep one, eliminate the other' : 'Pick two songs');
    $('battleTitle').innerHTML = isFinal
      ? 'THE FINAL'.split('').map(function (c, i) { return '<span style="animation-delay:' + i * 40 + 'ms">' + (c === ' ' ? '&nbsp;' : c) + '</span>'; }).join('')
      : 'Battle #' + (outN + 1);
    renderCard('a'); renderCard('b');
    $('vs').classList.toggle('live', !!(state.a && state.b));
    $('randomBtn').disabled = st.length < 2;

    renderStanding(st); renderOut(); renderChampion();
    lastOutCount = outN;
    icons(); save();
  }

  function renderStanding(st) {
    st = st || standing();
    var era = $('eraFilter').value, q = $('listSearch').value.trim().toLowerCase();
    var rows = st.filter(function (s) { return (!era || s.e === era) && (!q || s.t.toLowerCase().indexOf(q) !== -1); });
    $('standingRows').innerHTML = rows.length ? rows.map(function (s) {
      return '<li><button class="row" type="button" data-load="' + esc(s.t) + '" style="--era:' + eraVar(s) + '"><span class="dot"></span><span class="r-title">' + esc(s.t) + '</span><span class="r-sub">' + esc(s.a) + '</span></button></li>';
    }).join('') : '<li class="none">No songs match.</li>';
  }

  function renderOut() {
    var list = state.out.slice().reverse(), fresh = lastOutCount !== -1 && state.out.length > lastOutCount;
    $('outRows').innerHTML = list.length ? list.map(function (o, i) {
      return '<li class="row out' + (fresh && i === 0 ? ' new' : '') + '"><i data-lucide="x" class="x"></i><span class="r-title">' + esc(o.l) + '</span><span class="r-sub">lost to ' + esc(o.w) + '</span></li>';
    }).join('') : '<li class="none">No songs eliminated yet.</li>';
  }

  function renderChampion() {
    var el = $('champion');
    if (!state.champ) { el.innerHTML = ''; return; }
    var s = byTitle[state.champ];
    var beaten = state.out.filter(function (o) { return o.w === s.t; });
    el.innerHTML = '<div class="trophy"><i data-lucide="trophy"></i></div>' +
      '<div class="kicker">Your champion</div><h2>' + esc(s.t) + '</h2>' +
      '<div class="album" style="--era:' + eraVar(s) + '"><span class="dot"></span>' + esc(s.a) + (s.y ? ' · ' + s.y : '') + '</div>' +
      '<div class="road"><h3>Road to the title: ' + beaten.length + ' ' + (beaten.length === 1 ? 'win' : 'wins') + '</h3><ul class="rows">' +
      beaten.map(function (o, i) { var l = byTitle[o.l]; return '<li class="row" style="--era:' + eraVar(l) + ';animation-delay:' + Math.min(i, 20) * 60 + 'ms"><span class="dot"></span><span class="r-title">beat ' + esc(l.t) + '</span><span class="r-sub">' + esc(l.a) + '</span></li>'; }).join('') +
      '</ul></div><div class="champ-actions"><button class="keep" type="button" id="shareBtn"><i data-lucide="copy"></i><span id="shareLabel">Copy my result</span></button>' +
      '<button class="btn-ghost" type="button" id="againBtn"><i data-lucide="rotate-ccw"></i>Play again</button></div>';
  }

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['var(--primary)', 'var(--accent)', 'var(--era-lover)', 'var(--era-fearless)', 'var(--era-speak-now)'];
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('span');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 2200 + Math.random() * 1500 + 'ms';
      p.style.animationDelay = Math.random() * 500 + 'ms';
      document.body.appendChild(p);
      setTimeout(function (n) { n.remove(); }, 4500, p);
    }
  }

  function keep(slot) {
    if (busy || !state.a || !state.b) return;
    var winner = state[slot], loser = state[slot === 'a' ? 'b' : 'a'];
    var isFinal = document.body.classList.contains('final');
    busy = true; closeCombo();
    $(slot === 'a' ? 'cardA' : 'cardB').classList.add('win');
    $(slot === 'a' ? 'cardB' : 'cardA').classList.add('lose');
    setTimeout(function () {
      state.out.push({ l: loser, w: winner });
      state.a = null; state.b = null;
      if (isFinal) state.champ = winner;
      busy = false; render();
      if (isFinal) { confetti(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }, 520);
  }

  function undo() {
    if (busy) return;
    if (state.champ) state.champ = null;
    var last = state.out.pop();
    if (!last) return;
    state.a = last.w; state.b = last.l;
    render();
  }

  function setSlot(slot, title) {
    var other = slot === 'a' ? 'b' : 'a';
    if (state[other] === title) state[other] = null;
    state[slot] = title; render();
  }

  // Combobox
  function comboOptions(combo) {
    var slot = combo.dataset.slot, other = state[slot === 'a' ? 'b' : 'a'];
    var q = combo.querySelector('input').value.trim().toLowerCase();
    return standing().filter(function (s) { return s.t !== other && (!q || s.t.toLowerCase().indexOf(q) !== -1 || s.a.toLowerCase().indexOf(q) !== -1); });
  }
  function drawCombo(combo) {
    var list = combo.querySelector('.combo-list'), opts = comboOptions(combo);
    list.innerHTML = opts.length ? opts.map(function (s, i) {
      return '<li class="opt' + (i === 0 ? ' active' : '') + '" role="option" data-pick="' + esc(s.t) + '" style="--era:' + eraVar(s) + '"><span class="dot"></span><span class="o-title">' + esc(s.t) + '</span><span class="o-album">' + esc(s.a) + '</span></li>';
    }).join('') : '<li class="opt-none">No songs match.</li>';
    list.hidden = false; combo.querySelector('input').setAttribute('aria-expanded', 'true'); openCombo = combo;
  }
  function closeCombo() {
    if (!openCombo) return;
    openCombo.querySelector('.combo-list').hidden = true;
    openCombo.querySelector('input').setAttribute('aria-expanded', 'false');
    openCombo = null;
  }

  document.addEventListener('focusin', function (e) { if (e.target.classList.contains('combo-input')) { closeCombo(); drawCombo(e.target.closest('.combo')); } });
  document.addEventListener('input', function (e) {
    if (e.target.classList.contains('combo-input')) drawCombo(e.target.closest('.combo'));
    if (e.target.id === 'listSearch') renderStanding();
  });
  document.addEventListener('change', function (e) { if (e.target.id === 'eraFilter') renderStanding(); });
  document.addEventListener('keydown', function (e) {
    if (!e.target.classList.contains('combo-input') || !openCombo) return;
    var opts = Array.prototype.slice.call(openCombo.querySelectorAll('.opt')), i = opts.findIndex(function (o) { return o.classList.contains('active'); });
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!opts.length) return;
      if (i >= 0) opts[i].classList.remove('active');
      i = (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts[i].classList.add('active'); opts[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (i >= 0) setSlot(openCombo.dataset.slot, opts[i].dataset.pick);
    } else if (e.key === 'Escape') { closeCombo(); e.target.blur(); }
  });
  document.addEventListener('mousedown', function (e) {
    var opt = e.target.closest('.opt');
    if (opt && openCombo) { e.preventDefault(); setSlot(openCombo.dataset.slot, opt.dataset.pick); return; }
    if (openCombo && !e.target.closest('.combo')) closeCombo();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-keep], [data-load], [data-tab], #undoBtn, #resetBtn, #randomBtn, #againBtn, #startBtn, #shareBtn');
    if (!t) return;
    if (t.dataset.keep) keep(t.dataset.keep);
    else if (t.dataset.load) {
      if (document.body.classList.contains('final')) return;
      var title = t.dataset.load;
      if (state.a === title || state.b === title) return;
      setSlot(!state.a ? 'a' : 'b', title);
      $('arena').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.dataset.tab) {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b === t); });
      $('panel-standing').classList.toggle('on', t.dataset.tab === 'standing');
      $('panel-out').classList.toggle('on', t.dataset.tab === 'out');
    } else if (t.id === 'undoBtn') undo();
    else if (t.id === 'startBtn') {
      $('arena').scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = document.querySelector('#cardA .combo-input');
      if (first && !state.a) setTimeout(function () { first.focus({ preventScroll: true }); }, 450);
    } else if (t.id === 'shareBtn') {
      var last = state.out[state.out.length - 1];
      var text = 'My Eras Cup champion: "' + state.champ + '"' + (last ? ' (beat "' + last.l + '" in the final, out of ' + SONGS.length + ' songs)' : '');
      var done = function (ok) {
        var l = $('shareLabel'); if (!l) return;
        l.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(function () { if ($('shareLabel')) $('shareLabel').textContent = 'Copy my result'; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = false; try { ok = document.execCommand('copy'); } catch (err) {}
        ta.remove(); done(ok);
      }
    }
    else if (t.id === 'randomBtn') {
      var st = standing(); if (st.length < 2) return;
      var i = Math.floor(Math.random() * st.length), j = Math.floor(Math.random() * (st.length - 1)); if (j >= i) j++;
      state.a = st[i].t; state.b = st[j].t; render();
    } else if (t.id === 'resetBtn' || t.id === 'againBtn') {
      if (t.id === 'resetBtn' && state.out.length && !window.confirm('Start over? All ' + state.out.length + ' battles will be cleared.')) return;
      state = { out: [], a: null, b: null, champ: null }; lastOutCount = -1; render();
    }
  });

  // Era filter options, in album order, only for eras that have songs
  var counts = {}; SONGS.forEach(function (s) { counts[s.e] = (counts[s.e] || 0) + 1; });
  $('eraFilter').innerHTML = '<option value="">All eras</option>' + Object.keys(ERA_NAMES).filter(function (k) { return counts[k]; }).map(function (k) { return '<option value="' + k + '">' + esc(ERA_NAMES[k]) + '</option>'; }).join('');

  if (!SONGS.length) { $('kicker').textContent = 'Song list failed to load (songs.js must sit next to index.html)'; icons(); return; }
  render();
})();
