// routes/subscriptions.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn('Stripe not configured');
}

const PLANS = {
  plus: {
    name: 'Plus',
    price_sek: 19900, // 199 SEK in öre
    features: ['Obegränsade gillar', 'Se vem som gillar dig', 'AI-chattcoach', '5 Super Likes/dag'],
  },
  premium: {
    name: 'Premium',
    price_sek: 34900, // 349 SEK
    features: ['Allt i Plus', 'Prioriterad matchning', 'Profil boost', 'Obegränsade Super Likes', 'Avancerad AI-analys', 'Datingstylist'],
  },
};

// GET /api/subscriptions/plans
router.get('/plans', (req, res) => {
  res.json(PLANS);
});

// GET /api/subscriptions/me
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    res.json(rows[0] || { plan: 'free', status: 'active' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// POST /api/subscriptions/checkout — create Stripe checkout session
router.post('/checkout', auth, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!stripe) return res.status(503).json({ error: 'Payment not configured' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'sek',
          product_data: { name: `Själ & Hjärta ${PLANS[plan].name}` },
          unit_amount: PLANS[plan].price_sek,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { user_id: req.user.id, plan },
      success_url: `${process.env.FRONTEND_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
    });
    res.json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/subscriptions/webhook — Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).end();
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { user_id, plan } = session.metadata;
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.query(
        `UPDATE subscriptions SET plan = $1, status = 'active', stripe_customer_id = $2,
         stripe_sub_id = $3, current_period_end = $4
         WHERE user_id = $5`,
        [plan, session.customer, session.subscription, periodEnd, user_id]
      );
      await db.query(
        `INSERT INTO payments (user_id, amount, currency, status, stripe_pi_id, plan)
         VALUES ($1, $2, 'SEK', 'succeeded', $3, $4)`,
        [user_id, session.amount_total, session.payment_intent, plan]
      );
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await db.query(
        `UPDATE subscriptions SET plan = 'free', status = 'cancelled' WHERE stripe_sub_id = $1`,
        [sub.id]
      );
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).end();
  }
});

// POST /api/subscriptions/cancel
router.post('/cancel', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT stripe_sub_id FROM subscriptions WHERE user_id = $1', [req.user.id]);
    if (rows[0]?.stripe_sub_id && stripe) {
      await stripe.subscriptions.update(rows[0].stripe_sub_id, { cancel_at_period_end: true });
    }
    await db.query(
      'UPDATE subscriptions SET status = \'cancelled\' WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
