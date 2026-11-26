# Mutation testing report

**12 of 12 injected bugs caught** (100% mutation score).

| Bug | Description | Caught? | Tests that failed | First detection (by) | Cycle |
|---|---|---|---|---|---|
| B01 | Read pointer not reset | yes | 10/12 | ASSERT COUNT_RANGE | 1 |
| B02 | rdata not reset | yes | 10/12 | SCOREBOARD rdata | 1 |
| B03 | full flag asserts one word early | yes | 8/12 | SCOREBOARD full | 18 |
| B04 | empty flag ignores the wrap bit | yes | 8/12 | ASSERT FULL_AND_EMPTY | 19 |
| B05 | count ignores the wrap bit | yes | 9/12 | SCOREBOARD count | 19 |
| B06 | overflow: write accepted when full | yes | 6/12 | ASSERT COUNT_RANGE | 20 |
| B07 | underflow: read accepted when empty | yes | 7/12 | SCOREBOARD empty | 4 |
| B08 | simultaneous read+write drops the write | yes | 6/12 | SCOREBOARD empty | 4 |
| B09 | read+write on an EMPTY fifo wrongly counts as a read | yes | 6/12 | SCOREBOARD empty | 4 |
| B10 | data corner case: all-ones word stored as zero | yes | 6/12 | SCOREBOARD rdata | 123 |
| B11 | wrong word returned when full | yes | 7/12 | SCOREBOARD rdata | 20 |
| B12 | write pointer wrap bug | yes | 6/12 | ASSERT COUNT_RANGE | 52 |
