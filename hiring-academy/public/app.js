'use strict';

(function () {
  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.nav-toggle-label').textContent = open ? 'Close' : 'Menu';
    });
    // Close the menu after choosing a section link (small screens)
    nav.addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('.nav-toggle-label').textContent = 'Menu';
      }
    });
  }

  // ---- Inquiry form ----
  var form = document.getElementById('inquiry-form');
  var statusEl = document.getElementById('form-status');
  if (!form || !statusEl) return;

  function validEmail(value) {
    // Required by the page: contains @ and a dot after it.
    var i = value.indexOf('@');
    if (i < 1) return false;
    var local = value.slice(0, i);
    var domain = value.slice(i + 1);
    if (local.indexOf('@') !== -1) return false;
    var dot = domain.indexOf('.');
    return dot > 0 && dot < domain.length - 1;
  }

  function show(message, kind) {
    statusEl.textContent = message;
    statusEl.className = 'form-status ' + kind;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    statusEl.textContent = '';
    statusEl.className = 'form-status';

    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var phone = form.phone.value.trim();
    var program = form.program.value;
    var message = form.message.value.trim();

    if (!name) {
      show('Please enter your name.', 'error');
      form.name.focus();
      return;
    }
    if (!validEmail(email)) {
      show('Please enter a valid email address (it needs an @ and a domain).', 'error');
      form.email.focus();
      return;
    }
    if (message.length < 10) {
      show('Please write a message of at least 10 characters.', 'error');
      form.message.focus();
      return;
    }

    var payload = { name: name, email: email, phone: phone, program: program, message: message };

    try {
      var res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = {};
      try { data = await res.json(); } catch (e) { /* non-JSON response */ }

      if (res.ok && data.ok === true) {
        show(data.message || 'Thank you — your inquiry has been received.', 'success');
        form.reset();
      } else {
        show(data.error || 'Something went wrong. Please try again.', 'error');
      }
    } catch (err) {
      show('Could not reach the server. Please check your connection and try again.', 'error');
    }
  });
})();
