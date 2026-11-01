# BlazeCam icon

Source: `docs/brand/blazecam-source-artwork.png` (supplied by the owner).

1. `1_remove_crown.py` removes the crown: the hidden part of the lens ring is rebuilt from the ring's own pixels rotated into place (the ring is circular), and the background is rebuilt row by row from the colours on either side, then smoothed.
2. `2_compose_icon.py` crops inside the gold frame and above the lettering, fades the edges, and writes the adaptive icon layers (foreground, background, monochrome) for every density, the startup logo and a 512 px store icon.

Run from a folder containing `icon/src.png` (a copy of the source artwork); needs numpy, opencv-python-headless and pillow. Output paths in the script point at this project.
