/* Measure actions only with analytics consent; never include intake fields. */
(function () {
  window.toiTrackEvent = function (name) {
    try {
      var consent = JSON.parse(localStorage.getItem('toi_cookie_consent'));
      if (!consent || !consent.analytics || typeof window.gtag !== 'function') return;
      if (window['ga-disable-G-2QSCB196HW']) return;
      window.gtag('event', name, {
        page_location: location.origin + location.pathname,
        page_path: location.pathname
      });
    } catch (error) { /* Tracking must never interrupt contact actions. */ }
  };
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (link && /^tel:/i.test(link.getAttribute('href') || '')) {
      window.toiTrackEvent('phone_click');
    }
  });
})();
