import Range from "./Range";



export class Program {
    block?: BlockStatement;
    procedures: Procedure[] = [];
    typeDeclarations: TypeDeclaration[] = [];
    constructor(block?: BlockStatement, procedures: Procedure[] = [], typeDeclarations: TypeDeclaration[] = []) {
        this.block = block;
        this.procedures = procedures;
        this.typeDeclarations = typeDeclarations;
    }
}

export abstract class ASTNode {
    range?: Range;
    constructor(range?: Range) { this.range = range; }
}

export class Procedure extends ASTNode {
    name: string;
    nameRange: Range | undefined;
    parameters: Declaration[];
    instance: boolean;
    returnType?: string;
    body?: BlockStatement;
    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, instance: boolean, parameters: Declaration[], returnType?: string, body?: BlockStatement) {
        super(range);
        if(instance && parameters.length == 0)
            throw new Error("Instance procedures must have at least one parameter (the instance)");
        this.name = name;
        this.nameRange = nameRange;
        this.parameters = parameters;
        this.instance = instance;
        this.returnType = returnType;
        this.body = body;
    }
}

export class TypeDeclaration {
    name: string;
    nameRange: Range;
    isRecord: boolean;
    fields: Declaration[];
    constructor(name: string, nameRange: Range, isRecord: boolean, fields: Declaration[]) {
        this.name = name;
        this.nameRange = nameRange;
        this.isRecord = isRecord;
        this.fields = fields;
    }
}


export abstract class Statement extends ASTNode { }

export class Declaration extends Statement {
    name: string;
    immutable: boolean;
    initializer?: Expression;
    type?: string | TypeDeclaration;
    constructor(range: Range | undefined, name: string, immutable: boolean, type?: string | TypeDeclaration, initializer?: Expression) {
        super(range);
        this.name = name;
        this.immutable = immutable;
        this.initializer = initializer;
        this.type = type;
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
    constructor(range: Range | undefined, statements: Statement[]) {
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

export class BreakStatement extends Statement {

}

export class ReturnStatement extends Statement {
    expression?: Expression;
    constructor(range: Range | undefined, expression?: Expression) {
        super(range);
        this.expression = expression;
    }
}

export class CallStatement extends Statement {
    expression: CallExpression | UnboundCallExpression

    constructor(range: Range, expression: CallExpression | UnboundCallExpression) {
        super(range);
        this.expression = expression;
    }
}

// TODO : DoubleLiteral, CharLiteral

export abstract class Expression extends ASTNode { }

export abstract class Literal extends Expression { }

export class IntLiteral extends Literal {
    value: number;
    constructor(range: Range | undefined, value: number) {
        super(range);
        this.value = value;
    }
}

export class DoubleLiteral extends Literal {
    value: number;
    constructor(range: Range | undefined, value: number) {
        super(range);
        this.value = value;
    }
}

export class BooleanLiteral extends Literal {
    value: boolean;
    constructor(range: Range | undefined, value: boolean) {
        super(range);
        this.value = value;
    }
}

export class StringLiteral extends Literal {
    value: string;
    constructor(range: Range | undefined, value: string) {
        super(range);
        this.value = value;
    }
}


export class Variable extends Expression {
    declaration: Declaration;
    constructor(range: Range | undefined, declaration: Declaration) {
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

export class CallExpression extends Expression {
    procedure: Procedure;
    args: Expression[];
    instanceCall: boolean;
    constructor(range: Range, proc: Procedure, args: Expression[], instanceCall: boolean) {
        super(range);
        this.procedure = proc;
        this.args = args;
        this.instanceCall = instanceCall;
    }
}

export class UnboundCallExpression extends Expression {
    procedureName: string;
    args: Expression[];
    constructor(range: Range, procedureName: string, args: Expression[]) {
        super(range);
        this.procedureName = procedureName;
        this.args = args;
    }
}

export class NewObjectExpression extends Expression {
    type: TypeDeclaration;
    args: Expression[];
    constructor(range: Range, type: TypeDeclaration, args: Expression[]) {
        super(range);
        this.type = type;
        this.args = args;
    }
}

export class UnboundNewObjectExpression extends Expression {
    typeName: string;
    args: Expression[];
    constructor(range: Range, typeName: string, args: Expression[]) {
        super(range);
        this.typeName = typeName;
        this.args = args;
    }
}

export class FieldAccessExpression extends Expression {
    target: Expression;
    fieldName: string;
    constructor(range: Range, target: Expression, fieldName: string) {
        super(range);
        this.target = target;
        this.fieldName = fieldName;
    }
}
