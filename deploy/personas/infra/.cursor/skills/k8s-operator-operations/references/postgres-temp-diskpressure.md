# PostgreSQL temp-file DiskPressure

On k3s/local-path clusters with high disk use, stale DiskPressure, Pending/Evicted pods, or Postgres restart failures: check `data/base/pgsql_tmp` before blaming images/WAL. Heavy queries can create huge temp spills; local-path PVC size requests do not hard-quota.

```bash
df -h
kubectl describe node <node> | sed -n '/Taints:/p;/Conditions:/,/Addresses:/p'
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded -o wide
sudo du -sh /var/lib/rancher/k3s/storage/*/*/data/base/pgsql_tmp 2>/dev/null || true
```

Deleting `pgsql_tmp`: use root shell so globs expand with privileges — `sudo sh -c 'rm -rf .../data/base/pgsql_tmp/*'` (plain `sudo rm .../*` expands before sudo). After freeing disk, if kubelet still reports DiskPressure, restart k3s/kubelet to refresh. Then set/verify:

```sql
ALTER SYSTEM SET temp_file_limit = '10GB';
SELECT pg_reload_conf();
SHOW temp_file_limit;
```

When `pods/exec`/`portforward` denied but Secret read + in-cluster Service access allowed: verify with `uv run --with 'psycopg[binary]'` against ClusterIP using Secret credentials (do not print secrets). Host-path `pgsql_tmp` inspect failure is a telemetry limitation, separate from SQL verification.

After `ALTER SYSTEM` + `pg_reload_conf()`, reconnect — old sessions may still show the previous value. Verify fresh connection: `SHOW temp_file_limit = 10GB` and `pg_settings.pending_restart = false`.
