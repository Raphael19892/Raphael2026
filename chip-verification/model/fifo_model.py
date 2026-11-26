"""Reference model of the FIFO: a *behavioural* description in plain Python.

It implements the SPEC (see rtl/fifo.v) and nothing else: no pointers, no
memory array, no clock-level detail. Because it is built differently from the
RTL, an identical mistake in both is very unlikely. Whenever the scoreboard
sees DUT != model, one of the two is wrong, and we investigate.
"""
from collections import deque


class FifoModel:
    def __init__(self, depth, width):
        self.depth = depth
        self.mask = (1 << width) - 1
        self.q = deque()          # the words currently stored, oldest first
        self.rdata = 0            # value of the registered read-data output
        self.initialized = False  # becomes True after the first reset
        self.writes = 0           # total accepted writes since reset (for wrap-around coverage)
        self.reads = 0

    # -- outputs the DUT must show after the next clock edge ------------------
    @property
    def count(self):
        return len(self.q)

    @property
    def full(self):
        return len(self.q) == self.depth

    @property
    def empty(self):
        return len(self.q) == 0

    def step(self, rst_n, wr_en, wdata, rd_en):
        """Advance the model by ONE rising clock edge.

        Returns a dict describing what happened (used by the coverage collector).
        """
        ev = {
            "rst": not rst_n, "wr_en": bool(wr_en), "rd_en": bool(rd_en),
            "was_full": self.full, "was_empty": self.empty, "count_before": self.count,
            "wdata": wdata & self.mask, "wrote": False, "read": False,
        }
        if not rst_n:                              # synchronous reset
            self.q.clear()
            self.rdata = 0
            self.writes = self.reads = 0
            self.initialized = True
            return ev

        do_write = bool(wr_en) and not self.full   # judged on the state BEFORE the edge
        do_read = bool(rd_en) and not self.empty
        if do_read:
            self.rdata = self.q.popleft()          # read happens first: oldest word
            self.reads += 1
        if do_write:
            self.q.append(wdata & self.mask)
            self.writes += 1
        ev["wrote"], ev["read"] = do_write, do_read
        return ev
