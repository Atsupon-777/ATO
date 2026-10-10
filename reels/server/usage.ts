// Per-job cost ledger. Every paid call records what it used, so billing (tokens) can be checked
// against real cost and so a job can show its price before and after it runs.

export type UsageLine = { step: string; model: string; units: string; usd: number };

export class Usage {
  lines: UsageLine[] = [];
  add(line: UsageLine) {
    this.lines.push(line);
  }
  get totalUsd() {
    return this.lines.reduce((a, l) => a + l.usd, 0);
  }
  toJSON() {
    return { totalUsd: Number(this.totalUsd.toFixed(4)), lines: this.lines };
  }
}
