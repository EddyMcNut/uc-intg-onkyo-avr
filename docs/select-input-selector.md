# Select Input Selector

As from v0.8.1 this integration offers a 'select' entity for [Input Selector](./input-selector.md).

![](./../screenshots/select.png)

This entity will offer a drop down of all Input Selector options (for example `tv`, `spotify`, `stm`, `dvd`).

As the list of all known options is very long, you can configure which options you want to have in the selection.

### `Input source names: Use AVR-reported names (default) / Use integration names`

During setup you can choose where the list of inputs comes from:

- **`Use AVR-reported names` (default)**: the integration asks your AVR for its input IDs and names (using the `avr-info` / NRI protocol). Matching entries in your configured list use the AVR's spelling and ID.
- **`Use integration names`**: the integration uses its built-in input mappings and names.

AVR-reported inputs work for every configured zone of an AVR, because the inputs belong to the AVR itself.

Notes:

- AVR-reported names need an AVR that supports the NRI protocol. If the AVR does not report usable inputs, the setting is switched off and the integration mappings are used.
- Placeholder entries are skipped: an AVR that adds an entry named `Source` to its input list does not get that entry as an option.
- The collected list is only kept in memory; only the setting is saved and backed up.
- A custom list from **Input selector options** is always considered. In AVR-reported mode, it acts as an optional allowlist: matching integration aliases are displayed using the AVR's name and ID, while unmatched aliases retain the existing integration behavior.

### Customizing the `input-selector` select

- You can configure a per‑AVR custom list of listening modes during setup.
- During manual setup provide a semicolon-separated list in the **Input selector options** field, for example:

  `tv; spotify; stm; fm; video3`

  ![](./../screenshots/input-selector-config.png)

- Behavior:
  - If you provide a list, the `input-selector` select-entity will show _only_ those options for that AVR
  - If you set it to `all` the driver uses all detected AVR inputs in AVR-reported mode, or the complete built-in list in integration mode.
  - If you enter `none` the select-entity will not be created (**none-to-other or other-to-none needs a reboot**)
  - Leaving the field empty is supported and is saved explicitly as `all`. The configured list is saved, included in backups, and persists across reboots.

_note: this impacts both `input-selector` and the list of `Input source` in Web Configurator!_

[How this selector impacts the Remote](./source-webconfigurator-mediawidget.md)
