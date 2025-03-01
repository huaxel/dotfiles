from typing import Protocol

from setuptools.dist import Distribution

from .._distutils.command.build import build as _build

class build(_build):
    distribution: Distribution  # override distutils.dist.Distribution with setuptools.dist.Distribution

class SubCommand(Protocol):
    editable_mode: bool
    build_lib: str
    def initialize_options(self) -> None: ...
    def finalize_options(self) -> None: ...
    def run(self) -> None: ...
    def get_source_files(self) -> list[str]: ...
    def get_outputs(self) -> list[str]: ...
    def get_output_mapping(self) -> dict[str, str]: ...
