"""cocotb tests for the synchronous FIFO.

Directed tests  = hand-written scenarios for known corner cases.
Random tests    = thousands of random cycles with different "personalities"
                  (write-heavy, read-heavy, bursty ...). The scoreboard checks
                  EVERY cycle, so a random test needs no hand-written expected values.
"""
import cocotb
from tb import FifoTB, DEPTH, WIDTH, write_coverage_report

MAXV = (1 << WIDTH) - 1


async def setup(dut):
    tb = FifoTB(dut)
    await tb.start()
    return tb


# ------------------------------- directed -----------------------------------
@cocotb.test()
async def test_reset_state(dut):
    """After reset: empty, not full, count 0, rdata 0."""
    tb = await setup(dut)
    await tb.idle(3)
    assert tb.model.empty and int(dut.empty.value) == 1
    write_coverage_report()


@cocotb.test()
async def test_single_write_read(dut):
    """Write one word, read it back."""
    tb = await setup(dut)
    await tb.cycle(wr=1, wdata=0xA5)
    await tb.cycle(rd=1)
    await tb.idle(2)
    assert int(dut.rdata.value) == 0xA5
    write_coverage_report()


@cocotb.test()
async def test_fill_then_drain(dut):
    """Fill completely, drain completely, repeat 4 times (forces pointer wrap-around)."""
    tb = await setup(dut)
    for rnd in range(4):
        for i in range(DEPTH):
            await tb.cycle(wr=1, wdata=(rnd * 37 + i * 11 + 1) & MAXV)
        assert int(dut.full.value) == 1
        for _ in range(DEPTH):
            await tb.cycle(rd=1)
        await tb.idle(1)
        assert int(dut.empty.value) == 1
    write_coverage_report()


@cocotb.test()
async def test_overflow_attempts(dut):
    """Keep writing into a FULL fifo: the extra data must be dropped, contents intact."""
    tb = await setup(dut)
    for i in range(DEPTH):
        await tb.cycle(wr=1, wdata=i + 1)
    for i in range(5):                                   # 5 illegal writes
        await tb.cycle(wr=1, wdata=0xEE)
    for _ in range(DEPTH):                               # contents must be 1..DEPTH
        await tb.cycle(rd=1)
    await tb.idle(1)
    write_coverage_report()


@cocotb.test()
async def test_underflow_attempts(dut):
    """Keep reading from an EMPTY fifo: nothing may change."""
    tb = await setup(dut)
    await tb.cycle(wr=1, wdata=0x3C)
    await tb.cycle(rd=1)
    for _ in range(5):
        await tb.cycle(rd=1)
    await tb.idle(1)
    write_coverage_report()


@cocotb.test()
async def test_simultaneous_rw_all_states(dut):
    """Read+write on the same edge when empty, half-full and full."""
    tb = await setup(dut)
    await tb.cycle(wr=1, rd=1, wdata=0x11)               # empty: write accepted, read ignored
    await tb.cycle(wr=1, rd=1, wdata=0x22)               # 1 word: both accepted
    for i in range(DEPTH):                               # now fill to full
        await tb.cycle(wr=1, wdata=0x30 + i)
    await tb.cycle(wr=1, rd=1, wdata=0x99)               # full: read accepted, write REFUSED
    await tb.cycle(wr=1, rd=1, wdata=0x98)               # now 1 slot free: both accepted
    await tb.idle(2)
    write_coverage_report()


@cocotb.test()
async def test_reset_midway(dut):
    """Reset when empty, when half full and when full; FIFO must be empty afterwards."""
    tb = await setup(dut)
    await tb.cycle(rst_n=0)                              # reset while empty
    for i in range(5):
        await tb.cycle(wr=1, wdata=i + 1)
    await tb.cycle(rst_n=0)                              # reset while partially full
    await tb.idle(2)
    for i in range(DEPTH):
        await tb.cycle(wr=1, wdata=i + 1)
    await tb.cycle(rst_n=0)                              # reset while full
    await tb.idle(2)
    await tb.cycle(wr=1, wdata=0x77)                     # still works afterwards
    await tb.cycle(rd=1)
    await tb.idle(2)
    write_coverage_report()


# ------------------------------- random -------------------------------------
async def random_run(tb, cycles, p_wr, p_rd, p_reset=0.0):
    r = tb.rng
    for _ in range(cycles):
        await tb.cycle(wr=int(r.random() < p_wr), wdata=tb.rand_data(),
                       rd=int(r.random() < p_rd), rst_n=int(r.random() >= p_reset))


@cocotb.test()
async def test_random_balanced(dut):
    tb = await setup(dut)
    await random_run(tb, 4000, 0.5, 0.5)
    write_coverage_report()


@cocotb.test()
async def test_random_write_heavy(dut):
    """Mostly writes -> the FIFO sits near full a lot."""
    tb = await setup(dut)
    await random_run(tb, 4000, 0.9, 0.2)
    write_coverage_report()


@cocotb.test()
async def test_random_read_heavy(dut):
    """Mostly reads -> the FIFO sits near empty a lot."""
    tb = await setup(dut)
    await random_run(tb, 4000, 0.2, 0.9)
    write_coverage_report()


@cocotb.test()
async def test_random_bursty(dut):
    """Alternate long write bursts and long read bursts (swings between full and empty)."""
    tb = await setup(dut)
    for phase in range(40):
        if phase % 2 == 0:
            await random_run(tb, 60, 0.95, 0.05)
        else:
            await random_run(tb, 60, 0.05, 0.95)
    write_coverage_report()


@cocotb.test()
async def test_random_with_resets(dut):
    """Random traffic with occasional resets thrown in (0.5% of cycles)."""
    tb = await setup(dut)
    await random_run(tb, 4000, 0.6, 0.5, p_reset=0.005)
    write_coverage_report()
