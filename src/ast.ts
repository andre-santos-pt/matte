import Range from "./Range";

export interface StaticError {
    range: Range;
    type: StaticErrorType;
    message: string;
    detail?: any;
}

export enum StaticErrorType {
    TokenError = "TOKEN",
    SyntaxError = "SYNTAX",
    UndeclaredVariable = "VAR_NOT_FOUND",
    DuplicateVariable = "DUP_VAR",
    TypeMismatch = "TYPE_MISMATCH",
    MethodNotFound = "METHOD_NOT_FOUND",
    MissingReturn = "MISSING_RETURN",
    ImmutableVariable = "IMMUTABLE_VAR",
    Unsupported = "UNSUPPORTED",
    NumberArgumentsMismatch = "N_ARGS_MISMATCH",
    ArgumentTypesMismatch = "ARGS_TYPE_MISMATCH",
    FieldNotFound = "FIELD_NOT_FOUND",
}

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

    constructor(range?: Range) {
        this.range = range;
    }
}

export class Procedure extends ASTNode {
    name: string;
    nameRange: Range | undefined;
    parameters: Declaration[];
    instance: boolean;
    returnType?: Type;
    body?: BlockStatement;

    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, instance: boolean, parameters: Declaration[], returnType?: Type, body?: BlockStatement) {
        super(range);
        if (instance && parameters.length == 0)
            throw new Error("Instance procedures must have at least one parameter (the instance)");
        this.name = name;
        this.nameRange = nameRange;
        this.parameters = parameters;
        this.instance = instance;
        this.returnType = returnType;
        this.body = body;
    }
}

export type Type = PrimitiveType | TypeDeclaration | ArrayType | ForeignType

export enum PrimitiveType {
    INT = "int",
    DOUBLE = "double",
    BOOLEAN = "boolean",
    STRING = "String"
}

export function typeName(type: Type) {
    if(isPrimitiveType(type))
        return type.toString()
    else if(type instanceof TypeDeclaration)
        return type.name
    else if(type instanceof ForeignType)
        return type.name
    else
        return undefined
}

export function isPrimitiveType(type: Type | undefined) {
    return type == PrimitiveType.INT || type == PrimitiveType.DOUBLE || type == PrimitiveType.BOOLEAN || type == PrimitiveType.STRING
}

export function isNumberType(type?: Type) {
    return type == PrimitiveType.INT || type == PrimitiveType.DOUBLE
}

export function isBooleanType(type?: Type) {
    return type == PrimitiveType.BOOLEAN
}

export function isReferenceType(type?: Type) {
    return type instanceof ArrayType || type instanceof TypeDeclaration || type instanceof ForeignType
}

export function isSameType(a: Type | undefined, b: Type | undefined): boolean {
    if (isPrimitiveType(a) || a instanceof TypeDeclaration)
        return a == b
    else if (a instanceof ArrayType)
        return b instanceof ArrayType && (isSameType(a.componentType, b.componentType) || a.componentType == undefined || b.componentType == undefined)
    else if (a instanceof ForeignType)
        return b instanceof ForeignType && a.name == b.name
    else
        return false
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

export class ArrayType {
    componentType?: Type

    constructor(componentType?: Type) {
        this.componentType = componentType
    }
}

export class ForeignType {
    name: string

    constructor(name: string) {
        this.name = name
    }
}

export abstract class Statement extends ASTNode {
}

export class Declaration extends Statement {
    name: string;
    nameRange?: Range;
    immutable: boolean;
    type: Type;
    typeRange?: Range;
    initializer?: Expression;

    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, immutable: boolean, type: Type, typeRange: Range | undefined, initializer?: Expression) {
        if (initializer
            && !(isReferenceType(type) && initializer instanceof NullLiteral)
            && !(initializer.type instanceof ArrayType && !initializer.type.componentType)
            && !isSameType(initializer.type, type))
            throw {
                message: "Cannot assign a " + initializer.type + " to a variable of type " + typeName(type),
                compilation: StaticErrorType.TypeMismatch,
                range: initializer.range,
                detail: {
                    related: [typeRange]
                }
            }
        super(range);
        this.name = name;
        this.nameRange = nameRange;
        this.immutable = immutable;
        this.type = type;
        this.typeRange = typeRange;
        this.initializer = initializer;
    }
}

export class Assignment extends Statement {
    variable: Declaration;
    expression: Expression;

    constructor(range: Range, variable: Declaration, expression: Expression) {
        if (!isSameType(variable.type, expression.type))
            throw {
                message: "This type of this expression is " + expression.type + ", but the variable has type " + variable.type,
                compilation: StaticErrorType.TypeMismatch,
                range: expression.range,
                detail: {
                    related: [variable.typeRange],
                }
            }
        super(range);
        this.variable = variable;
        this.expression = expression;
    }
}

export class ArrayAssignment extends Statement {
    target: Expression;
    index: Expression;
    expression: Expression;

    constructor(range: Range, target: Expression, index: Expression, expression: Expression) {
        // if(target.type != expression.type) // TODO component type
        //     throw {
        //         message: "Cannot assign a " + expression.type + " to a variable of type " + target.type,
        //         compilation: CompilationErrorType.TypeMismatch,
        //         range: expression.range,
        //         detail: {
        //             related: target.range,
        //         }
        //     }
        // TODO target type

        if(index.type != PrimitiveType.INT)
            throw {
                message: "Expected an expression of type integer",
                compilation: StaticErrorType.TypeMismatch,
                range: index.range
            }
        super(range);
        this.target = target;
        this.index = index;
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

function checkGuardType(condition: Expression) {
    if (!isSameType(condition.type, PrimitiveType.BOOLEAN))
        throw {
            message: "This expression has type " + condition.type + " (boolean is expected)",
            compilation: StaticErrorType.TypeMismatch,
            range: condition.range
        }
}

export class IfStatement extends Statement {
    guard: Expression;
    thenBranch: Statement;
    elseBranch?: Statement;

    constructor(range: Range, condition: Expression, thenBranch: Statement, elseBranch: Statement | undefined) {
        checkGuardType(condition);
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
        checkGuardType(condition);
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
    type?: Type

    constructor(range: Range | undefined, type?: Type) {
        super(range);
        this.type = type;
    }

    getChildren() : Expression[] {
        return []
    }

    setLoose() {
        this.range = undefined
        this.getChildren().forEach(c => c.setLoose())
    }

    isSimple() {
        return false;
    }
}


export abstract class Literal<T> extends Expression {
    abstract value: T

    isSimple(): boolean {
        return true
    }
}

export class IntLiteral extends Literal<number> {
    value: number;

    constructor(range: Range | undefined, value: number) {
        super(range, PrimitiveType.INT);
        this.value = value;
    }
}

export class DoubleLiteral extends Literal<number> {
    value: number;

    constructor(range: Range | undefined, value: number) {
        super(range, PrimitiveType.DOUBLE);
        this.value = value;
    }
}

export class BooleanLiteral extends Literal<boolean> {
    value: boolean;

    constructor(range: Range | undefined, value: boolean) {
        super(range, PrimitiveType.BOOLEAN);
        this.value = value;
    }
}

export class StringLiteral extends Literal<string> {
    value: string;

    constructor(range: Range | undefined, value: string) {
        super(range, PrimitiveType.STRING);
        this.value = value;
    }
}

export class NullLiteral extends Literal<undefined> {
    value: undefined

    constructor(range: Range) {
        super(range);
    }
}

export class Variable extends Expression {
    declaration: Declaration;

    constructor(range: Range | undefined, declaration: Declaration) {
        super(range, declaration.type);
        this.declaration = declaration;
    }

    isSimple(): boolean {
        return true
    }
}


export class UnaryExpression extends Expression {
    operator: string;
    expression: Expression;

    constructor(range: Range, operator: string, expression: Expression) {
        if (operator == "-" && !isNumberType(expression.type))
            throw {
                message: "Unary operator - can only be applied to numeric expressions",
                compilation: StaticErrorType.TypeMismatch,
                range: expression.range,
                detail: "The expression '" + expression.range?.text + "' is of type " + expression.type
            }

        if (operator == "!" && !isSameType(expression.type, PrimitiveType.BOOLEAN))
            throw {
                message: "Unary operator - can only be applied to boolean expressions",
                compilation: StaticErrorType.TypeMismatch,
                range: expression.range,
                detail: "The expression '" + expression.range?.text + "' is of type " + expression.type
            }

        super(range, expression.type);
        this.operator = operator;
        this.expression = expression;

        // TODO truncate
    }

    getChildren(): Expression[] {
        return [this.expression]
    }
}

export abstract class BinaryExpression extends Expression {
    operator: string;
    left: Expression;
    right: Expression;

    protected constructor(range: Range, operator: string, left: Expression, right: Expression, type: Type) {
        super(range, type);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    getChildren(): Expression[] {
        return [this.left, this.right]
    }
}

export class ArrayLiteralExpression extends Expression {
    elements: Expression[];

    constructor(range: Range, elements: Expression[]) {
        const types = new Set(elements.map(e => e.type))
        if (types.size > 1)
            throw {
                message: "Multiple expression types",
                compilation: StaticErrorType.TypeMismatch,
                range: range
            }

        super(range, new ArrayType(types.size == 0 ? undefined : types.values().next().value));
        this.elements = elements;
    }

    getChildren() : Expression[] {
        return this.elements
    }
}

export class ArrayAllocationExpression extends Expression {
    componentType: Type
    dimensions: Expression[];

    constructor(range: Range, componentType: Type, dimensions: Expression[]) {
        super(range, new ArrayType(componentType)); // TODO type
        this.componentType = componentType;
        this.dimensions = dimensions;
        // TODO dimensions > 1  positive int
    }

    getChildren() : Expression[] {
        return this.dimensions
    }
}

function isArrayType(type?: Type) {
    return type instanceof ArrayType
}


export class ArrayElementExpression extends Expression {
    target: Expression;
    index: Expression;

    constructor(range: Range, target: Expression, index: Expression) {
        if (!isArrayType(target.type))
            throw {
                message: "Not an array",
                compilation: StaticErrorType.TypeMismatch,
                range: target.range
            }

        super(range, (target.type as ArrayType).componentType);
        this.target = target;
        this.index = index;

        // TODO target type
        // TODO index validation
    }

    getChildren() : Expression[] {
        return [this.target, this.index]
    }

}


export class ArithmeticExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if (!ArithmeticExpression.validOperator(operator))
            throw {
                message: "Invalid arithmetic operator",
                compilation: StaticErrorType.SyntaxError,
                range: range
            }

        if (!isNumberType(left.type))
            throw {
                message: "Number is expected to perform the operation '" + operator + "'",
                compilation: StaticErrorType.TypeMismatch,
                range: left.range
            }

        if (!isNumberType(right.type))
            throw {
                message: "Number is expected to perform the operation '" + operator + "'",
                compilation: StaticErrorType.TypeMismatch,
                range: right.range
            }

        const type = left.type == PrimitiveType.DOUBLE || right.type == PrimitiveType.DOUBLE ? PrimitiveType.DOUBLE : PrimitiveType.INT
        super(range, operator, left, right, type)
    }

    static validOperator(op: string) {
        return op == '+' || op == '-' || op == '*' || op == '/' || op == '%'
    }
}


export class RelationalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if (!RelationalExpression.validOperator(operator))
            throw {
                message: "Invalid relational operator",
                compilation: StaticErrorType.SyntaxError,
                range: range
            }

        if ((operator == "==" || operator == "!=") && left.type != right.type) // TODO case int / double
            throw {
                message: "Operands have incompatible compatible types; " + left.range?.text + " is " + left.type + " and " + right.range?.text + " is " + right.type,
                compilation: StaticErrorType.TypeMismatch,
                range: range
            }

        if (operator == '<' || operator == '<=' || operator == '>' || operator == '>=') {
            if (!isNumberType(left.type))
                throw {
                    message: "Number is expected to perform the comparison '" + operator + "'",
                    compilation: StaticErrorType.TypeMismatch,
                    range: left.range
                }

            if (!isNumberType(right.type))
                throw {
                    message: "Number is expected to perform the comparison '" + operator + "'",
                    compilation: StaticErrorType.TypeMismatch,
                    range: right.range
                }
        }
        super(range, operator, left, right, PrimitiveType.BOOLEAN)
    }

    static validOperator(op: string) {
        return op == '==' || op == '!=' || op == '<' || op == '<=' || op == '>' || op == '>='
    }
}

export class LogicalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        if (!LogicalExpression.validOperator(operator))
            throw {
                message: "Invalid relational operator",
                compilation: StaticErrorType.SyntaxError,
                range: range
            }

        if (!isBooleanType(left.type))
            throw {
                message: "Boolean expression expected",
                compilation: StaticErrorType.TypeMismatch,
                range: left.range
            }

        if (!isBooleanType(right.type))
            throw {
                message: "Boolean expression expected",
                compilation: StaticErrorType.TypeMismatch,
                range: right.range
            }

        super(range, operator, left, right, PrimitiveType.BOOLEAN)
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

    getChildren() : Expression[] {
        return this.args
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

    getChildren() : Expression[] {
        return this.args
    }
}

export class NewObjectExpression extends Expression {
    type: TypeDeclaration;
    args: Expression[];

    constructor(range: Range, type: Type, args: Expression[]) {
        if(!(type instanceof TypeDeclaration))
            throw {
                message: "Not an object type",
                compilation: StaticErrorType.TypeMismatch
            }
        // TODO arg types
        super(range, type);
        this.type = type;
        this.args = args;
    }

    getChildren() : Expression[] {
        return this.args
    }
}

export class UnboundNewObjectExpression extends Expression {
    typeName: string;
    args: Expression[];

    constructor(range: Range, typeName: string, args: Expression[]) {
        super(range, new ForeignType(typeName));
        this.typeName = typeName;
        this.args = args;
    }

    getChildren() : Expression[] {
        return this.args
    }
}

type FieldTarget = Variable | ArrayElementExpression | NewObjectExpression

export class FieldAccessExpression extends Expression {
    target: FieldTarget;
    fieldName: string;

    static isFieldTarget(obj: any): obj is FieldTarget {
        return (
            obj instanceof Variable ||
            obj instanceof ArrayElementExpression ||
            obj instanceof NewObjectExpression
        );
    }

    constructor(range: Range, target: Expression, fieldName: string, fieldNameRange: Range) {
        if(!FieldAccessExpression.isFieldTarget(target))
            throw {
                message: "Invalid expression for field access",
                compilation: StaticErrorType.TypeMismatch,
                range: target.range
            }

        let type: Type | undefined
        if (isArrayType(target.type)) {
            if(fieldName == "length")// TODO remove to avoid Java-specific?
                type = PrimitiveType.INT
            else
                throw {
                    message: "Invalid field '" + fieldName + "' for arrays",
                    compilation: StaticErrorType.FieldNotFound,
                    range: fieldNameRange
                }
        }

        else if (target.type instanceof TypeDeclaration) {
            const dec = (target as Variable).type as TypeDeclaration
            type = (dec as TypeDeclaration).fields.find(f => f.name == fieldName)?.type
            if (!type)
                throw {
                    message: "Field '" + fieldName + "' is not declared in type '" + dec.name + "'",
                    compilation: StaticErrorType.FieldNotFound,
                    range: fieldNameRange
                }
        }
        else throw {
            message: "Not a valid target",
            compilation: StaticErrorType.Unsupported,
            range: target.range
        }

        super(range, type);
        this.target = target;
        this.fieldName = fieldName;
    }

    getChildren(): Expression[] {
        return [this.target]
    }
}
