CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    plan           TEXT NOT NULL DEFAULT 'free'
                   CHECK (plan IN ('free', 'premium')),
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS verification_codes (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes (user_id);

CREATE TABLE IF NOT EXISTS analyses (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'done', 'error')),
    error        TEXT,
    origin       TEXT,
    sector       TEXT,
    report       JSONB,
    model_used   TEXT,
    ticker       TEXT,
    company_name TEXT,
    period_end   DATE,
    pdf_url      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ticker TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE TABLE IF NOT EXISTS filings (
    id            SERIAL PRIMARY KEY,
    ticker        TEXT NOT NULL,
    company_name  TEXT NOT NULL,
    form_type     TEXT NOT NULL CHECK (form_type IN ('10-Q', '10-K')),
    period        TEXT,
    accession_no  TEXT UNIQUE,
    filing_url    TEXT,
    filed_at      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_period ON analyses (user_id, period_end);
CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_filings_ticker ON filings (ticker);

CREATE TABLE IF NOT EXISTS favorites (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id);
