## Multilpe AVRs

[back to main README](../README.md#multilpe-avrs)

As from v0.6.0, this integration can handle multiple AVRs in the network. **Make sure that every AVR is communicating over a different port.** See the manual of your AVR how to change the port.

You can run the setup steps multiple times to add extra AVRs, for example:
- dont populate fields for auto-discovery *(make sure each AVR communicates over a different port)*
    
    ![](/screenshots/auto-discovery.png)

- run setup again and add an AVR which is not auto-discoverable *(make sure each AVR communicates over a different port)*

    ![](/screenshots/manual-port.png)

- now you can select the 2 AVR entities

    ![](/screenshots/select-entities.png)

- in activities just select the AVR needed for that case

    ![](/screenshots/selected-entities.png)

Now you can add specific AVR to an activity.

There is a small bug in case you add multiple AVRs in one activity: in the button widget the commands can pop up as duplicates. Just select one, it's just a bug in displaying, not in registered entities.


[back to main README](../README.md#multilpe-avrs)
