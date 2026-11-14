(function () {
  "use strict";

  // Barra superior: se vuelve sólida al bajar
  var nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Menú del celular
  var menu = document.getElementById('mobileMenu');
  var burger = document.getElementById('navBurger');
  var closeBtn = document.getElementById('menuClose');
  function openMenu() {
    menu.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    menu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  burger.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  Array.prototype.forEach.call(document.querySelectorAll('[data-menu-link]'), function (a) {
    a.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu();
  });

  // Aparición al bajar
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length && !document.documentElement.hasAttribute('data-vista-previa')) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    Array.prototype.forEach.call(revealEls, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('in'); });
  }

  // Formulario de contacto: el mensaje llega al panel de Mundograf
  var form = document.getElementById('contactForm');
  if (!form) return;
  var success = document.getElementById('formSuccess');
  var errorBox = document.getElementById('formError');
  var boton = form.querySelector('button[type="submit"]');
  var waLink = document.querySelector('.contact-channel.whatsapp');
  function fieldEl(name) { return form.querySelector('[data-field="' + name + '"]'); }

  function mostrarError(texto) {
    errorBox.textContent = texto + ' ';
    if (waLink) {
      var a = document.createElement('a');
      a.href = waLink.href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Escribinos por WhatsApp';
      errorBox.appendChild(a);
    }
    errorBox.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var message = form.message.value.trim();
    var ok = true;
    var nf = fieldEl('name'), ef = fieldEl('email'), mf = fieldEl('message');
    [nf, ef, mf].forEach(function (f) { f.classList.remove('error'); });
    errorBox.hidden = true;

    if (!name) { nf.classList.add('error'); ok = false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ef.classList.add('error'); ok = false; }
    if (!message) { mf.classList.add('error'); ok = false; }
    if (!ok) return;

    if (document.documentElement.hasAttribute('data-vista-previa')) {
      success.classList.add('show');
      return;
    }

    boton.disabled = true;
    fetch('/api/mensaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mundograf': '1' },
      body: JSON.stringify({ nombre: name, email: email, mensaje: message, sitio_web: form.sitio_web.value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'No se pudo enviar.');
      });
    }).then(function () {
      success.classList.add('show');
      form.reset();
      setTimeout(function () { success.classList.remove('show'); }, 8000);
    }).catch(function (err) {
      mostrarError(err.message || 'No se pudo enviar el mensaje.');
    }).then(function () {
      boton.disabled = false;
    });
  });

  form.addEventListener('input', function (e) {
    var wrap = e.target.closest('.form-field');
    if (wrap) wrap.classList.remove('error');
  });
})();
