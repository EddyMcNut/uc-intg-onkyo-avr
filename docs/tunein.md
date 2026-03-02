## TuneIn

As of v0.8.1 this integration supports selecting presets for TuneIn (only applicable if your AVR can select TuneIn presets). The integration does not communicate with TuneIn, it communicates with your AVR, your AVR deals with communication with the TuneIn service.

As there is no EISCP command known for selecting a TuneIn preset directly, this integration runs an internal macro which navigates the TuneIn menu of the AVR. In general, when selecting TuneIn as source on the AVR, 'My Presets' is the first option in the menu:

![](../screenshots/tunein-preset-menupos.jpg)

If in your case 'My Presets' is on a different position in the AVR TuneIn menu, start setup and set the configuration to the correct position in the list:

![](../screenshots/tunein-config.png)

### TuneIn activity

To set up an Activity for TuneIn, have a look at these screenshots:

- Create activity and prevent sleep

  ![](../screenshots/prevent-sleep.png)

- On sequence, Input source: `input-selector tunein`

  ![](../screenshots/tunein-on.png)

- Map the volume up/down physical buttons (do *not* map volume long press, **only map volume short press**). 

- Also map the [Slider](./volume.md#slider) to control the volume

- You might also want the map the `Info` function to one of the physical buttons to be able to trigger a refresh of the song data in case you think it did not refresh automatically.

- User interface, add mediawidget for the AVR

  ![](../screenshots/tunein-ui.png)

- User interface, add buttons for the presets known by the AVR: `tunein-preset x`, the x is the position of a specific station on your Preset list.

  ![](../screenshots/tunein-preset.png)

  **Note: `tunein-preset` only works when AVR already has selected TuneIn as source**

- Now, when you select your TuneIn activity and then select one of your presets on the screen of your remote, the integration will select that TuneIn preset and play it, **as the integration needs to navigate the TuneIn menu, it needs a few seconds before the station starts playing**

  ![](../screenshots/tunein-ui-pic.jpg)

- Preset switch can fail when TuneIn itself is broadcasting a commercial.

- If selecting preset is not always working, consider running setup again and set `NET sub source selection delay` to a higher value.

  ![](/screenshots/net-subsource-delay.png)

_note: after installing a new version of the integration or after a reboot of the remote, it might be needed to close screen on the remote and enter the already active activity again to get the MediaWidget to work_

[back to main README](../README.md#example-activities)
