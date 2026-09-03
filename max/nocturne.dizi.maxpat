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
			760,
			600
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
						10,
						500,
						22
					],
					"text": "nocturne.dizi — breath tone. midinote: midi vel durMs"
				}
			},
			{
				"box": {
					"id": "in1",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						30,
						40,
						42,
						22
					],
					"outlettype": [
						""
					],
					"text": "in 1"
				}
			},
			{
				"box": {
					"id": "unpack",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"patching_rect": [
						30,
						75,
						119,
						22
					],
					"outlettype": [
						"float",
						"float",
						"float"
					],
					"text": "unpack 0. 0. 0."
				}
			},
			{
				"box": {
					"id": "mtof",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						110,
						42,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "mtof"
				}
			},
			{
				"box": {
					"id": "fsig",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						145,
						77,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "sig~ 440."
				}
			},
			{
				"box": {
					"id": "vib",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						110,
						84,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "cycle~ 4.8"
				}
			},
			{
				"box": {
					"id": "vibd",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						145,
						70,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.008"
				}
			},
			{
				"box": {
					"id": "vibo",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						180,
						49,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "+~ 1."
				}
			},
			{
				"box": {
					"id": "fmod",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						215,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~"
				}
			},
			{
				"box": {
					"id": "tone",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						250,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "cycle~"
				}
			},
			{
				"box": {
					"id": "tonelvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						285,
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
					"id": "buzzf",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						250,
						70,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 2.003"
				}
			},
			{
				"box": {
					"id": "buzz",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						285,
						42,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "tri~"
				}
			},
			{
				"box": {
					"id": "buzzlvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						130,
						320,
						63,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.12"
				}
			},
			{
				"box": {
					"id": "noise",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						260,
						215,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "noise~"
				}
			},
			{
				"box": {
					"id": "res",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						260,
						250,
						140,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 1. 440. 18."
				}
			},
			{
				"box": {
					"id": "reslvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						260,
						285,
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
					"id": "mix",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						355,
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
					"id": "mix2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						390,
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
					"id": "vel",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						420,
						110,
						56,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "/ 127."
				}
			},
			{
				"box": {
					"id": "velamp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						420,
						145,
						56,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "* 0.25"
				}
			},
			{
				"box": {
					"id": "pak",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						420,
						180,
						77,
						22
					],
					"outlettype": [
						""
					],
					"text": "pak 0. 0."
				}
			},
			{
				"box": {
					"id": "env",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						420,
						215,
						175,
						22
					],
					"outlettype": [
						""
					],
					"text": "0.\\, $1 90 $1 $2 0. 250"
				}
			},
			{
				"box": {
					"id": "eline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						420,
						250,
						49,
						22
					],
					"outlettype": [
						"signal",
						"bang"
					],
					"text": "line~"
				}
			},
			{
				"box": {
					"id": "amp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						425,
						30,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~"
				}
			},
			{
				"box": {
					"id": "out",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						30,
						470,
						56,
						22
					],
					"text": "out~ 1"
				}
			},
			{
				"box": {
					"id": "busy",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 2,
					"patching_rect": [
						560,
						320,
						77,
						22
					],
					"outlettype": [
						"int",
						"int"
					],
					"text": "thispoly~"
				}
			},
			{
				"box": {
					"id": "on",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						560,
						250,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "mute 0\\, 1"
				}
			},
			{
				"box": {
					"id": "off",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						640,
						285,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "0\\, mute 1"
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"in1",
						0
					],
					"destination": [
						"unpack",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"unpack",
						0
					],
					"destination": [
						"mtof",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"mtof",
						0
					],
					"destination": [
						"fsig",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"vib",
						0
					],
					"destination": [
						"vibd",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"vibd",
						0
					],
					"destination": [
						"vibo",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fsig",
						0
					],
					"destination": [
						"fmod",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"vibo",
						0
					],
					"destination": [
						"fmod",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fmod",
						0
					],
					"destination": [
						"tone",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tone",
						0
					],
					"destination": [
						"tonelvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fmod",
						0
					],
					"destination": [
						"buzzf",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"buzzf",
						0
					],
					"destination": [
						"buzz",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"buzz",
						0
					],
					"destination": [
						"buzzlvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"noise",
						0
					],
					"destination": [
						"res",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fmod",
						0
					],
					"destination": [
						"res",
						2
					]
				}
			},
			{
				"patchline": {
					"source": [
						"res",
						0
					],
					"destination": [
						"reslvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tonelvl",
						0
					],
					"destination": [
						"mix",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"buzzlvl",
						0
					],
					"destination": [
						"mix",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"mix",
						0
					],
					"destination": [
						"mix2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"reslvl",
						0
					],
					"destination": [
						"mix2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"unpack",
						1
					],
					"destination": [
						"vel",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"vel",
						0
					],
					"destination": [
						"velamp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"velamp",
						0
					],
					"destination": [
						"pak",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"unpack",
						2
					],
					"destination": [
						"pak",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pak",
						0
					],
					"destination": [
						"env",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"env",
						0
					],
					"destination": [
						"eline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"mix2",
						0
					],
					"destination": [
						"amp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"eline",
						0
					],
					"destination": [
						"amp",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"amp",
						0
					],
					"destination": [
						"out",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"env",
						0
					],
					"destination": [
						"on",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"on",
						0
					],
					"destination": [
						"busy",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"eline",
						1
					],
					"destination": [
						"off",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"off",
						0
					],
					"destination": [
						"busy",
						0
					]
				}
			}
		]
	}
}
