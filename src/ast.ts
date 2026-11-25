import Range from "./Range";
import {mark, markType} from "./antlr2ast";
import JavaGrammarVisitor from "./generated/JavaGrammarVisitor";
import {
    CommonTokenStream,
    Interval,
    ParserRuleContext,
    TerminalNode,
    Token
} from "antlr4";
import JavaGrammarLexer from "./generated/JavaGrammarLexer";

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
    KeywordUsedAsIdentifier = "KEYWORD_AS_IDENTIFIER",
    CannotInferType = "CANNOT_INFER_TYPE",
    BreakOutsideLoop = "BREAK_OUTSIDE_LOOP"

}

export type Type = PrimitiveType | TypeDeclaration | ArrayType | ForeignType

export enum PrimitiveType {
    INT = "int",
    DOUBLE = "double",
    CHAR = "char",
    BOOLEAN = "boolean",
    STRING = "String",
    VOID = "void",
    NULL = "null"
}

export function typeName(type?: Type): string | undefined {
    if (!type)
        return undefined;
    if (isPrimitiveType(type))
        return type.toString()
    else if(type == PrimitiveType.NULL)
        return "null"
    else if (type instanceof TypeDeclaration)
        return type.name
    else if (type instanceof ForeignType)
        return type.name
    else if (type instanceof ArrayType)
        return typeName(type.componentType as Type) + "[]"
    else
        return undefined
}

export function isPrimitiveType(type: Type | undefined) {
    return type == PrimitiveType.INT || type == PrimitiveType.DOUBLE || type == PrimitiveType.CHAR || type == PrimitiveType.BOOLEAN || type == PrimitiveType.STRING
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

function isSameType(a: Type | undefined, b: Type | undefined): boolean {
    if (isPrimitiveType(a) || a instanceof TypeDeclaration)
        return a == b
    else if (a instanceof ArrayType)
        return b instanceof ArrayType && (isSameType(a.componentType, b.componentType) || a.componentType == undefined || b.componentType == undefined)
    else if (a instanceof ForeignType)
        return b instanceof ForeignType && a.name == b.name
    else
        return false
}

export function typeCompatibleWith(a: Type | undefined, b: Type | undefined): boolean {
    if(a == PrimitiveType.INT && b == PrimitiveType.DOUBLE)
        return true
    else if(isPrimitiveType(a) && isPrimitiveType(b))
        return a == b
    else if (b instanceof ArrayType)
        return a == PrimitiveType.NULL || a instanceof ArrayType && (isSameType(a.componentType, b.componentType))
    else if (b instanceof TypeDeclaration)
        return a == PrimitiveType.NULL || a instanceof TypeDeclaration && (a.name == b.name)
    else if (b instanceof ForeignType)
        return a == PrimitiveType.NULL || a instanceof ForeignType && a.name == b.name
    else
        return false
}



export class ArrayType {
    componentType?: Type

    constructor(componentType?: Type) {
        this.componentType = componentType
    }

    toString(): string {
        const t = this.componentType ? typeName(this.componentType) : "?"
        return t + "[]"
    }
}

export class ForeignType {
    name: string

    constructor(name: string) {
        this.name = name
    }

    toString(): string {
        return this.name
    }
}

export abstract class ASTNode {
    range?: Range;
    parent?: ASTNode;

    constructor(range?: Range) {
        this.range = range;
    }

    accept(visitor: ASTVisitor): void {
        visitor.visit(this);
    }

    validate(errors: StaticError[]) {}
}

export class Program extends ASTNode {
    block?: BlockStatement;
    procedures: Procedure[] = [];
    typeDeclarations: TypeDeclaration[] = [];

    constructor(block?: BlockStatement, procedures: Procedure[] = [], typeDeclarations: TypeDeclaration[] = []) {
        super();
        this.block = block;
        this.procedures = procedures;
        this.typeDeclarations = typeDeclarations;
    }

    checkStaticErrors(): StaticError[] {
        const errors: StaticError[] = []
        class VisitAll extends  ASTVisitor {
            visitASTNode(node: ASTNode) {
                node.validate(errors)
            }
        }
        this.accept(new VisitAll())
        return errors
    }
}

export class Procedure extends ASTNode {
    name: string;
    nameRange: Range | undefined;
    parameters: Declaration[];
    instance: boolean;
    returnType?: Type;
    returnTypeRange?: Range;
    body?: BlockStatement;

    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, instance: boolean, parameters: Declaration[], returnType?: Type, returnTypeRange?: Range, body?: BlockStatement) {
        super(range);
        if (instance && parameters.length == 0)
            throw new Error("Instance procedures must have at least one parameter (the instance)");
        this.name = name;
        this.nameRange = nameRange;
        this.parameters = parameters;
        this.instance = instance;
        this.returnType = returnType;
        this.returnTypeRange = returnTypeRange;
        this.body = body;
    }


    validate(errors: StaticError[]) {
        function alwaysReturns(statement: Statement): boolean {
            if (statement instanceof ReturnStatement)
                return true;
            if (statement instanceof BlockStatement)
                return statement.statements.some(alwaysReturns);
            if (statement instanceof IfStatement)
                return statement.elseBranch != undefined &&
                    alwaysReturns(statement.thenBranch) &&
                    alwaysReturns(statement.elseBranch);
            return false;
        }

        if (this.returnType !== PrimitiveType.VOID &&
            (!this.body || !alwaysReturns(this.body))) {
            errors.push({
                type: StaticErrorType.MissingReturn,
                range: this.nameRange as Range,
                message: `Missing return statement with value of type ${markType(this.returnType)}`,
                detail: {
                    related: [this.returnTypeRange]
                }
            })
        }
        this.checkReturns(errors)
    }

     checkReturns(errors: StaticError[]): void {
        function checkReturnsAux(statement: Statement, procedure: Procedure): void {
            if (statement instanceof ReturnStatement) {
                if (statement.expression == undefined) {
                    if (procedure.returnType != PrimitiveType.VOID)
                        errors.push({
                            type: StaticErrorType.TypeMismatch,
                            range: statement.range as Range,
                            message: `Function must return a value of type ${markType(procedure.returnType)}`,
                            detail: {
                                related: [procedure.returnTypeRange]
                            }
                        })
                } else {
                    if (procedure.returnType == PrimitiveType.VOID)
                        errors.push({
                            type: StaticErrorType.TypeMismatch,
                            range: statement.expression.range as Range,
                            message: `Procedure cannot return any value`,
                            detail: {
                                related: [procedure.returnTypeRange]
                            }
                        })
                    else if (!typeCompatibleWith((statement.expression as Expression).type, procedure.returnType)) {
                        errors.push({
                            type: StaticErrorType.TypeMismatch,
                            range: statement.expression.range as Range,
                            message: `Expected value of type ${markType(procedure.returnType)} (not ${markType(statement.expression?.type)})`,
                            detail: {
                                related: [procedure.returnTypeRange]
                            }
                        })
                    }
                }
            } else if (statement instanceof BlockStatement) {
                statement.statements.forEach(s => checkReturnsAux(s, procedure));
            } else if (statement instanceof IfStatement) {
                checkReturnsAux(statement.thenBranch, procedure);
                if (statement.elseBranch)
                    checkReturnsAux(statement.elseBranch, procedure);
            }
        }

        if (this.body && this.returnType)
            checkReturnsAux(this.body, this);
    }

}

export class TypeDeclaration extends ASTNode {
    name: string;
    nameRange: Range;
    isRecord: boolean;
    fields: Declaration[];

    constructor(name: string, nameRange: Range, isRecord: boolean, fields: Declaration[]) {
        super();
        this.name = name;
        this.nameRange = nameRange;
        this.isRecord = isRecord;
        this.fields = fields;
    }

    toString(): string {
        return this.name;
    }
}


export abstract class Statement extends ASTNode {
    comment?: string;
}

export class Declaration extends Statement {
    name: string;
    nameRange?: Range;
    immutable: boolean;
    type: Type;
    typeRange?: Range;
    initializer?: Expression;

    constructor(range: Range | undefined, name: string, nameRange: Range | undefined, immutable: boolean, type: Type, typeRange: Range | undefined, initializer?: Expression) {
        if(initializer instanceof ArrayLiteralExpression && initializer.elements.length == 0)
            (initializer as ArrayLiteralExpression).type = type

        super(range);
        this.name = name;
        this.nameRange = nameRange;
        this.immutable = immutable;
        this.type = type;
        this.typeRange = typeRange;
        this.initializer = initializer;
    }

    validate(errors: StaticError[]) {
        if (this.initializer && this.initializer.type && !typeCompatibleWith(this.initializer.type, this.type))
        errors.push(
            {
                message: "Incompatible type: expected " + markType(this.type) + " (not " + markType(this.initializer.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.initializer.range as Range,
                detail: {
                    related: [this.typeRange],
                    expected: this.type.toString(),
                    found: this.initializer.type.toString()
                }
            }
        )
    }
}

export class Assignment extends Statement {
    variable: Declaration;
    expression: Expression;

    constructor(range: Range, variable: Declaration, expression: Expression) {
        super(range);
        this.variable = variable;
        this.expression = expression;
    }

    validate(errors: StaticError[]) {
        if (this.expression.type && !typeCompatibleWith(this.expression.type, this.variable.type))
            errors.push({
                message: "Expected expression of type " + markType(this.variable.type) + " (not " + markType(this.expression.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.expression.range as Range,
                detail: {
                    related: [this.variable.typeRange],
                }
            })
    }
}

export class ArrayAssignment extends Statement {
    target: Expression;
    index: Expression;
    expression: Expression;

    constructor(range: Range, target: Expression, index: Expression, expression: Expression) {
        super(range);
        this.target = target;
        this.index = index;
        this.expression = expression;
    }

    validate(errors: StaticError[]) {
        if (!(this.target.type instanceof ArrayType))
            errors.push({
                message: "The variable must be an array reference (not " + markType(this.target.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.target.range as Range,
                detail: this.target instanceof Variable ? {
                    related: [this.target.declaration.typeRange]
                } : undefined
            })

        if (this.index.type != PrimitiveType.INT)
            errors.push({
                message: "The index must be given by an integer (not " + markType(this.index.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.index.range as Range
            })

        if (this.target.type instanceof ArrayType &&
            !typeCompatibleWith(this.expression.type, this.target.type.componentType))
            errors.push({
                message: "Cannot assign a value of type " + markType(this.expression.type) + " to an array holding " + markType(this.target.type.componentType) + " values",
                type: StaticErrorType.TypeMismatch,
                range: this.expression.range as Range,
                detail: this.target instanceof Variable ? {
                    related: [this.target.declaration.typeRange]
                } : undefined
            })
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

    validate(errors: StaticError[]) {
        if (this.guard.type !== PrimitiveType.BOOLEAN)
            errors.push({
                message: "Expected boolean expression (not " + markType(this.guard.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.guard.range as Range
            })
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

    validate(errors: StaticError[]) {
        if (this.guard.type !== PrimitiveType.BOOLEAN)
            errors.push({
                message: "Expected boolean expression (not " + markType(this.guard.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.guard.range as Range
            })
    }
}

export class BreakStatement extends Statement {

    validate(errors: StaticError[]) {
        let parent = this.parent
        while(parent != null && !(parent instanceof Procedure)) {
            if(parent instanceof WhileStatement)
                return
            parent = parent?.parent
        }
        errors.push({
            message: "Break statement outside a loop",
            type: StaticErrorType.BreakOutsideLoop,
            range: this.range as Range
        })
    }
}

export class ReturnStatement extends Statement {
    expression?: Expression;

    constructor(range: Range | undefined, expression?: Expression) {
        super(range);
        this.expression = expression;
    }

    returnRange(): Range | undefined {
        if (this.range)
            return new Range(this.range?.start, this.range?.start + 6, this.range?.line, this.range?.column, "return")
        else
            return this.range
    }
}

export class CallStatement extends Statement {
    expression: CallExpression | UnboundCallExpression

    constructor(range: Range, expression: CallExpression | UnboundCallExpression) {
        super(range);
        this.expression = expression;
    }
}

export abstract class Expression extends ASTNode {
    type?: Type

    constructor(range: Range | undefined, type?: Type) {
        super(range);
        this.type = type;
    }

    getChildren(): Expression[] {
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

export class CharLiteral extends Literal<string> {
    value: string;

    constructor(range: Range | undefined, value: string) {
        super(range, PrimitiveType.CHAR);
        this.value = value;
    }
}

export class NullLiteral extends Literal<undefined> {
    value: undefined

    constructor(range: Range) {
        super(range, PrimitiveType.NULL);
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

export class ConditionalExpression extends Expression {
    condition: Expression;
    trueCase: Expression;
    falseCase: Expression;

    constructor(range: Range, condition: Expression, trueCase: Expression, falseCase: Expression) {
        super(range, trueCase.type)
        this.condition = condition
        this.trueCase = trueCase
        this.falseCase = falseCase
    }

    validate(errors: StaticError[]) {
        if (this.condition.type != PrimitiveType.BOOLEAN)
            errors.push({
                message: "Boolean expression expected (not " + markType(this.condition.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.condition.range as Range
            })

        else if (!isSameType(this.trueCase.type, this.falseCase.type))
            errors.push({
                message: "The type of this expression (" + markType(this.falseCase) + ") is not the same as the other alternative expression (" + markType(this.trueCase.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.falseCase.range as Range,
                detail: {
                    related: this.trueCase.range
                }
            })
    }
}

export class UnaryExpression extends Expression {
    operator: string;
    expression: Expression;

    constructor(range: Range, operator: string, expression: Expression) {
        super(range, expression.type);
        this.operator = operator;
        this.expression = expression;
    }

    validate(errors: StaticError[]) {
        if (this.operator == "-" && !isNumberType(this.expression.type))
            errors.push({
                message: "Unary operator - can only be applied to numeric expressions",
                type: StaticErrorType.TypeMismatch,
                range: this.expression.range as Range,
                detail: "The expression " + mark(this.expression.range?.text ?? "") + " is of type " + markType(this.expression.type)
            })

        else if (this.operator == "!" && this.expression.type !== PrimitiveType.BOOLEAN)
            errors.push({
                message: "Unary operator - can only be applied to boolean expressions",
                type: StaticErrorType.TypeMismatch,
                range: this.expression.range as Range,
                detail: "The expression " + mark(this.expression.range?.text ?? "") + " is of type " + markType(this.expression.type)
            })
    }

    getChildren(): Expression[] {
        return [this.expression]
    }
}

export class CastExpression extends Expression {
    castType: PrimitiveType.INT | PrimitiveType.DOUBLE;
    expression: Expression;

    constructor(range: Range, castType: PrimitiveType.INT | PrimitiveType.DOUBLE, expression: Expression) {
        super(range, castType);
        this.castType = castType;
        this.expression = expression;
    }

    validate(errors: StaticError[]) {
        if (!isNumberType(this.expression.type))
            errors.push({
                message: `${this.castType} cast can only be applied to numeric expressions`,
                type: StaticErrorType.TypeMismatch,
                range: this.expression.range as Range
            })
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
        const types = [...new Set(elements.map(e => e.type))]
        const commontype = types.find(t => types.filter(x => typeCompatibleWith(x, t)).length == types.length)

        super(range, new ArrayType(commontype));
        if(commontype == PrimitiveType.DOUBLE)
            this.elements = elements.map(e => e instanceof IntLiteral ? new DoubleLiteral(e.range, e.value) : e);
        else
            this.elements = elements;
    }

    validate(errors: StaticError[]) {
        const types = [...new Set(this.elements.map(element => element.type))]
        const commonType = types.find(type => types.every(candidate => typeCompatibleWith(candidate, type)))
        if (this.elements.length != 0 && !commonType)
            errors.push({
                message: "Expressions do not have a common compatible type",
                type: StaticErrorType.TypeMismatch,
                range: this.range as Range
            })
    }

    getChildren(): Expression[] {
        return this.elements
    }
}

export class ArrayAllocationExpression extends Expression {
    componentType: Type
    dimensions: Expression[];

    constructor(range: Range, componentType: Type, dimensions: Expression[]) {
        super(range, dimensions.reduce<Type>(type => new ArrayType(type), componentType));
        this.componentType = componentType;
        this.dimensions = dimensions;
    }

    getChildren(): Expression[] {
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
        super(range, target.type instanceof ArrayType ? target.type.componentType : undefined);
        this.target = target;
        this.index = index;
    }

    validate(errors: StaticError[]) {
        if (!isArrayType(this.target.type))
            errors.push({
                message: "The variable must be an array reference (not " + markType(this.target.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.target.range as Range,
                detail: this.target instanceof Variable ? {
                    related: [this.target.declaration.typeRange]
                } : undefined
            })

        if (this.index.type != PrimitiveType.INT)
            errors.push({
                message: "The index must be given by an integer (not " + markType(this.index.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.index.range as Range
            })
    }

    getChildren(): Expression[] {
        return [this.target, this.index]
    }
}

export class ArrayLengthExpression extends Expression {
    target: Expression;

    constructor(range: Range, target: Expression) {
        super(range, PrimitiveType.INT);
        this.target = target;
    }

    validate(errors: StaticError[]) {
        if (!isArrayType(this.target.type))
            errors.push({
                message: "The variable must be an array reference (not " + markType(this.target.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.target.range as Range,
                detail: this.target instanceof Variable ? {
                    related: [this.target.declaration.typeRange]
                } : undefined
            })
    }

    getChildren(): Expression[] {
        return [this.target]
    }
}

export class ArithmeticExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        const type = left.type == PrimitiveType.DOUBLE || right.type == PrimitiveType.DOUBLE ? PrimitiveType.DOUBLE : PrimitiveType.INT
        super(range, operator, left, right, type)
    }

    validate(errors: StaticError[]) {
        if (!ArithmeticExpression.validOperator(this.operator))
            errors.push({
                message: "Invalid arithmetic operator " + mark(this.operator),
                type: StaticErrorType.SyntaxError,
                range: this.range as Range
            })

        if (!isNumberType(this.left.type))
            errors.push({
                message: "Number is expected to perform the operation " + mark(this.operator),
                type: StaticErrorType.TypeMismatch,
                range: this.left.range as Range
            })

        if (!isNumberType(this.right.type))
            errors.push({
                message: "Number is expected to perform the operation " + mark(this.operator),
                type: StaticErrorType.TypeMismatch,
                range: this.right.range as Range
            })
    }

    static validOperator(op: string) {
        return op == '+' || op == '-' || op == '*' || op == '/' || op == '%'
    }
}


export class RelationalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        super(range, operator, left, right, PrimitiveType.BOOLEAN)
    }

    validate(errors: StaticError[]) {
        if (!RelationalExpression.validOperator(this.operator))
            errors.push({
                message: "Invalid relational operator",
                type: StaticErrorType.SyntaxError,
                range: this.range as Range
            })

        if (this.operator == "==" || this.operator == "!=") {
            if (this.left instanceof NullLiteral || this.right instanceof NullLiteral) {
                if (this.left instanceof NullLiteral && !isReferenceType(this.right.type))
                    errors.push({
                        message: this.right.range?.text + " does not have a reference type",
                        type: StaticErrorType.TypeMismatch,
                        range: this.range as Range
                    })

                if (this.right instanceof NullLiteral && !isReferenceType(this.left.type))
                    errors.push({
                        message: this.left.range?.text + " does not have a reference type",
                        type: StaticErrorType.TypeMismatch,
                        range: this.range as Range
                    })
            } else if (this.left.type != this.right.type) {
                errors.push({
                    message: "Operands have incompatible compatible types; " + this.left.range?.text + " is " + markType(this.left.type) + " and " + this.right.range?.text + " is " + markType(this.right.type),
                    type: StaticErrorType.TypeMismatch,
                    range: this.range as Range
                })
            }
        }

        if (this.operator == '<' || this.operator == '<=' || this.operator == '>' || this.operator == '>=') {
            if (!isNumberType(this.left.type))
                errors.push({
                    message: "Number is expected to perform the comparison " + mark(this.operator),
                    type: StaticErrorType.TypeMismatch,
                    range: this.left.range as Range
                })

            if (!isNumberType(this.right.type))
                errors.push({
                    message: "Number is expected to perform the comparison " + mark(this.operator),
                    type: StaticErrorType.TypeMismatch,
                    range: this.right.range as Range
                })
        }
    }

    static validOperator(op: string) {
        return op == '==' || op == '!=' || op == '<' || op == '<=' || op == '>' || op == '>='
    }
}

export class LogicalExpression extends BinaryExpression {
    constructor(range: Range, operator: string, left: Expression, right: Expression) {
        super(range, operator, left, right, PrimitiveType.BOOLEAN)
    }

    validate(errors: StaticError[]) {
        if (!LogicalExpression.validOperator(this.operator))
            errors.push({
                message: "Invalid relational operator " + mark(this.operator),
                type: StaticErrorType.SyntaxError,
                range: this.range as Range
            })

        if (!isBooleanType(this.left.type))
            errors.push({
                message: "Boolean expression expected (not " + markType(this.left.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.left.range as Range
            })

        if (!isBooleanType(this.right.type))
            errors.push({
                message: "Boolean expression expected (not " + markType(this.right.type) + ")",
                type: StaticErrorType.TypeMismatch,
                range: this.right.range as Range
            })
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

    getChildren(): Expression[] {
        return this.args
    }
}

export class UnboundCallExpression extends Expression {
    procedureName: string;
    isInstance: boolean;
    args: Expression[];

    constructor(range: Range, procedureName: string, isInstance: boolean, args: Expression[]) {
        super(range, undefined);
        this.procedureName = procedureName;
        this.isInstance = isInstance;
        this.args = args;
    }

    getChildren(): Expression[] {
        return this.args
    }
}

export class NewObjectExpression extends Expression {
    type: Type;
    args: Expression[];

    constructor(range: Range, type: Type, args: Expression[]) {
        // TODO arg types
        super(range, type);
        this.type = type;
        this.args = args;
    }

    validate(errors: StaticError[]) {
        if (!(this.type instanceof TypeDeclaration))
            errors.push({
                message: "Not an object type",
                type: StaticErrorType.TypeMismatch,
                range: this.range as Range
            })
    }

    getChildren(): Expression[] {
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

    getChildren(): Expression[] {
        return this.args
    }
}

type FieldTarget = Variable | ArrayElementExpression | NewObjectExpression

export class FieldAccessExpression extends Expression {
    target: FieldTarget;
    fieldName: string;
    fieldNameRange: Range;

    static isFieldTarget(obj: any): obj is FieldTarget {
        return (
            obj instanceof Variable ||
            obj instanceof ArrayElementExpression ||
            obj instanceof NewObjectExpression
        );
    }

    constructor(range: Range, target: Expression, fieldName: string, fieldNameRange: Range) {
        let type: Type | undefined
        if (FieldAccessExpression.isFieldTarget(target) && isArrayType(target.type)) {
            if (fieldName == "length")
                type = PrimitiveType.INT
        } else if (FieldAccessExpression.isFieldTarget(target) && target.type instanceof TypeDeclaration) {
            type = target.type.fields.find(field => field.name == fieldName)?.type
        }

        super(range, type);
        this.target = target as FieldTarget;
        this.fieldName = fieldName;
        this.fieldNameRange = fieldNameRange;
    }

    validate(errors: StaticError[]) {
        if (!FieldAccessExpression.isFieldTarget(this.target)) {
            errors.push({
                message: "Invalid expression for field access",
                type: StaticErrorType.TypeMismatch,
                range: (this.target as Expression).range as Range
            })
            return
        }

        if (isArrayType(this.target.type)) {
            if (this.fieldName != "length")
                errors.push({
                    message: "Invalid field " + mark(this.fieldName) + " for arrays",
                    type: StaticErrorType.FieldNotFound,
                    range: this.fieldNameRange
                })
        } else if (this.target.type instanceof TypeDeclaration) {
            if (!this.target.type.fields.some(field => field.name == this.fieldName))
                errors.push({
                    message: "Field " + mark(this.fieldName) + " is not declared in type " + markType(this.target.type),
                    type: StaticErrorType.FieldNotFound,
                    range: this.fieldNameRange
                })
        } else {
            errors.push({
                message: "Not a valid target",
                type: StaticErrorType.Unsupported,
                range: this.target.range as Range
            })
        }
    }

    getChildren(): Expression[] {
        return [this.target]
    }
}

export function setASTParents(root: ASTNode): void {
    class ParentVisitor extends ASTVisitor {
        private currentParent?: ASTNode;

        override visit(node: ASTNode): void {
            const previousParent = this.currentParent;
            node.parent = previousParent;
            this.currentParent = node;
            try {
                super.visit(node);
            } finally {
                this.currentParent = previousParent;
            }
        }
    }

    new ParentVisitor().visit(root);
}

export function visitAll(program: Program) {
    class VisitAll extends  ASTVisitor {
        visitASTNode(node: ASTNode) {
            console.log(node)
        }
    }
    program.accept(new VisitAll())
}

export class ASTVisitor {
    visit(node: ASTNode): void {
        this.visitASTNode(node);
        if (node instanceof Program)
            this.visitProgram(node);
        else if (node instanceof Procedure)
            this.visitProcedure(node);
        else if (node instanceof TypeDeclaration)
            this.visitTypeDeclaration(node);
        else if (node instanceof Declaration)
            this.visitDeclaration(node);
        else if (node instanceof Assignment)
            this.visitAssignment(node);
        else if (node instanceof ArrayAssignment)
            this.visitArrayAssignment(node);
        else if (node instanceof BlockStatement)
            this.visitBlockStatement(node);
        else if (node instanceof IfStatement)
            this.visitIfStatement(node);
        else if (node instanceof WhileStatement)
            this.visitWhileStatement(node);
        else if (node instanceof BreakStatement)
            this.visitBreakStatement(node);
        else if (node instanceof ReturnStatement)
            this.visitReturnStatement(node);
        else if (node instanceof CallStatement)
            this.visitCallStatement(node);
        else if (node instanceof IntLiteral)
            this.visitIntLiteral(node);
        else if (node instanceof DoubleLiteral)
            this.visitDoubleLiteral(node);
        else if (node instanceof BooleanLiteral)
            this.visitBooleanLiteral(node);
        else if (node instanceof StringLiteral)
            this.visitStringLiteral(node);
        else if (node instanceof NullLiteral)
            this.visitNullLiteral(node);
        else if (node instanceof Variable)
            this.visitVariable(node);
        else if (node instanceof ConditionalExpression)
            this.visitConditionalExpression(node);
        else if (node instanceof CastExpression)
            this.visitCastExpression(node);
        else if (node instanceof UnaryExpression)
            this.visitUnaryExpression(node);
        else if (node instanceof ArithmeticExpression)
            this.visitArithmeticExpression(node);
        else if (node instanceof RelationalExpression)
            this.visitRelationalExpression(node);
        else if (node instanceof LogicalExpression)
            this.visitLogicalExpression(node);
        else if (node instanceof ArrayLiteralExpression)
            this.visitArrayLiteralExpression(node);
        else if (node instanceof ArrayAllocationExpression)
            this.visitArrayAllocationExpression(node);
        else if (node instanceof ArrayElementExpression)
            this.visitArrayElementExpression(node);
        else if (node instanceof ArrayLengthExpression)
            this.visitArrayLengthExpression(node);
        else if (node instanceof CallExpression)
            this.visitCallExpression(node);
        else if (node instanceof UnboundCallExpression)
            this.visitUnboundCallExpression(node);
        else if (node instanceof NewObjectExpression)
            this.visitNewObjectExpression(node);
        else if (node instanceof UnboundNewObjectExpression)
            this.visitUnboundNewObjectExpression(node);
        else if (node instanceof FieldAccessExpression)
            this.visitFieldAccessExpression(node);
    }

    visitProgram(program: Program): void {
        program.block?.accept(this);
        program.procedures.forEach(procedure => procedure.accept(this));
        program.typeDeclarations.forEach(typeDeclaration => typeDeclaration.accept(this));
    }

    visitASTNode(_node: ASTNode): void {}

    visitProcedure(procedure: Procedure): void {
        procedure.parameters.forEach(parameter => parameter.accept(this));
        procedure.body?.accept(this);
    }

    visitTypeDeclaration(typeDeclaration: TypeDeclaration): void {
        typeDeclaration.fields.forEach(field => field.accept(this));
    }

    visitDeclaration(declaration: Declaration): void {
        declaration.initializer?.accept(this);
    }

    visitAssignment(assignment: Assignment): void {
        assignment.expression.accept(this);
    }

    visitArrayAssignment(assignment: ArrayAssignment): void {
        assignment.target.accept(this);
        assignment.index.accept(this);
        assignment.expression.accept(this);
    }

    visitBlockStatement(block: BlockStatement): void {
        block.statements.forEach(statement => statement.accept(this));
    }

    visitIfStatement(statement: IfStatement): void {
        statement.guard.accept(this);
        statement.thenBranch.accept(this);
        statement.elseBranch?.accept(this);
    }

    visitWhileStatement(statement: WhileStatement): void {
        statement.guard.accept(this);
        statement.body.accept(this);
    }

    visitBreakStatement(_statement: BreakStatement): void {}

    visitReturnStatement(statement: ReturnStatement): void {
        statement.expression?.accept(this);
    }

    visitCallStatement(statement: CallStatement): void {
        statement.expression.accept(this);
    }

    visitExpression(expression: Expression): void {
        expression.getChildren().forEach(child => child.accept(this));
    }

    visitIntLiteral(expression: IntLiteral): void {
        this.visitExpression(expression);
    }

    visitDoubleLiteral(expression: DoubleLiteral): void {
        this.visitExpression(expression);
    }

    visitBooleanLiteral(expression: BooleanLiteral): void {
        this.visitExpression(expression);
    }

    visitStringLiteral(expression: StringLiteral): void {
        this.visitExpression(expression);
    }

    visitNullLiteral(expression: NullLiteral): void {
        this.visitExpression(expression);
    }

    visitVariable(expression: Variable): void {
        this.visitExpression(expression);
    }

    visitConditionalExpression(expression: ConditionalExpression): void {
        expression.condition.accept(this);
        expression.trueCase.accept(this);
        expression.falseCase.accept(this);
    }

    visitCastExpression(expression: CastExpression): void {
        this.visitExpression(expression);
    }

    visitUnaryExpression(expression: UnaryExpression): void {
        this.visitExpression(expression);
    }

    visitArithmeticExpression(expression: ArithmeticExpression): void {
        this.visitExpression(expression);
    }

    visitRelationalExpression(expression: RelationalExpression): void {
        this.visitExpression(expression);
    }

    visitLogicalExpression(expression: LogicalExpression): void {
        this.visitExpression(expression);
    }

    visitArrayLiteralExpression(expression: ArrayLiteralExpression): void {
        this.visitExpression(expression);
    }

    visitArrayAllocationExpression(expression: ArrayAllocationExpression): void {
        this.visitExpression(expression);
    }

    visitArrayElementExpression(expression: ArrayElementExpression): void {
        this.visitExpression(expression);
    }

    visitArrayLengthExpression(expression: ArrayLengthExpression): void {
        this.visitExpression(expression);
    }

    visitCallExpression(expression: CallExpression): void {
        this.visitExpression(expression);
    }

    visitUnboundCallExpression(expression: UnboundCallExpression): void {
        this.visitExpression(expression);
    }

    visitNewObjectExpression(expression: NewObjectExpression): void {
        this.visitExpression(expression);
    }

    visitUnboundNewObjectExpression(expression: UnboundNewObjectExpression): void {
        this.visitExpression(expression);
    }

    visitFieldAccessExpression(expression: FieldAccessExpression): void {
        this.visitExpression(expression);
    }
}
