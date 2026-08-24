{
	"patcher": {
		"fileversion": 1,
		"appversion": { "major": 8, "minor": 5, "revision": 0, "architecture": "x64", "modernui": 1 },
		"classnamespace": "box",
		"rect": [ 60.0, 80.0, 1200.0, 820.0 ],
		"bglocked": 0,
		"openinpresentation": 0,
		"default_fontsize": 12.0,
		"default_fontface": 0,
		"default_fontname": "Arial",
		"gridonopen": 1,
		"gridsize": [ 15.0, 15.0 ],
		"gridsnaponopen": 1,
		"objectsnaponopen": 1,
		"statusbarvisible": 2,
		"toolbarvisible": 1,
		"boxes": [
			{ "box": { "id": "title", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [ 30.0, 15.0, 400.0, 20.0 ], "text": "nocturne — draw on the surface, hear it as sound. Build the web app first (npm run build)." } },
			{ "box": { "id": "jweb", "maxclass": "jweb", "numinlets": 1, "numoutlets": 2, "outlettype": [ "", "" ], "patching_rect": [ 30.0, 50.0, 640.0, 480.0 ], "url": "../dist/index.html" } },

			{ "box": { "id": "playmsg", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 700.0, 50.0, 40.0, 22.0 ], "text": "play" } },
			{ "box": { "id": "stopmsg", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 750.0, 50.0, 40.0, 22.0 ], "text": "stop" } },
			{ "box": { "id": "clearmsg", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 800.0, 50.0, 44.0, 22.0 ], "text": "clear" } },
			{ "box": { "id": "tempomsg", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 852.0, 50.0, 74.0, 22.0 ], "text": "tempo 140" } },

			{ "box": { "id": "routetop", "maxclass": "newobj", "numinlets": 1, "numoutlets": 4, "outlettype": [ "", "", "", "" ], "patching_rect": [ 30.0, 555.0, 200.0, 22.0 ], "text": "route note transport ready" } },
			{ "box": { "id": "transprint", "maxclass": "newobj", "numinlets": 1, "numoutlets": 0, "patching_rect": [ 260.0, 590.0, 100.0, 22.0 ], "text": "print transport" } },
			{ "box": { "id": "readyprint", "maxclass": "newobj", "numinlets": 1, "numoutlets": 0, "patching_rect": [ 370.0, 590.0, 84.0, 22.0 ], "text": "print ready" } },

			{ "box": { "id": "penroute", "maxclass": "newobj", "numinlets": 1, "numoutlets": 6, "outlettype": [ "", "", "", "", "", "" ], "patching_rect": [ 30.0, 590.0, 300.0, 22.0 ], "text": "route neon pulse velvet ember crystal" } },

			{ "box": { "id": "pre1", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 30.0, 630.0, 110.0, 22.0 ], "text": "prepend midinote" } },
			{ "box": { "id": "pre2", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 160.0, 630.0, 110.0, 22.0 ], "text": "prepend midinote" } },
			{ "box": { "id": "pre3", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 290.0, 630.0, 110.0, 22.0 ], "text": "prepend midinote" } },
			{ "box": { "id": "pre4", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 420.0, 630.0, 110.0, 22.0 ], "text": "prepend midinote" } },
			{ "box": { "id": "pre5", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "" ], "patching_rect": [ 550.0, 630.0, 110.0, 22.0 ], "text": "prepend midinote" } },

			{ "box": { "id": "poly1", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 30.0, 665.0, 190.0, 22.0 ], "text": "poly~ nocturne.voice 8 saw 0 250" } },
			{ "box": { "id": "poly2", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 160.0, 695.0, 190.0, 22.0 ], "text": "poly~ nocturne.voice 8 rect 0 120" } },
			{ "box": { "id": "poly3", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 290.0, 725.0, 200.0, 22.0 ], "text": "poly~ nocturne.voice 8 cycle -12 900" } },
			{ "box": { "id": "poly4", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 420.0, 755.0, 190.0, 22.0 ], "text": "poly~ nocturne.voice 8 tri -12 400" } },
			{ "box": { "id": "poly5", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 550.0, 785.0, 200.0, 22.0 ], "text": "poly~ nocturne.voice 8 cycle 12 600" } },

			{ "box": { "id": "mix", "maxclass": "newobj", "numinlets": 2, "numoutlets": 1, "outlettype": [ "signal" ], "patching_rect": [ 700.0, 665.0, 80.0, 22.0 ], "text": "*~ 0.8" } },
			{ "box": { "id": "limiter", "maxclass": "newobj", "numinlets": 1, "numoutlets": 2, "outlettype": [ "signal", "signal" ], "patching_rect": [ 700.0, 700.0, 90.0, 22.0 ], "text": "limi~ 2" } },
			{ "box": { "id": "dac", "maxclass": "ezdac~", "numinlets": 2, "numoutlets": 0, "patching_rect": [ 700.0, 740.0, 45.0, 45.0 ] } }
		],
		"lines": [
			{ "patchline": { "source": [ "playmsg", 0 ], "destination": [ "jweb", 0 ] } },
			{ "patchline": { "source": [ "stopmsg", 0 ], "destination": [ "jweb", 0 ] } },
			{ "patchline": { "source": [ "clearmsg", 0 ], "destination": [ "jweb", 0 ] } },
			{ "patchline": { "source": [ "tempomsg", 0 ], "destination": [ "jweb", 0 ] } },

			{ "patchline": { "source": [ "jweb", 0 ], "destination": [ "routetop", 0 ] } },
			{ "patchline": { "source": [ "routetop", 0 ], "destination": [ "penroute", 0 ] } },
			{ "patchline": { "source": [ "routetop", 1 ], "destination": [ "transprint", 0 ] } },
			{ "patchline": { "source": [ "routetop", 2 ], "destination": [ "readyprint", 0 ] } },

			{ "patchline": { "source": [ "penroute", 0 ], "destination": [ "pre1", 0 ] } },
			{ "patchline": { "source": [ "penroute", 1 ], "destination": [ "pre2", 0 ] } },
			{ "patchline": { "source": [ "penroute", 2 ], "destination": [ "pre3", 0 ] } },
			{ "patchline": { "source": [ "penroute", 3 ], "destination": [ "pre4", 0 ] } },
			{ "patchline": { "source": [ "penroute", 4 ], "destination": [ "pre5", 0 ] } },

			{ "patchline": { "source": [ "pre1", 0 ], "destination": [ "poly1", 0 ] } },
			{ "patchline": { "source": [ "pre2", 0 ], "destination": [ "poly2", 0 ] } },
			{ "patchline": { "source": [ "pre3", 0 ], "destination": [ "poly3", 0 ] } },
			{ "patchline": { "source": [ "pre4", 0 ], "destination": [ "poly4", 0 ] } },
			{ "patchline": { "source": [ "pre5", 0 ], "destination": [ "poly5", 0 ] } },

			{ "patchline": { "source": [ "poly1", 0 ], "destination": [ "mix", 0 ] } },
			{ "patchline": { "source": [ "poly2", 0 ], "destination": [ "mix", 0 ] } },
			{ "patchline": { "source": [ "poly3", 0 ], "destination": [ "mix", 0 ] } },
			{ "patchline": { "source": [ "poly4", 0 ], "destination": [ "mix", 0 ] } },
			{ "patchline": { "source": [ "poly5", 0 ], "destination": [ "mix", 0 ] } },

			{ "patchline": { "source": [ "mix", 0 ], "destination": [ "limiter", 0 ] } },
			{ "patchline": { "source": [ "limiter", 0 ], "destination": [ "dac", 0 ] } },
			{ "patchline": { "source": [ "limiter", 1 ], "destination": [ "dac", 1 ] } }
		]
	}
}
