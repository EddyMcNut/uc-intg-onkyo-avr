## Install new version

[back to main README](../README.md#install-new-version)

At this moment installing a new version is only possible by removing the current version. **As long as you make sure that during setup of the new version the selected AVR has the exact name and IP as in the current version, all your mappings in your activities will be preserved.**
If your AVR was autodiscovered, the name will be the same when you let it be autodiscovered again, as long as the IP address stays the same.

1. create a backup of the remote

   ![](../screenshots/backup.png)

2. download the tar.gz of the new version
3. configurator: remember the name of the selected entity

   ![](../screenshots/entity.png)

4. configurator: delete the integration _twice_, **the old integration must not be visible anymore in the Integrations overview**

   ![](../screenshots/delete2x.png)

5. upload the new version (see [installation procedure](./installation.md#installation))
6. make sure that the selected AVR entity has the exact same name as in the previous version (see step 3)
7. done!

[back to main README](../README.md#install-new-version)
