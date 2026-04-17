import pc from "picocolors";

type Colorizer = (text: string) => string;
type Cell = string | { text: string; color: Colorizer };

function normalizeCell(cell: Cell): { text: string; color?: Colorizer } {
  return typeof cell === "string" ? { text: cell } : cell;
}

export function heading(text: string) {
  console.log(`  ${pc.bold(text)}`);
}

export function label(key: string, value: string) {
  console.log(`  ${pc.dim(key.padEnd(10))}  ${value}`);
}

export function table(headers: string[], rows: Cell[][]) {
  const normalized = rows.map((row) => row.map(normalizeCell));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...normalized.map((row) => row[index]?.text.length ?? 0))
  );

  console.log(`    ${headers.map((header, index) => pc.dim(header.padEnd(widths[index]))).join("  ")}`);

  for (const row of normalized) {
    const cells = headers.map((_, index) => {
      const cell = row[index] ?? { text: "" };
      const padded = cell.text.padEnd(widths[index]);
      return cell.color ? cell.color(padded) : padded;
    });
    console.log(`    ${cells.join("  ")}`);
  }
}

export function success(text: string) {
  console.log(`  ${pc.green(pc.bold(text))}`);
}

export function warning(text: string) {
  console.log(`  ${pc.yellow(text)}`);
}

export function value(text: string) {
  console.log(`  ${text}`);
}

export function dim(text: string) {
  console.log(`  ${pc.dim(text)}`);
}

export function blank() {
  console.log();
}
