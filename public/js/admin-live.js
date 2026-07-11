(function () {
  var POLL_INTERVAL_MS = 8000;
  var lastFetchTime = Date.now();
  var bannerShown = false;

  function timeAgoLabel(ms) {
    var secs = Math.floor((Date.now() - ms) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return secs + 's ago';
    return Math.floor(secs / 60) + 'm ago';
  }

  function flash(el) {
    if (!el) return;
    el.classList.remove('live-flash');
    void el.offsetWidth; // restart the animation if it's already mid-flash
    el.classList.add('live-flash');
  }

  function updateLiveLabel() {
    var label = document.getElementById('live-updated-label');
    if (label) label.textContent = 'Live · updated ' + timeAgoLabel(lastFetchTime);
  }

  function showNewActivityBanner(message) {
    if (bannerShown) return;
    bannerShown = true;
    var banner = document.createElement('div');
    banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-[#1B2B22] text-white px-5 py-3 rounded-full shadow-lg text-sm font-medium z-50 flex items-center gap-3';
    banner.innerHTML = '<span>' + message + '</span>';
    var btn = document.createElement('button');
    btn.textContent = 'Refresh';
    btn.className = 'underline font-semibold';
    btn.addEventListener('click', function () { window.location.reload(); });
    banner.appendChild(btn);
    document.body.appendChild(banner);
    setTimeout(function () { window.location.reload(); }, 6000);
  }

  function updateKpi(id, newValue, formatter) {
    var el = document.getElementById(id);
    if (!el) return;
    var display = formatter ? formatter(newValue) : String(newValue);
    if (el.dataset.value !== String(newValue)) {
      el.textContent = display;
      el.dataset.value = String(newValue);
      flash(el);
    }
  }

  function poll() {
    fetch('/admin/api/activity', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        lastFetchTime = Date.now();

        updateKpi('kpi-users', data.users_count);
        updateKpi('kpi-garments', data.garments_count);
        updateKpi('kpi-pending', data.pending_pickups);
        updateKpi('kpi-revenue', data.revenue, function (v) {
          return '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        });

        var pickupList = document.getElementById('pickup-queue-list');
        if (pickupList) {
          var pickupBaseline = parseInt(pickupList.dataset.baselineId || '0', 10);
          if (data.latest_pickup_id > pickupBaseline) showNewActivityBanner('🔔 New pickup request received.');
        }

        var garmentsList = document.getElementById('garments-list');
        if (garmentsList) {
          var garmentBaseline = parseInt(garmentsList.dataset.baselineId || '0', 10);
          if (data.latest_garment_id > garmentBaseline) showNewActivityBanner('🔔 New item listed.');
        }

        updateLiveLabel();
      })
      .catch(function () {
        // Silent failure - just retry on the next interval, no need to alarm the admin over one missed poll.
      });
  }

  setInterval(poll, POLL_INTERVAL_MS);
  setInterval(updateLiveLabel, 1000);
  poll();
})();
