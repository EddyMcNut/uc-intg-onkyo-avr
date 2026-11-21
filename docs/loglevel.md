## Log level

As from v0.8.10+ the default level for log generation is `warn`. When you run setup you can reconfigure the integration to do a lot more logging. This can be handy in case of debugging for example.

During normal operation, `warn` level is the preferred setting to lower the cpu/power consumption a wee bit while still being able to log when really needed.

Only use `Debug (all)` while investigating a problem, and set it back to `warn` afterwards (see [Collect logs](./collect-logs.md)). Debug logs every message the AVR sends. The large AVR info document (model, inputs, presets, network services) is written in full only the first time it arrives and whenever it changes; repeats are logged as a single "unchanged" line.

![](../screenshots/loglevel-default.png)
