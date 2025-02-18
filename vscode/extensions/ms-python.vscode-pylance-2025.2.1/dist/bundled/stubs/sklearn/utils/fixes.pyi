# Version-based re-exports
from numpy.exceptions import ComplexWarning as ComplexWarning, VisibleDeprecationWarning as VisibleDeprecationWarning
from scipy.integrate import trapezoid as trapezoid
from scipy.optimize._linesearch import line_search_wolfe1 as line_search_wolfe1, line_search_wolfe2 as line_search_wolfe2
from scipy.sparse.csgraph import laplacian as laplacian

np_version = ...
np_base_version = ...
sp_version = ...
sp_base_version = ...
CSR_CONTAINERS = ...
CSC_CONTAINERS = ...
COO_CONTAINERS = ...
LIL_CONTAINERS = ...
DOK_CONTAINERS = ...
BSR_CONTAINERS = ...
DIA_CONTAINERS = ...
SPARRAY_PRESENT: bool
SPARSE_ARRAY_PRESENT: bool
percentile = ...

def pd_fillna(pd, frame): ...
def tarfile_extractall(tarfile, path) -> None: ...
