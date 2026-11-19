// Pruebas del motor: node --test tests/engine.test.js
const test = require("node:test"), assert = require("node:assert");
const E = require("../js/engine.js");
global.window = { WR_WORDS: null };
require("../js/words.js");
const dic = E.crearDiccionario(global.window.WR_WORDS);
E.usarDiccionario(dic);

test("la letra inicial ignora tildes y distingue Ñ", () => {
  assert.equal(E.inicial("Árbol"), "A"); assert.equal(E.inicial("ñandú"), "Ñ");
  assert.equal(E.inicial("nube"), "N"); assert.equal(E.inicial("über"), "U");
});
test("validación: válida, inexistente, mal inicio, repetida, tilde faltante", () => {
  const u = new Set();
  assert.equal(E.validar(dic, "Casa", "C", u).r, "valida");
  assert.equal(E.validar(dic, "casaa", "C", u).motivo, "noexiste");
  assert.equal(E.validar(dic, "perro", "C", u).motivo, "inicio");
  assert.equal(E.validar(dic, "cancion", "C", u).motivo, "noexiste");   // sin tilde = error
  assert.equal(E.validar(dic, "canción", "C", u).r, "valida");
  u.add("casa"); assert.equal(E.validar(dic, "CASA", "C", u).r, "repetida");
  assert.equal(E.validar(dic, "cat", "C", u).r, "valida");               // inglés mezclado
  assert.equal(E.validar(dic, "  ", "C", u).r, "vacia");
});
test("bolsa: sin repetición consecutiva y con difíciles escasas", () => {
  const b = E.crearBolsa(E.crearRng(7)); let prev = "", dif = 0; const N = 5000;
  for (let i = 0; i < N; i++) { const l = b.siguiente(); assert.notEqual(l, prev); prev = l; if ("WXKQÑ".includes(l)) dif++; }
  assert.ok(dif / N > 0.04 && dif / N < 0.10, "difíciles " + dif / N);
});
test("misma semilla ⇒ misma secuencia", () => {
  const a = E.crearBolsa(E.crearRng(42)), b = E.crearBolsa(E.crearRng(42));
  for (let i = 0; i < 200; i++) assert.equal(a.siguiente(), b.siguiente());
});
test("cada letra de la bolsa tiene palabras en la demo", () => {
  for (const l of E.ALFABETO) assert.ok((dic.porLetra[l] || []).length >= 5, l);
});
test("1 vs 1: 3 inválidas eliminan y gana el rival; repetida no cuesta vida", () => {
  const g = E.nuevaPartida({ modo: "1v1", dif: "medio", seed: 1 });
  const yo = g.turno;
  const j0 = g.jug[g.turno]; const w = dic.porLetra[g.letra][0];
  assert.equal(E.enviar(g, w).r, "valida"); assert.equal(j0.vidas, 3);
  g.turno = yo; g.letra = E.inicial(w); g.usadas.add(w); assert.equal(E.enviar(g, w).r, "repetida"); assert.equal(j0.vidas, 3);
  let i = 0;
  while (!g.fin && i++ < 20) { if (g.turno === yo) E.tiempoAgotado(g); else E.enviar(g, w + "zz"); }
  assert.ok(g.fin);
});
test("tiempo agotado resta 1 vida y pasa el turno", () => {
  const g = E.nuevaPartida({ modo: "ffa", dif: "facil", seed: 3 }); const t = g.turno;
  const r = E.tiempoAgotado(g); assert.equal(g.jug[t].vidas, 2); assert.notEqual(g.turno, t); assert.equal(r.r, "tiempo");
});
test("2v2 gana el equipo con algún integrante vivo", () => {
  const g = E.nuevaPartida({ modo: "2v2", dif: "medio", seed: 5 });
  g.jug.filter((p) => p.team === 1).forEach((p) => { p.vivo = false; p.vidas = 0; });
  g.turno = g.jug.findIndex((p) => p.team === 0); E.tiempoAgotado(g); assert.ok(g.fin); assert.equal(g.ganador, 0);
});
test("bot: Difícil responde más rápido y falla menos que Fácil", () => {
  const stats = (dif) => { let ms = 0, err = 0, n = 2000; const rng = E.crearRng(9);
    for (let i = 0; i < n; i++) { const g = E.nuevaPartida({ modo: "1v1", dif, seed: i + 1 }); const d = E.botDecidir(g, rng);
      if (d.palabra === null || !dic.tiene(d.palabra)) err++; if (isFinite(d.ms)) ms += d.ms; } return { ms: ms / n, err: err / n }; };
  const f = stats("facil"), m = stats("medio"), d = stats("dificil");
  assert.ok(d.ms < m.ms && m.ms < f.ms, JSON.stringify({ f, m, d }));
  assert.ok(d.err < m.err && m.err < f.err, JSON.stringify({ f, m, d }));
});
test("el bot nunca repite palabras usadas ni empieza con otra letra", () => {
  const g = E.nuevaPartida({ modo: "1v1", dif: "dificil", seed: 11 });
  for (let i = 0; i < 300 && !g.fin; i++) { const d = E.botDecidir(g, E.crearRng(i));
    if (d.palabra && dic.tiene(d.palabra)) { assert.ok(!g.usadas.has(d.palabra)); assert.equal(E.inicial(d.palabra), g.letra); E.enviar(g, d.palabra); } else E.tiempoAgotado(g); }
});
