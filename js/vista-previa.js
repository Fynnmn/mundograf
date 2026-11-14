// Solo dentro de la vista previa del panel: vuelve a la misma altura después de cada cambio
// y evita que un link saque la vista previa de la página.
(function () {
  var html = document.documentElement;
  html.style.scrollBehavior = 'auto';
  var ir = html.getAttribute('data-ir');
  var destino = ir && document.getElementById(ir);
  if (destino) destino.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, Number(html.getAttribute('data-scroll')) || 0);
  requestAnimationFrame(function () { html.style.scrollBehavior = ''; });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#') return; // los saltos dentro de la página funcionan normal
    e.preventDefault();
  });
})();
