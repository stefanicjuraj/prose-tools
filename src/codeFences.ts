/** Line-start fenced blocks (``` ... ```). Returns half-open [start, end) offsets in full text. */
export function codeFenceRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const lines = text.split("\n");
  let offset = 0;
  let fenceStart = -1;
  for (const line of lines) {
    const m = line.match(/^\s*(```+)/);
    if (m && m[1].length >= 3) {
      if (fenceStart < 0) {
        fenceStart = offset + line.indexOf(m[1]);
      } else {
        ranges.push([fenceStart, offset + line.length]);
        fenceStart = -1;
      }
    }
    offset += line.length + 1;
  }
  return ranges;
}

export function offsetInsideRanges(offset: number, ranges: [number, number][]): boolean {
  for (const [a, b] of ranges) {
    if (offset >= a && offset < b) {
      return true;
    }
  }
  return false;
}
