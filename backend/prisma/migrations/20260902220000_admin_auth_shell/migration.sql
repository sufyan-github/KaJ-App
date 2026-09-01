CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE');

CREATE TABLE "admin_credentials" (
    "user_id" UUID NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totp_secret_ciphertext" TEXT NOT NULL,
    "totp_confirmed_at" TIMESTAMP(3),
    "last_totp_counter" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "admin_login_challenges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip" INET,
    "ua" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip" INET,
    "ua" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_login_challenges_token_hash_key" ON "admin_login_challenges"("token_hash");
CREATE INDEX "admin_login_challenges_user_id_expires_at_idx" ON "admin_login_challenges"("user_id", "expires_at");
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_user_id_expires_at_idx" ON "admin_sessions"("user_id", "expires_at");
CREATE INDEX "admin_sessions_expires_at_revoked_at_idx" ON "admin_sessions"("expires_at", "revoked_at");
CREATE INDEX "admin_credentials_role_idx" ON "admin_credentials"("role");

ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_login_challenges" ADD CONSTRAINT "admin_login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
