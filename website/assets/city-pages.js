/* Thousand Oaks Injury — accessible interaction + consent-gated analytics */
document.addEventListener('DOMContentLoaded', function () {
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('[data-nav-toggle]') || document.querySelector('.nav-toggle');
  var panel = document.querySelector('[data-nav-panel]') || document.querySelector('.nav-links');

  function setMenu(open) {
    if (!toggle || !panel) return;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('is-open', open);
  }

  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  function updateHeaderState() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }
  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });

  var practiceTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-practice-trigger]'));
  var practiceImages = Array.prototype.slice.call(document.querySelectorAll('[data-practice-image]'));

  function activatePractice(trigger) {
    var key = trigger.getAttribute('data-practice-trigger');
    practiceTriggers.forEach(function (item) {
      item.classList.toggle('is-active', item === trigger);
      item.setAttribute('aria-current', item === trigger ? 'true' : 'false');
    });
    practiceImages.forEach(function (image) {
      var active = image.getAttribute('data-practice-image') === key;
      image.hidden = !active;
      image.classList.toggle('is-active', active);
    });
  }

  practiceTriggers.forEach(function (trigger) {
    trigger.addEventListener('mouseenter', function () { activatePractice(trigger); });
    trigger.addEventListener('focus', function () { activatePractice(trigger); });
    trigger.addEventListener('click', function () { activatePractice(trigger); });
  });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  } else if (revealItems.length) {
    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealItems.forEach(function (item) { observer.observe(item); });
  }

  /* Consent UI is created here so legacy and redesigned pages share one implementation. */
  if (!document.getElementById('cookie-banner')) {
    var banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie notice');
    banner.innerHTML =
      '<div class="cookie-banner__text"><strong>Cookie Notice</strong><br>' +
      'We use necessary cookies to run this website. Analytics cookies help us understand website traffic and are used only if you allow them.</div>' +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-reject-all>Reject All</button>' +
      '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-manage>Manage Preferences</button>' +
      '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-accept-all>Accept All</button></div>';
    document.body.appendChild(banner);
  }

  if (!document.getElementById('cookie-modal')) {
    var modal = document.createElement('div');
    modal.id = 'cookie-modal';
    modal.className = 'cookie-modal';
    modal.innerHTML =
      '<div class="cookie-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title" tabindex="-1">' +
      '<h2 id="cookie-modal-title">Cookie Preferences</h2>' +
      '<p>You can accept or reject optional analytics cookies. Necessary cookies are always active because the website needs them to function.</p>' +
      '<label class="cookie-toggle"><input type="checkbox" checked disabled> Necessary cookies</label>' +
      '<label class="cookie-toggle"><input id="consent-analytics" type="checkbox"> Analytics cookies</label>' +
      '<label class="cookie-toggle"><input id="consent-marketing" type="checkbox"> Marketing cookies</label>' +
      '<div class="cookie-modal__actions">' +
      '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-reject-all>Reject All</button>' +
      '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-save>Save Preferences</button>' +
      '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-accept-all>Accept All</button></div></div>';
    document.body.appendChild(modal);
  }

  var STORAGE_KEY = 'toi_cookie_consent';
  var GA_ID = 'G-2QSCB196HW';
  var gaLoaded = false;
  var bannerEl = document.getElementById('cookie-banner');
  var modalOverlay = document.getElementById('cookie-modal');

  function getStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function store(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }
  function hideConsentUI() {
    if (bannerEl) bannerEl.classList.remove('show');
    if (modalOverlay) modalOverlay.classList.remove('show');
  }
  function deleteCookie(name) {
    document.cookie = name + '=; Max-Age=0; path=/';
    document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname;
    document.cookie = name + '=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, '');
  }
  function rejectAnalyticsCookies() {
    deleteCookie('_ga');
    deleteCookie('_ga_2QSCB196HW');
    window['ga-disable-' + GA_ID] = true;
  }
  function loadGA4() {
    if (gaLoaded || window['ga-disable-' + GA_ID]) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(script);
  }
  function applyConsent(prefs) {
    hideConsentUI();
    if (prefs && prefs.analytics) {
      window['ga-disable-' + GA_ID] = false;
      loadGA4();
    } else {
      rejectAnalyticsCookies();
    }
  }

  document.querySelectorAll('[data-cookie-accept-all]').forEach(function (button) {
    button.addEventListener('click', function () {
      var prefs = { necessary: true, analytics: true, marketing: true };
      store(prefs); applyConsent(prefs);
    });
  });
  document.querySelectorAll('[data-cookie-reject-all]').forEach(function (button) {
    button.addEventListener('click', function () {
      var prefs = { necessary: true, analytics: false, marketing: false };
      store(prefs); applyConsent(prefs);
    });
  });
  document.querySelectorAll('[data-cookie-manage]').forEach(function (button) {
    button.addEventListener('click', function () {
      var current = getStored();
      var analyticsToggle = document.getElementById('consent-analytics');
      var marketingToggle = document.getElementById('consent-marketing');
      if (analyticsToggle && current) analyticsToggle.checked = !!current.analytics;
      if (marketingToggle && current) marketingToggle.checked = !!current.marketing;
      if (modalOverlay) {
        modalOverlay.classList.add('show');
        var dialog = modalOverlay.querySelector('[role="dialog"]');
        if (dialog) dialog.focus();
      }
    });
  });
  var savePrefsBtn = document.querySelector('[data-cookie-save]');
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', function () {
      var analyticsToggle = document.getElementById('consent-analytics');
      var marketingToggle = document.getElementById('consent-marketing');
      var prefs = {
        necessary: true,
        analytics: analyticsToggle ? analyticsToggle.checked : false,
        marketing: marketingToggle ? marketingToggle.checked : false
      };
      store(prefs); applyConsent(prefs);
    });
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (event) {
      if (event.target === modalOverlay) modalOverlay.classList.remove('show');
    });
  }

  var existing = getStored();
  if (existing) applyConsent(existing);
  else {
    rejectAnalyticsCookies();
    if (bannerEl) bannerEl.classList.add('show');
  }
});

/* Secure Free Case Review form integration for English and Russian pages. */
document.addEventListener('DOMContentLoaded', function () {
  var forms = Array.prototype.slice.call(document.querySelectorAll('form[data-form-integration="pending"]'));
  if (!forms.length) return;

  var isRussian = (document.documentElement.lang || '').toLowerCase().indexOf('ru') === 0;
  var messages = isRussian ? {
    ready: 'Защищённая онлайн-форма активна. Не отправляйте срочную информацию, если срок может истечь до ответа фирмы.',
    sending: 'Отправляем сообщение…',
    success: 'Спасибо. Ваш запрос отправлен в Savostyanov Law Corporation. Фирма свяжется с вами после рассмотрения сообщения.',
    error: 'Не удалось отправить сообщение. Позвоните по номеру (818) 213-8798 или напишите на attorney@savostyanovlaw.com.'
  } : {
    ready: 'Secure online submission is available. Do not rely on this form for a deadline or other time-sensitive matter.',
    sending: 'Sending your message…',
    success: 'Thank you. Your request was sent to Savostyanov Law Corporation. The firm will contact you after reviewing it.',
    error: 'We could not send your message. Please call (818) 213-8798 or email attorney@savostyanovlaw.com.'
  };

  forms.forEach(function (form) {
    form.action = '/api/case-review';
    form.method = 'post';
    form.setAttribute('data-form-integration', 'active');
    form.setAttribute('data-case-review-form', '');

    ['name', 'phone', 'email', 'message'].forEach(function (fieldName) {
      var field = form.elements[fieldName];
      if (field) field.required = true;
    });

    var honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.autocomplete = 'off';
    honeypot.tabIndex = -1;
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.position = 'absolute';
    honeypot.style.left = '-10000px';
    honeypot.style.width = '1px';
    honeypot.style.height = '1px';
    honeypot.style.overflow = 'hidden';
    form.appendChild(honeypot);

    var button = form.querySelector('button');
    if (button) {
      button.type = 'submit';
      button.removeAttribute('aria-disabled');
      button.disabled = false;
    }

    var status = form.querySelector('#form-integration-note, #form-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'fine-print';
      form.appendChild(status);
    }
    status.setAttribute('data-form-status', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = messages.ready;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      if (button) button.disabled = true;
      status.textContent = messages.sending;

      var formData = new FormData(form);
      formData.set('page', window.location.href);
      formData.set('language', isRussian ? 'ru' : 'en');

      fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (!response.ok || !payload.ok) throw new Error('Submission failed');
          return payload;
        });
      }).then(function () {
        form.reset();
        status.textContent = messages.success;
      }).catch(function () {
        status.textContent = messages.error;
      }).finally(function () {
        if (button) button.disabled = false;
      });
    });
  });
});
