"""Functional coverage: a checklist of situations we WANT the tests to reach.

Code coverage tells you which lines ran. Functional coverage answers a harder
question: did we ever see the *interesting situations* (FIFO full while
writing, simultaneous read+write on an empty FIFO, pointer wrap-around ...)?
Each "bin" below is one situation; a bin is hit once the situation occurred.
"""


class Coverage:
    def __init__(self, depth, width):
        self.depth = depth
        self.bins = {}
        # 1) state x operation cross: 3 states x 4 operations = 12 bins
        for s in ("empty", "mid", "full"):
            for op in ("idle", "wr", "rd", "wr+rd"):
                self.bins[f"cross/{s}/{op}"] = 0
        # 2) every possible occupancy level 0..DEPTH
        for c in range(depth + 1):
            self.bins[f"count/{c}"] = 0
        # 3) pointer wrap-around (a classic place for off-by-one bugs)
        for n in ("write_ptr_wraps_once", "read_ptr_wraps_once",
                  "write_ptr_wraps_full_cycle", "read_ptr_wraps_full_cycle"):
            self.bins[f"wrap/{n}"] = 0
        # 4) reset in interesting states
        for n in ("empty", "mid", "full"):
            self.bins[f"reset_when/{n}"] = 0
        # 5) data corner values
        for n in ("all_zeros", "all_ones", "alternating_01", "alternating_10"):
            self.bins[f"data/{n}"] = 0
        self._ones = (1 << width) - 1
        self._a01 = int("01" * (width // 2 + 1), 2) & self._ones
        self._a10 = int("10" * (width // 2 + 1), 2) & self._ones

    def _hit(self, name):
        self.bins[name] += 1

    def sample(self, ev, writes_total, reads_total):
        """Called once per clock edge with the event dict from FifoModel.step()."""
        d = self.depth
        state = "empty" if ev["was_empty"] else "full" if ev["was_full"] else "mid"
        if ev["rst"]:
            self._hit(f"reset_when/{state}")
            return
        op = {(0, 0): "idle", (1, 0): "wr", (0, 1): "rd", (1, 1): "wr+rd"}[
            (int(ev["wr_en"]), int(ev["rd_en"]))]
        self._hit(f"cross/{state}/{op}")
        self._hit(f"count/{ev['count_before']}")
        if ev["wrote"]:
            w = ev["wdata"]
            if w == 0: self._hit("data/all_zeros")
            if w == self._ones: self._hit("data/all_ones")
            if w == self._a01: self._hit("data/alternating_01")
            if w == self._a10: self._hit("data/alternating_10")
        if writes_total >= d and ev["wrote"]: self._hit("wrap/write_ptr_wraps_once")
        if reads_total >= d and ev["read"]: self._hit("wrap/read_ptr_wraps_once")
        if writes_total >= 2 * d and ev["wrote"]: self._hit("wrap/write_ptr_wraps_full_cycle")
        if reads_total >= 2 * d and ev["read"]: self._hit("wrap/read_ptr_wraps_full_cycle")

    def percent(self):
        hit = sum(1 for v in self.bins.values() if v)
        return 100.0 * hit / len(self.bins), hit, len(self.bins)

    def report(self):
        pct, hit, total = self.percent()
        lines = [f"Functional coverage: {pct:.1f}%  ({hit}/{total} bins)", ""]
        groups = {}
        for name, v in self.bins.items():
            groups.setdefault(name.split("/")[0], []).append((name, v))
        for g, items in groups.items():
            h = sum(1 for _, v in items if v)
            lines.append(f"[{g}]  {h}/{len(items)}")
            for name, v in items:
                lines.append(f"   {'HIT ' if v else 'MISS'}  {name:<38} {v}")
        return "\n".join(lines)
