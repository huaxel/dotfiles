; mac-layout.ahk — Swap Alt ↔ Win to match Mac keyboard layout
; Keyboard: [Space] [Ctrl] [Fn] [Win] [Alt]
; Goal:     [Space] [Ctrl] [Fn] [Alt] [Win]
;           (Win position → Alt, Alt position → Win/Cmd)

#Requires AutoHotkey v2.0

; Swap Left Alt and Left Win
LWin::LAlt
LAlt::LWin

; Swap Right Alt (AltGr) and Right Win
RWin::RAlt
RAlt::RWin
