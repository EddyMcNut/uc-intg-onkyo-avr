// Focused responsibility: Generate UI forms for setup flows
import * as uc from "@unfoldedcircle/integration-api";
import { ParsedManualConfig } from "./manualConfigParser.js";

export class SetupFormBuilder {
  buildManualConfigForm(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildManualConfigPage1(values);
  }

  buildManualConfigPage1(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildManualConfigFormPage(values, "Manual configuration (1/3)", [
      "info",
      "autoDiscoveryInfo",
      "model",
      "ipAddress",
      "port",
      "albumArtURL",
      "queueThreshold",
      "netMenuDelay",
      "zoneCount"
    ]);
  }

  buildManualConfigPage2(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildManualConfigFormPage(values, "Manual configuration (2/3)", [
      "entityNameStyle",
      "volumeScale",
      "volumeDisplay",
      "adjustVolumeDispl",
      "useAvrReportedInputs",
      "tuneinPresetPosition",
      "tuneinMenuStyle"
    ]);
  }

  buildManualConfigPage3(values: ParsedManualConfig): uc.RequestUserInput {
    const ids = ["createRemoteEntity", "createSensors", "createTunerPresets", "createDiracSelectEntity", "listeningModeOptions", "inputSelectorOptions", "logLevel"];
    if (values.useAvrReportedInputsValue) {
      ids.splice(ids.indexOf("inputSelectorOptions"), 1);
    }
    return this.buildManualConfigFormPage(values, "Manual configuration (3/3)", ids);
  }

  private buildManualConfigFormPage(values: ParsedManualConfig, title: string, ids: string[]): uc.RequestUserInput {
    const form = this.buildManualConfigFormAll(values);
    const settings = (form.settings as Array<{ id: string }>).filter((setting) => ids.includes(setting.id));
    return new uc.RequestUserInput(title, settings);
  }

  private buildManualConfigFormAll(values: ParsedManualConfig): uc.RequestUserInput {
    return new uc.RequestUserInput("Manual configuration", [
      ...(values.errorMessage ? [{ id: "info", label: { en: "Validation errors" }, field: { label: { value: { en: values.errorMessage } } } }] : []),
      {
        id: "autoDiscoveryInfo",
        label: { en: "Automatic AVR detection" },
        field: {
          label: {
            value: {
              en: "Leave the Model, IP Address and Port empty to let the integration try to automatically detect the AVR."
            }
          }
        }
      },
      {
        id: "model",
        label: { en: "AVR Model (or a name you prefer)" },
        field: { text: { value: values.modelName } },
        description: { en: "Leave empty together with the AVR IP Address to let the integration auto-detect the AVR." }
      },
      {
        id: "ipAddress",
        label: { en: "AVR IP Address (for example `192.168.1.100`)" },
        field: { text: { value: values.ipVal } },
        description: { en: "Leave empty together with the AVR Model to let the integration auto-detect the AVR." }
      },
      {
        id: "port",
        label: { en: "AVR Port (default `60128`)" },
        field: { number: { value: values.portNum } },
        description: { en: "Leave empty during auto-detection to use the port reported by the AVR." }
      },
      { id: "albumArtURL", label: { en: "AVR AlbumArt endpoint. Default `album_art.cgi`, if not known set to `na`." }, field: { text: { value: values.albumArtURLValue } } },
      { id: "queueThreshold", label: { en: "Message queue threshold. Default `100`" }, field: { number: { value: values.queueThresholdValue } } },
      { id: "netMenuDelay", label: { en: "NET sub-source selection delay. Default `500`" }, field: { number: { value: values.netMenuDelayValue } } },
      {
        id: "volumeScale",
        label: { en: "Volume scale" },
        field: {
          dropdown: {
            value: String(values.volumeScaleValue),
            items: [
              { id: "auto", label: { en: "Auto (default)" } },
              { id: "80", label: { en: "0-80" } },
              { id: "100", label: { en: "0-100" } }
            ]
          }
        },
        description: {
          en: "Auto reads the volume scale (0-80 or 0-100) from the AVR itself the first time it reports its capabilities, and then stores that value. Pick a scale yourself to skip that."
        }
      },
      {
        id: "volumeDisplay",
        label: { en: "Volume display" },
        field: {
          dropdown: {
            value: String(values.volumeDisplayValue),
            items: [
              { id: "absolute", label: { en: "Absolute (1-100)" } },
              { id: "relative", label: { en: "Relative (dB)" } }
            ]
          }
        }
      },
      {
        id: "adjustVolumeDispl",
        label: { en: "Adjust volume display" },
        field: {
          dropdown: {
            value: String(values.adjustVolumeDisplValue),
            items: [
              { id: "true", label: { en: "Yes - eISCP divided by 2" } },
              { id: "false", label: { en: "No - just eISCP" } }
            ]
          }
        }
      },
      {
        id: "entityNameStyle",
        label: { en: "Entity name style" },
        field: {
          dropdown: {
            value: String(values.entityNameStyleValue),
            items: [
              { id: "short", label: { en: "Short (default)" } },
              { id: "long", label: { en: "Long (includes IP address)" } }
            ]
          }
        }
      },
      {
        id: "useAvrReportedInputs",
        label: { en: "Input source names" },
        field: {
          dropdown: {
            value: String(values.useAvrReportedInputsValue),
            items: [
              { id: "true", label: { en: "Use AVR names (default)" } },
              { id: "false", label: { en: "Use integration names" } }
            ]
          }
        },
        description: {
          en: "Use AVR-reported names and IDs when available. Older AVRs without a usable input list fall back to the integration mappings."
        }
      },
      {
        id: "tuneinPresetPosition",
        label: { en: "TuneIn 'My Presets' menu position (default 1)" },
        field: { dropdown: { value: String(values.tuneinPresetPositionValue), items: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: { en: String(i + 1) } })) } },
        description: { en: "Position of 'My Presets' in your AVR's TuneIn menu (1=first, 2=second, etc.)" }
      },
      {
        id: "tuneinMenuStyle",
        label: { en: "TuneIn menu mode" },
        field: {
          dropdown: {
            value: String(values.tuneinMenuStyleValue),
            items: [
              { id: "mypresets", label: { en: "My Presets (default)" } },
              { id: "full", label: { en: "Full menu" } }
            ]
          }
        },
        description: { en: "Choose how TuneIn navigation is handled when selecting presets." }
      },
      {
        id: "zoneCount",
        label: { en: "Number of zones to configure" },
        field: {
          dropdown: {
            value: String(values.zoneCountValue),
            items: [
              { id: "1", label: { en: "1 zone (Main only)" } },
              { id: "2", label: { en: "2 zones (Main + Zone 2)" } },
              { id: "3", label: { en: "3 zones (Main + Zone 2 + Zone 3)" } },
              { id: "4", label: { en: "4 zones (Main + Zone 2 + Zone 3 + Zone 4)" } }
            ]
          }
        }
      },
      {
        id: "listeningModeOptions",
        label: { en: "Listening mode options (semicolon-separated, 'all' shows all, 'none' to disable)" },
        field: { text: { value: values.listeningModeOptions } },
        description: { en: "Optional — semicolon-separated list (e.g. stereo; straight-decode; neural-thx). Enter 'all' for dynamic options, enter 'none' to hide this entity." }
      },
      {
        id: "inputSelectorOptions",
        label: { en: "Input selector options (semicolon-separated, 'all' shows all, 'none' to disable)" },
        field: { text: { value: values.inputSelectorOptions } },
        description: { en: "Optional — semicolon-separated list (e.g. dvd; bd; net; bluetooth). Enter 'all' to show all inputs, enter 'none' to hide this entity." }
      },
      {
        id: "createRemoteEntity",
        label: { en: "Create remote entity?" },
        field: {
          dropdown: {
            value: String(values.createRemoteEntityValue),
            items: [
              { id: "false", label: { en: "No" } },
              { id: "true", label: { en: "Yes (default)" } }
            ]
          }
        },
        description: { en: "Creates a remote entity with physical button mapping and a command page to send AVR commands, e.g. power, volume, mute, navigation, input and sleep timers." }
      },
      {
        id: "createSensors",
        label: { en: "Create sensor entities?" },
        field: {
          dropdown: {
            value: String(values.createSensorsValue),
            items: [
              { id: "true", label: { en: "Yes (default)" } },
              { id: "false", label: { en: "No" } }
            ]
          }
        }
      },
      {
        id: "createTunerPresets",
        label: { en: "Create Tuner Presets select entity?" },
        field: {
          dropdown: {
            value: String(values.createTunerPresetsValue),
            items: [
              { id: "true", label: { en: "Yes (default)" } },
              { id: "false", label: { en: "No" } }
            ]
          }
        },
        description: {
          en: "Creates a select entity listing the DAB/FM stations your AVR reports. Selecting a station recalls that preset. Needs an AVR that reports its presets; the entity stays empty otherwise."
        }
      },
      {
        id: "createDiracSelectEntity",
        label: { en: "Create Dirac select entity?" },
        field: {
          dropdown: {
            value: String(values.createDiracSelectEntityValue),
            items: [
              { id: "true", label: { en: "Yes (default)" } },
              { id: "false", label: { en: "No" } }
            ]
          }
        },
        description: { en: "Creates a select entity with fixed options Off, Slot 1, Slot 2, Slot 3 to switch Dirac room correction." }
      },
      {
        id: "logLevel",
        label: { en: "Log level" },
        field: {
          dropdown: {
            value: String(values.logLevelValue),
            items: [
              { id: "error", label: { en: "Error only" } },
              { id: "warn", label: { en: "Warn + Error (default)" } },
              { id: "info", label: { en: "Info + Warn + Error" } },
              { id: "debug", label: { en: "Debug (all)" } }
            ]
          }
        },
        description: { en: "Lower levels log more, which costs slightly more CPU. Warn is recommended for normal use." }
      }
    ]);
  }

  buildReconfigureForm(): uc.RequestUserInput {
    return new uc.RequestUserInput("Configuration", [
      {
        id: "choice",
        label: { en: "Action" },
        field: {
          dropdown: {
            value: "configure",
            items: [
              { id: "configure", label: { en: "Configure" } },
              { id: "backup", label: { en: "Create configuration backup" } },
              { id: "restore", label: { en: "Restore configuration from backup" } },
              { id: "delete_config", label: { en: "Delete config" } }
            ]
          }
        }
      }
    ]);
  }

  buildInitialSetupForm(): uc.RequestUserInput {
    return new uc.RequestUserInput("Initial setup", [
      {
        id: "info",
        label: { en: "Setup" },
        field: {
          label: {
            value: {
              en: "Choose whether to configure the integration manually or restore from a backup."
            }
          }
        }
      },
      {
        id: "restore_from_backup",
        label: { en: "Setup mode" },
        field: {
          dropdown: {
            value: "false",
            items: [
              { id: "false", label: { en: "Configure manually" } },
              { id: "true", label: { en: "Restore from backup" } }
            ]
          }
        },
        description: {
          en: "Manual setup opens the configuration form. Integration Manager uses restore mode automatically during update restore."
        }
      }
    ]);
  }

  buildBackupForm(backupData: string): uc.RequestUserInput {
    return new uc.RequestUserInput("Backup data", [
      {
        id: "backup_data",
        label: { en: "Backup data (JSON)" },
        field: {
          textarea: {
            value: backupData
          }
        }
      }
    ]);
  }

  buildRestoreForm(existingData?: string): uc.RequestUserInput {
    return new uc.RequestUserInput("Restore data", [
      {
        id: "restore_data",
        label: { en: "Configuration Backup Data" },
        field: { textarea: { value: existingData ?? "" } }
      }
    ]);
  }

  buildDeleteConfirmForm(): uc.RequestUserInput {
    return new uc.RequestUserInput("Confirm delete", [
      {
        id: "info",
        label: { en: "Delete config" },
        field: { label: { value: { en: "This will remove all configured AVRs and reset integration state. This action cannot be undone." } } }
      },
      {
        id: "confirm_delete_config",
        label: { en: "Confirm delete config" },
        field: { checkbox: { value: false } }
      }
    ]);
  }

  buildAutoDiscoveryFailedForm(): uc.RequestUserInput {
    return new uc.RequestUserInput("Manual configuration", [
      {
        id: "info",
        label: { en: "Auto-discovery failed" },
        field: {
          label: {
            value: {
              en: "No Onkyo AVR found on the network during auto-discovery. Please enter the AVR model and IP address manually."
            }
          }
        }
      },
      {
        id: "model",
        label: { en: "AVR Model (or a name you prefer)" },
        field: { text: { value: "" } }
      },
      {
        id: "ipAddress",
        label: { en: "AVR IP Address (for example `192.168.1.100`)" },
        field: { text: { value: "" } }
      }
    ]);
  }

  buildRestoreValidationErrorForm(errors: string[], rawData: string): uc.RequestUserInput {
    return new uc.RequestUserInput("Restore data", [
      {
        id: "info",
        label: { en: "Restore validation errors" },
        field: { label: { value: { en: `Errors:\n- ${errors.join("\n- ")}` } } }
      },
      {
        id: "restore_data",
        label: { en: "Configuration Backup Data" },
        field: { textarea: { value: rawData } }
      }
    ]);
  }
}
