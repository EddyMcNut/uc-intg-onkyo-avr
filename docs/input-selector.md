## Input source

When creating an activity, you probably also want to be able to change the input source on your AVR. As this integration uses the flexibility of the `Input source` command to be able to control almost everything, there is no dropdown available. Instead you type the command you want to send. Maximum flexibility for you, less work for me :)

All commands can be found in [this JSON](../src/eiscp-commands.ts), from there you can determine how to select the correct input.

![](../screenshots/input-json.png)

Some examples to explain how to interpret that list:
| I want to select on AVR | Value(s) in JSON ('name') | Value to enter into `Input source` |
|-------------------------|----------------------------|------------------------------------|
| CBL/SAT | `video2` or `cbl` or `sat` | `input-selector cbl` |
| BD/DVD | `bd` or `dvd` | `input-selector bd` |
| STMBOX | `stm` | `input-selector stm` |
| TV | `tv` | `input-selector tv` |
| GAME | `video3` or `game` | `input-selector game` |
| NET | `net` or `network` | `input-selector net` |

![](/screenshots/input-source.png)

### NET
`NET` covers multiple options, for example streaming Spotify/Deezer/Tidal to your AVR. So when you want to stream Spotify/Tidal/... you can use `input-selector net` and then hit play on your Spotify/Deezer app and select your AVR. Later on, when you select your NET activity again and hit play on the remote, the AVR will try to continue where you left it last time it was playing from NET.

### Select Spotify/Deezer/... directly
As from v0.7.3 you can select the 'sub-sources'of `NET` directly, let's say you want the AVR to switch to TuneIn, you can send `input-selector tunein` and the integration will make sure that *first* the command is send to switch to `NET` and then a *second* command is send to select `TuneIn` as the sub-source in NET. After switching to `NET` your AVR might need a few moments to setup, the next command is send with a delay **automatically** which you can configure during setup:

![](/screenshots/net-subsource-delay.png)

As a more detailed example, looking at the [JSON](../src/eiscp-commands.ts), when you send `input-selector tidal` the integration will send **two** commands to the AVR:
- SLI2B (switch to NET)
- NLSL3 (within NET, switch to Tidal)

For the following sources, the integration will first send the `input-selector net` command automatically *before* sending the second command for switching to the sub-source:

| Source       | Value to enter into `Input source` |
|--------------|------------------------------------|
| TuneIn       | `input-selector tunein`            |
| Spotify      | `input-selector spotify`           |
| Deezer       | `input-selector deezer`            |
| Tidal        | `input-selector tidal`             |
| AmazonMusic  | `input-selector amazonmusic`       |
| Chromecast   | `input-selector chromecast`        |
| DTS-Play-Fi  | `input-selector dts-play-fi`       |
| AirPlay      | `input-selector airplay`           |
| Alexa        | `input-selector alexa`             |
| Music-Server | `input-selector music-server`      |

*Your AVR must support these services. Check the manual of your model to see which of these services / inputs are available. Another way to check is to use the Onkyo app and see if you can switch the AVR to such a source, if it can then this integration should also be able to do that.*

*If a service like Spotify is not a selectable input source on your AVR, just use `input-selector net` as mentioned above and then send music from your Spotify/Tidal/... app.*

### Complete list of input commands
| INPUT COMMANDS |
|------------------------------|
| `input-selector video1` |
| `input-selector vcr` |
| `input-selector dvr` |
| `input-selector video2` |
| `input-selector cb` |
| `input-selector sat` |
| `input-selector video` |
| `input-selector game` |
| `input-selector video` |
| `input-selector aux1` |
| `input-selector video` |
| `input-selector aux2` |
| `input-selector video` |
| `input-selector pc` |
| `input-selector video7` |
| `input-selector video8` |
| `input-selector video9` |
| `input-selector video10` |
| `input-selector bd` |
| `input-selector dvd` |
| `input-selector stm` |
| `input-selector tv` |
| `input-selector tape` |
| `input-selector tape1` |
| `input-selector tape2` |
| `input-selector phono` |
| `input-selector cd` |
| `input-selector fm` |
| `input-selector am` |
| `input-selector tuner` |
| `input-selector musicserver` |
| `input-selector p4s` |
| `input-selector dlna` |
| `input-selector internetradio` |
| `input-selector iradiofavorite` |
| `input-selector usb1` |
| `input-selector multich` |
| `input-selector xm` |
| `input-selector sirius` |
| `input-selector dab` |
| `input-selector universalport` |
| `input-selector upnp` |
| `input-selector usb2` |
| `input-selector net` |
| `input-selector network` |
| `input-selector usbt` |
| `input-selector bluetooth` |
| `input-selector tunein` |
| `input-selector spotify` |
| `input-selector deezer` |
| `input-selector tidal` |
| `input-selector amazonmusic` |
| `input-selector chromecast` |
| `input-selector dts-play-fi` |
| `input-selector airplay` |
| `input-selector alexa` |
| `input-selector music-server` |


[back to main README](../README.md#input-source)

[more on how to send different commands through `Input source`](./cheats.md)

[activities examples](../README.md#example-activities)
