const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function to12Hour(hours24) {
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  let hours = hours24 % 12;
  if (hours === 0) hours = 12;
  return { hours, ampm };
}

// For values that represent a fixed India wall-clock time with no timezone
// conversion intended - e.g. a customer's chosen pickup slot, stored as
// Postgres TIMESTAMP WITHOUT TIME ZONE. Reads the value back using UTC
// getters to recover the exact numbers that were entered, independent of
// whatever timezone the Node process itself happens to be running in.
// (node-pg parses a naive Postgres timestamp into a JS Date using UTC
// component construction - using getUTC* getters here undoes that
// consistently, rather than relying on the server's local timezone setting
// lining up by coincidence.)
function formatWallClock(value) {
  if (!value) return '';
  const d = new Date(value);
  const { hours, ampm } = to12Hour(d.getUTCHours());
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hours}:${pad(d.getUTCMinutes())} ${ampm}`;
}

// For true absolute-instant timestamps (Postgres TIMESTAMPTZ - e.g. when a
// row was actually created). Explicitly converts to India time for display
// regardless of the server's own runtime timezone, instead of relying on
// toLocaleString()'s implicit (and environment-dependent) local conversion.
function formatIST(value) {
  if (!value) return '';
  const d = new Date(value);
  const formatted = d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${formatted} IST`;
}

// Formats a rupee amount with Indian digit grouping (lakhs/crores, e.g.
// "1,23,456.78") rather than generic Western thousands grouping - more
// correct and more natural for an India-focused audience.
function formatINR(amount) {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { formatWallClock, formatIST, formatINR };
