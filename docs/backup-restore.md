# Backup & Restore during setup

As from v0.8.0 this integration offers the option to backup and restore your configuration settings.

Backup/Restore is compatible with [Integration Manager](https://github.com/JackJPowell/uc-intg-manager).

## Where to find the options
In the driver setup flow choose the `Create configuration backup` and `Restore configuration from backup` actions.

## What `Backup` does
- Selecting **Create configuration backup** will open a textarea containing a JSON payload representing the current configuration and driver metadata.
- The payload includes a `meta` section (driver id, version, timestamp) and a `config` section (the `config.json` contents). Example:

```json
{
  "meta": { "driver_id": "onkyo_avr_custom_driver", "version": "0.8.0", "timestamp": "..." },
  "config": { "avrs": [ { "model": "TX-RZ50", "ip": "192.168.2.103", "zone": "main" } ] }
}
```

- You can copy that JSON elsewhere (safe to store offline) and use it later in time when you want to perform a **Restore**.

## What `Restore` does
- Selecting **Restore configuration from backup** lets you paste the backup JSON into a textarea and apply it.
- The driver validates the payload before applying. If validation fails you will be shown errors and the raw payload so you can edit and retry.
- On successful validation the configuration is saved and the integration reloads entities from the restored config.

## Use cases
- Move configuration between remotes (copy backup JSON → Restore on other device).
- Roll back to a known-good configuration before/after changes.

## Notes
- The backup contains only driver configuration and driver metadata — it does not include runtime state or logs.
- Restoring replaces the existing configuration; be careful and keep a backup of the current config if you might need to revert.
- The driver validates restored data against the same rules used during manual setup — invalid fields produce a clear validation error list.

[back to main README](../README.md#backup-and-restore)
