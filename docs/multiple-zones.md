## Multiple zones

As from v0.7.0, this integration can handle multiple zones for each configured AVR.

- During setup you can select the number of zones you want to configure for an AVR

  ![](/screenshots/zone-setting.png)

- Add your AVR zones as entities: In `Integrations` select `Onkyo AVR custom`, click the `+` next to `Configured entities`, each zone is an AVR entity.

  ![](/screenshots/configured-zones.png)

- Now you can add a specific AVR zone to an activity.

- For each configured zone, the integration will offer you a complete AVR entity which you can use in your activities. Consult the manual of your AVR to learn about any limitations which apply for your model. For example most models only allow specific inputs to be assigned to a zone, this integration does not know that so it is up to you to determine what functionality is available for you and configure it in the activity.

- Most models allow to switch on zone 2 or 3 while the main zone is in standby, as this integration creates an entity per zone you can just select that entity for an activity, adding all zones in one activity is also possible of course.

- As the integration offers you a full AVR entity per zone, you can use the slider to control the volume for a specific zone, just by selecting that zone entity in the [Slider](volume.md#slider). However the slider and volume buttons can only work if in your AVR the zone is set to have variable volume level, not a fixed volume level.

### Zones and NET:

Please consider the behavior of the original Onkyo app and your AVR: in most cases when playing a subsource of NET in zone2 and/or zone3, the NET setting of the main zone has significant impact. For example when the last subsource for main was TuneIn, zone2/3 can have trouble switching to Spotify or the other way around. Also when main is in standby and you use Onkyo app to switch on zone2 and hit play in zone2 for Spotify, the main zone gets powered on to switch to correct subsource of NET and play Spotify, after that you can put main back into standby manually. **This is annoying behavior and you will get the same behavior when using this integration.** But let's say you were playing TuneIn in main but main is now in standby, you can power on zone2/3 and start playing TuneIn there without the AVR waking up the main zone.

_note 2: when you have configured multiple zones, it takes a couple of seconds longer to recover from a reboot of the UC Remote compared to just having only the main zone configured_

[back to main README](../README.md#multiple-zones)
