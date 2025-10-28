DELETE FROM week_ranking;

INSERT INTO
    week_ranking (
        user_id,
        user,
        league_group,
        category1player,
        category2player,
        category3player,
        category4player,
        category1photo,
        category2photo,
        category3photo,
        category4photo,
        category1goals,
        category2goals,
        category3goals,
        category4goals,
        category1goals_prev,
        category2goals_prev,
        category3goals_prev,
        category4goals_prev,
        goals_week
    )
WITH
    params AS (
        SELECT
            21 AS cutoff_gameweek -- semana del juego
    ),
    base AS (
        -- your original CTE here
        SELECT
            u.user_id,
            u.user,
            u.league_group,
            u.cat1 as category1player,
            u.cat2 as category2player,
            u.cat3 as category3player,
            u.cat4 as category4player,
            p1.photo as category1photo,
            p2.photo as category2photo,
            p3.photo as category3photo,
            p4.photo as category4photo,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                WHERE
                    g.player_id = u.cat1_id
                    AND gw.gameweek > 0
            ) + COALESCE(u.cat1_out, 0) - COALESCE(u.cat1_in, 0) AS category1goals,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                WHERE
                    g.player_id = u.cat2_id
                    AND gw.gameweek > 0
            ) + COALESCE(u.cat2_out, 0) - COALESCE(u.cat2_in, 0) AS category2goals,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                WHERE
                    g.player_id = u.cat3_id
                    AND gw.gameweek > 0
            ) + COALESCE(u.cat3_out, 0) - COALESCE(u.cat3_in, 0) AS category3goals,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                WHERE
                    g.player_id = u.cat4_id
                    AND gw.gameweek > 0
            ) + COALESCE(u.cat4_out, 0) - COALESCE(u.cat4_in, 0) AS category4goals,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                    CROSS JOIN params p
                WHERE
                    g.player_id = u.cat1_id
                    AND gw.gameweek > 0
                    AND gw.gameweek < p.cutoff_gameweek
            ) + COALESCE(u.cat1_out, 0) - COALESCE(u.cat1_in, 0) AS category1goals_prev,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                    CROSS JOIN params p
                WHERE
                    g.player_id = u.cat2_id
                    AND gw.gameweek > 0
                    AND gw.gameweek < p.cutoff_gameweek
            ) + COALESCE(u.cat2_out, 0) - COALESCE(u.cat2_in, 0) AS category2goals_prev,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                    CROSS JOIN params p
                WHERE
                    g.player_id = u.cat3_id
                    AND gw.gameweek > 0
                    AND gw.gameweek < p.cutoff_gameweek
            ) + COALESCE(u.cat3_out, 0) - COALESCE(u.cat3_in, 0) AS category3goals_prev,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                    CROSS JOIN params p
                WHERE
                    g.player_id = u.cat4_id
                    AND gw.gameweek > 0
                    AND gw.gameweek < p.cutoff_gameweek
            ) + COALESCE(u.cat4_out, 0) - COALESCE(u.cat4_in, 0) AS category4goals_prev,
            (
                SELECT
                    COUNT(*)
                FROM
                    goals g
                    JOIN gameweeks gw ON g.fixture_id = gw.fixture_id
                    CROSS JOIN params p
                WHERE
                    gw.gameweek = p.cutoff_gameweek
                    AND g.player_id IN (u.cat1_id, u.cat2_id, u.cat3_id, u.cat4_id)
            ) AS goals_week
        FROM
            users u
            LEFT JOIN players p1 ON u.cat1_id = p1.player_id
            LEFT JOIN players p2 ON u.cat2_id = p2.player_id
            LEFT JOIN players p3 ON u.cat3_id = p3.player_id
            LEFT JOIN players p4 ON u.cat4_id = p4.player_id
    )
SELECT
    *
FROM
    base;
