/* Measure actions only with analytics consent; never include intake fields.
   Events: phone_click, email_click, form_start, generate_lead, form_submit_error.
   A phone_click is a tap on a call link, not a completed call. */
(function () {
  var ALLOWED_PARAMS = ['cta_location', 'form_id', 'form_language', 'error_code'];

  function landingPage() {
    try {
      var touch = typeof window.toiFirstTouch === 'function' ? window.toiFirstTouch() : null;
      return touch && typeof touch.landing_page === 'string' ? touch.landing_page : '';
    } catch (error) { return ''; }
  }

  window.toiTrackEvent = function (name, extra) {
    try {
      var consent = JSON.parse(localStorage.getItem('toi_cookie_consent'));
      if (!consent || !consent.analytics || typeof window.gtag !== 'function') return;
      if (window['ga-disable-G-2QSCB196HW']) return;
      var params = {
        page_location: location.origin + location.pathname,
        page_path: location.pathname
      };
      var landing = landingPage();
      if (landing) params.landing_page = landing;
      if (extra && typeof extra === 'object') {
        ALLOWED_PARAMS.forEach(function (key) {
          if (typeof extra[key] === 'string' && extra[key]) params[key] = extra[key].slice(0, 60);
        });
      }
      window.gtag('event', name, params);
    } catch (error) { /* Tracking must never interrupt contact actions. */ }
  };

  function ctaLocation(link) {
    if (!link.closest) return 'page';
    if (link.closest('.mobile-action-bar')) return 'sticky_bar';
    if (link.closest('.site-header')) return 'header';
    if (link.closest('.site-footer')) return 'footer';
    if (link.closest('#contact')) return 'contact';
    if (link.closest('.hero')) return 'hero';
    return 'page';
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (/^tel:/i.test(href)) {
      window.toiTrackEvent('phone_click', { cta_location: ctaLocation(link) });
    } else if (/^mailto:/i.test(href)) {
      window.toiTrackEvent('email_click', { cta_location: ctaLocation(link) });
    }
  });
})();
