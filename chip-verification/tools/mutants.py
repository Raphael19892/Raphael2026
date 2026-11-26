"""The injected bugs ("mutants").  Each one replaces ONE exact snippet of rtl/fifo.v.

Fields: id, short description, why it is a realistic bug, old text, new text.
(`old` may also be a list of (old, new) pairs, with new=None, to change several places at once.)
The runner checks that `old` occurs exactly once, so a mutant can never be silently a no-op.
"""
MUTANTS = [
    ("B01", "Read pointer not reset",
     "Forgot one register in the reset branch (classic copy/paste bug).",
     [("            rptr <= 0;\n", ""), ("reg [AW:0] rptr;", "reg [AW:0] rptr = 0;")]  # starts at 0, so only a MID-RUN reset exposes it
     , None),
    ("B02", "rdata not reset",
     "Output register missing from reset; stale data survives a mid-run reset.",
     [("            rdata <= 0;\n", ""), ("rdata,\n", "rdata = 0,\n")]
     , None),
    ("B03", "full flag asserts one word early",
     "Off-by-one in the full condition: the last slot is never usable.",
     "assign full  = (wptr[AW] != rptr[AW]) && (wptr[AW-1:0] == rptr[AW-1:0]);",
     "assign full  = (count == DEPTH-1);"),
    ("B04", "empty flag ignores the wrap bit",
     "Compares only the address bits, so a FULL fifo also looks EMPTY.",
     "assign empty = (wptr == rptr);",
     "assign empty = (wptr[AW-1:0] == rptr[AW-1:0]);"),
    ("B05", "count ignores the wrap bit",
     "count is computed from address bits only, so it reads 0 when full.",
     "assign count = wptr - rptr;",
     "assign count = wptr[AW-1:0] - rptr[AW-1:0];"),
    ("B06", "overflow: write accepted when full",
     "Missing '!full' guard: extra writes overwrite stored data.",
     "wire do_write = wr_en && !full;", "wire do_write = wr_en;"),
    ("B07", "underflow: read accepted when empty",
     "Missing '!empty' guard: the read pointer runs past the write pointer.",
     "wire do_read  = rd_en && !empty;", "wire do_read  = rd_en;"),
    ("B08", "simultaneous read+write drops the write",
     "Arbitration bug: when both happen on one edge the write is lost.",
     "wire do_write = wr_en && !full;", "wire do_write = wr_en && !full && !rd_en;"),
    ("B09", "read+write on an EMPTY fifo wrongly counts as a read",
     "Bypass logic that was half-implemented: pointer moves but no data valid.",
     "wire do_read  = rd_en && !empty;", "wire do_read  = rd_en && (!empty || wr_en);"),
    ("B10", "data corner case: all-ones word stored as zero",
     "Rare-data bug: only triggers for one specific data value (1 in 256).",
     "mem[wptr[AW-1:0]] <= wdata;",
     "mem[wptr[AW-1:0]] <= (wdata == {WIDTH{1'b1}}) ? {WIDTH{1'b0}} : wdata;"),
    ("B11", "wrong word returned when full",
     "Read mux bug that only appears in the full state.",
     "rdata <= mem[rptr[AW-1:0]];",
     "rdata <= full ? mem[rptr[AW-1:0] + 1'b1] : mem[rptr[AW-1:0]];"),
    ("B12", "write pointer wrap bug",
     "After a full 2*DEPTH writes the pointer wraps to 1 instead of 0 (long-run bug).",
     "wptr <= wptr + 1;",
     "wptr <= (wptr == 2*DEPTH-1) ? 1 : wptr + 1;"),
]
