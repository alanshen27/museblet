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
			620,
			420
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
						560,
						22
					],
					"text": "nocturne.smear — spectral smear inside pfft~. r noct_smear = release in frames"
				}
			},
			{
				"box": {
					"id": "fin",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"patching_rect": [
						30,
						50,
						70,
						22
					],
					"outlettype": [
						"signal",
						"signal",
						"signal"
					],
					"text": "fftin~ 1"
				}
			},
			{
				"box": {
					"id": "c2p",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						30,
						100,
						77,
						22
					],
					"outlettype": [
						"signal",
						"signal"
					],
					"text": "cartopol~"
				}
			},
			{
				"box": {
					"id": "vec",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						30,
						160,
						105,
						22
					],
					"outlettype": [
						"signal"
					],
					"text": "vectral~ 1024"
				}
			},
			{
				"box": {
					"id": "rsm",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 1,
					"patching_rect": [
						260,
						100,
						98,
						22
					],
					"outlettype": [
						""
					],
					"text": "r noct_smear"
				}
			},
			{
				"box": {
					"id": "slide",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"patching_rect": [
						260,
						135,
						84,
						22
					],
					"outlettype": [
						""
					],
					"text": "slide 1 $1"
				}
			},
			{
				"box": {
					"id": "p2c",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"patching_rect": [
						30,
						220,
						77,
						22
					],
					"outlettype": [
						"signal",
						"signal"
					],
					"text": "poltocar~"
				}
			},
			{
				"box": {
					"id": "fout",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 0,
					"patching_rect": [
						30,
						280,
						77,
						22
					],
					"text": "fftout~ 1"
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"fin",
						0
					],
					"destination": [
						"c2p",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fin",
						1
					],
					"destination": [
						"c2p",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"fin",
						2
					],
					"destination": [
						"vec",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"c2p",
						0
					],
					"destination": [
						"vec",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"rsm",
						0
					],
					"destination": [
						"slide",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"slide",
						0
					],
					"destination": [
						"vec",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"vec",
						0
					],
					"destination": [
						"p2c",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"c2p",
						1
					],
					"destination": [
						"p2c",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"p2c",
						0
					],
					"destination": [
						"fout",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"p2c",
						1
					],
					"destination": [
						"fout",
						1
					]
				}
			}
		]
	}
}
