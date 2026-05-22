import Range from "./Range";




export class Program {
    block: BlockStatement;
    constructor(block: BlockStatement) {
        this.block = block;
    }
}

export abstract class ASTNode {
    range?: Range;
    constructor(range?: Range) { this.range = range; }
}

export abstract class Statement extends ASTNode { }

export class Declaration extends Statement {
    name: string;
    initializer: Expression | null;
    constructor(range: Range, name: string, initializer: Expression | null) {
        super(range);
        this.name = name;
        this.initializer = initializer;
    }
}

export class Assignment extends Statement {
    variable: Declaration;
    expression: Expression;
    constructor(range: Range, variable: Declaration, value: Expression) {
        super(range);
        this.variable = variable;
        this.expression = value;
    }
}

export class BlockStatement extends Statement {
    statements: Statement[];
    constructor(range: Range, statements: Statement[]) {
        super(range);
        this.statements = statements;
    }
}

export class IfStatement extends Statement {
    guard: Expression;
    thenBranch: Statement;
    elseBranch?: Statement;

    constructor(range: Range, condition: Expression, thenBranch: Statement, elseBranch: Statement | undefined) {
        super(range);
        this.guard = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
    }
}

export class WhileStatement extends Statement {
    guard: Expression;
    body: Statement;

    constructor(range: Range, condition: Expression, body: Statement) {
        super(range);
        this.guard = condition;
        this.body = body;
    }
}


// TODO : DoubleLiteral, CharLiteral

export abstract class Expression extends ASTNode { }

export abstract class Literal extends Expression {}

export class IntLiteral extends Literal {
    value: number;
    constructor(range: Range, value: number) {
        super(range);
        this.value = value;
    }
}

export class StringLiteral extends Literal {
    value: string;
    constructor(range: Range, value: string) {
        super(range);
        this.value = value;
    }
}

export class BooleanLiteral extends Literal {
    value: boolean;
    constructor(range: Range, value: boolean) {
        super(range);
        this.value = value;
    }
}

export class Variable extends Expression {
    declaration: Declaration;
    constructor(range: Range, declaration: Declaration) {
        super(range);
        this.declaration = declaration;
    }
}

export class UnaryExpression extends Expression {
    operator: string;
    expression: Expression;
    constructor(range: Range, operator: string, expression: Expression) {
        super(range);
        this.operator = operator;
        this.expression = expression;
    }
}

export class BinaryExpression extends Expression {
    operator: string;
    left: Expression;
    right: Expression;
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        super(range);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}




