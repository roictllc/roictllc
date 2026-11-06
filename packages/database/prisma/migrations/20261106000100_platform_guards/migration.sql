-- Append-only audit log (spec §5.3): block UPDATE/DELETE/TRUNCATE on audit_logs for every role.
CREATE OR REPLACE FUNCTION roi_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION roi_audit_log_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION roi_audit_log_immutable();

-- Realtime (spec §2.1): NOTIFY on social metric snapshots and job status changes for SSE fan-out.
CREATE OR REPLACE FUNCTION roi_notify_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('roi_events', json_build_object('table', TG_TABLE_NAME, 'id', NEW.id, 'op', TG_OP)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER social_metric_notify AFTER INSERT ON "social_post_metric_snapshots"
  FOR EACH ROW EXECUTE FUNCTION roi_notify_change();
CREATE TRIGGER social_post_notify AFTER INSERT OR UPDATE OF "status" ON "social_posts"
  FOR EACH ROW EXECUTE FUNCTION roi_notify_change();
CREATE TRIGGER automation_job_notify AFTER UPDATE OF "status" ON "automation_jobs"
  FOR EACH ROW EXECUTE FUNCTION roi_notify_change();
