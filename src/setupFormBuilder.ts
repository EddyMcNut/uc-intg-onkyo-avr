// Focused responsibility: Generate UI forms for setup flows
import * as uc from "@unfoldedcircle/integration-api";
import { ParsedManualConfig } from "./manualConfigParser.js";
import { DONT_INCLUDE_LISTENING_MODE, getKnownListeningModes, DISCOVERED_LISTENING_MODE, DISCOVER_LISTENING_MODE, normalizeListeningModeSetting } from "./listeningModePreferences.js";
import { DONT_INCLUDE_INPUT_SOURCE, getAliasesForReportedInput, getKnownInputSources, DISCOVERED_INPUT_SOURCE, DISCOVER_INPUT_SOURCE } from "./inputSourcePreferences.js";
import { NETWORK_INPUT_MARKERS } from "./configConstants.js";
import { SETUP_SELECTION_PAGE_SIZE } from "./inputSourcePresentation.js";

type FormSetting = { id: string; [key: string]: object | string };

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
      "tuneinPresetPosition",
      "tuneinMenuStyle",
      "inputSourceLayout",
      "networkInputMarker"
    ]);
  }

  buildManualConfigPage3(values: ParsedManualConfig): uc.RequestUserInput {
    const ids = ["createRemoteEntity", "createSensors", "createTunerPresets", "createDiracSelectEntity", "logLevel"];
    return this.buildManualConfigFormPage(values, "Manual configuration (3/4)", ids);
  }

  buildInputSourcePage(values: ParsedManualConfig, page: number, total: number): uc.RequestUserInput {
    const sources = this.getInputSourceRows(values);
    const pageSize = SETUP_SELECTION_PAGE_SIZE;
    const ids = sources.slice((page - 1) * pageSize, page * pageSize).map((source) => `ids_${source.id}`);
    return this.buildManualConfigFormPage(values, `Input Sources (${page}/${total})`, ids);
  }

  getInputSourcePageCount(values: ParsedManualConfig): number {
    return Math.ceil(this.getInputSourceRows(values).length / SETUP_SELECTION_PAGE_SIZE);
  }

  buildListeningModePage(values: ParsedManualConfig, page: number): uc.RequestUserInput {
    const modes = getKnownListeningModes();
    const pageSize = SETUP_SELECTION_PAGE_SIZE;
    const ids = modes.slice((page - 1) * pageSize, page * pageSize).map((mode) => `lmd_${mode.code}`);
    return this.buildManualConfigFormPage(values, `Listening Modes (${page}/${this.getListeningModePageCount()})`, ids);
  }

  getListeningModePageCount(): number {
    return Math.ceil(getKnownListeningModes().length / SETUP_SELECTION_PAGE_SIZE);
  }

  buildManualConfigPage4(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 1);
  }

  buildManualConfigPage5(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 2);
  }

  buildManualConfigPage6(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 3);
  }

  buildManualConfigPage7(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 4);
  }

  buildManualConfigPage8(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 5);
  }

  buildManualConfigPage9(values: ParsedManualConfig): uc.RequestUserInput {
    return this.buildListeningModePage(values, 6);
  }

  private buildManualConfigFormPage(values: ParsedManualConfig, title: string, ids: string[]): uc.RequestUserInput {
    const form = this.buildManualConfigFormAll(values);
    const settings = (form.settings as FormSetting[]).filter((setting) => ids.includes(setting.id));
    if (title.startsWith("Listening Modes")) {
      settings.unshift({
        id: `listeningModesPageInfo_${title.replace(/\W/g, "_")}`,
        label: { en: title },
        field: { label: { value: { en: "Choose whether to use the name discovered from the AVR, select an integration alias, or don't include the mode." } } }
      });
    }
    if (title.startsWith("Input Sources")) {
      settings.unshift({
        id: `inputSourcesPageInfo_${title.replace(/\W/g, "_")}`,
        label: { en: title },
        field: { label: { value: { en: "Choose the AVR name, an integration alias, or Exclude from integration." } } }
      });
    }
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
              { id: "auto", label: { en: "✨ Auto (default)" } },
              { id: "80", label: { en: values.volumeScaleDiscoveredValue && values.volumeScaleValue === 80 ? "✅ 0-80 (discovered from AVR)" : "0-80" } },
              { id: "100", label: { en: values.volumeScaleDiscoveredValue && values.volumeScaleValue === 100 ? "✅ 0-100 (discovered from AVR)" : "0-100" } }
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
        id: "inputSourceLayout",
        label: { en: "Input source layout" },
        field: {
          dropdown: {
            value: values.inputSourceLayoutValue,
            items: [
              { id: "combined", label: { en: "Combined (default)" } },
              { id: "network-first", label: { en: "Network first" } },
              { id: "network-last", label: { en: "Network last" } }
            ]
          }
        },
        description: { en: "Choose whether network sources appear mixed with regular input sources or after them." }
      },
      {
        id: "networkInputMarker",
        label: { en: "Mark network subsources" },
        field: {
          dropdown: {
            value: values.networkInputMarkerValue,
            items: NETWORK_INPUT_MARKERS.map((icon) => ({ id: icon, label: { en: icon === "none" ? "No (default)" : icon } }))
          }
        },
        description: { en: "Add the selected visual marker to network sources in the input-source selector." }
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
      },
      ...getKnownListeningModes().map((mode) => ({
        id: `lmd_${mode.code}`,
        label: { en: values.listeningModeNames[mode.code] ?? mode.aliases[0] },
        field: {
          dropdown: {
            value:
              (normalizeListeningModeSetting(values.listeningModePreferences[mode.code] ?? DISCOVER_LISTENING_MODE) === DISCOVER_LISTENING_MODE ||
                normalizeListeningModeSetting(values.listeningModePreferences[mode.code] ?? DISCOVER_LISTENING_MODE) === DISCOVERED_LISTENING_MODE) &&
              values.listeningModeNames[mode.code] &&
              values.listeningModeNames[mode.code] !== mode.aliases[0]
                ? DISCOVERED_LISTENING_MODE
                : normalizeListeningModeSetting(values.listeningModePreferences[mode.code] ?? DISCOVER_LISTENING_MODE),
            items: [
              ...(values.listeningModePreferences[mode.code] === DISCOVERED_LISTENING_MODE ||
              (values.listeningModePreferences[mode.code] === DISCOVER_LISTENING_MODE && values.listeningModeNames[mode.code] && values.listeningModeNames[mode.code] !== mode.aliases[0])
                ? [{ id: DISCOVERED_LISTENING_MODE, label: { en: "✅ Using AVR-discovered name" } }]
                : []),
              {
                id: DISCOVER_LISTENING_MODE,
                label: { en: "✨ Discover from AVR (default)" }
              },
              { id: DONT_INCLUDE_LISTENING_MODE, label: { en: "🚫 Don't include" } },
              ...mode.aliases.map((alias) => ({ id: alias, label: { en: alias } }))
            ]
          }
        }
      })),
      ...this.getInputSourceRows(values).map((source) => ({
        id: `ids_${source.id}`,
        label: { en: source.label },
        field: {
          dropdown: {
            value: source.value,
            items: source.items
          }
        }
      }))
    ]);
  }

  private getInputSourceRows(values: ParsedManualConfig): Array<{ id: string; label: string; value: string; items: Array<{ id: string; label: { en: string } }> }> {
    const known = getKnownInputSources();
    const reported = new Map(values.inputSources.map((source) => [source.id.toUpperCase(), source]));
    const hasUsableReport = values.inputSourceDiscoveryAvailable && values.inputSources.length > 0;
    const ids = hasUsableReport ? values.inputSources.map((source) => source.id.toUpperCase()) : [...new Set(known.map((source) => source.id))];
    return ids.map((id) => {
      const knownSource = known.find((source) => source.id === id);
      const avrSource = reported.get(id);
      const configured = values.idInputSources[id];
      const aliases = avrSource ? getAliasesForReportedInput(id, avrSource.name) : (knownSource?.aliases ?? []);
      const learned = avrSource?.name ?? (configured?.setting === DISCOVERED_INPUT_SOURCE ? configured.name : undefined);
      const items = [
        ...(learned ? [{ id: DISCOVERED_INPUT_SOURCE, label: { en: "✅ Using AVR-discovered name" } }] : []),
        ...(learned ? [{ id: DISCOVER_INPUT_SOURCE, label: { en: "✨ Discover from AVR (default)" } }] : []),
        { id: DONT_INCLUDE_INPUT_SOURCE, label: { en: "🚫 Don't include" } },
        ...aliases.map((alias) => ({ id: alias, label: { en: alias } }))
      ];
      const value = hasUsableReport
        ? configured?.setting === DONT_INCLUDE_INPUT_SOURCE
          ? DONT_INCLUDE_INPUT_SOURCE
          : configured?.setting === DISCOVERED_INPUT_SOURCE
            ? DISCOVERED_INPUT_SOURCE
            : configured?.setting === DISCOVER_INPUT_SOURCE
              ? DISCOVER_INPUT_SOURCE
              : configured?.setting && aliases.includes(configured.setting)
                ? configured.setting
                : learned
                  ? DISCOVERED_INPUT_SOURCE
                  : DONT_INCLUDE_INPUT_SOURCE
        : configured?.setting || (learned ? DISCOVERED_INPUT_SOURCE : (aliases[0] ?? DONT_INCLUDE_INPUT_SOURCE));
      return { id, label: learned ?? aliases[0] ?? `AVR input ${id}`, value, items };
    });
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
              { id: "configure", label: { en: "Configure integration" } },
              { id: "configure_input_sources", label: { en: "Configure input sources" } },
              { id: "configure_listening_modes", label: { en: "Configure listening modes" } },
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
              { id: "false", label: { en: "Configure" } },
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
