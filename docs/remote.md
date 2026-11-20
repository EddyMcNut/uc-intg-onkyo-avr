## Remote entity

As from v0.9.2, the integration contains a **Remote Entity** which can be used to control the AVR outside an Activity.

![](/screenshots/remote-entity.png)

A remote entity is created for every zone configured for the AVR. It exposes:

### Physical button mapping

- volume up/down
- channel up/down
- dpad up/down/left/right/middle
- home
- back
- mute
- power
- play
- previous
- next

### Commands

Besides all [simple commands](generated-simplecommands.md), the remote entity offers the standard Unfolded Circle command names, so you can pick them in the web configurator for your own buttons and UI pages:

`CURSOR_UP`, `CURSOR_DOWN`, `CURSOR_LEFT`, `CURSOR_RIGHT`, `CURSOR_ENTER`, `BACK`, `HOME`, `SETTINGS`, `INFO`, `VOLUME_UP`, `VOLUME_DOWN`, `MUTE_TOGGLE`, `MUTE`, `UNMUTE`, `PLAY_PAUSE`, `PREVIOUS`, `NEXT`, `CHANNEL_UP`, `CHANNEL_DOWN`, `VOCAL_UP`, `VOCAL_DOWN`

The power button uses the remote's own power toggle.

_note: the default button mapping and UI pages are only created when the remote entity is first added. A remote entity you configured earlier keeps its existing mapping, which continues to work. To get the new default mapping, remove the remote entity and add it again._

### UI pages:

![](/screenshots/remote-entity-p1.jpg)

![](/screenshots/remote-entity-p2.jpg)

![](/screenshots/remote-entity-p3.jpg)

![](/screenshots/remote-entity-p4.jpg)

### Reconfigure

You can enable or disable the creation of the remote entity by **reconfiguring** the integration.

![](/screenshots/remote-entity-config.png)

_note: you need to reboot the remote to see effect_
