CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  file_format TEXT NOT NULL CHECK (file_format IN ('csv', 'xlsx', 'json', 'postgresql')),
  row_count BIGINT NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_user_updated_idx ON datasets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dataset_columns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  physical_type TEXT NOT NULL,
  semantic_type TEXT NOT NULL,
  missing_count BIGINT NOT NULL DEFAULT 0,
  cardinality BIGINT NOT NULL DEFAULT 0,
  statistics JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(dataset_id, name),
  UNIQUE(dataset_id, ordinal)
);
CREATE INDEX IF NOT EXISTS dataset_columns_semantic_idx ON dataset_columns(dataset_id, semantic_type);

CREATE TABLE IF NOT EXISTS analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_sessions_dataset_idx ON analysis_sessions(dataset_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  parent_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  selected_tools TEXT[] NOT NULL DEFAULT '{}',
  model_name TEXT,
  answer TEXT,
  latency_ms DOUBLE PRECISION,
  token_usage INTEGER,
  estimated_cost_usd NUMERIC(12, 8),
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_runs_session_idx ON analysis_runs(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, ordinal)
);
CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON tool_calls(run_id, ordinal);

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  confidence NUMERIC(4, 3),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  caveat TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insights_run_idx ON insights(run_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('markdown', 'pdf')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  expected_tools TEXT[] NOT NULL DEFAULT '{}',
  expected_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieval_relevant TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT,
  aggregate_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms DOUBLE PRECISION,
  token_usage INTEGER,
  estimated_cost_usd NUMERIC(12, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES evaluation_cases(id),
  passed BOOLEAN NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evaluation_results_run_idx ON evaluation_results(evaluation_run_id, case_id);

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('dataset', 'column', 'analysis_summary', 'finding')),
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_embeddings_dataset_idx ON knowledge_embeddings(dataset_id, entity_type);
CREATE INDEX IF NOT EXISTS knowledge_embeddings_cosine_idx ON knowledge_embeddings USING hnsw (embedding vector_cosine_ops);
