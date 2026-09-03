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

CREATE TABLE IF NOT EXISTS watchlists (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id           SERIAL PRIMARY KEY,
    watchlist_id INT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (watchlist_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists (user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items (watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_ticker ON watchlist_items (ticker);

CREATE TABLE IF NOT EXISTS user_calendar_tickers (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_tickers_user ON user_calendar_tickers (user_id);
CREATE INDEX IF NOT EXISTS idx_user_calendar_tickers_ticker ON user_calendar_tickers (ticker);

CREATE TABLE IF NOT EXISTS user_email_alerts (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker          TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    notify_earnings BOOLEAN NOT NULL DEFAULT true,
    notify_exdiv    BOOLEAN NOT NULL DEFAULT true,
    notify_payout   BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_email_alerts_user ON user_email_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_alerts_ticker ON user_email_alerts (ticker);

CREATE TABLE IF NOT EXISTS sent_email_alerts (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker      TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    event_key   TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_sent_email_alerts_user_key ON sent_email_alerts (user_id, event_key);

CREATE TABLE IF NOT EXISTS user_price_alerts (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker          TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    target_price    NUMERIC(18, 4) NOT NULL CHECK (target_price > 0),
    condition       TEXT NOT NULL CHECK (condition IN ('gte', 'lte')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'cancelled')),
    triggered_at    TIMESTAMPTZ,
    triggered_price NUMERIC(18, 4),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_price_alerts_user ON user_price_alerts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_pending ON user_price_alerts (status);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id                   INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    watchlist_auto_calendar   BOOLEAN NOT NULL DEFAULT true,
    watchlist_auto_notify     BOOLEAN NOT NULL DEFAULT true,
    watchlist_notify_earnings BOOLEAN NOT NULL DEFAULT true,
    watchlist_notify_exdiv    BOOLEAN NOT NULL DEFAULT false,
    watchlist_notify_payout   BOOLEAN NOT NULL DEFAULT false,
    portfolio_auto_notify     BOOLEAN NOT NULL DEFAULT true,
    portfolio_notify_earnings BOOLEAN NOT NULL DEFAULT true,
    portfolio_notify_exdiv    BOOLEAN NOT NULL DEFAULT true,
    portfolio_notify_payout   BOOLEAN NOT NULL DEFAULT true,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    shares       NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
    price        NUMERIC(18, 6) NOT NULL CHECK (price >= 0),
    trade_date   DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_user ON portfolio_transactions (user_id, trade_date, id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_ticker ON portfolio_transactions (ticker);

CREATE TABLE IF NOT EXISTS portfolio_tabs (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#2563eb',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS portfolio_groups (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tab_id     INT NOT NULL REFERENCES portfolio_tabs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#2563eb',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tab_id, name)
);

CREATE TABLE IF NOT EXISTS portfolio_group_rules (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id   INT NOT NULL REFERENCES portfolio_groups(id) ON DELETE CASCADE,
    ticker     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, ticker)
);

CREATE TABLE IF NOT EXISTS portfolio_group_lots (
    id                 SERIAL PRIMARY KEY,
    user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id           INT NOT NULL REFERENCES portfolio_groups(id) ON DELETE CASCADE,
    buy_transaction_id INT NOT NULL REFERENCES portfolio_transactions(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, buy_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_tabs_user ON portfolio_tabs (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_groups_user ON portfolio_groups (user_id, tab_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_group_rules_user ON portfolio_group_rules (user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_portfolio_group_lots_user ON portfolio_group_lots (user_id);

INSERT INTO watchlists (user_id, name, is_default)
SELECT DISTINCT user_id, 'Favoritos', true FROM favorites
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO watchlist_items (watchlist_id, ticker, company_name)
SELECT w.id, f.ticker, f.company_name
FROM favorites f
JOIN watchlists w ON w.user_id = f.user_id AND w.is_default = true
ON CONFLICT (watchlist_id, ticker) DO NOTHING;

DROP TABLE IF EXISTS favorites;
