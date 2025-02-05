from _typeshed import Incomplete
from collections.abc import Generator

from networkx.utils.backends import _dispatchable

def generate_pajek(G) -> Generator[Incomplete, None, None]: ...
def write_pajek(G, path, encoding: str = "UTF-8") -> None: ...
@_dispatchable
def read_pajek(path, encoding: str = "UTF-8"): ...
@_dispatchable
def parse_pajek(lines): ...
