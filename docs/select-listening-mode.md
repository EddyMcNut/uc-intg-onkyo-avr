# Select Listening Mode

The integration provides a select entity for [Listening Mode](./listening-modes.md).

![](./../screenshots/select.png)

## Configure listening modes

After initial setup, choose **Configure listening modes** in the integration setup. If more than one physical AVR is configured, setup first asks which AVR to configure. The settings apply to all configured zones of that AVR; zones are not configured separately.

For each listening-mode code, choose one of:

- **✨ Discover from AVR** — obtain the AVR-specific name when the relevant input and audio format are active.
- **✅ AVR-discovered** — use the name that has already been learned from the AVR.
- An integration alias — use the integration's standard name.
- **🚫 Don't include** — hide the mode from the select entity.

Listening-mode names can depend on the selected input and audio format. The integration learns these context-specific names from the AVR and uses the learned code when sending the mode back to the AVR. This also allows modes that are not present in the integration's built-in mappings to be selected.

The discovered names and contexts are saved in the AVR configuration and included in backups.
