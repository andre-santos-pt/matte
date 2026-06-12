import {ParserRuleContext, TerminalNode, Token} from "antlr4";

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

    /**
     * Static factory to create a range from an ANTLR Context
     */
    // static fromContext(ctx: ParserRuleContext): Range {
    //     const start = ctx.start.start;
    //     const end = (ctx.stop?.stop || start) + 1; // Handle cases where _stop might be undefined
    //
    //     return new Range(
    //         start,
    //         end,
    //         ctx.start.line,
    //         ctx.start.column,
    //         ctx.getText()
    //     );
    // }

    /**
     * Static factory to create a range from a single ANTLR Token
     */
    // static fromToken(token: Token): Range {
    //     return new Range(
    //         token.start,
    //         token.stop + 1,
    //         token.line,
    //         token.column,
    //         token.text
    //     );
    // }

    // static fromTerminal(node: TerminalNode): Range {
    //     return this.fromToken(node.symbol)
    // }

    // static fromTokenTo(from: Token, to: Token): Range {
    //     return new Range(
    //         from.start,
    //         to.stop + 1,
    //         from.line,
    //         to.column,
    //         "" // TODO
    //     );
    // }

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

    /**
     * Useful for applying the range to an input/textarea selection
     */
    applyToElement(
        element: HTMLInputElement | HTMLTextAreaElement | null
    ): void {
        if (element && typeof element.setSelectionRange === "function") {
            element.focus();
            element.setSelectionRange(this.start, this.end);
        }
    }

    contains(offset: number): boolean {
        return offset >= this.start && offset <= this.end;
    }
}
