import JavaGrammarLexer from "./generated/JavaGrammarLexer";
import JavaGrammarParser from "./generated/JavaGrammarParser";
import {CharStreams, CommonTokenStream,} from "antlr4";

import {
    Assignment,
    ASTNode,
    BinaryExpression,
    BlockStatement,
    BooleanLiteral,
    CallExpression,
    CallStatement,
    Declaration,
    Expression,
    IfStatement,
    IntLiteral,
    Procedure,
    Program,
    ReturnStatement,
    Statement,
    UnaryExpression,
    UnboundCallExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";

import {parseExpression, parseTreeToAST} from "./antlr2ast";

export function getParser(input: string) {
    const chars = CharStreams.fromString(input);
    const lexer = new JavaGrammarLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    return new JavaGrammarParser(tokens);
}

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


type Extension = (...args: any[]) => ExpressionEval

export class Interpreter {
    private scope: StackFrame[] = []
    private trace: TraceEntry[] = []

    private loopCount = new Map()
    private extensions: Map<string, Extension> = new Map()
    private readonly maxLoopIterations?: number
    private readonly maxCallStack?: number  // TODO

    constructor(maxLoopIterations: number = 100, maxCallStack: number = 100) {
        this.maxLoopIterations = maxLoopIterations
        this.maxCallStack = maxCallStack
    }

    addExtensionFunction(name: string, extension: Extension) {
        this.extensions.set(name, extension)
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
        let program: Program
        let callExp: [Program?, Expression?] = [undefined, undefined]
        try {
            program = parseTreeToAST(getParser(source).unit())
            if (call)
                callExp = parseExpression(getParser(source).unit(), getParser(call).exp())
        } catch (e: any) {
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
        }
        const [ast, exp] = call ? callExp : [program, undefined];
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

        if (program.block) {
            this.scope.push({
                variables: new Map()
            })
            try {
                program.block.statements.forEach(i => this.execute(i));
                this.addTrace(program.block, undefined, undefined)
                this.scope.pop()
                return {
                    errors: [],
                    result: undefined,
                    trace: structuredClone(this.trace)
                }
            } catch (e: any) {
                if (e.compilation)
                    return {
                        errors: [e],
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
        } else {
            return {
                errors: [],
                result: this.evaluate(call as Expression),
                trace: structuredClone(this.trace)
            }
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
            });
        } else if (s instanceof IfStatement) {
            const conditionVal = this.evaluate(s.guard);
            if (typeof conditionVal.evaluation !== "boolean")
                throw {
                    range: s.guard.range,
                    type: CompilationErrorType.TypeMismatch,
                    message: `Type mismatch: expected boolean expression`
                }
            if (conditionVal.evaluation)
                this.execute(s.thenBranch);
            else if (s.elseBranch)
                this.execute(s.elseBranch as Statement);
        } else if (s instanceof WhileStatement) {
            while (true) {
                this.loopIteration(s)
                const conditionVal = this.evaluate(s.guard);
                if (typeof conditionVal.evaluation !== "boolean")
                    throw {
                        range: s.guard.range,
                        type: CompilationErrorType.TypeMismatch,
                        message: `Type mismatch: expected boolean expression`
                    }
                if (!conditionVal.evaluation) break;
                this.execute(s.body);
            }
            this.loopEnd(s)
        } else if (s instanceof CallStatement) {
            if (s.expression instanceof CallExpression)
                this.invocation(s.expression)
            else {
                const extName = (s.expression as UnboundCallExpression).procedureName
                const ext = this.extensions.get(extName)
                if (ext) {
                    const args = (s.expression as UnboundCallExpression).args.map( a=> this.evaluate(a).evaluation)
                    ext.call(null,args)
                }
                else
                    throw {
                        compilation: CompilationErrorType.MethodNotFound,
                        range: s.range,
                        message: `No method named '${extName}' found`,
                    }
            }
        } else if (s instanceof ReturnStatement) {
            throw this.evaluate((s as ReturnStatement).expression as Expression)
        } else
            throw new Error("Unsupported statement type: " + (s as any).constructor.name);
    }


    evaluate(e: Expression): ExpressionEval {
        if (e instanceof Variable) {
            const variable = this.topScope().variables.get((e as Variable).declaration.name);
            if (!variable)
                this.compilationError(CompilationErrorType.UndeclaredVariable, `Variable ${e.declaration.name} not declared`, e)

            return {
                evaluation: variable?.evaluation,
                materialization: variable?.materialization
            }
        } else if (e instanceof IntLiteral)
            return {
                evaluation: (e as IntLiteral).value,
                materialization: (e as IntLiteral).value.toString()
            }
        else if (e instanceof BooleanLiteral)
            return {
                evaluation: (e as BooleanLiteral).value
            }
        else if (e instanceof UnaryExpression) {
            const expVal = this.evaluate((e as UnaryExpression).expression);
            if ((e as UnaryExpression).operator === "-") {
                if (typeof expVal.evaluation !== "number")
                    throw {
                        range: (e as UnaryExpression).expression.range,
                        type: CompilationErrorType.TypeMismatch,
                        message: `Type mismatch: expected number but got ${expVal.evaluation}`
                    }
                return {
                    evaluation: -expVal.evaluation,
                    materialization: expVal.materialization
                }
            } else
                throw new Error("Unsupported unary operator: " + (e as UnaryExpression).operator);
        } else if (e instanceof BinaryExpression) {
            const leftVal = this.evaluate((e as BinaryExpression).left);
            const rightVal = this.evaluate((e as BinaryExpression).right);
            let evaluation = undefined
            if (['+', '-', '*', '/', '%'].includes((e as BinaryExpression).operator))
                evaluation = this.handleArithmetic(
                    (e as BinaryExpression).left, leftVal,
                    (e as BinaryExpression).right, rightVal,
                    (e as BinaryExpression).operator);

            if (['==', '!=', '>', '<', '>=', '<='].includes((e as BinaryExpression).operator))
                evaluation = this.handleComparison(
                    (e as BinaryExpression).left, leftVal,
                    (e as BinaryExpression).right, rightVal,
                    (e as BinaryExpression).operator);


            if (evaluation === undefined)
                throw new Error("Unsupported operator: " + (e as BinaryExpression).operator);
            const materialization = leftVal.evaluation + " " + (e as BinaryExpression).operator + " " + rightVal.evaluation;
            this.addTrace(e, evaluation, materialization)
            return {
                evaluation,
                materialization
            }
        } else if (e instanceof CallExpression) {
            return this.invocation(e as CallExpression)
        } else throw new Error("Unsupported expression type: " + (e as any).constructor.name);

    }

    invocation(call: CallExpression): ExpressionEval {
        const p = call.procedure
        const variables: Map<string, TraceVariable> = new Map()
        call.args.forEach((e, i) => {
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
            if (e.evaluation) {
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

    handleArithmetic(leftExp: Expression, leftVal: any, rightExp: Expression, rightVal: any, operator: string): number {
        let left = leftVal.evaluation;
        let right = rightVal.evaluation;

        if (typeof left !== "number") {
            throw {
                range: leftExp.range,
                type: CompilationErrorType.TypeMismatch,
                message: `Type mismatch: expected number but got ${left}`
            }
        }
        if (typeof right !== "number")
            throw {
                range: rightExp.range,
                type: CompilationErrorType.TypeMismatch,
                message: `Type mismatch: expected number but got ${right}`
            }

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
                throw new Error("Unsupported operator: " + operator);
        }
    }

    handleComparison(leftExp: Expression, leftVal: any, rightExp: Expression, rightVal: any, operator: string): boolean {
        let left = leftVal.evaluation;
        let right = rightVal.evaluation;

        if (typeof left !== typeof right) {
            throw {
                range: leftExp.range,
                type: CompilationErrorType.TypeMismatch,
                message: `Type mismatch: cannot compare ${left} with ${right}`
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
                throw new Error("Unsupported operator: " + operator);
        }
    }

    // TODO logical operators, procedure calls, arrays, etc.

}

