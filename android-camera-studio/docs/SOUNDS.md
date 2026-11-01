# Sounds

## Shutter click (`app/src/main/res/raw/shutter_click.wav`)

- Source: an MP3 supplied by the app owner (file name `son_duquotidient-son-photo-apple-391091.mp3`,
  3.9 s, 48 kHz mono, containing the same click twice).
- Processing (ffmpeg): first click only, 0.27 s to 0.69 s; 4 ms fade in, 30 ms fade out; lowered 3 dB
  (peak about -3.4 dBFS); 48 kHz, 16 bit, mono WAV, 0.42 s, 40 KB.
  `ffmpeg -ss 0.27 -to 0.69 -i SOURCE.mp3 -af "afade=t=in:d=0.004,areverse,afade=t=in:d=0.03,areverse,volume=-3dB" -ac 1 -ar 48000 -c:a pcm_s16le shutter_click.wav`
- Licence: not verified. The file name suggests it is a recording of Apple's iPhone camera sound
  from a sound effects site. Before publishing the app on a store, confirm the licence of the
  source, or switch back to the original sound made by `tools/sound/make_shutter.py`
  (write it as `shutter_click.wav`).
- Behaviour: plays only when the Shutter sound setting is on and the phone ringer is normal.
  Where the law requires a shutter sound, Android's own system sound always plays instead.
