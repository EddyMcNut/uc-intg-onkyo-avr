## Listening modes

[back to main README](../README.md#listening-modes)

Like descibed in the Cheats section, you can send a lot of different commands which are all mentioned in the [JSON](../src/eiscp-commands.ts) file.

Probably you have your AVR set to automatically select the best listening mode, but sometimes you might want to set a favorite mode, see the listening-mode section in the [JSON](../src/eiscp-commands.ts), for the correct command. A few examples from that JSON:

| Listening mode                      | value in `Input source`                            |
| ----------------------------------- | -------------------------------------------------- |
| Stereo                              | listening-mode stereo                              |
| Straight Decode                     | listening-mode straight-decode                     |
| Neo:6/Neo:X THX Cinema              | listening-mode thx-cinema                          |
| Neo:6 Cinema DTS Surround Sensation | listening-mode neo-6-cinema-dts-surround-sensation |

![](../screenshots/stereo.png)

## What about `Dolby Atmos`, `DTS:X`, `Auro-3D`, `IMAX Enhanced`?

eISCP codes for Atmos, DTS:X, Auro-3D, and IMAX Enhanced are not standardized and may vary by receiver model and firmware.

However, most models `auto-select` the correct mode when the input signal is `Dolby Atmos`, `DTS:X`, `Auro-3D`, `IMAX Enhanced` and the listening mode is set to `Straight Decode`.

| Listening mode | value in `Input source`        |
| -------------- | ------------------------------ |
| Dolby Atmos    | listening-mode straight-decode |
| DTS:X          | listening-mode straight-decode |
| Auro-3D        | listening-mode straight-decode |
| IMAX Enhanced  | listening-mode straight-decode |

![](../screenshots/straight-decode.png)

[back to main README](../README.md#listening-modes)
