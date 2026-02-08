## Sensors

As from v0.7.3, this integration contains the following sensors:

- Volume
- Source
- Audio Input
- Audio Output
- Video Input
- Video Output
- Output Display
- Mute
- [Front Panel Display](#front-panel-display)

**Prerequisite: make sure you are using UC Firmware 2.7.1 or higher.**

**Sensors can be created for every zone but depending on the AVR model some sensors will not be updated for all zones**

During setup, you can choose to have the sensors created:

![](/screenshots/create-sensors.png)

After running setup, you can select the sensors in the same way you select the AVR entity.

**the AVR entities have the🎵icon** all others are sensors

![](/screenshots/sensor-entity.png)

The sensors are available to add to the User Interface of your Activities, you don't need to include them in an activity, they are available anyway.

![](/screenshots/add-sensor-widget.png)

![](/screenshots/assign-sensor.png)

Like that you can have the volume visible without adjusting it for example.

![](/screenshots/sensor-volume.png)

When you switch Source, the integration will try to refresh the sensor values. You can send a request to the AVR to refresh the information when you suspect the value has not been updated, trigger the `Info` command in that case:

![](/screenshots/info-command.png)

### Front Panel Display

Front Panel Display can be helpful when you have renamed an input source in your AVR:

![](/screenshots/avr-source-name-edit.png)

![](/screenshots/front-panel-display-sensor.png)

note 1: probably the Front Panel Display is only showing info for the main zone, it might not be helpful in an activity which is using Zone2/3 without main.

note 2: when using Spotify or other streaming services, the Front Panel Display on the AVR might be scrolling though some info like song and artist, for those sources, the sensor of this integration will only be updated with the value of the selected _'sub-source'_ of 'NET' which are TuneIn, Spotify, Deezer, Tidal, AmazonMusic, Chromecast, DTS-Play-Fi, AirPlay, Alexa, Music-Server. This prevents the integration to continuously update the sensor.

_note: after installing a new version of the integration or after a reboot of the remote, it might be needed to close screen on the remote and enter the already active activity again to get the sensor to work, hit next to go to the next song and trigger refresh of the album art_

[back to main README](../README.md#sensors)
