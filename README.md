# uc-intg-onkyo-avr

Onkyo AVR custom integration for Unfolded Circle remotes.

[![GitHub Release](https://img.shields.io/github/v/release/EddyMcNut/uc-intg-onkyo-avr)](https://github.com/EddyMcNut/uc-intg-onkyo-avr/releases)
[![License](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/EddyMcNut/uc-intg-onkyo-avr/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white)](https://discord.gg/zGVYf58)
[![Unfolded Community](https://img.shields.io/badge/Unfolded-Community-orange?logo=discourse&logoColor=white)](https://unfolded.community/)

## Kudos

[Kudos](./docs/kudos.md)

## Prerequisites

Read this readme completely, it contains some tips for known issues and it also explains how to use `Input source` in a flexibale way so you can send a lot of different commands to your AVR.

Your Onkyo AVR(s) needs to be ON or STANDBY, if it is disconnected from power (off) this integration will fail. If your AVR has been disconnected from power, it could be that you first have to switch on your AVR manually one time before network commands work again (depends on the model), waking up after STANDBY should then work again.

Make sure your AVR has a fixed IP address.

## Reported to work on different brands and models

I have tested it with my Onkyo TX-RZ50. I gave it a fixed IP address (a while ago to solve Spotify hickups) and it has a wired connection to my network.

Users report it also to work with:

- TX-RZ70
- TX-NR656
- TX-NR807
- TX-NR6050
- TX-NR6100
- Pioneer VSX-932
- Integra (model unknown)

## Known issues and solutions

[Known issues and solutions](./docs/known-issues.md)

## Installation and usage

[Installation and usage](./docs/installation.md)

## Install new version

[Install new version](./docs/new-version.md)

## Multilpe AVRs

[Multiple AVRs](./docs/multiple-avrs.md)

## Album Art

[Album art](./docs/album-art.md)

## Cheats

[Cheats](./docs/cheats.md)

## Input source

[Input source](./docs/input-selector.md)

## Volume

[Volume](./docs/volume.md)

## Listening modes

[Listening modes](./docs/listening-modes.md)

## Raw messages

[Raw messages](./docs/raw.md)

## Example activities

- [Spotify](./docs/spotify.md)
- [AppleTV](./docs/atv.md)
- [DAB Radio](./docs/dab.md)
- Make sure that you add your Activities to an [Activity Group](./docs/activitygroup.md).
- `Home` \ `Customise your remote` Add your new Activity to a page and now you can give it a try on the awesome Unfolded Circle Remote!
- or, when not created an activity yet: `Home` \ `Customise your remote` and just add your AVR, in that case physical buttons are mapped.

## Collect logs

[Collect logs](./docs/collect-logs.md)

## Stuff to do / backlog

- Align and improve logging.
- The code is partly ready to deal with different zones, but that still needs some attention before that will actually work.
