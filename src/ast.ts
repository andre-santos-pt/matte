import Range from "./Range";
import {CompilationErrorType} from "./Interpreter";
import {createDefaultEsmLegacyPreset} from "ts-jest";



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
    returnType?: TypeDeclaration | string;
    body?: BlockStatement;
    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, instance: boolean, parameters: Declaration[], returnType?: TypeDeclaration | string, body?: BlockStatement) {
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
    type: TypeDeclaration | string;
    constructor(range: Range | undefined, name: string, immutable: boolean, type: TypeDeclaration | string, initializer?: Expression) {
        if(initializer && initializer.type != type)
            throw {
                message: "Cannot assign a " + initializer.type + " to a variable of type " + type,
                compilation: CompilationErrorType.TypeMismatch,
                range: initializer.range
            }
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
    constructor(range: Range, variable: Declaration, expression: Expression) {
        if(variable.type != expression.type)
            throw {
                message: "Cannot assign a " + expression.type + " to a variable of type " + variable.type,
                compilation: CompilationErrorType.TypeMismatch,
                range: expression.range,
                detail: {
                    related: variable.range,
                }
            }
        super(range);
        this.variable = variable;
        this.expression = expression;
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
        if(condition.type != "boolean")
            throw {
                message: "Not a boolean expression",
                compilation: CompilationErrorType.TypeMismatch,
                range: condition.range
            }
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
        if(condition.type != "boolean")
            throw {
                message: "Not a boolean expression",
                compilation: CompilationErrorType.TypeMismatch,
                range: condition.range
            }
        super(range);
        this.guard = condition;
        this.body = body;
    }
}

export class BreakStatement extends Statement {
 // TODO break location
}

export class ReturnStatement extends Statement {
    expression?: Expression;
    constructor(range: Range | undefined, expression?: Expression) {
        super(range);
        this.expression = expression;
    }

    // TODO return type check
}

export class CallStatement extends Statement {
    expression: CallExpression | UnboundCallExpression

    constructor(range: Range, expression: CallExpression | UnboundCallExpression) {
        super(range);
        this.expression = expression;
    }
}

// TODO : CharLiteral

export abstract class Expression extends ASTNode {
    type: string | TypeDeclaration | undefined
    constructor(range: Range | undefined, type: string | TypeDeclaration | undefined) {
        super(range);
        this.type = type;
    }
}

export abstract class Literal extends Expression { }

export class IntLiteral extends Literal {
    value: number;
    constructor(range: Range | undefined, value: number) {
        super(range, "int");
        this.value = value;
    }
}

export class DoubleLiteral extends Literal {
    value: number;
    constructor(range: Range | undefined, value: number) {
        super(range, "double");
        this.value = value;
    }
}

export class BooleanLiteral extends Literal {
    value: boolean;
    constructor(range: Range | undefined, value: boolean) {
        super(range, "boolean");
        this.value = value;
    }
}

export class StringLiteral extends Literal {
    value: string;
    constructor(range: Range | undefined, value: string) {
        super(range, "string");
        this.value = value;
    }
}

export class Variable extends Expression {
    declaration: Declaration;
    constructor(range: Range | undefined, declaration: Declaration) {
        super(range, declaration.type);
        this.declaration = declaration;
    }
}

export class UnaryExpression extends Expression {
    operator: string;
    expression: Expression;
    constructor(range: Range, operator: string, expression: Expression) {
        if(operator == "-" && expression.type != "int" && expression.type != "double")
            throw {
                message: "Unary operator - can only be applied to numeric expressions",
                compilation: CompilationErrorType.TypeMismatch,
                range: expression.range,
                detail: "The expression '" + expression.range?.text + "' is of type " + expression.type
            }

        if(operator == "!" && expression.type != "boolean")
            throw {
                message: "Unary operator - can only be applied to boolean expressions",
                compilation: CompilationErrorType.TypeMismatch,
                range: expression.range,
                detail: "The expression '" + expression.range?.text + "' is of type " + expression.type
            }

        super(range, expression.type);
        this.operator = operator;
        this.expression = expression;

        // TODO truncate
    }
}

export abstract class BinaryExpression extends Expression {
    operator: string;
    left: Expression;
    right: Expression;
    protected constructor(range: Range, operator: string, left: Expression, right: Expression, type: string) {
        super(range, type);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

function isNumber(type?: string | TypeDeclaration) {
    return type == "int" || type == "double"
}

export class ArithmeticExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if(!ArithmeticExpression.validOperator(operator))
            throw {
                message: "Invalid arithmetic operator",
                compilation: CompilationErrorType.SyntaxError,
                range: range
            }

        if(!isNumber(left.type))
            throw {
                message: "Number is expected to perform the operation '" + operator + "'",
                compilation: CompilationErrorType.TypeMismatch,
                range: left.range
            }

        if(!isNumber(right.type))
            throw {
                message: "Number is expected to perform the operation '" + operator + "'",
                compilation: CompilationErrorType.TypeMismatch,
                range: right.range
            }

        const type = left.type == "double" || right.type == "double" ? "double" : "int"
        super(range, operator, left, right, type)
    }

    static validOperator(op: string) {
        return op == '+' || op == '-' || op == '*' || op == '/' || op == '%'
    }
}


export class RelationalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if(!RelationalExpression.validOperator(operator))
            throw {
                message: "Invalid relational operator",
                compilation: CompilationErrorType.SyntaxError,
                range: range
            }

        if((operator == "==" || operator == "!=") && left.type != right.type)
            throw {
                message: "Operands have incompatible compatible types; " + left.range?.text + " is " + left.type + " and " + right.range?.text + " is " + right.type,
                compilation: CompilationErrorType.TypeMismatch,
                range: range
            }

        if(operator == '<' || operator == '<=' || operator == '>' || operator == '>=') {
            if(!isNumber(left.type))
                throw {
                    message: "Number is expected to perform the comparison '" + operator + "'",
                    compilation: CompilationErrorType.TypeMismatch,
                    range: left.range
                }

            if(!isNumber(right.type))
                throw {
                    message: "Number is expected to perform the comparison '" + operator + "'",
                    compilation: CompilationErrorType.TypeMismatch,
                    range: right.range
                }
        }
        super(range, operator, left, right, "boolean")
    }

    static validOperator(op: string) {
        return op == '==' || op == '!=' || op == '<' || op == '<=' || op == '>' || op == '>='
    }
}

export class LogicalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if(!LogicalExpression.validOperator(operator))
            throw {
                message: "Invalid relational operator",
                compilation: CompilationErrorType.SyntaxError,
                range: range
            }

        if(left.type != "boolean")
            throw {
                message: "Boolean expression expected",
                compilation: CompilationErrorType.TypeMismatch,
                range: left.range
            }

        if(right.type != "boolean")
            throw {
                message: "Boolean expression expected",
                compilation: CompilationErrorType.TypeMismatch,
                range: right.range
            }

        super(range, operator, left, right, "boolean")
    }

    static validOperator(op: string) {
        return op == '&&' || op == '||'
    }
}



export class CallExpression extends Expression {
    procedure: Procedure;
    args: Expression[];
    instanceCall: boolean;
    constructor(range: Range, proc: Procedure, args: Expression[], instanceCall: boolean) {
        // TODO arg types
        super(range, proc.returnType);
        this.procedure = proc;
        this.args = args;
        this.instanceCall = instanceCall;
    }
}

export class UnboundCallExpression extends Expression {
    procedureName: string;
    args: Expression[];
    constructor(range: Range, procedureName: string, args: Expression[]) {
        super(range, undefined);
        this.procedureName = procedureName;
        this.args = args;
    }
}

export class NewObjectExpression extends Expression {
    type: TypeDeclaration;
    args: Expression[];
    constructor(range: Range, type: TypeDeclaration, args: Expression[]) {
        // TODO arg types
        super(range, type);
        this.type = type;
        this.args = args;
    }
}

export class UnboundNewObjectExpression extends Expression {
    typeName: string;
    args: Expression[];
    constructor(range: Range, typeName: string, args: Expression[]) {
        super(range, typeName);
        this.typeName = typeName;
        this.args = args;
    }
}

export class FieldAccessExpression extends Expression {
    target: Expression;
    fieldName: string;
    constructor(range: Range, target: Expression, fieldName: string) {
        super(range, target.type); // TODO bug wrong type
        this.target = target;
        this.fieldName = fieldName;
    }
}
