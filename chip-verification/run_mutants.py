#!/usr/bin/env python3
"""Mutation testing: inject each bug into the RTL, run the whole regression, see if it is caught.

A good verification environment catches (kills) every mutant. A mutant that SURVIVES
means the tests have a blind spot -> that is the valuable information.
"""
import re, sys, xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "tools"))
from mutants import MUTANTS
import run_tests

ROOT = Path(__file__).parent.resolve()


def first_failure(xml_path):
    """Return (first failing test name, scoreboard/assert message, list of all failing tests)."""
    failing = []
    for tc in ET.parse(xml_path).getroot().iter("testcase"):
        f = tc.find("failure")
        if f is None: f = tc.find("error")
        if f is not None:
            msg = f.get("message") or (f.text or "")
            m = re.search(r"(ASSERT \w+|SCOREBOARD \w+)[^\n]*?at cycle (\d+)", msg + " " + (f.text or ""))
            failing.append((tc.get("name"), m.group(1) if m else (msg.strip().splitlines() or ["?"])[0][:60],
                            int(m.group(2)) if m else None))
    return failing


def main():
    src = (ROOT / "rtl" / "fifo.v").read_text()
    print("== baseline (clean RTL) ==")
    n, failed, _ = run_tests.run(build_dir=ROOT / "sim_build" / "clean")  # writes the official coverage report
    if failed:
        sys.exit("Baseline fails! Fix the clean design/tests before mutation testing.")
    rows = []
    for mid, title, why, old, new in MUTANTS:
        pairs = old if isinstance(old, list) else [(old, new)]
        text = src
        for o, nw in pairs:
            assert text.count(o) == 1, f"{mid}: pattern must occur exactly once, found {text.count(o)}: {o!r}"
            text = text.replace(o, nw)
        d = ROOT / "sim_build" / mid
        d.mkdir(parents=True, exist_ok=True)
        mutant_rtl = d / "fifo.v"
        mutant_rtl.write_text(text)
        n, failed, xml = run_tests.run(rtl=mutant_rtl, build_dir=d, cov_dir=d)
        fails = first_failure(xml)
        rows.append((mid, title, failed, n, fails))
        print(f"{mid}: {'CAUGHT' if failed else 'SURVIVED'} ({failed}/{n} tests failed)")

    caught = sum(1 for r in rows if r[2])
    out = ["# Mutation testing report", "",
           f"**{caught} of {len(rows)} injected bugs caught** "
           f"({100*caught/len(rows):.0f}% mutation score).", "",
           "| Bug | Description | Caught? | Tests that failed | First detection (by) | Cycle |",
           "|---|---|---|---|---|---|"]
    for mid, title, failed, n, fails in rows:
        if failed:
            first = min(fails, key=lambda x: x[2] if x[2] is not None else 10**9)
            out.append(f"| {mid} | {title} | yes | {failed}/{n} | {first[1]} | {first[2]} |")
        else:
            out.append(f"| {mid} | {title} | **NO (survived)** | 0/{n} | - | - |")
    (ROOT / "results").mkdir(exist_ok=True)
    (ROOT / "results" / "mutation_report.md").write_text("\n".join(out) + "\n")
    print("\n" + "\n".join(out))
    sys.exit(0 if caught == len(rows) else 1)


if __name__ == "__main__":
    main()
