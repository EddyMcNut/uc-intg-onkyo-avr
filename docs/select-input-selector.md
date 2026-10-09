# Select Input Selector

As from v0.8.1 this integration offers a 'select' entity for [Input Selector](./input-selector.md).

![](./../screenshots/select.png)

This entity will offer a drop down of all Input Selector options (for example `tv`, `spotify`, `stm`, `dvd`).

As the list of all known options is very long, you can configure which options you want to have in the selection.

### Input source names

During setup you can choose where the list of inputs comes from:
![](./../screenshots/config-inout-source-names.png)

- **`Use AVR-reported names` (default)**: the integration asks your AVR for its input IDs and names.
- **`Use integration names`**: the integration uses its built-in input mappings, names an aliases.

Use AVR-reported names:
- AVR-reported names need an AVR that supports the NRI protocol. If the AVR does not report usable inputs, the setting is switched off and the integration mappings are used.
- The collected list is only kept in memory; only the setting is saved and backed up.

Use integration names:
- You can configure a per‑AVR custom list of input source names during setup so you don't have to deal with a very long list of aliases.
- During manual setup provide a semicolon-separated list in the **Input selector options** field, for example:

  `tv; spotify; stm; fm; video3`

  ![](./../screenshots/input-selector-config.png)

- Behavior:
  - If you provide a list, the `input-selector` select-entity will show _only_ those options for that AVR
  - If you set it to `all` the driver uses the complete built-in list in integration mode.
  - If you enter `none` the select-entity will not be created (**none-to-other or other-to-none needs a reboot**)
  - Leaving the field empty is supported and is saved explicitly as `all`. The configured list is saved, included in backups, and persists across reboots.

_note: this impacts both `input-selector` and the list of `Input source` in Web Configurator!_

[How this selector impacts the Remote](./source-webconfigurator-mediawidget.md)
