\timing off
\set QUIET on
BEGIN;
-- Scale up: 100k users, 500k messages, 500k notifications, 200k bookings, 100k reviews.
INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", phone, "updatedAt", "expoPushToken")
SELECT gen_random_uuid()::text, 'scale' || g || '@mail.utoronto.ca', 'x', 'S', 'U', '+14165550100', now(),
       CASE WHEN g % 2 = 0 THEN 'ExponentPushToken[' || g || ']' END
FROM generate_series(1, 100000) g;
CREATE TEMP TABLE su AS SELECT id, (row_number() OVER ())::int - 1 AS n FROM users WHERE email LIKE 'scale%';
CREATE UNIQUE INDEX ON su(n);
CREATE TEMP TABLE sc AS SELECT id, (row_number() OVER ())::int - 1 AS n FROM conversations;
CREATE UNIQUE INDEX ON sc(n);
CREATE TEMP TABLE sl AS SELECT id, "ownerId", (row_number() OVER ())::int - 1 AS n FROM listings;
CREATE UNIQUE INDEX ON sl(n);
SELECT count(*) AS nc FROM sc \gset
SELECT count(*) AS nl FROM sl \gset
INSERT INTO messages (id, "conversationId", "senderId", body, "createdAt")
SELECT gen_random_uuid()::text, c.id, u.id, 'hi', now() - (g || ' seconds')::interval
FROM generate_series(1, 500000) g JOIN sc c ON c.n = g % :nc JOIN su u ON u.n = g % 100000;
INSERT INTO notifications (id, type, title, body, "userId")
SELECT gen_random_uuid()::text, 'MESSAGE_RECEIVED', 't', 'b', u.id
FROM generate_series(1, 500000) g JOIN su u ON u.n = g % 100000;
INSERT INTO bookings (id, status, "startDate", "endDate", "totalPrice", "paymentStatus", "renterId", "ownerId", "listingId", "updatedAt", "completedAt")
SELECT gen_random_uuid()::text, 'COMPLETED', now(), now(), 10, 'PAID_OUT', u.id, l."ownerId", l.id, now(), now() - (g || ' minutes')::interval
FROM generate_series(1, 200000) g JOIN sl l ON l.n = g % :nl JOIN su u ON u.n = g % 100000;
ANALYZE users; ANALYZE messages; ANALYZE notifications; ANALYZE bookings;

\echo '--- push-token claim (every sign-in)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) UPDATE users SET "expoPushToken" = NULL WHERE "expoPushToken" = 'ExponentPushToken[424]' AND id <> 'nobody';
\echo '--- payout job scan'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT id FROM bookings WHERE status = 'COMPLETED' AND "completedAt" <= now() - interval '200000 minutes' AND "payoutSentAt" IS NULL AND "paymentStatus" = 'PAYOUT_PENDING';
\echo '--- reconciliation scan'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT id FROM bookings WHERE "stripePaymentIntentId" IS NOT NULL AND "paymentStatus" IN ('AUTHORIZED','CAPTURE_PENDING','CAPTURED','FAILED');
\echo '--- deleting one never-active account (FK checks on messages, notifications, ...)'
INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", phone, "updatedAt") VALUES ('purge-me', 'purge@x', 'x', 'P', 'M', '+1', now());
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) DELETE FROM users WHERE id = 'purge-me';
ROLLBACK;
