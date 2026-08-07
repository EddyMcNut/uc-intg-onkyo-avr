## Remote entity

As from v0.9.2, the integration contains an optional **Remote** entity which can be used to control the AVR outside an Activity.

**This is an opt-in feature.** During setup, you can enable it with the **Create remote entity?** dropdown.

The remote entity is available for every zone configured for the AVR. It exposes:

- Physical **button mapping** so the remote's volume, mute, power, back, home, channel and direction pad buttons control the AVR.
- **3 UI pages** with on-screen buttons:
  - **AVR commands** — power, info, settings, volume, mute, dimmer, listening modes
  - **Direction pad** — navigation for menus/on-screen display
  - **Inputs & More** — input selectors (BD/DVD, TV, CD, NET, Bluetooth, TuneIn), presets and speaker A/B
- All generated **simple commands** (see the simple command list under the [raw command](/docs/raw.md) documentation) as on-screen commands, plus raw EISCP commands (`raw ` prefix).

Every button sends its command through the same command handling as the media player entity, so volume display/scale settings, source handling and zone behaviour all apply.

### Power handling

The `Power` physical button toggles the AVR power state. The power state of the AVR is tracked and reflected on the remote entity (`on` / `off` / `unknown`).

### Reconfiguration

After enabling the remote entity you can still enable or disable it by **reconfiguring** the AVR (Settings → _configure_) — the choice is saved in the config and included in config backup/restore, just like every other setup option.
