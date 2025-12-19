## Sensors

As from v0.7.2, this integration contains the following sensors for *every zone*:
- Volume
- Source
- Audio Input
- Audio Output
- Video Input
- Video Output
- Output Display 

**Prerequisite: make sure you are using UC Firmware 2.7.1 or higher.**

After running setup, you can select the sensors next to the AVR entity.

  **the AVR entity has the🎵icon**
  
  ![](/screenshots/sensor-entity.png)

That sensors are available to add to the User Interface of your Activities.

  ![](/screenshots/add-sensor-widget.png)

  ![](/screenshots/assign-sensor.png)

Like that you can have the volume visible without adjusting it.

  ![](/screenshots/sensor-volume.png)

When you switch Source, the integration will try to refresh the sensor values. You can send a request to the AVR to refresh the information when you suspect the value has not been updated, trigger the `Info` command in that case:

  ![](/screenshots/info-command.png)

_note: after installing a new version of the integration or after a reboot of the remote, it might be needed to close screen on the remote and enter the already active activity again to get the sensor to work, hit next to go to the next song and trigger refresh of the album art_

[back to main README](../README.md#sensors)
