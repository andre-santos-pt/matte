import {CommonTokenStream, ErrorListener, Recognizer, Token} from "antlr4";
import {StaticError, StaticErrorType} from "./ast";
import Range from "./Range";
import JavaGrammarParser from "./generated/JavaGrammarParser";

export class MatteErrorListener extends ErrorListener<any> {
    input: string

    constructor(input: string) {
        super();
        this.input = input
    }

    errors: StaticError[] = []

    override syntaxError(
        recognizer: Recognizer<any>,
        token: any,
        line: number,
        column: number,
        msg: string,
        e: Error | undefined
    ): void {
        const isMissingToken = msg.startsWith("missing ");
        if (isMissingToken) {
            let startOffset: number;
            let stopOffset: number;
            let errorLine = line;
            let errorColumn = column;

            const parser = recognizer as any;
            const tokens = parser.getInputStream(); // CommonTokenStream

            // 2. Find the index of the current offending token
            const currentIndex = token.tokenIndex;

            // 3. Look backward for the previous token (skipping hidden tokens like whitespace/comments)
            let prevToken = null;
            if (currentIndex > 0) {
                prevToken = tokens.get(currentIndex - 1);
            }

            if (prevToken) {
                // Place the error right at the end index of the previous token
                startOffset = prevToken.start;
                stopOffset = prevToken.stop + 1;

                // Optional: Adjust line/column numbers to match the end of the previous token
                errorLine = prevToken.line;
                // Calculate column safely: previous token's start column + its text length
                errorColumn = prevToken.column + (prevToken.text ? prevToken.text.length : 0);
            } else {
                // Fallback if there is no previous token (e.g., missing token at the very start of the file)
                startOffset = token.start;
                stopOffset = token.start;
            }
            this.errors.push({
                type: StaticErrorType.SyntaxError,
                message: msg.substring(0, msg.indexOf("at")) + "here",
                range: new Range(
                    startOffset,
                    stopOffset,
                    errorLine,
                    errorColumn,
                    ""
                )
            });
        } else if (token) {
            // if (token.text == "<EOF>") {
            //     const bracketErrors = this.checkBracketMatching(recognizer)
            //     if (bracketErrors.length != 0) {
            //         this.errors.push(bracketErrors[0])
            //         return
            //     }
            // }
            this.errors.push({
                type: StaticErrorType.SyntaxError,
                message: msg,
                range: new Range(
                    token.start,
                    token.stop + 1,
                    token.line,
                    token.column,
                    token.text
                )
            });
        } else {
            const offset = this.getOffsetFromLineCol(line, column)
            this.errors.push({
                type: StaticErrorType.TokenError,
                message: msg,
                range: new Range(
                    offset,
                    offset + 1,
                    line,
                    column,
                    msg
                )
            });
        }
    }


    getOffsetFromLineCol(line: number, column: number): number {
        // ANTLR lines are 1-based. If it's less than 1, default to the start of the file.
        if (line < 1) return 0;

        // Split by regex to capture both \n (Unix) and \r\n (Windows) line endings
        const lines = this.input.split(/\r?\n/);

        let offset = 0;

        // Sum the characters of all full lines before the target line
        // (Limiting i < line - 1 ensures we stop right before our target line)
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
            // Add the length of the line text
            offset += lines[i].length;

            // Add the length of the newline character(s) that were removed by split()
            // We look at the original input to see if it was \r\n or just \n
            const hasWindowsNewline = this.input[offset] === '\r';
            offset += hasWindowsNewline ? 2 : 1;
        }

        // Add the column offset (ANTLR columns are already 0-based)
        return offset + column;
    }

    checkErrors() {
        if (this.errors.length != 0)
            throw {
                compilation: this.errors[0].type,
                range: this.errors[0].range,
                message: this.errors[0].message
            }
    }



}

export function checkBracketMatching(tokens: CommonTokenStream): StaticError[] {
    // 1. Force the lazy token stream to populate its internal array completely
    tokens.fill();

    const stack: Token[] = [];
    const errors: StaticError[] = [];

    // 2. Define opening-to-closing token pairs based on your grammar IDs
    const pairs: Record<number, number> = {
        [JavaGrammarParser.LCURLY]: JavaGrammarParser.RCURLY,   // { : }
        [JavaGrammarParser.LPAREN]: JavaGrammarParser.RPAREN,   // ( : )
        [JavaGrammarParser.LBRACK]: JavaGrammarParser.RBRACK    // [ : ]
    };

    // Reverse lookup to detect closing brackets easily
    const closingTokenTypes = new Set(Object.values(pairs));

    for (let i = 0; i < tokens.size; i++) {
        const token = tokens.get(i)
        const type = token.type;

        // Case A: It's an opening bracket -> Push onto stack
        if (pairs[type] !== undefined) {
            stack.push(token);
        }
        // Case B: It's a closing bracket -> Validate it
        else if (closingTokenTypes.has(type)) {
            const lastOpenToken = stack.pop();

            // Error: Found a closing bracket with no matching open bracket
            if (!lastOpenToken) {
                errors.push({
                    message: `Unmatched closing bracket '${token.text}'`,
                    range: new Range(
                        token.start,
                        token.stop + 1,
                        token.line,
                        token.column,
                        token.text
                    ),
                    type: StaticErrorType.SyntaxError
                });
            }
            // Error: Mis-matched bracket types (e.g. { right next to a ) )
            else if (pairs[lastOpenToken.type] !== type) {
                errors.push({
                    message: `Mismatched bracket: expected closing ${JavaGrammarParser.literalNames[pairs[lastOpenToken.type]]} but found '${token.text}'`,
                    range: new Range(
                        token.start,
                        token.stop + 1,
                        token.line,
                        token.column,
                        token.text
                    ),
                    type: StaticErrorType.SyntaxError
                });
            }
        }
    }

    // Case C: Stack isn't empty after the loop -> Leftover unclosed opening brackets
    while (stack.length > 0) {
        const openToken = stack.pop()!;
        errors.push({
            message: `Unclosed bracket '${openToken.text}'`,
            range: new Range(
                openToken.start,
                openToken.stop + 1,
                openToken.line,
                openToken.column,
                openToken.text
            ),
            type: StaticErrorType.SyntaxError
        });
    }

    if (errors.length != 0)
        throw {
            compilation: errors[0].type,
            range: errors[0].range,
            message: errors[0].message
        }

    return errors;
}