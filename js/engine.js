/* WORD RUSH · motor del juego (puro, sin DOM, testeable en Node).
   Reglas según GDD: 10 s por turno, 3 vidas, la palabra EMPIEZA con la letra (D-01),
   ES+EN mezclados, repetida = rechazada sin perder vida, inexistente/mal escrita = -1 vida,
   sin autocorrección (la tilde cuenta), tiempo agotado = -1 vida. */
(function (root) {
  "use strict";
  const SEGUNDOS = 10, VIDAS = 3;
  const ALFABETO = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
  // Copias por letra en la bolsa (perfil «mixto», doc 03). W X K Q Ñ = difíciles: 1 copia.
  const COPIAS = { A:4,B:4,C:5,D:4,E:3,F:3,G:3,H:3,I:2,J:1,K:1,L:3,M:4,N:2,Ñ:1,O:2,P:5,Q:1,R:3,S:5,T:4,U:1,V:2,W:1,X:1,Y:1,Z:1 };
  // Dificultad del bot: tiempo de respuesta, probabilidad de fallar y fracción del vocabulario que domina.
  const DIFICULTADES = {
    facil:   { nombre: "Fácil",   minMs: 4500, maxMs: 8500, error: 0.35, vocab: 0.40 },
    medio:   { nombre: "Medio",   minMs: 2800, maxMs: 6500, error: 0.15, vocab: 0.75 },
    dificil: { nombre: "Difícil", minMs: 1200, maxMs: 4200, error: 0.04, vocab: 1.00 }
  };

  // Generador pseudoaleatorio con semilla (prototipo; el servidor real usará HMAC-SHA256, doc 03 §6).
  function crearRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clave = (w) => String(w).normalize("NFC").trim().toLowerCase();
  // Letra inicial base: ignora tildes y diéresis, pero Ñ es una letra distinta de N.
  function inicial(w) {
    const c = clave(w)[0];
    if (!c) return "";
    if (c === "ñ") return "Ñ";
    return c.normalize("NFD")[0].toUpperCase();
  }

  /* ---------- Bolsa de letras ---------- */
  function crearBolsa(rng) {
    let cola = [], ultima = "";
    function ciclo() {
      const b = [];
      ALFABETO.forEach((l) => { for (let i = 0; i < (COPIAS[l] || 0); i++) b.push(l); });
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      return b;
    }
    return {
      siguiente() {
        if (!cola.length) cola = ciclo();
        if (cola[0] === ultima) {               // nunca la misma letra dos turnos seguidos
          let j = cola.findIndex((x) => x !== ultima);
          if (j < 0) { cola = cola.concat(ciclo()); j = cola.findIndex((x) => x !== ultima); }
          if (j > 0) [cola[0], cola[j]] = [cola[j], cola[0]];
        }
        ultima = cola.shift();
        return ultima;
      }
    };
  }

  /* ---------- Diccionario ---------- */
  function crearDiccionario(listas) {
    const set = new Set(), porLetra = {};
    const meter = (w) => {
      const k = clave(w); if (!k || set.has(k)) return;
      set.add(k); (porLetra[inicial(k)] = porLetra[inicial(k)] || []).push(k);
    };
    ALFABETO.forEach((l) => {          // intercala ES y EN conservando el orden «más común primero»
      const es = ((listas.es || {})[l] || "").split(/\s+/).filter(Boolean);
      const en = ((listas.en || {})[l] || "").split(/\s+/).filter(Boolean);
      for (let i = 0; i < Math.max(es.length, en.length); i++) { if (es[i]) meter(es[i]); if (en[i]) meter(en[i]); }
    });
    return { tiene: (w) => set.has(clave(w)), porLetra, total: () => set.size, agregar: (ws) => ws.forEach(meter) };
  }

  function validar(dic, palabra, letra, usadas) {
    const k = clave(palabra);
    if (!k) return { r: "vacia" };
    if (!/^[a-zñáéíóúü]+$/.test(k)) return { r: "invalida", motivo: "caracteres" };
    if (inicial(k) !== letra) return { r: "invalida", motivo: "inicio" };
    if (usadas.has(k)) return { r: "repetida" };
    if (!dic.tiene(k)) return { r: "invalida", motivo: "noexiste" };
    return { r: "valida", k };
  }

  /* ---------- Partida ---------- */
  function nuevaPartida(o) {
    const seed = o.seed >>> 0, rng = crearRng(seed), d = DIFICULTADES[o.dif];
    const bot = (n, team) => ({ n: n + " " + d.nombre, team, bot: true });
    const yo = { n: o.nombre || "Tú", team: 0, bot: false };
    let jug;
    if (o.modo === "2v2") jug = [yo, bot("Rival 1", 1), { n: "Aliado " + d.nombre, team: 0, bot: true }, bot("Rival 2", 1)];
    else if (o.modo === "ffa") jug = [yo, bot("Bot 1", 1), bot("Bot 2", 2), bot("Bot 3", 3)];
    else jug = [yo, bot("Bot", 1)];
    jug.forEach((p) => { p.vidas = VIDAS; p.vivo = true; });
    const g = { modo: o.modo, dif: o.dif, jug, seed, bolsa: crearBolsa(rng), usadas: new Set(),
      historial: [], eliminados: [], turno: Math.floor(rng() * jug.length), nTurno: 0, fin: false, ganador: null, letra: "" };
    g.inicio = g.turno;
    iniciarTurno(g);
    return g;
  }
  function iniciarTurno(g) { g.letra = g.bolsa.siguiente(); g.nTurno++; }
  function equiposVivos(g) { return new Set(g.jug.filter((p) => p.vivo).map((p) => p.team)); }
  function pasar(g) {
    const eq = equiposVivos(g);
    if (eq.size <= 1) { g.fin = true; g.ganador = [...eq][0]; return; }
    do { g.turno = (g.turno + 1) % g.jug.length; } while (!g.jug[g.turno].vivo);
    iniciarTurno(g);
  }
  function perderVida(g) {
    const p = g.jug[g.turno]; p.vidas--;
    if (p.vidas <= 0) { p.vivo = false; g.eliminados.push(g.turno); }
  }
  function enviar(g, palabra, ms) {
    if (g.fin) return { r: "fin" };
    const idx = g.turno, v = validar(DIC(g), palabra, g.letra, g.usadas);
    if (v.r === "vacia" || v.r === "repetida") return { r: v.r, idx };
    const reg = { idx, letra: g.letra, palabra: clave(palabra), r: v.r, motivo: v.motivo, ms: ms || 0 };
    g.historial.push(reg);
    if (v.r === "valida") g.usadas.add(v.k); else perderVida(g);
    pasar(g);
    return { r: v.r, motivo: v.motivo, idx, palabra: reg.palabra, eliminado: !g.jug[idx].vivo };
  }
  function tiempoAgotado(g) {
    if (g.fin) return { r: "fin" };
    const idx = g.turno;
    g.historial.push({ idx, letra: g.letra, palabra: null, r: "tiempo", ms: SEGUNDOS * 1000 });
    perderVida(g); pasar(g);
    return { r: "tiempo", idx, eliminado: !g.jug[idx].vivo };
  }
  let _dic = null;
  const DIC = () => _dic;
  function usarDiccionario(d) { _dic = d; }

  /* ---------- Bot ---------- */
  // Devuelve { palabra, ms }; palabra=null significa que el bot no responde y se le agota el tiempo.
  function botDecidir(g, rng) {
    rng = rng || Math.random;
    const d = DIFICULTADES[g.dif], lista = (_dic.porLetra[g.letra] || []);
    const util = Math.max(1, Math.ceil(lista.length * d.vocab));
    const cand = lista.slice(0, util).filter((w) => !g.usadas.has(w));
    if (!cand.length) return { palabra: null, ms: Infinity };
    const w = cand[Math.floor(rng() * cand.length)];
    const ms = Math.min(9000, d.minMs + rng() * (d.maxMs - d.minMs) + w.length * 50);
    if (rng() < d.error) {                        // el bot también se equivoca
      if (rng() < 0.5) return { palabra: null, ms: Infinity };       // se queda sin respuesta
      const mala = w + w[w.length - 1];                              // errata
      return { palabra: _dic.tiene(mala) ? null : mala, ms };
    }
    return { palabra: w, ms };
  }

  root.WREngine = { SEGUNDOS, VIDAS, ALFABETO, COPIAS, DIFICULTADES, crearRng, clave, inicial, crearBolsa, crearDiccionario,
    validar, nuevaPartida, iniciarTurno, enviar, tiempoAgotado, botDecidir, usarDiccionario };
  if (typeof module !== "undefined") module.exports = root.WREngine;
})(typeof window !== "undefined" ? window : globalThis);
