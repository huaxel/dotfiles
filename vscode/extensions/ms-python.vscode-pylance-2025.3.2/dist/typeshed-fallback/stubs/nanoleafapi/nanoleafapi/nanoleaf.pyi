from _typeshed import Incomplete
from collections.abc import Callable
from typing import Any

RED: tuple[int, int, int]
ORANGE: tuple[int, int, int]
YELLOW: tuple[int, int, int]
GREEN: tuple[int, int, int]
LIGHT_BLUE: tuple[int, int, int]
BLUE: tuple[int, int, int]
PINK: tuple[int, int, int]
PURPLE: tuple[int, int, int]
WHITE: tuple[int, int, int]

class Nanoleaf:
    ip: str
    print_errors: bool
    url: str
    auth_token: str
    already_registered: bool
    def __init__(self, ip: str, auth_token: str | None = None, print_errors: bool = False) -> None: ...
    def create_auth_token(self) -> str | None: ...
    def delete_auth_token(self, auth_token: str) -> bool: ...
    def check_connection(self) -> None: ...
    def get_info(self) -> dict[str, Incomplete]: ...
    def get_name(self) -> str: ...
    def get_auth_token(self) -> str | None: ...
    def get_ids(self) -> list[int]: ...
    @staticmethod
    def get_custom_base_effect(anim_type: str = "custom", loop: bool = True) -> dict[str, Incomplete]: ...
    def power_off(self) -> bool: ...
    def power_on(self) -> bool: ...
    def get_power(self) -> bool: ...
    def toggle_power(self) -> bool: ...
    def set_color(self, rgb: tuple[int, int, int]) -> bool: ...
    def set_brightness(self, brightness: int, duration: int = 0) -> bool: ...
    def increment_brightness(self, brightness: int) -> bool: ...
    def get_brightness(self) -> int: ...
    def identify(self) -> bool: ...
    def set_hue(self, value: int) -> bool: ...
    def increment_hue(self, value: int) -> bool: ...
    def get_hue(self) -> int: ...
    def set_saturation(self, value: int) -> bool: ...
    def increment_saturation(self, value: int) -> bool: ...
    def get_saturation(self) -> int: ...
    def set_color_temp(self, value: int) -> bool: ...
    def increment_color_temp(self, value: int) -> bool: ...
    def get_color_temp(self) -> int: ...
    def get_color_mode(self) -> str: ...
    def get_current_effect(self) -> str: ...
    def set_effect(self, effect_name: str) -> bool: ...
    def list_effects(self) -> list[str]: ...
    def write_effect(self, effect_dict: dict[str, Incomplete]) -> bool: ...
    def effect_exists(self, effect_name: str) -> bool: ...
    def pulsate(self, rgb: tuple[int, int, int], speed: float = 1) -> bool: ...
    def flow(self, rgb_list: list[tuple[int, int, int]], speed: float = 1) -> bool: ...
    def spectrum(self, speed: float = 1) -> bool: ...
    def enable_extcontrol(self) -> bool: ...
    def get_layout(self) -> dict[str, Incomplete]: ...
    def register_event(self, func: Callable[[dict[str, Incomplete]], Any], event_types: list[int]) -> None: ...

class NanoleafRegistrationError(Exception):
    def __init__(self) -> None: ...

class NanoleafConnectionError(Exception):
    def __init__(self) -> None: ...

class NanoleafEffectCreationError(Exception): ...
