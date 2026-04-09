#!/bin/sh
# Wrapper for swaylock to provide a better visual experience

# Path to wallpaper
WALLPAPER="/home/juan/.config/wallpapers/daniel-leone-v7daTKlZzaw-unsplash.jpg"

# Dracula Theme Colors
# Ring: Selection
# Inside: Background of ring
# Line: Border of ring
# Text: Text color inside ring

swaylock-effects \
  --clock \\
  --effect-blur 7x5 \\
  --effect-vignette 0.5:0.5 \\
  --daemonize \
  --image "$WALLPAPER" \
  --scaling fill \
  --indicator-radius 100 \
  --indicator-thickness 7 \
  --ring-color 6272a4 \
  --key-hl-color 50fa7b \
  --line-color 282a36 \
  --inside-color 282a36aa \
  --inside-ver-color 282a36aa \
  --inside-wrong-color 282a36aa \
  --inside-clear-color 282a36aa \
  --separator-color 00000000 \
  --text-color f8f8f2 \
  --text-wrong-color ff5555 \
  --text-ver-color 8be9fd \
  --text-clear-color papayaWhip \
  --ring-ver-color 8be9fd \
  --ring-wrong-color ff5555 \
  --ring-clear-color f1fa8c \
  --line-wrong-color ff5555 \
  --line-ver-color 8be9fd \
  --line-clear-color f1fa8c
