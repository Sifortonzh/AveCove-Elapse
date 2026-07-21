#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
set -a
. ./.env
set +a

backup_dir="$project_dir/backups"
mkdir -p "$backup_dir"
stamp=$(date +%Y%m%d-%H%M%S)
archive="$backup_dir/avecove-elapse-$stamp.sql.gz"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9 > "$archive"
test -s "$archive"

retention_days=${BACKUP_RETENTION_DAYS:-14}
find "$backup_dir" -type f -name 'avecove-elapse-*.sql.gz' -mtime "+$retention_days" -delete

if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$archive" "$BACKUP_REMOTE"
fi

echo "Backup created: $archive"
