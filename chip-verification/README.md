# Synchronous FIFO: constrained-random verification environment

A verification environment (cocotb + Icarus Verilog) for a parameterised synchronous FIFO,
built the way chip-verification teams do it, with every component of a UVM-style testbench:

| Component | File | Role |
|---|---|---|
| DUT | `rtl/fifo.v` | The design under test |
| Reference model | `model/fifo_model.py` | Behavioural golden model (plain Python) |
| Driver / monitor / scoreboard / assertions | `tests/tb.py` | Drives stimulus, compares DUT vs model **every cycle** |
| Functional coverage | `model/coverage.py` | 40 bins: state x operation cross, occupancy levels, wrap-around, resets, data corners |
| Tests | `tests/test_fifo.py` | 7 directed + 5 constrained-random tests |
| Mutation testing | `run_mutants.py`, `tools/mutants.py` | Injects 12 realistic bugs, checks the environment catches each one |

## Results
* Regression on clean RTL: **12/12 tests pass, 100% functional coverage (40/40 bins)**
* Mutation testing: **12/12 injected bugs caught**, see [`results/mutation_report.md`](results/mutation_report.md)

## Run
```bash
sudo apt-get install iverilog && pip install cocotb pytest
python3 run_tests.py            # regression + coverage report (coverage/coverage_report.txt)
python3 run_tests.py --waves    # also dump a waveform for GTKWave
python3 run_mutants.py          # inject every bug, regenerate results/mutation_report.md
```
A step-by-step explanation (Hebrew) is in [`GUIDE.he.md`](GUIDE.he.md).
