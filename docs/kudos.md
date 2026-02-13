## Kudos

This integration has been made possible by:

- [unfoldedcircle/integration-ts-example](https://github.com/unfoldedcircle/integration-ts-example):
  - A good starting point for building your own integration in TypeScript.
- [miracle2k/onkyo-eiscp](https://github.com/miracle2k/onkyo-eiscp):
  - Python project to communicate over a network with an Onkyo AVR.
  - Contains an impressive JSON file with all kinds of commands and the translation between human-readable and eISCP messages.
  - That JSON even contains the set of commands available _per zone, per model_, which is very thorough but that also means al lot to maintain which I would not like to do. So I removed the elements that check if a command is allowed for a zone/model. Just check the manual of your device to see what your device is capable of. So the JSON in this integration project is smaller and might even shrink some more in time.
- [estbeetoo/eiscp.js](https://github.com/estbeetoo/eiscp.js/):
  - JavaScript project to communicate over a network with an Onkyo AVR.
  - uc-intg-onkyo-avr contains a TypeScript version (thank you GitHub Copilot) of the pieces of code it could use from estbeetoo/eiscp.js, which was a lot.
- [integration-roon](https://github.com/unfoldedcircle/integration-roon):
  - TypeScript project helped to get more insights in what is needed to create a custom-integration.
- [JackJPowell/uc-intg-yamaha-avr](https://github.com/JackJPowell/uc-intg-yamaha-avr):
  - To see what uc-intg-onkyo-avr integration is missing :)
- [mase1981](https://github.com/mase1981): for helping out when I got stuck packaging this first version.
- [harvey28](https://unfolded.community/u/harvey28/summary): for testing and feedback.
- [albaintor](https://github.com/albaintor): for letting me use a piece of the awesome toolkit for entity migrations in this integration and his Sony AVR code helped me improve this integration some more.

[back to main README](../README.md#kudos)
