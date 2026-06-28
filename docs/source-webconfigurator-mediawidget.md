## Input source, Web Configurator, MediaWidget

- as from v0.9.0 and higher, the integration collects a list of Input sources which are then available as dropdown in `Input source`. Note that `Input source` still allows for text input
- since v0.8.1 you could already configure [Select Input Selector](./select-input-selector.md)
- the Unfolded Circle MediaWidget allows for MediaBrowsing and Source select

### Example behaviour

The above items are related to each other, here are some examples to explain the behavior.

1. Select Input Selector is left empty

- the `Input source` in Web Configurator shows all possible options (also accepts text commands)
- the `Sources` button in MediaWidget shows all possible sources

2. Select Input Selector is set to only show `spotify`, `tunein`, `stm`

- the `Input source` in Web Configurator shows only `spotify`, `tunein`, `stm` (also accepts text commands)
- the `Sources` button in MediaWidget shows only `spotify`, `tunein`, `stm`

3. Select Input Selector is set to `none` (**reboot of remote is needed**)

- the `Input source` in Web Configurator does not show dropdown (still accepts text commands)
- the `Sources` button in MediaWidget is not visible

_note: when you reconfigure the `Select Input Selector` the changes are applied right away, expect when you switch to `none`, then a reboot is needed. Also when you switch from `none` to something else a reboot is needed._

### Manipulate MediaWidget

Let's say you have `Select Input Selector` set to show a list of options. The options are available in Web Configurator and you have set all your Activities. Now when using MediaWidget you have the `Sources` button in it which you may not like.

You could then decide to set `Select Input Selector` to `none` and reboot the remote. Your Activities will keep on working but the `Sources` button in MediaWidget is not showing anymore.
