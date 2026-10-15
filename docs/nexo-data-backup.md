# NEXO data backup and restore

NEXO stores accounts, sessions, and its operations configuration in SQLite at `/data/nexo.sqlite`. Docker Compose mounts `/data` as the named `nexo-data` volume. Back up the volume before upgrades and retain the backup outside Docker's managed storage.

With the NEXO API running, create a consistent SQLite backup using SQLite's online backup API from a temporary Node container that mounts the volume, or stop NEXO first and copy the database file. A stopped-service copy with Docker Compose:

```sh
docker compose stop nexo-api
docker run --rm -v nexo-prototipe_nexo-data:/data -v "$PWD/backups:/backup" alpine sh -c 'cp /data/nexo.sqlite /backup/nexo.sqlite'
docker compose start nexo-api
```

The default Compose volume name is `nexo-prototipe_nexo-data`; use `docker volume ls` if the Compose project name was changed. To restore, stop the API, replace `/data/nexo.sqlite` with the backup, then start the API. Keep the matching `NEXO_ENCRYPTION_KEY`: encrypted integration credentials cannot be recovered without that key. Restoring a backup also restores its users and revocation state.

Never remove the `nexo-data` volume during routine shutdown. `docker compose down -v` deletes it.
