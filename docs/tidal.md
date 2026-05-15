## Tidal

As your AVR can logon to Tidal with your account, the integration can be used to browse to the Tidal menu.

This integration will try to collect the album art, artist, title and album. All this is collected from the AVR, this integration does not communicate with Tidal directly. All commands, like `browse`, `play/pause`, `next` and `previous`, will be send to the AVR, the AVR will handle the communication with the Tidal service.

### Prerequisite: Add your Tidal account to the AVR

Use the AVR menu/settings or _Controller app of your AVR_ to logon to Tidal, these examples are of the Onkyo Controller App and a TX-RZ50:
- select source: NET
- select subsource: Tidal

  ![](../screenshots/app-net.jpg)

- logon with your Tidal credentials

  ![](../screenshots/app-tidal-login.jpg)

- now you can browse the Tidal menu in the Controller app

  ![](../screenshots/app-tidal-menu.jpg)

### Tidal activity

To set up an Activity for Tidal, have a look at these screenshots:

- Create activity and prevent sleep

  ![](../screenshots/prevent-sleep.png)

- On sequence, Input source: `input-selector tidal`

  ![](../screenshots/tidal-on.png)

- User interface, add mediawidget for the AVR with maximum size

  ![](../screenshots/spotify-mediawidget.png)

- Button mapping: map to the buttons you prefer (for example previous/next can be mapped to channel up/down):
  - volume up/down
  - play/pause
  - previous/next
  - mute

    ![](../screenshots/spotify-next.png)

Commands on the remote will only work if you can also use those commands directly in your Tidal app, that depends on the subscription you have for Tidal.

### Change setting directly on the Unfolded Circle Remote
It's recommended to _disable_ the setting `Coverflow in media browser` to get the best experience for navigating the Tidal menu through this integration. To do so, click in the top right corner of the screen on the remote, select Settings > User Interface > Coverflow in media browser: off.

![](../screenshots/tidal-remote-settings.png)

### Browse Tidal

The mediabrowser of Unfolded Circle combined with your AVR being logged on to the Tidal service make it possibe to scroll through the Tidal menu just like you would do with the Controller app of your AVR or navigating the menu on you AVR using your TV. The menu options can differ from the options of the Tidal app on your phone.
Some screenshots:

- s1
- s2
- s3

### Note
If `input-selector tidal` does not work, check the manual of your AVR to see if Tidal is even available as selectable input on the AVR:

- your AVR _does_ have a Tidal input: run setup of this integration again and increase the value for 'NET sub-source selection delay'
- your AVR does _not_ have a Tidal input, this setup is not possible, in that case you can use the Tidal app on your phone and if the Tidal app allowed send to you AVR using Bluetooth, Airplay or Chromecast

