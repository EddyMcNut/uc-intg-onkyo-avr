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

There is a small bug in case you add multiple AVRs in one activity: in the button widget the commands can pop up as duplicates. Just select one, it's just a bug in displaying, not in registered entities.

[back to main README](../README.md#multiple-avrs)
