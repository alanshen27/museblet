# Sanda test fixtures

Royalty-safe still images for the **Sanda image test harness** (`/test/sanda`). All files were downloaded from [Wikimedia Commons](https://commons.wikimedia.org/) with documented licenses. Do not add fight photos with unclear rights.

## Images

| File | Expected label | License | Commons page |
|------|----------------|---------|--------------|
| `sanshou--san-da----kick--practice-fight--katwijk--dec-4--2006-jp.jpg` | kick | CC BY-SA 3.0 (Richardkw) | [Sanshou Sanda kick](https://commons.wikimedia.org/wiki/File:Sanshou_(San_da)_-_kick_(practice_fight)_Katwijk,_dec_4,_2006.JPG) |
| `flying-side-kick-jpg.jpg` | kick | CC0 (UWO Seikido) | [Flying side kick](https://commons.wikimedia.org/wiki/File:Flying_side_kick.JPG) |
| `kick-light-kickboxing-jpg.jpg` | kick | CC BY-SA 4.0 (Bovvladua) | [Kick-Light kickboxing](https://commons.wikimedia.org/wiki/File:Kick-Light_kickboxing.jpg) |
| `flickr-the-u-s-army-all-army-boxing-jab-jpg.jpg` | punch | Public domain (U.S. Army) | [All-Army Boxing jab](https://commons.wikimedia.org/wiki/File:Flickr_-_The_U.S._Army_-_All-Army_Boxing_jab.jpg) |
| `jab3-jpg.jpg` | punch | CC BY-SA 3.0 (Alain Delmas) | [Jab3 diagram](https://commons.wikimedia.org/wiki/File:Jab3.jpg) |
| `jab4-jpg.jpg` | punch | CC BY-SA 3.0 (Alain Delmas) | [Jab4 photo](https://commons.wikimedia.org/wiki/File:Jab4.jpg) |
| `direct7-jpg.jpg` | punch | CC BY-SA 3.0 (Alain Delmas) | [Direct7 photo](https://commons.wikimedia.org/wiki/File:Direct7.jpg) |
| `nitzan-oren-practicing-zhan-zhuang-jpg.jpg` | guard | CC BY 3.0 (Jonathan.bluestein) | [Zhan Zhuang](https://commons.wikimedia.org/wiki/File:Nitzan_Oren_practicing_Zhan_Zhuang.jpg) |

## Gaps & notes

- **Line-art diagrams** (`jab3-jpg.jpg`) often fail MediaPipe Pose — the harness marks them as `expectPose: false` and treats “no pose” as pass.
- **Kick vs punch** on stills uses geometric heuristics (limb extension, joint angles, guard compactness). **Velocity onset** is not available on single frames; live webcam will add that layer.
- We do not yet have a dedicated **neutral stance** photo; `guard` and `neutral` are treated as equivalent for pass/fail.
- Prefer adding future fixtures from Commons categories: [San Shou (Sanda)](https://commons.wikimedia.org/wiki/Category:Sanshou), [Jabs](https://commons.wikimedia.org/wiki/Category:Jabs), [Flying sidekick](https://commons.wikimedia.org/wiki/Category:Flying_sidekick_(martial_arts_technique)).

## Attribution

When redistributing or modifying these images, follow each file’s license on Wikimedia (attribution and share-alike where required). This repo keeps copies only for automated dev testing.
