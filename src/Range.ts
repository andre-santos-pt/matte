export default class Range {
    public start: number;
    public end: number;
    public line: number;
    public column: number;
    public text: string;
    /**
     * @param startOffset Absolute character index (start)
     * @param endOffset Absolute character index (end)
     * @param line The starting line number
     * @param column The starting column index
     * @param text
     */
    constructor(
        startOffset: number,
        endOffset: number,
        line: number,
        column: number,
        text: string
    ) {
        this.start = startOffset;
        this.end = endOffset;
        this.line = line;
        this.column = column;
        this.text = text;
    }

    isEqual(range: Range): boolean {
        return (
            this.start === range.start &&
            this.end === range.end &&
            this.line === range.line &&
            this.column === range.column
        );
    }

    get length(): number {
        return this.end - this.start;
    }

    contains(offset: number): boolean {
        return offset >= this.start && offset <= this.end;
    }
}
