from collections.abc import Callable
from datetime import date
from datetime import datetime as datetime
from typing import Any, SupportsInt

from django import template

register: template.Library

def ordinal(value: str | SupportsInt | None) -> str | None: ...
def intcomma(value: str | SupportsInt | None, use_l10n: bool = ...) -> str: ...

intword_converters: tuple[tuple[int, Callable[..., Any]]]

def intword(value: str | SupportsInt | None) -> int | str | None: ...
def apnumber(value: str | SupportsInt | None) -> int | str | None: ...
def naturalday(value: date | str | None, arg: None = ...) -> str | None: ...
def naturaltime(value: datetime) -> str: ...

class NaturalTimeFormatter:
    time_strings: dict[str, str]
    past_substrings: dict[str, str]
    future_substrings: dict[str, str]
    @classmethod
    def string_for(cls, value: Any) -> Any: ...
