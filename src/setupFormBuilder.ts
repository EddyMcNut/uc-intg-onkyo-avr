// Focused responsibility: Generate UI forms for setup flows
import * as uc from "@unfoldedcircle/integration-api";
import { ParsedManualConfig } from "./manualConfigParser.js";

export class SetupFormBuilder {
  buildManualConfigForm(values: ParsedManualConfig): uc.RequestUserInput {
    return new uc.RequestUserInput("Manual configuration", [
      ...(values.errorMessage ? [{ id: "info", label: { en: "Validation errors" }, field: { label: { value: { en: values.errorMessage } } } }] : []),
      { id: "model", label: { en: "AVR Model (or a name you prefer)" }, field: { text: { value: values.modelName } } },
      { id: "ipAddress", label: { en: "AVR IP Address (for example `192.168.1.100`)" }, field: { text: { value: values.ipVal } } },
      { id: "port", label: { en: "AVR Port (default `60128`)" }, field: { number: { value: values.portNum } } },
      { id: "albumArtURL", label: { en: "AVR AlbumArt endpoint. Default `album_art.cgi`, if not known set to `na`." }, field: { text: { value: values.albumArtURLValue } } },
      {
        id: "listeningModeOptions",
        label: { en: "Listening mode select options (semicolon-separated, 'none' to disable, empty shows all)" },
        field: { text: { value: values.listeningModeOptions } },
        description: { en: "Optional — semicolon-separated list (e.g. stereo; straight-decode; neural-thx). Leave empty for dynamic options, enter 'none' to hide this entity." }
      },
      {
        id: "inputSelectorOptions",
        label: { en: "Input selector options (semicolon-separated, 'none' to disable, empty shows all)" },
        field: { text: { value: values.inputSelectorOptions } },
        description: { en: "Optional — semicolon-separated list (e.g. dvd; bd; net; bluetooth). Leave empty to show all inputs, enter 'none' to hide this entity." }
      },
      { id: "queueThreshold", label: { en: "Message queue threshold. Default `100`" }, field: { number: { value: values.queueThresholdValue } } },
      { id: "netMenuDelay", label: { en: "NET sub-source selection delay. Default `500`" }, field: { number: { value: values.netMenuDelayValue } } },
      {
        id: "tuneinPresetPosition",
        label: { en: "TuneIn 'My Presets' menu position (1-9). Default `1`" },
        field: { number: { value: values.tuneinPresetPositionValue } },
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
        id: "volumeScale",
        label: { en: "Volume scale (0-80 or 0-100)" },
        field: {
          dropdown: {
            value: String(values.volumeScaleValue),
            items: [
              { id: "100", label: { en: "0-100" } },
              { id: "80", label: { en: "0-80" } }
            ]
          }
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
              { id: "long", label: { en: "Long - include IP address" } },
              { id: "short", label: { en: "Short - hide IP address" } }
            ]
          }
        }
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
        id: "createSensors",
        label: { en: "Create sensor entities?" },
        field: {
          dropdown: {
            value: String(values.createSensorsValue),
            items: [
              { id: "true", label: { en: "Yes" } },
              { id: "false", label: { en: "No" } }
            ]
          }
        }
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
              en: "Choose whether to configure the integration manually, create a backup, or restore from a backup."
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
