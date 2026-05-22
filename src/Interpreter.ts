import JavaGrammarLexer from "./generated/JavaGrammarLexer";
import JavaGrammarParser from "./generated/JavaGrammarParser";
import {CharStreams, CommonTokenStream, ParserRuleContext} from "antlr4";

import {
    Assignment, ASTNode,
    BinaryExpression,
    BlockStatement, BooleanLiteral, Declaration,
    Expression, IfStatement,
    IntLiteral, Program,
    Statement, UnaryExpression, Variable, WhileStatement
} from "./ast";
import Range from "./Range";

import {parseTreeToAST} from "./antlr2ast";

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
    details?: any;
}

export enum CompilationErrorType {
    SyntaxError,
    UndeclaredVariable,
    TypeMismatch,
}

interface TraceEntry {
    range?: Range,
    materialization?: string,
    evaluation: any,
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
    StackOverflow
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
    evaluation: any;
    materialization?: string;
}

export class Interpreter {
    scope: StackFrame[] = [];
    trace: TraceEntry[] = [];

    topScope(): StackFrame {
        return this.scope[this.scope.length - 1];
    }

    addTrace(node: ASTNode, materialization: string | undefined, evaluation: any) {
        this.trace.push({
            range: node.range,
            materialization,
            evaluation,
            call: undefined, //ctx instanceof JavaGrammarParser.CallContext ? ctx.ID().getText() : null,
            stack: structuredClone(this.scope)
        });
    }

    parseAndRun(source: string): InterpreterResult {
        const ast = parseTreeToAST(getParser(source).unit());
        console.log(ast);
        return this.runProgram(ast);
    }

    runProgram(program: Program): InterpreterResult {
        this.scope.push({
            variables: new Map()
        })

        try {
            program.block.statements.forEach(s => this.execute(s));
            this.addTrace(program.block, undefined, undefined)
            return {
                errors: [],
                result: undefined,
                trace: structuredClone(this.trace)
            }
        } catch (e: any) {
            if (e.type)
                return {
                    errors: [e],
                    result: undefined,
                    trace: structuredClone(this.trace)
                }
            else
                throw e
        }
    }

    execute(s: Statement) {
        if (s instanceof BlockStatement)
            (s as BlockStatement).statements.forEach(i => this.execute(i));
        else if (s instanceof Declaration) {
            if ((s as Declaration).initializer != null) {
                const exp = this.evaluate((s as Declaration).initializer as Expression)
                this.addTrace(s, exp.materialization ? undefined : exp.materialization, exp.evaluation)
                this.topScope().variables.set((s as Declaration).name, {
                    name: (s as Declaration).name,
                    evaluation: exp.evaluation,
                    materialization: exp.materialization,
                    declaration: (s as Declaration).range
                })
            }
        } else if (s instanceof Assignment) {
            const exp = this.evaluate((s as Assignment).expression);
            this.addTrace(s, exp.materialization ? undefined : exp.materialization, exp.evaluation)
            this.topScope().variables.set((s as Assignment).variable.name, {
                name: (s as Assignment).variable.name,
                evaluation: exp.evaluation,
                materialization: exp.materialization,
                declaration: (s as Assignment).variable.range
            });
        } else if (s instanceof IfStatement) {
            const conditionVal = this.evaluate((s as IfStatement).guard);
            if (typeof conditionVal.evaluation !== "boolean")
                throw {
                    range: (s as IfStatement).guard.range,
                    type: CompilationErrorType.TypeMismatch,
                    message: `Type mismatch: expected boolean expression`
                }
            if (conditionVal.evaluation)
                this.execute((s as IfStatement).thenBranch);
            else if ((s as IfStatement).elseBranch)
                this.execute((s as IfStatement).elseBranch as Statement);
        } else if (s instanceof  WhileStatement) {
            while (true) {
                const conditionVal = this.evaluate((s as WhileStatement).guard);
                if (typeof conditionVal.evaluation !== "boolean")
                    throw {
                        range: (s as WhileStatement).guard.range,
                        type: CompilationErrorType.TypeMismatch,
                        message: `Type mismatch: expected boolean expression`
                    }
                if (!conditionVal.evaluation) break;
                this.execute((s as WhileStatement).body);
            }
        }

        else
            throw new Error("Unsupported statement type: " + (s as any).constructor.name);
    }

    evaluate(e: Expression): ExpressionEval {
        if (e instanceof Variable) {
            const variable = this.topScope().variables.get((e as Variable).declaration.name);
            if (!variable) throw new Error(`Variable ${(e as Variable).declaration.name} not declared`);
            return {
                evaluation: variable.evaluation,
                materialization: variable.materialization
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
            const materialization = leftVal.materialization + " " + (e as BinaryExpression).operator + " " + rightVal.materialization;
            this.addTrace(e, materialization, evaluation)
            return {
                evaluation,
                materialization
            }
        } else throw new Error("Unsupported expression type: " + (e as any).constructor.name);
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

}

