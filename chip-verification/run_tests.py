#!/usr/bin/env python3
"""Run the full regression on the clean RTL.   Usage: python3 run_tests.py [--waves] [--seed N]"""
import argparse, os, sys
from pathlib import Path
from cocotb_tools.runner import get_runner, get_results

ROOT = Path(__file__).parent.resolve()


def run(rtl=None, build_dir=None, seed=1, waves=False, testcase=None, cov_dir=None):
    """Build + simulate. Returns (num_tests, num_failed, results_xml_path)."""
    rtl = rtl or ROOT / "rtl" / "fifo.v"
    build_dir = Path(build_dir or ROOT / "sim_build" / "clean")
    r = get_runner("icarus")
    r.build(sources=[rtl], hdl_toplevel="fifo", build_dir=build_dir, always=True, waves=waves,
            timescale=("1ns", "1ps"))
    xml = r.test(hdl_toplevel="fifo", test_module="test_fifo", build_dir=build_dir,
                 test_dir=ROOT / "tests", results_xml=str(build_dir / "results.xml"),
                 extra_env={"SEED": str(seed), **({"COV_DIR": str(cov_dir)} if cov_dir else {})}, waves=waves, testcase=testcase)
    n, failed = get_results(xml)
    return n, failed, xml


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--waves", action="store_true", help="dump waveform (open with GTKWave)")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    n, failed, xml = run(seed=a.seed, waves=a.waves)
    print(f"\n{n} tests, {failed} failed.  Coverage report: coverage/coverage_report.txt")
    sys.exit(1 if failed else 0)
