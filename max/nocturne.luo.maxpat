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
			900,
			640
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
						700,
						22
					],
					"text": "nocturne.luo — gong resonator bank with post-strike pitch bend. midinote: midi vel durMs"
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
					"id": "tff",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 2,
					"patching_rect": [
						30,
						145,
						49,
						22
					],
					"outlettype": [
						"float",
						"float"
					],
					"text": "t f f"
				}
			},
			{
				"box": {
					"id": "vel",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						500,
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
						500,
						145,
						49,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "* 2.5"
				}
			},
			{
				"box": {
					"id": "burst",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						500,
						180,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 2 0. 40"
				}
			},
			{
				"box": {
					"id": "bline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						500,
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
					"id": "noise",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						580,
						180,
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
					"id": "exc",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						540,
						250,
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
					"id": "pak",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						660,
						145,
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
						660,
						180,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, 0. $2"
				}
			},
			{
				"box": {
					"id": "eline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						660,
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
					"id": "velout",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						660,
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
					"id": "hi0",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						30,
						180,
						126,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*1*1.045"
				}
			},
			{
				"box": {
					"id": "lo0",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						120,
						180,
						126,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*1*0.965"
				}
			},
			{
				"box": {
					"id": "pk0",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						215,
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
					"id": "gl0",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						250,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, $2 1300"
				}
			},
			{
				"box": {
					"id": "gline0",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						30,
						285,
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
					"id": "res0",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						30,
						320,
						154,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 1.30 440. 36."
				}
			},
			{
				"box": {
					"id": "hi1",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						230,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*1.52*1.045"
				}
			},
			{
				"box": {
					"id": "lo1",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						320,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*1.52*0.965"
				}
			},
			{
				"box": {
					"id": "pk1",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						230,
						215,
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
					"id": "gl1",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						230,
						250,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, $2 1300"
				}
			},
			{
				"box": {
					"id": "gline1",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						230,
						285,
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
					"id": "res1",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						230,
						320,
						154,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 0.76 440. 44."
				}
			},
			{
				"box": {
					"id": "hi2",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						430,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*2.02*1.045"
				}
			},
			{
				"box": {
					"id": "lo2",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						520,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*2.02*0.965"
				}
			},
			{
				"box": {
					"id": "pk2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						430,
						215,
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
					"id": "gl2",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						430,
						250,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, $2 1300"
				}
			},
			{
				"box": {
					"id": "gline2",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						430,
						285,
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
					"id": "res2",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						430,
						320,
						154,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 0.54 440. 52."
				}
			},
			{
				"box": {
					"id": "hi3",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						630,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*3.29*1.045"
				}
			},
			{
				"box": {
					"id": "lo3",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						720,
						180,
						147,
						22
					],
					"outlettype": [
						"float"
					],
					"text": "expr $f1*3.29*0.965"
				}
			},
			{
				"box": {
					"id": "pk3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						630,
						215,
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
					"id": "gl3",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						630,
						250,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1\\, $2 1300"
				}
			},
			{
				"box": {
					"id": "gline3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						630,
						285,
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
					"id": "res3",
					"maxclass": "newobj",
					"numinlets": 4,
					"numoutlets": 1,
					"patching_rect": [
						630,
						320,
						154,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "reson~ 0.42 440. 60."
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
						380,
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
						415,
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
					"id": "s3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						450,
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
					"id": "hiss",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"patching_rect": [
						250,
						380,
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
					"id": "hp",
					"maxclass": "newobj",
					"numinlets": 3,
					"numoutlets": 4,
					"patching_rect": [
						250,
						415,
						105,
						22
					],
					"outlettype": [
						"signal",
						"signal",
						"signal",
						"signal"
					],
					"text": "svf~ 3800 0.2"
				}
			},
			{
				"box": {
					"id": "hissenv",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						330,
						380,
						91,
						22
					],
					"outlettype": [
						""
					],
					"text": "$1 5 0. 900"
				}
			},
			{
				"box": {
					"id": "hline",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						330,
						415,
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
					"id": "hissamp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						250,
						450,
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
					"id": "hisslvl",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						250,
						485,
						63,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "*~ 0.05"
				}
			},
			{
				"box": {
					"id": "s4",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
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
					"id": "amp",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						555,
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
						595,
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
						760,
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
						760,
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
						830,
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
						"mtof",
						0
					],
					"destination": [
						"tff",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						0
					],
					"destination": [
						"hi0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						1
					],
					"destination": [
						"lo0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lo0",
						0
					],
					"destination": [
						"pk0",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hi0",
						0
					],
					"destination": [
						"pk0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pk0",
						0
					],
					"destination": [
						"gl0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gl0",
						0
					],
					"destination": [
						"gline0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gline0",
						0
					],
					"destination": [
						"res0",
						2
					]
				}
			},
			{
				"patchline": {
					"source": [
						"exc",
						0
					],
					"destination": [
						"res0",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						0
					],
					"destination": [
						"hi1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						1
					],
					"destination": [
						"lo1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lo1",
						0
					],
					"destination": [
						"pk1",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hi1",
						0
					],
					"destination": [
						"pk1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pk1",
						0
					],
					"destination": [
						"gl1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gl1",
						0
					],
					"destination": [
						"gline1",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gline1",
						0
					],
					"destination": [
						"res1",
						2
					]
				}
			},
			{
				"patchline": {
					"source": [
						"exc",
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
						"tff",
						0
					],
					"destination": [
						"hi2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						1
					],
					"destination": [
						"lo2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lo2",
						0
					],
					"destination": [
						"pk2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hi2",
						0
					],
					"destination": [
						"pk2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pk2",
						0
					],
					"destination": [
						"gl2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gl2",
						0
					],
					"destination": [
						"gline2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gline2",
						0
					],
					"destination": [
						"res2",
						2
					]
				}
			},
			{
				"patchline": {
					"source": [
						"exc",
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
						"tff",
						0
					],
					"destination": [
						"hi3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"tff",
						1
					],
					"destination": [
						"lo3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"lo3",
						0
					],
					"destination": [
						"pk3",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hi3",
						0
					],
					"destination": [
						"pk3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"pk3",
						0
					],
					"destination": [
						"gl3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gl3",
						0
					],
					"destination": [
						"gline3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"gline3",
						0
					],
					"destination": [
						"res3",
						2
					]
				}
			},
			{
				"patchline": {
					"source": [
						"exc",
						0
					],
					"destination": [
						"res3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"res0",
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
						"res1",
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
						"res2",
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
						"s2",
						0
					],
					"destination": [
						"s3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"res3",
						0
					],
					"destination": [
						"s3",
						1
					]
				}
			},
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
						"burst",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"burst",
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
						"noise",
						0
					],
					"destination": [
						"exc",
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
						"exc",
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
						"velout",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"velout",
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
						"hiss",
						0
					],
					"destination": [
						"hp",
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
						"hissenv",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hissenv",
						0
					],
					"destination": [
						"hline",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hp",
						1
					],
					"destination": [
						"hissamp",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hline",
						0
					],
					"destination": [
						"hissamp",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hissamp",
						0
					],
					"destination": [
						"hisslvl",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"s3",
						0
					],
					"destination": [
						"s4",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"hisslvl",
						0
					],
					"destination": [
						"s4",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"s4",
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
