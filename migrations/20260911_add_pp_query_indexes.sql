CREATE INDEX IF NOT EXISTS idx_games_user_performance
    ON games (user_id, game_mode, variant, ruleset_version, pp_version, ranked, pp);

CREATE INDEX IF NOT EXISTS idx_achievements_mode_pp
    ON user_achievements (game_mode, variant, ruleset_version, pp_version, profile_pp);

CREATE INDEX IF NOT EXISTS idx_achievements_global_pp
    ON user_achievements (variant, ruleset_version, pp_version, profile_pp);
