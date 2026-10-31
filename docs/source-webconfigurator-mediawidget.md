## Input source, Web Configurator

The integration collects the input sources reported by the AVR and makes the resulting list available in the Web Configurator and the MediaWidget.

Input sources are configured per physical AVR through **Configure input sources** in the integration setup. When more than one AVR is configured, setup first asks which AVR to configure. The settings apply to all configured zones of that AVR.

For each source, you can choose:

- **✨ Discover from AVR** — use the AVR-reported name when available.
- **✅ AVR-discovered** — use a name already learned from the AVR.
- An integration alias.
- **🚫 Don't include** — exclude the source from the generated lists.

The resulting source list is used in both places:

- The `Input source` field in the Web Configurator, which also continues to accept text commands.
- The `Sources` button in the MediaWidget.

AVR-reported sources that are not part of the integration's built-in mappings can still be shown and selected. If the AVR does not provide usable input information, the integration falls back to its built-in mappings.
