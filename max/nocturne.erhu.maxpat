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
			720,
			560
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
						640,
						22
					],
					"text": "nocturne.erhu — bowed string, continuous 滑音, bow weight over 500 ms. midinote: midi vel durMs"
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
					"id": "glide",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						145,
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
					"id": "gline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						30,
						180,
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
					"id": "saw",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						215,
						42,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "saw~"
				}
			},
			{
				"box": {
					"id": "bow",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						250,
						105,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 2200"
				}
			},
			{
				"box": {
					"id": "res1",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						30,
						290,
						140,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 1. 620. 2.5"
				}
			},
			{
				"box": {
					"id": "res2",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						160,
						290,
						140,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 1. 1400. 3."
				}
			},
			{
				"box": {
					"id": "dry",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						290,
						290,
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
					"id": "s1",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						330,
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
					"id": "s2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						360,
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
					"text": "* 0.18"
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
						147,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 500 $1 $2 0. 400"
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
						400,
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
						450,
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
						"glide",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"glide",
						0
					],
					"destination": [
						"gline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gline",
						0
					],
					"destination": [
						"saw",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"saw",
						0
					],
					"destination": [
						"bow",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bow",
						0
					],
					"destination": [
						"res1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bow",
						0
					],
					"destination": [
						"res2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bow",
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
						"res1",
						0
					],
					"destination": [
						"s1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"res2",
						0
					],
					"destination": [
						"s1",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"s1",
						0
					],
					"destination": [
						"s2",
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
						"s2",
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
						"s2",
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
