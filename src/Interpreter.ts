
import {
    ArithmeticExpression, ArrayAllocationExpression,
    ArrayAssignment, ArrayElementExpression, ArrayLiteralExpression,
    Assignment,
    ASTNode,
    BinaryExpression,
    BlockStatement,
    BooleanLiteral, BreakStatement,
    CallExpression,
    CallStatement,
    Declaration, DoubleLiteral,
    Expression, FieldAccessExpression,
    IfStatement,
    IntLiteral, NewObjectExpression, NullLiteral, PrimitiveType,
    Procedure,
    Program, RelationalExpression,
    ReturnStatement,
    Statement, StringLiteral,
    UnaryExpression,
    UnboundCallExpression, UnboundNewObjectExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";

import {
    buildAST, buildASTandCall
} from "./antlr2ast";
import {NotNull} from "antlr4ts/Decorators";


interface InterpreterResult {
    errors: CompilationError[];
    result: any;
    trace: TraceEntry[];
}

interface CompilationError {
    range: Range;
    type: CompilationErrorType;
    message: string;
    detail?: any;
}

export enum CompilationErrorType {
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

interface TraceEntry {
    range?: Range,
    materialization?: string,
    evaluation?: any,
    call: undefined,
    stack: StackFrame[],
    error?: RuntimeError
}

interface RuntimeError {
    type: RuntimeErrorType;
    message: string;
}

export enum RuntimeErrorType {
    DivisionByZero,
    ArrayIndexOutOfBounds,
    NullPointer,
    StackOverflow,
    MaxIterationsReached,
}

interface StackFrame {
    variables: Map<string, TraceVariable>
}

interface TraceVariable {
    name: string;
    evaluation: any;
    materialization: any;
    declaration?: Range;
}

interface ExpressionEval {
    evaluation?: any;
    materialization?: string;
}


type ExtensionProcedure = (...args: any[]) => ExpressionEval

export class Interpreter {
    private scope: StackFrame[] = []
    private trace: TraceEntry[] = []

    private loopCount = new Map()
    private extensions: Map<string, ExtensionProcedure> = new Map()
    private extensionTypes: Map<string, ExtensionProcedure> = new Map()
    private readonly maxLoopIterations?: number
    private readonly maxCallStack?: number  // TODO max call stack

    constructor(maxLoopIterations: number = 100, maxCallStack: number = 100) {
        this.maxLoopIterations = maxLoopIterations
        this.maxCallStack = maxCallStack
    }

    addExtensionProcedure(name: string, extension: ExtensionProcedure) {
        this.extensions.set(name, extension)
    }

    addExtensionType(name: string, constructor: ExtensionProcedure, ...operations: [string,ExtensionProcedure][]) {
        this.extensionTypes.set(name, constructor)
    }

    compilationError(type: CompilationErrorType, msg: string, node: ASTNode) {
        throw {
            type,
            compilation: true,
            range: node.range,
            value: msg
        };
    }

    loopIteration(loop: WhileStatement) {
        if (this.maxLoopIterations) {
            if (this.loopCount.has(loop)) {
                const value = this.loopCount.get(loop)
                if (value === this.maxLoopIterations)
                    this.addTraceRuntimeError(loop, {
                        type: RuntimeErrorType.MaxIterationsReached,
                        message: "max loop iterations"
                    })
                this.loopCount.set(loop, value + 1);
            } else
                this.loopCount.set(loop, 1);
        }
    }

    loopEnd(loop: WhileStatement) {
        if (this.maxLoopIterations)
            this.loopCount.set(loop, 0);
    }

    topScope(): StackFrame {
        return this.scope[this.scope.length - 1];
    }

    addTrace(node: ASTNode, evaluation: any, materialization?: string) {
        this.trace.push({
            range: node.range,
            materialization,
            evaluation,
            call: undefined, //ctx instanceof JavaGrammarParser.CallContext ? ctx.ID().getText() : null,
            stack: structuredClone(this.scope)
        });
    }

    addTraceRuntimeError(node: ASTNode, error: RuntimeError) {
        this.trace.push({
            range: node.range,
            evaluation: undefined,
            materialization: undefined,
            call: undefined, //ctx instanceof JavaGrammarParser.CallContext ? ctx.ID().getText() : null,
            stack: structuredClone(this.scope),
            error
        });
        throw {
            runtimeError: true
        }
    }

    parseAndRun(source: string, call?: string): InterpreterResult {
        let progAndCall: [Program?, Expression?] = [undefined, undefined]
        try {
            if (call)
                progAndCall = buildASTandCall(source, call)
            else
                progAndCall = [buildAST(source), undefined]
        } catch (e: any) {
            if(e.compilation)
            return {
                result: undefined,
                trace: [],
                errors: [{
                    range: e.range,
                    type: e.compilation,
                    message: e.message,
                    detail: e.detail
                }]
            }
            else
                console.log(e.stack)
        }
        const [ast, exp] = progAndCall
        return this.runProgram(ast as Program, exp);
    }

    runProgram(program: Program, call?: Expression): InterpreterResult {
        if (!program.block && !call)
            throw {
                range: undefined,
                type: CompilationErrorType.SyntaxError,
                message: "No block or call provided in the program"
            }

        if (call && program.block) {
            throw {
                range: call.range,
                type: CompilationErrorType.SyntaxError,
                message: "Cannot have both a block and a call in the program"
            }
        }

        return this.tryRun(() => {
            if (program.block) {
                this.scope.push({
                    variables: new Map()
                })
                return this.tryRun(() => {
                    (program.block as BlockStatement).statements.forEach(i => this.execute(i));
                    this.addTrace((program.block as BlockStatement), undefined, undefined)
                    this.scope.pop()
                    return {
                        errors: [],
                        result: undefined,
                        trace: structuredClone(this.trace)
                    }
                })
            } else {
                return this.tryRun(() => {
                    return {
                        errors: [],
                        result: this.evaluate(call as Expression),
                        trace: structuredClone(this.trace)
                    }
                });
            }
        })
    }

    tryRun(exec: () => InterpreterResult):
        InterpreterResult {
        try {
            return exec();
        } catch (e: any) {
            if (e.compilation)
                return {
                    errors: [ {
                        range: e.range,
                        type: e.compilation,
                        message: e.value,
                        detail: e.detail
                    }],
                    result: undefined,
                    trace: structuredClone(this.trace)
                }
            else if (e.runtimeError) {
                return {
                    errors: [],
                    result: undefined,
                    trace: structuredClone(this.trace)
                }
            } else throw e
        }
    }

    execute(s: Statement) {
        if (s instanceof BlockStatement)
            s.statements.forEach(i => this.execute(i));
        else if (s instanceof Declaration) {
            if (s.initializer != null) {
                const exp = this.evaluate(s.initializer as Expression)
                this.addTrace(s, exp.evaluation, exp.materialization)
                this.topScope().variables.set(s.name, {
                    name: s.name,
                    evaluation: exp.evaluation,
                    materialization: exp.materialization,
                    declaration: s.range
                })
            }
        } else if (s instanceof Assignment) {
            const exp = this.evaluate(s.expression);
            this.addTrace(s.expression, exp.evaluation, exp.materialization)
            this.topScope().variables.set(s.variable.name, {
                name: s.variable.name,
                evaluation: exp.evaluation,
                materialization: exp.materialization,
                declaration: s.variable.range
            })
        }
        else if(s instanceof ArrayAssignment) {
            const arrayVal = this.evaluate(s.target).evaluation

            if(arrayVal == null)
                this.addTraceRuntimeError(s.target, {
                        type: RuntimeErrorType.NullPointer,
                        message: "Reference is null"
                    }
                )
            // TODO null


            const index = this.evaluate(s.index).evaluation
            if(index < 0 || index >= arrayVal.length)
                this.addTraceRuntimeError(s.index, {
                        type: RuntimeErrorType.ArrayIndexOutOfBounds,
                        message: "Array index out of bounds: " + index
                    }
                )
            arrayVal[index] = this.evaluate(s.expression).evaluation
        }
        else if (s instanceof IfStatement) {
            const conditionVal = this.evaluate(s.guard);
            if (conditionVal.evaluation)
                this.execute(s.thenBranch);
            else if (s.elseBranch)
                this.execute(s.elseBranch as Statement);
        } else if (s instanceof WhileStatement) {
            while (true) {
                this.loopIteration(s)
                const conditionVal = this.evaluate(s.guard)
                if (!conditionVal.evaluation) break;
                try {
                    this.execute(s.body);
                } catch (e: any) {
                    if (e.break_)
                        break
                    else
                        throw e
                }
            }
            this.loopEnd(s)
        } else if (s instanceof BreakStatement) {
            throw {
                break_: true
            }
        } else if (s instanceof CallStatement) {
            if (s.expression instanceof CallExpression)
                this.invocation(s.expression)
            else {
                this.handleUnboundCall(s.expression as UnboundCallExpression);
            }
        } else if (s instanceof ReturnStatement) {
            throw this.evaluate(s.expression as Expression)
        } else
            throw new Error("Unsupported statement type: " + (s as any).constructor.name);
    }


    private handleUnboundCall(exp: UnboundCallExpression): ExpressionEval {
        const ext = this.extensions.get(exp.procedureName)
        if (ext) {
            const args = exp.args.map(a => this.evaluate(a).evaluation)
            return ext.call(null, args)
        } else
            throw {
                compilation: CompilationErrorType.MethodNotFound,
                range: exp.range,
                message: `No method named '${exp.procedureName}' found`,
            }
    }

    evaluate(e: Expression):
        ExpressionEval {
        if (e instanceof Variable) {
            let variable = this.topScope().variables.get((e as Variable).declaration.name);

            if(!variable && this.topScope().variables.get("this")) {
                const fieldVal = this.topScope().variables.get("this")?.evaluation[(e as Variable).declaration.name]
                if(fieldVal === undefined)
                    this.compilationError(CompilationErrorType.UndeclaredVariable, `Variable ${e.declaration.name} not declared`, e)
                return {
                    evaluation: fieldVal,
                    materialization: undefined
                }
            }

            // TODO remove this and rely on static checking to ensure variable is always found
            if (!variable)
                this.compilationError(CompilationErrorType.UndeclaredVariable, `Variable ${e.declaration.name} not declared`, e)

            return {
                evaluation: variable?.evaluation,
                materialization: variable?.materialization
            }
        } else if (e instanceof IntLiteral)
            return {
                evaluation: e.value
            }

        else if (e instanceof DoubleLiteral)
            return {
                evaluation: e.value
            }

        else if (e instanceof BooleanLiteral)
            return {
                evaluation: e.value
            }
        else if (e instanceof StringLiteral)
            return {
                evaluation: e.value
            }

        else if(e instanceof NullLiteral)
            return {
                 evaluation: null
            }
        else if (e instanceof UnaryExpression) {
            const expVal = this.evaluate(e.expression);
            if (e.operator === "-") {
                return {
                    evaluation: -expVal.evaluation,
                    materialization: expVal.materialization
                }
            }

            else if (e.operator === "!") {
                return {
                    evaluation: !expVal.evaluation,
                    materialization: expVal.materialization
                }
            }
            else
                throw {
                    message: "Unsupported unary operator:" +  e.operator,
                    compilation: CompilationErrorType.Unsupported,
                    range: e.range,
                    detail: "INTERPRETER-evaluate"
                }

        } else if (e instanceof BinaryExpression) {
            let evaluation = undefined
            let materialization = undefined
            if (['&&', '||'].includes(e.operator)) {
                [evaluation,materialization] = this.handleLogical(e.left, e.right, e.operator)
            }
            else {
                const leftVal = this.evaluate(e.left);
                const rightVal = this.evaluate(e.right);

                if (e.operator == '+' && (typeof leftVal.evaluation === "string" || typeof rightVal.evaluation === "string"))
                    evaluation = leftVal.evaluation.toString() + rightVal.evaluation.toString()
                else if (ArithmeticExpression.validOperator(e.operator))
                    evaluation = this.handleArithmetic(
                        e.left, leftVal,
                        e.right, rightVal,
                        e.operator);

                else if (RelationalExpression.validOperator(e.operator))
                    evaluation = this.handleComparison(
                        e.left, leftVal,
                        e.right, rightVal,
                        e.operator);

                materialization = leftVal.evaluation + " " + e.operator + " " + rightVal.evaluation;
            }

            if (evaluation === undefined)
                throw {
                    message: "Unsupported binary operator:" +  e.operator,
                    compilation: CompilationErrorType.Unsupported,
                    range: e.range,
                    detail: "INTERPRETER-evaluate"
                }

            this.addTrace(e, evaluation, materialization)
            return {
                evaluation,
                materialization
            }
        } else if (e instanceof CallExpression) {
            return this.invocation(e as CallExpression)

        } else if(e instanceof UnboundCallExpression) {
            return this.handleUnboundCall(e)
        }
        else if (e instanceof NewObjectExpression) {
            const obj: any = {$type: e.type.name}
            const args = e.args.map(a => this.evaluate(a))
            if (e.type.isRecord) {
                e.type.fields.forEach((f, i) => {
                    obj[f.name] = args[i].evaluation
                })
            }
            return {
                evaluation: obj,
                materialization: `new ${e.type.name}(${args.map(a => a.materialization || a.evaluation).join(", ")})`
            }
        }
        else if (e instanceof UnboundNewObjectExpression) {
            const ext = this.extensionTypes.get(e.typeName)
            if (ext) {
                const args = e.args.map(a => this.evaluate(a).evaluation)
                return ext.call(null, args)
            } else
                throw {
                    compilation: CompilationErrorType.MethodNotFound,
                    range: e.range,
                    message: `No type named '${e.typeName}' found`,
                }
        }
        else if(e instanceof FieldAccessExpression) {
            // TODO null check
            const objVal = this.evaluate(e.target)
            if(objVal.evaluation == null)
                this.addTraceRuntimeError(
                    e.target,
                    {
                        type: RuntimeErrorType.NullPointer,
                        message: "Reference is null"
                    }
                )
            return {
                evaluation: objVal.evaluation[e.fieldName],
                materialization: `${objVal.materialization}.${e.fieldName}`
            }
        }
        else if(e instanceof ArrayLiteralExpression) {
            const array = e.elements.map(el => this.evaluate(el).evaluation)
            return {
                evaluation: array,
                materialization: array.toString()
            }
        }
        else if(e instanceof ArrayAllocationExpression) {
            const length = this.evaluate(e.dimensions[0]).evaluation // TODO multidim
            const array = Array.from({length})
            if(e.componentType == PrimitiveType.INT)
                for(let i = 0; i != length; i++)
                    array[i] = 0
            // TODO other defaults
            return {
                evaluation: array,
                materialization: array.toString()
            }
        }
        else if(e instanceof ArrayElementExpression) {
            const arrayVal = this.evaluate(e.target).evaluation as Array<any>

            // TODO null check

            const index = this.evaluate(e.index).evaluation
            if(index < 0 || index >= arrayVal.length)
                this.addTraceRuntimeError(e.index, {
                        type: RuntimeErrorType.ArrayIndexOutOfBounds,
                        message: "Array index out of bounds: " + index
                    }
                )

            return {
                evaluation: arrayVal[index],
                materialization: undefined // TODO
            }
        }
        else throw {
            message: "Unsupported expression type:" + (e as any).constructor.name,
            compilation: CompilationErrorType.Unsupported,
            range: e.range,
            detail: "INTERPRETER"
        }
    }

    invocation(call: CallExpression):
        ExpressionEval {
        const p = call.procedure
        const variables: Map<string, TraceVariable> = new Map()
        if(p.instance) {
            const thisVal = this.evaluate(call.args[0])
            variables.set("this", {
                name: "this",
                evaluation: thisVal.evaluation,
                materialization: thisVal.materialization
            })
        }
        call.args.forEach((e, i) => {
            if(i == 0 && call.instanceCall) return;
            const eVal = this.evaluate(e)
            variables.set(p.parameters[i].name, {
                name: p.parameters[i].name,
                evaluation: eVal.evaluation,
                materialization: eVal.materialization,
                declaration: p.parameters[i].range
            })
        })
        this.scope.push({
            variables
        })
        try {
            p.body?.statements?.forEach(s => this.execute(s));
        } catch (e: any) {
            if (e.evaluation !== undefined) {
                this.scope.pop()
                return e
            } else
                throw e
        }
        if (call.procedure.returnType) {
            throw {
                range: p.nameRange,
                type: CompilationErrorType.MissingReturn,
                message: `Procedure ${p.name} is expected to return a value of type ${p.returnType} but no return statement was reached`
            }
        }
        this.scope.pop()
        return {
            evaluation: undefined,
            materialization: undefined
        }
    }

    handleArithmetic(leftExp: Expression, leftVal: any, rightExp: Expression, rightVal: any, operator: string):
        number {
        let left = leftVal.evaluation;
        let right = rightVal.evaluation;
        switch (operator) {
            case "+":
                return left + right;
            case "-":
                return left - right;
            case "*":
                return left * right;
            case "/":
                return left / right;
            case "%":
                return left % right;
            default:
                throw {
                    range: leftExp.range,
                    type: CompilationErrorType.Unsupported,
                    message: `Unsupported operator: " + operator`,
                    detail: "INTERPRETER"
                }
        }
    }

    handleComparison(leftExp: Expression, leftVal: any, rightExp: Expression, rightVal: any, operator: string):
        boolean {
        let left = leftVal.evaluation;
        let right = rightVal.evaluation;

        if (typeof left !== typeof right) {
            throw {
                range: leftExp.range,
                type: CompilationErrorType.TypeMismatch,
                message: `Type mismatch: cannot compare ${left} with ${right}`,
                detail: "INTERPRETER-handleComparison"
            }
        }

        switch (operator) {
            case "==":
                return left === right;
            case "!=":
                return left !== right;
            case ">":
                return left > right;
            case "<":
                return left < right;
            case ">=":
                return left >= right;
            case "<=":
                return left <= right;
            default:
                throw {
                    range: leftExp.range,
                    type: CompilationErrorType.Unsupported,
                    message: `Unsupported operator: " + operator`,
                    detail: "INTERPRETER-handleComparison"
                }
        }
    }

    handleLogical(leftExp: Expression, rightExp: Expression, operator: string): [boolean, string] {
            let leftVal = this.evaluate(leftExp).evaluation;
        switch (operator) {
            case "&&":
                if(!leftVal)
                    return [false, leftVal + " && ?"]
                else {
                    const rightVal = this.evaluate(rightExp).evaluation
                    return [rightVal, leftVal + " && " + rightVal];
                }
            case "||":
                if(leftVal)
                    return [true, leftVal + " || ?"]
                else {
                    const rightVal = this.evaluate(rightExp).evaluation
                    return [rightVal, leftVal + " || " + rightVal]
                }

            default:
                throw {
                    range: leftExp.range,
                    type: CompilationErrorType.Unsupported,
                    message: `Unsupported operator: " + operator`,
                    detail: "INTERPRETER-handleLogical"
                }
        }
    }
}

