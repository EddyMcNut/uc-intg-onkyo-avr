/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { ALL_SIMPLE_COMMANDS } from "./simpleCommands.js";
import { REMOTE_SUFFIX } from "./sensorSuffixes.js";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
export const REPORTED_INPUT_COMMAND_PREFIX = "INPUT_REPORTED_";

const GRID_WIDTH = 7;

// Remote entity — optional (createRemoteEntity config). Exposes the same media-player style commands as the media player
// entity plus the generated simple commands, mapped to physical buttons and UI pages.
export function createRemoteEntity(avrEntry: string, displayBaseName: string, cmdHandler?: CmdHandlerFn, reportedInputNames?: string[]): uc.Remote {
  const reportedInputCommands = reportedInputNames?.map((name) => `${REPORTED_INPUT_COMMAND_PREFIX}${encodeURIComponent(name)}`) ?? [];
  const remoteEntity = new uc.Remote(
    `${avrEntry}${REMOTE_SUFFIX}`,
    { en: `${displayBaseName} Remote` },
    {
      features: [uc.RemoteFeatures.OnOff, uc.RemoteFeatures.Toggle],
      attributes: {
        [uc.RemoteAttributes.State]: uc.RemoteStates.Unknown
      },
      simpleCommands: [...ALL_SIMPLE_COMMANDS, ...reportedInputCommands],
      buttonMapping: buildRemoteButtonMapping(),
      uiPages: buildRemoteUiPages(reportedInputNames),
      cmdHandler
    }
  );
  return remoteEntity;
}

// Physical button mapping for the remote entity — all commands are handled by remoteEntityCommandHandler.
function buildRemoteButtonMapping(): uc.DeviceButtonMapping[] {
  return [
    uc.createBtnMapping(uc.Buttons.Back, uc.MediaPlayerCommands.Back),
    uc.createBtnMapping(uc.Buttons.Home, uc.MediaPlayerCommands.Home),
    uc.createBtnMapping(uc.Buttons.ChannelUp, uc.MediaPlayerCommands.ChannelUp),
    uc.createBtnMapping(uc.Buttons.ChannelDown, uc.MediaPlayerCommands.ChannelDown),
    uc.createBtnMapping(uc.Buttons.DpadUp, uc.MediaPlayerCommands.CursorUp),
    uc.createBtnMapping(uc.Buttons.DpadDown, uc.MediaPlayerCommands.CursorDown),
    uc.createBtnMapping(uc.Buttons.DpadLeft, uc.MediaPlayerCommands.CursorLeft),
    uc.createBtnMapping(uc.Buttons.DpadRight, uc.MediaPlayerCommands.CursorRight),
    uc.createBtnMapping(uc.Buttons.DpadMiddle, uc.MediaPlayerCommands.CursorEnter),
    uc.createBtnMapping(uc.Buttons.VolumeUp, uc.MediaPlayerCommands.VolumeUp),
    uc.createBtnMapping(uc.Buttons.VolumeDown, uc.MediaPlayerCommands.VolumeDown),
    uc.createBtnMapping(uc.Buttons.Mute, uc.MediaPlayerCommands.MuteToggle),
    uc.createBtnMapping(uc.Buttons.Power, uc.MediaPlayerCommands.Toggle),
    uc.createBtnMapping(uc.Buttons.Play, uc.MediaPlayerCommands.PlayPause),
    uc.createBtnMapping(uc.Buttons.Prev, uc.MediaPlayerCommands.Previous),
    uc.createBtnMapping(uc.Buttons.Next, uc.MediaPlayerCommands.Next)
  ];
}

function buildRemoteUiPages(reportedInputNames?: string[]): uc.UiPage[] {
  const pages: uc.UiPage[] = [];

  const avrPage1 = new uc.UiPage("onkyo_avr_commands1", "AVR commands (1)", new uc.Size(GRID_WIDTH, 8));
  avrPage1.add(uc.createUiIcon("uc:power-on", 0, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Toggle)));
  avrPage1.add(uc.createUiText("SLEEP", 6, 0, uc.createRemoteSendCmd("SLEEP_UP"), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Settings:", 0, 1, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiText("Quick", 3, 1, uc.createRemoteSendCmd("SETUP_QUICK"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiText("Full", 6, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Settings), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Treble:", 0, 2, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiIcon("uc:minus", 3, 2, uc.createRemoteSendCmd("TONE_FRONT_TREBLE_DOWN"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiIcon("uc:plus", 6, 2, uc.createRemoteSendCmd("TONE_FRONT_TREBLE_UP"), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Vocal:", 0, 3, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiIcon("uc:minus", 3, 3, uc.createRemoteSendCmd("VOCAL_DOWN"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiIcon("uc:plus", 6, 3, uc.createRemoteSendCmd("VOCAL_UP"), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Bass:", 0, 4, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiIcon("uc:minus", 3, 4, uc.createRemoteSendCmd("TONE_FRONT_BASS_DOWN"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiIcon("uc:plus", 6, 4, uc.createRemoteSendCmd("TONE_FRONT_BASS_UP"), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Center:", 0, 5, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiIcon("uc:minus", 3, 5, uc.createRemoteSendCmd("CENTER_TEMP_LEVEL_DOWN"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiIcon("uc:plus", 6, 5, uc.createRemoteSendCmd("CENTER_TEMP_LEVEL_UP"), new uc.Size(1, 1)));

  avrPage1.add(uc.createUiText("Subwoofer:", 0, 6, undefined, new uc.Size(2, 1)));
  avrPage1.add(uc.createUiIcon("uc:minus", 3, 6, uc.createRemoteSendCmd("SUBWOOFER_TEMP_LEVEL_DOWN"), new uc.Size(1, 1)));
  avrPage1.add(uc.createUiIcon("uc:plus", 6, 6, uc.createRemoteSendCmd("SUBWOOFER_TEMP_LEVEL_UP"), new uc.Size(1, 1)));
  pages.push(avrPage1);

  const avrPage2 = new uc.UiPage("onkyo_avr_commands2", "AVR commands (2)", new uc.Size(GRID_WIDTH, 8));
  avrPage2.add(uc.createUiText("Listening Mode:", 0, 0, undefined, new uc.Size(7, 1)));
  avrPage2.add(uc.createUiText("Music", 0, 1, uc.createRemoteSendCmd("LISTENING_MODE_MUSIC"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("Movie", 2, 1, uc.createRemoteSendCmd("LISTENING_MODE_MOVIE"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("Game", 4, 1, uc.createRemoteSendCmd("LISTENING_MODE_GAME"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("THX", 6, 1, uc.createRemoteSendCmd("LISTENING_MODE_THX"), new uc.Size(1, 1)));

  avrPage2.add(uc.createUiText("Dirac:", 0, 3, undefined, new uc.Size(7, 1)));
  avrPage2.add(uc.createUiText("Slot1", 0, 4, uc.createRemoteSendCmd("DIRAC_SLOT1"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("Slot2", 2, 4, uc.createRemoteSendCmd("DIRAC_SLOT2"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("Slot3", 4, 4, uc.createRemoteSendCmd("DIRAC_SLOT3"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("Off", 6, 4, uc.createRemoteSendCmd("DIRAC_OFF"), new uc.Size(1, 1)));

  avrPage2.add(uc.createUiText("LateNight", 0, 6, uc.createRemoteSendCmd("LATE_NIGHT_UP"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("MusicOptimizer", 4, 6, uc.createRemoteSendCmd("MUSIC_OPTIMIZER_UP"), new uc.Size(3, 1)));
  avrPage2.add(uc.createUiText("AccuEQ", 0, 7, uc.createRemoteSendCmd("ACCUEQ_UP"), new uc.Size(2, 1)));
  avrPage2.add(uc.createUiText("StereoAssign", 4, 7, uc.createRemoteSendCmd("STEREO_ASSIGN_UP"), new uc.Size(3, 1)));

  pages.push(avrPage2);

  const avrPage3 = reportedInputNames ? buildReportedInputPage(reportedInputNames) : new uc.UiPage("onkyo_avr_commands3", "AVR commands (3)", new uc.Size(6, 11));
  if (reportedInputNames) {
    pages.push(avrPage3);
  } else {
    avrPage3.add(uc.createUiText("strmbox", 0, 0, uc.createRemoteSendCmd("INPUT_STM"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("vcr/dvr", 2, 0, uc.createRemoteSendCmd("INPUT_VCR"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("cbl/sat", 4, 0, uc.createRemoteSendCmd("INPUT_CBL"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("bd/dvd", 0, 1, uc.createRemoteSendCmd("INPUT_BD"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("tv", 2, 1, uc.createRemoteSendCmd("INPUT_TV"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("pc", 4, 1, uc.createRemoteSendCmd("INPUT_PC"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("cd", 0, 2, uc.createRemoteSendCmd("INPUT_CD"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("game", 2, 2, uc.createRemoteSendCmd("INPUT_GAME"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("phono", 4, 2, uc.createRemoteSendCmd("INPUT_PHONO"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("tuner", 0, 3, uc.createRemoteSendCmd("INPUT_TUNER"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("am", 2, 3, uc.createRemoteSendCmd("INPUT_AM"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("fm", 4, 3, uc.createRemoteSendCmd("INPUT_FM"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("dab", 0, 4, uc.createRemoteSendCmd("INPUT_DAB"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("net", 2, 4, uc.createRemoteSendCmd("INPUT_NET"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("bluetooth", 4, 4, uc.createRemoteSendCmd("INPUT_BLUETOOTH"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("tunein", 0, 5, uc.createRemoteSendCmd("INPUT_TUNEIN"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("spotify", 2, 5, uc.createRemoteSendCmd("INPUT_SPOTIFY"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("deezer", 4, 5, uc.createRemoteSendCmd("INPUT_DEEZER"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("tidal", 0, 6, uc.createRemoteSendCmd("INPUT_TIDAL"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("amazonmusic", 2, 6, uc.createRemoteSendCmd("INPUT_AMAZONMUSIC"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("chromecast", 4, 6, uc.createRemoteSendCmd("INPUT_CHROMECAST"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("dts-play-fi", 0, 7, uc.createRemoteSendCmd("INPUT_DTS_PLAY_FI"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("music-server", 2, 7, uc.createRemoteSendCmd("INPUT_MUSIC_SERVER"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("airplay", 4, 7, uc.createRemoteSendCmd("INPUT_AIRPLAY"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("alexa", 0, 8, uc.createRemoteSendCmd("INPUT_ALEXA"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("aux1", 2, 8, uc.createRemoteSendCmd("INPUT_AUX1"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("aux2", 4, 8, uc.createRemoteSendCmd("INPUT_AUX2"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("usb1", 0, 9, uc.createRemoteSendCmd("INPUT_USB1"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("usb2", 2, 9, uc.createRemoteSendCmd("INPUT_USB2"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("tape1", 4, 9, uc.createRemoteSendCmd("INPUT_TAPE1"), new uc.Size(2, 1)));

    avrPage3.add(uc.createUiText("tape2", 0, 10, uc.createRemoteSendCmd("INPUT_TAPE2"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("multich", 2, 10, uc.createRemoteSendCmd("INPUT_MULTICH"), new uc.Size(2, 1)));
    avrPage3.add(uc.createUiText("universalport", 4, 10, uc.createRemoteSendCmd("INPUT_UNIVERSALPORT"), new uc.Size(2, 1)));
    pages.push(avrPage3);
  }

  const avrPage4 = new uc.UiPage("onkyo_avr_commands4", "AVR commands (4)", new uc.Size(GRID_WIDTH, 8));
  avrPage4.add(uc.createUiText("HDMI", 0, 0, uc.createRemoteSendCmd("HDMI_OUTPUT_UP"), new uc.Size(7, 1)));
  avrPage4.add(uc.createUiText("LipSync", 0, 1, uc.createRemoteSendCmd("LIP_SYNC_UP"), new uc.Size(7, 1)));
  avrPage4.add(uc.createUiText("PanelDisplayMode", 0, 2, uc.createRemoteSendCmd("DISPLAY_MODE_TOGGLE"), new uc.Size(7, 1)));

  avrPage4.add(uc.createUiIcon("uc:light-on", 0, 3, undefined, new uc.Size(1, 1)));
  avrPage4.add(uc.createUiText("Dark", 1, 3, uc.createRemoteSendCmd("DIMMER_DARK"), new uc.Size(2, 1)));
  avrPage4.add(uc.createUiText("Dim", 3, 3, uc.createRemoteSendCmd("DIMMER_DIM"), new uc.Size(2, 1)));
  avrPage4.add(uc.createUiText("Bright", 5, 3, uc.createRemoteSendCmd("DIMMER_BRIGHT"), new uc.Size(2, 1)));
  pages.push(avrPage4);

  return pages;
}

function buildReportedInputPage(names: string[]): uc.UiPage {
  const columns = 3;
  const rows = Math.max(1, Math.ceil(names.length / columns));
  const page = new uc.UiPage("onkyo_avr_sources", "AVR sources", new uc.Size(6, rows));
  names.forEach((name, index) => {
    page.add(uc.createUiText(name, (index % columns) * 2, Math.floor(index / columns), uc.createRemoteSendCmd(`${REPORTED_INPUT_COMMAND_PREFIX}${encodeURIComponent(name)}`), new uc.Size(2, 1)));
  });
  return page;
}
