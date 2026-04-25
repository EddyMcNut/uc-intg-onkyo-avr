## Installation and usage

### Installation

- Make sure your AVR is ON or STANDBY.
- Go to the `Releases` section

  ![](../screenshots/releases.png)

- Download `Latest` `uc-intg-onkyo-avr-x.y.z.tar.gz` from the `Assets` section.

  ![](../screenshots/assets.png)

- In webconfigurator, go to `Integrations`, `Add new`, `Install custom`, select the `uc-intg-onkyo-avr-x.y.z.tar.gz` and then `Upload`.
- Uploading can take a few seconds.
- In `Integrations` select `Onkyo AVR custom` and click `next`.
- If you have stored a backup of a previous _integration configuration_, you can restore is like described [here](./backup-restore.md), otherwise continue with the next steps.
- Select the `configure` option and click `next`.
- For the next step, it depends on your AVR model if it supports autodiscover, if it does:
  - Leave the input fields `AVR Model` and `AVR IP Address` empty.
- If auto discover fails:
  - Remove the integration completely, upload it again and then after upload:
  - Populate `AVR Model` and `AVR IP Address`.
- Check if the endpoint for Album Art corresponds with your AVR model, if it does not have an Album Art endpoint, set it to `na` to prevent errors.
- Configure also the other settings for your AVR.
- Example of the entity names long or short configuration: `TX-RZ50 192.168.2.103 main` or `TX-RZ50 main`
- Click `Next`.
- Click `Add all`, click `Done`.

### Available entities

_next to the AVR entity, the integration also creates several [sensors](./sensor.md) and [selects](./select.md), you can decide for yourself if you also want to use these sensors, to control your AVR you only have to select the AVR entity_

**the AVR entity has the🎵icon**

![](../screenshots/configured-entities.png)

![](../screenshots/select-entity.png)

[back to main README](../README.md#installation-and-usage)
