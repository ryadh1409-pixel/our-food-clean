# HalfOrder Admin Panel

Next.js admin dashboard for HalfOrder. Uses Firebase Firestore and Expo Push Notifications.

## Setup

1. Install dependencies:

   ```bash
   cd admin && npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

3. Edit `.env.local` with your Firebase config (same as the main HalfOrder app).

4. **Admin access is role-based:** Only users with `role: "admin"` in Firestore `users/{uid}` can access admin routes. Set this field manually in the Firebase console (or via a script) for admin accounts. New app users get `role: "user"` by default.

5. Run the dev server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). Sign in with an account that has `role: "admin"` in Firestore.

## Routes

- `/admin/login` — Admin login (email/password)
- `/admin/investor` — Investor Dashboard (growth, marketplace, engagement, economics, location table, charts, Export PDF)
- `/admin/dashboard` — Stats: total users, total orders, active orders
- `/admin/users` — List users (name, email, createdAt), ban/unban
- `/admin/orders` — List orders (restaurant, price, owner, status)
- `/admin/notifications` — Send push notification (title + message) to all users with a push token

## Push notifications

Users must have `pushToken` or `expoPushToken` stored in their Firestore `users/{uid}` document. The Send Push page calls `/api/sendNotification`, which fetches all tokens and sends via Expo’s API: `https://exp.host/--/api/v2/push/send`.

## Investor report (PDF + email)

On the **Analytics** page, **Export Investor Report (PDF)** builds a 4-page PDF with metrics (total users, active users, orders, match rate, top restaurants, power users, orders by day, peak hours), then emails it to the admin.

- Set `ADMIN_EMAIL` in `.env.local` (recipient).
- Set SMTP vars for sending: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and optionally `SMTP_SECURE`). You can use Gmail (with an app password) or SendGrid SMTP.
- The API endpoint is `POST /api/exportInvestorReport`. Subject: "HalfOrder Weekly Investor Report"; body: "Attached is the latest HalfOrder analytics report."

## Growth Flywheel

- **Referral links:** Invite link format `https://halforder.app/join/{orderId}?ref={userId}`. When a new user signs up after opening that link, `referredBy` is stored on their user doc and both inviter and new user receive **+2 credits**.
- **growthMetrics:** Firestore collection `growthMetrics` with one doc per day (`date`, `referralUsers`, `orders`, `matches`). Updated when referrals sign up, orders are created, and matches occur.
- **Admin Growth page:** `/admin/growth` includes a **Growth Flywheel** section: Referral signups, Orders from referrals, and a table of daily metrics from `growthMetrics`.
- **Notify nearby:** When a new order is created, users with stored `lastLatitude`/`lastLongitude` within 2 km receive a push: _"Someone near you is sharing food."_ The cron runs every 5 min and calls `/api/notifyNearbyRecent` (orders in last 5 min). User location is updated when they create an order. Optional: `POST /api/notifyNearby` with `{ orderId }` to notify for a single order.

## High Activity Alert

When orders in the last 24 hours reach **100 or more**, the system:

- Creates an alert in the `alerts` collection: `type: "high_activity"`, `message: "100+ orders detected in last 24 hours"`.
- Sends an email to `ADMIN_EMAIL` with subject **"HalfOrder High Activity Alert"** and body: _"HalfOrder has reached more than 100 orders in the last 24 hours. This indicates strong user activity."_

The check runs **every hour** when using `npm run founder-report:cron` (same script also schedules the high-activity API). You can also call the API directly: `POST /api/cron/checkHighActivity` (with `CRON_SECRET`). To avoid duplicate emails, only one high-activity alert is created per 24-hour window.

Alerts appear under **/admin/alerts**. The dashboard shows an alert badge and a **High activity alert** card when such alerts exist.

## Hotspot Alert

When **20 or more orders** occur **within 500 meters** in the **last 10 minutes**, the system:

- Creates an alert in the `alerts` collection: `type: "hotspot"`, `message: "Hotspot detected: 20 orders within 500m"`, `location: { latitude, longitude }`, `createdAt`.
- Sends an email to `ADMIN_EMAIL` with subject **"HalfOrder Hotspot Alert"** and body: _"High activity detected in a small area. Check admin dashboard."_

The check runs **every 5 minutes** when using `npm run founder-report:cron`. You can also call `POST /api/cron/checkHotspot` (with `CRON_SECRET`). To avoid duplicate emails, only one hotspot alert is created per 30-minute window.

Hotspot alerts appear under **/admin/alerts**. The **Analytics** page heatmap highlights hotspot locations with a red border/red cell.

## Auto Campaign Engine

When a predicted hotspot has **expectedOrders ≥ 15**, the system automatically:

1. **Creates a campaign** in the `campaigns` collection with: `name`, `type: "auto"`, `location`, `radius: 1000` (meters), `startTime`, `endTime` (start + 2h), `status: "active"`, `pushSent`, `usersReached`, `ordersCreated`, `matchesCreated`.
2. **Sends a push** to all users (with push tokens): _"🍔 Many people near you are sharing food right now. Open HalfOrder and split your meal."_
3. **Updates the campaign** with `pushSent: true` and `usersReached: <sent count>`.

**Tracking:** Orders and matches within the campaign’s 1 km radius and time window are computed when viewing **/admin/campaigns** (ordersCreated, matchesCreated, conversion rate).

**Admin page** `/admin/campaigns`: Table (Campaign, Location, Users Reached, Orders Created, Matches, Conversion Rate), performance bar chart, and **Launch Promotion** button to create a manual campaign (name + lat/lng) and send the same push.

**Dashboard:** Campaign summary cards (total campaigns, users reached) with a link to **/admin/campaigns**.

## AI Demand Forecast

Statistical demand forecast (no heavy ML): predicts where and when orders are likely based on the last 30 days.

- **Data:** Orders from Firestore (latitude, longitude, createdAt, restaurant).
- **Grouping:** By ~500m geo grid, hour of day, and day of week (Toronto time).
- **Threshold:** Buckets with average ≥ 5 orders per hour are stored as predictions.
- **Storage:** Collection `predictions` with fields: `location`, `hour`, `dayOfWeek`, `dayName`, `expectedOrders`, `confidence`, `createdAt`.
- **Alert:** If any predicted bucket has expectedOrders ≥ 15, an alert is created: _"Predicted hotspot in next hour."_ (type: `predicted_hotspot`).
- **Cron:** Runs every 6 hours via `npm run founder-report:cron` (calls `POST /api/cron/runForecast`).
- **Page:** `/admin/predictions` shows Area, Time window, Expected orders, Confidence. Button **"Send push to nearby users"** sends: _"Many people near you will be sharing food soon. Join HalfOrder."_

## Founder Daily Report

A daily email report is sent at **09:00 AM Toronto time** with key metrics (new users 24h, total users, active users 7d, orders 24h, matched orders, match rate, top restaurant, peak hour, weekly growth, avg orders per user).

- **API:** `POST /api/cron/founderReport` (optional: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`).
- **Schedule with node-cron:** From the `admin` directory run `npm run founder-report:cron`. Keep the process running (e.g. on a server or PM2). Requires `ADMIN_EMAIL`, `CRON_SECRET`, and SMTP vars in `.env.local`; optional `CRON_BASE_URL` if the app is not on localhost.
- **External cron:** Call the API URL daily at 9 AM Toronto (e.g. cron-job.org, Vercel Cron) with your `CRON_SECRET`.
- Reports are also stored in Firestore collection `founderReports` (date, users, orders, matchRate, peakTime, etc.).

## Ban user

Banning sets `banned: true` on the user document in Firestore. Your app should check this field and block banned users from creating/joining orders.
