CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'premium')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
CREATE INDEX IF NOT EXISTS idx_filings_ticker ON filings (ticker);
