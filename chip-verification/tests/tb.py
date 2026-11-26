"""Testbench infrastructure: driver + monitor + scoreboard + assertions.

Timing convention (important, it avoids all race conditions):
  * Inputs are driven at the FALLING clock edge  (mid-cycle, away from the active edge).
  * Outputs are sampled at the next FALLING edge (after the DUT has settled
    from the rising edge in between).
So one call to cycle():   drive inputs -> [rising edge happens] -> wait falling edge -> check.
"""
import os
import random
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model"))
import cocotb
from cocotb.clock import Clock
from cocotb.triggers import FallingEdge

from fifo_model import FifoModel
from coverage import Coverage

WIDTH = int(os.environ.get("FIFO_WIDTH", 8))
DEPTH = int(os.environ.get("FIFO_DEPTH", 16))
SEED = int(os.environ.get("SEED", 1))

# One coverage object shared by every test of the run -> cumulative coverage.
COV = Coverage(DEPTH, WIDTH)


def to_int(handle):
    """Read a signal as int; return None if it holds X/Z (unknown)."""
    try:
        return int(handle.value)
    except ValueError:
        return None


class FifoTB:
    def __init__(self, dut):
        self.dut = dut
        self.model = FifoModel(DEPTH, WIDTH)
        self.cycle_no = 0
        self.history = []          # last few input vectors, printed on failure
        self.rng = random.Random(SEED)

    # ---- driver ------------------------------------------------------------
    async def start(self):
        # Drive known inputs FIRST, then start the clock LOW, so that the very first
        # rising edge (t=5ns) already sees rst_n=0 and clean inputs (no start-up race at t=0).
        self.dut.rst_n.value = 0
        self.dut.wr_en.value = 0
        self.dut.rd_en.value = 0
        self.dut.wdata.value = 0
        cocotb.start_soon(Clock(self.dut.clk, 10, unit="ns").start(start_high=False))
        await FallingEdge(self.dut.clk)
        for _ in range(3):                      # hold reset for 3 clock edges
            await self.cycle(rst_n=0)

    async def cycle(self, wr=0, wdata=0, rd=0, rst_n=1):
        """Apply one clock cycle of stimulus, then check the DUT against the model."""
        d = self.dut
        d.rst_n.value, d.wr_en.value, d.wdata.value, d.rd_en.value = rst_n, wr, wdata, rd
        ev = self.model.step(rst_n, wr, wdata, rd)          # predict what should happen
        COV.sample(ev, self.model.writes, self.model.reads)  # record the situation
        self.history = (self.history + [(rst_n, wr, wdata, rd)])[-6:]
        self.cycle_no += 1
        await FallingEdge(d.clk)                             # rising edge happens in between
        self.check()

    # ---- monitor + assertions + scoreboard ---------------------------------
    def check(self):
        d, m = self.dut, self.model
        full, empty, count, rdata = (to_int(d.full), to_int(d.empty),
                                     to_int(d.count), to_int(d.rdata))
        ctx = f"cycle {self.cycle_no}, last inputs (rst_n,wr,wdata,rd)={self.history}"

        # (a) No unknowns: after reset every output must be a clean 0/1.
        for name, v in (("full", full), ("empty", empty), ("count", count), ("rdata", rdata)):
            assert v is not None, f"ASSERT X_ON_OUTPUT: {name} is X/Z at {ctx}"

        # (b) Protocol assertions: rules that must hold regardless of the model.
        assert not (full and empty), f"ASSERT FULL_AND_EMPTY: both flags set at {ctx}"
        assert 0 <= count <= DEPTH, f"ASSERT COUNT_RANGE: count={count} at {ctx}"

        # (c) Scoreboard: DUT must equal the reference model.
        assert full == int(m.full), f"SCOREBOARD full: dut={full} exp={int(m.full)} at {ctx}"
        assert empty == int(m.empty), f"SCOREBOARD empty: dut={empty} exp={int(m.empty)} at {ctx}"
        assert count == m.count, f"SCOREBOARD count: dut={count} exp={m.count} at {ctx}"
        assert rdata == m.rdata, f"SCOREBOARD rdata: dut={rdata:#x} exp={m.rdata:#x} at {ctx}"

    # ---- helpers for writing tests -----------------------------------------
    def rand_data(self):
        """Mostly uniform random data, but 10% corner values (0, all-ones, 0x55, 0xAA)."""
        r = self.rng
        if r.random() < 0.10:
            return r.choice([0, (1 << WIDTH) - 1, int("01" * WIDTH, 2) & ((1 << WIDTH) - 1),
                             int("10" * WIDTH, 2) & ((1 << WIDTH) - 1)])
        return r.getrandbits(WIDTH)

    async def idle(self, n=1):
        for _ in range(n):
            await self.cycle()


def write_coverage_report():
    """Cumulative coverage so far. Mutant runs set COV_DIR so they never overwrite the official report."""
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.environ.get("COV_DIR") or os.path.join(here, "..", "coverage")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "coverage_report.txt"), "w") as f:
        f.write(COV.report() + "\n")
