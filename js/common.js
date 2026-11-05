/* =========================================================================
   KI-Seepferdchen – gemeinsame Logik für Beamer- und Handy-Ansicht
   - Spielzustand + Reducer (beide Seiten wenden dieselben Aktionen an)
   - Verbindung Beamer <-> Handy (PeerJS/WebRTC, im selben Browser BroadcastChannel)
   - Speicherung (IndexedDB), Bildverkleinerung, Seepferdchen-Grafik
   ========================================================================= */
(function (global) {
  'use strict';

  const APP_ID = 'ki-seepferdchen';
  const PEER_PREFIX = 'ki-seepferdchen-spielbrett-';
  const MAX_PLAYERS = 10;
  const DEFAULT_TITLE = 'KI-Seepferdchen';
  const DEFAULT_SUBTITLE = 'Gemeinsam tauchen wir in die Welt der KI';

  const COLORS = ['#FF5D8F', '#FFB020', '#36C275', '#2EA8F0', '#9B7BF7',
                  '#FF7A45', '#14C4B4', '#E95BD6', '#F2C200', '#5B7CFA'];
  const ANIMALS = ['🐠', '🐙', '🐢', '🦀', '🐬', '🐳', '🦑', '🐡', '🦞', '🐟'];
  const VIEWS = ['title', 'game', 'board'];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

  /* ---------------------------------------------------------------- Zustand */
  function defaultPlayers() {
    return Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      id: 'p' + (i + 1),
      name: 'Spieler ' + (i + 1),
      color: COLORS[i],
      emoji: ANIMALS[i],
      avatar: null,
      fit: 'cover',
      points: 0
    }));
  }

  function defaultState() {
    return {
      v: 1,
      title: DEFAULT_TITLE,
      subtitle: DEFAULT_SUBTITLE,
      playerCount: 4,
      players: defaultPlayers(),
      questions: [],
      current: 0,
      view: 'title',
      settings: { sound: true, celebration: true }
    };
  }

  function normalize(input) {
    const s = defaultState();
    if (!input || typeof input !== 'object') return s;
    if (typeof input.title === 'string') s.title = input.title;
    if (typeof input.subtitle === 'string') s.subtitle = input.subtitle;
    s.settings = Object.assign(s.settings, input.settings || {});
    const ip = Array.isArray(input.players) ? input.players : [];
    s.players = s.players.map((p, i) => {
      const o = ip[i] || {};
      return {
        id: p.id,
        name: typeof o.name === 'string' ? o.name : p.name,
        color: typeof o.color === 'string' ? o.color : p.color,
        emoji: typeof o.emoji === 'string' ? o.emoji : p.emoji,
        avatar: typeof o.avatar === 'string' ? o.avatar : null,
        fit: o.fit === 'contain' ? 'contain' : 'cover',
        points: Math.max(0, Number(o.points) || 0)
      };
    });
    s.questions = (Array.isArray(input.questions) ? input.questions : [])
      .filter(q => q && q.id)
      .map(q => ({ id: String(q.id), image: typeof q.image === 'string' ? q.image : null, text: String(q.text || '') }));
    s.playerCount = clamp(Number(input.playerCount) || 4, 1, MAX_PLAYERS);
    s.current = clamp(Number(input.current) || 0, 0, Math.max(0, s.questions.length - 1));
    s.view = VIEWS.includes(input.view) ? input.view : 'title';
    return s;
  }

  function isEmpty(s) {
    return s.questions.length === 0 &&
      s.title === DEFAULT_TITLE &&
      s.players.every((p, i) => !p.avatar && p.points === 0 && p.name === 'Spieler ' + (i + 1));
  }

  const activePlayers = s => s.players.slice(0, s.playerCount);

  /* Reducer: verändert den Zustand und gibt ihn zurück. Muss deterministisch sein. */
  function reduce(s, a) {
    if (!a || !a.type) return s;
    const findP = id => s.players.find(p => p.id === id);
    const qIndex = id => s.questions.findIndex(q => q.id === id);
    switch (a.type) {
      case 'setPlayerCount':
        s.playerCount = clamp(a.n | 0, 1, MAX_PLAYERS);
        break;
      case 'updatePlayer': {
        const p = findP(a.id);
        if (p && a.patch) ['name', 'avatar', 'color', 'emoji', 'fit'].forEach(k => { if (k in a.patch) p[k] = a.patch[k]; });
        break;
      }
      case 'points': {
        const p = findP(a.id);
        if (p) p.points = Math.max(0, p.points + (a.delta | 0));
        break;
      }
      case 'pointsAll':
        activePlayers(s).forEach(p => { p.points = Math.max(0, p.points + (a.delta | 0)); });
        break;
      case 'resetPoints':
        s.players.forEach(p => { p.points = 0; });
        break;
      case 'addQuestion':
        if (a.q && a.q.id) {
          s.questions.push({ id: a.q.id, image: a.q.image || null, text: a.q.text || '' });
          if (a.show) s.current = s.questions.length - 1;
        }
        break;
      case 'updateQuestion': {
        const q = s.questions[qIndex(a.id)];
        if (q && a.patch) { if ('image' in a.patch) q.image = a.patch.image; if ('text' in a.patch) q.text = a.patch.text; }
        break;
      }
      case 'deleteQuestion': {
        const i = qIndex(a.id);
        if (i >= 0) {
          s.questions.splice(i, 1);
          if (i < s.current) s.current--;
          s.current = clamp(s.current, 0, Math.max(0, s.questions.length - 1));
        }
        break;
      }
      case 'moveQuestion': {
        const i = qIndex(a.id), j = i + (a.dir < 0 ? -1 : 1);
        if (i >= 0 && j >= 0 && j < s.questions.length) {
          const shownId = s.questions[s.current] && s.questions[s.current].id;
          [s.questions[i], s.questions[j]] = [s.questions[j], s.questions[i]];
          const k = s.questions.findIndex(q => q.id === shownId);
          if (k >= 0) s.current = k;
        }
        break;
      }
      case 'goto':
        s.current = clamp(a.index | 0, 0, Math.max(0, s.questions.length - 1));
        if (a.view && VIEWS.includes(a.view)) s.view = a.view;
        break;
      case 'step':
        s.current = clamp(s.current + (a.delta | 0), 0, Math.max(0, s.questions.length - 1));
        break;
      case 'setView':
        if (VIEWS.includes(a.view)) s.view = a.view;
        break;
      case 'setMeta':
        if (a.patch) {
          if (typeof a.patch.title === 'string') s.title = a.patch.title;
          if (typeof a.patch.subtitle === 'string') s.subtitle = a.patch.subtitle;
        }
        break;
      case 'setSettings':
        s.settings = Object.assign({}, s.settings, a.patch || {});
        break;
      case 'replaceState':
        return normalize(a.state);
      case 'resetAll':
        return defaultState();
      case 'celebrate':
      default:
        break;
    }
    return s;
  }

  /* ----------------------------------------------------- Nachrichten-Format */
  // Große Nachrichten (Bilder!) werden in Stücke geteilt, damit WebRTC sie sicher überträgt.
  const CHUNK = 15000;
  function encode(obj) {
    const str = JSON.stringify(obj);
    if (str.length <= CHUNK) return [str];
    const id = uid(), n = Math.ceil(str.length / CHUNK), out = [];
    for (let i = 0; i < n; i++) out.push(JSON.stringify({ __chunk: id, i, n, d: str.slice(i * CHUNK, (i + 1) * CHUNK) }));
    return out;
  }
  function makeDecoder(cb) {
    const buf = {};
    return raw => {
      let m;
      try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
      if (m && m.__chunk) {
        const b = buf[m.__chunk] || (buf[m.__chunk] = { n: m.n, parts: [], got: 0 });
        if (b.parts[m.i] === undefined) { b.parts[m.i] = m.d; b.got++; }
        if (b.got === b.n) {
          delete buf[m.__chunk];
          try { cb(JSON.parse(b.parts.join(''))); } catch (e) { console.warn(e); }
        }
      } else if (m) cb(m);
    };
  }
  function sendConn(conn, obj) {
    if (!conn || !conn.open) return;
    try { encode(obj).forEach(part => conn.send(part)); } catch (e) { console.warn('Senden fehlgeschlagen', e); }
  }
  function openChannel() {
    try { return new BroadcastChannel(APP_ID); } catch (e) { return null; }
  }
  const randomCode = () => String(1000 + Math.floor(Math.random() * 9000));

  /* ------------------------------------------------------- Beamer = Host */
  function createHost(opts) {
    const CODE_KEY = APP_ID + '-code';
    let code = null;
    try { code = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!/^\d{4}$/.test(code || '')) code = randomCode();
    const saveCode = () => { try { localStorage.setItem(CODE_KEY, code); } catch (e) {} };
    saveCode();

    const conns = new Set();          // nur Handys mit richtiger PIN
    const localSeen = new Map();
    const localAuthed = new Set();
    let fails = 0, lockUntil = 0;

    // Jede neue Verbindung muss zuerst mit der richtigen PIN „hallo“ sagen.
    async function gate(msg, reply, isAuthed, setAuthed, kick) {
      if (isAuthed()) { opts.onMessage(msg, reply); return; }
      if (!msg || msg.kind !== 'hello') return;
      if (Date.now() < lockUntil) {
        reply({ kind: 'denied', reason: 'locked', wait: Math.ceil((lockUntil - Date.now()) / 1000) });
        kick(); return;
      }
      const ok = opts.checkPin ? await opts.checkPin(String(msg.pin || '')) : true;
      if (!ok) {
        fails++;
        if (fails >= 5) { fails = 0; lockUntil = Date.now() + 60000; }
        reply({ kind: 'denied', reason: 'pin' });
        kick(); return;
      }
      fails = 0;
      setAuthed();
      opts.onMessage(msg, reply);
    }
    let peer = null, idTries = 0, retryTimer = null;
    const status = { code, online: false, error: null, controllers: 0 };

    function emit() {
      const now = Date.now();
      for (const [k, t] of localSeen) if (now - t > 15000) localSeen.delete(k);
      status.code = code;
      status.controllers = conns.size + localSeen.size;
      opts.onStatus && opts.onStatus(Object.assign({}, status));
    }
    setInterval(emit, 5000);

    function retry(ms) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(start, ms);
    }

    function start() {
      if (typeof Peer === 'undefined') {
        status.error = 'Verbindungs-Bibliothek fehlt.';
        emit(); return;
      }
      try { if (peer) peer.destroy(); } catch (e) {}
      const me = new Peer(PEER_PREFIX + code, { debug: 0 });
      peer = me;
      me.on('open', () => { idTries = 0; status.online = true; status.error = null; emit(); });
      me.on('connection', conn => {
        let authed = false;
        const reply = m => sendConn(conn, m);
        const dec = makeDecoder(msg => gate(msg, reply, () => authed,
          () => { authed = true; conns.add(conn); emit(); },
          () => setTimeout(() => { try { conn.close(); } catch (e) {} }, 800)));
        conn.on('data', dec);
        const gone = () => { conns.delete(conn); emit(); };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      me.on('disconnected', () => {
        if (peer !== me || me.destroyed) return;
        status.online = false; emit();
        setTimeout(() => { if (peer === me && !me.destroyed) { try { me.reconnect(); } catch (e) { retry(3000); } } }, 2000);
      });
      me.on('error', err => {
        if (peer !== me) return;
        if (err.type === 'unavailable-id') {
          // Nach einem Neuladen ist der alte Code oft noch kurz belegt -> erst warten, dann neuen Code nehmen
          idTries++;
          if (idTries > 3) { code = randomCode(); saveCode(); idTries = 0; }
          status.online = false; status.error = 'Code wird reserviert …'; emit();
          retry(idTries ? 4000 : 500);
        } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
          status.online = false;
          status.error = 'Keine Internet-Verbindung zum Vermittlungs-Server – neuer Versuch …';
          emit(); retry(5000);
        }
      });
    }

    const bc = openChannel();
    if (bc) {
      bc.onmessage = e => {
        const m = e.data;
        if (!m || m.from !== 'client') return;
        if (m.kind === 'bye') { localSeen.delete(m.cid); localAuthed.delete(m.cid); emit(); return; }
        const reply = r => bc.postMessage(Object.assign({}, r, { from: 'host', to: m.cid }));
        gate(m, reply, () => localAuthed.has(m.cid),
          () => { localAuthed.add(m.cid); localSeen.set(m.cid, Date.now()); emit(); },
          () => {});
        if (localAuthed.has(m.cid)) localSeen.set(m.cid, Date.now());
      };
    }

    function broadcast(msg) {
      if (conns.size) {
        const parts = encode(msg);
        conns.forEach(c => { if (c.open) parts.forEach(p => { try { c.send(p); } catch (e) {} }); });
      }
      if (bc) bc.postMessage(Object.assign({}, msg, { from: 'host' }));
    }

    start();
    emit();
    return { broadcast, getCode: () => code };
  }

  /* ------------------------------------------------------- Handy = Client */
  function createClient(opts) {
    const cid = uid();
    let alive = true, connected = false, lastPong = 0, denied = false;
    const hello = () => ({ kind: 'hello', pin: opts.pin || '' });
    let peer = null, conn = null, retryTimer = null, openTimer = null, pingTimer = null;
    const setStatus = (state, text) => opts.onStatus && opts.onStatus({ state, text });
    const onMsg = m => {
      lastPong = Date.now();
      if (m.kind === 'pong') return;
      if (m.kind === 'denied') {
        denied = true; connected = false;
        clearTimeout(retryTimer);
        setStatus('denied', m.reason === 'locked'
          ? 'Zu viele falsche Versuche – bitte ' + (m.wait || 60) + ' Sekunden warten.'
          : 'Die PIN passt nicht zu diesem Beamer.');
        return;
      }
      if (!connected) { connected = true; setStatus('connected', 'Verbunden'); }
      opts.onMessage(m);
    };

    if (opts.local) {
      const bc = openChannel();
      if (!bc) { setStatus('error', 'Dieser Browser kann keine lokale Verbindung.'); return { send() {}, close() {} }; }
      const post = m => bc.postMessage(Object.assign({}, m, { from: 'client', cid }));
      bc.onmessage = e => {
        const m = e.data;
        if (!m || m.from !== 'host' || (m.to && m.to !== cid)) return;
        onMsg(m);
      };
      setStatus('connecting', 'Suche Beamer-Fenster …');
      post(hello());
      pingTimer = setInterval(() => {
        if (denied) return;
        post(connected ? { kind: 'ping' } : hello());
        if (connected && Date.now() - lastPong > 12000) { connected = false; setStatus('lost', 'Beamer-Fenster nicht erreichbar …'); }
      }, 4000);
      addEventListener('pagehide', () => post({ kind: 'bye' }));
      return {
        send: post,
        close() { alive = false; clearInterval(pingTimer); post({ kind: 'bye' }); bc.close(); },
        reconnect() { denied = false; post(hello()); },
        setPin(p) { opts.pin = p; }
      };
    }

    function retry(ms) {
      clearTimeout(retryTimer);
      if (alive && !denied) retryTimer = setTimeout(connect, ms);
    }
    function lost(text) {
      if (denied) return;
      if (connected) { connected = false; }
      setStatus('lost', text || 'Verbindung verloren – verbinde neu …');
      retry(2500);
    }
    function connect() {
      if (!alive) return;
      clearTimeout(openTimer);
      if (conn) { try { conn.close(); } catch (e) {} conn = null; }
      if (!peer || peer.destroyed || peer.disconnected) { makePeer(); return; }
      setStatus('connecting', 'Verbinde mit Beamer ' + opts.code + ' …');
      const c = peer.connect(PEER_PREFIX + opts.code, { reliable: true, serialization: 'raw' });
      conn = c;
      const dec = makeDecoder(onMsg);
      c.on('open', () => {
        clearTimeout(openTimer);
        lastPong = Date.now();
        sendConn(c, hello());
      });
      c.on('data', dec);
      c.on('close', () => { if (conn === c) lost(); });
      c.on('error', () => { if (conn === c) lost(); });
      openTimer = setTimeout(() => { if (conn === c && !c.open) lost('Beamer antwortet nicht – neuer Versuch …'); }, 9000);
    }
    function makePeer() {
      if (typeof Peer === 'undefined') { setStatus('error', 'Verbindungs-Bibliothek fehlt.'); return; }
      try { if (peer) peer.destroy(); } catch (e) {}
      setStatus('connecting', 'Verbinde …');
      const me = new Peer({ debug: 0 });
      peer = me;
      me.on('open', () => { if (peer === me) connect(); });
      me.on('error', err => {
        if (peer !== me) return;
        if (err.type === 'peer-unavailable') {
          connected = false;
          setStatus('notfound', 'Beamer mit Code ' + opts.code + ' nicht gefunden. Ist die Beamer-Seite offen?');
          retry(3500);
        } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(err.type)) {
          connected = false;
          setStatus('lost', 'Keine Internet-Verbindung – neuer Versuch …');
          try { me.destroy(); } catch (e) {}
          retry(4000);
        }
      });
      me.on('disconnected', () => {
        if (peer !== me || me.destroyed) return;
        try { me.reconnect(); } catch (e) { retry(3000); }
      });
    }
    pingTimer = setInterval(() => {
      if (connected && conn && conn.open) sendConn(conn, { kind: 'ping' });
      if (connected && Date.now() - lastPong > 15000) lost();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && alive && !denied && (!conn || !conn.open)) { clearTimeout(retryTimer); connect(); }
    });
    makePeer();
    return {
      send(m) { sendConn(conn, m); },
      close() { alive = false; clearInterval(pingTimer); clearTimeout(retryTimer); try { peer && peer.destroy(); } catch (e) {} },
      reconnect() { denied = false; clearTimeout(retryTimer); connect(); },
      setPin(p) { opts.pin = p; }
    };
  }

  /* ------------------------------------------------------------ IndexedDB */
  const store = (() => {
    let dbp = null;
    function db() {
      if (!dbp) dbp = new Promise((res, rej) => {
        const r = indexedDB.open(APP_ID, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    return {
      async get(k) {
        try {
          const d = await db();
          return await new Promise((res, rej) => {
            const r = d.transaction('kv').objectStore('kv').get(k);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
          });
        } catch (e) { return undefined; }
      },
      async set(k, v) {
        try {
          const d = await db();
          await new Promise((res, rej) => {
            const t = d.transaction('kv', 'readwrite');
            t.objectStore('kv').put(v, k);
            t.oncomplete = res; t.onerror = () => rej(t.error);
          });
        } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
      }
    };
  })();

  /* -------------------------------------------------------- Bilder */
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = url;
    });
  }
  // Durchsichtigen Rand (z. B. bei Logos) finden, damit das Bild den Platz voll nutzt
  function opaqueBox(img, w, h) {
    try {
      const sc = Math.min(1, 400 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, cw, ch);
      const d = ctx.getImageData(0, 0, cw, ch).data;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (d[(y * cw + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const pad = 1;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(cw - 1, x1 + pad); y1 = Math.min(ch - 1, y1 + pad);
      if (x0 === 0 && y0 === 0 && x1 === cw - 1 && y1 === ch - 1) return null;
      return { x: x0 / sc, y: y0 / sc, w: (x1 - x0 + 1) / sc, h: (y1 - y0 + 1) / sc };
    } catch (e) { return null; }
  }

  async function resizeImage(file, max, opts) {
    const img = await loadImage(file);
    let w = img.naturalWidth || 800, h = img.naturalHeight || 800;
    const alpha = /png|gif|webp|svg/i.test(file.type);
    let src = { x: 0, y: 0, w, h };
    if (alpha && opts && opts.trim) {
      const box = opaqueBox(img, w, h);
      if (box) { src = box; w = Math.round(box.w); h = Math.round(box.h); }
    }
    const sc = Math.min(1, max / Math.max(w, h));
    w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, w, h);
    return alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
  }

  /* -------------------------------------------------------- Grafik */
  function seahorseSVG(body = '#FFB020', fin = '#FF7A45', belly = '#FFE08A') {
    return `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M36 56 q-18 6 -15 22 q10 -2 15 6 q-13 6 -9 20 q10 -4 17 3 Z" fill="${fin}"/>
      <path d="M57 96 C 66 118, 58 140, 40 142 C 24 143, 19 126, 31 119 C 40 114, 47 122, 41 129" fill="none" stroke="${body}" stroke-width="13" stroke-linecap="round"/>
      <path d="M44 36 C 29 52, 29 78, 43 95 C 53 107, 74 101, 77 83 C 79 66, 67 54, 61 44 Z" fill="${body}"/>
      <path d="M62 52 C 75 62, 79 78, 71 92 C 67 98, 58 99, 56 92 C 62 80, 62 66, 56 54 Z" fill="${belly}"/>
      <path d="M61 63 h11 M63 73 h12 M62 83 h10" stroke="${body}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
      <path d="M38 22 l-7 -11 l13 4 l2 -11 l9 11 l6 -9 l3 13 Z" fill="${fin}"/>
      <circle cx="56" cy="33" r="20" fill="${body}"/>
      <path d="M70 26 L 97 30 Q 105 32 101 40 L 72 43 Z" fill="${body}"/>
      <ellipse cx="100" cy="35" rx="5" ry="6.5" fill="${body}"/>
      <circle cx="62" cy="29" r="8.5" fill="#fff"/>
      <circle cx="64" cy="30" r="5" fill="#1b1b3a"/>
      <circle cx="65.8" cy="27.8" r="1.8" fill="#fff"/>
      <circle cx="56" cy="43" r="4.2" fill="#FF7AA8" opacity=".65"/>
    </svg>`;
  }

  /* -------------------------------------------------------- PIN */
  // Die PIN steht nie im Code – sie wird auf dem Gerät nur als Prüfsumme gespeichert.
  const PIN_KEY = APP_ID + '-pin';
  const pin = {
    has() { try { return !!localStorage.getItem(PIN_KEY); } catch (e) { return false; } },
    async hash(p, salt) {
      if (global.crypto && crypto.subtle) {
        const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + p));
        return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      let h = 0; for (const c of salt + ':' + p) h = (h * 31 + c.charCodeAt(0)) | 0;
      return 'x' + h;
    },
    async set(p) {
      const salt = uid();
      try { localStorage.setItem(PIN_KEY, JSON.stringify({ salt, h: await pin.hash(p, salt) })); } catch (e) {}
    },
    async check(p) {
      try {
        const o = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
        return !!o && o.h === await pin.hash(String(p), o.salt);
      } catch (e) { return false; }
    },
    clear() { try { localStorage.removeItem(PIN_KEY); } catch (e) {} }
  };

  /* Sperrbildschirm mit Zahlenfeld.
     mode: 'auto' (festlegen, falls noch keine PIN – sonst prüfen), 'set' (neue PIN), 'ask' (nur abfragen)
     Liefert ein Promise mit der eingegebenen PIN (oder null bei Abbrechen). */
  function lockScreen(o) {
    o = o || {};
    let mode = o.mode || 'auto';
    if (mode === 'auto') mode = pin.has() ? 'check' : 'set';
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'ks-lock';
      el.innerHTML = `<style>
        .ks-lock{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;
          background:linear-gradient(180deg,#22a6e0 0%,#0b6cb8 55%,#062a5c 100%);font-family:'Fredoka','Trebuchet MS',system-ui,sans-serif;color:#0d2346}
        .ks-box{background:#fff;border-radius:28px;padding:22px 22px 18px;width:min(360px,100%);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35)}
        .ks-horse{width:72px;margin:-62px auto 4px;filter:drop-shadow(0 6px 8px rgba(0,0,0,.25))}
        .ks-t{font-size:22px;font-weight:700;margin-bottom:4px}
        .ks-s{font-size:14px;color:#5a7393;min-height:20px}
        .ks-s.err{color:#c0392b;font-weight:600}
        .ks-dots{display:flex;gap:14px;justify-content:center;margin:16px 0 18px}
        .ks-dots i{width:18px;height:18px;border-radius:50%;border:3px solid #0b61a8;transition:background .15s}
        .ks-dots i.on{background:#0b61a8}
        .ks-dots.shake{animation:ksshake .4s}
        @keyframes ksshake{20%,60%{transform:translateX(-10px)}40%,80%{transform:translateX(10px)}}
        .ks-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .ks-pad button{font:600 26px 'Fredoka','Trebuchet MS',system-ui,sans-serif;height:62px;border:0;border-radius:18px;background:#e8f6ff;color:#0b61a8;cursor:pointer}
        .ks-pad button:active{transform:scale(.95)}
        .ks-pad button.ghost{background:none}
        .ks-links{display:flex;justify-content:center;gap:18px;margin-top:14px}
        .ks-links button{border:0;background:none;color:#0b61a8;font:600 14px 'Fredoka','Trebuchet MS',system-ui,sans-serif;cursor:pointer;padding:6px}
      </style>
      <div class="ks-box">
        <div class="ks-horse">${seahorseSVG()}</div>
        <div class="ks-t"></div><div class="ks-s"></div>
        <div class="ks-dots"><i></i><i></i><i></i><i></i></div>
        <div class="ks-pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          <button class="ghost" data-k="" disabled></button><button data-k="0">0</button><button data-k="del" aria-label="Löschen">⌫</button></div>
        <div class="ks-links"></div>
      </div>`;
      document.body.appendChild(el);
      const $t = el.querySelector('.ks-t'), $s = el.querySelector('.ks-s'), $d = el.querySelector('.ks-dots'), $l = el.querySelector('.ks-links');
      let val = '', first = null, fails = 0, waitUntil = 0;
      function texts(sub, err) {
        $t.textContent = o.title || (mode === 'set' ? (first ? 'PIN wiederholen' : 'PIN festlegen') : 'PIN eingeben');
        $s.textContent = sub != null ? sub : (o.subtitle || (mode === 'set' && !first ? 'Wähle eine 4-stellige PIN. Ohne sie lässt sich das Spiel nicht öffnen.' : ''));
        $s.className = 'ks-s' + (err ? ' err' : '');
        $l.innerHTML = (mode === 'check' && o.onReset ? '<button data-l="reset">PIN vergessen?</button>' : '') +
                       (o.cancel ? '<button data-l="cancel">Abbrechen</button>' : '');
      }
      function dots() { $d.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < val.length)); }
      function wrong(msg) {
        val = ''; dots(); $d.classList.remove('shake'); void $d.offsetWidth; $d.classList.add('shake');
        try { navigator.vibrate && navigator.vibrate(120); } catch (e) {}
        texts(msg, true);
      }
      function done(p) { cleanup(); el.remove(); resolve(p); }
      async function submit() {
        const p = val;
        if (mode === 'ask') return done(p);
        if (mode === 'set') {
          if (!first) { first = p; val = ''; dots(); texts(); return; }
          if (p !== first) { first = null; texts(); return wrong('Die beiden PINs waren unterschiedlich – bitte nochmal.'); }
          if (!o.noStore) await pin.set(p);
          return done(p);
        }
        if (await pin.check(p)) return done(p);
        fails++;
        if (fails >= 5) { fails = 0; waitUntil = Date.now() + 30000; return wrong('Zu viele Versuche – bitte 30 Sekunden warten.'); }
        wrong('Falsche PIN.');
      }
      function key(k) {
        if (Date.now() < waitUntil) { texts('Bitte noch ' + Math.ceil((waitUntil - Date.now()) / 1000) + ' Sekunden warten.', true); return; }
        if (k === 'del') { val = val.slice(0, -1); dots(); return; }
        if (!/^\d$/.test(k) || val.length >= 4) return;
        val += k; dots();
        if (val.length === 4) setTimeout(submit, 120);
      }
      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.k != null) key(b.dataset.k);
        else if (b.dataset.l === 'cancel') done(null);
        else if (b.dataset.l === 'reset') {
          if (!confirm('PIN vergessen?\n\nDann werden alle auf diesem Gerät gespeicherten Spieler, Fragen und Bilder gelöscht. Danach legst du eine neue PIN fest.')) return;
          await o.onReset();
          pin.clear(); mode = 'set'; first = null; val = ''; dots(); texts();
        }
      });
      const onKey = e => {
        if (/^\d$/.test(e.key)) key(e.key);
        else if (e.key === 'Backspace') key('del');
        else if (e.key === 'Escape' && o.cancel) done(null);
        else return;
        e.preventDefault(); e.stopPropagation();
      };
      const cleanup = () => document.removeEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      texts();
    });
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  global.KS = {
    APP_ID, MAX_PLAYERS, COLORS, ANIMALS,
    uid, clamp, esc,
    defaultState, normalize, reduce, isEmpty, activePlayers,
    createHost, createClient, store, resizeImage, seahorseSVG, pin, lockScreen
  };
})(window);
