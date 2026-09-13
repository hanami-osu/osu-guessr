UPDATE game_rounds
SET
    answer_snapshot = REPLACE(answer_snapshot, CONVERT(0xE28094 USING utf8mb4), '-'),
    submitted_guess = REPLACE(submitted_guess, CONVERT(0xE28094 USING utf8mb4), '-')
WHERE item_type = 'score_pair'
  AND (
      LOCATE(CONVERT(0xE28094 USING utf8mb4), answer_snapshot) > 0
      OR LOCATE(CONVERT(0xE28094 USING utf8mb4), submitted_guess) > 0
  );
