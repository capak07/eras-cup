(function () {
  'use strict';
  var ALL = window.ERAS_CUP_SONGS || [], SONGS = ALL; // SONGS = the songs in the battle (ALL minus excluded)
  var ERA_NAMES = { debut: 'Taylor Swift', fearless: 'Fearless', 'speak-now': 'Speak Now', red: 'Red', '1989': '1989', reputation: 'reputation', lover: 'Lover', folklore: 'folklore', evermore: 'evermore', midnights: 'Midnights', ttpd: 'The Tortured Poets Department', showgirl: 'The Life of a Showgirl', other: 'Other songs' };
  var KEY = 'eras-cup-v1';
  var byTitle = {};
  ALL.forEach(function (s) { byTitle[s.t] = s; });

  // prefs = { excl: [titles left out of the battle], theme: key }
  var prefs = { excl: [], theme: 'midnight' };
  try {
    var p = JSON.parse(localStorage.getItem('eras-cup-settings') || 'null');
    if (p) prefs = { excl: Array.isArray(p.excl) ? p.excl.filter(function (t) { return byTitle[t]; }) : [], theme: typeof p.theme === 'string' ? p.theme : 'midnight' };
  } catch (e) {}
  function savePrefs() { try { localStorage.setItem('eras-cup-settings', JSON.stringify(prefs)); } catch (e) {} }
  function pool() {
    var ex = {}; prefs.excl.forEach(function (t) { ex[t] = 1; });
    SONGS = ALL.filter(function (s) { return !ex[s.t]; });
    if (SONGS.length < 2) { prefs.excl = []; SONGS = ALL; }
  }
  pool();

  // state.out = [{ l: loserTitle, w: winnerTitle }], oldest first. Rounds are replayed from it.
  var state = { out: [], a: null, b: null, champ: null };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.out)) {
      var inPool = {}; SONGS.forEach(function (s) { inPool[s.t] = 1; });
      saved.out = saved.out.filter(function (o) { return inPool[o.l] && inPool[o.w]; });
      state = { out: saved.out, a: byTitle[saved.a] ? saved.a : null, b: byTitle[saved.b] ? saved.b : null, champ: byTitle[saved.champ] ? saved.champ : null };
    }
  } catch (e) { /* storage unavailable: play without saving */ }

  var $ = function (id) { return document.getElementById(id); };
  var busy = false, lastOutCount = -1, lastRound = 0, openCombo = null, G = null;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eraVar(s) { return 'var(--era-' + s.e + ')'; }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  // ---------- Rounds ----------
  // Replays every battle. In a round each song battles once; a winner sits out until the
  // round ends. When fewer than two songs are left to battle, the round ends and a leftover
  // song gets a bye. Two songs left in total is the final.
  function derive() {
    var out = {}, played = {}, round = 1, start = SONGS.length, inRound = 0, byes = [], rs = [];
    function standing() { return SONGS.filter(function (s) { return !out[s.t]; }); }
    state.out.forEach(function (e) {
      rs.push(round);
      out[e.l] = 1; played[e.w] = 1; inRound++;
      var st = standing();
      if (st.length <= 2) return;
      var avail = st.filter(function (s) { return !played[s.t]; });
      if (avail.length < 2) {
        if (avail.length === 1) byes.push({ t: avail[0].t, r: round });
        round++; played = {}; start = st.length; inRound = 0;
      }
    });
    var st = standing();
    return {
      standing: st,
      avail: st.filter(function (s) { return !played[s.t]; }),
      through: st.length - st.filter(function (s) { return !played[s.t]; }).length,
      round: round, start: start, battleNo: inRound + 1, battles: Math.floor(start / 2),
      byes: byes, rounds: rs, isFinal: st.length === 2
    };
  }
  function stageName(n) {
    if (n <= 4) return 'Semi-finals';
    if (n <= 8) return 'Quarter-finals';
    return '';
  }
  function availSet() { var m = {}; G.avail.forEach(function (s) { m[s.t] = 1; }); return m; }

  // ---------- Previews ----------
  // Two free, keyless sources of 30-second clips: the iTunes Search API (CORS) and the Deezer
  // API (JSONP). Only Taylor Swift's own recordings count: results are matched on her artist
  // id, and karaoke, tribute, lullaby and instrumental covers are rejected, since those have no
  // singing. If both sources have the song, "Other clip" switches between them.
  var TS_ITUNES = 159260351, TS_DEEZER = 12246;
  var COVER = /karaoke|instrumental|tribute|lullab|made famous|originally performed|in the style of|as made|piano version|string quartet|music box|8-bit|rockabye|backing track/i;
  var VARIANT = /\b(live|remix|mix|acoustic|demo|voice memo|piano|orchestral|edit|version\)|stripped|sped up|slowed)\b/i;
  var audio = new Audio(), playing = null, previews = {};
  audio.preload = 'none';
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/\((taylor.s version|from the vault|feat[^)]*|with [^)]*)\)|\[[^\]]*\]/g, ' ')
      .replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function score(song, name, extra) {
    var want = norm(song.t), base = norm(song.t.replace(/\s*\([^)]*\)\s*/g, ' ')), got = norm(name);
    if (COVER.test(name + ' ' + extra) && !COVER.test(song.t)) return 0;
    var sc = got === want ? 50 : got.indexOf(want) === 0 ? 40 : got.indexOf(want) !== -1 ? 30 :
      (base && base !== want && (got === base ? 20 : got.indexOf(base) === 0 ? 10 : 0)) || 0;
    if (sc && VARIANT.test(name.replace(/taylor.s version/i, '')) && !VARIANT.test(song.t)) sc -= 8; // prefer the studio original
    return sc;
  }
  // Search on the title without its bracketed part ("Karma (remixed version)" -> "Karma");
  // the scoring still prefers the exact version.
  function term(song) { var b = song.t.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); return 'taylor swift ' + (b || song.t); }
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var cb = '__dz' + Math.random().toString(36).slice(2), s = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('timeout')); }, 8000);
      function done() { clearTimeout(timer); delete window[cb]; s.remove(); }
      window[cb] = function (data) { done(); resolve(data); };
      s.onerror = function () { done(); reject(new Error('jsonp')); };
      s.src = url + '&output=jsonp&callback=' + cb;
      document.head.appendChild(s);
    });
  }
  function fromItunes(song) {
    return fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(term(song)) + '&entity=song&limit=25&country=US')
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) {
        var best = null, bs = 0;
        (d.results || []).forEach(function (r) {
          if (!r.previewUrl) return;
          var hers = r.artistId === TS_ITUNES || /taylor swift/i.test(r.artistName) || /(feat\.?|with) taylor swift/i.test(r.trackName);
          if (!hers) return;
          var sc = score(song, r.trackName, r.artistName + ' ' + (r.collectionName || ''));
          if (sc > bs) { best = r; bs = sc; }
        });
        return best ? { url: best.previewUrl, link: best.trackViewUrl, src: 'Apple Music', sc: bs } : null;
      })
      .catch(function () { return null; });
  }
  function fromDeezer(song) {
    return jsonp('https://api.deezer.com/search?q=' + encodeURIComponent(term(song)) + '&limit=25')
      .then(function (d) {
        var best = null, bs = 0;
        (d.data || []).forEach(function (r) {
          if (!r.preview) return;
          var hers = (r.artist && r.artist.id === TS_DEEZER) || /(feat\.?|with) taylor swift/i.test(r.title);
          if (!hers) return;
          var sc = score(song, r.title, (r.artist && r.artist.name || '') + ' ' + (r.album && r.album.title || ''));
          if (sc > bs) { best = r; bs = sc; }
        });
        return best ? { url: best.preview, link: best.link, src: 'Deezer', sc: bs } : null;
      })
      .catch(function () { return null; });
  }
  // Resolves to a list of clips, best match first (empty when neither source has the song).
  function findPreviews(song) {
    if (!previews[song.t]) {
      previews[song.t] = Promise.all([fromItunes(song), fromDeezer(song)]).then(function (r) {
        var list = r.filter(Boolean).sort(function (a, b) { return b.sc - a.sc; });
        if (!list.length) delete previews[song.t]; // try again next time (network blips)
        return list;
      });
    }
    return previews[song.t];
  }
  function playerEl(slot) { return document.querySelector('#card' + slot.toUpperCase() + ' .player'); }
  function setPlayer(slot, mode, clip, count) {
    var p = playerEl(slot); if (!p) return;
    p.dataset.mode = mode;
    var src = clip ? ' · ' + clip.src : '';
    p.querySelector('.p-label').textContent = { idle: 'Play preview', loading: 'Finding preview…', playing: 'Playing' + src, paused: 'Paused' + src, none: 'No preview found' }[mode];
    var btn = p.querySelector('.play');
    btn.innerHTML = '<i data-lucide="' + (mode === 'playing' ? 'pause' : mode === 'loading' ? 'loader-circle' : 'play') + '"></i>';
    btn.disabled = mode === 'none';
    if (clip) {
      var a = p.querySelector('.am'); a.href = clip.link; a.hidden = !clip.link;
      a.firstChild.nodeValue = clip.src + ' ';
    }
    if (count !== undefined) p.querySelector('.alt').hidden = count < 2;
    icons();
  }
  function stopAudio() {
    audio.pause();
    if (playing) {
      var s = playing.slot; playing = null; setPlayer(s, 'idle');
      var b = playerEl(s); if (b) b.querySelector('.pbar > div').style.width = '0';
    }
  }
  function startClip(slot, title, list, i) {
    var clip = list[i];
    playing = { slot: slot, title: title, list: list, i: i };
    audio.src = clip.url;
    audio.play().then(function () { setPlayer(slot, 'playing', clip, list.length); },
      function () {
        // A dead clip (Deezer links expire): fall through to the next source, if any.
        if (i + 1 < list.length) startClip(slot, title, list, i + 1);
        else { playing = null; setPlayer(slot, 'none'); }
      });
  }
  function togglePlay(slot) {
    var title = state[slot], song = title && byTitle[title];
    if (!song) return;
    if (playing && playing.slot === slot && playing.title === title && playing.list) {
      if (audio.paused) { audio.play().catch(function () {}); setPlayer(slot, 'playing', playing.list[playing.i]); }
      else { audio.pause(); setPlayer(slot, 'paused', playing.list[playing.i]); }
      return;
    }
    stopAudio();
    playing = { slot: slot, title: title };
    setPlayer(slot, 'loading');
    findPreviews(song).then(function (list) {
      if (!playing || playing.slot !== slot || playing.title !== title) return;
      if (!list.length) { playing = null; setPlayer(slot, 'none'); return; }
      startClip(slot, title, list, 0);
    });
  }
  function otherClip(slot) {
    if (!playing || playing.slot !== slot || !playing.list || playing.list.length < 2) return;
    audio.pause();
    startClip(slot, playing.title, playing.list, (playing.i + 1) % playing.list.length);
  }
  audio.addEventListener('timeupdate', function () {
    if (!playing) return;
    var p = playerEl(playing.slot);
    if (p && audio.duration) p.querySelector('.pbar > div').style.width = (audio.currentTime / audio.duration) * 100 + '%';
  });
  audio.addEventListener('ended', function () { stopAudio(); });

  // ---------- Visitor counter (Abacus: free, no key) ----------
  // Counts each browser once: the first visit increments, later visits only read the total.
  function visitors() {
    var el = $('visitors'); if (!el) return;
    var base = 'https://abacus.jasoncameron.dev/', key = 'eras-cup-atharva/visitors', seen = false;
    try { seen = localStorage.getItem('eras-cup-visited') === '1'; } catch (e) {}
    fetch(base + (seen ? 'get/' : 'hit/') + key)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) {
        if (typeof d.value !== 'number') return;
        if (!seen) { try { localStorage.setItem('eras-cup-visited', '1'); } catch (e) {} }
        el.innerHTML = '<i data-lucide="eye"></i>' + d.value.toLocaleString() + ' ' + (d.value === 1 ? 'visitor' : 'visitors');
        el.hidden = false; icons();
      })
      .catch(function () { /* counter offline: leave it hidden */ });
  }

  // ---------- Rendering ----------
  function cardHTML(slot) {
    var title = state[slot], s = title && byTitle[title];
    var body = s
      ? '<div class="title">' + esc(s.t) + '</div>' + (s.by ? '<div class="feat">' + esc(s.by) + '</div>' : '') +
        '<div class="album"><span class="dot"></span>' + esc(s.a) + (s.y ? ' · ' + s.y : '') + '</div>' +
        '<div class="player" data-mode="idle">' +
          '<button class="play" type="button" data-play="' + slot + '" aria-label="Play preview of ' + esc(s.t) + '"><i data-lucide="play"></i></button>' +
          '<div class="p-body"><div class="p-top"><span class="p-label">Play preview</span><span class="p-links"><button class="alt" type="button" data-alt="' + slot + '" hidden><i data-lucide="shuffle"></i>Other clip</button>' +
          '<a class="am" target="_blank" rel="noopener" hidden>Listen <i data-lucide="arrow-up-right"></i></a></span></div>' +
          '<div class="pbar"><div></div></div></div>' +
        '</div>'
      : '<div class="empty"><i data-lucide="music-2"></i>Choose a song from the dropdown</div>';
    return '<div class="combo" data-slot="' + slot + '">' +
        '<i data-lucide="search" class="ico ico-l"></i>' +
        '<input class="combo-input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" placeholder="' + (s ? 'Change song' : 'Search a song') + '" aria-label="Song ' + slot.toUpperCase() + '">' +
        '<i data-lucide="chevron-down" class="ico ico-r"></i>' +
        '<ul class="combo-list" role="listbox" hidden></ul>' +
      '</div>' +
      '<div class="song swap">' + body + '</div>' +
      '<button class="keep" type="button" data-keep="' + slot + '"' + (state.a && state.b ? '' : ' disabled') + '><i data-lucide="' + (G.isFinal ? 'trophy' : 'heart') + '"></i>' + (G.isFinal ? 'Crown this song' : 'Keep this song') + '</button>';
  }

  function renderCard(slot) {
    var el = $(slot === 'a' ? 'cardA' : 'cardB'), s = state[slot] && byTitle[state[slot]];
    el.className = 'card' + (s ? ' filled' : '');
    el.style.setProperty('--era', s ? eraVar(s) : 'var(--border)');
    el.innerHTML = cardHTML(slot);
    if (playing && playing.slot === slot && playing.title === state[slot]) {
      if (playing.list) setPlayer(slot, audio.paused ? 'paused' : 'playing', playing.list[playing.i], playing.list.length);
      else setPlayer(slot, 'loading');
    } else if (playing && playing.slot === slot) {
      audio.pause(); playing = null;
    }
  }

  function render() {
    G = derive();
    var total = SONGS.length, outN = state.out.length;
    // Drop slot picks that are no longer eligible this round (after undo, reset or a new round).
    var ok = availSet();
    if (!G.isFinal) { if (state.a && !ok[state.a]) state.a = null; if (state.b && !ok[state.b]) state.b = null; }
    document.body.classList.toggle('final', G.isFinal && !state.champ);
    document.body.classList.toggle('done', !!state.champ);
    if (G.isFinal && !state.champ) { state.a = G.standing[0].t; state.b = G.standing[1].t; }

    $('standingCount').textContent = state.champ ? 1 : G.standing.length;
    $('outCount').textContent = state.champ ? total - 1 : outN;
    if (lastOutCount !== -1 && lastOutCount !== outN) {
      ['standingCount', 'outCount'].forEach(function (id) { var n = $(id); n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); });
    }
    var done = state.champ ? total - 1 : outN;
    $('barFill').style.width = (total > 1 ? (done / (total - 1)) * 100 : 0) + '%';
    $('undoBtn').disabled = outN === 0 && !state.champ;

    var stage = stageName(G.start);
    $('kicker').textContent = G.isFinal ? 'Two songs remain' : 'Round ' + G.round + (stage ? ' · ' + stage : '') + ' · ' + G.avail.length + ' songs left to battle';
    $('battleTitle').innerHTML = G.isFinal
      ? 'THE FINAL'.split('').map(function (c, i) { return '<span style="animation-delay:' + i * 40 + 'ms">' + (c === ' ' ? '&nbsp;' : c) + '</span>'; }).join('')
      : 'Battle ' + G.battleNo + ' <span class="of">of ' + G.battles + '</span>';
    renderCard('a'); renderCard('b');
    $('vs').classList.toggle('live', !!(state.a && state.b));
    $('randomBtn').disabled = G.avail.length < 2;

    renderStanding(); renderOut(); renderChampion();
    if (lastRound && G.round > lastRound && !G.isFinal) roundToast(lastRound);
    lastOutCount = outN; lastRound = G.round;
    icons(); save();
  }

  function renderStanding() {
    var era = $('eraFilter').value, q = $('listSearch').value.trim().toLowerCase();
    var rows = G.avail.filter(function (s) { return (!era || s.e === era) && (!q || s.t.toLowerCase().indexOf(q) !== -1); });
    $('standingTitle').textContent = 'Round ' + G.round + ': still to battle';
    $('standingHint').textContent = G.through ? G.through + ' already through' : 'Click a song to load it';
    $('standingRows').innerHTML = rows.length ? rows.map(function (s) {
      return '<li><button class="row" type="button" data-load="' + esc(s.t) + '" style="--era:' + eraVar(s) + '"><span class="dot"></span><span class="r-title">' + esc(s.t) + '</span><span class="r-sub">' + esc(s.a) + '</span></button></li>';
    }).join('') : '<li class="none">' + (G.isFinal ? 'On to the final.' : 'No songs match.') + '</li>';
  }

  function renderOut() {
    var fresh = lastOutCount !== -1 && state.out.length > lastOutCount;
    var list = state.out.map(function (o, i) { return { o: o, r: G.rounds[i] }; }).reverse();
    $('outRows').innerHTML = list.length ? list.map(function (x, i) {
      return '<li class="row out' + (fresh && i === 0 ? ' new' : '') + '"><i data-lucide="x" class="x"></i><span class="r-title">' + esc(x.o.l) + '</span><span class="r-sub">R' + x.r + ' · lost to ' + esc(x.o.w) + '</span></li>';
    }).join('') : '<li class="none">No songs eliminated yet.</li>';
  }

  function renderChampion() {
    var el = $('champion');
    if (!state.champ) { el.innerHTML = ''; return; }
    var s = byTitle[state.champ];
    var beaten = state.out.map(function (o, i) { return { o: o, r: G.rounds[i] }; }).filter(function (x) { return x.o.w === s.t; });
    var byes = G.byes.filter(function (b) { return b.t === s.t; });
    el.innerHTML = '<div class="trophy"><i data-lucide="trophy"></i></div>' +
      '<div class="kicker">Your champion</div><h2>' + esc(s.t) + '</h2>' +
      '<div class="album" style="--era:' + eraVar(s) + '"><span class="dot"></span>' + esc(s.a) + (s.y ? ' · ' + s.y : '') + '</div>' +
      '<div class="road"><h3>Road to the title: ' + beaten.length + ' ' + (beaten.length === 1 ? 'win' : 'wins') + (byes.length ? ', ' + byes.length + ' ' + (byes.length === 1 ? 'bye' : 'byes') : '') + '</h3><ul class="rows">' +
      beaten.map(function (x, i) { var l = byTitle[x.o.l]; return '<li class="row" style="--era:' + eraVar(l) + ';animation-delay:' + Math.min(i, 20) * 60 + 'ms"><span class="dot"></span><span class="r-title">R' + x.r + ' · beat ' + esc(l.t) + '</span><span class="r-sub">' + esc(l.a) + '</span></li>'; }).join('') +
      '</ul></div><div class="champ-actions"><button class="keep" type="button" id="shareBtn"><i data-lucide="copy"></i><span id="shareLabel">Copy my result</span></button>' +
      '<button class="btn-ghost" type="button" id="againBtn"><i data-lucide="rotate-ccw"></i>Play again</button></div>';
  }

  function roundToast(r) {
    var bye = G.byes.filter(function (b) { return b.r === r; })[0];
    var t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = '<b>Round ' + r + ' complete.</b> ' + G.standing.length + ' songs go through to Round ' + G.round + '.' + (bye ? ' <span>' + esc(bye.t) + ' had no opponent and gets a bye.</span>' : '');
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(roundToast.timer); roundToast.timer = setTimeout(function () { t.classList.remove('show'); }, 5000);
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

  // ---------- Actions ----------
  function keep(slot) {
    if (busy || !state.a || !state.b) return;
    var winner = state[slot], loser = state[slot === 'a' ? 'b' : 'a'];
    var isFinal = G.isFinal;
    busy = true; closeCombo(); stopAudio();
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
    stopAudio();
    if (state.champ) state.champ = null;
    var last = state.out.pop();
    if (!last) return;
    state.a = last.w; state.b = last.l;
    lastRound = 0; // no "round complete" toast when stepping back
    render();
  }

  function setSlot(slot, title) {
    var other = slot === 'a' ? 'b' : 'a';
    if (state[other] === title) state[other] = null;
    state[slot] = title; render();
  }

  // ---------- Combobox ----------
  function comboOptions(combo) {
    var slot = combo.dataset.slot, other = state[slot === 'a' ? 'b' : 'a'];
    var q = combo.querySelector('input').value.trim().toLowerCase();
    return G.avail.filter(function (s) { return s.t !== other && (!q || s.t.toLowerCase().indexOf(q) !== -1 || s.a.toLowerCase().indexOf(q) !== -1); });
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
    var t = e.target.closest('[data-keep], [data-load], [data-tab], [data-play], [data-alt], #undoBtn, #resetBtn, #randomBtn, #againBtn, #shareBtn');
    if (!t) return;
    if (t.dataset.keep) keep(t.dataset.keep);
    else if (t.dataset.play) togglePlay(t.dataset.play);
    else if (t.dataset.alt) otherClip(t.dataset.alt);
    else if (t.dataset.load) {
      if (G.isFinal) return;
      var title = t.dataset.load;
      if (state.a === title || state.b === title) return;
      setSlot(!state.a ? 'a' : 'b', title);
      $('arena').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.dataset.tab) {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b === t); });
      $('panel-standing').classList.toggle('on', t.dataset.tab === 'standing');
      $('panel-out').classList.toggle('on', t.dataset.tab === 'out');
    } else if (t.id === 'undoBtn') undo();
    else if (t.id === 'shareBtn') {
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
    } else if (t.id === 'randomBtn') {
      var av = G.avail; if (av.length < 2) return;
      var i = Math.floor(Math.random() * av.length), j = Math.floor(Math.random() * (av.length - 1)); if (j >= i) j++;
      state.a = av[i].t; state.b = av[j].t; render();
    } else if (t.id === 'resetBtn' || t.id === 'againBtn') {
      if (t.id === 'resetBtn' && state.out.length && !window.confirm('Start over? All ' + state.out.length + ' battles will be cleared.')) return;
      stopAudio();
      state = { out: [], a: null, b: null, champ: null }; lastOutCount = -1; lastRound = 0; render();
    }
  });

  // Era filter options, in album order, only for eras that have songs in the battle
  function buildEraFilter() {
    var counts = {}; SONGS.forEach(function (s) { counts[s.e] = (counts[s.e] || 0) + 1; });
    $('eraFilter').innerHTML = '<option value="">All eras</option>' + Object.keys(ERA_NAMES).filter(function (k) { return counts[k]; }).map(function (k) { return '<option value="' + k + '">' + esc(ERA_NAMES[k]) + '</option>'; }).join('');
  }
  buildEraFilter();

  // ---------- Settings: theme and excluded songs ----------
  var THEMES = [['midnight', 'Midnight Rose', 'The original'], ['debut', 'Debut'], ['fearless', 'Fearless'], ['speak-now', 'Speak Now'], ['red', 'Red'], ['1989', '1989'],
    ['reputation', 'reputation'], ['lover', 'Lover'], ['folklore', 'folklore'], ['evermore', 'evermore'], ['midnights', 'Midnights'],
    ['ttpd', 'The Tortured Poets Department'], ['showgirl', 'The Life of a Showgirl']];
  var draft = {}; // excluded titles being edited, applied on Save

  function applyTheme(key) {
    if (key === 'midnight') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', key);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }

  function openSettings(tab) {
    draft = {}; prefs.excl.forEach(function (t) { draft[t] = 1; });
    $('exSearch').value = ''; $('exEra').value = '';
    showTab(tab || 'themes'); renderThemes(); renderExcl();
    $('settings').hidden = false; document.body.classList.add('settings-open');
    stopAudio(); closeCombo();
    $('settingsClose').focus();
  }
  function closeSettings() {
    $('settings').hidden = true; document.body.classList.remove('settings-open');
    $('settingsBtn').focus();
  }
  function showTab(tab) {
    document.querySelectorAll('[data-stab]').forEach(function (b) { var on = b.dataset.stab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('stab-themes').hidden = tab !== 'themes'; $('stab-songs').hidden = tab !== 'songs';
  }

  function renderThemes() {
    $('themeGrid').innerHTML = THEMES.map(function (t) {
      var on = prefs.theme === t[0];
      return '<button type="button" class="theme-card' + (on ? ' on' : '') + '" data-theme-pick="' + t[0] + '"' + (t[0] === 'midnight' ? '' : ' data-theme="' + t[0] + '"') + ' aria-pressed="' + on + '">' +
        '<span class="tc-stage"><span class="tc-sw" style="background:var(--primary)"></span><span class="tc-sw" style="background:var(--accent)"></span><span class="tc-sw" style="background:var(--card);border-color:var(--border)"></span></span>' +
        '<span class="tc-name">' + esc(t[1]) + '</span>' + (on ? '<span class="tc-check"><i data-lucide="check"></i></span>' : '') + '</button>';
    }).join('');
    icons();
  }

  function draftCount() { return Object.keys(draft).length; }
  function renderExcl() {
    var era = $('exEra').value, q = $('exSearch').value.trim().toLowerCase();
    var groups = Object.keys(ERA_NAMES).map(function (k) {
      var all = ALL.filter(function (s) { return s.e === k; });
      var shown = all.filter(function (s) { return (!era || era === k) && (!q || s.t.toLowerCase().indexOf(q) !== -1); });
      return { k: k, all: all, shown: shown };
    }).filter(function (g) { return g.shown.length; });
    $('exList').innerHTML = groups.length ? groups.map(function (g) {
      var inN = g.all.filter(function (s) { return !draft[s.t]; }).length;
      return '<div class="ex-group" style="--era:var(--era-' + g.k + ')"><div class="ex-head"><span class="dot"></span><b>' + esc(ERA_NAMES[g.k]) + '</b>' +
        '<span class="ex-count">' + inN + ' / ' + g.all.length + '</span>' +
        '<button type="button" class="ex-all" data-ex-era="' + g.k + '" data-ex-to="' + (inN ? 'out' : 'in') + '">' + (inN ? 'Exclude all' : 'Include all') + '</button></div>' +
        '<ul>' + g.shown.map(function (s) {
          return '<li><label class="ex-row' + (draft[s.t] ? ' off' : '') + '"><input type="checkbox" data-ex-song="' + esc(s.t) + '"' + (draft[s.t] ? '' : ' checked') + '>' +
            '<span class="ex-box"><i data-lucide="check"></i></span><span class="r-title">' + esc(s.t) + '</span>' + (s.by ? '<span class="r-sub">' + esc(s.by) + '</span>' : '') + '</label></li>';
        }).join('') + '</ul></div>';
    }).join('') : '<div class="none">No songs match.</div>';
    updateExSummary(); icons();
  }
  function updateExSummary() {
    var inBattle = ALL.length - draftCount(), changed = draftCount() !== prefs.excl.length || prefs.excl.some(function (t) { return !draft[t]; });
    $('exSummary').innerHTML = '<b class="mono">' + inBattle + '</b> of ' + ALL.length + ' songs in the battle';
    var save = $('exSave');
    save.disabled = !changed || inBattle < 2;
    $('exWarn').textContent = inBattle < 2 ? 'Keep at least 2 songs in the battle.' :
      changed && state.out.length ? 'Saving starts a new game: your ' + state.out.length + (state.out.length === 1 ? ' battle' : ' battles') + ' will be cleared.' : '';
  }
  function saveExcl() {
    var inBattle = ALL.length - draftCount();
    if (inBattle < 2) return;
    if (state.out.length && !window.confirm('Save and start a new game? Your ' + state.out.length + (state.out.length === 1 ? ' battle' : ' battles') + ' will be cleared.')) return;
    prefs.excl = Object.keys(draft); savePrefs();
    pool();
    state = { out: [], a: null, b: null, champ: null }; lastOutCount = -1; lastRound = 0;
    buildEraFilter(); render(); updateExSummary();
    var b = $('exSave'), l = b.querySelector('span'); l.textContent = 'Saved'; setTimeout(function () { l.textContent = 'Save changes'; }, 1600);
  }

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.exSong !== undefined) {
      if (t.checked) delete draft[t.dataset.exSong]; else draft[t.dataset.exSong] = 1;
      t.closest('.ex-row').classList.toggle('off', !t.checked);
      var g = t.closest('.ex-group'), k = g.querySelector('.ex-all').dataset.exEra;
      var all = ALL.filter(function (s) { return s.e === k; }), inN = all.filter(function (s) { return !draft[s.t]; }).length;
      g.querySelector('.ex-count').textContent = inN + ' / ' + all.length;
      var btn = g.querySelector('.ex-all'); btn.dataset.exTo = inN ? 'out' : 'in'; btn.textContent = inN ? 'Exclude all' : 'Include all';
      updateExSummary();
    } else if (t.id === 'exEra') renderExcl();
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'exSearch') renderExcl(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('settings').hidden) closeSettings(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('#settingsBtn, #settingsClose, [data-stab], [data-theme-pick], [data-ex-era], #exReset, #exSave, #exOther');
    if (!t) return;
    if (t.id === 'settingsBtn') openSettings();
    else if (t.id === 'settingsClose') closeSettings();
    else if (t.dataset.stab) showTab(t.dataset.stab);
    else if (t.dataset.themePick) { prefs.theme = t.dataset.themePick; savePrefs(); applyTheme(prefs.theme); renderThemes(); }
    else if (t.dataset.exEra) {
      ALL.forEach(function (s) { if (s.e === t.dataset.exEra) { if (t.dataset.exTo === 'out') draft[s.t] = 1; else delete draft[s.t]; } });
      renderExcl();
    } else if (t.id === 'exOther') { ALL.forEach(function (s) { if (s.e === 'other') draft[s.t] = 1; }); renderExcl(); }
    else if (t.id === 'exReset') { draft = {}; renderExcl(); }
    else if (t.id === 'exSave') saveExcl();
  });
  $('exEra').innerHTML = '<option value="">All eras</option>' + Object.keys(ERA_NAMES).map(function (k) { return '<option value="' + k + '">' + esc(ERA_NAMES[k]) + '</option>'; }).join('');
  applyTheme(prefs.theme);

  if (!ALL.length) { $('kicker').textContent = 'Song list failed to load (songs.js must sit next to index.html)'; icons(); return; }
  render();
  visitors();
})();
