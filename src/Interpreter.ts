import {
    ArithmeticExpression,
    ArrayAllocationExpression,
    ArrayAssignment,
    ArrayElementExpression,
    ArrayLiteralExpression,
    Assignment,
    ASTNode,
    BinaryExpression,
    BlockStatement,
    BooleanLiteral,
    BreakStatement,
    CallExpression,
    CallStatement,
    Declaration,
    DoubleLiteral,
    Expression,
    FieldAccessExpression,
    IfStatement,
    IntLiteral,
    NewObjectExpression,
    NullLiteral,
    PrimitiveType,
    Program,
    RelationalExpression,
    ReturnStatement,
    Statement,
    StaticError,
    StaticErrorType,
    StringLiteral,
    UnaryExpression,
    UnboundCallExpression,
    UnboundNewObjectExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";

import {buildAST, buildASTandCall} from "./antlr2ast";
import {last} from "./utils";


interface InterpreterResult {
    callError: string | undefined;
    error: StaticError | undefined;
    result: any;
    trace?: TraceEntry;
    program?: Program;
    call?: Expression;
}

export interface TraceEntry {
    stack: StackFrame,
    children?: TraceEntry[],
    parent?: TraceEntry,
    range?: Range,
    materialization?: string,
    evaluation?: any,
    call?: boolean,
    returnStatement?: boolean,
    error?: RuntimeError
}

interface RuntimeError {
    type: RuntimeErrorType;
    message: string;
    range?: Range;
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
    extension?: any;
}


type ExtensionProcedure = (...args: any[]) => ExpressionEval

export class Interpreter {
    private scope: StackFrame[] = []
    private trace?: TraceEntry = undefined
    private traceStack: TraceEntry[] = []
    private traceOn = true

    private loopCount = new Map()
    private extensions: Map<string, ExtensionProcedure> = new Map()
    private extensionTypes: Map<string, ExtensionProcedure> = new Map()
    private readonly maxLoopIterations?: number
    private readonly maxCallStack?: number

    constructor(maxLoopIterations: number = 100, maxCallStack: number = 50) {
        this.maxLoopIterations = maxLoopIterations
        this.maxCallStack = maxCallStack
    }

    addExtensionProcedure(name: string, extension: ExtensionProcedure) {
        this.extensions.set(name, extension)
    }

    addExtensionType(name: string, constructor: ExtensionProcedure, ...operations: [string, ExtensionProcedure][]) {
        this.extensionTypes.set(name, constructor)
    }

    loopIteration(loop: WhileStatement) {
        if (this.maxLoopIterations) {
            if (this.loopCount.has(loop)) {
                const value = this.loopCount.get(loop)
                if (value === this.maxLoopIterations)
                    this.addTraceRuntimeError(loop, {
                        type: RuntimeErrorType.MaxIterationsReached,
                        message: "max loop iterations",
                        range: loop.range
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

    private addTrace(node: ASTNode, call: boolean, isReturn: boolean, evaluation: any, materialization?: string, extension?: any) {
        if (!this.traceOn)
            return

        const t = this.addTraceRange(node.range, call, isReturn, evaluation, materialization, extension)
        if (node instanceof CallExpression && call) {
            this.traceStack.push(t)
            if (!this.trace) {
                this.trace = t
                t.range = node.procedure.nameRange
            }
        }
    }

    private addCallTraceEnd(call: CallExpression, evaluation: any, materialization: any) {
        if (!this.traceOn)
            return

        if (this.traceStack.length > 1)
            this.traceStack.pop()

        this.addTrace(call, false, false, evaluation, materialization)
    }


    private addTraceRange(range: Range | undefined, call: boolean, returnStatement: boolean, evaluation: any, materialization?: string, extension?: any) {
        const entry = {
            stack: structuredClone(last(this.scope)),
            range,
            materialization,
            evaluation,
            call,
            children: call ? [] : undefined,
            parent: last(this.traceStack),
            returnStatement,
            extension
        }
        if (range != undefined)
            last(this.traceStack).children?.push(entry)
        return entry
    }

    private addTraceRuntimeError(node: ASTNode, error: RuntimeError) {
        last(this.traceStack).children?.push({
            stack: structuredClone(last(this.scope)),
            range: node.range,
            error
        });
        throw {
            runtimeError: true
        }
    }


    execNoTrace(exec: () => any) {
        this.traceOn = false
        const ret = exec()
        this.traceOn = true
        return ret
    }

    parseAndRun(source: string, call?: string): InterpreterResult {
        let progAndCall: [Program?, Expression?] = [undefined, undefined]
        try {
            if (call)
                progAndCall = buildASTandCall(source, call)
            else
                progAndCall = [buildAST(source), undefined]
        } catch (e: any) {
            if(e.program?.block && call)
                return {
                    callError: "No call should be provided when executing scripts.",
                    result: undefined,
                    trace: undefined,
                    error: undefined
                }
            if(e.callError) {
                return {
                    callError: e.callError,
                    result: undefined,
                    trace: undefined,
                    error: {
                        range: e.range,
                        type: e.compilation,
                        message: e.message,
                        detail: e.detail
                    }
                }
            }
            else if (e.compilation)
                return {
                    callError: undefined,
                    result: undefined,
                    trace: undefined,
                    error: {
                        range: e.range,
                        type: e.compilation,
                        message: e.message,
                        detail: e.detail
                    }
                }
        }
        const [program, expCall] = progAndCall

        if(program?.procedures && program.procedures.length > 0 && !expCall) {
            return {
                callError: "No call provided for execution.",
                error: undefined,
                result: undefined,
                trace: undefined
            }
        }

        return this.runProgram(program as Program, expCall);
    }

    runProgram(program: Program, call?: Expression): InterpreterResult {
        if (program.block) {
            this.scope.push({
                variables: new Map()
            })
            this.trace = {
                stack: structuredClone(last(this.scope)),
                children: [],
            }
            this.traceStack.push(this.trace)
            return this.tryRun(() => {
                // script execution
                (program.block as BlockStatement).statements.forEach(i => this.execute(i));
                this.addTrace((program.block as BlockStatement), false, false, undefined, undefined)
                this.scope.pop()
                return {
                    callError: undefined,
                    error: undefined,
                    result: undefined,
                    trace: structuredClone(this.trace),
                    program,
                    call
                }
            })
        } else {
            return this.tryRun(() => {
                return {
                    callError: undefined,
                    error: undefined,
                    result: this.evaluate(call as Expression),
                    trace: structuredClone(this.trace),
                    program,
                    call
                }
            });
        }

    }

    tryRun(exec: () => InterpreterResult):
        InterpreterResult {
        try {
            return exec();
        } catch (e: any) {
            if (e.compilation)
                return {
                    callError: undefined,
                    error: {
                        range: e.range,
                        type: e.compilation,
                        message: e.message,
                        detail: e.detail
                    },
                    result: undefined,
                    trace: structuredClone(this.trace)
                }
            else if (e.runtimeError) {
                return {
                    callError: undefined,
                    error: undefined,
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
                this.addTrace(s, false, false, exp.evaluation, exp.materialization)
                this.topScope().variables.set(s.name, {
                    name: s.name,
                    evaluation: exp.evaluation,
                    materialization: exp.materialization,
                    declaration: s.range
                })
            }
        } else if (s instanceof Assignment) {
            const exp = this.evaluate(s.expression);

            const v = this.topScope().variables.get(s.variable.name)

            function paren(mat: string | undefined): string | undefined {
                if (mat == undefined)
                    return ""
                else if (mat.includes(" "))
                    return "(" + mat + ")"
                else
                    return mat
            }
            if (s.expression instanceof BinaryExpression && s.expression.left instanceof Variable && s.expression.left.declaration == s.variable) {
                this.topScope().variables.set(s.variable.name, {
                    name: s.variable.name,
                    evaluation: exp.evaluation,
                    materialization: paren(v?.materialization) + " " + s.expression.operator + " " + this.evaluate(s.expression.right).evaluation,
                    declaration: s.variable.range
                })
            }
            else if (s.expression instanceof BinaryExpression && s.expression.right instanceof Variable && s.expression.right.declaration == s.variable) {
                this.topScope().variables.set(s.variable.name, {
                    name: s.variable.name,
                    evaluation: exp.evaluation,
                    materialization: this.evaluate(s.expression.left).evaluation + " " + s.expression.operator + " " + paren(v?.materialization),
                    declaration: s.variable.range
                })
            }
            else {
                this.addTrace(s.expression, false, false, exp.evaluation, exp.materialization)
                this.topScope().variables.set(s.variable.name, {
                    name: s.variable.name,
                    evaluation: exp.evaluation,
                    materialization: exp.materialization,
                    declaration: s.variable.range
                })
            }
        } else if (s instanceof ArrayAssignment) {
            const arrayVal = this.evaluate(s.target).evaluation

            if (arrayVal == null)
                this.addTraceRuntimeError(s.target, {
                        type: RuntimeErrorType.NullPointer,
                        message: "Reference is null",
                        range: s.target.range
                    }
                )

            const index = this.evaluate(s.index).evaluation
            if (index < 0 || index >= arrayVal.length)
                this.addTraceRuntimeError(s.index, {
                        type: RuntimeErrorType.ArrayIndexOutOfBounds,
                        message: "Array index out of bounds: " + index,
                        range: s.target.range
                    }
                )
            arrayVal[index] = this.evaluate(s.expression).evaluation
        } else if (s instanceof IfStatement) {
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
            let exp = undefined
            if (s.expression) {
                this.addTraceRange(s.returnRange(), false, true, undefined, this.materialize(s.expression))
                exp = this.evaluate(s.expression, true)
                this.addTraceRange(s.returnRange(), false, true, exp.evaluation, exp.evaluation?.toString() ?? null)
                throw exp
            } else {
                this.addTrace(s, false, true, undefined, undefined)
                throw {
                    evaluation: undefined,
                    materialization: undefined
                }
            }
        } else
            throw new Error("Unsupported statement type: " + (s as any).constructor.name);
    }


    private handleUnboundCall(exp: UnboundCallExpression): ExpressionEval {
        const ext = this.extensions.get(exp.procedureName)
        if (ext) {
            const args = exp.args.map(a => this.evaluate(a).evaluation)
            const res = ext(args)
            this.addTrace(exp, false, true, res.evaluation, res.materialization, res.extension)
            return {evaluation: res.evaluation, materialization: res.materialization}
        } else {
            throw {
                compilation: StaticErrorType.MethodNotFound,
                range: exp.range,
                message: `No method named '${exp.procedureName}' found`,
            }
        }
    }

    materialize(e: Expression): string | undefined {
        if (e instanceof Variable) {
            let variable = this.topScope().variables.get((e as Variable).declaration.name);

            if (!variable && this.topScope().variables.get("this")) {
                const fieldVal = this.topScope().variables.get("this")?.evaluation[(e as Variable).declaration.name]
                return fieldVal.evaluation
            } else
                return variable?.evaluation
        } else if (e instanceof BinaryExpression) {
            return this.materialize(e.left) + " " + e.operator + " " + this.materialize(e.right)
        } else if (e instanceof CallExpression) {
            return e.procedure.name + "(" + e.args.map(a => this.materialize(a)).join() + ")"
        } else
            return e.range?.text
    }

    evaluate(e: Expression, isReturn: boolean = false):
        ExpressionEval {
        if (e instanceof Variable) {
            let variable = this.topScope().variables.get((e as Variable).declaration.name);

            if (!variable && this.topScope().variables.get("this")) {
                const fieldVal = this.topScope().variables.get("this")?.evaluation[(e as Variable).declaration.name]
                return {
                    evaluation: fieldVal,
                    materialization: undefined
                }
            }
            return {
                evaluation: variable?.evaluation,
                materialization: e.type == PrimitiveType.DOUBLE && Number.isInteger(variable?.evaluation) ? variable?.materialization + ".0" : variable?.materialization
            }
        } else if (e instanceof IntLiteral)
            return {
                evaluation: e.value,
                materialization: e.value.toString()
            }

        else if (e instanceof DoubleLiteral)
            return {
                evaluation: e.value,
                materialization: e.value.toString()
            }

        else if (e instanceof BooleanLiteral)
            return {
                evaluation: e.value,
                materialization: e.value.toString()
            }
        else if (e instanceof StringLiteral)
            return {
                evaluation: e.value,
                materialization: e.value.toString()
            }

        else if (e instanceof NullLiteral)
            return {
                evaluation: null,
                materialization: "null"
            }
        else if (e instanceof UnaryExpression) {
            const expVal = this.evaluate(e.expression);
            if (e.operator === "-") {
                this.addTrace(e, false, isReturn, -expVal.evaluation, "-(" + expVal.evaluation + ")")
                return {
                    evaluation: -expVal.evaluation,
                    materialization: expVal.materialization
                }
            } else if (e.operator === "!") {
                this.addTrace(e, false, isReturn, !expVal.evaluation, "!(" + expVal.evaluation + ")")
                return {
                    evaluation: !expVal.evaluation,
                    materialization: expVal.materialization
                }
            } else
                throw {
                    message: "Unsupported unary operator:" + e.operator,
                    compilation: StaticErrorType.Unsupported,
                    range: e.range,
                    detail: "INTERPRETER-evaluate"
                }

        } else if (e instanceof BinaryExpression) {
            let evaluation = undefined
            let materialization = undefined
            if (['&&', '||'].includes(e.operator)) {
                [evaluation, materialization] = this.handleLogical(e.left, e.right, e.operator)
            } else {
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

                const left = e.left.type == PrimitiveType.DOUBLE && Number.isInteger(leftVal.evaluation) ? leftVal.evaluation.toString() + ".0" : leftVal.evaluation
                const right = e.right.type == PrimitiveType.DOUBLE && Number.isInteger(rightVal.evaluation) ? rightVal.evaluation.toString() + ".0" : rightVal.evaluation
                materialization = left + " " + e.operator + " " + right;
            }

            if (evaluation === undefined)
                throw {
                    message: "Unsupported binary operator:" + e.operator,
                    compilation: StaticErrorType.Unsupported,
                    range: e.range,
                    detail: "INTERPRETER-evaluate"
                }

            this.addTrace(e, false, isReturn, evaluation, materialization)
            return {
                evaluation,
                materialization
            }
        } else if (e instanceof CallExpression) {
            return this.invocation(e as CallExpression, isReturn)

        } else if (e instanceof UnboundCallExpression) {
            return this.handleUnboundCall(e)
        } else if (e instanceof NewObjectExpression) {
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
        } else if (e instanceof UnboundNewObjectExpression) {
            const ext = this.extensionTypes.get(e.typeName)
            if (ext) {
                const args = e.args.map(a => this.evaluate(a).evaluation)
                return ext.call(null, args)
            } else
                throw {
                    compilation: StaticErrorType.MethodNotFound,
                    range: e.range,
                    message: `No type named '${e.typeName}' found`,
                }
        } else if (e instanceof FieldAccessExpression) {
            // TODO null check
            const objVal = this.evaluate(e.target)
            if (objVal.evaluation == null)
                this.addTraceRuntimeError(
                    e.target,
                    {
                        type: RuntimeErrorType.NullPointer,
                        message: "Reference is null",
                        range: e.target.range
                    }
                )
            return {
                evaluation: objVal.evaluation[e.fieldName],
                materialization: `${objVal.materialization}.${e.fieldName}`
            }
        } else if (e instanceof ArrayLiteralExpression) {
            const array = e.elements.map(el => this.evaluate(el).evaluation)
            return {
                evaluation: array,
                materialization: "[" + array.join() + "]"
            }
        } else if (e instanceof ArrayAllocationExpression) {
            const length = this.evaluate(e.dimensions[0]).evaluation // TODO multidim
            const array = Array.from({length})
            if (e.componentType == PrimitiveType.INT)
                for (let i = 0; i != length; i++)
                    array[i] = 0
            // TODO other defaults
            return {
                evaluation: array,
                materialization: "[" + array.join() + "]"
            }
        } else if (e instanceof ArrayElementExpression) {
            const arrayVal = this.evaluate(e.target).evaluation as Array<any>

            // TODO null check

            const index = this.evaluate(e.index).evaluation
            if (index < 0 || index >= arrayVal.length)
                this.addTraceRuntimeError(e.index, {
                        type: RuntimeErrorType.ArrayIndexOutOfBounds,
                        message: "Array index out of bounds: " + index,
                        range: e.index.range
                    }
                )

            return {
                evaluation: arrayVal[index],
                materialization: undefined // TODO
            }
        } else throw {
            message: "Unsupported expression type:" + (e as any).constructor.name,
            compilation: StaticErrorType.Unsupported,
            range: e.range,
            detail: "INTERPRETER"
        }
    }

    invocation(call: CallExpression, isReturn: boolean = false):
        ExpressionEval {
        if(this.scope.length == this.maxCallStack)
            this.addTraceRuntimeError(call, {
                    type: RuntimeErrorType.StackOverflow,
                    message: "Maximum size of call stack reached (" + this.maxCallStack + ")",
                    range: call.range
                }
            )
        const p = call.procedure

        const variables: Map<string, TraceVariable> = new Map()
        if (p.instance) {
            const thisVal = this.evaluate(call.args[0])
            variables.set("this", {
                name: "this",
                evaluation: thisVal.evaluation,
                materialization: thisVal.materialization
            })
        }
        const argValues = call.args.map((e, i) => {
            if (i == 0 && call.instanceCall) return;
            const eVal = this.evaluate(e)
            variables.set(p.parameters[i].name, {
                name: p.parameters[i].name,
                evaluation: eVal.evaluation,
                materialization: eVal.materialization,
                declaration: p.parameters[i].range
            })
            return eVal
        })
        const mat = p.name + "(" + argValues.map(a => a?.materialization).join() + ")"

        this.scope.push({
            variables
        })
        this.addTrace(call, true, isReturn, undefined, mat)

        try {
            p.body?.statements?.forEach(s => this.execute(s));
        } catch (e: any) {
            if ('evaluation' in e) {
                this.addCallTraceEnd(call, e.evaluation, e.materialization)
                this.scope.pop()
                return e
            } else
                throw e
        }
        if (call.procedure.returnType != PrimitiveType.VOID) {
            throw {
                range: p.nameRange,
                type: StaticErrorType.MissingReturn,
                message: `Procedure ${p.name} is expected to return a value of type ${p.returnType} but no return statement was reached`
            }
        }
        this.addCallTraceEnd(call, undefined, undefined)
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
                if (leftExp.type == PrimitiveType.INT && rightExp.type == PrimitiveType.INT) // TODO remove to translation? (java-specific)
                    return (left / right) | 0
                else
                    return left / right;
            case "%":
                return left % right;
            default:
                throw {
                    range: leftExp.range,
                    type: StaticErrorType.Unsupported,
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
                type: StaticErrorType.TypeMismatch,
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
                    type: StaticErrorType.Unsupported,
                    message: `Unsupported operator: " + operator`,
                    detail: "INTERPRETER-handleComparison"
                }
        }
    }

    handleLogical(leftExp: Expression, rightExp: Expression, operator: string): [boolean, string] {
        let leftVal = this.evaluate(leftExp).evaluation;
        switch (operator) {
            case "&&":
                if (!leftVal)
                    return [false, leftVal + " && ?"]
                else {
                    const rightVal = this.evaluate(rightExp).evaluation
                    return [rightVal, leftVal + " && " + rightVal];
                }
            case "||":
                if (leftVal)
                    return [true, leftVal + " || ?"]
                else {
                    const rightVal = this.evaluate(rightExp).evaluation
                    return [rightVal, leftVal + " || " + rightVal]
                }

            default:
                throw {
                    range: leftExp.range,
                    type: StaticErrorType.Unsupported,
                    message: `Unsupported operator: " + operator`,
                    detail: "INTERPRETER-handleLogical"
                }
        }
    }
}

