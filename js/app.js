/* WORD RUSH · interfaz y flujo de partida del prototipo (usa js/engine.js). */
(function () {
  "use strict";
  const E = window.WREngine;
  const $ = (s) => document.querySelector(s);
  const dic = E.crearDiccionario(window.WR_WORDS);
  E.usarDiccionario(dic);

  /* ---------- Persistencia local (try/catch: puede no estar disponible) ---------- */
  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  let ajustes = Object.assign({ modo: "1v1", dif: "medio", reducido: false, grande: false }, leer("wr_ajustes", {}));
  let stats = Object.assign({ partidas: 0, victorias: 0, racha: 0, mejor: 0, xp: 0, monedas: 0 }, leer("wr_stats", {}));

  const DESC = { facil: "El bot es lento, falla bastante y usa vocabulario básico.",
    medio: "Ritmo medio y algún error ocasional.", dificil: "Rápido, casi sin errores y con vocabulario amplio." };
  const MODOS = { "1v1": "1 vs 1", "2v2": "2 vs 2", ffa: "4 jugadores" };
  const MOTIVOS = { noexiste: "no existe (o está mal escrita)", inicio: "no empieza con la letra", caracteres: "solo se permiten letras" };

  /* ---------- Menú ---------- */
  function pintarMenu() {
    document.body.classList.toggle("reducido", ajustes.reducido);
    document.body.classList.toggle("grande", ajustes.grande);
    $("#btnEfectos").setAttribute("aria-pressed", ajustes.reducido);
    $("#btnTexto").setAttribute("aria-pressed", ajustes.grande);
    document.querySelectorAll("#segModo button").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === ajustes.modo));
    document.querySelectorAll("#segDif button").forEach((b) => b.setAttribute("aria-checked", b.dataset.dif === ajustes.dif));
    $("#descDif").textContent = DESC[ajustes.dif];
    const nivel = Math.floor(stats.xp / 100) + 1;
    $("#perfil").innerHTML = [["Nivel", nivel], ["Victorias", stats.victorias], ["Racha", stats.racha], ["Monedas", stats.monedas]]
      .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
    $("#infoDic").textContent = `Diccionario de demostración: ${dic.total()} palabras (ES + EN).`;
    guardar("wr_ajustes", ajustes);
  }
  function mostrar(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); window.scrollTo(0, 0); }

  $("#segModo").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { ajustes.modo = b.dataset.modo; pintarMenu(); } });
  $("#segDif").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { ajustes.dif = b.dataset.dif; pintarMenu(); } });
  $("#btnEfectos").onclick = () => { ajustes.reducido = !ajustes.reducido; pintarMenu(); };
  $("#btnTexto").onclick = () => { ajustes.grande = !ajustes.grande; pintarMenu(); };
  $("#btnReglas").onclick = () => $("#dlgReglas").showModal();
  $("#btnJugar").onclick = iniciar;
  $("#btnRevancha").onclick = iniciar;
  $("#btnMenu").onclick = () => { pintarMenu(); mostrar("menu"); };

  /* ---------- Partida ---------- */
  let g, fase = "menu", deadline = 0, durTurno = E.SEGUNDOS * 1000, tBot = null, tPausa = null, tick = null, abandono = false;
  const factor = () => (g.jug[0].vivo ? 1 : 0.2);          // si estás eliminado, la partida se acelera

  function iniciar() {
    abandono = false;
    g = E.nuevaPartida({ modo: ajustes.modo, dif: ajustes.dif, nombre: "Tú", seed: (Math.random() * 4294967296) >>> 0 });
    $("#infoModo").textContent = `${MODOS[g.modo]} · Bot ${E.DIFICULTADES[g.dif].nombre}`;
    $("#historial").innerHTML = "";
    mostrar("juego");
    clearInterval(tick); tick = setInterval(alTick, 100);
    msg(`Sorteo: empieza ${g.jug[g.turno].n}`, "info");
    abrirTurno();
  }

  function pintarJugadores() {
    $("#jugadores").innerHTML = g.jug.map((p, i) => {
      const eq = g.modo === "2v2" ? (p.team === 0 ? "Tu equipo" : "Rivales") : (p.bot ? "Bot" : "Jugador");
      return `<div class="jug ${i === g.turno && !g.fin ? "activo" : ""} ${p.vivo ? "" : "elim"} ${i === 0 ? "tu" : ""}">
        <span class="eq">${eq}</span><span class="nombre">${p.n}</span>
        <span class="vidas" aria-label="${p.vidas} vidas">${"♥".repeat(p.vidas)}${"♡".repeat(E.VIDAS - p.vidas)}</span></div>`;
    }).join("");
  }

  function msg(t, tipo) { const m = $("#msg"); m.textContent = t; m.className = "msg " + (tipo || "info"); }

  function abrirTurno() {
    fase = "turno"; clearTimeout(tBot); clearTimeout(tPausa);
    durTurno = E.SEGUNDOS * 1000 * factor(); deadline = performance.now() + durTurno;
    const L = $("#letra"); L.textContent = g.letra; L.classList.remove("pop"); void L.offsetWidth; L.classList.add("pop");
    $("#consigna").innerHTML = `Palabra que <b>empiece</b> con <b>${g.letra}</b>`;
    pintarJugadores();
    const p = g.jug[g.turno], inp = $("#palabra");
    if (!p.bot) {
      inp.disabled = false; $("#btnEnviar").disabled = false; inp.value = ""; inp.focus();
      msg("¡Tu turno!", "info");
    } else {
      inp.disabled = true; $("#btnEnviar").disabled = true;
      msg(`${p.n} está escribiendo…`, "info");
      const d = E.botDecidir(g);
      if (d.palabra !== null) { const palabra = d.palabra, turno = g.nTurno;
        tBot = setTimeout(() => { if (fase === "turno" && g.nTurno === turno) resolver(E.enviar(g, palabra, d.ms)); }, d.ms * factor()); }
    }
  }

  function alTick() {
    if (fase !== "turno") return;
    const resto = Math.max(0, deadline - performance.now()), frac = resto / durTurno;
    $("#anillo").style.strokeDashoffset = 339.3 * (1 - frac);
    const s = Math.ceil((resto / durTurno) * E.SEGUNDOS);
    $("#segs").textContent = s;
    const r = document.querySelector(".reloj");
    r.classList.toggle("bajo", s <= 5 && s > 3); r.classList.toggle("critico", s <= 3);
    if (resto <= 0) resolver(E.tiempoAgotado(g));
  }

  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (fase !== "turno" || g.jug[g.turno].bot) return;
    const palabra = $("#palabra").value;
    resolver(E.enviar(g, palabra, durTurno - (deadline - performance.now())));
  });

  function resolver(r) {
    if (r.r === "vacia" || r.r === "fin") return;                  // vacío: se ignora sin penalización
    if (r.r === "repetida") {                                       // repetida: sin vida, sigue el turno
      msg("Esa palabra ya se usó. No pierdes vida: prueba otra.", "err");
      $("#palabra").value = ""; sacudir(); return;
    }
    fase = "pausa"; clearTimeout(tBot);
    const quien = g.jug[r.idx].n, yo = r.idx === 0;
    if (r.r === "valida") msg(`✓ ${quien}: «${r.palabra}»`, "ok");
    else if (r.r === "tiempo") msg(`⏱ ${yo ? "Se acabó tu tiempo" : "A " + quien + " se le acabó el tiempo"}: −1 vida`, "err");
    else msg(`✗ ${yo ? "«" + r.palabra + "»" : quien + " dijo «" + r.palabra + "»"} ${MOTIVOS[r.motivo]}: −1 vida`, "err");
    if (r.eliminado) msg($("#msg").textContent + ` · ${quien} eliminado`, "err");
    if (yo && r.r !== "valida") sacudir();
    $("#palabra").disabled = true; $("#btnEnviar").disabled = true;
    const h = document.createElement("span"); h.className = r.r === "valida" ? "v" : "x";
    h.textContent = r.palabra || "—"; $("#historial").prepend(h);
    while ($("#historial").children.length > 8) $("#historial").lastChild.remove();
    pintarJugadores();
    tPausa = setTimeout(() => { if (g.fin) terminar(); else abrirTurno(); }, 1100 * factor());
  }
  function sacudir() { const f = $("#form"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake"); }

  $("#btnSalir").onclick = () => {
    if (!confirm("¿Abandonar la partida? Cuenta como derrota.")) return;
    abandono = true; g.fin = true; g.ganador = g.jug.find((p) => p.team !== 0).team; terminar();
  };

  /* ---------- Resultados ---------- */
  function terminar() {
    fase = "fin"; clearTimeout(tBot); clearTimeout(tPausa); clearInterval(tick);
    const gane = g.ganador === 0 && !abandono;
    const validas = g.historial.filter((h) => h.idx === 0 && h.r === "valida").length;
    const xp = abandono ? 0 : 10 + validas * 2 + (gane ? 30 : 0), monedas = abandono ? 0 : 10 + (gane ? 10 : 0);
    stats.partidas++; stats.xp += xp; stats.monedas += monedas;
    if (gane) { stats.victorias++; stats.racha++; stats.mejor = Math.max(stats.mejor, stats.racha); } else stats.racha = 0;
    guardar("wr_stats", stats);
    const c = $(".resultado"); c.className = "card resultado " + (gane ? "win" : "lose");
    $("#finTitulo").textContent = abandono ? "Abandonaste" : gane ? "¡Victoria!" : "Derrota";
    const k = g.eliminados.indexOf(0), pos = g.modo === "ffa" && !abandono ? ` · Puesto ${k < 0 ? 1 : 4 - k}º` : "";
    $("#finSub").textContent = `${MODOS[g.modo]} contra bots ${E.DIFICULTADES[g.dif].nombre}${pos}`;
    $("#finPremios").innerHTML = `<span>+${xp} XP</span><span>+${monedas} Monedas</span><span>${validas} palabras válidas</span>`;
    $("#finHist").innerHTML = g.historial.map((h) => {
      const ok = h.r === "valida";
      return `<div><span>${g.jug[h.idx].n}</span><span class="${ok ? "ok" : "bad"}">${h.palabra ? h.palabra : "—"} ${ok ? "✓" : "✗"}</span><span>${h.r === "tiempo" ? "tiempo" : (h.ms / 1000).toFixed(1) + " s"}</span></div>`;
    }).join("") || "<div>Sin jugadas</div>";
    $("#finSemilla").textContent = `Semilla de la partida: ${g.seed} (prototipo: XP y monedas solo locales, sin ledger)`;
    mostrar("fin");
  }

  pintarMenu();
  fetch("palabras_extra.txt").then((r) => (r.ok ? r.text() : "")).then((t) => {
    const ws = t.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s[0] !== "#");
    if (ws.length) { dic.agregar(ws); pintarMenu(); }
  }).catch(() => {});
})();
