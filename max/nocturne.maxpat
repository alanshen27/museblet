{
	"patcher": {
		"fileversion": 1,
		"appversion": {
			"major": 8,
			"minor": 5,
			"revision": 0,
			"architecture": "x64",
			"modernui": 1
		},
		"classnamespace": "box",
		"rect": [
			60,
			80,
			1500,
			1100
		],
		"bglocked": 0,
		"openinpresentation": 0,
		"default_fontsize": 12,
		"default_fontface": 0,
		"default_fontname": "Arial",
		"gridonopen": 1,
		"gridsize": [
			15,
			15
		],
		"gridsnaponopen": 1,
		"objectsnaponopen": 1,
		"statusbarvisible": 2,
		"toolbarvisible": 1,
		"boxes": [
			{
				"box": {
					"id": "c0",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						30,
						12,
						760,
						22
					],
					"text": "nocturne — a rubbing of the body in ink. Build the web app first (npm run build), then turn on audio."
				}
			},
			{
				"box": {
					"id": "jweb",
					"maxclass": "jweb",
					"numinlets": 1,
					"numoutlets": 2,
					"patching_rect": [
						30,
						45,
						640,
						480
					],
					"outlettype": [
						"",
						""
					],
					"url": "../dist/index.html"
				}
			},
			{
				"box": {
					"id": "m_play",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						700,
						45,
						42,
						22
					],
					"outlettype": [
						""
					],
					"text": "play"
				}
			},
			{
				"box": {
					"id": "m_stop",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						745,
						45,
						42,
						22
					],
					"outlettype": [
						""
					],
					"text": "stop"
				}
			},
			{
				"box": {
					"id": "m_clear",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						790,
						45,
						49,
						22
					],
					"outlettype": [
						""
					],
					"text": "clear"
				}
			},
			{
				"box": {
					"id": "m_open",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						840,
						45,
						42,
						22
					],
					"outlettype": [
						""
					],
					"text": "open"
				}
			},
			{
				"box": {
					"id": "m_tempo",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						890,
						45,
						70,
						22
					],
					"outlettype": [
						""
					],
					"text": "tempo 96"
				}
			},
			{
				"box": {
					"id": "m_scale",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						965,
						45,
						70,
						22
					],
					"outlettype": [
						""
					],
					"text": "scale yu"
				}
			},
			{
				"box": {
					"id": "c1",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						700,
						75,
						480,
						22
					],
					"text": "scales: gong shang jue zhi yu · qingyue yayue yanyue (+ legacy names)"
				}
			},
			{
				"box": {
					"id": "route",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 8,
					"patching_rect": [
						30,
						545,
						357,
						22
					],
					"outlettype": [
						"",
						"",
						"",
						"",
						"",
						"",
						"",
						""
					],
					"text": "route note strike ctl centre gate transport ready"
				}
			},
			{
				"box": {
					"id": "pr_tr",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						900,
						580,
						119,
						22
					],
					"text": "print transport"
				}
			},
			{
				"box": {
					"id": "pr_rd",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						1010,
						580,
						91,
						22
					],
					"text": "print ready"
				}
			},
			{
				"box": {
					"id": "pr_gate",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						800,
						580,
						84,
						22
					],
					"text": "print gate"
				}
			},
			{
				"box": {
					"id": "s_centre",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						690,
						580,
						105,
						22
					],
					"text": "s noct_centre"
				}
			},
			{
				"box": {
					"id": "inst",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 6,
					"patching_rect": [
						30,
						585,
						196,
						22
					],
					"outlettype": [
						"",
						"",
						"",
						"",
						"",
						""
					],
					"text": "route qin pipa dizi luo gu"
				}
			},
			{
				"box": {
					"id": "pre_qin",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						625,
						126,
						22
					],
					"outlettype": [
						""
					],
					"text": "prepend midinote"
				}
			},
			{
				"box": {
					"id": "poly_qin",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						660,
						308,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "poly~ nocturne.voice 8 5.5 2200 0 @steal 1"
				}
			},
			{
				"box": {
					"id": "pre_pipa",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						300,
						625,
						126,
						22
					],
					"outlettype": [
						""
					],
					"text": "prepend midinote"
				}
			},
			{
				"box": {
					"id": "poly_pipa",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						300,
						660,
						308,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "poly~ nocturne.voice 8 1.1 5200 0 @steal 1"
				}
			},
			{
				"box": {
					"id": "pre_dizi",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						570,
						625,
						126,
						22
					],
					"outlettype": [
						""
					],
					"text": "prepend midinote"
				}
			},
			{
				"box": {
					"id": "poly_dizi",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						570,
						660,
						224,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "poly~ nocturne.dizi 4 @steal 1"
				}
			},
			{
				"box": {
					"id": "pre_luo",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						840,
						625,
						126,
						22
					],
					"outlettype": [
						""
					],
					"text": "prepend midinote"
				}
			},
			{
				"box": {
					"id": "poly_luo",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						840,
						660,
						217,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "poly~ nocturne.luo 6 @steal 1"
				}
			},
			{
				"box": {
					"id": "pre_gu",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						1110,
						625,
						126,
						22
					],
					"outlettype": [
						""
					],
					"text": "prepend midinote"
				}
			},
			{
				"box": {
					"id": "poly_gu",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						1110,
						660,
						210,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "poly~ nocturne.gu 6 @steal 1"
				}
			},
			{
				"box": {
					"id": "lvl_qin",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						700,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.9"
				}
			},
			{
				"box": {
					"id": "lvl_pipa",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						300,
						700,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.8"
				}
			},
			{
				"box": {
					"id": "lvl_dizi",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						570,
						700,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.7"
				}
			},
			{
				"box": {
					"id": "lvl_luo",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						840,
						700,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.8"
				}
			},
			{
				"box": {
					"id": "lvl_gu",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1110,
						700,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.9"
				}
			},
			{
				"box": {
					"id": "bus",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						745,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "bus2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						775,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "bus3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						805,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "bus4",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						835,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "dry",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						870,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.8"
				}
			},
			{
				"box": {
					"id": "c2",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						700,
						120,
						520,
						22
					],
					"text": "ctl stream from the body (~20 Hz): width root guard breath energy lean"
				}
			},
			{
				"box": {
					"id": "ctl",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 7,
					"patching_rect": [
						700,
						150,
						301,
						22
					],
					"outlettype": [
						"",
						"",
						"",
						"",
						"",
						"",
						""
					],
					"text": "route width root guard breath energy lean"
				}
			},
			{
				"box": {
					"id": "ln_width",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						700,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_width",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						700,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_width",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						700,
						245,
						98,
						22
					],
					"text": "s noct_width"
				}
			},
			{
				"box": {
					"id": "ln_root",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						825,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_root",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						825,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_root",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						825,
						245,
						91,
						22
					],
					"text": "s noct_root"
				}
			},
			{
				"box": {
					"id": "ln_guard",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						950,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_guard",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						950,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_guard",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						950,
						245,
						98,
						22
					],
					"text": "s noct_guard"
				}
			},
			{
				"box": {
					"id": "ln_breath",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						1075,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_breath",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1075,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_breath",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						1075,
						245,
						105,
						22
					],
					"text": "s noct_breath"
				}
			},
			{
				"box": {
					"id": "ln_energy",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						1200,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_energy",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1200,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_energy",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						1200,
						245,
						105,
						22
					],
					"text": "s noct_energy"
				}
			},
			{
				"box": {
					"id": "ln_lean",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						1325,
						185,
						84,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 0. 20"
				}
			},
			{
				"box": {
					"id": "lm_lean",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1325,
						215,
						56,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 250"
				}
			},
			{
				"box": {
					"id": "s_lean",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						1325,
						245,
						91,
						22
					],
					"text": "s noct_lean"
				}
			},
			{
				"box": {
					"id": "c3",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						700,
						290,
						620,
						22
					],
					"text": "strike events: strike punch|kick midi vel x y rapid — here they kick the spectral smear"
				}
			},
			{
				"box": {
					"id": "strike",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"patching_rect": [
						700,
						320,
						126,
						22
					],
					"outlettype": [
						"",
						"",
						""
					],
					"text": "route punch kick"
				}
			},
			{
				"box": {
					"id": "sm_punch",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						700,
						355,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "60\\, 4 900"
				}
			},
			{
				"box": {
					"id": "sm_kick",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						790,
						355,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "140\\, 4 2200"
				}
			},
			{
				"box": {
					"id": "sm_line",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 2,
					"patching_rect": [
						700,
						390,
						77,
						22
					],
					"outlettype": [
						"",
						"bang"
					],
					"text": "line 4 20"
				}
			},
			{
				"box": {
					"id": "s_smear",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						700,
						425,
						98,
						22
					],
					"text": "s noct_smear"
				}
			},
			{
				"box": {
					"id": "c4",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						1000,
						460,
						420,
						22
					],
					"text": "FX rack — delay-line family + spectral. Sends from the bus."
				}
			},
			{
				"box": {
					"id": "echo_send",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						490,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.3"
				}
			},
			{
				"box": {
					"id": "echo_sum",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						520,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "echo_in",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						550,
						91,
						22
					],
					"outlettype": [
						"tapconnect"
					],
					"text": "tapin~ 2000"
				}
			},
			{
				"box": {
					"id": "echo_out",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						1000,
						580,
						133,
						22
					],
					"outlettype": [
						"signal",
						"signal"
					],
					"text": "tapout~ 410. 630."
				}
			},
			{
				"box": {
					"id": "echo_dampL",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						610,
						105,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 2600"
				}
			},
			{
				"box": {
					"id": "echo_dampR",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1120,
						610,
						105,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 2600"
				}
			},
			{
				"box": {
					"id": "echo_fb",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1120,
						640,
						63,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.35"
				}
			},
			{
				"box": {
					"id": "r_breath",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						550,
						105,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_breath"
				}
			},
			{
				"box": {
					"id": "r_energy",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						580,
						105,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_energy"
				}
			},
			{
				"box": {
					"id": "fb_expr",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						610,
						203,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr 0.22+$f1*0.42-$f2*0.14"
				}
			},
			{
				"box": {
					"id": "hall_send",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						690,
						63,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.35"
				}
			},
			{
				"box": {
					"id": "comb0",
					"maxclass": "newobj",
					"numinlets": 5,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						720,
						189,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "comb~ 100 29.7 0. 1. 0.84"
				}
			},
			{
				"box": {
					"id": "comb1",
					"maxclass": "newobj",
					"numinlets": 5,
					"numoutlets": 1,
					"patching_rect": [
						1110,
						720,
						189,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "comb~ 100 37.1 0. 1. 0.83"
				}
			},
			{
				"box": {
					"id": "comb2",
					"maxclass": "newobj",
					"numinlets": 5,
					"numoutlets": 1,
					"patching_rect": [
						1220,
						720,
						189,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "comb~ 100 41.1 0. 1. 0.82"
				}
			},
			{
				"box": {
					"id": "comb3",
					"maxclass": "newobj",
					"numinlets": 5,
					"numoutlets": 1,
					"patching_rect": [
						1330,
						720,
						189,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "comb~ 100 43.7 0. 1. 0.81"
				}
			},
			{
				"box": {
					"id": "hall_s1",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						750,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "hall_s2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						780,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "hall_s3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						810,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "ap1",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						840,
						140,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "allpass~ 20 5. 0.7"
				}
			},
			{
				"box": {
					"id": "ap2",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						870,
						147,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "allpass~ 20 1.7 0.7"
				}
			},
			{
				"box": {
					"id": "hall_lp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						900,
						105,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 3200"
				}
			},
			{
				"box": {
					"id": "hall_wet",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1000,
						930,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.3"
				}
			},
			{
				"box": {
					"id": "r_root",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						1200,
						880,
						91,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_root"
				}
			},
			{
				"box": {
					"id": "root_expr",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						1200,
						910,
						126,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr 0.2+$f1*0.4"
				}
			},
			{
				"box": {
					"id": "smear_send",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						690,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.4"
				}
			},
			{
				"box": {
					"id": "smear",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						750,
						203,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "pfft~ nocturne.smear 1024 4"
				}
			},
			{
				"box": {
					"id": "smear_wet",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						1250,
						780,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.5"
				}
			},
			{
				"box": {
					"id": "air",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						880,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "air2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						910,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "air3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						940,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "w_in",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						600,
						975,
						77,
						22
					],
					"outlettype": [
						"tapconnect"
					],
					"text": "tapin~ 50"
				}
			},
			{
				"box": {
					"id": "w_out",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						600,
						1005,
						119,
						22
					],
					"outlettype": [
						"signal",
						"signal"
					],
					"text": "tapout~ 11. 14."
				}
			},
			{
				"box": {
					"id": "w_lfo",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						800,
						900,
						91,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "cycle~ 0.23"
				}
			},
			{
				"box": {
					"id": "w_depth",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						800,
						930,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.3"
				}
			},
			{
				"box": {
					"id": "w_negd",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						880,
						960,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ -1."
				}
			},
			{
				"box": {
					"id": "w_offL",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						800,
						990,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~ 11."
				}
			},
			{
				"box": {
					"id": "w_offR",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						880,
						990,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~ 14."
				}
			},
			{
				"box": {
					"id": "r_width",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						940,
						870,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_width"
				}
			},
			{
				"box": {
					"id": "width_expr",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						940,
						900,
						126,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr 0.05+$f1*3."
				}
			},
			{
				"box": {
					"id": "mixL",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						300,
						1000,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "mixR",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						380,
						1000,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~"
				}
			},
			{
				"box": {
					"id": "guardL",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						300,
						1030,
						112,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 18000"
				}
			},
			{
				"box": {
					"id": "guardR",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						380,
						1030,
						112,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 18000"
				}
			},
			{
				"box": {
					"id": "r_guard",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						460,
						990,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_guard"
				}
			},
			{
				"box": {
					"id": "guard_expr",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						460,
						1020,
						196,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr 18000.*exp(-3.22*$f1)"
				}
			},
			{
				"box": {
					"id": "limiter",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						300,
						1060,
						63,
						22
					],
					"outlettype": [
						"signal",
						"signal"
					],
					"text": "limi~ 2"
				}
			},
			{
				"box": {
					"id": "dac",
					"maxclass": "ezdac~",
					"numinlets": 2,
					"numoutlets": 0,
					"patching_rect": [
						380,
						1060,
						45,
						45
					]
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"m_play",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"m_stop",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"m_clear",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"m_open",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"m_tempo",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"m_scale",
						0
					],
					"destination": [
						"jweb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"jweb",
						0
					],
					"destination": [
						"route",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						3
					],
					"destination": [
						"s_centre",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						4
					],
					"destination": [
						"pr_gate",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						5
					],
					"destination": [
						"pr_tr",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						6
					],
					"destination": [
						"pr_rd",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						0
					],
					"destination": [
						"inst",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"inst",
						0
					],
					"destination": [
						"pre_qin",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pre_qin",
						0
					],
					"destination": [
						"poly_qin",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"inst",
						1
					],
					"destination": [
						"pre_pipa",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pre_pipa",
						0
					],
					"destination": [
						"poly_pipa",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"inst",
						2
					],
					"destination": [
						"pre_dizi",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pre_dizi",
						0
					],
					"destination": [
						"poly_dizi",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"inst",
						3
					],
					"destination": [
						"pre_luo",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pre_luo",
						0
					],
					"destination": [
						"poly_luo",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"inst",
						4
					],
					"destination": [
						"pre_gu",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pre_gu",
						0
					],
					"destination": [
						"poly_gu",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"poly_qin",
						0
					],
					"destination": [
						"lvl_qin",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"poly_pipa",
						0
					],
					"destination": [
						"lvl_pipa",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"poly_dizi",
						0
					],
					"destination": [
						"lvl_dizi",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"poly_luo",
						0
					],
					"destination": [
						"lvl_luo",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"poly_gu",
						0
					],
					"destination": [
						"lvl_gu",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lvl_qin",
						0
					],
					"destination": [
						"bus",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lvl_pipa",
						0
					],
					"destination": [
						"bus",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus",
						0
					],
					"destination": [
						"bus2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lvl_dizi",
						0
					],
					"destination": [
						"bus2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus2",
						0
					],
					"destination": [
						"bus3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lvl_luo",
						0
					],
					"destination": [
						"bus3",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus3",
						0
					],
					"destination": [
						"bus4",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lvl_gu",
						0
					],
					"destination": [
						"bus4",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus4",
						0
					],
					"destination": [
						"dry",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						2
					],
					"destination": [
						"ctl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						0
					],
					"destination": [
						"lm_width",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_width",
						0
					],
					"destination": [
						"ln_width",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_width",
						0
					],
					"destination": [
						"s_width",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						1
					],
					"destination": [
						"lm_root",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_root",
						0
					],
					"destination": [
						"ln_root",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_root",
						0
					],
					"destination": [
						"s_root",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						2
					],
					"destination": [
						"lm_guard",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_guard",
						0
					],
					"destination": [
						"ln_guard",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_guard",
						0
					],
					"destination": [
						"s_guard",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						3
					],
					"destination": [
						"lm_breath",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_breath",
						0
					],
					"destination": [
						"ln_breath",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_breath",
						0
					],
					"destination": [
						"s_breath",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						4
					],
					"destination": [
						"lm_energy",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_energy",
						0
					],
					"destination": [
						"ln_energy",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_energy",
						0
					],
					"destination": [
						"s_energy",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ctl",
						5
					],
					"destination": [
						"lm_lean",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lm_lean",
						0
					],
					"destination": [
						"ln_lean",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ln_lean",
						0
					],
					"destination": [
						"s_lean",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"route",
						1
					],
					"destination": [
						"strike",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"strike",
						0
					],
					"destination": [
						"sm_punch",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"strike",
						1
					],
					"destination": [
						"sm_kick",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sm_punch",
						0
					],
					"destination": [
						"sm_line",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sm_kick",
						0
					],
					"destination": [
						"sm_line",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sm_line",
						0
					],
					"destination": [
						"s_smear",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus4",
						0
					],
					"destination": [
						"echo_send",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_send",
						0
					],
					"destination": [
						"echo_sum",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_sum",
						0
					],
					"destination": [
						"echo_in",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_in",
						0
					],
					"destination": [
						"echo_out",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_out",
						0
					],
					"destination": [
						"echo_dampL",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_out",
						1
					],
					"destination": [
						"echo_dampR",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_dampR",
						0
					],
					"destination": [
						"echo_fb",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_fb",
						0
					],
					"destination": [
						"echo_sum",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"r_breath",
						0
					],
					"destination": [
						"fb_expr",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"r_energy",
						0
					],
					"destination": [
						"fb_expr",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fb_expr",
						0
					],
					"destination": [
						"echo_fb",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_send",
						0
					],
					"destination": [
						"comb0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_send",
						0
					],
					"destination": [
						"comb1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_send",
						0
					],
					"destination": [
						"comb2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_send",
						0
					],
					"destination": [
						"comb3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"comb0",
						0
					],
					"destination": [
						"hall_s1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"comb1",
						0
					],
					"destination": [
						"hall_s1",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_s1",
						0
					],
					"destination": [
						"hall_s2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"comb2",
						0
					],
					"destination": [
						"hall_s2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_s2",
						0
					],
					"destination": [
						"hall_s3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"comb3",
						0
					],
					"destination": [
						"hall_s3",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus4",
						0
					],
					"destination": [
						"hall_send",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_s3",
						0
					],
					"destination": [
						"ap1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ap1",
						0
					],
					"destination": [
						"ap2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"ap2",
						0
					],
					"destination": [
						"hall_lp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_lp",
						0
					],
					"destination": [
						"hall_wet",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"r_root",
						0
					],
					"destination": [
						"root_expr",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"root_expr",
						0
					],
					"destination": [
						"hall_wet",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bus4",
						0
					],
					"destination": [
						"smear_send",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"smear_send",
						0
					],
					"destination": [
						"smear",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"smear",
						0
					],
					"destination": [
						"smear_wet",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_dampL",
						0
					],
					"destination": [
						"air",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"echo_dampR",
						0
					],
					"destination": [
						"air",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"air",
						0
					],
					"destination": [
						"air2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hall_wet",
						0
					],
					"destination": [
						"air2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"air2",
						0
					],
					"destination": [
						"air3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"smear_wet",
						0
					],
					"destination": [
						"air3",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"air3",
						0
					],
					"destination": [
						"w_in",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_in",
						0
					],
					"destination": [
						"w_out",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_lfo",
						0
					],
					"destination": [
						"w_depth",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_depth",
						0
					],
					"destination": [
						"w_offL",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_depth",
						0
					],
					"destination": [
						"w_negd",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_negd",
						0
					],
					"destination": [
						"w_offR",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_offL",
						0
					],
					"destination": [
						"w_out",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_offR",
						0
					],
					"destination": [
						"w_out",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"r_width",
						0
					],
					"destination": [
						"width_expr",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"width_expr",
						0
					],
					"destination": [
						"w_depth",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"dry",
						0
					],
					"destination": [
						"mixL",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"dry",
						0
					],
					"destination": [
						"mixR",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_out",
						0
					],
					"destination": [
						"mixL",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"w_out",
						1
					],
					"destination": [
						"mixR",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"mixL",
						0
					],
					"destination": [
						"guardL",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"mixR",
						0
					],
					"destination": [
						"guardR",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"r_guard",
						0
					],
					"destination": [
						"guard_expr",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"guard_expr",
						0
					],
					"destination": [
						"guardL",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"guard_expr",
						0
					],
					"destination": [
						"guardR",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"guardL",
						0
					],
					"destination": [
						"limiter",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"guardR",
						0
					],
					"destination": [
						"limiter",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"limiter",
						0
					],
					"destination": [
						"dac",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"limiter",
						1
					],
					"destination": [
						"dac",
						1
					]
				}
			}
		]
	}
}
