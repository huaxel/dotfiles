from typing import Any, Literal

from sympy.core.relational import Eq, Ne, Relational

def riccati_normal(w, x, b1, b2): ...
def riccati_inverse_normal(y, x, b1, b2, bp=...): ...
def riccati_reduced(eq, f, x) -> Literal[False]: ...
def linsolve_dict(eq, syms) -> dict[Any, Any]: ...
def match_riccati(eq, f, x) -> tuple[Literal[False], list[Any]] | tuple[Literal[True], list[Any]]: ...
def val_at_inf(num, den, x): ...
def check_necessary_conds(val_inf, muls) -> bool: ...
def inverse_transform_poly(num, den, x): ...
def limit_at_inf(num, den, x) -> Literal[0]: ...
def construct_c_case_1(num, den, x, pole) -> list[list[Any]]: ...
def construct_c_case_2(num, den, x, pole, mul) -> list[list[int]] | list[int]: ...
def construct_c_case_3() -> list[list[int]]: ...
def construct_c(num, den, x, poles, muls) -> list[Any]: ...
def construct_d_case_4(ser, N) -> list[list[int]] | list[int]: ...
def construct_d_case_5(ser) -> list[list[int]] | list[int]: ...
def construct_d_case_6(num, den, x) -> list[list[Any]]: ...
def construct_d(num, den, x, val_inf) -> list[list[int]] | list[int] | list[list[Any]]: ...
def rational_laurent_series(num, den, x, r, m, n) -> dict[Any, Any]: ...
def compute_m_ybar(x, poles, choice, N) -> tuple[Any, Any]: ...
def solve_aux_eq(numa, dena, numy, deny, x, m) -> tuple[Any, dict[Any, Any], Literal[True]] | tuple[Any, Any, Any]: ...
def remove_redundant_sols(sol1, sol2, x) -> None: ...
def get_gen_sol_from_part_sol(part_sols, a, x) -> list[Any]: ...
def solve_riccati(fx, x, b0, b1, b2, gensol=...) -> list[Eq | Any | Relational | Ne]: ...
