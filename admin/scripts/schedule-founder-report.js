/**
 * Schedules the Founder Daily Report to run every day at 09:00 AM Toronto time.
 * Run from admin directory: npm run founder-report:cron
 * Requires ADMIN_EMAIL, CRON_SECRET, and (for sending) SMTP_* in .env.local.
 * CRON_BASE_URL defaults to http://localhost:3000 (set when app is elsewhere).
 */
const path = require('path');
const cron = require('node-cron');

// Load .env.local from project root (admin folder)
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = (process.env.CRON_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const REPORT_URL = `${BASE_URL}/api/cron/founderReport`;
const HIGH_ACTIVITY_URL = `${BASE_URL}/api/cron/checkHighActivity`;
const HOTSPOT_URL = `${BASE_URL}/api/cron/checkHotspot`;
const FORECAST_URL = `${BASE_URL}/api/cron/runForecast`;
const NOTIFY_NEARBY_URL = `${BASE_URL}/api/notifyNearbyRecent`;
const NEARBY_MATCH_ALERT_URL = `${BASE_URL}/api/cron/nearbyMatchAlert`;

// Use Toronto time for "9 AM" (cron runs in local time; Node uses TZ)
process.env.TZ = 'America/Toronto';

function postCron(url, label) {
  const secret = CRON_SECRET || '';
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ secret }),
  };
  return fetch(url, opts)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    })
    .then((data) => {
      console.log(`[${label}] Success:`, data);
      return data;
    })
    .catch((err) => console.error(`[${label}] Error:`, err.message));
}

function runReport() {
  postCron(REPORT_URL, 'Founder Report');
}

function runHighActivityCheck() {
  postCron(HIGH_ACTIVITY_URL, 'High Activity Check');
}

function runHotspotCheck() {
  postCron(HOTSPOT_URL, 'Hotspot Check');
}

function runForecast() {
  postCron(FORECAST_URL, 'Demand Forecast');
}

function runNotifyNearby() {
  postCron(NOTIFY_NEARBY_URL, 'Notify Nearby');
}

function runNearbyMatchAlert() {
  postCron(NEARBY_MATCH_ALERT_URL, 'Nearby Match Alert');
}

// Every day at 09:00 in America/Toronto
cron.schedule('0 9 * * *', runReport, { timezone: 'America/Toronto' });

// Every hour: check for 100+ orders in 24h and send high-activity alert if needed
cron.schedule('0 * * * *', runHighActivityCheck, {
  timezone: 'America/Toronto',
});

// Every 5 minutes: check for 20+ orders within 500m in last 10 min (hotspot)
cron.schedule('*/5 * * * *', runHotspotCheck, { timezone: 'America/Toronto' });

// Every 6 hours: demand forecast (predictions + alert if >= 15)
cron.schedule('0 */6 * * *', runForecast, { timezone: 'America/Toronto' });

// Every 5 min: notify users near new orders
cron.schedule('*/5 * * * *', runNotifyNearby, { timezone: 'America/Toronto' });

// Every 5 min: nearby match alert (users within 500m, no active order, 30-min cooldown)
cron.schedule('*/5 * * * *', runNearbyMatchAlert, {
  timezone: 'America/Toronto',
});

console.log(
  'Founder: 09:00 daily. High activity: hourly. Hotspot: every 5 min. Forecast: every 6 h. Notify nearby + Nearby match alert: every 5 min. Waiting...',
);
