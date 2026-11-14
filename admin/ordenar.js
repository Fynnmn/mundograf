// Ordenar arrastrando: lo que se agarra sigue al dedo 1:1 (respetando de dónde se agarró),
// los demás se corren a su lugar nuevo con un resorte, y al soltar el elemento vuela a su hueco.
// modo 'lista' (alturas distintas, una columna) o 'grilla' (casilleros iguales).
// En pantallas táctiles, en la grilla hay que mantener apretado un momento (si no, se scrollea normal).

const UMBRAL = 6;          // px antes de decidir que es un arrastre y no un toque
const ESPERA_TACTIL = 280; // ms apretado para levantar una foto con el dedo

export function ordenable(contenedor, { item, asa = null, modo = 'lista', alSoltar, alTocar }) {
  let estado = null;

  const items = () => [...contenedor.querySelectorAll(`:scope > ${item}`)];

  contenedor.addEventListener('pointerdown', e => {
    if (e.button !== 0 || estado) return;
    const el = e.target.closest(item);
    if (!el || el.parentElement !== contenedor) return;
    if (asa && !e.target.closest(asa)) return;
    if (!asa && e.target.closest('button, input, textarea, a')) return;
    const tactil = e.pointerType === 'touch';
    estado = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, activo: false, tactil, listo: !(tactil && !asa) };
    if (!estado.listo) {
      estado.timer = setTimeout(() => { if (estado) { estado.listo = true; levantar(); } }, ESPERA_TACTIL);
    }
    if (asa) e.preventDefault();
  });

  function levantar() {
    const s = estado;
    if (!s || s.activo) return;
    s.activo = true;
    s.lista = items();
    s.desde = s.lista.indexOf(s.el);
    s.hasta = s.desde;
    s.rects = s.lista.map(n => n.getBoundingClientRect());
    try { s.el.setPointerCapture(s.id); } catch {}
    s.el.classList.add('arrastrando');
    s.el.style.transition = 'none';
    s.lista.forEach(n => { if (n !== s.el) n.style.transition = 'transform .38s cubic-bezier(.32,.72,0,1)'; });
    document.documentElement.style.cursor = 'grabbing';
    if (s.tactil) navigator.vibrate?.(8);
    mover();
  }

  function destinos(orden) {
    // Posición (top/left) que le toca a cada elemento con el orden nuevo
    const s = estado;
    if (modo === 'grilla') return orden.map((n, i) => ({ n, x: s.rects[i].left, y: s.rects[i].top }));
    let y = s.rects[0].top;
    const gap = s.rects.length > 1 ? s.rects[1].top - s.rects[0].bottom : 0;
    return orden.map(n => {
      const r = s.rects[s.lista.indexOf(n)];
      const out = { n, x: r.left, y };
      y += r.height + gap;
      return out;
    });
  }

  function mover() {
    const s = estado;
    const dx = s.x - s.x0, dy = s.y - s.y0;
    const r0 = s.rects[s.desde];
    s.el.style.transform = `translate3d(${modo === 'lista' ? 0 : dx}px, ${dy}px, 0) scale(${modo === 'grilla' ? 1.04 : 1})`;
    // ¿Sobre qué casillero está el centro de lo que se arrastra?
    const cx = r0.left + r0.width / 2 + (modo === 'lista' ? 0 : dx);
    const cy = r0.top + r0.height / 2 + dy;
    let hasta = s.desde, mejor = Infinity;
    s.rects.forEach((r, i) => {
      const d = modo === 'lista' ? Math.abs(cy - (r.top + r.height / 2)) : Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
      if (d < mejor) { mejor = d; hasta = i; }
    });
    if (hasta !== s.hasta) {
      s.hasta = hasta;
      const orden = s.lista.filter(n => n !== s.el);
      orden.splice(hasta, 0, s.el);
      for (const { n, x, y } of destinos(orden)) {
        if (n === s.el) continue;
        const r = s.rects[s.lista.indexOf(n)];
        n.style.transform = `translate3d(${x - r.left}px, ${y - r.top}px, 0)`;
      }
    }
  }

  contenedor.addEventListener('pointermove', e => {
    const s = estado;
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX; s.y = e.clientY;
    const lejos = Math.hypot(s.x - s.x0, s.y - s.y0) > UMBRAL;
    if (!s.listo) { if (lejos) cancelar(); return; } // con el dedo se movió antes de tiempo: es un scroll
    if (!s.activo) { if (lejos) levantar(); return; }
    e.preventDefault();
    mover();
  });

  // Mientras se arrastra con el dedo, la página no se scrollea
  contenedor.addEventListener('touchmove', e => { if (estado?.activo) e.preventDefault(); }, { passive: false });
  contenedor.addEventListener('contextmenu', e => { if (estado) e.preventDefault(); });

  function cancelar() {
    if (!estado) return;
    clearTimeout(estado.timer);
    estado = null;
  }

  function soltar(e) {
    const s = estado;
    if (!s || (e && e.pointerId !== s.id)) return;
    clearTimeout(s.timer);
    if (!s.activo) {
      estado = null;
      if (e?.type === 'pointerup' && alTocar) alTocar(s.el);
      return;
    }
    document.documentElement.style.cursor = '';
    const orden = s.lista.filter(n => n !== s.el);
    orden.splice(s.hasta, 0, s.el);
    const destino = destinos(orden).find(d => d.n === s.el);
    const r0 = s.rects[s.desde];
    s.el.style.transition = 'transform .42s cubic-bezier(.32,.72,0,1)';
    s.el.style.transform = `translate3d(${destino.x - r0.left}px, ${destino.y - r0.top}px, 0)`;
    const { desde, hasta, lista } = s;
    estado = null;
    setTimeout(() => {
      lista.forEach(n => { n.style.transition = ''; n.style.transform = ''; n.classList.remove('arrastrando'); });
      if (desde !== hasta) alSoltar(desde, hasta);
    }, 300);
  }
  contenedor.addEventListener('pointerup', soltar);
  contenedor.addEventListener('pointercancel', e => {
    if (estado?.activo) soltar(e); else cancelar();
  });
}

export function mover(arr, desde, hasta) {
  const [x] = arr.splice(desde, 1);
  arr.splice(hasta, 0, x);
  return arr;
}
