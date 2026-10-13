"""The contract's own pure helpers, answering for the site's tests.

tests/unit/*.test.mjs run this with `python3 -I` and a JSON list of calls on stdin, so the TypeScript
copies of the contract's rules (lib/rules.ts), its clock (lib/clock.ts) and the in-memory contract's
rules() are compared with contracts/commission_clock.py itself, not with a description of it. A stub
stands in for the GenLayer runtime: nothing here touches a network or a model.
"""

import importlib.util
import json
import pathlib
import sys
import types


def _stub():
    stub = types.ModuleType("genlayer")

    class _Any:
        def __getattr__(self, n):
            return _Any()

        def __call__(self, *a, **k):
            return _Any()

        def __getitem__(self, n):
            return _Any()

    class _UserError(Exception):
        pass

    class _VM:
        UserError = _UserError
        Return = object
        Result = object

    class _Public:
        view = staticmethod(lambda f: f)

        class _Write:
            def __call__(self, f):
                return f

            payable = staticmethod(lambda f: f)

        write = _Write()

    class _EVM:
        @staticmethod
        def contract_interface(c):
            return c

    class _GL:
        vm = _VM()
        public = _Public()
        evm = _EVM()

        class Contract:
            pass

        def __getattr__(self, n):
            return _Any()

    class _T:
        def __init__(self, *a, **k):
            pass

        def __class_getitem__(cls, item):
            return cls

    stub.gl = _GL()
    stub.allow_storage = lambda c: c
    stub.Address = str
    stub.DynArray = _T
    stub.TreeMap = _T
    stub.u256 = int
    stub.u32 = int
    stub.u64 = int
    stub.i64 = int
    stub.__all__ = ["gl", "allow_storage", "Address", "DynArray", "TreeMap", "u256", "u32", "u64", "i64"]
    sys.modules["genlayer"] = stub


def _load():
    _stub()
    path = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "commission_clock.py"
    spec = importlib.util.spec_from_file_location("commission_clock", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cc = _load()

ALLOWED = {
    "_text_problem", "_url_problem", "_number_arg", "_steps_to_cap", "_cut_bps_for", "_cut_of",
}

CLOCK = {"_grace", "_charged", "_live", "_opens_in", "_late_terms", "_cap_after"}


def _commission(state):
    """A Commission row from the site's clock state (camelCase), the rest filled with what does not matter here."""
    return cc.Commission(
        studio_id="S1", client="0xc", maker="0xm", brief="", fee=int(state.get("fee", 0)),
        maker_seconds=state["makerSeconds"], client_seconds=state["clientSeconds"], step_seconds=state["stepSeconds"],
        cut_bps=state["cutBps"], max_cut_bps=state["maxCutBps"], status="active", holder=state["holder"],
        since=state["since"], handed_by=state["handedBy"], maker_used=state["makerUsed"], client_used=state["clientUsed"],
        requested_at=0, accepted_at=0, settled_at=0, n_messages=0, n_deliveries=0, last_url="", last_fp="",
        last_delivered_at=0, maker_late=0, cut_bps_total=0, maker_paid=0, client_paid=0, held=0,
    )


def _move(state, side, now, by):
    c = _commission(state)
    cc._move_to(c, side, now, by)
    return {"holder": c.holder, "since": c.since, "handedBy": c.handed_by, "makerUsed": c.maker_used,
            "clientUsed": c.client_used}


def answer(call):
    fn = call["fn"]
    args = call.get("args", [])
    if fn == "rules":
        return json.loads(cc.CommissionClock.rules(None))
    if fn == "const":
        value = getattr(cc, args[0])
        return str(value) if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2 ** 53 else value
    if fn == "_move_to":
        return _move(args[0], args[1], args[2], args[3])
    if fn in CLOCK:
        c = _commission(args[0])
        out = getattr(cc, fn)(c, *args[1:])
        return list(out) if isinstance(out, tuple) else out
    if fn not in ALLOWED:
        raise ValueError("not an allowed helper: " + fn)
    if fn == "_cut_of":
        return str(cc._cut_of(int(args[0]), args[1]))  # an integer of atto does not survive a JavaScript number
    out = getattr(cc, fn)(*args)
    return list(out) if isinstance(out, tuple) else out


def main():
    calls = json.loads(sys.stdin.read())
    results = []
    for call in calls:
        try:
            results.append({"ok": answer(call)})
        except Exception as e:  # a helper that raises is an answer too
            results.append({"error": type(e).__name__ + ": " + str(e)})
    sys.stdout.write(json.dumps(results))


main()
