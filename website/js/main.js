/* ==========================================================================
   Thousand Oaks Injury Attorney — City Page Behavior
   --------------------------------------------------------------------------
   INTEGRATION NOTE: This is a functional, dependency-free reconstruction of
   the mobile nav toggle and the cookie-consent banner/modal described on the
   live homepage (Accept All / Reject All / Manage Preferences, with
   Necessary/Analytics/Marketing categories). It is NOT a copy of your real
   consent-management script. If your live site uses a CMP (e.g. Termly,
   CookieYes, OneTrust) to gate actual analytics/marketing tags, replace this
   file with that vendor's script so consent choices made here actually gate
   the same scripts on these new pages.
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

  // Cookie consent
  var STORAGE_KEY = 'toi_cookie_consent';
  var banner = document.getElementById('cookie-banner');
  var modalOverlay = document.getElementById('cookie-modal');
  var openManage = document.querySelectorAll('[data-cookie-manage]');
  var acceptAllBtns = document.querySelectorAll('[data-cookie-accept-all]');
  var rejectAllBtns = document.querySelectorAll('[data-cookie-reject-all]');
  var savePrefsBtn = document.querySelector('[data-cookie-save]');
  var analyticsToggle = document.getElementById('consent-analytics');
  var marketingToggle = document.getElementById('consent-marketing');

  function getStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function store(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }
  function applyConsent(prefs) {
    // Hook real tag-loading logic here, e.g.:
    // if (prefs.analytics) loadAnalytics();
    // if (prefs.marketing) loadMarketingPixels();
    if (banner) banner.classList.remove('show');
    if (modalOverlay) modalOverlay.classList.remove('show');
  }

  var existing = getStored();
  if (!existing && banner) {
    banner.classList.add('show');
  }

  acceptAllBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var prefs = { necessary: true, analytics: true, marketing: true };
      store(prefs); applyConsent(prefs);
    });
  });
  rejectAllBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var prefs = { necessary: true, analytics: false, marketing: false };
      store(prefs); applyConsent(prefs);
    });
  });
  openManage.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (modalOverlay) modalOverlay.classList.add('show');
    });
  });
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', function () {
      var prefs = {
        necessary: true,
        analytics: analyticsToggle ? analyticsToggle.checked : false,
        marketing: marketingToggle ? marketingToggle.checked : false
      };
      store(prefs); applyConsent(prefs);
    });
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) modalOverlay.classList.remove('show');
    });
  }
});
