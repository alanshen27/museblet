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
			820,
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
						640,
						22
					],
					"text": "nocturne.gu — drum below midi 84, 板 clapper at 84+. midinote: midi vel durMs"
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
					"id": "isclap",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						110,
						49,
						22
					],
					"outlettype": [
						"int"
					],
					"text": ">= 84"
				}
			},
			{
				"box": {
					"id": "clapsig",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						145,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "sig~ 0"
				}
			},
			{
				"box": {
					"id": "isdrum",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						110,
						145,
						42,
						22
					],
					"outlettype": [
						"int"
					],
					"text": "!- 1"
				}
			},
			{
				"box": {
					"id": "drumsig",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						110,
						180,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "sig~ 1"
				}
			},
			{
				"box": {
					"id": "big",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						110,
						42,
						22
					],
					"outlettype": [
						"int"
					],
					"text": "< 50"
				}
			},
			{
				"box": {
					"id": "sweep",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"patching_rect": [
						200,
						145,
						63,
						22
					],
					"outlettype": [
						"bang",
						"bang",
						""
					],
					"text": "sel 1 0"
				}
			},
			{
				"box": {
					"id": "bigsweep",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						180,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "150\\, 48 140"
				}
			},
			{
				"box": {
					"id": "smallsweep",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						300,
						180,
						91,
						22
					],
					"outlettype": [
						""
					],
					"text": "210\\, 90 70"
				}
			},
			{
				"box": {
					"id": "sline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						200,
						215,
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
					"id": "skin",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
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
					"id": "vel",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						480,
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
					"id": "senv",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						480,
						145,
						91,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, 0. 500"
				}
			},
			{
				"box": {
					"id": "seline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						480,
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
					"id": "skinamp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						285,
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
					"id": "skinlvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						320,
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
					"id": "noise",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						340,
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
					"id": "bodylp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						340,
						250,
						98,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "onepole~ 500"
				}
			},
			{
				"box": {
					"id": "benv",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						420,
						215,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 2 0. 70"
				}
			},
			{
				"box": {
					"id": "bline",
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
					"id": "bodyamp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						340,
						285,
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
					"id": "bodylvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						340,
						320,
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
					"id": "drum",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
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
					"id": "drumgate",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						390,
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
					"id": "cnoise",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						600,
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
					"id": "cenv",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						680,
						215,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 1 0. 10"
				}
			},
			{
				"box": {
					"id": "cline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						680,
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
					"id": "clapamp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						285,
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
					"id": "clapres",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						600,
						320,
						140,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 1. 2600. 7."
				}
			},
			{
				"box": {
					"id": "claplvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						355,
						56,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.6"
				}
			},
			{
				"box": {
					"id": "clapgate",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						600,
						390,
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
					"id": "mix",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						200,
						440,
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
					"id": "out",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						200,
						490,
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
						480,
						440,
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
						480,
						370,
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
						560,
						405,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "0\\, mute 1"
				}
			},
			{
				"box": {
					"id": "free",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						480,
						330,
						77,
						22
					],
					"outlettype": [
						"bang"
					],
					"text": "delay 700"
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
						"isclap",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"isclap",
						0
					],
					"destination": [
						"clapsig",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"isclap",
						0
					],
					"destination": [
						"isdrum",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"isdrum",
						0
					],
					"destination": [
						"drumsig",
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
						"big",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"big",
						0
					],
					"destination": [
						"sweep",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sweep",
						0
					],
					"destination": [
						"bigsweep",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sweep",
						1
					],
					"destination": [
						"smallsweep",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bigsweep",
						0
					],
					"destination": [
						"sline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"smallsweep",
						0
					],
					"destination": [
						"sline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"sline",
						0
					],
					"destination": [
						"skin",
						0
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
						"senv",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"senv",
						0
					],
					"destination": [
						"seline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"skin",
						0
					],
					"destination": [
						"skinamp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"seline",
						0
					],
					"destination": [
						"skinamp",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"skinamp",
						0
					],
					"destination": [
						"skinlvl",
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
						"bodylp",
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
						"benv",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"benv",
						0
					],
					"destination": [
						"bline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bodylp",
						0
					],
					"destination": [
						"bodyamp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bline",
						0
					],
					"destination": [
						"bodyamp",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bodyamp",
						0
					],
					"destination": [
						"bodylvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"skinlvl",
						0
					],
					"destination": [
						"drum",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"bodylvl",
						0
					],
					"destination": [
						"drum",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"drum",
						0
					],
					"destination": [
						"drumgate",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"drumsig",
						0
					],
					"destination": [
						"drumgate",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"cnoise",
						0
					],
					"destination": [
						"clapamp",
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
						"cenv",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"cenv",
						0
					],
					"destination": [
						"cline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"cline",
						0
					],
					"destination": [
						"clapamp",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"clapamp",
						0
					],
					"destination": [
						"clapres",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"clapres",
						0
					],
					"destination": [
						"claplvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"claplvl",
						0
					],
					"destination": [
						"clapgate",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"clapsig",
						0
					],
					"destination": [
						"clapgate",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"drumgate",
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
						"clapgate",
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
						"out",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"senv",
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
						"senv",
						0
					],
					"destination": [
						"free",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"free",
						0
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
