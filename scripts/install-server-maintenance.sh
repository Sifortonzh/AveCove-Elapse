#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo on the Ubuntu server." >&2
  exit 1
fi

project_dir=${1:-/opt/avecove-elapse}
case "$project_dir" in
  /opt/*|/srv/*) ;;
  *) echo "Project directory must be under /opt or /srv." >&2; exit 1 ;;
esac

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades logrotate
systemctl enable --now unattended-upgrades

cron_file=/etc/cron.d/avecove-elapse-backup
printf '17 3 * * * root cd %s && ./scripts/backup.sh >> /var/log/avecove-elapse-backup.log 2>&1\n' "$project_dir" > "$cron_file"
chmod 0644 "$cron_file"

logrotate_file=/etc/logrotate.d/avecove-elapse-backup
printf '/var/log/avecove-elapse-backup.log {\n  weekly\n  rotate 8\n  compress\n  missingok\n  notifempty\n  copytruncate\n}\n' > "$logrotate_file"
chmod 0644 "$logrotate_file"

echo "Automatic security updates, daily backups, and backup-log rotation are enabled."
