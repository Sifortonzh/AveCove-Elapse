#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore.sh /absolute/path/to/backup.sql.gz" >&2
  exit 1
fi

archive=$1
case "$archive" in
  /*) ;;
  *) echo "Please provide an absolute backup path." >&2; exit 1 ;;
esac
test -f "$archive"

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
set -a
. ./.env
set +a

echo "This will replace the current database with: $archive"
printf "Type RESTORE to continue: "
read -r confirmation
[ "$confirmation" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gzip -dc "$archive" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
echo "Restore complete."
