// Keep large, unchanged bank bodies inside PostgreSQL. Only their revisions
// cross the database connection during ordinary progress/note synchronization.
export const COMPACT_SYNC_PAYLOAD_SQL = `payload || jsonb_build_object('questionBanks',
  (COALESCE(payload->'questionBanks', '{}'::jsonb) - 'banks') || jsonb_build_object('banks',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bank->'id', 'updatedAt', bank->'updatedAt'))
      FROM jsonb_array_elements(COALESCE(payload#>'{questionBanks,banks}', '[]'::jsonb)) bank), '[]'::jsonb)))`;

// The merged list contains full changed banks and revision-only placeholders.
// Resolve placeholders from the locked existing row, preserving exact images,
// answers and explanations without sending them back through Node/pg.
export const RESTORE_SYNC_BANKS_SQL = `(WITH incoming AS MATERIALIZED (
  SELECT bank, ordinality FROM jsonb_array_elements(EXCLUDED.payload#>'{questionBanks,banks}') WITH ORDINALITY AS item(bank, ordinality)
)
SELECT jsonb_set(EXCLUDED.payload, '{questionBanks,banks}',
  (SELECT COALESCE(jsonb_agg(bank ORDER BY ordinality), '[]'::jsonb) FROM (
    SELECT original AS bank, item.ordinality
    FROM jsonb_array_elements(COALESCE(learning_states.payload#>'{questionBanks,banks}', '[]'::jsonb)) original
    JOIN incoming item ON original->>'id' = item.bank->>'id'
    WHERE NOT item.bank ? 'questions'
    UNION ALL SELECT bank, ordinality FROM incoming WHERE bank ? 'questions'
  ) merged)))`;

// Reuse the complete array directly on ordinary progress-only writes.
export const UNCHANGED_SYNC_BANKS_SQL = `jsonb_set(EXCLUDED.payload, '{questionBanks,banks}',
  COALESCE(learning_states.payload#>'{questionBanks,banks}', '[]'::jsonb))`;
