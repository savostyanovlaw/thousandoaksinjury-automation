/* ==========================================================================
   Thousand Oaks Injury Attorney — Site Behavior + Consent-Gated GA4
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var isOpen = links.style.display === 'flex';
      links.style.display = isOpen ? 'none' : 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'absolute';
      links.style.top = '60px';
      links.style.right = '24px';
      links.style.background = '#fff';
      links.style.border = '1px solid var(--color-border)';
      links.style.borderRadius = '8px';
      links.style.padding = '16px';
      links.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
      toggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  // Create cookie banner/modal if the page does not already contain them
  if (!document.getElementById('cookie-banner')) {
    var banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.className = 'cookie-banner';
    banner.innerHTML =
      '<div class="cookie-banner__text">' +
        '<strong>Cookie Notice</strong><br>' +
        'We use necessary cookies to run this website. Analytics cookies help us understand website traffic and are used only if you allow them.' +
      '</div>' +
      '<div class="cookie-banner__actions">' +
        '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-reject-all>Reject All</button>' +
        '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-manage>Manage Preferences</button>' +
        '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-accept-all>Accept All</button>' +
      '</div>';
    document.body.appendChild(banner);
  }

  if (!document.getElementById('cookie-modal')) {
    var modal = document.createElement('div');
    modal.id = 'cookie-modal';
    modal.className = 'cookie-modal';
    modal.innerHTML =
      '<div class="cookie-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">' +
        '<h2 id="cookie-modal-title">Cookie Preferences</h2>' +
        '<p>You can accept or reject optional analytics cookies. Necessary cookies are always active because the website needs them to function.</p>' +
        '<label class="cookie-toggle"><input type="checkbox" checked disabled> Necessary cookies</label>' +
        '<label class="cookie-toggle"><input id="consent-analytics" type="checkbox"> Analytics cookies</label>' +
        '<label class="cookie-toggle"><input id="consent-marketing" type="checkbox"> Marketing cookies</label>' +
        '<div class="cookie-modal__actions">' +
          '<button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-reject-all>Reject All</button>' +
          '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-save>Save Preferences</button>' +
          '<button type="button" class="cookie-btn cookie-btn--primary" data-cookie-accept-all>Accept All</button>' +
        '</div>' +
      '</div>';
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
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
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

  function bindButtons() {
    document.querySelectorAll('[data-cookie-accept-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prefs = { necessary: true, analytics: true, marketing: true };
        store(prefs);
        applyConsent(prefs);
      });
    });

    document.querySelectorAll('[data-cookie-reject-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prefs = { necessary: true, analytics: false, marketing: false };
        store(prefs);
        applyConsent(prefs);
      });
    });

    document.querySelectorAll('[data-cookie-manage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var current = getStored();
        var analyticsToggle = document.getElementById('consent-analytics');
        var marketingToggle = document.getElementById('consent-marketing');
        if (analyticsToggle && current) analyticsToggle.checked = !!current.analytics;
        if (marketingToggle && current) marketingToggle.checked = !!current.marketing;
        if (modalOverlay) modalOverlay.classList.add('show');
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
        store(prefs);
        applyConsent(prefs);
      });
    }

    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) modalOverlay.classList.remove('show');
      });
    }
  }

  bindButtons();

  var existing = getStored();
  if (existing) {
    applyConsent(existing);
  } else {
    rejectAnalyticsCookies();
    if (bannerEl) bannerEl.classList.add('show');
  }
});
