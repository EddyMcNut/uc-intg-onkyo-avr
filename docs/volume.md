## Volume

[back to main README](../README.md#volume)

The AVR itself may display the volume as dB (relative) or as an absolute number, depending on its settings, but the eISCP protocol only accepts and returns the absolute value. There is no command to set the volume directly in dB via eISCP.

Most models allow to set a standard volume level per input source. For example when you select DAB, the volume is set to 35. If your model does not support that you can use the Unfolded Remote and this integration to set the volume to a specific level by adding a command in the on-sequence of an activity or as a button on the user interface with the simple command `volume 35` (or whatever level you like of course):

![](../screenshots/volume35-sequence.png)

![](../screenshots/volume35-widget.png)

[back to main README](../README.md#volume)
