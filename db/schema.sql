CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT,
    google_id      TEXT UNIQUE,
    plan           TEXT NOT NULL DEFAULT 'free'
                   CHECK (plan IN ('free', 'premium')),
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;

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
    is_public    BOOLEAN NOT NULL DEFAULT false,
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
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS accession TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_analyses_ticker_accession ON analyses (ticker, accession);
CREATE INDEX IF NOT EXISTS idx_analyses_public_created ON analyses (is_public, created_at DESC);
UPDATE analyses
SET accession = substring(filename from '([0-9]{10}-[0-9]{2}-[0-9]{6})')
WHERE accession IS NULL AND filename ~ '[0-9]{10}-[0-9]{2}-[0-9]{6}';
UPDATE analyses
SET is_public = true
WHERE user_id IS NULL AND status = 'done' AND source_url IS NOT NULL AND is_public = false;

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

CREATE TABLE IF NOT EXISTS forum_messages (
    id         SERIAL PRIMARY KEY,
    ticker     TEXT NOT NULL,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  INT REFERENCES forum_messages(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_messages_ticker_created ON forum_messages (ticker, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_forum_messages_parent ON forum_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_forum_messages_user ON forum_messages (user_id);

CREATE TABLE IF NOT EXISTS analysis_ratings (
    id          SERIAL PRIMARY KEY,
    analysis_id INT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback    TEXT,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (analysis_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_ratings_analysis ON analysis_ratings (analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_ratings_user ON analysis_ratings (user_id);

CREATE TABLE IF NOT EXISTS analysis_error_reports (
    id          SERIAL PRIMARY KEY,
    analysis_id INT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    category    TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    admin_notes TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE analysis_error_reports ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE analysis_error_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_analysis_error_reports_analysis ON analysis_error_reports (analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_error_reports_user ON analysis_error_reports (user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
UPDATE users SET role = 'admin' WHERE email IN ('lurlopez13@gmail.com', 'luraldura13@gmail.com', 'lur.lopez.f@mail.pucv.cl', 'demo@cifra.local');

CREATE TABLE IF NOT EXISTS general_reports (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    user_email  TEXT,
    category    TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('general', 'bug', 'screener', 'market_data', 'portfolio', 'account', 'suggestion', 'other')),
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    admin_notes TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_general_reports_status ON general_reports (status);
CREATE INDEX IF NOT EXISTS idx_general_reports_created ON general_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_general_reports_user ON general_reports (user_id);

ALTER TABLE general_reports ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE analysis_error_reports ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
