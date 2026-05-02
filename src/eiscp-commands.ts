export const eiscpCommands = {
  commands: {
    PWR: {
      name: "system-power",
      description: "System Power Command",
      values: {
        "00": { name: "standby", description: "sets System Standby" },
        "01": { name: "on", description: "sets System On" },
        QSTN: { name: "query", description: "gets the System Power Status" }
      }
    },
    AMT: {
      name: "audio-muting",
      description: "Audio Muting Command",
      values: {
        "00": { name: "off", description: "sets Audio Muting Off" },
        "01": { name: "on", description: "sets Audio Muting On" },
        TG: { name: "toggle", description: "sets Audio Muting Wrap-Around" },
        QSTN: { name: "query", description: "gets the Audio Muting State" }
      }
    },
    MZM: {
      name: "multi-zone-muting",
      description: "UC integration Multi-Zone Muting Command",
      values: {
        ALLON: { name: "all-on", description: "sets Audio Muting On for all configured zones" },
        ALLOFF: { name: "all-off", description: "sets Audio Muting Off for all configured zones" },
        ALLTG: { name: "all-toggle", description: "sets Audio Muting Toggle for all configured zones" },
        ZM2ON: { name: "main-zone2-on", description: "sets Audio Muting On for main and zone2" },
        ZM2OFF: { name: "main-zone2-off", description: "sets Audio Muting Off for main and zone2" },
        ZM2TG: { name: "main-zone2-toggle", description: "sets Audio Muting Toggle for main and zone2" },
        ZM3ON: { name: "main-zone3-on", description: "sets Audio Muting On for main and zone3" },
        ZM3OFF: { name: "main-zone3-off", description: "sets Audio Muting Off for main and zone3" },
        ZM3TG: { name: "main-zone3-toggle", description: "sets Audio Muting Toggle for main and zone3" },
        Z23ON: { name: "zone2-zone3-on", description: "sets Audio Muting On for zone2 and zone3" },
        Z23OFF: { name: "zone2-zone3-off", description: "sets Audio Muting Off for zone2 and zone3" },
        Z23TG: { name: "zone2-zone3-toggle", description: "sets Audio Muting Toggle for zone2 and zone3" }
      }
    },
    SPA: {
      name: "speaker-a",
      description: "Speaker A Command",
      values: {
        "00": { name: "off", description: "sets Speaker Off" },
        "01": { name: "on", description: "sets Speaker On" },
        UP: { name: "up", description: "sets Speaker Switch Wrap-Around" },
        QSTN: { name: "query", description: "gets the Speaker State" }
      }
    },
    SPB: {
      name: "speaker-b",
      description: "Speaker B Command",
      values: {
        "00": { name: "off", description: "sets Speaker Off" },
        "01": { name: "on", description: "sets Speaker On" },
        UP: { name: "up", description: "sets Speaker Switch Wrap-Around" },
        QSTN: { name: "query", description: "gets the Speaker State" }
      }
    },
    SPL: {
      name: "speaker-layout",
      description: "Speaker Layout Command",
      values: {
        SB: { name: "surrback", description: "sets SurrBack Speaker" },
        FH: {
          name: ["front-high", "surrback-front-high-speakers"],
          description: "sets Front High Speaker / SurrBack+Front High Speakers"
        },
        FW: {
          name: ["front-wide", "surrback-front-wide-speakers"],
          description: "sets Front Wide Speaker / SurrBack+Front Wide Speakers"
        },
        HW: {
          name: ["front-high-front-wide-speakers"],
          description: "sets, Front High+Front Wide Speakers"
        },
        UP: { name: "up", description: "sets Speaker Switch Wrap-Around" },
        QSTN: { name: "query", description: "gets the Speaker State" }
      }
    },
    MVL: {
      name: "volume",
      description: "Master Volume Command",
      values: {
        "0,100": { description: "Volume Level 0 – 100 ( In hexadecimal representation)" },
        "0,80": { description: "Volume Level 0 – 80 ( In hexadecimal representation)" },
        UP: { name: "level-up", description: "sets Volume Level Up" },
        DOWN: { name: "level-down", description: "sets Volume Level Down" },
        UP1: { name: "level-up-1db-step", description: "sets Volume Level Up 1dB Step" },
        DOWN1: {
          name: "level-down-1db-step",
          description: "sets Volume Level Down 1dB Step"
        },
        QSTN: { name: "query", description: "gets the Volume Level" }
      }
    },
    MZV: {
      name: "multi-zone-volume",
      description: "UC integration Multi-Zone Volume Command",
      values: {
        ALLUP1: { name: "all-up", description: "sets Volume Level Up for all configured zones 1dB step" },
        ALLDOWN1: { name: "all-down", description: "sets Volume Level Down for all configured zones 1dB step" },
        ZM2UP1: { name: "main-zone2-up", description: "sets Volume Level Up for main and zone2 1dB step" },
        ZM2DOWN1: { name: "main-zone2-down", description: "sets Volume Level Down for main and zone2 1dB step" },
        ZM3UP1: { name: "main-zone3-up", description: "sets Volume Level Up for main and zone3 1dB step" },
        ZM3DOWN1: { name: "main-zone3-down", description: "sets Volume Level Down for main and zone3 1dB step" },
        Z23UP1: { name: "zone2-zone3-up", description: "sets Volume Level Up for zone2 and zone3 1dB step" },
        Z23DOWN1: { name: "zone2-zone3-down", description: "sets Volume Level Down for zone2 and zone3 1dB step" }
      }
    },
    TFR: {
      name: "tone-front",
      description: "Tone(Front) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Front Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Front Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Front Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Front Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Front Treble up(2 step)" },
        TDOWN: { name: "treble-down", description: "sets Front Treble down(2 step)" },
        QSTN: { name: "query", description: 'gets Front Tone ("BxxTxx")' }
      }
    },
    TFW: {
      name: "tone-front-wide",
      description: "Tone(Front Wide) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Front Wide Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Front Wide Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Front Wide Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Front Wide Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Front Wide Treble up(2 step)" },
        TDOWN: { name: "treble-down", description: "sets Front Wide Treble down(2 step)" },
        QSTN: { name: "query", description: 'gets Front Wide Tone ("BxxTxx")' }
      }
    },
    TFH: {
      name: "tone-front-high",
      description: "Tone(Front High) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Front High Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Front High Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Front High Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Front High Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Front High Treble up(2 step)" },
        TDOWN: { name: "treble-down", description: "sets Front High Treble down(2 step)" },
        QSTN: { name: "query", description: 'gets Front High Tone ("BxxTxx")' }
      }
    },
    TCT: {
      name: "tone-center",
      description: "Tone(Center) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Center Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Center Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Center Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Center Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Center Treble up(2 step)" },
        TDOWN: { name: "treble-down", description: "sets Center Treble down(2 step)" },
        QSTN: { name: "query", description: 'gets Cetner Tone ("BxxTxx")' }
      }
    },
    TSR: {
      name: "tone-surround",
      description: "Tone(Surround) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Surround Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Surround Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Surround Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Surround Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Surround Treble up(2 step)" },
        TDOWN: { name: "treble-down", description: "sets Surround Treble down(2 step)" },
        QSTN: { name: "query", description: 'gets Surround Tone ("BxxTxx")' }
      }
    },
    TSB: {
      name: "tone-surround-back",
      description: "Tone(Surround Back) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Surround Back Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        "T{xx}": {
          name: "t-xx",
          description: 'Surround Back Treble (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Surround Back Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Surround Back Bass down(2 step)" },
        TUP: { name: "treble-up", description: "sets Surround Back Treble up(2 step)" },
        TDOWN: {
          name: "treble-down",
          description: "sets Surround Back Treble down(2 step)"
        },
        QSTN: { name: "query", description: 'gets Surround Back Tone ("BxxTxx")' }
      }
    },
    TSW: {
      name: "tone-subwoofer",
      description: "Tone(Subwoofer) Command",
      values: {
        "B{xx}": {
          name: "b-xx",
          description: 'Subwoofer Bass (xx is "-A"..."00"..."+A"[-10...0...+10 2 step]'
        },
        BUP: { name: "bass-up", description: "sets Subwoofer Bass up(2 step)" },
        BDOWN: { name: "bass-down", description: "sets Subwoofer Bass down(2 step)" },
        QSTN: { name: "query", description: 'gets Subwoofer Tone ("BxxTxx")' }
      }
    },
    SLP: {
      name: "sleep-set",
      description: "Sleep Set Command",
      values: {
        "1,90": {
          name: "time-1-90min",
          description: "sets Sleep Time 1 - 90min ( In hexadecimal representation)"
        },
        OFF: { name: "time-off", description: "sets Sleep Time Off" },
        UP: { name: "up", description: "sets Sleep Time Wrap-Around UP" },
        QSTN: { name: "query", description: "gets The Sleep Time" }
      }
    },
    SLC: {
      name: "speaker-level-calibration",
      description: "Speaker Level Calibration Command",
      values: {
        TEST: { name: "test", description: "TEST Key" },
        CHSEL: { name: "chsel", description: "CH SEL Key" },
        UP: { name: "up", description: "LEVEL + Key" },
        DOWN: { name: "down", description: "LEVEL – KEY" }
      }
    },
    SWL: {
      name: "subwoofer-temporary-level",
      description: "Subwoofer (temporary) Level Command",
      values: {
        "-15,0,12": {
          name: "15db-0db-12db",
          description: "sets Subwoofer Level -15dB - 0dB - +12dB"
        },
        UP: { name: "up", description: "LEVEL + Key" },
        DOWN: { name: "down", description: "LEVEL – KEY" },
        QSTN: { name: "query", description: "gets the Subwoofer Level" }
      }
    },
    CTL: {
      name: "center-temporary-level",
      description: "Center (temporary) Level Command",
      values: {
        "-12,0,12": {
          name: "12db-0db-12db",
          description: "sets Center Level -12dB - 0dB - +12dB"
        },
        UP: { name: "up", description: "LEVEL + Key" },
        DOWN: { name: "down", description: "LEVEL – KEY" },
        QSTN: { name: "query", description: "gets the Subwoofer Level" }
      }
    },
    DIF: {
      name: "display-mode",
      description: "Display Mode Command",
      values: {
        "00": { name: "selector-volume", description: "sets Selector + Volume Display Mode" },
        "01": {
          name: "selector-listening",
          description: "sets Selector + Listening Mode Display Mode"
        },
        "02": { name: "02", description: "Display Digital Format(temporary display)" },
        "03": { name: "03", description: "Display Video Format(temporary display)" },
        TG: { name: "toggle", description: "sets Display Mode Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Display Mode" }
      }
    },
    DIM: {
      name: "dimmer-level",
      description: "Dimmer Level Command",
      values: {
        "00": { name: "bright", description: 'sets Dimmer Level "Bright"' },
        "01": { name: "dim", description: 'sets Dimmer Level "Dim"' },
        "02": { name: "dark", description: 'sets Dimmer Level "Dark"' },
        "03": { name: "shut-off", description: 'sets Dimmer Level "Shut-Off"' },
        "08": {
          name: "bright-led-off",
          description: 'sets Dimmer Level "Bright & LED OFF"'
        },
        DIM: { name: "dim", description: "sets Dimmer Level Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Dimmer Level" }
      }
    },
    OSD: {
      name: "setup",
      description: "Setup Operation Command",
      values: {
        MENU: { name: "menu", description: "Menu Key" },
        UP: { name: "up", description: "Up Key" },
        DOWN: { name: "down", description: "Down Key" },
        RIGHT: { name: "right", description: "Right Key" },
        LEFT: { name: "left", description: "Left Key" },
        ENTER: { name: "enter", description: "Enter Key" },
        EXIT: { name: "exit", description: "Exit Key" },
        AUDIO: { name: "audio", description: "Audio Adjust Key" },
        VIDEO: { name: "video", description: "Video Adjust Key" },
        HOME: { name: "home", description: "Home Key" }
      }
    },
    MEM: {
      name: "memory-setup",
      description: "Memory Setup Command",
      values: {
        STR: { name: "str", description: "stores memory" },
        RCL: { name: "rcl", description: "recalls memory" },
        LOCK: { name: "lock", description: "locks memory" },
        UNLK: { name: "unlk", description: "unlocks memory" }
      }
    },
    IFA: {
      name: "audio-information",
      description: "Audio Information Command",
      values: {
        "nnnnn:nnnnn": {
          description: "Information of Audio(Same Immediate Display ',' is separator of informations)"
        },
        QSTN: { name: "query", description: "gets Information of Audio" }
      }
    },
    IFV: {
      name: "video-information",
      description: "Video Information Command",
      values: {
        "nnnnn:nnnnn": {
          description: "information of Video(Same Immediate Display ',' is separator of informations)"
        },
        QSTN: { name: "query", description: "gets Information of Video" }
      }
    },
    FLD: {
      name: "fp-display",
      description: "FP Display Information Command",
      values: {
        "{xx}{xx}{xx}{xx}{xx}x": {
          description: "FP Display Information Character Code for FP Display (UTF-8 encoded)"
        },
        QSTN: { name: "query", description: "gets FP Display Information" }
      }
    },
    SLI: {
      name: "input-selector",
      description: "Input Selector Command",
      values: {
        "00": { name: ["video1", "vcr", "dvr"], description: "sets VIDEO1, VCR/DVR" },
        "01": { name: ["video2", "cbl", "sat"], description: "sets VIDEO2, CBL/SAT" },
        "02": { name: ["video3", "game"], description: "sets VIDEO3, GAME/TV, GAME" },
        "03": { name: ["video4", "aux1"], description: "sets VIDEO4, AUX1(AUX)" },
        "04": { name: ["video5", "aux2"], description: "sets VIDEO5, AUX2" },
        "05": { name: ["video6", "pc"], description: "sets VIDEO6, PC" },
        "06": { name: "video7", description: "sets VIDEO7" },
        "07": { name: "video8", description: "sets VIDEO8" },
        "08": { name: "video9", description: "sets VIDEO9" },
        "09": { name: "video10", description: "sets VIDEO10" },
        "10": { name: ["bd", "dvd"], description: "sets DVD, BD/DVD" },
        "11": { name: "stm", description: "sets STM, STMBOX" },
        "12": { name: "tv", description: "sets TV" },
        "20": { name: ["tape", "tape1"], description: "sets TAPE(1), TV/TAPE" },
        "21": { name: "tape2", description: "sets TAPE2" },
        "22": { name: "phono", description: "sets PHONO" },
        "23": { name: "cd", description: "sets CD" },
        "24": { name: "fm", description: "sets FM" },
        "25": { name: "am", description: "sets AM" },
        "26": { name: "tuner", description: "sets TUNER" },
        "27": { name: ["musicserver", "p4s", "dlna"], description: "sets MUSIC SERVER" },
        "28": { name: ["internetradio", "iradiofavorite"], description: "sets INTERNET RADIO, iRadio Favorite" },
        "29": { name: "usb1", description: "sets USB (subsetting of NET" },
        "30": { name: "multich", description: "sets MULTI CH" },
        "31": { name: "xm", description: "sets XM" },
        "32": { name: "sirius", description: "sets SIRIUS" },
        "33": { name: "dab", description: "sets DAB" },
        "40": { name: ["universalport", "upnp"], description: "sets Universal PORT" },
        "2A": { name: "usb2", description: "sets USB(Rear)" },
        "2B": { name: ["net", "network"], description: "sets NETWORK, NET" },
        "2C": { name: "usbt", description: "sets USB(toggle)" },
        "2E": { name: "bluetooth", description: "sets bluetooth" },
        NSS01: { name: "tunein", description: "UC integration automatically selects TuneIn after selecting NET" },
        NSS02: { name: "spotify", description: "UC integration automatically selects Spotify after selecting NET" },
        NSS03: { name: "deezer", description: "UC integration automatically selects Deezer after selecting NET" },
        NSS04: { name: "tidal", description: "UC integration automatically selects Tidal after selecting NET" },
        NSS05: { name: "amazonmusic", description: "UC integration automatically selects AmazonMusic after selecting NET" },
        NSS06: { name: "chromecast", description: "UC integration automatically selects Chromecast after selecting NET" },
        NSS07: { name: "dts-play-fi", description: "UC integration automatically selects DTS-Play-Fi after selecting NET" },
        NSS08: { name: "airplay", description: "UC integration automatically selects AirPlay after selecting NET" },
        NSS09: { name: "alexa", description: "UC integration automatically selects Alexa after selecting NET" },
        NSS10: { name: "music-server", description: "UC integration automatically selects Music-Server after selecting NET" },
        UP: { name: "up", description: "sets Selector Position Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Selector Position Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    SLR: {
      name: "recout-selector",
      description: "RECOUT Selector Command",
      values: {
        "10": { name: "dvd", description: "sets DVD" },
        "20": { name: "tape", description: "sets TAPE(1)" },
        "21": { name: "tape2", description: "sets TAPE2" },
        "22": { name: "phono", description: "sets PHONO" },
        "23": { name: "cd", description: "sets CD" },
        "24": { name: "fm", description: "sets FM" },
        "25": { name: "am", description: "sets AM" },
        "26": { name: "tuner", description: "sets TUNER" },
        "27": { name: "music-server", description: "sets MUSIC SERVER" },
        "28": { name: "internet-radio", description: "sets INTERNET RADIO" },
        "30": { name: "multi-ch", description: "sets MULTI CH" },
        "31": { name: "xm", description: "sets XM" },
        "80": { name: "source", description: "sets SOURCE" },
        "00": { name: "video1", description: "sets VIDEO1" },
        "01": { name: "video2", description: "sets VIDEO2" },
        "02": { name: "video3", description: "sets VIDEO3" },
        "03": { name: "video4", description: "sets VIDEO4" },
        "04": { name: "video5", description: "sets VIDEO5" },
        "05": { name: "video6", description: "sets VIDEO6" },
        "06": { name: "video7", description: "sets VIDEO7" },
        "7F": { name: "off", description: "sets OFF" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    SLA: {
      name: "audio-selector",
      description: "Audio Selector Command",
      values: {
        "00": { name: "auto", description: "sets AUTO" },
        "01": { name: "multi-channel", description: "sets MULTI-CHANNEL" },
        "02": { name: "analog", description: "sets ANALOG" },
        "03": { name: "ilink", description: "sets iLINK" },
        "04": { name: "hdmi", description: "sets HDMI" },
        "05": { name: ["coax", "opt"], description: "sets COAX/OPT" },
        "06": { name: "balance", description: "sets BALANCE" },
        "07": { name: "arc", description: "sets ARC" },
        UP: { name: "up", description: "sets Audio Selector Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Audio Selector Status" }
      }
    },
    TGA: {
      name: "12v-trigger-a",
      description: "12V Trigger A Command",
      values: {
        "00": { name: "off", description: "sets 12V Trigger A Off" },
        "01": { name: "on", description: "sets 12V Trigger A On" }
      }
    },
    TGB: {
      name: "12v-trigger-b",
      description: "12V Trigger B Command",
      values: {
        "00": { name: "off", description: "sets 12V Trigger B Off" },
        "01": { name: "on", description: "sets 12V Trigger B On" }
      }
    },
    TGC: {
      name: "12v-trigger-c",
      description: "12V Trigger C Command",
      values: {
        "00": { name: "off", description: "sets 12V Trigger C Off" },
        "01": { name: "on", description: "sets 12V Trigger C On" }
      }
    },
    VOS: {
      name: "video-output-selector",
      description: "Video Output Selector",
      values: {
        "00": { name: "d4", description: "sets D4" },
        "01": { name: "component", description: "sets Component" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    HDO: {
      name: "hdmi-output-selector",
      description: "HDMI Output Selector",
      values: {
        "00": { name: ["no", "analog"], description: "sets No, Analog" },
        "01": { name: ["yes", "out"], description: "sets Yes/Out Main, HDMI Main" },
        "02": { name: ["out-sub", "sub"], description: "sets Out Sub, HDMI Sub" },
        "03": { name: ["both"], description: "sets, Both" },
        "04": { name: ["both"], description: "sets, Both(Main)" },
        "05": { name: ["both"], description: "sets, Both(Sub)" },
        UP: { name: "up", description: "sets HDMI Out Selector Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The HDMI Out Selector" }
      }
    },
    HAO: {
      name: "hdmi-audio-out",
      description: "HDMI Audio Out",
      values: {
        "00": { name: "off", description: "sets Off" },
        "01": { name: "on", description: "sets On" },
        "02": { name: "auto", description: "sets Auto" },
        UP: { name: "up", description: "sets HDMI Audio Out Wrap-Around Up" },
        QSTN: { name: "query", description: "gets HDMI Audio Out" }
      }
    },
    RES: {
      name: "monitor-out-resolution",
      description: "Monitor Out Resolution",
      values: {
        "00": { name: "through", description: "sets Through" },
        "01": { name: "auto", description: "sets Auto(HDMI Output Only)" },
        "02": { name: "480p", description: "sets 480p" },
        "03": { name: "720p", description: "sets 720p" },
        "04": { name: "1080i", description: "sets 1080i" },
        "05": { name: "1080p", description: "sets 1080p(HDMI Output Only)" },
        "07": { name: ["1080p", "24fs"], description: "sets 1080p/24fs(HDMI Output Only)" },
        "08": { name: "4k-upcaling", description: "sets 4K Upcaling(HDMI Output Only)" },
        "06": { name: "source", description: "sets Source" },
        UP: { name: "up", description: "sets Monitor Out Resolution Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Monitor Out Resolution" }
      }
    },
    ISF: {
      name: "isf-mode",
      description: "ISF Mode",
      values: {
        "00": { name: "custom", description: "sets ISF Mode Custom" },
        "01": { name: "day", description: "sets ISF Mode Day" },
        "02": { name: "night", description: "sets ISF Mode Night" },
        UP: { name: "up", description: "sets ISF Mode State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The ISF Mode State" }
      }
    },
    VWM: {
      name: "video-wide-mode",
      description: "Video Wide Mode",
      values: {
        "00": { name: "auto", description: "sets Auto" },
        "01": { name: "4-3", description: "sets 4:3" },
        "02": { name: "full", description: "sets Full" },
        "03": { name: "zoom", description: "sets Zoom" },
        "04": { name: "zoom", description: "sets Wide Zoom" },
        "05": { name: "smart-zoom", description: "sets Smart Zoom" },
        UP: { name: "up", description: "sets Video Zoom Mode Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Video Zoom Mode" }
      }
    },
    VPM: {
      name: "video-picture-mode",
      description: "Video Picture Mode",
      values: {
        "00": { name: "through", description: "sets Through" },
        "01": { name: "custom", description: "sets Custom" },
        "02": { name: "cinema", description: "sets Cinema" },
        "03": { name: "game", description: "sets Game" },
        "05": { name: "isf-day", description: "sets ISF Day" },
        "06": { name: "isf-night", description: "sets ISF Night" },
        "07": { name: "streaming", description: "sets Streaming" },
        "08": { name: "direct", description: "sets Direct" },
        UP: { name: "up", description: "sets Video Zoom Mode Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Video Zoom Mode" }
      }
    },
    LMD: {
      name: "listening-mode",
      description: "Listening Mode Command",
      values: {
        "11": { name: ["pure-audio", "pure-direct"], description: "sets PURE AUDIO" },
        "12": { name: "multiplex", description: "sets MULTIPLEX" },
        "13": { name: ["full-mono", "extended-mono"], description: "sets FULL MONO" },
        "14": { name: "dolby-virtual", description: "sets DOLBY VIRTUAL" },
        "15": { name: "dts-surround-sensation", description: "sets DTS Surround Sensation" },
        "16": { name: "audyssey-dsx", description: "sets Audyssey DSX" },
        "40": { name: "straight-decode", description: "sets Straight Decode" },
        "41": { name: "dolby-ex", description: "sets Dolby EX" },
        "42": { name: "thx-cinema", description: "sets THX Cinema" },
        "43": { name: "thx-surround-ex", description: "sets THX Surround EX" },
        "44": { name: "thx-music", description: "sets THX Music" },
        "50": { name: ["thx-u2", "s-cinema", "cinema2"], description: "sets THX U2/S2/I/S Cinema/Cinema2" },
        "51": { name: ["thx-musicmode", "s-music"], description: "sets THX MusicMode, S Music" },
        "52": { name: ["thx-games", "thx-u2", "s2", "i", "s-games"], description: "sets THX Games Mode,THX U2/S2/I/S Games" },
        "80": { name: ["pliix-movie", "dolby-surround"], description: "sets PLII/PLIIx Movie" },
        "81": { name: "pliix-music", description: "sets PLII/PLIIx Music" },
        "82": { name: ["neo-6-cinema", "neo-x-cinema", "dts-neural:x"], description: "sets Neo:6 Cinema/Neo:X Cinema" },
        "83": { name: ["neo-6-music", "neo-x-music"], description: "sets Neo:6 Music/Neo:X Music" },
        "84": { name: "pliix-thx-cinema", description: "sets PLII/PLIIx THX Cinema" },
        "85": { name: ["neo-6", "neo-x-thx-cinema"], description: "sets Neo:6/Neo:X THX Cinema" },
        "86": { name: ["pliix-game"], description: "sets PLIIx Game" },
        "87": { name: "neural-surr", description: "sets Neural Surr" },
        "88": { name: ["neural-thx", "neural-surround"], description: "sets Neural THX/Neural Surround" },
        "89": { name: ["pliix-thx-games"], description: "sets PLIIx THX Games" },
        "90": { name: "pliiz-height", description: "sets PLIIz Height" },
        "91": { name: "neo-6-cinema-dts-surround-sensation", description: "sets Neo:6 Cinema DTS Surround Sensation" },
        "92": { name: "neo-6-music-dts-surround-sensation", description: "sets Neo:6 Music DTS Surround Sensation" },
        "93": { name: "neural-digital-music", description: "sets Neural Digital Music" },
        "94": { name: "pliiz-height-thx-cinema", description: "sets PLIIz Height + THX Cinema" },
        "95": { name: "pliiz-height-thx-music", description: "sets PLIIz Height + THX Music" },
        "96": { name: "pliiz-height-thx-games", description: "sets PLIIz Height + THX Games" },
        "97": { name: ["s2-cinema"], description: "sets S2 Cinema" },
        "98": { name: ["s2-music"], description: "sets S2 Music" },
        "99": { name: ["s2-games"], description: "sets S2 Games" },
        "00": { name: "stereo", description: "sets STEREO" },
        "01": { name: "direct", description: "sets DIRECT" },
        "02": { name: "surround", description: "sets SURROUND" },
        "03": { name: ["film", "game-rpg"], description: "sets FILM, Game-RPG" },
        "04": { name: "thx", description: "sets THX" },
        "05": { name: ["action", "game-action"], description: "sets ACTION, Game-Action" },
        "06": { name: ["musical", "game-rock"], description: "sets MUSICAL, Game-Rock" },
        "07": { name: "mono-movie", description: "sets MONO MOVIE" },
        "08": { name: ["orchestra", "dolby-surround-classical"], description: "sets ORCHESTRA" },
        "09": { name: ["unplugged", "dolby-surround-unplugged"], description: "sets UNPLUGGED" },
        "0A": { name: ["studio-mix", "dolby-surround-entertainment-show"], description: "sets STUDIO-MIX" },
        "0B": { name: ["tv-logic", "dolby-surround-drama"], description: "sets TV LOGIC" },
        "0C": { name: ["all-ch-stereo", "extended-stereo"], description: "sets ALL CH STEREO" },
        "0D": { name: ["theater-dimensional", "dolby-surround-front-stage-surround"], description: "sets THEATER-DIMENSIONAL" },
        "0E": { name: ["enhance-7", "enhance", "dolby-surround-sports"], description: "sets ENHANCED 7/ENHANCE, Game-Sports" },
        "0F": { name: "mono", description: "sets MONO" },
        "1F": { name: "whole-house", description: "sets Whole House Mode" },
        "8A": { name: ["neo-x-thx-games"], description: "sets Neo:X THX Games" },
        "8B": { name: ["pliix-thx-music"], description: "sets PLIIx THX Music" },
        "8C": { name: ["neo-x-thx-music"], description: "sets Neo:X THX Music" },
        "8D": { name: "neural-thx-cinema", description: "sets Neural THX Cinema" },
        "8E": { name: "neural-thx-music", description: "sets Neural THX Music" },
        "8F": { name: "neural-thx-games", description: "sets Neural THX Games" },
        "9A": { name: "neo-x-game", description: "sets Neo:X Game" },
        A2: { name: ["pliix"], description: "sets PLIIx" },
        UP: { name: "up", description: "sets Listening Mode Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Listening Mode Wrap-Around Down" },
        MOVIE: { name: "movie", description: "sets Listening Mode Wrap-Around Up" },
        MUSIC: { name: "music", description: "sets Listening Mode Wrap-Around Up" },
        GAME: { name: "game", description: "sets Listening Mode Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Listening Mode" }
      }
    },
    LTN: {
      name: "late-night",
      description: "Late Night Command",
      values: {
        "00": { name: "off", description: "sets Late Night Off" },
        "01": {
          name: ["low-dolbydigital", "on-dolby-truehd"],
          description: "sets Late Night Low@DolbyDigital,On@Dolby TrueHD"
        },
        "02": {
          name: ["high-dolbydigital"],
          description: "sets Late Night High@DolbyDigital,(On@Dolby TrueHD)"
        },
        "03": { name: "auto-dolby-truehd", description: "sets Late Night Auto@Dolby TrueHD" },
        UP: { name: "up", description: "sets Late Night State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Late Night Level" }
      }
    },
    RAS: {
      name: "cinema-filter",
      description: "Cinema Filter Command",
      values: {
        "00": { name: "off", description: "sets Cinema Filter Off" },
        "01": { name: "on", description: "sets Cinema Filter On" },
        UP: { name: "up", description: "sets Cinema Filter State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Cinema Filter State" }
      }
    },
    ADY: {
      name: "audyssey-2eq-multeq-multeq-xt",
      description: "Audyssey 2EQ/MultEQ/MultEQ XT",
      values: {
        "00": { name: ["off"], description: "sets Audyssey 2EQ/MultEQ/MultEQ XT Off" },
        "01": {
          name: ["on", "movie"],
          description: "sets Audyssey 2EQ/MultEQ/MultEQ XT On/Movie"
        },
        "02": { name: ["music"], description: "sets Audyssey 2EQ/MultEQ/MultEQ XT Music" },
        UP: {
          name: "up",
          description: "sets Audyssey 2EQ/MultEQ/MultEQ XT State Wrap-Around Up"
        },
        QSTN: { name: "query", description: "gets The Audyssey 2EQ/MultEQ/MultEQ XT State" }
      }
    },
    ADQ: {
      name: "audyssey-dynamic-eq",
      description: "Audyssey Dynamic EQ",
      values: {
        "00": { name: "off", description: "sets Audyssey Dynamic EQ Off" },
        "01": { name: "on", description: "sets Audyssey Dynamic EQ On" },
        UP: { name: "up", description: "sets Audyssey Dynamic EQ State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Audyssey Dynamic EQ State" }
      }
    },
    ADV: {
      name: "audyssey-dynamic-volume",
      description: "Audyssey Dynamic Volume",
      values: {
        "00": { name: "off", description: "sets Audyssey Dynamic Volume Off" },
        "01": { name: "light", description: "sets Audyssey Dynamic Volume Light" },
        "02": { name: "medium", description: "sets Audyssey Dynamic Volume Medium" },
        "03": { name: "heavy", description: "sets Audyssey Dynamic Volume Heavy" },
        UP: {
          name: "up",
          description: "sets Audyssey Dynamic Volume State Wrap-Around Up"
        },
        QSTN: { name: "query", description: "gets The Audyssey Dynamic Volume State" }
      }
    },
    DVL: {
      name: "dolby-volume",
      description: "Dolby Volume",
      values: {
        "00": { name: "off", description: "sets Dolby Volume Off" },
        "01": { name: ["low", "on"], description: "sets Dolby Volume Low/On" },
        "02": { name: "mid", description: "sets Dolby Volume Mid" },
        "03": { name: "high", description: "sets Dolby Volume High" },
        UP: { name: "up", description: "sets Dolby Volume State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Dolby Volume State" }
      }
    },
    MOT: {
      name: "music-optimizer",
      description: "Music Optimizer",
      values: {
        "00": { name: "off", description: "sets Music Optimizer Off" },
        "01": { name: "on", description: "sets Music Optimizer On" },
        UP: { name: "up", description: "sets Music Optimizer State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Dolby Volume State" }
      }
    },
    TUN: {
      name: "tuning",
      description: "Tuning Command",
      values: {
        "0": { name: "0-in-direct-mode", description: "sets 0 in Direct Tuning Mode" },
        "1": { name: "1-in-direct-mode", description: "sets 1 in Direct Tuning Mode" },
        "2": { name: "2-in-direct-mode", description: "sets 2 in Direct Tuning Mode" },
        "3": { name: "3-in-direct-mode", description: "sets 3 in Direct Tuning Mode" },
        "4": { name: "4-in-direct-mode", description: "sets 4 in Direct Tuning Mode" },
        "5": { name: "5-in-direct-mode", description: "sets 5 in Direct Tuning Mode" },
        "6": { name: "6-in-direct-mode", description: "sets 6 in Direct Tuning Mode" },
        "7": { name: "7-in-direct-mode", description: "sets 7 in Direct Tuning Mode" },
        "8": { name: "8-in-direct-mode", description: "sets 8 in Direct Tuning Mode" },
        "9": { name: "9-in-direct-mode", description: "sets 9 in Direct Tuning Mode" },
        nnnnn: {
          description: "sets Directly Tuning Frequency (FM nnn.nn MHz / AM nnnnn kHz / SR nnnnn ch)\nput 0 in the first two digits of nnnnn at SR"
        },
        DIRECT: { name: "direct", description: "starts/restarts Direct Tuning Mode" },
        UP: { name: "up", description: "sets Tuning Frequency Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Tuning Frequency Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    PRS: {
      name: "preset",
      description: "Preset Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        "1,30": {
          name: "no-1-30",
          description: "sets Preset No. 1 - 30 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Preset No. Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Preset No. Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Preset No." }
      }
    },
    TIP: {
      name: "tunein-preset",
      description: "Preset Command for TuneIn",
      values: {
        "1,999": {
          name: "no-1-999",
          description: "sets Preset No. 1 - 999 (custom for UCR3 Onkyo integration)"
        }
      }
    },
    PRM: {
      name: "preset-memory",
      description: "Preset Memory Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        "1,30": {
          name: "no-1-30",
          description: "sets Preset No. 1 - 30 ( In hexadecimal representation)"
        }
      }
    },
    RDS: {
      name: "rds-information",
      description: "RDS Information Command",
      values: {
        "00": { name: "00", description: "Display RT Information" },
        "01": { name: "01", description: "Display PTY Information" },
        "02": { name: "02", description: "Display TP Information" },
        UP: { name: "up", description: "Display RDS Information Wrap-Around Change" }
      }
    },
    PTS: {
      name: "pty-scan",
      description: "PTY Scan Command",
      values: {
        "0,30": {
          name: "no-0-30",
          description: "sets PTY No “0 - 30” ( In hexadecimal representation)"
        },
        ENTER: { name: "enter", description: "Finish PTY Scan" }
      }
    },
    TPS: {
      name: "tp-scan",
      description: "TP Scan Command",
      values: {
        "": { description: "Start TP Scan (When Don’t Have Parameter)" },
        ENTER: { name: "enter", description: "Finish TP Scan" }
      }
    },
    XCN: {
      name: "xm-channel-name-info",
      description: "XM Channel Name Info",
      values: {
        nnnnnnnnnn: { description: "XM Channel Name" },
        QSTN: { name: "query", description: "gets XM Channel Name" }
      }
    },
    XAT: {
      name: "xm-artist-name-info",
      description: "XM Artist Name Info",
      values: {
        nnnnnnnnnn: { description: "XM Artist Name" },
        QSTN: { name: "query", description: "gets XM Artist Name" }
      }
    },
    XTI: {
      name: "xm-title-info",
      description: "XM Title Info",
      values: {
        nnnnnnnnnn: { description: "XM Title" },
        QSTN: { name: "query", description: "gets XM Title" }
      }
    },
    XCH: {
      name: "xm-channel-number",
      description: "XM Channel Number Command",
      values: {
        "0,597": { description: "XM Channel Number  “000 - 255”" },
        UP: { name: "up", description: "sets XM Channel Wrap-Around Up" },
        DOWN: { name: "down", description: "sets XM Channel Wrap-Around Down" },
        QSTN: { name: "query", description: "gets XM Channel Number" }
      }
    },
    XCT: {
      name: "xm-category",
      description: "XM Category Command",
      values: {
        nnnnnnnnnn: { description: "XM Category Info" },
        UP: { name: "up", description: "sets XM Category Wrap-Around Up" },
        DOWN: { name: "down", description: "sets XM Category Wrap-Around Down" },
        QSTN: { name: "query", description: "gets XM Category" }
      }
    },
    SCN: {
      name: "sirius-channel-name-info",
      description: "SIRIUS Channel Name Info",
      values: {
        nnnnnnnnnn: { description: "SIRIUS Channel Name" },
        QSTN: { name: "query", description: "gets SIRIUS Channel Name" }
      }
    },
    SAT: {
      name: "sirius-artist-name-info",
      description: "SIRIUS Artist Name Info",
      values: {
        nnnnnnnnnn: { description: "SIRIUS Artist Name" },
        QSTN: { name: "query", description: "gets SIRIUS Artist Name" }
      }
    },
    STI: {
      name: "sirius-title-info",
      description: "SIRIUS Title Info",
      values: {
        nnnnnnnnnn: { description: "SIRIUS Title" },
        QSTN: { name: "query", description: "gets SIRIUS Title" }
      }
    },
    SCH: {
      name: "sirius-channel-number",
      description: "SIRIUS Channel Number Command",
      values: {
        "0,597": { description: "SIRIUS Channel Number  “000 - 255”" },
        UP: { name: "up", description: "sets SIRIUS Channel Wrap-Around Up" },
        DOWN: { name: "down", description: "sets SIRIUS Channel Wrap-Around Down" },
        QSTN: { name: "query", description: "gets SIRIUS Channel Number" }
      }
    },
    SCT: {
      name: "sirius-category",
      description: "SIRIUS Category Command",
      values: {
        nnnnnnnnnn: { description: "SIRIUS Category Info" },
        UP: { name: "up", description: "sets SIRIUS Category Wrap-Around Up" },
        DOWN: { name: "down", description: "sets SIRIUS Category Wrap-Around Down" },
        QSTN: { name: "query", description: "gets SIRIUS Category" }
      }
    },
    SLK: {
      name: "sirius-parental-lock",
      description: "SIRIUS Parental Lock Command",
      values: {
        nnnn: { description: "Lock Password (4Digits)" },
        INPUT: { name: "input", description: 'displays "Please input the Lock password"' },
        WRONG: { name: "wrong", description: 'displays "The Lock password is wrong"' }
      }
    },
    HAT: {
      name: "hd-radio-artist-name-info",
      description: "HD Radio Artist Name Info",
      values: {
        nnnnnnnnnn: { description: "HD Radio Artist Name (variable-length, 64 digits max)" },
        QSTN: { name: "query", description: "gets HD Radio Artist Name" }
      }
    },
    HCN: {
      name: "hd-radio-channel-name-info",
      description: "HD Radio Channel Name Info",
      values: {
        nnnnnnnnnn: { description: "HD Radio Channel Name (Station Name) (7 digits)" },
        QSTN: { name: "query", description: "gets HD Radio Channel Name" }
      }
    },
    HTI: {
      name: "hd-radio-title-info",
      description: "HD Radio Title Info",
      values: {
        nnnnnnnnnn: { description: "HD Radio Title (variable-length, 64 digits max)" },
        QSTN: { name: "query", description: "gets HD Radio Title" }
      }
    },
    HDS: {
      name: "hd-radio-detail-info",
      description: "HD Radio Detail Info",
      values: {
        nnnnnnnnnn: { description: "HD Radio Title" },
        QSTN: { name: "query", description: "gets HD Radio Title" }
      }
    },
    HPR: {
      name: "hd-radio-channel-program",
      description: "HD Radio Channel Program Command",
      values: {
        "1,8": { name: "directly", description: "sets directly HD Radio Channel Program" },
        QSTN: { name: "query", description: "gets HD Radio Channel Program" }
      }
    },
    HBL: {
      name: "hd-radio-blend-mode",
      description: "HD Radio Blend Mode Command",
      values: {
        "00": { name: "auto", description: 'sets HD Radio Blend Mode "Auto"' },
        "01": { name: "analog", description: 'sets HD Radio Blend Mode "Analog"' },
        QSTN: { name: "query", description: "gets the HD Radio Blend Mode Status" }
      }
    },
    HTS: {
      name: "hd-radio-tuner-status",
      description: "HD Radio Tuner Status",
      values: {
        mmnnoo: {
          name: "mmnnoo",
          description:
            'HD Radio Tuner Status (3 bytes)\nmm -> "00" not HD, "01" HD\nnn -> current Program "01"-"08"\noo -> receivable Program (8 bits are represented in hexadecimal notation. Each bit shows receivable or not.)'
        },
        QSTN: { name: "query", description: "gets the HD Radio Tuner Status" }
      }
    },
    NTC: {
      name: "network-usb",
      description: "Network/USB Operation Command",
      values: {
        "0": { name: "0", description: "0 KEY" },
        "1": { name: "1", description: "1 KEY" },
        "2": { name: "2", description: "2 KEY" },
        "3": { name: "3", description: "3 KEY" },
        "4": { name: "4", description: "4 KEY" },
        "5": { name: "5", description: "5 KEY" },
        "6": { name: "6", description: "6 KEY" },
        "7": { name: "7", description: "7 KEY" },
        "8": { name: "8", description: "8 KEY" },
        "9": { name: "9", description: "9 KEY" },
        PLAY: { name: "play", description: "PLAY KEY" },
        STOP: { name: "stop", description: "STOP KEY" },
        PAUSE: { name: "pause", description: "PAUSE KEY" },
        TRUP: { name: "trup", description: "TRACK UP KEY" },
        TRDN: { name: "trdn", description: "TRACK DOWN KEY" },
        FF: { name: "ff", description: "FF KEY (CONTINUOUS*)" },
        REW: { name: "rew", description: "REW KEY (CONTINUOUS*)" },
        REPEAT: { name: "repeat", description: "REPEAT KEY" },
        RANDOM: { name: "random", description: "RANDOM KEY" },
        DISPLAY: { name: "display", description: "DISPLAY KEY" },
        ALBUM: { name: "album", description: "ALBUM KEY" },
        ARTIST: { name: "artist", description: "ARTIST KEY" },
        GENRE: { name: "genre", description: "GENRE KEY" },
        PLAYLIST: { name: "playlist", description: "PLAYLIST KEY" },
        RIGHT: { name: "right", description: "RIGHT KEY" },
        LEFT: { name: "left", description: "LEFT KEY" },
        UP: { name: "up", description: "UP KEY" },
        DOWN: { name: "down", description: "DOWN KEY" },
        SELECT: { name: "select", description: "SELECT KEY" },
        DELETE: { name: "delete", description: "DELETE KEY" },
        CAPS: { name: "caps", description: "CAPS KEY" },
        LOCATION: { name: "location", description: "LOCATION KEY" },
        LANGUAGE: { name: "language", description: "LANGUAGE KEY" },
        SETUP: { name: "setup", description: "SETUP KEY" },
        RETURN: { name: "return", description: "RETURN KEY" },
        CHUP: { name: "chup", description: "CH UP(for iRadio)" },
        CHDN: { name: "chdn", description: "CH DOWN(for iRadio)" },
        MENU: { name: "menu", description: "MENU" },
        TOP: { name: "top", description: "TOP MENU" },
        MODE: { name: "mode", description: "MODE(for iPod) STD<->EXT" },
        LIST: { name: "list", description: "LIST <-> PLAYBACK" }
      }
    },
    NAT: {
      name: "net-usb-artist-name-info",
      description: "NET/USB Artist Name Info",
      values: {
        nnnnnnnnnn: {
          description: "NET/USB Artist Name (variable-length, 64 Unicode letters [UTF-8 encoded] max , for Network Control only)"
        },
        QSTN: { name: "query", description: "gets iPod Artist Name" }
      }
    },
    NAL: {
      name: "net-usb-album-name-info",
      description: "NET/USB Album Name Info",
      values: {
        nnnnnnn: {
          description: "NET/USB Album Name (variable-length, 64 Unicode letters [UTF-8 encoded] max , for Network Control only)"
        },
        QSTN: { name: "query", description: "gets iPod Album Name" }
      }
    },
    NTI: {
      name: "net-usb-title-name",
      description: "NET/USB Title Name",
      values: {
        nnnnnnnnnn: {
          description: "NET/USB Title Name (variable-length, 64 Unicode letters [UTF-8 encoded] max , for Network Control only)"
        },
        QSTN: { name: "query", description: "gets HD Radio Title" }
      }
    },
    NTM: {
      name: "net-usb-time-info",
      description: "NET/USB Time Info",
      values: {
        "mm:ss/mm:ss": {
          name: "mm-ss-mm-ss",
          description: "NET/USB Time Info (Elapsed time/Track Time Max 99:59)"
        },
        QSTN: { name: "query", description: "gets iPod Time Info" }
      }
    },
    NTR: {
      name: "net-usb-track-info",
      description: "NET/USB Track Info",
      values: {
        "cccc/tttt": {
          name: "cccc-tttt",
          description: "NET/USB Track Info (Current Track/Toral Track Max 9999)"
        },
        QSTN: { name: "query", description: "gets iPod Time Info" }
      }
    },
    NST: {
      name: "net-usb-play-status",
      description: "NET/USB Play Status",
      values: {
        prs: {
          name: "prs",
          description:
            'NET/USB Play Status (3 letters)\np -> Play Status: "S": STOP, "P": Play, "p": Pause, "F": FF, "R": FR\nr -> Repeat Status: "-": Off, "R": All, "F": Folder, "1": Repeat 1,\ns -> Shuffle Status: "-": Off, "S": All , "A": Album, "F": Folder'
        },
        QSTN: { name: "query", description: "gets the Net/USB Status" }
      }
    },
    NPR: {
      name: "internet-radio-preset",
      description: "Internet Radio Preset Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        SET: { name: "set", description: "preset memory current station" }
      }
    },
    NLS: {
      name: "net-usb-list-info",
      description: "NET/USB List Info",
      values: {
        tlpnnnnnnnnnn: {
          description:
            'NET/USB List Info\nt ->Information Type (A : ASCII letter, C : Cursor Info, U : Unicode letter)\nwhen t = A,\n  l ->Line Info (0-9 : 1st to 10th Line)\n  nnnnnnnnn:Listed data (variable-length, 64 ASCII letters max)\n    when AVR is not displayed NET/USB List(Ketboard,Menu,Popup…), "nnnnnnnnn" is "See TV".\n  p ->Property (- : no)\nwhen t = C,\n  l ->Cursor Position (0-9 : 1st to 10th Line, - : No Cursor)\n  p ->Update Type (P : Page Information Update ( Page Clear or Disable List Info) , C : Cursor Position Update)\nwhen t = U, (for Network Control Only)\n  l ->Line Info (0-9 : 1st to 10th Line)\n  nnnnnnnnn:Listed data (variable-length, 64 Unicode letters [UTF-8 encoded] max)\n    when AVR is not displayed NET/USB List(Ketboard,Menu,Popup…), "nnnnnnnnn" is "See TV".\n  p ->Property (- : no)'
        },
        ti: {
          name: "ti",
          description:
            "select the listed item (from Network Control Only)\n t -> Index Type (L : Line, I : Index)\nwhen t = L,\n  i -> Line number (0-9 : 1st to 10th Line [1 digit] )\nwhen t = I,\n  iiiii -> Index number (00001-99999 : 1st to 99999th Item [5 digits] )"
        }
      }
    },
    NJA: {
      name: "net-usb-jacket-art",
      description: "NET/USB Jacket Art (When Jacket Art is available and Output for Network Control Only)",
      values: {
        "tp{xx}{xx}{xx}{xx}{xx}{xx}": {
          name: "tp-xx-xx-xx-xx-xx-xx",
          description:
            "NET/USB Jacket Art/Album Art Data\nt-> Image type 0:BMP,1:JPEG\np-> Packet flag 0:Start, 1:Next, 2:End\nxxxxxxxxxxxxxx -> Jacket/Album Art Data (valiable length, 1024 ASCII HEX letters max)"
        }
      }
    },
    NSV: {
      name: "net-service",
      description: "NET Service(for Network Control Only)",
      values: {
        "ssiaaaa…aaaabbbb…bbbb": {
          description:
            'select Network Service directly\nss -> Network Serveice\n 00:Media Server (DLNA)\n 01:Favorite\n 02:vTuner\n 03:SIRIUS\n 04:Pandora\n 05:Rhapsody\n 06:Last.fm\n 07:Napster\n 08:Slacker\n 09:Mediafly\n 0A:Spotify\n 0B:AUPEO!\n 0C:Radiko\n 0D:e-onkyo\n\ni-> Acount Info\n 0: No\n 1: Yes\n"aaaa...aaaa": User Name ( 128 Unicode letters [UTF-8 encoded] max )\n"bbbb...bbbb": Password ( 128 Unicode letters [UTF-8 encoded] max )'
        }
      }
    },
    NKY: {
      name: "net-keyboard",
      description: "NET Keyboard(for Network Control Only)",
      values: {
        ll: {
          name: "ll",
          description:
            "waiting Keyboard Input\nll -> category\n 00: Off ( Exit Keyboard Input )\n 01: User Name\n 02: Password\n 03: Artist Name\n 04: Album Name\n 05: Song Name\n 06: Station Name\n 07: Tag Name\n 08: Artist or Song\n 09: Episode Name\n 0A: Pin Code (some digit Number [0-9])\n 0B: User Name (available ISO 8859-1 character set)\n 0C: Password (available ISO 8859-1 character set)"
        },
        nnnnnnnnn: {
          description: 'set Keyboard Input letter\n"nnnnnnnn" is variable-length, 128 Unicode letters [UTF-8 encoded] max'
        }
      }
    },
    NPU: {
      name: "net-popup-message",
      description: "NET Popup Message(for Network Control Only)",
      values: {
        "xaaa…aaaybbb…bbb": {
          description:
            "x -> Popup Display Type\n 'T': Popup text is top\n 'B': Popup text is bottom\n 'L': Popup text is list format\n\naaa...aaa -> Popup Title, Massage\n when x = 'T' or 'B'\n    Top Title [0x00] Popup Title [0x00] Popup Message [0x00]\n    (valiable-length Unicode letter [UTF-8 encoded] )\n\n when x = 'L'\n    Top Title [0x00] Item Title 1 [0x00] Item Parameter 1 [0x00] ... [0x00] Item Title 6 [0x00] Item Parameter 6 [0x00]\n    (valiable-length Unicode letter [UTF-8 encoded] )\n\ny -> Cursor Position on button\n '0' : Button is not Displayed\n '1' : Cursor is on the button 1\n '2' : Cursor is on the button 2\n\nbbb...bbb -> Text of Button\n    Text of Button 1 [0x00] Text of Button 2 [0x00]\n    (valiable-length Unicode letter [UTF-8 encoded] )"
        }
      }
    },
    NMD: {
      name: "ipod-mode-change",
      description: "iPod Mode Change (with USB Connection Only)",
      values: {
        STD: { name: "std", description: "Standerd Mode" },
        EXT: { name: "ext", description: "Extend Mode(If available)" },
        VDC: { name: "vdc", description: "Video Contents in Extended Mode" },
        QSTN: { name: "query", description: "gets iPod Mode Status" }
      }
    },
    NBS: {
      name: "bluetooth-setting",
      description: "Bluetooth Setting Operation Command",
      values: {
        OFF: { name: "off", description: "Bluetooth Status:Off" },
        ON: { name: "on", description: "Bluetooth Status:On" },
        QSTN: { name: "query", description: "gets Bluetooth Setting" }
      }
    },
    NBT: {
      name: "bluetooth-internal",
      description: "Bluetooth(Internal) Operation Command",
      values: {
        PAIRING: { name: "pairing", description: "PAIRING" },
        CLEAR: { name: "clear", description: "CLEAR PAIRING INFORMATION" }
      }
    },
    NMS: {
      name: "usb-menu-status",
      description: "NET/USB Menu Status",
      values: {
        maabbstii: {
          description:
            'NET/USB Menu Status (9 letters)\nm -> Track Menu: "M": Menu is enable, "x": Menu is disable\naa -> F1 button icon (Positive Feed or Mark/Unmark)\nbb -> F2 button icon (Negative Feed)\n aa or bb : "xx":disable, "01":Like, "02":don\'t like, "03":Love, "04":Ban,\n                  "05":episode, "06":ratings, "07":Ban(black), "08":Ban(white),\n                  "09":Favorite(black), "0A":Favorite(white), "0B":Favorite(yellow)\ns -> Time Seek "S": Time Seek is enable "x": Time Seek is disable\nt -> Time Display "1": Elapsed Time/Total Time, "2": Elapsed Time, "x": disable\nii-> Service icon\n ii : "00":Music Server (DLNA), "01":My Favorite, "02":vTuner, \n      "03":SiriusXM, "04":Pandora,\n      "05":Rhapsody, "06":Last.fm, "07":Napster, "08":Slacker, "09":Mediafly,\n      "0A":Spotify, "0B":AUPEO!,\n      "0C":radiko, "0D":e-onkyo, "0E":TuneIn, "0F":MP3tunes, "10":Simfy,\n      "11":Home Media, "12":Deezer, "13":iHeartRadio, "18":Airplay,\n      "1A": onkyo Music, "1B":TIDAL, "1C":Amazon Music, "1D":PlayQueue,\n      "40":Chromecast built-in, "41":FireConnect, "42":Play-Fi,\n      "43":FlareConnect, "44":Airplay2, "45":Alexa, "46":Alexa MRM, "47":RoonReady,\n      "F0": USB/USB(Front), "F1: USB(Rear), \n      "F2":Internet Radio, "F3":NET, "F4":Bluetooth'
        },
        QSTN: { name: "query", description: "gets the Net/USB Menu Status" }
      }
    },
    NTS: {
      name: "usb-time-seek",
      description: "NET/USB Time Seek",
      values: {
        "mm:ss": {
          name: "mm-ss",
          description: "mm: minutes (00-99)\nss: seconds (00-59)\nThis command is only available when Time Seek is enable."
        },
        "hh:mm:ss": {
          name: "hh-mm-ss",
          description: "hh: hours(00-99)\nmm: minutes (00-59)\nss: seconds (00-59)\nThis command is only available when Time Seek is enable."
        }
      }
    },
    NDS: {
      name: "connection-usb-device-status",
      description: "NET Connection/USB Device Status",
      values: {
        nfr: {
          name: "nfr",
          description:
            'NET Connection/USB Device Status (3 letters)\nn -> NET Connection status: "-": no connection, "E": Ether, "W": Wireless\nf -> Front USB(USB1) Device Status: "-": no device, "i": iPod/iPhone, \n      "M": Memory/NAS, "W": Wireless Adaptor, "B": Bluetooth Adaptor,\n      "D": DAB Dongle, "x": disable\nr -> Rear USB(USB2) Device Status: "-": no device, "i": iPod/iPhone, \n      "M": Memory/NAS, "W": Wireless Adaptor, "B": Bluetooth Adaptor, \n      "D": DAB Dongle, "x": disable'
        },
        QSTN: { name: "query", description: "gets the Net/USB Status" }
      }
    },
    NLA: {
      name: "usb-list-info-xml",
      description: "NET/USB List Info(All item, need processing XML data, for Network Control Only)",
      values: {
        "tzzzzsurr<.....>": {
          name: "tzzzzsurr",
          description:
            "t -> response type 'X' : XML\nzzzz -> sequence number (0000-FFFF)\ns -> status 'S' : success, 'E' : error\nu -> UI type '0' : List, '1' : Menu, '2' : Playback, '3' : Popup, '4' : Keyboard, \"5\" : Menu List\nrr -> reserved\n<.....> : XML data ( [CR] and [LF] are removed )"
        },
        "Lzzzzll{xx}{xx}yyyy": {
          name: "lzzzzll-xx-xx-yyyy",
          description:
            "specify to get the listed data (from Network Control Only)\nzzzz -> sequence number (0000-FFFF)\nll -> number of layer (00-FF)\nxxxx -> index of start item (0000-FFFF : 1st to 65536th Item [4 HEX digits] )\nyyyy -> number of items (0000-FFFF : 1 to 65536 Items [4 HEX digits] )"
        },
        "Izzzzll{xx}{xx}----": {
          name: "izzzzll-xx-xx",
          description:
            "select the listed item (from Network Control Only)\nzzzz -> sequence number (0000-FFFF)\nll -> number of layer (00-FF)\nxxxx -> index number (0000-FFFF : 1st to 65536th Item [4 HEX digits] )\n---- -> not used"
        }
      }
    },
    NLT: {
      name: "usb-list-title",
      description: "NET/USB List Title Info",
      values: {
        nnnnnnnn: {
          description: "NET/USB List Title Info (variable-length, 64 Unicode letters [UTF-8 encoded] max , for Network Control only)"
        },
        QSTN: { name: "query", description: "gets NET/USB List Title Info" }
      }
    },
    NSB: {
      name: "usb-select-browse",
      description: "NET/USB Select Browse",
      values: {
        TOP: { name: "top", description: "TOP MENU" },
        MENU: { name: "menu", description: "MENU" }
      }
    },
    NRI: {
      name: "internet-radio-info",
      description: "Internet Radio Info",
      values: {
        nnnnnnnn: {
          description: "Internet Radio Info (variable-length, 64 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets Internet Radio Info" }
      }
    },
    NCP: {
      name: "usb-copy",
      description: "NET/USB Copy",
      values: {
        START: { name: "start", description: "START COPY" },
        STOP: { name: "stop", description: "STOP COPY" }
      }
    },
    NAC: {
      name: "account-info",
      description: "Account Info",
      values: {
        "iaaaa...aaaabbbb...bbbb": {
          description: 'i-> Account Info\n 0: No\n 1: Yes\n"aaaa...aaaa": User Name ( 128 Unicode letters [UTF-8 encoded] max )\n"bbbb...bbbb": Password ( 128 Unicode letters [UTF-8 encoded] max )'
        }
      }
    },
    NUI: {
      name: "ui-type",
      description: "UI Type",
      values: {
        "0": { name: "list", description: "List" },
        "1": { name: "menu", description: "Menu" },
        "2": { name: "playback", description: "Playback" },
        "3": { name: "popup", description: "Popup" },
        "4": { name: "keyboard", description: "Keyboard" },
        "5": { name: "menu-list", description: "Menu List" }
      }
    },
    NAD: {
      name: "album-art-display",
      description: "Album Art Display Mode",
      values: {
        "0": { name: "off", description: "OFF" },
        "1": { name: "on", description: "ON" },
        QSTN: { name: "query", description: "gets Album Art Display Mode" }
      }
    },
    NLU: {
      name: "list-url-info",
      description: "List URL Info",
      values: {
        nnnnnnnn: {
          description: "List URL Info (variable-length, 256 Unicode letters [UTF-8 encoded] max)"
        }
      }
    },
    NPB: {
      name: "playback-info",
      description: "Playback Info",
      values: {
        nnnnnnnn: {
          description: "Playback Info (variable-length, 64 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets Playback Info" }
      }
    },
    NAF: {
      name: "album-art-format",
      description: "Album Art Format",
      values: {
        "0": { name: "bmp", description: "BMP" },
        "1": { name: "jpeg", description: "JPEG" },
        "2": { name: "url", description: "URL" },
        n: { name: "no-image", description: "No Image" }
      }
    },
    NRF: {
      name: "reference-info",
      description: "Reference Info",
      values: {
        nnnnnnnn: {
          description: "Reference Info (variable-length, 128 Unicode letters [UTF-8 encoded] max)"
        }
      }
    },
    NFI: {
      name: "file-info",
      description: "File Info",
      values: {
        nnnnnnnn: {
          description: "File Info (variable-length, 256 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets File Info" }
      }
    },
    MGS: {
      name: "multi-gateway-status",
      description: "Multi Gateway Status",
      values: {
        "0": { name: "disabled", description: "Disabled" },
        "1": { name: "enabled", description: "Enabled" },
        QSTN: { name: "query", description: "gets Multi Gateway Status" }
      }
    },
    MGV: {
      name: "multi-gateway-volume",
      description: "Multi Gateway Volume",
      values: {
        "{xx}": {
          description: "Volume Level 0 - 100 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Volume Level Up" },
        DOWN: { name: "down", description: "sets Volume Level Down" },
        QSTN: { name: "query", description: "gets the Volume Level" }
      }
    },
    MDI: {
      name: "multi-device-info",
      description: "Multi Device Info",
      values: {
        nnnnnnnn: {
          description: "Multi Device Info (variable-length)"
        },
        QSTN: { name: "query", description: "gets Multi Device Info" }
      }
    },
    MRN: {
      name: "multi-room-name",
      description: "Multi Room Name",
      values: {
        nnnnnnnn: {
          description: "Multi Room Name (variable-length, 64 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets Multi Room Name" }
      }
    },
    MGN: {
      name: "multi-group-name",
      description: "Multi Group Name",
      values: {
        nnnnnnnn: {
          description: "Multi Group Name (variable-length, 64 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets Multi Group Name" }
      }
    },
    MZI: {
      name: "multi-zone-info",
      description: "Multi Zone Info",
      values: {
        nnnnnnnn: {
          description: "Multi Zone Info (variable-length)"
        },
        QSTN: { name: "query", description: "gets Multi Zone Info" }
      }
    },
    MSS: {
      name: "multi-speaker-status",
      description: "Multi Speaker Status",
      values: {
        "0": { name: "off", description: "OFF" },
        "1": { name: "on", description: "ON" },
        QSTN: { name: "query", description: "gets Multi Speaker Status" }
      }
    },
    MZC: {
      name: "multi-zone-control",
      description: "Multi Zone Control",
      values: {
        "0": { name: "main", description: "Main Zone" },
        "1": { name: "zone2", description: "Zone 2" },
        "2": { name: "zone3", description: "Zone 3" },
        "3": { name: "zone4", description: "Zone 4" },
        QSTN: { name: "query", description: "gets Multi Zone Control" }
      }
    },
    MRM: {
      name: "multi-room-mode",
      description: "Multi Room Mode",
      values: {
        "0": { name: "off", description: "OFF" },
        "1": { name: "on", description: "ON" },
        QSTN: { name: "query", description: "gets Multi Room Mode" }
      }
    },
    MMT: {
      name: "multi-mute",
      description: "Multi Mute",
      values: {
        "0": { name: "off", description: "Mute OFF" },
        "1": { name: "on", description: "Mute ON" },
        TG: { name: "toggle", description: "Mute Toggle" },
        QSTN: { name: "query", description: "gets Multi Mute Status" }
      }
    },
    MRR: {
      name: "multi-room-repeat",
      description: "Multi Room Repeat",
      values: {
        "0": { name: "off", description: "Repeat OFF" },
        "1": { name: "all", description: "Repeat All" },
        "2": { name: "one", description: "Repeat One" },
        QSTN: { name: "query", description: "gets Multi Room Repeat" }
      }
    },
    EDV: {
      name: "editor-version",
      description: "Editor Version",
      values: {
        nnnnnnnn: {
          description: "Editor Version Info"
        },
        QSTN: { name: "query", description: "gets Editor Version" }
      }
    },
    EDA: {
      name: "editor-application",
      description: "Editor Application",
      values: {
        nnnnnnnn: {
          description: "Editor Application Info"
        },
        QSTN: { name: "query", description: "gets Editor Application" }
      }
    },
    EDC: {
      name: "editor-command",
      description: "Editor Command",
      values: {
        nnnnnnnn: {
          description: "Editor Command Info"
        }
      }
    },
    EDF: {
      name: "editor-firmware",
      description: "Editor Firmware",
      values: {
        nnnnnnnn: {
          description: "Editor Firmware Info"
        },
        QSTN: { name: "query", description: "gets Editor Firmware" }
      }
    },
    EDE: {
      name: "editor-extension",
      description: "Editor Extension",
      values: {
        nnnnnnnn: {
          description: "Editor Extension Info"
        },
        QSTN: { name: "query", description: "gets Editor Extension" }
      }
    },
    PQA: {
      name: "play-queue-add",
      description: "Play Queue Add",
      values: {
        ADD: { name: "add", description: "Add to Play Queue" }
      }
    },
    PQR: {
      name: "play-queue-remove",
      description: "Play Queue Remove",
      values: {
        REMOVE: { name: "remove", description: "Remove from Play Queue" }
      }
    },
    PQO: {
      name: "play-queue-operation",
      description: "Play Queue Operation",
      values: {
        UP: { name: "up", description: "Move Up in Queue" },
        DOWN: { name: "down", description: "Move Down in Queue" },
        CLEAR: { name: "clear", description: "Clear Queue" }
      }
    },
    AAT: {
      name: "album-artist-track",
      description: "Album/Artist/Track Info",
      values: {
        nnnnnnnn: {
          description: "Album/Artist/Track Info (variable-length)"
        },
        QSTN: { name: "query", description: "gets Album/Artist/Track Info" }
      }
    },
    AAL: {
      name: "album-art-link",
      description: "Album Art Link",
      values: {
        nnnnnnnn: {
          description: "Album Art Link URL (variable-length)"
        },
        QSTN: { name: "query", description: "gets Album Art Link" }
      }
    },
    ATI: {
      name: "audio-track-info",
      description: "Audio Track Info",
      values: {
        nnnnnnnn: {
          description: "Audio Track Info (variable-length)"
        },
        QSTN: { name: "query", description: "gets Audio Track Info" }
      }
    },
    ATM: {
      name: "audio-track-menu",
      description: "Audio Track Menu",
      values: {
        nnnnnnnn: {
          description: "Audio Track Menu Info"
        },
        QSTN: { name: "query", description: "gets Audio Track Menu" }
      }
    },
    AST: {
      name: "audio-stream-type",
      description: "Audio Stream Type",
      values: {
        nnnnnnnn: {
          description: "Audio Stream Type Info"
        },
        QSTN: { name: "query", description: "gets Audio Stream Type" }
      }
    },
    PPS: {
      name: "play-pause-status",
      description: "Play/Pause Status",
      values: {
        PLAY: { name: "play", description: "Playing" },
        PAUSE: { name: "pause", description: "Paused" },
        STOP: { name: "stop", description: "Stopped" },
        QSTN: { name: "query", description: "gets Play/Pause Status" }
      }
    },
    PPD: {
      name: "play-pause-display",
      description: "Play/Pause Display",
      values: {
        nnnnnnnn: {
          description: "Play/Pause Display Info"
        },
        QSTN: { name: "query", description: "gets Play/Pause Display" }
      }
    },
    NGU: {
      name: "next-guide-up",
      description: "Next Guide Up",
      values: {
        UP: { name: "up", description: "Guide Up" }
      }
    },
    NGV: {
      name: "next-guide-view",
      description: "Next Guide View",
      values: {
        nnnnnnnn: {
          description: "Next Guide View Info"
        },
        QSTN: { name: "query", description: "gets Next Guide View" }
      }
    },
    NDN: {
      name: "next-device-name",
      description: "Next Device Name",
      values: {
        nnnnnnnn: {
          description: "Next Device Name (variable-length)"
        },
        QSTN: { name: "query", description: "gets Next Device Name" }
      }
    },
    NGT: {
      name: "next-guide-type",
      description: "Next Guide Type",
      values: {
        nnnnnnnn: {
          description: "Next Guide Type Info"
        },
        QSTN: { name: "query", description: "gets Next Guide Type" }
      }
    },
    NFN: {
      name: "network-friendly-name",
      description: "Network Friendly Name",
      values: {
        nnnnnnnn: {
          description: "Network Friendly Name (variable-length, 64 Unicode letters [UTF-8 encoded] max)"
        },
        QSTN: { name: "query", description: "gets Network Friendly Name" }
      }
    },
    NWP: {
      name: "network-wifi-password",
      description: "Network WiFi Password",
      values: {
        nnnnnnnn: {
          description: "Network WiFi Password (variable-length)"
        }
      }
    },
    NWU: {
      name: "network-wifi-update",
      description: "Network WiFi Update",
      values: {
        UPDATE: { name: "update", description: "Update WiFi Settings" }
      }
    },
    CCD: {
      name: "cd-player",
      description: "CD Player Operation Command",
      values: {
        "0": { name: "0", description: "0.0" },
        "1": { name: "1", description: "1.0" },
        "2": { name: "2", description: "2.0" },
        "3": { name: "3", description: "3.0" },
        "4": { name: "4", description: "4.0" },
        "5": { name: "5", description: "5.0" },
        "6": { name: "6", description: "6.0" },
        "7": { name: "7", description: "7.0" },
        "8": { name: "8", description: "8.0" },
        "9": { name: "9", description: "9.0" },
        "10": { name: "10", description: "10.0" },
        POWER: { name: "power", description: "POWER ON/OFF" },
        TRACK: { name: "track", description: "TRACK+" },
        PLAY: { name: "play", description: "PLAY" },
        STOP: { name: "stop", description: "STOP" },
        PAUSE: { name: "pause", description: "PAUSE" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        MEMORY: { name: "memory", description: "MEMORY" },
        CLEAR: { name: "clear", description: "CLEAR" },
        REPEAT: { name: "repeat", description: "REPEAT" },
        RANDOM: { name: "random", description: "RANDOM" },
        DISP: { name: "disp", description: "DISPLAY" },
        "D.MODE": { name: "d-mode", description: "D.MODE" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" },
        "OP/CL": { name: "op-cl", description: "OPEN/CLOSE" },
        "+10": { name: "10", description: "+10" },
        "D.SKIP": { name: "d-skip", description: "DISC +" },
        "DISC.F": { name: "disc-f", description: "DISC +" },
        "DISC.R": { name: "disc-r", description: "DISC -" },
        DISC1: { name: "disc1", description: "DISC1" },
        DISC2: { name: "disc2", description: "DISC2" },
        DISC3: { name: "disc3", description: "DISC3" },
        DISC4: { name: "disc4", description: "DISC4" },
        DISC5: { name: "disc5", description: "DISC5" },
        DISC6: { name: "disc6", description: "DISC6" },
        STBY: { name: "stby", description: "STANDBY" },
        PON: { name: "pon", description: "POWER ON" }
      }
    },
    CT1: {
      name: "tape1-a",
      description: "TAPE1(A) Operation Command",
      values: {
        "PLAY.F": { name: "play-f", description: "PLAY >" },
        "PLAY.R": { name: "play-r", description: "PLAY <" },
        STOP: { name: "stop", description: "STOP" },
        "RC/PAU": { name: "rc-pau", description: "REC/PAUSE" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" }
      }
    },
    CT2: {
      name: "tape2-b",
      description: "TAPE2(B) Operation Command",
      values: {
        "PLAY.F": { name: "play-f", description: "PLAY >" },
        "PLAY.R": { name: "play-r", description: "PLAY <" },
        STOP: { name: "stop", description: "STOP" },
        "RC/PAU": { name: "rc-pau", description: "REC/PAUSE" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" },
        "OP/CL": { name: "op-cl", description: "OPEN/CLOSE" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        REC: { name: "rec", description: "REC" }
      }
    },
    CEQ: {
      name: "graphics-equalizer",
      description: "Graphics Equalizer Operation Command",
      values: {
        POWER: { name: "power", description: "POWER ON/OFF" },
        PRESET: { name: "preset", description: "PRESET" }
      }
    },
    CDT: {
      name: "dat-recorder",
      description: "DAT Recorder Operation Command",
      values: {
        PLAY: { name: "play", description: "PLAY" },
        "RC/PAU": { name: "rc-pau", description: "REC/PAUSE" },
        STOP: { name: "stop", description: "STOP" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" }
      }
    },
    CDV: {
      name: "dvd-player",
      description: "DVD Player Operation Command (via RIHD only after TX-NR509)",
      values: {
        "0": { name: "0", description: "0.0" },
        "1": { name: "1", description: "1.0" },
        "2": { name: "2", description: "2.0" },
        "3": { name: "3", description: "3.0" },
        "4": { name: "4", description: "4.0" },
        "5": { name: "5", description: "5.0" },
        "6": { name: "6", description: "6.0" },
        "7": { name: "7", description: "7.0" },
        "8": { name: "8", description: "8.0" },
        "9": { name: "9", description: "9.0" },
        "10": { name: "10", description: "10.0" },
        POWER: { name: "power", description: "POWER ON/OFF" },
        PWRON: { name: "pwron", description: "POWER ON" },
        PWROFF: { name: "pwroff", description: "POWER OFF" },
        PLAY: { name: "play", description: "PLAY" },
        STOP: { name: "stop", description: "STOP" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" },
        PAUSE: { name: "pause", description: "PAUSE" },
        LASTPLAY: { name: "lastplay", description: "LAST PLAY" },
        "SUBTON/OFF": { name: "subton-off", description: "SUBTITLE ON/OFF" },
        SUBTITLE: { name: "subtitle", description: "SUBTITLE" },
        SETUP: { name: "setup", description: "SETUP" },
        TOPMENU: { name: "topmenu", description: "TOPMENU" },
        MENU: { name: "menu", description: "MENU" },
        UP: { name: "up", description: "UP" },
        DOWN: { name: "down", description: "DOWN" },
        LEFT: { name: "left", description: "LEFT" },
        RIGHT: { name: "right", description: "RIGHT" },
        ENTER: { name: "enter", description: "ENTER" },
        RETURN: { name: "return", description: "RETURN" },
        "DISC.F": { name: "disc-f", description: "DISC +" },
        "DISC.R": { name: "disc-r", description: "DISC -" },
        AUDIO: { name: "audio", description: "AUDIO" },
        RANDOM: { name: "random", description: "RANDOM" },
        "OP/CL": { name: "op-cl", description: "OPEN/CLOSE" },
        ANGLE: { name: "angle", description: "ANGLE" },
        SEARCH: { name: "search", description: "SEARCH" },
        DISP: { name: "disp", description: "DISPLAY" },
        REPEAT: { name: "repeat", description: "REPEAT" },
        MEMORY: { name: "memory", description: "MEMORY" },
        CLEAR: { name: "clear", description: "CLEAR" },
        ABR: { name: "abr", description: "A-B REPEAT" },
        "STEP.F": { name: "step-f", description: "STEP" },
        "STEP.R": { name: "step-r", description: "STEP BACK" },
        "SLOW.F": { name: "slow-f", description: "SLOW" },
        "SLOW.R": { name: "slow-r", description: "SLOW BACK" },
        ZOOMTG: { name: "zoomtg", description: "ZOOM" },
        ZOOMUP: { name: "zoomup", description: "ZOOM UP" },
        ZOOMDN: { name: "zoomdn", description: "ZOOM DOWN" },
        PROGRE: { name: "progre", description: "PROGRESSIVE" },
        VDOFF: { name: "vdoff", description: "VIDEO ON/OFF" },
        CONMEM: { name: "conmem", description: "CONDITION MEMORY" },
        FUNMEM: { name: "funmem", description: "FUNCTION MEMORY" },
        DISC1: { name: "disc1", description: "DISC1" },
        DISC2: { name: "disc2", description: "DISC2" },
        DISC3: { name: "disc3", description: "DISC3" },
        DISC4: { name: "disc4", description: "DISC4" },
        DISC5: { name: "disc5", description: "DISC5" },
        DISC6: { name: "disc6", description: "DISC6" },
        FOLDUP: { name: "foldup", description: "FOLDER UP" },
        FOLDDN: { name: "folddn", description: "FOLDER DOWN" },
        "P.MODE": { name: "p-mode", description: "PLAY MODE" },
        ASCTG: { name: "asctg", description: "ASPECT(Toggle)" },
        CDPCD: { name: "cdpcd", description: "CD CHAIN REPEAT" },
        MSPUP: { name: "mspup", description: "MULTI SPEED UP" },
        MSPDN: { name: "mspdn", description: "MULTI SPEED DOWN" },
        PCT: { name: "pct", description: "PICTURE CONTROL" },
        RSCTG: { name: "rsctg", description: "RESOLUTION(Toggle)" },
        INIT: { name: "init", description: "Return to Factory Settings" }
      }
    },
    CMD: {
      name: "md-recorder",
      description: "MD Recorder Operation Command",
      values: {
        "1": { name: "1", description: "1.0" },
        "2": { name: "2", description: "2.0" },
        "3": { name: "3", description: "3.0" },
        "4": { name: "4", description: "4.0" },
        "5": { name: "5", description: "5.0" },
        "6": { name: "6", description: "6.0" },
        "7": { name: "7", description: "7.0" },
        "8": { name: "8", description: "8.0" },
        "9": { name: "9", description: "9.0" },
        POWER: { name: "power", description: "POWER ON/OFF" },
        PLAY: { name: "play", description: "PLAY" },
        STOP: { name: "stop", description: "STOP" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" },
        "P.MODE": { name: "p-mode", description: "PLAY MODE" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        PAUSE: { name: "pause", description: "PAUSE" },
        REC: { name: "rec", description: "REC" },
        MEMORY: { name: "memory", description: "MEMORY" },
        DISP: { name: "disp", description: "DISPLAY" },
        SCROLL: { name: "scroll", description: "SCROLL" },
        "M.SCAN": { name: "m-scan", description: "MUSIC SCAN" },
        CLEAR: { name: "clear", description: "CLEAR" },
        RANDOM: { name: "random", description: "RANDOM" },
        REPEAT: { name: "repeat", description: "REPEAT" },
        ENTER: { name: "enter", description: "ENTER" },
        EJECT: { name: "eject", description: "EJECT" },
        "10/0": { name: "10-0", description: "10/0" },
        "nn/nnn": { description: "--/---" },
        NAME: { name: "name", description: "NAME" },
        GROUP: { name: "group", description: "GROUP" },
        STBY: { name: "stby", description: "STANDBY" }
      }
    },
    CCR: {
      name: "cd-r-recorder",
      description: "CD-R Recorder Operation Command",
      values: {
        "1": { name: "1", description: "1.0" },
        "2": { name: "2", description: "2.0" },
        "3": { name: "3", description: "3.0" },
        "4": { name: "4", description: "4.0" },
        "5": { name: "5", description: "5.0" },
        "6": { name: "6", description: "6.0" },
        "7": { name: "7", description: "7.0" },
        "8": { name: "8", description: "8.0" },
        "9": { name: "9", description: "9.0" },
        POWER: { name: "power", description: "POWER ON/OFF" },
        "P.MODE": { name: "p-mode", description: "PLAY MODE" },
        PLAY: { name: "play", description: "PLAY" },
        STOP: { name: "stop", description: "STOP" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        PAUSE: { name: "pause", description: "PAUSE" },
        REC: { name: "rec", description: "REC" },
        CLEAR: { name: "clear", description: "CLEAR" },
        REPEAT: { name: "repeat", description: "REPEAT" },
        "10/0": { name: "10-0", description: "10/0" },
        "nn/nnn": { description: "--/---" },
        SCROLL: { name: "scroll", description: "SCROLL" },
        "OP/CL": { name: "op-cl", description: "OPEN/CLOSE" },
        DISP: { name: "disp", description: "DISPLAY" },
        RANDOM: { name: "random", description: "RANDOM" },
        MEMORY: { name: "memory", description: "MEMORY" },
        FF: { name: "ff", description: "FF" },
        REW: { name: "rew", description: "REW" },
        STBY: { name: "stby", description: "STANDBY" }
      }
    },
    CDS: {
      name: "docking-station",
      description: "Docking Station via RI",
      values: {
        POWER: { name: "power", description: "POWER ON/OFF" },
        "SHFL.ON": { name: "shfl-on", description: "SHUFFLE ON" },
        "SHFL.OFF": { name: "shfl-off", description: "SHUFFLE OFF" },
        "SEARCF.F": { name: "searcf-f", description: "SEARCH >>|" },
        "SEARCF.R": { name: "searcf-r", description: "SEARCH |<<" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        PLAY: { name: "play", description: "PLAY" },
        STOP: { name: "stop", description: "STOP" },
        PAUSE: { name: "pause", description: "PAUSE" },
        "REP.ALL": { name: "rep-all", description: "REPEAT ALL" },
        "REP.ONE": { name: "rep-one", description: "REPEAT 1" },
        "REP.OFF": { name: "rep-off", description: "REPEAT OFF" },
        RANDOM: { name: "random", description: "RANDOM" },
        "CONT.UP": { name: "cont-up", description: "CONTENT UP" },
        "CONT.DOWN": { name: "cont-down", description: "CONTENT DOWN" },
        SELECT: { name: "select", description: "SELECT" },
        MENU: { name: "menu", description: "MENU" }
      }
    },
    CAP: {
      name: "amplifier-operation",
      description: "Amplifier Operation via RI",
      values: {
        "VOL.UP": { name: "vol-up", description: "VOLUME UP" },
        "VOL.DOWN": { name: "vol-down", description: "VOLUME DOWN" },
        MUTING: { name: "muting", description: "MUTING ON/OFF" },
        "SL.UP": { name: "sl-up", description: "SELECTOR UP" },
        "SL.DOWN": { name: "sl-down", description: "SELECTOR DOWN" },
        "SL.VIDEO1": { name: "sl-video1", description: "SELECTOR VIDEO1" },
        "SL.VIDEO2": { name: "sl-video2", description: "SELECTOR VIDEO2" },
        "SL.VIDEO3": { name: "sl-video3", description: "SELECTOR VIDEO3" },
        "SL.VIDEO4": { name: "sl-video4", description: "SELECTOR VIDEO4" },
        "SL.VIDEO5": { name: "sl-video5", description: "SELECTOR VIDEO5" },
        "SL.VIDEO6": { name: "sl-video6", description: "SELECTOR VIDEO6" },
        "SL.VIDEO7": { name: "sl-video7", description: "SELECTOR VIDEO7" },
        "SL.DVD": { name: "sl-dvd", description: "SELECTOR DVD" },
        "SL.TV/CD": { name: "sl-tv-cd", description: "SELECTOR TV/CD" },
        "SL.PHONO": { name: "sl-phono", description: "SELECTOR PHONO" },
        "SL.CD": { name: "sl-cd", description: "SELECTOR CD" },
        "SL.FM": { name: "sl-fm", description: "SELECTOR FM" },
        "SL.AM": { name: "sl-am", description: "SELECTOR AM" },
        "SL.TUNER": { name: "sl-tuner", description: "SELECTOR TUNER" },
        "SL.MULTI": { name: "sl-multi", description: "SELECTOR MULTI" },
        "SL.USB": { name: "sl-usb", description: "SELECTOR USB" },
        "SL.NET": { name: "sl-net", description: "SELECTOR NET" },
        "SL.DOCK": { name: "sl-dock", description: "SELECTOR DOCK" },
        POWER: { name: "power", description: "POWER ON/OFF" }
      }
    },
    CPT: {
      name: "universal-port",
      description: "Universal PORT Operation Command",
      values: {
        "0": { name: "0", description: "0.0" },
        "1": { name: "1", description: "1.0" },
        "2": { name: "2", description: "2.0" },
        "3": { name: "3", description: "3.0" },
        "4": { name: "4", description: "4.0" },
        "5": { name: "5", description: "5.0" },
        "6": { name: "6", description: "6.0" },
        "7": { name: "7", description: "7.0" },
        "8": { name: "8", description: "8.0" },
        "9": { name: "9", description: "9.0" },
        "10": { name: "10", description: "10/+10/Direct Tuning" },
        SETUP: { name: "setup", description: "SETUP" },
        UP: { name: "up", description: "UP/Tuning Up" },
        DOWN: { name: "down", description: "DOWN/Tuning Down" },
        LEFT: { name: "left", description: "LEFT/Multicast Down" },
        RIGHT: { name: "right", description: "RIGHT/Multicast Up" },
        ENTER: { name: "enter", description: "ENTER" },
        RETURN: { name: "return", description: "RETURN" },
        DISP: { name: "disp", description: "DISPLAY" },
        PLAY: { name: "play", description: "PLAY/BAND" },
        STOP: { name: "stop", description: "STOP" },
        PAUSE: { name: "pause", description: "PAUSE" },
        "SKIP.F": { name: "skip-f", description: ">>I" },
        "SKIP.R": { name: "skip-r", description: "I<<" },
        FF: { name: "ff", description: "FF >>" },
        REW: { name: "rew", description: "REW <<" },
        REPEAT: { name: "repeat", description: "REPEAT" },
        SHUFFLE: { name: "shuffle", description: "SHUFFLE" },
        PRSUP: { name: "prsup", description: "PRESET UP" },
        PRSDN: { name: "prsdn", description: "PRESET DOWN" },
        MODE: { name: "mode", description: "MODE" }
      }
    },
    IAT: {
      name: "ipod-artist-name-info",
      description: "iPod Artist Name Info (Universal Port Dock Only)",
      values: {
        nnnnnnnnnn: {
          description: "iPod Artist Name (variable-length, 64 letters max ASCII letter only)"
        },
        QSTN: { name: "query", description: "gets iPod Artist Name" }
      }
    },
    IAL: {
      name: "ipod-album-name-info",
      description: "iPod Album Name Info (Universal Port Dock Only)",
      values: {
        nnnnnnn: {
          description: "iPod Album Name (variable-length, 64 letters max ASCII letter only)"
        },
        QSTN: { name: "query", description: "gets iPod Album Name" }
      }
    },
    ITI: {
      name: "ipod-title-name",
      description: "iPod Title Name (Universal Port Dock Only)",
      values: {
        nnnnnnnnnn: {
          description: "iPod Title Name (variable-length, 64 letters max ASCII letter only)"
        },
        QSTN: { name: "query", description: "gets iPod Title Name" }
      }
    },
    ITM: {
      name: "ipod-time-info",
      description: "iPod Time Info (Universal Port Dock Only)",
      values: {
        "mm:ss/mm:ss": {
          name: "mm-ss-mm-ss",
          description: "iPod Time Info (Elapsed time/Track Time Max 99:59)"
        },
        QSTN: { name: "query", description: "gets iPod Time Info" }
      }
    },
    ITR: {
      name: "ipod-track-info",
      description: "iPod Track Info (Universal Port Dock Only)",
      values: {
        "cccc/tttt": {
          name: "cccc-tttt",
          description: "iPod Track Info (Current Track/Toral Track Max 9999)"
        },
        QSTN: { name: "query", description: "gets iPod Time Info" }
      }
    },
    IST: {
      name: "ipod-play-status",
      description: "iPod Play Status (Universal Port Dock Only)",
      values: {
        prs: {
          name: "prs",
          description:
            'iPod Play Status (3 letters)\np -> Play Status "S" STOP, "P" Play, "p" Pause, "F" FF, "R" FR\nr -> Repeat Status "-" no Repeat, "R" All Repeat, "1" Repeat 1,\ns -> Shuffle Status "-" no Shuffle, "S" Shuffle, "A" Album Shuffle'
        },
        QSTN: { name: "query", description: "gets the iPod Play Status" }
      }
    },
    ILS: {
      name: "ipod-list-info",
      description: "iPod List Info (Universal Port Dock Extend Mode Only)",
      values: {
        tlpnnnnnnnnnn: {
          description:
            "iPod List Info\nt ->Information Type (A : ASCII letter, C : Cursor Info)\nwhen t = A,\n  l ->Line Info (0-9 : 1st to 10th Line)\n  nnnnnnnnn:Listed data (variable-length, 64 letters max ASCII letter only)\n  p ->Property (- : no)\nwhen t = C,\n  l ->Cursor Position (0-9 : 1st to 10th Line, - : No Cursor)\n  p ->Update Type (P : Page Information Update ( Page Clear or Disable List Info) , C : Cursor Position Update)"
        }
      }
    },
    IMD: {
      name: "ipod-mode-change",
      description: "iPod Mode Change (Universal Port Dock Only)",
      values: {
        STD: { name: "std", description: "Standerd Mode" },
        EXT: { name: "ext", description: "Extend Mode(If available)" },
        VDC: { name: "vdc", description: "Video Contents in Extended Mode" },
        QSTN: { name: "query", description: "gets iPod Mode Status" }
      }
    },
    UTN: {
      name: "tuning",
      description: "Tuning Command (Universal Port Dock Only)",
      values: {
        nnnnn: {
          description: "sets Directly Tuning Frequency (FM nnn.nn MHz / AM nnnnn kHz)"
        },
        UP: { name: "up", description: "sets Tuning Frequency Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Tuning Frequency Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    UPR: {
      name: "dab-preset",
      description: "DAB Preset Command (Universal Port Dock Only)",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Preset No. Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Preset No. Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Preset No." }
      }
    },
    UPM: {
      name: "preset-memory",
      description: "Preset Memory Command (Universal Port Dock Only)",
      values: {
        "1,40": { description: "Memory Preset No. 1 - 40 ( In hexadecimal representation)" }
      }
    },
    UHP: {
      name: "hd-radio-channel-program",
      description: "HD Radio Channel Program Command (Universal Port Dock Only)",
      values: {
        "1,8": { name: "directly", description: "sets directly HD Radio Channel Program" },
        QSTN: { name: "query", description: "gets HD Radio Channel Program" }
      }
    },
    UHB: {
      name: "hd-radio-blend-mode",
      description: "HD Radio Blend Mode Command (Universal Port Dock Only)",
      values: {
        "00": { name: "auto", description: 'sets HD Radio Blend Mode "Auto"' },
        "01": { name: "analog", description: 'sets HD Radio Blend Mode "Analog"' },
        QSTN: { name: "query", description: "gets the HD Radio Blend Mode Status" }
      }
    },
    UHA: {
      name: "hd-radio-artist-name-info",
      description: "HD Radio Artist Name Info (Universal Port Dock Only)",
      values: {
        nnnnnnnnnn: { description: "HD Radio Artist Name (variable-length, 64 letters max)" },
        QSTN: { name: "query", description: "gets HD Radio Artist Name" }
      }
    },
    UHC: {
      name: "hd-radio-channel-name-info",
      description: "HD Radio Channel Name Info (Universal Port Dock Only)",
      values: {
        nnnnnnn: { description: "HD Radio Channel Name (Station Name) (7lettters)" },
        QSTN: { name: "query", description: "gets HD Radio Channel Name" }
      }
    },
    UHT: {
      name: "hd-radio-title-info",
      description: "HD Radio Title Info (Universal Port Dock Only)",
      values: {
        nnnnnnnnnn: { description: "HD Radio Title (variable-length, 64 letters max)" },
        QSTN: { name: "query", description: "gets HD Radio Title" }
      }
    },
    UHD: {
      name: "hd-radio-detail-info",
      description: "HD Radio Detail Info (Universal Port Dock Only)",
      values: {
        nnnnnnnnnn: { description: "HD Radio Title" },
        QSTN: { name: "query", description: "gets HD Radio Title" }
      }
    },
    UHS: {
      name: "hd-radio-tuner-status",
      description: "HD Radio Tuner Status (Universal Port Dock Only)",
      values: {
        mmnnoo: {
          name: "mmnnoo",
          description:
            'HD Radio Tuner Status (3 bytes)\nmm -> "00" not HD, "01" HD\nnn -> current Program "01"-"08"\noo -> receivable Program (8 bits are represented in hexadecimal notation. Each bit shows receivable or not.)'
        },
        QSTN: { name: "query", description: "gets the HD Radio Tuner Status" }
      }
    },
    UDS: {
      name: "dab-sation-name",
      description: "DAB Sation Name (Universal Port Dock Only)",
      values: {
        nnnnnnnnn: { description: "Sation Name (9 letters)" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    UDD: {
      name: "dab-display-info",
      description: "DAB Display Info (Universal Port Dock Only)",
      values: {
        "PT:nnnnnnnn": { description: "DAB Program Type (8 letters)" },
        "AT:mmmkbps/nnnnnn": {
          description: "DAB Bitrate & Audio Type (m:Bitrate xxxkbps,n:Audio Type Stereo/Mono)"
        },
        "MN:nnnnnnnnn": { description: "DAB Multiplex Name (9 letters)" },
        "MF:mmm/nnnn.nnMHz": {
          description: "DAB Multiplex Band ID(mmm) & Freq(nnnn.nnMHz) Info"
        },
        PT: { name: "pt", description: "gets & display DAB Program Info" },
        AT: { name: "at", description: "gets & display DAB Bitrate & Audio Type" },
        MN: { name: "mn", description: "gets & display DAB Multicast Name" },
        MF: { name: "mf", description: "gets & display DAB Multicast Band & Freq Info" },
        UP: { name: "up", description: "gets & display DAB Information Wrap-Around Up" }
      }
    },
    ACE: {
      name: "all-channel-eq",
      description: "All Channel EQ for Temporary Value",
      values: {
        QSTN: { name: "query", description: "gets The Phase Control" }
      }
    },
    ADM: {
      name: "av-direct-mode-operation",
      description: "AV Direct Mode Operation Command",
      values: {
        "00": { name: "off", description: "sets AV Direct Mode:Off" },
        "01": { name: "on", description: "sets AV Direct Mode:On" },
        TG: { name: "tg", description: "sets AV Direct Mode Wrap-Around Up" },
        QSTN: { name: "query", description: "gets AV Direct Mode Status" }
      }
    },
    AEQ: {
      name: "accueq",
      description: "AccuEQ",
      values: {
        "00": { name: "accueq-off", description: "sets AccuEQ Off" },
        "01": { name: "accueq-on-on-all-ch", description: "sets AccuEQ On         On(All Ch)" },
        "02": { name: "accueq-on-ex-front-l-r", description: "sets AccuEQ               On(ex. Front L/R)" },
        "03": { name: "accueq-on-front-matching-eq", description: "sets AccuEQ               On( Front Matching EQ)" },
        UP: { name: "up", description: "sets AccuEQ State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The AccuEQ State" }
      }
    },
    APD: {
      name: "auto-power-down",
      description: "Auto Power Down",
      values: {
        "00": { name: "auto-power-down-off", description: "sets Auto Power Down Off" },
        "01": { name: "auto-power-down-on", description: "sets Auto Power Down On" },
        UP: { name: "up", description: "sets Auto Power Down Wrap-Around" },
        QSTN: { name: "query", description: "gets The Auto Power Down State" }
      }
    },
    APS: {
      name: "air-play-setting",
      description: "Air Play Setting",
      values: {
        "00": { name: "off", description: "sets Off" },
        "01": { name: "on", description: "sets On" },
        UP: { name: "up", description: "sets Air Play Setting Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Air Play Setting" }
      }
    },
    ARC: {
      name: "audio-return-channel",
      description: "Audio Return Channel",
      values: {
        "00": { name: "audio-return-channel-off", description: "sets Audio Return Channel Off" },
        "01": { name: "audio-return-channel-auto", description: "sets Audio Return Channel Auto" },
        UP: { name: "up", description: "sets Audio Return Channel Wrap-Around" },
        QSTN: { name: "query", description: "gets The Audio Return Channel State" }
      }
    },
    ASC: {
      name: "audio-scalar",
      description: "Audio Scalar",
      values: {
        "00": { name: "audio-scalar-auto", description: "sets Audio Scalar Auto" },
        "01": { name: "audio-scalar-manual", description: "sets Audio Scalar Manual" },
        UP: { name: "up", description: "sets Audio Scalar Wrap-Around" },
        QSTN: { name: "query", description: "gets The Audio Scalar State" }
      }
    },
    AVS: {
      name: "a-v-sync",
      description: "A/V Sync",
      values: {
        UP: { name: "a-v-sync-is-increased-step-is-depend-on-model", description: "sets A/V Sync is increased (step is depend on model)" },
        DOWN: { name: "a-v-sync-is-decreased-step-is-depend-on-model", description: "sets A/V Sync is decreased (step is depend on model)" },
        QSTN: { name: "query", description: "gets A/V Sync Value" }
      }
    },
    BCS: {
      name: "battery-charge-status-command-battery-model-only",
      description: "Battery Charge Status Command (Battery Model Only)",
      values: {
        "00": { name: "00", description: "charging" },
        "01": { name: "01", description: "charge completed" },
        "10": { name: "10", description: "battery level Low" },
        "11": { name: "11", description: "battery level Middle" },
        "12": { name: "12", description: "battery level High" },
        QSTN: { name: "query", description: "gets battery charge status" }
      }
    },
    BL3: {
      name: "zone3-balance",
      description: "Zone3 Balance Command",
      values: {
        UP: { name: "balance-up-to-r-2-step", description: "sets Balance Up (to R 2 Step)" },
        DOWN: { name: "balance-down-to-l-2-step", description: "sets Balance Down (to L 2 Step)" },
        QSTN: { name: "query", description: "gets Zone3 Balance" }
      }
    },
    CCM: {
      name: "hdmi-cec-control-monitor",
      description: "HDMI CEC Control Monitor",
      values: {
        "01": { name: "main", description: "sets Main" },
        "02": { name: "zone2", description: "sets Zone2" },
        "10": { name: "sub", description: "sets Sub" },
        UP: { name: "up", description: "sets Control Monitor Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Control Monitor" }
      }
    },
    CEC: {
      name: "hdmi-cec",
      description: "HDMI CEC",
      values: {
        "00": { name: "off", description: "sets Off" },
        "01": { name: "on", description: "sets On" },
        UP: { name: "up", description: "sets HDMI CEC Wrap-Around Up" },
        QSTN: { name: "query", description: "gets HDMI CEC" }
      }
    },
    CFS: {
      name: "current-folder-status-no",
      description: "Current Folder Status（No.）",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    CMT: {
      name: "audio-muting-by-channel",
      description: "Audio Muting by Channel Command",
      values: {
        QSTN: { name: "query", description: "gets the Audio Muting State" },
        "00": { name: "speaker-off", description: "sets Speaker Off" },
        "01": { name: "speaker-on", description: "sets Speaker On" },
        UP: { name: "up", description: "sets Speaker Switch Wrap-Around" },
      }
    },
    CST: {
      name: "cd-play-status",
      description: "CD Play Status",
      values: {
        QSTN: { name: "query", description: "gets CD Play Status" }
      }
    },
    CTI: {
      name: "center-image-for-neo-6-music",
      description: "Center Image for Neo:6 Music",
      values: {
        UP: { name: "center-image-up", description: "sets Center Image Up" },
        DOWN: { name: "center-image-down", description: "sets Center Image Down" },
        QSTN: { name: "query", description: "gets The Center Image State" }
      }
    },
    CTM: {
      name: "cd-time-info",
      description: "CD Time Info",
      values: {
        QSTN: { name: "query", description: "gets CDTime Info" }
      }
    },
    CTS: {
      name: "center-spread-for-dolby-surround",
      description: "Center Spread for Dolby Surround",
      values: {
        "00": { name: "center-spread-off", description: "sets Center Spread Off" },
        "01": { name: "center-spread-on", description: "sets Center Spread On" },
        TG: { name: "tg", description: "sets Center Spread Wrap-Around" },
        QSTN: { name: "query", description: "gets The Center Spread State" }
      }
    },
    CTV: {
      name: "tv-operation-command-via-rihd",
      description: "TV Operation Command (via RIHD)",
      values: {
        POWER: { name: "power", description: "Power" },
        PWRON: { name: "pwron", description: "PowerOn" },
        PWROFF: { name: "pwroff", description: "Standby" },
        CHUP: { name: "chup", description: "CH Up" },
        CHDN: { name: "chdn", description: "CH Down" },
        VLUP: { name: "vlup", description: "Volume Up" },
        VLDN: { name: "vldn", description: "Volume Down" },
        MUTE: { name: "mute", description: "Muting" },
        DISP: { name: "disp", description: "Display" },
        INPUT: { name: "input", description: "Input" },
        CLEAR: { name: "clear", description: "Clear" },
        SETUP: { name: "setup", description: "Setup" },
        GUIDE: { name: "guide", description: "Guide / Top Menu" },
        PREV: { name: "prev", description: "Previous" },
        UP: { name: "up", description: "Cursor Up" },
        DOWN: { name: "down", description: "Cursor Down" },
        LEFT: { name: "left", description: "Cursor Left" },
        RIGHT: { name: "right", description: "Cursor Right" },
        ENTER: { name: "enter", description: "Enter" },
        RETURN: { name: "return", description: "Return" }
      }
    },
    CTW: {
      name: "center-width-for-plii-music",
      description: "Center Width for PLII Music",
      values: {
        UP: { name: "center-width-up", description: "sets Center Width Up" },
        DOWN: { name: "center-width-down", description: "sets Center Width Down" },
        QSTN: { name: "query", description: "gets The Center Width State" }
      }
    },
    DBR: {
      name: "dab-bit-rate-and-stereo-mono-info",
      description: "DAB Bit Rate and Stereo/Mono Info",
      values: {
        QSTN: { name: "query", description: "gets DAB Bit Rate and Stereo/Mono Status" }
      }
    },
    DCE: {
      name: "dialog-control-enabled",
      description: "Dialog Control Enabled",
      values: {
        "00": { name: "00", description: "Dialog Control is disabled" },
        "01": { name: "01", description: "Dialog Control is enabled" },
        QSTN: { name: "query", description: "gets The Dialog Control Enabled State" }
      }
    },
    DER: {
      name: "dab-bit-error-rate-info",
      description: "DAB Bit Error Rate Info",
      values: {
        QSTN: { name: "query", description: "gets DAB Bit Error Rate" }
      }
    },
    DGF: {
      name: "digital-filter",
      description: "Digital Filter",
      values: {
        "00": { name: "digital-filter-slow", description: "sets Digital Filter Slow" },
        "01": { name: "digital-filter-sharp", description: "sets Digital Filter Sharp" },
        "02": { name: "digital-filter-short", description: "sets Digital Filter Short" },
        "03": { name: "digital-filter-auto", description: "sets Digital Filter Auto" },
        UP: { name: "up", description: "sets Digital Filter Wrap-Around" },
        QSTN: { name: "query", description: "gets The Digital Filter State" }
      }
    },
    DIR: {
      name: "direct",
      description: "Direct Command",
      values: {
        "00": { name: "off", description: "sets Off" },
        "01": { name: "on", description: "sets On" },
        TG: { name: "tg", description: "sets Direct Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Direct Status" }
      }
    },
    DLC: {
      name: "dialog-control",
      description: "Dialog Control",
      values: {
        UP: { name: "dialog-control-up", description: "sets Dialog Control Up" },
        DOWN: { name: "dialog-control-down", description: "sets Dialog Control Down" },
        QSTN: { name: "query", description: "gets The Dialog Control State" }
      }
    },
    DMN: {
      name: "dab-multiplex-name-info",
      description: "DAB Multiplex Name Info",
      values: {
        QSTN: { name: "query", description: "gets DAB Multiplex Name" }
      }
    },
    DMS: {
      name: "dimension-for-plii-music",
      description: "Dimension for PLII Music",
      values: {
        UP: { name: "dimension-up", description: "sets Dimension Up" },
        DOWN: { name: "dimension-down", description: "sets Dimension Down" },
        QSTN: { name: "query", description: "gets The Dimension State" }
      }
    },
    DPT: {
      name: "dab-program-type-info",
      description: "DAB Program Type Info",
      values: {
        QSTN: { name: "query", description: "gets DAB Program Type" }
      }
    },
    DSN: {
      name: "dab-station-name-dsn",
      description: "DAB Station Name",
      values: {
        "xx...xx": { name: "xx-xx", description: "DAB Station Name" },
        QSTN: { name: "query", description: "gets Station Name" }
      }
    },
    DSS: {
      name: "dirac-slot-selection",
      description: "Dirac Slot Selection",
      values: {
        "C00": { name: "C00", description: "Dirac off" },
        "C01": { name: "C01", description: "Dirac on and select slot1" },
        "C02": { name: "C02", description: "Dirac on and select slot2" },
        "C03": { name: "C03", description: "Dirac on and select slot3" },
        QSTN: { name: "query", description: "get the Dirac slot selection" }
      }
    },
    DST: {
      name: "current-disc-status-notice",
      description: "Current disc status notice",
      values: {
        "00": { name: "00", description: "No disc" },
        "04": { name: "04", description: "Audio CD" },
        "07": { name: "07", description: "MP3 CD" },
        FF: { name: "ff", description: "Unknown" },
        QSTN: { name: "query", description: "gets Disc Status" }
      }
    },
    DUS: {
      name: "device-ui-status",
      description: "Device UI Status Command",
      values: {
        QSTN: { name: "query", description: "gets the Device UI Status" }
      }
    },
    ECO: {
      name: "for-smart-grid",
      description: "for Smart Grid Command",
      values: {
        "01": { name: "volume-1db-down-and-dimmer-level-dark", description: "sets Volume 1dB down and Dimmer Level \"Dark\"" },
        "03": { name: "volume-3db-down-and-dimmer-level-dark", description: "sets Volume 3dB down and Dimmer Level \"Dark\"" },
        "06": { name: "volume-6db-down-and-dimmer-level-dark", description: "sets Volume 6dB down and Dimmer Level \"Dark\"" }
      }
    },
    EQS: {
      name: "equalizer-select-o-i-equalizer-p-manual-eq-select",
      description: "Equalizer Select(O/I:Equalizer, P:Manual EQ Select)",
      values: {
        "00": { name: "equalizer-off", description: "sets Equalizer Off" },
        "01": { name: "equalizer-preset-1", description: "sets Equalizer Preset 1" },
        "02": { name: "equalizer-preset-2", description: "sets Equalizer Preset 2" },
        "03": { name: "equalizer-preset-3", description: "sets Equalizer Preset 3" },
        UP: { name: "up", description: "sets Equalizer Preset Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Equalizer Preset Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Equalizer Preset" }
      }
    },
    FWU: {
      name: "usb-firmware-status",
      description: "USB Firmware Status",
      values: {
        QSTN: { name: "query", description: "gets The USB Firmware Status" }
      }
    },
    FWV: {
      name: "firmware-version",
      description: "Firmware Version",
      values: {
        QSTN: { name: "query", description: "gets The Firmware Version State" }
      }
    },
    FXP: {
      name: "pcm-fixed-mode-fixed-pcm-mode",
      description: "PCM Fixed Mode / Fixed PCM Mode",
      values: {
        "00": { name: "pcm-fixed-mode-off", description: "sets PCM Fixed Mode Off" },
        "01": { name: "pcm-fixed-mode-on", description: "sets PCM Fixed Mode On" },
        UP: { name: "up", description: "sets PCM Fixed Mode Wrap-Around" },
        QSTN: { name: "query", description: "gets The PCM Fixed Mode State" }
      }
    },
    HBT: {
      name: "hi-bit",
      description: "Hi-Bit",
      values: {
        "00": { name: "hi-bit-off", description: "sets Hi-Bit Off" },
        "01": { name: "hi-bit-on", description: "sets Hi-Bit On" },
        UP: { name: "up", description: "sets Hi-Bit Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Hi-Bit State" }
      }
    },
    HOI: {
      name: "hdmi-out-information",
      description: "HDMI Out Information",
      values: {
        QSTN: { name: "query", description: "gets The HDMI Out Information State" }
      }
    },
    HSF: {
      name: "hdmi-4k-8k-signal-format",
      description: "HDMI 4K/8K Signal Format Command",
      values: {
        "00": { name: "4k-standard", description: "sets HDMI 4K/8K Signal Format:4K Standard" },
        "01": { name: "4k-enhanced", description: "sets HDMI 4K/8K Signal Format:4K Enhanced" },
        "02": { name: "8k-standard", description: "sets HDMI 4K/8K Signal Format:8K Standard" },
        "03": { name: "8k-enhanced", description: "sets HDMI 4K/8K Signal Format:8K Enhanced" },
        UP: { name: "up", description: "sets HDMI 4K/8K Signal Format Wrap-Around Up" },
        QSTN: { name: "query", description: "gets HDMI 4K/8K Signal Format Status" }
      }
    },
    HST: {
      name: "hdmi-standby-through",
      description: "HDMI Standby Through",
      values: {
        OFF: { name: "hdmi-standby-through-off", description: "sets HDMI Standby Through Off" },
        LAST: { name: "hdmi-standby-through-last", description: "sets HDMI Standby Through Last" },
        AT: { name: "hdmi-standby-through-auto", description: "sets HDMI Standby Through Auto" },
        ATE: { name: "hdmi-standby-through-auto-eco", description: "sets HDMI Standby Through Auto(Eco)" },
        UP: { name: "up", description: "sets HDMI Standby Through Wrap-Around" },
        QSTN: { name: "query", description: "gets The HDMI Standby Through State" }
      }
    },
    IFN: {
      name: "network-information",
      description: "Network Information Command",
      values: {
        INFO: { name: "info", description: "display Information of Network" },
        QSTN: { name: "query", description: "gets Information of Network" }
      }
    },
    IRN: {
      name: "input-selector-rename-input-function-rename",
      description: "Input Selector Rename / Input Function Rename",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    ITV: {
      name: "intellivolume-input-volume-absorber",
      description: "IntelliVolume / Input Volume Absorber",
      values: {
        UP: { name: "intellivolume-up", description: "sets IntelliVolume Up" },
        DOWN: { name: "intellivolume-down", description: "sets IntelliVolume Down" },
        QSTN: { name: "query", description: "gets The IntelliVolume State" }
      }
    },
    LDM: {
      name: "loudness-management",
      description: "Loudness Management",
      values: {
        "00": { name: "loudness-management-off", description: "sets Loudness Management Off" },
        "01": { name: "loudness-management-on", description: "sets Loudness management On" },
        UP: { name: "up", description: "sets Panorama Wrap-Around" },
        QSTN: { name: "query", description: "gets The Panorama State" }
      }
    },
    LFE: {
      name: "lfe-level-lfe-mute-level",
      description: "LFE Level / LFE Mute Level",
      values: {
        UP: { name: "lfe-mute-level-up", description: "sets LFE Mute Level Up" },
        DOWN: { name: "lfe-mute-level-down", description: "sets LFE Mute Level Down" },
        QSTN: { name: "query", description: "gets The LFE Mute Level" }
      }
    },
    LMZ: {
      name: "zone2-listening-mode",
      description: "Listening Mode Command",
      values: {
        "00": { name: "stereo", description: "sets STEREO" },
        "01": { name: "direct", description: "sets DIRECT" },
        "0F": { name: "mono", description: "sets MONO" },
        "12": { name: "multiplex", description: "sets MULTIPLEX" },
        "87": { name: "dvs-pl2", description: "sets DVS(Pl2)" },
        "88": { name: "dvs-neo6", description: "sets DVS(NEO6)" }
      }
    },
    LPS: {
      name: "lip-sync-auto-delay",
      description: "Lip Sync / Auto Delay",
      values: {
        "00": { name: "lip-sync-off", description: "sets Lip Sync Off" },
        "01": { name: "lip-sync-on", description: "sets Lip Sync On" },
        UP: { name: "up", description: "sets Lip Sync Wrap-Around" },
        QSTN: { name: "query", description: "gets The Lip Sync State" }
      }
    },
    LRA: {
      name: "lock-range-adjust",
      description: "Lock Range Adjust",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    LTZ: {
      name: "zone2-late-night",
      description: "Late Night Command",
      values: {
        "00": { name: "late-night-off", description: "sets Late Night Off" },
        "01": { name: "late-night-low", description: "sets Late Night Low" },
        "02": { name: "late-night-high", description: "sets Late Night High" },
        UP: { name: "up", description: "sets Late Night State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Late Night Level" }
      }
    },
    MCC: {
      name: "mcacc-calibration",
      description: "MCACC Calibration",
      values: {
        "00": { name: "00", description: "not complete MCACC calibration" },
        "01": { name: "01", description: "complete MCACC calibration" },
        QSTN: { name: "query", description: "gets The MCACC calibration" }
      }
    },
    MCM: {
      name: "mcacc-eq",
      description: "MCACC EQ",
      values: {
        "01": { name: "mcacc-memory-1", description: "sets MCACC MEMORY 1" },
        "02": { name: "mcacc-memory-2", description: "sets MCACC MEMORY 2" },
        "03": { name: "mcacc-memory-3", description: "sets MCACC MEMORY 3" },
        "04": { name: "mcacc-memory-4", description: "sets MCACC MEMORY 4" },
        "05": { name: "mcacc-memory-5", description: "sets MCACC MEMORY 5" },
        "06": { name: "mcacc-memory-6", description: "sets MCACC MEMORY 6" },
        UP: { name: "up", description: "sets MCACC MEMORY Wrap-Around Up" },
        DOWN: { name: "down", description: "sets MCACC MEMORY Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The MCACC MEMORY" }
      }
    },
    MFB: {
      name: "fullband-mcacc-calibration",
      description: "Fullband MCACC Calibration",
      values: {
        "00": { name: "00", description: "not complete Fullband MCACC calibration or not have Fullband MCACC function" },
        "01": { name: "01", description: "complete Fullband MCACC calibration" },
        QSTN: { name: "query", description: "gets The Fullband MCACC calibration" }
      }
    },
    MT3: {
      name: "zone3-muting",
      description: "Zone3 Muting Command",
      values: {
        "00": { name: "zone3-muting-off", description: "sets Zone3 Muting Off" },
        "01": { name: "zone3-muting-on", description: "sets Zone3 Muting On" },
        TG: { name: "tg", description: "sets Zone3 Muting Wrap-Around" },
        QSTN: { name: "query", description: "gets the Zone3 Muting Status" }
      }
    },
    MT4: {
      name: "zone4-muting",
      description: "Zone4 Muting Command",
      values: {
        "00": { name: "zone4-muting-off", description: "sets Zone4 Muting Off" },
        "01": { name: "zone4-muting-on", description: "sets Zone4 Muting On" },
        TG: { name: "tg", description: "sets Zone4 Muting Wrap-Around" },
        QSTN: { name: "query", description: "gets the Zone4 Muting Status" }
      }
    },
    NP3: {
      name: "internet-radio-preset-my-favorites-command-network-model-only",
      description: "Internet Radio Preset / My Favorites Command (Network Model Only)",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    NP4: {
      name: "internet-radio-preset-command-network-model-only",
      description: "Internet Radio Preset Command (Network Model Only)",
      values: {
        "cccc/tttt": { name: "cccc/tttt", description: "gets the Net/USB Status" },
        QSTN: { name: "query", description: "gets the Net/USB Status" }
      }
    },
    NPZ: {
      name: "internet-radio-preset-my-favorites-command-network-model-only-npz",
      description: "Internet Radio Preset / My Favorites Command (Network Model Only)",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    NT3: {
      name: "net-tune-network-operation-command-network-model-only",
      description: "Net-Tune/Network Operation Command(Network Model Only)",
      values: {
        PLAY: { name: "play", description: "PLAY KEY" },
        STOP: { name: "stop", description: "STOP KEY" },
        PAUSE: { name: "pause", description: "PAUSE KEY" },
        TRUP: { name: "trup", description: "TRACK UP KEY" },
        TRDN: { name: "trdn", description: "TRACK DOWN KEY" },
        CHUP: { name: "chup", description: "CH UP(for iRadio)" },
        CHDN: { name: "chdn", description: "CH DOWNP(for iRadio)" },
        FF: { name: "ff", description: "FF KEY (CONTINUOUS*) (for iPod 1wire)" },
        REW: { name: "rew", description: "REW KEY (CONTINUOUS*) (for iPod 1wire)" },
        REPEAT: { name: "repeat", description: "REPEAT KEY(for iPod 1wire)" },
        RANDOM: { name: "random", description: "RANDOM KEY(for iPod 1wire)" },
        DISPLAY: { name: "display", description: "DISPLAY KEY(for iPod 1wire)" },
        MEMORY: { name: "memory", description: "MEMORY KEY" },
        RIGHT: { name: "right", description: "RIGHT KEY(for iPod 1wire)" },
        LEFT: { name: "left", description: "LEFT KEY(for iPod 1wire)" },
        UP: { name: "up", description: "UP KEY(for iPod 1wire)" },
        DOWN: { name: "down", description: "DOWN KEY(for iPod 1wire)" },
        SELECT: { name: "select", description: "SELECT KEY(for iPod 1wire)" },
        RETURN: { name: "return", description: "RETURN KEY(for iPod 1wire)" }
      }
    },
    NT4: {
      name: "net-tune-network-operation-command-network-model-only-nt4",
      description: "Net-Tune/Network Operation Command(Network Model Only)",
      values: {
        PLAY: { name: "play", description: "PLAY KEY" },
        STOP: { name: "stop", description: "STOP KEY" },
        PAUSE: { name: "pause", description: "PAUSE KEY" },
        TRUP: { name: "trup", description: "TRACK UP KEY" },
        TRDN: { name: "trdn", description: "TRACK DOWN KEY" },
        FF: { name: "ff", description: "FF KEY (CONTINUOUS*) (for iPod 1wire)" },
        REW: { name: "rew", description: "REW KEY (CONTINUOUS*) (for iPod 1wire)" },
        REPEAT: { name: "repeat", description: "REPEAT KEY(for iPod 1wire)" },
        RANDOM: { name: "random", description: "RANDOM KEY(for iPod 1wire)" },
        DISPLAY: { name: "display", description: "DISPLAY KEY(for iPod 1wire)" },
        RIGHT: { name: "right", description: "RIGHT KEY(for iPod 1wire)" },
        LEFT: { name: "left", description: "LEFT KEY(for iPod 1wire)" },
        UP: { name: "up", description: "UP KEY(for iPod 1wire)" },
        DOWN: { name: "down", description: "DOWN KEY(for iPod 1wire)" },
        SELECT: { name: "select", description: "SELECT KEY(for iPod 1wire)" },
        RETURN: { name: "return", description: "RETURN KEY(for iPod 1wire)" }
      }
    },
    NTZ: {
      name: "net-tune-network-operation-command-network-model-only-ntz",
      description: "Net-Tune/Network Operation Command(Network Model Only)",
      values: {
        PLAY: { name: "play", description: "PLAY KEY" },
        STOP: { name: "stop", description: "STOP KEY" },
        PAUSE: { name: "pause", description: "PAUSE KEY" },
        TRUP: { name: "trup", description: "TRACK UP KEY" },
        TRDN: { name: "trdn", description: "TRACK DOWN KEY" },
        CHUP: { name: "chup", description: "CH UP(for iRadio)" },
        CHDN: { name: "chdn", description: "CH DOWN(for iRadio)" },
        FF: { name: "ff", description: "FF KEY (CONTINUOUS*) (for iPod 1wire)" },
        REW: { name: "rew", description: "REW KEY (CONTINUOUS*) (for iPod 1wire)" },
        REPEAT: { name: "repeat", description: "REPEAT KEY(for iPod 1wire)" },
        RANDOM: { name: "random", description: "RANDOM KEY(for iPod 1wire)" },
        DISPLAY: { name: "display", description: "DISPLAY KEY(for iPod 1wire)" },
        MEMORY: { name: "memory", description: "MEMORY KEY" },
        MODE: { name: "mode", description: "MODE KEY" },
        RIGHT: { name: "right", description: "RIGHT KEY(for iPod 1wire)" },
        LEFT: { name: "left", description: "LEFT KEY(for iPod 1wire)" },
        UP: { name: "up", description: "UP KEY(for iPod 1wire)" },
        DOWN: { name: "down", description: "DOWN KEY(for iPod 1wire)" },
        SELECT: { name: "select", description: "SELECT KEY(for iPod 1wire)" },
        RETURN: { name: "return", description: "RETURN KEY(for iPod 1wire)" }
      }
    },
    PAM: {
      name: "pre-amp-mode-amp-mode",
      description: "Pre Amp Mode / AMP Mode",
      values: {
        "00": { name: "pre-amp-mode-off", description: "sets Pre Amp Mode Off" },
        "01": { name: "pre-amp-mode-front", description: "sets Pre Amp Mode Front" },
        "03": { name: "pre-amp-mode-front-center", description: "sets Pre Amp Mode Front+Center" },
        "07": { name: "pre-amp-mode-all", description: "sets Pre Amp Mode All" },
        UP: { name: "up", description: "sets Auto Power Down Wrap-Around" },
        QSTN: { name: "query", description: "gets The Auto Power Down State" }
      }
    },
    PBS: {
      name: "p-bass",
      description: "P.BASS",
      values: {
        "00": { name: "p-bass-off", description: "sets P.BASS Off" },
        "01": { name: "p-bass-on", description: "sets P.BASS On" },
        UP: { name: "up", description: "sets P.BASS Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The P.BASS State" }
      }
    },
    PCP: {
      name: "phase-control-plus",
      description: "Phase Control Plus",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    PCT: {
      name: "phase-control",
      description: "Phase Control",
      values: {
        "00": { name: "phase-control-off", description: "sets Phase Control Off" },
        "01": { name: "phase-control-on", description: "sets Phase Control On" },
        "02": { name: "full-band-phase-control-on", description: "sets Full Band Phase Control On" },
        UP: { name: "up", description: "sets Phase Control Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Phase Control" }
      }
    },
    PMB: {
      name: "phase-matching-bass",
      description: "Phase Matching Bass Command",
      values: {
        "00": { name: "off", description: "sets Off" },
        "01": { name: "on", description: "sets On" },
        TG: { name: "tg", description: "sets Phase Matching Bass Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Phase Matching Bass" }
      }
    },
    PNR: {
      name: "panorama-for-plii-music",
      description: "Panorama for PLII Music",
      values: {
        "00": { name: "panorama-off", description: "sets Panorama Off" },
        "01": { name: "panorama-on", description: "sets Panorama On" },
        TG: { name: "tg", description: "sets Panorama Wrap-Around" },
        QSTN: { name: "query", description: "gets The Panorama State" }
      }
    },
    POP: {
      name: "popup-message",
      description: "Popup Message",
      values: {
        "xxuycccciiiillsraabbssnnn...nnn": { name: "accueq-off", description: "sets AccuEQ Off" }
      }
    },
    PPT: {
      name: "personal-preset-command-my-input-command",
      description: "Personal Preset Command (My Input Command)",
      values: {
        QSTN: { name: "query", description: "gets the Personal Preset Setting" }
      }
    },
    PQL: {
      name: "pqls",
      description: "PQLS",
      values: {
        "00": { name: "pqls-off", description: "sets PQLS Off" },
        "01": { name: "pqls-on", description: "sets PQLS On" },
        UP: { name: "up", description: "sets PQLS Wrap-Around" },
        QSTN: { name: "query", description: "gets The PQLS State" }
      }
    },
    PR3: {
      name: "zone3-preset",
      description: "Zone3 Preset Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        "1,30": {
          name: "no-1-30",
          description: "sets Preset No. 1 - 30 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Preset No. Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Preset No. Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Preset No." }
      }
    },
    PR4: {
      name: "zone4-preset",
      description: "Zone4 Preset Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        "1,30": {
          name: "no-1-30",
          description: "sets Preset No. 1 - 30 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Preset No. Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Preset No. Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Preset No." }
      }
    },
    PRZ: {
      name: "zone2-preset",
      description: "Zone2 Preset Command",
      values: {
        "1,40": {
          name: "no-1-40",
          description: "sets Preset No. 1 - 40 ( In hexadecimal representation)"
        },
        "1,30": {
          name: "no-1-30",
          description: "sets Preset No. 1 - 30 ( In hexadecimal representation)"
        },
        UP: { name: "up", description: "sets Preset No. Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Preset No. Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Preset No." }
      }
    },
    PW3: {
      name: "zone3-power",
      description: "Zone3 Power Command",
      values: {
        "00": { name: "zone3-standby", description: "sets Zone3 Standby" },
        "01": { name: "zone3-on", description: "sets Zone3 On" },
        QSTN: { name: "query", description: "gets the Zone3 Power Status" }
      }
    },
    PW4: {
      name: "zone4-power",
      description: "Zone4 Power Command",
      values: {
        "00": { name: "zone4-standby", description: "sets Zone4 Standby" },
        "01": { name: "zone4-on", description: "sets Zone4 On" },
        QSTN: { name: "query", description: "gets the Zone4 Power Status" }
      }
    },
    RAZ: {
      name: "re-eq-academy-filter",
      description: "Re-EQ/Academy Filter Command",
      values: {
        "00": { name: "both-off", description: "sets Both Off" },
        "01": { name: "re-eq-on", description: "sets Re-EQ On" },
        "02": { name: "academy-on", description: "sets Academy On" },
        UP: { name: "up", description: "sets Re-EQ/Academy State Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Re-EQ/Academy State" }
      }
    },
    RST: {
      name: "reset",
      description: "Reset Command",
      values: {
        ALL: { name: "all", description: "Reset All" }
      }
    },
    SBS: {
      name: "s-bass",
      description: "S.BASS",
      values: {
        "00": { name: "s-bass-off", description: "sets S.BASS Off" },
        "01": { name: "s-bass-on", description: "sets S.BASS On" },
        UP: { name: "up", description: "sets S.BASS Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The S.BASS State" }
      }
    },
    SCD: {
      name: "screen-centered-dialog-dialog-enhancement",
      description: "Screen Centered Dialog / Dialog Enhancement",
      values: {
        "00": { name: "dialog-enhancement-off", description: "sets Dialog Enhancement Off" },
        "01": { name: "dialog-enhancement-on", description: "sets Dialog Enhancement On" }
      }
    },
    SCE: {
      name: "set-cd-elapsed-time",
      description: "Set　CD Elapsed　Time",
      values: {
        QSTN: { name: "query", description: "gets Station Name" }
      }
    },
    SL3: {
      name: "zone3-selector",
      description: "ZONE3 Selector Command",
      values: {
        "00": { name: "video1-vcr-dvr-stb-dvr", description: "sets VIDEO1    VCR/DVR    STB/DVR" },
        "01": { name: "video2-cbl-sat", description: "sets VIDEO2    CBL/SAT" },
        "02": { name: "video3-game-tv-game-game1", description: "sets VIDEO3    GAME/TV    GAME     GAME1" },
        "03": { name: "video4-aux1-aux", description: "sets VIDEO4    AUX1(AUX)" },
        "04": { name: "video5-aux2-game2", description: "sets VIDEO5    AUX2                          GAME2" },
        "05": { name: "video6-pc", description: "sets VIDEO6    PC" },
        "06": { name: "video7", description: "sets VIDEO7" },
        "07": { name: "hidden1-extra1", description: "sets Hidden1     EXTRA1" },
        "08": { name: "hidden2-extra2", description: "sets Hidden2     EXTRA2" },
        "09": { name: "hidden3-extra3", description: "sets Hidden3     EXTRA3" },
        "10": { name: "dvd", description: "sets DVD" },
        "11": { name: "strm-box", description: "sets STRM BOX" },
        "12": { name: "tv", description: "sets TV" },
        "20": { name: "tape-1", description: "sets TAPE(1)" },
        "21": { name: "tape2", description: "sets TAPE2" },
        "22": { name: "phono", description: "sets PHONO" },
        "23": { name: "cd-tv-cd", description: "sets CD    TV/CD" },
        "24": { name: "fm", description: "sets FM" },
        "25": { name: "am", description: "sets AM" },
        "26": { name: "tuner", description: "sets TUNER" },
        "27": { name: "music-server-p4s-dlna-2", description: "sets MUSIC SERVER    P4S   DLNA*2" },
        "28": { name: "internet-radio-iradio-favorite-3", description: "sets INTERNET RADIO           iRadio Favorite*3" },
        "29": { name: "usb-usb-front", description: "sets USB/USB(Front)" },
        "2A": { name: "usb-rear", description: "sets USB(Rear)" },
        "2B": { name: "network-net", description: "sets NETWORK                      NET" },
        "2C": { name: "usb-toggle", description: "sets USB(toggle)" },
        "2D": { name: "airplay", description: "sets Airplay" },
        "2E": { name: "bluetooth", description: "sets Bluetooth" },
        "40": { name: "universal-port", description: "sets Universal PORT" },
        "30": { name: "multi-ch", description: "sets MULTI CH" },
        "31": { name: "xm-1", description: "sets XM*1" },
        "32": { name: "sirius-1", description: "sets SIRIUS*1" },
        "33": { name: "dab-5", description: "sets DAB *5" },
        "80": { name: "source", description: "sets SOURCE" },
        UP: { name: "up", description: "sets Selector Position Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Selector Position Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    SL4: {
      name: "zone4-selector",
      description: "ZONE4 Selector Command",
      values: {
        "00": { name: "video1-vcr-dvr-stb-dvr", description: "sets VIDEO1    VCR/DVR    STB/DVR" },
        "01": { name: "video2-cbl-sat", description: "sets VIDEO2    CBL/SAT" },
        "02": { name: "video3-game-tv-game-game1", description: "sets VIDEO3    GAME/TV    GAME     GAME1" },
        "03": { name: "video4-aux1-aux", description: "sets VIDEO4    AUX1(AUX)" },
        "04": { name: "video5-aux2-game2", description: "sets VIDEO5    AUX2                          GAME2" },
        "05": { name: "video6-pc", description: "sets VIDEO6    PC" },
        "06": { name: "video7", description: "sets VIDEO7" },
        "07": { name: "hidden1-extra1", description: "sets Hidden1     EXTRA1" },
        "08": { name: "hidden2-extra2", description: "sets Hidden2     EXTRA2" },
        "09": { name: "hidden3-extra3", description: "sets Hidden3     EXTRA3" },
        "10": { name: "dvd-bd-dvd", description: "sets DVD          BD/DVD" },
        "20": { name: "tape-1-tv-tape", description: "sets TAPE(1)    TV/TAPE" },
        "21": { name: "tape2", description: "sets TAPE2" },
        "22": { name: "phono", description: "sets PHONO" },
        "23": { name: "cd-tv-cd", description: "sets CD    TV/CD" },
        "24": { name: "fm", description: "sets FM" },
        "25": { name: "am", description: "sets AM" },
        "26": { name: "tuner", description: "sets TUNER" },
        "27": { name: "music-server-p4s-dlna-2", description: "sets MUSIC SERVER    P4S   DLNA*2" },
        "28": { name: "internet-radio-iradio-favorite-3", description: "sets INTERNET RADIO           iRadio Favorite*3" },
        "29": { name: "usb-usb-front", description: "sets USB/USB(Front)" },
        "2A": { name: "usb-rear", description: "sets USB(Rear)" },
        "2B": { name: "network-net", description: "sets NETWORK                      NET" },
        "2C": { name: "usb-toggle", description: "sets USB(toggle)" },
        "2D": { name: "2d", description: "Airplay" },
        "2E": { name: "bluetooth", description: "sets Bluetooth" },
        "40": { name: "universal-port", description: "sets Universal PORT" },
        "30": { name: "multi-ch", description: "sets MULTI CH" },
        "31": { name: "xm-1", description: "sets XM*1" },
        "32": { name: "sirius-1", description: "sets SIRIUS*1" },
        "33": { name: "dab-5", description: "sets DAB *5" },
        "80": { name: "source", description: "sets SOURCE" },
        UP: { name: "up", description: "sets Selector Position Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Selector Position Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    SLZ: {
      name: "zone2-selector",
      description: "ZONE2 Selector Command",
      values: {
        "00": { name: "video1-vcr-dvr-stb-dvr", description: "sets VIDEO1    VCR/DVR    STB/DVR" },
        "01": { name: "video2-cbl-sat", description: "sets VIDEO2    CBL/SAT" },
        "02": { name: "video3-game-tv-game-game1", description: "sets VIDEO3    GAME/TV    GAME     GAME1" },
        "03": { name: "video4-aux1-aux", description: "sets VIDEO4    AUX1(AUX)" },
        "04": { name: "video5-aux2-game2", description: "sets VIDEO5    AUX2                          GAME2" },
        "05": { name: "video6-pc", description: "sets VIDEO6    PC" },
        "06": { name: "video7", description: "sets VIDEO7" },
        "07": { name: "hidden1-extra1", description: "sets Hidden1     EXTRA1" },
        "08": { name: "hidden2-extra2", description: "sets Hidden2     EXTRA2" },
        "09": { name: "hidden3-extra3", description: "sets Hidden3     EXTRA3" },
        "10": { name: "dvd-bd-dvd", description: "sets DVD          BD/DVD" },
        "11": { name: "strm-box", description: "sets STRM BOX" },
        "12": { name: "tv", description: "sets TV" },
        "20": { name: "tape-1-tv-tape", description: "sets TAPE(1) TV/TAPE" },
        "21": { name: "tape2", description: "sets TAPE2" },
        "22": { name: "phono", description: "sets PHONO" },
        "23": { name: "cd-tv-cd", description: "sets CD    TV/CD" },
        "24": { name: "fm", description: "sets FM" },
        "25": { name: "am", description: "sets AM" },
        "26": { name: "tuner", description: "sets TUNER" },
        "27": { name: "music-server-p4s-dlna-4", description: "sets MUSIC SERVER    P4S   DLNA*4" },
        "28": { name: "internet-radio-iradio-favorite-5", description: "sets INTERNET RADIO           iRadio Favorite*5" },
        "29": { name: "usb-usb-front", description: "sets USB/USB(Front)" },
        "2A": { name: "usb-rear", description: "sets USB(Rear)" },
        "2B": { name: "network-net", description: "sets NETWORK                      NET" },
        "2C": { name: "usb-toggle", description: "sets USB(toggle)" },
        "2D": { name: "airplay", description: "sets Airplay" },
        "2E": { name: "bluetooth", description: "sets Bluetooth" },
        "40": { name: "universal-port", description: "sets Universal PORT" },
        "30": { name: "multi-ch", description: "sets MULTI CH" },
        "31": { name: "xm-3", description: "sets XM*3" },
        "32": { name: "sirius-3", description: "sets SIRIUS*3" },
        "33": { name: "dab-5", description: "sets DAB *5" },
        "55": { name: "hdmi-5", description: "sets HDMI 5" },
        "56": { name: "hdmi-6", description: "sets HDMI 6" },
        "57": { name: "hdmi-7", description: "sets HDMI 7" },
        "7F": { name: "off", description: "sets OFF" },
        "80": { name: "source", description: "sets SOURCE" },
        UP: { name: "up", description: "sets Selector Position Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Selector Position Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Selector Position" }
      }
    },
    SPI: {
      name: "speaker-information",
      description: "Speaker Information",
      values: {
        QSTN: { name: "query", description: "gets The Speaker Information" }
      }
    },
    SPR: {
      name: "super-resolution",
      description: "Super Resolution",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    STW: {
      name: "eq-for-standing-wave-standing-wave",
      description: "EQ for Standing Wave / Standing Wave",
      values: {
        "00": { name: "standing-wave-off", description: "sets Standing Wave Off" },
        "01": { name: "standing-wave-on", description: "sets Standing Wave On" },
        UP: { name: "up", description: "sets Standing Wave Wrap-Around Up" },
        QSTN: { name: "query", description: "gets The Standing Wave" }
      }
    },
    SW2: {
      name: "subwoofer-2-temporary-level",
      description: "Subwoofer 2 (temporary) Level Command",
      values: {
        UP: { name: "up", description: "LEVEL + Key" },
        DOWN: { name: "down", description: "LEVEL – KEY" },
        QSTN: { name: "query", description: "gets the Subwoofer Level" }
      }
    },
    TN3: {
      name: "zone3-tone",
      description: "Zone3 Tone Command",
      values: {
        BUP: { name: "bass-up-2-step", description: "sets Bass Up (2 Step)" },
        BDOWN: { name: "bass-down-2-step", description: "sets Bass Down (2 Step)" },
        TUP: { name: "treble-up-2-step", description: "sets Treble Up (2 Step)" },
        TDOWN: { name: "treble-down-2-step", description: "sets Treble Down (2 Step)" },
        QSTN: { name: "query", description: "gets Zone3 Tone (\"BxxTxx\")" }
      }
    },
    TPD: {
      name: "temperature-data",
      description: "Temperature Data",
      values: {
        QSTN: { name: "query", description: "gets the Temperature Data" }
      }
    },
    TU3: {
      name: "zone3-tuning",
      description: "Tuning Command",
      values: {
        BAND: { name: "band", description: "Change BAND" },
        DIRECT: { name: "direct", description: "starts/restarts Direct Tuning Mode" },
        UP: { name: "up", description: "sets Tuning Frequency Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Tuning Frequency Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    TU4: {
      name: "tuning-tu4",
      description: "Tuning Command",
      values: {
        DIRECT: { name: "direct", description: "starts/restarts Direct Tuning Mode" },
        UP: { name: "up", description: "sets Tuning Frequency Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Tuning Frequency Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    TUZ: {
      name: "tuning-tuz",
      description: "Tuning Command",
      values: {
        DIRECT: { name: "direct", description: "starts/restarts Direct Tuning Mode" },
        BAND: { name: "band", description: "Change BAND" },
        UP: { name: "up", description: "sets Tuning Frequency Wrap-Around Up" },
        DOWN: { name: "down", description: "sets Tuning Frequency Wrap-Around Down" },
        QSTN: { name: "query", description: "gets The Tuning Frequency" }
      }
    },
    UPD: {
      name: "update",
      description: "Update",
      values: {
        NET: { name: "net", description: "start Device Update via Network" },
        USB: { name: "usb", description: "start Device Update via USB" },
        CMP: { name: "cmp", description: "Device Update is completed" },
        FF: { name: "ff", description: "not exist new firmware" },
        "00": { name: "00", description: "exist new firmware" },
        "01": { name: "01", description: "exist new firmware(Update Notice Normal)" },
        "02": { name: "02", description: "exist new firmware(Update Notice Force)" },
        QSTN: { name: "query", description: "gets exist new firmware" }
      }
    },
    UPS: {
      name: "upsampling",
      description: "Upsampling",
      values: {
        "00": { name: "upsampling-x1", description: "sets Upsampling x1" },
        "01": { name: "upsampling-x2", description: "sets Upsampling x2" },
        "02": { name: "upsampling-x4", description: "sets Upsampling x4" },
        "03": { name: "upsampling-x8", description: "sets Upsampling x8" },
        UP: { name: "up", description: "sets Upsampling Wrap-Around" },
        QSTN: { name: "query", description: "gets The Upsampling State" }
      }
    },
    VL3: {
      name: "zone3-volume",
      description: "Zone3 Volume Command",
      values: {
        UP1: { name: "upsampling-x8", description: "sets Upsampling x8" },
        DOWN1: { name: "down1", description: "gets The Upsampling State" },
        QSTN: { name: "query", description: "gets The Upsampling State" }
      }
    },
    VL4: {
      name: "zone4-volume",
      description: "Zone4 Volume Command",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    },
    VOC: {
      name: "vocal-dialog",
      description: "Vocal/Dialog Command",
      values: {
        QSTN: { name: "query", description: "gets Vocal/Dialogs Level" }
      }
    },
    ZBL: {
      name: "zone2-balance",
      description: "Zone2 Balance Command",
      values: {
        UP: { name: "balance-up-to-r-2-step", description: "sets Balance Up (to R 2 Step)" },
        DOWN: { name: "balance-down-to-l-2-step", description: "sets Balance Down (to L 2 Step)" },
        QSTN: { name: "query", description: "gets Zone2 Balance" }
      }
    },
    ZHO: {
      name: "zone2-hdmi-out",
      description: "Zone2 HDMI Out Command",
      values: {
        "00": { name: "00", description: "Z2 HDMI Out:Not Use" },
        "01": { name: "01", description: "Z2 HDMI Out:Use" },
        UP: { name: "up", description: "sets Zone2 HDMI Out Wrap-Around Up" },
        QSTN: { name: "query", description: "gets Zone2 HDMI Out Selector" }
      }
    },
    ZMT: {
      name: "zone2-muting",
      description: "Zone2 Muting Command",
      values: {
        "00": { name: "zone2-muting-off", description: "sets Zone2 Muting Off" },
        "01": { name: "zone2-muting-on", description: "sets Zone2 Muting On" },
        TG: { name: "tg", description: "sets Zone2 Muting Wrap-Around" },
        QSTN: { name: "query", description: "gets the Zone2 Muting Status" }
      }
    },
    ZPW: {
      name: "zone2-power",
      description: "Zone2 Power Command",
      values: {
        "00": { name: "zone2-standby", description: "sets Zone2 Standby" },
        "01": { name: "zone2-on", description: "sets Zone2 On" },
        QSTN: { name: "query", description: "gets the Zone2 Power Status" },
      }
    },
    ZTN: {
      name: "zone2-tone",
      description: "Zone2 Tone Command",
      values: {
        BUP: { name: "bass-up-2-step", description: "sets Bass Up (2 Step)" },
        BDOWN: { name: "bass-down-2-step", description: "sets Bass Down (2 Step)" },
        TUP: { name: "treble-up-2-step", description: "sets Treble Up (2 Step)" },
        TDOWN: { name: "treble-down-2-step", description: "sets Treble Down (2 Step)" },
        QSTN: { name: "query", description: "gets Zone2 Tone (\"BxxTxx\")" }
      }
    },
    ZVL: {
      name: "zone2-volume",
      description: "Zone2 Volume Command",
      values: {
        QSTN: { name: "query", description: "gets command status" }
      }
    }
  }
};
