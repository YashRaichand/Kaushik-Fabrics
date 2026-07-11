// A visitor can get a real price quote before creating an account (that's
// the whole point of "Get an Instant Quote"). If they like the price and
// sign up, we shouldn't make them re-type everything - this cookie carries
// their submission through signup/login so it can be turned into a real
// listing the moment they have an account.
//
// Security note: we deliberately do NOT trust a stored price from this
// cookie. Redemption always re-runs the real pricing calculation from the
// raw attributes (material/weight/condition/etc). A tampered cookie can at
// most claim different garment attributes - which a dishonest user could
// already do through the legitimate form - and the admin verifies the
// physical item before any payout happens regardless (see /admin/pickups).

const COOKIE_NAME = 'pending_listing';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes - long enough to finish signup, short enough not to linger

function savePendingListing(res, payload) {
  res.cookie(COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS
  });
}

function readPendingListing(req) {
  const raw = req.cookies && req.cookies[COOKIE_NAME];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function clearPendingListing(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = { savePendingListing, readPendingListing, clearPendingListing };
