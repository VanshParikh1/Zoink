-- Session-token generation. Every token carries the value it was signed
-- with; bumping it (password reset or change) ends every older session.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
