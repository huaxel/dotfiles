CREATE TABLE
    IF NOT EXISTS fixtures (
        fixture_id INTEGER PRIMARY KEY,
        league_id INTEGER,
        date TEXT,
        time TEXT,
        home_team_id INTEGER,
        away_team_id INTEGER,
        home_team_score INTEGER,
        away_team_score INTEGER,
        status TEXT
    );

CREATE TABLE
    IF NOT EXISTS goals (
        goal_id TEXT PRIMARY KEY,
        fixture_id INTEGER,
        player_id INTEGER,
        player_name TEXT,
        team_id INTEGER,
        detail TEXT,
        elapsed INTEGER,
        extra INTEGER
    );

CREATE TABLE
    IF NOT EXISTS players (
        player_id INTEGER PRIMARY KEY,
        name TEXT,
        age INTEGER,
        nationality TEXT,
        injured boolean,
        photo TEXT,
        team_id INTEGER,
        league_id INTEGER,
        appearances INTEGER,
        minutes_played INTEGER,
        position TEXT,
        goals INTEGER,
        shots_on_target INTEGER,
        shots_total INTEGER,
        assists INTEGER,
        yellow_cards INTEGER,
        red_cards INTEGER
    );

CREATE TABLE
    IF NOT EXISTS teams (
        team_id INTEGER PRIMARY KEY,
        name TEXT,
        country TEXT,
        logo TEXT
    );

CREATE TABLE
    IF NOT EXISTS leagues (
        league_id INTEGER PRIMARY KEY,
        name TEXT,
        country TEXT,
        logo TEXT,
        flag TEXT
    );

CREATE TABLE
    IF NOT EXISTS gameweeks (fixture_id INTEGER PRIMARY KEY, gameweek INTEGER);

CREATE TABLE
    IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        user TEXT,
        cat1 TEXT,
        cat1_id INTEGER,
        cat2 TEXT,
        cat2_id INTEGER,
        cat3 TEXT,
        cat3_id INTEGER,
        cat4 TEXT,
        cat4_id INTEGER,
        cat1_change TEXT,
        cat1_change_id INTEGER,
        cat1_out INTEGER,
        cat1_in INTEGER,
        cat1_date TEXT,
        cat2_change TEXT,
        cat2_change_id INTEGER,
        cat2_out INTEGER,
        cat2_in INTEGER,
        cat2_date TEXT,
        cat3_change TEXT,
        cat3_change_id INTEGER,
        cat3_out INTEGER,
        cat3_in INTEGER,
        cat3_date TEXT,
        cat4_change TEXT,
        cat4_change_id INTEGER,
        cat4_out INTEGER,
        cat4_in INTEGER,
        cat4_date TEXT
        ,league_group INTEGER
    );

CREATE TABLE
    IF NOT EXISTS ranking (
        user_id INTEGER PRIMARY KEY,
        user TEXT,
        goals_now INTEGER,
        goals_diff INTEGER,
        place_now INTEGER,
        place_last INTEGER,
        league_group INTEGER
    )
;

-- small utility table used for tracking sync state (last processed fixture id, etc.)
CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Recommended indexes to speed up common queries
CREATE INDEX IF NOT EXISTS idx_goals_fixture_id ON goals(fixture_id);
CREATE INDEX IF NOT EXISTS idx_goals_player_id ON goals(player_id);
CREATE INDEX IF NOT EXISTS idx_goals_fixture_elapsed ON goals(fixture_id, elapsed);
CREATE INDEX IF NOT EXISTS idx_fixtures_league_id ON fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_gameweeks_fixture_id ON gameweeks(fixture_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);