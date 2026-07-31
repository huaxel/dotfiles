; mac-layout.ahk — Mac-like modifiers and Colemak multilingual Option layer
; Keyboard: [Space] [Ctrl] [Fn] [Win] [Alt]
; Goal:     [Space] [Ctrl] [Fn] [Alt] [Win]
;
; The physical Win key becomes Mac Option through the remap below.
; Scan codes are used because Windows is running the Colemak layout: they
; target the logical Colemak key positions rather than QWERTY virtual keys.
;
; Examples:
;   Option+E → é                 Option+T, then E → é
;   Option+R, then E → è         Option+X, then E → ê
;   Option+N → ñ                 Option+`, then N → ñ
;   Option+D, then U → ü         Option+W → å

#Requires AutoHotkey v2.0
#SingleInstance Force

; Swap the physical Mac modifier positions: left Win/Command becomes Alt,
; and left Alt/Option becomes Win/Command. Named modifier remaps are used
; here so Windows receives the expected modifier identity.
LWin::LAlt
LAlt::LWin

; SC15B is the physical Win/Command-position key; SC138 is physical Right
; Alt/Option. Both layers are defined because Right Alt may arrive natively
; or as Ctrl+Alt (AltGr), while SC138 remains unmodified for GlazeWM.

; Colemak multilingual dead keys. These are the Colemak key positions:
; B=breve, comma=cedilla, D=diaeresis, T=acute, R=grave, H=caron,
; G=ogonek, M=macron, backtick=tilde, K=ring, .=dot, X=circumflex.
SC15B & SC030::BeginAccent("breve")
~SC138 & SC030::BeginAccent("breve")
SC15B & SC033::BeginAccent("cedilla")
~SC138 & SC033::BeginAccent("cedilla")
SC15B & SC022::BeginAccent("diaeresis")
~SC138 & SC022::BeginAccent("diaeresis")
SC15B & SC021::BeginAccent("acute")
~SC138 & SC021::BeginAccent("acute")
SC15B & SC01F::BeginAccent("grave")
~SC138 & SC01F::BeginAccent("grave")
SC15B & SC023::BeginAccent("caron")
~SC138 & SC023::BeginAccent("caron")
SC15B & SC014::BeginAccent("ogonek")
~SC138 & SC014::BeginAccent("ogonek")
SC15B & SC032::BeginAccent("macron")
~SC138 & SC032::BeginAccent("macron")
SC15B & SC029::BeginAccent("tilde")
~SC138 & SC029::BeginAccent("tilde")
SC15B & SC031::BeginAccent("ring")
~SC138 & SC031::BeginAccent("ring")
SC15B & SC034::BeginAccent("dot")
~SC138 & SC034::BeginAccent("dot")
SC15B & SC02D::BeginAccent("circumflex")
~SC138 & SC02D::BeginAccent("circumflex")

; Direct Colemak multilingual characters and punctuation.
SC15B & SC010::OptionChar("ä", "Ä")
~SC138 & SC010::OptionChar("ä", "Ä")
SC15B & SC011::OptionChar("å", "Å")
~SC138 & SC011::OptionChar("å", "Å")
SC15B & SC012::OptionChar("ã", "Ã")
~SC138 & SC012::OptionChar("ã", "Ã")
SC15B & SC013::OptionChar("ø", "Ø")
~SC138 & SC013::OptionChar("ø", "Ø")
SC15B & SC015::OptionChar("đ", "Đ")
~SC138 & SC015::OptionChar("đ", "Đ")
SC15B & SC016::OptionChar("ł", "Ł")
~SC138 & SC016::OptionChar("ł", "Ł")
SC15B & SC017::OptionChar("ú", "Ú")
~SC138 & SC017::OptionChar("ú", "Ú")
SC15B & SC018::OptionChar("ü", "Ü")
~SC138 & SC018::OptionChar("ü", "Ü")
SC15B & SC019::OptionChar("ö", "Ö")
~SC138 & SC019::OptionChar("ö", "Ö")
SC15B & SC01E::OptionChar("á", "Á")
~SC138 & SC01E::OptionChar("á", "Á")
SC15B & SC020::OptionChar("ß", "ẞ")
~SC138 & SC020::OptionChar("ß", "ẞ")
SC15B & SC024::OptionChar("ñ", "Ñ")
~SC138 & SC024::OptionChar("ñ", "Ñ")
SC15B & SC025::OptionChar("é", "É")
~SC138 & SC025::OptionChar("é", "É")
SC15B & SC026::OptionChar("í", "Í")
~SC138 & SC026::OptionChar("í", "Í")
SC15B & SC027::OptionChar("ó", "Ó")
~SC138 & SC027::OptionChar("ó", "Ó")
SC15B & SC028::OptionChar("õ", "Õ")
~SC138 & SC028::OptionChar("õ", "Õ")
SC15B & SC02C::OptionChar("æ", "Æ")
~SC138 & SC02C::OptionChar("æ", "Æ")
SC15B & SC02E::OptionChar("ç", "Ç")
~SC138 & SC02E::OptionChar("ç", "Ç")
SC15B & SC02F::OptionChar("œ", "Œ")
~SC138 & SC02F::OptionChar("œ", "Œ")

; Number-row symbols.
SC15B & SC002::OptionChar("¡", "¹")
~SC138 & SC002::OptionChar("¡", "¹")
SC15B & SC003::OptionChar("º", "²")
~SC138 & SC003::OptionChar("º", "²")
SC15B & SC004::OptionChar("ª", "³")
~SC138 & SC004::OptionChar("ª", "³")
SC15B & SC005::OptionChar("¢", "£")
~SC138 & SC005::OptionChar("¢", "£")
SC15B & SC006::OptionChar("€", "¥")
~SC138 & SC006::OptionChar("€", "¥")
SC15B & SC007::OptionChar("ħ", "Ħ")
~SC138 & SC007::OptionChar("ħ", "Ħ")
SC15B & SC008::OptionChar("ð", "Ð")
~SC138 & SC008::OptionChar("ð", "Ð")
SC15B & SC009::OptionChar("þ", "Þ")
~SC138 & SC009::OptionChar("þ", "Þ")
SC15B & SC00A::OptionChar("‘", "“")
~SC138 & SC00A::OptionChar("‘", "“")
SC15B & SC00B::OptionChar("’", "”")
~SC138 & SC00B::OptionChar("’", "”")
SC15B & SC00C::OptionChar("–", "—")
~SC138 & SC00C::OptionChar("–", "—")
SC15B & SC00D::OptionChar("×", "÷")
~SC138 & SC00D::OptionChar("×", "÷")

; Angle quotes, inverted punctuation, and non-breaking space.
SC15B & SC01A::OptionChar("«", "‹")
~SC138 & SC01A::OptionChar("«", "‹")
SC15B & SC01B::OptionChar("»", "›")
~SC138 & SC01B::OptionChar("»", "›")
SC15B & SC035::OptionChar("¿", "¿")
~SC138 & SC035::OptionChar("¿", "¿")
SC15B & Space::OptionSpace()
~SC138 & Space::OptionSpace()

; Colemak multilingual special-character sequence: Option+Backslash,
; followed by the key. Shifted variants produce the second symbol.
SC15B & SC02B::BeginSpecial()
~SC138 & SC02B::BeginSpecial()

; ISO key immediately beside the left Shift key: direct ASCII tilde.
SC056::SendText("~")

OptionChar(base, shifted := "") {
    if (shifted != "" && GetKeyState("Shift", "P"))
        SendText(shifted)
    else
        SendText(base)
}

OptionSpace() {
    if (GetKeyState("Shift", "P"))
        SendText(Chr(0xA0))
    else
        SendText(" ")
}

BeginAccent(kind) {
    ; Colemak uses Shift+T for the double-acute dead key.
    if (kind = "acute" && GetKeyState("Shift", "P"))
        kind := "doubleacute"

    maps := Map(
        "breve", Map("a", "ă", "g", "ğ", "A", "Ă", "G", "Ğ"),
        "cedilla", Map("c", "ç", "s", "ş", "t", "ţ", "C", "Ç", "S", "Ş", "T", "Ţ"),
        "diaeresis", Map("a", "ä", "e", "ë", "i", "ï", "o", "ö", "u", "ü", "y", "ÿ", "A", "Ä", "E", "Ë", "I", "Ï", "O", "Ö", "U", "Ü", "Y", "Ÿ"),
        "acute", Map("a", "á", "c", "ć", "e", "é", "i", "í", "o", "ó", "u", "ú", "y", "ý", "A", "Á", "C", "Ć", "E", "É", "I", "Í", "O", "Ó", "U", "Ú", "Y", "Ý"),
        "doubleacute", Map("o", "ő", "u", "ű", "O", "Ő", "U", "Ű"),
        "grave", Map("a", "à", "e", "è", "i", "ì", "o", "ò", "u", "ù", "A", "À", "E", "È", "I", "Ì", "O", "Ò", "U", "Ù"),
        "caron", Map("c", "č", "d", "ď", "e", "ě", "l", "ľ", "n", "ň", "r", "ř", "s", "š", "t", "ť", "z", "ž", "C", "Č", "D", "Ď", "E", "Ě", "L", "Ľ", "N", "Ň", "R", "Ř", "S", "Š", "T", "Ť", "Z", "Ž"),
        "ogonek", Map("a", "ą", "e", "ę", "i", "į", "u", "ų", "A", "Ą", "E", "Ę", "I", "Į", "U", "Ų"),
        "macron", Map("a", "ā", "e", "ē", "i", "ī", "o", "ō", "u", "ū", "y", "ȳ", "A", "Ā", "E", "Ē", "I", "Ī", "O", "Ō", "U", "Ū", "Y", "Ȳ"),
        "tilde", Map("a", "ã", "n", "ñ", "o", "õ", "A", "Ã", "N", "Ñ", "O", "Õ"),
        "ring", Map("a", "å", "u", "ů", "A", "Å", "U", "Ů"),
        "dot", Map("c", "ċ", "e", "ė", "g", "ġ", "z", "ż", "C", "Ċ", "E", "Ė", "G", "Ġ", "Z", "Ż"),
        "circumflex", Map("a", "â", "e", "ê", "i", "î", "o", "ô", "u", "û", "A", "Â", "E", "Ê", "I", "Î", "O", "Ô", "U", "Û")
    )
    fallback := Map("breve", "˘", "cedilla", "¸", "diaeresis", "¨", "acute", "´", "doubleacute", "˝", "grave", "``", "caron", "ˇ", "ogonek", "˛", "macron", "¯", "tilde", "~", "ring", "˚", "dot", "˙", "circumflex", "ˆ")

    hook := InputHook("L1 T3", "{Esc}")
    hook.VisibleText := false
    hook.VisibleNonText := false
    hook.Start()
    hook.Wait()

    if (hook.EndReason = "EndKey")
        return

    key := hook.Input
    if (key = " ")
        SendText(fallback[kind])
    else if (maps[kind].Has(key))
        SendText(maps[kind][key])
    else
        SendText(fallback[kind] . key)
}

BeginSpecial() {
    hook := InputHook("L1 T3", "{Esc}")
    hook.VisibleText := false
    hook.VisibleNonText := false
    hook.Start()
    hook.Wait()

    if (hook.EndReason = "EndKey")
        return

    key := hook.Input
    shifted := GetKeyState("Shift", "P")
    if (key = "+")
        key := "="
    else if (key = "<")
        key := ","
    else if (key = ">")
        key := "."
    else if (key = "|")
        key := Chr(0x5C)
    else if (key = "~")
        key := "``"

    special := Map("c", "©", "r", "®", "t", "™", "d", "°", "m", "µ", "n", "№", "p", "¶", "s", "§")
    shiftedSpecial := Map("=", "±", ",", "≤", ".", "≥", Chr(0x60), "≈", "5", "‰", Chr(0x5C), "¦")
    lower := StrLower(key)

    if (shifted && shiftedSpecial.Has(lower))
        SendText(shiftedSpecial[lower])
    else if (special.Has(lower))
        SendText(special[lower])
    else if (lower = ".")
        SendText("…")
    else if (lower = "=")
        SendText("≠")
    else
        SendText(Chr(0x5C) . key)
}
