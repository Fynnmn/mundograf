// Solo dentro de la vista previa del panel:
// - vuelve a la misma altura después de cada cambio;
// - los textos se editan escribiendo encima (como en Canva) y el panel los guarda solo;
// - tocar una foto abre su ficha en el panel, y tocar una sección la abre en el editor;
// - ningún link saca la vista previa de la página.
(function () {
  var html = document.documentElement;
  var panel = window.parent !== window ? window.parent : null;
  var enviar = function (msg) { if (panel) panel.postMessage(Object.assign({ mg: true }, msg), location.origin); };

  html.style.scrollBehavior = 'auto';
  var ir = html.getAttribute('data-ir');
  var destino = ir && document.getElementById(ir);
  if (destino) destino.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, Number(html.getAttribute('data-scroll')) || 0);
  requestAnimationFrame(function () { html.style.scrollBehavior = ''; });

  // Textos que admiten más de una línea (títulos de sección, bajadas y descripciones)
  var multilinea = /(\.titulo$|\.bajada$|\.texto$)/;
  var unaLinea = /^(portada\.titulo|servicios\.items\.\d+\.titulo|porque\.puntos\.\d+\.titulo)$/;
  var probar = document.createElement('div');
  probar.setAttribute('contenteditable', 'plaintext-only');
  var modo = probar.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';

  // Lee lo escrito respetando los saltos de línea (innerText devolvería las MAYÚSCULAS del CSS)
  function leer(el) {
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('br'), function (br) { br.replaceWith('\n'); });
    Array.prototype.forEach.call(c.querySelectorAll('div, p'), function (d) { d.prepend('\n'); });
    return c.textContent.replace(/ /g, ' ').replace(/^\n+/, '');
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (el) {
    var ruta = el.getAttribute('data-c');
    var varias = multilinea.test(ruta) && !unaLinea.test(ruta);
    el.setAttribute('contenteditable', modo);
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('role', 'textbox');
    if (varias) el.setAttribute('aria-multiline', 'true');
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !varias) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') el.blur();
    });
    el.addEventListener('input', function () { enviar({ tipo: 'editar', ruta: ruta, valor: leer(el) }); });
    el.addEventListener('paste', function (e) {
      // Solo texto, sin formato
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, varias ? t : t.replace(/\s*\n\s*/g, ' '));
    });
    el.addEventListener('focus', function () { enviar({ tipo: 'escribiendo', si: true }); });
    el.addEventListener('blur', function () { enviar({ tipo: 'escribiendo', si: false }); });
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a && (a.getAttribute('href') || '').charAt(0) !== '#') e.preventDefault();
    if (e.target.closest('[data-c]')) return;
    var foto = e.target.closest('[data-foto]');
    if (foto) { enviar({ tipo: 'foto', id: foto.getAttribute('data-foto') }); return; }
    var sec = e.target.closest('section[id], footer');
    if (sec) enviar({ tipo: 'seccion', id: sec.id || 'pie' });
  });

  // Ctrl+Z fuera de un texto: deshace en el panel
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest('[data-c]')) {
      e.preventDefault();
      enviar({ tipo: 'deshacer' });
    }
  });
})();
