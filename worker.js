/**
 * BGRemover Cloudflare Worker
 * Handles: PayPal payment, user credits, Google auth verification
 *
 * Environment variables (set via wrangler secret put):
 *   PAYPAL_CLIENT_ID     = AZia4eoePw0q9ruwj6WQQSvzYsKSfnvAV1cDnmehyUz9-Y1ndgSRIocnhaJ_oC7L7xFDBFQvlfs6KGQF
 *   PAYPAL_CLIENT_SECRET = ECpPHdSU0l0lT5AmLpposjEnzZF-InBkWM-juWj97CSJhafNaCyDfpvObLuARJzFL03hbhy_WyRkiiLn
 *   PAYPAL_BASE_URL      = https://api-m.sandbox.paypal.com  (switch to https://api-m.paypal.com for Live)
 *   FRONTEND_ORIGIN      = https://imagebgremoved.shop
 */

// ============================================================
//  Plans config
// ============================================================
const PLANS = {
  starter: { credits: 15, amount: '4.99',  label: 'Starter – 15 Credits' },
  popular: { credits: 50, amount: '12.99', label: 'Popular – 50 Credits' },
  pro:     { credits: 80, amount: '29.99', label: 'Pro Pack – 80 Credits' },
};

// ============================================================
//  CORS helper
// ============================================================
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

// ============================================================
//  PayPal helpers
// ============================================================
async function getPayPalToken(env) {
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function createPayPalOrder(env, plan, token) {
  const p = PLANS[plan];
  const res = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: p.amount },
        description: p.label,
      }],
      application_context: {
        brand_name: 'BGRemover',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal create order error: ${JSON.stringify(data)}`);
  return data;
}

async function capturePayPalOrder(env, orderId, token) {
  const res = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal capture error: ${JSON.stringify(data)}`);
  return data;
}

// ============================================================
//  Google JWT verification (lightweight)
// ============================================================
async function verifyGoogleToken(credential) {
  // Decode payload (no full sig verify for simplicity — use Google tokeninfo for production)
  try {
    const payload = JSON.parse(atob(credential.split('.')[1]));
    // Basic checks
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('Invalid issuer');
    }
    if (Date.now() / 1000 > payload.exp) {
      throw new Error('Token expired');
    }
    return { id: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
  } catch (e) {
    throw new Error('Invalid Google token: ' + e.message);
  }
}

// ============================================================
//  DB helpers
// ============================================================
async function upsertUser(db, user) {
  // Insert or ignore, then update name/picture
  await db.prepare(`
    INSERT INTO users (google_id, email, name, picture, credits)
    VALUES (?, ?, ?, ?, 5)
    ON CONFLICT(google_id) DO UPDATE SET
      name    = excluded.name,
      picture = excluded.picture,
      updated_at = unixepoch()
  `).bind(user.id, user.email, user.name, user.picture).run();

  const row = await db.prepare('SELECT * FROM users WHERE google_id = ?').bind(user.id).first();
  return row;
}

async function getUser(db, googleId) {
  return db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();
}

async function addCredits(db, googleId, amount) {
  await db.prepare(`
    UPDATE users SET credits = credits + ?, updated_at = unixepoch()
    WHERE google_id = ?
  `).bind(amount, googleId).run();
}

async function deductCredit(db, googleId) {
  const user = await getUser(db, googleId);
  if (!user || user.credits <= 0) return false;
  await db.prepare(`
    UPDATE users SET credits = credits - 1, updated_at = unixepoch()
    WHERE google_id = ? AND credits > 0
  `).bind(googleId).run();
  return true;
}

// ============================================================
//  Router
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin') || env.FRONTEND_ORIGIN;

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // ── POST /api/auth/login ──────────────────────────────
      // Body: { credential: "<Google JWT>" }
      // Returns: { user: { google_id, email, name, picture, credits } }
      if (path === '/api/auth/login' && method === 'POST') {
        const { credential } = await request.json();
        const googleUser = await verifyGoogleToken(credential);
        const dbUser = await upsertUser(env.DB, googleUser);
        return jsonResponse({ user: dbUser }, 200, origin);
      }

      // ── GET /api/user/credits ─────────────────────────────
      // Header: Authorization: Bearer <Google JWT>
      if (path === '/api/user/credits' && method === 'GET') {
        const auth = request.headers.get('Authorization') || '';
        const credential = auth.replace('Bearer ', '');
        const googleUser = await verifyGoogleToken(credential);
        const dbUser = await getUser(env.DB, googleUser.id);
        if (!dbUser) return jsonResponse({ error: 'User not found' }, 404, origin);
        return jsonResponse({ credits: dbUser.credits }, 200, origin);
      }

      // ── POST /api/process ─────────────────────────────────
      // Deducts 1 credit after successful processing
      // Header: Authorization: Bearer <Google JWT>
      if (path === '/api/process' && method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const credential = auth.replace('Bearer ', '');
        const googleUser = await verifyGoogleToken(credential);
        const ok = await deductCredit(env.DB, googleUser.id);
        if (!ok) return jsonResponse({ error: 'Insufficient credits' }, 402, origin);
        const dbUser = await getUser(env.DB, googleUser.id);
        // Log history
        await env.DB.prepare(`
          INSERT INTO processing_history (google_id) VALUES (?)
        `).bind(googleUser.id).run();
        return jsonResponse({ success: true, credits_remaining: dbUser.credits }, 200, origin);
      }

      // ── POST /api/paypal/create-order ─────────────────────
      // Body: { plan: 'starter'|'popular'|'pro', google_id: string }
      if (path === '/api/paypal/create-order' && method === 'POST') {
        const { plan, google_id } = await request.json();
        if (!PLANS[plan]) return jsonResponse({ error: 'Invalid plan' }, 400, origin);

        const ppToken = await getPayPalToken(env);
        const order   = await createPayPalOrder(env, plan, ppToken);

        // Save pending order
        await env.DB.prepare(`
          INSERT INTO orders (paypal_order_id, google_id, plan_id, amount, credits, status)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `).bind(order.id, google_id, plan, PLANS[plan].amount, PLANS[plan].credits).run();

        return jsonResponse({ id: order.id }, 200, origin);
      }

      // ── POST /api/paypal/capture-order ────────────────────
      // Body: { orderID: string, google_id: string }
      if (path === '/api/paypal/capture-order' && method === 'POST') {
        const { orderID, google_id } = await request.json();

        const ppToken = await getPayPalToken(env);
        const capture = await capturePayPalOrder(env, orderID, ppToken);

        if (capture.status === 'COMPLETED') {
          // Get order from DB
          const dbOrder = await env.DB.prepare(
            'SELECT * FROM orders WHERE paypal_order_id = ?'
          ).bind(orderID).first();

          if (!dbOrder) return jsonResponse({ error: 'Order not found' }, 404, origin);
          if (dbOrder.status === 'completed') {
            // Already processed (idempotent)
            const user = await getUser(env.DB, google_id);
            return jsonResponse({ success: true, credits: user.credits }, 200, origin);
          }

          // Mark order complete & add credits
          await env.DB.prepare(`
            UPDATE orders SET status = 'completed', updated_at = unixepoch()
            WHERE paypal_order_id = ?
          `).bind(orderID).run();

          await addCredits(env.DB, google_id, dbOrder.credits);
          const user = await getUser(env.DB, google_id);

          return jsonResponse({
            success:  true,
            credits:  user.credits,
            added:    dbOrder.credits,
            plan:     dbOrder.plan_id,
          }, 200, origin);
        }

        return jsonResponse({ error: 'Payment not completed', status: capture.status }, 400, origin);
      }

      // ── GET /api/user/history ─────────────────────────────
      if (path === '/api/user/history' && method === 'GET') {
        const auth = request.headers.get('Authorization') || '';
        const credential = auth.replace('Bearer ', '');
        const googleUser = await verifyGoogleToken(credential);
        const { results } = await env.DB.prepare(`
          SELECT * FROM processing_history WHERE google_id = ?
          ORDER BY created_at DESC LIMIT 50
        `).bind(googleUser.id).all();
        return jsonResponse({ history: results }, 200, origin);
      }

      return jsonResponse({ error: 'Not found' }, 404, origin);

    } catch (err) {
      console.error(err);
      return jsonResponse({ error: err.message }, 500, origin);
    }
  },
};
