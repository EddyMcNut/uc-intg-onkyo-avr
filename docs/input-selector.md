## Input source

### Select source from dropdown

The `Input source` command offers a dropdown list [based on your config](./source-webconfigurator-mediawidget.md), so depending on how you configured [Input Select](./select-input-selector.md) the integration will show a list of input sources.

![](/screenshots/input-source2.png)

### NET

`NET` covers multiple options, for example streaming Spotify/Deezer/Tidal to your AVR. So when you want to stream Spotify/Tidal/... you can select `net` as Input source and then hit play on your Spotify/Deezer app and select your AVR. Later on, when you select your NET activity again and hit play on the remote, the AVR will try to continue where you left it last time it was playing from NET.

### Select Spotify/Deezer/... directly

As from v0.7.3 you can select the 'sub-sources'of `NET` directly, let's say you want the AVR to switch to TuneIn, you can select `tunein` as Input source and the integration will make sure that _first_ the command is send to switch to `NET` and then a _second_ command is send to select `TuneIn` as the sub-source in NET. After switching to `NET` your AVR might need a few moments to setup, the next command is send with a delay **automatically** which you can configure during setup:

![](/screenshots/net-subsource-delay.png)

For the following sources, the integration will first send the `input-selector net` command automatically _before_ sending the second command for switching to the sub-source:

| Source       | Input source (v0.9.0+) |
| ------------ | ---------------------- |
| TuneIn       | tunein                 |
| Spotify      | spotify                |
| Deezer       | deezer                 |
| Tidal        | tidal                  |
| AmazonMusic  | amazonmusic            |
| Chromecast   | chromecast             |
| DTS-Play-Fi  | dts-play-fi            |
| AirPlay      | airplay                |
| Alexa        | alexa                  |
| Music-Server | music-server           |

_Your AVR must support these services. Check the manual of your model to see which of these services / inputs are available. Another way to check is to use the Onkyo app and see if you can switch the AVR to such a source, if it can then this integration should also be able to do that._

_If a service like Spotify is not a selectable input source on your AVR, just use `net` as Input source as mentioned above and then send music from your Spotify/Tidal/... app._

[more on how to send different commands through `Input source`](./cheats.md)

[activities examples](../README.md#install)
