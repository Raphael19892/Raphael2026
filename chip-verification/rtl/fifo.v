// ============================================================================
// Synchronous FIFO (first-in, first-out queue)  --  the DUT (Design Under Test)
//
// SPEC (this is the "contract" the verification environment checks):
//   * Everything happens on the rising edge of clk. rst_n is a synchronous,
//     active-low reset: while rst_n == 0 the FIFO is emptied and rdata = 0.
//   * A write is ACCEPTED  iff wr_en = 1 and the FIFO was NOT full  (before the edge).
//     A write to a full FIFO is silently ignored (the data is dropped).
//   * A read  is ACCEPTED  iff rd_en = 1 and the FIFO was NOT empty (before the edge).
//     A read from an empty FIFO is silently ignored (rdata keeps its old value).
//   * A read is registered: the data appears on rdata AFTER the clock edge
//     on which the read was accepted.
//   * Read and write may happen on the same edge; each one is judged against
//     the state BEFORE the edge (so a write to a full FIFO is still refused even
//     if a read happens at the same time).
//   * count = number of words stored, full = (count == DEPTH), empty = (count == 0).
// ============================================================================
module fifo #(
    parameter WIDTH = 8,     // bits per word
    parameter DEPTH = 16     // number of words; must be a power of 2 and >= 2
) (
    input  wire                 clk,
    input  wire                 rst_n,
    input  wire                 wr_en,
    input  wire [WIDTH-1:0]     wdata,
    input  wire                 rd_en,
    output reg  [WIDTH-1:0]     rdata,
    output wire                 full,
    output wire                 empty,
    output wire [$clog2(DEPTH):0] count
);
    localparam AW = $clog2(DEPTH);          // address bits, e.g. DEPTH=16 -> 4

    // Elaboration-time guard: the pointer scheme below needs a power-of-2 depth >= 2.
    initial if (DEPTH < 2 || (1 << AW) != DEPTH) begin
        $display("ERROR: fifo DEPTH=%0d must be a power of 2 and >= 2", DEPTH);
        $finish;
    end

    reg [WIDTH-1:0] mem [0:DEPTH-1];        // the storage array
    // Pointers have ONE EXTRA BIT (AW+1 bits). The lower AW bits address the
    // memory; the extra top bit flips every time a pointer wraps around.
    // That lets us tell "full" from "empty" (see the flag logic below).
    reg [AW:0] wptr;                        // where the next write goes
    reg [AW:0] rptr;                        // where the next read comes from

    assign count = wptr - rptr;
    assign empty = (wptr == rptr);
    assign full  = (wptr[AW] != rptr[AW]) && (wptr[AW-1:0] == rptr[AW-1:0]);

    wire do_write = wr_en && !full;
    wire do_read  = rd_en && !empty;

    always @(posedge clk) begin
        if (!rst_n) begin
            wptr <= 0;
            rptr <= 0;
            rdata <= 0;
        end else begin
            if (do_write) begin
                mem[wptr[AW-1:0]] <= wdata;
                wptr <= wptr + 1;
            end
            if (do_read) begin
                rdata <= mem[rptr[AW-1:0]];
                rptr <= rptr + 1;
            end
        end
    end
endmodule
