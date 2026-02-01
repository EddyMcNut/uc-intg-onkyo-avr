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
        '{xx}{xx}{xx}{xx}{xx}x': {
          description: "FP Display Information Character Code for FP Display (UTF-8 encoded)",
        },
        QSTN: {name: "query", description: "gets FP Display Information" }
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
        "NLSL0": { name: "tunein", description: "UC integration automatically selects TuneIn after selecting NET" },
        "NLSL1": { name: "spotify", description: "UC integration automatically selects Spotify after selecting NET" },
        "NLSL2": { name: "deezer", description: "UC integration automatically selects Deezer after selecting NET" },
        "NLSL3": { name: "tidal", description: "UC integration automatically selects Tidal after selecting NET" },
        "NLSL4": { name: "amazonmusic", description: "UC integration automatically selects AmazonMusic after selecting NET" },
        "NLSL5": { name: "chromecast", description: "UC integration automatically selects Chromecast after selecting NET" },
        "NLSL6": { name: "dts-play-fi", description: "UC integration automatically selects DTS-Play-Fi after selecting NET" },
        "NLSL7": { name: "airplay", description: "UC integration automatically selects AirPlay after selecting NET" },
        "NLSL8": { name: "alexa", description: "UC integration automatically selects Alexa after selecting NET" },
        "NLSL9": { name: "music-server", description: "UC integration automatically selects Music-Server after selecting NET" },
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
        "11": { name: "pure-audio", description: "sets PURE AUDIO" },
        "12": { name: "multiplex", description: "sets MULTIPLEX" },
        "13": { name: "full-mono", description: "sets FULL MONO" },
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
        "80": { name: "pliix-movie", description: "sets PLII/PLIIx Movie" },
        "81": { name: "pliix-music", description: "sets PLII/PLIIx Music" },
        "82": { name: ["neo-6-cinema", "neo-x-cinema"], description: "sets Neo:6 Cinema/Neo:X Cinema" },
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
        "08": { name: "orchestra", description: "sets ORCHESTRA" },
        "09": { name: "unplugged", description: "sets UNPLUGGED" },
        "0A": { name: "studio-mix", description: "sets STUDIO-MIX" },
        "0B": { name: "tv-logic", description: "sets TV LOGIC" },
        "0C": { name: "all-ch-stereo", description: "sets ALL CH STEREO" },
        "0D": { name: "theater-dimensional", description: "sets THEATER-DIMENSIONAL" },
        "0E": { name: ["enhanced-7", "enhance", "game-sports"], description: "sets ENHANCED 7/ENHANCE, Game-Sports" },
        "0F": { name: "mono", description: "sets MONO" },
        "1F": { name: "whole-house", description: "sets Whole House Mode" },
        "8A": { name: ["neo-x-thx-games"], description: "sets Neo:X THX Games" },
        "8B": { name: ["pliix-thx-music"], description: "sets PLIIx THX Music" },
        "8C": { name: ["neo-x-thx-music"], description: "sets Neo:X THX Music" },
        "8D": { name: "neural-thx-cinema", description: "sets Neural THX Cinema" },
        "8E": { name: "neural-thx-music", description: "sets Neural THX Music" },
        "8F": { name: "neural-thx-games", description: "sets Neural THX Games" },
        "9A": { name: "neo-x-game", description: "sets Neo:X Game" },
        "A2": { name: ["pliix"], description: "sets PLIIx" },
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
    }
  }
};
