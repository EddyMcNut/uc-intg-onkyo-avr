## Multiple AVRs

As from v0.6.0, this integration can handle multiple AVRs in the network.

You can run the setup steps multiple times to add extra AVRs, for example:

- dont populate fields for auto-discovery

  ![](/screenshots/auto-discovery.png)

- run setup again and add an AVR which is not auto-discoverable

  ![](/screenshots/manual.png)

- now you can select the 2 AVR entities

  ![](/screenshots/select-entities.png)

  ![](/screenshots/selected-entities.png)

Now you can add a specific AVR to an activity.

For each AVR you can set specific [`Message queue Threshold`](./known-issues.md) and [album-art](./album-art.md) endpoint.

Listening modes and input sources are also configured per physical AVR. Their settings apply to all configured zones of that AVR, and AVR-reported names and codes are learned independently for each AVR.

When reconfiguring the integration, listening modes, or input sources, setup asks which AVR to configure when more than one physical AVR is registered. Zones are not selected separately.

There is a small bug in case you add multiple AVRs in one activity: in the button widget the commands can pop up as duplicates. Just select one, it's just a bug in displaying, not in registered entities.
