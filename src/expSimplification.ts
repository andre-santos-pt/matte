import ts from "typescript";

type ExprNode =
    | { type: "Literal"; value: string }
    | { type: "Binary"; op: string; left: ExprNode; right: ExprNode };

const PRECEDENCE: Record<string, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
};

// 1. Lexer / Tokenizer
function tokenize(input: string): string[] {
    return input.match(/\d+(\.\d+)?|\+|\-|\*|\/|\(\vert{}\)/g) || [];
}

// 2. Parser
function parse(tokens: string[]): ExprNode {
    let pos = 0;

    function parsePrimary(): ExprNode {
        const token = tokens[pos++];
        if (token === "(") {
            const expr = parseExpression(0);
            pos++; // consume ')'
            return expr;
        }
        return { type: "Literal", value: token };
    }

    function parseExpression(minPrec: number): ExprNode {
        let left = parsePrimary();

        while (pos < tokens.length) {
            const op = tokens[pos];
            const prec = PRECEDENCE[op];
            if (!prec || prec < minPrec) break;

            pos++; // consume operator
            const right = parseExpression(prec + (op === "-" || op === "/" ? 1 : 0));
            left = { type: "Binary", op, left, right };
        }

        return left;
    }

    return parseExpression(0);
}

// 3. Serializer (Formats AST back to minimal expression string)
function format(node: ExprNode, parentOp?: string, isRightChild?: boolean): string {
    if (node.type === "Literal") return node.value;

    const currentPrec = PRECEDENCE[node.op];
    const parentPrec = parentOp ? PRECEDENCE[parentOp] : 0;

    let needsParens = false;

    if (parentPrec > currentPrec) {
        needsParens = true;
    } else if (parentPrec === currentPrec) {
        // Non-associative right child needs parens: 10 - (5 - 2)
        if (isRightChild && (parentOp === "-" || parentOp === "/")) {
            needsParens = true;
        }
    }

    const leftStr = format(node.left, node.op, false);
    const rightStr = format(node.right, node.op, true);
    const result = `${leftStr} ${node.op} ${rightStr}`;

    return needsParens ? `(${result})` : result;
}

export function simplifyExpression(code: string): string {
    const tokens = tokenize(code);
    const ast = parse(tokens);
    const simp = format(ast);
    return simp;
}


export function variableMaterialization(value: { evaluation?: any, materialization?: string }): string | undefined {
    if(!value.materialization || Array.isArray(value.evaluation) || typeof value.evaluation === 'object')
        return undefined
    else if(value.evaluation.toString() === value.materialization)
        return undefined
    else
        return simplifyExpression(value.materialization);
}



function isOne(node: ExprNode): boolean {
    return node.type === "Literal" && node.value === "1";
}

export function analyzeIncrementSequence(node: ExprNode): {
    matches: boolean;
    base?: ExprNode;
    incrementCount?: number;
} {
    let current: ExprNode = node;
    let count = 0;

    // Walk down the left spine of the binary addition tree
    while (current.type === "Binary") {
        // 1. Must be addition
        if (current.op !== "+") {
            return { matches: false };
        }

        // 2. The right operand must be literal 1
        if (!isOne(current.right)) {
            return { matches: false };
        }

        count++;
        current = current.left; // Move down to left child
    }

    // Must have at least one "+ 1" operation
    if (count === 0) {
        return { matches: false };
    }

    return {
        matches: true,
        base: current, // The root identifier/number being incremented (e.g. 'n' or '0')
        incrementCount: count,
    };
}

function check(exprString: string) {
    const ast = parse(tokenize(exprString));
    const result = analyzeIncrementSequence(ast);
    if (result.matches) {
        const baseStr = result.base?.type === "Literal" ? result.base.value : "COMPLEX";
        console.log(`✅ "${exprString}" => Base: '${baseStr}', Incs: +${result.incrementCount}`);
    } else {
        console.log(`❌ "${exprString}" => Does not match pattern`);
    }
}

// Test cases
// check("n + 1");             // ✅ Base: 'n', Incs: +1
// check("n + 1 + 1 + 1");     // ✅ Base: 'n', Incs: +3
// check("0 + 1 + 1");         // ✅ Base: '0', Incs: +2
// check("n + 1 + 2");         // ❌ (has + 2)
// check("n + 1 - 1");         // ❌ (has -)
// check("n * 1 + 1");         // ❌ (has *)
// check("(n + 1) + 1");       // ✅ Base: 'n', Incs: +2
// // Tests
// console.log(simplifyExpression("(((0 + 1) + 2) + 3)")); // 0 + 1 + 2 + 3
// console.log(simplifyExpression("(0 + 1) * 2"));         // (0 + 1) * 2
// console.log(simplifyExpression("10 - (5 - 2)"));        // 10 - (5 - 2)
// console.log(simplifyExpression("(10 - 5) - 2"));        // 10 - 5 - 2

//console.log(simplifyParens("(((0 + 1) * 2) + 3)")); // Output: 0 + 1 + 2 + 3;

//console.log(simplifyParens("(((0 - 1) + 1) + 1)")); // Output: 0 + 1 + 2 + 3;