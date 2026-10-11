CREATE TABLE IF NOT EXISTS platform_documents (
  id VARCHAR(128) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  workspace_id VARCHAR(64) NOT NULL DEFAULT 'default',
  payload TEXT NOT NULL,
  PRIMARY KEY (id, kind, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_documents_kind ON platform_documents(kind, workspace_id);
