import {
    AssignmentContext,
    BinaryOpAddContext,
    BinaryOpMulContext,
    BinaryOpRelContext,
    BlockStmtContext,
    BoolExprContext,
    BreakContext,
    CallContext,
    CallExprContext, DecContext,
    DeclarationContext,
    ExpContext,
    ForStmtContext,
    IdExprContext,
    IfElseStmtContext,
    IncContext,
    IntExprContext,
    MethodContext,
    ReturnContext,
    ScriptContext,
    StatementContext, StringExprContext,
    UnaryOpContext,
    UnitContext,
    WhileStmtContext
} from "./generated/JavaGrammarParser";
import {
    Assignment,
    BinaryExpression,
    BlockStatement,
    BooleanLiteral,
    BreakStatement,
    CallExpression,
    CallStatement,
    Declaration,
    Expression,
    IfStatement,
    IntLiteral,
    Procedure,
    Program,
    ReturnStatement,
    Statement, StringLiteral,
    UnaryExpression,
    UnboundCallExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";
import JavaGrammarVisitor from "./generated/JavaGrammarVisitor";
import {TerminalNode} from "antlr4";
import {CompilationErrorType} from "./Interpreter";
import {last} from "./utils";
import {compilationError} from "./tests/utils";


export function parseTreeToAST(ctx: UnitContext): Program {
    const visitor = new TreeVisitor();
    return visitor.visitUnit(ctx);
}

export function parseExpression(unit: UnitContext, ctx: ExpContext): [Program, Expression] {
    const visitor = new TreeVisitor();
    return [visitor.visitUnit(unit), visitor.expToAST(ctx)];
}

class TreeVisitor extends JavaGrammarVisitor<any> {
    varScope: Map<string, Declaration>[] = [];
    procedures: Procedure[] = [];

    topScope(): Map<string, Declaration> {
        return this.varScope[this.varScope.length - 1];
    }

    varLookup(name: string, idCtx: TerminalNode): Declaration {
        for (let i = this.varScope.length - 1; i >= 0; i--) {
            const scope = this.varScope[i];
            if (scope.has(name)) {
                return scope.get(name)!;
            }
        }
        throw {
            compilation: CompilationErrorType.UndeclaredVariable,
            range: Range.fromTerminal(idCtx),
            message: `Variable ${name} not declared`,
            detail: {
                related: [...last(this.varScope).values()].map(v => v.range)
            }
        }
    }

    visitUnit = (ctx: UnitContext) => {
        if (ctx.script())
            return new Program(this.visitScript(ctx.script()))
        else {
            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const mctx = ctx.getChild(i) as MethodContext
                    const params = mctx.params() ? mctx.params().param_list().map(p =>
                        new Declaration(
                            Range.fromContext(p),
                            p._id.text,
                            p._type_.text
                        )) : []
                    this.procedures.push(new Procedure(
                        Range.fromContext(ctx),
                        mctx._id.text,
                        Range.fromToken(mctx._id),
                        params,
                        mctx._type_ ? mctx._type_.text : undefined,
                        undefined
                    ))
                }
            }
            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const c = ctx.getChild(i) as MethodContext
                    const proc = this.procedures.find(p => p.name == c._id.text)
                    if (!proc)
                        throw {
                            compilation: CompilationErrorType.MethodNotFound,
                            range: Range.fromToken(c._id),
                            message: `No method named '${c._id.text}' found`,
                            detail: {
                                related: this.procedures.map(p => p.nameRange)
                            }
                        }
                    proc.body = this.visitMethod(ctx.getChild(i) as MethodContext)
                }
            }
            return new Program(undefined, this.procedures)
        }
    }

    visitScript = (ctx: ScriptContext) => {
        this.varScope.push(new Map<string, Declaration>())
        let statements: Statement[] = ctx.statement_list().flatMap(stmt => {
            return this.visit(stmt)
        })
        this.varScope.pop()
        return new BlockStatement(Range.fromContext(ctx), statements)
    }

    visitMethod = (ctx: MethodContext) => {
        this.varScope.push(new Map<string, Declaration>())
        ctx.params()?.param_list().forEach(p => {
            this.topScope().set(p._id.text, new Declaration(Range.fromContext(p), p._id.text, p._type_.text))
        })
        let body: Statement[] = ctx.statement_list().flatMap(s => this.visit(s))
        this.varScope.pop()
        return new BlockStatement(Range.fromTokenTo(ctx.LCURLY().symbol, ctx.LPAREN().symbol), body)
    }

    visitStmt = (ctx: StatementContext) => {
        return this.visit(ctx.getChild(0))
    }

    visitBlockStmt = (ctx: BlockStmtContext) => {
        this.varScope.push(new Map<string, Declaration>())
        let statements: Statement[] = []
        ctx.statement_list().forEach(stmt => statements.push(this.visit(stmt)))
        this.varScope.pop()
        return new BlockStatement(Range.fromContext(ctx), statements)
    }

    visitDeclaration = (ctx: DeclarationContext) => {
        if (last(this.varScope).has(ctx._id.text))
            throw {
                compilation: CompilationErrorType.DuplicateVariable,
                range: Range.fromToken(ctx._id),
                message: `Duplicate variable '${ctx._id}'`,
                detail: {
                    related: last(this.varScope).get(ctx._id.text)?.range
                }
            }
        const dec = new Declaration(
            Range.fromContext(ctx),
            ctx._id.text,
            ctx._type_.text,
            ctx.exp() ? this.expToAST(ctx.exp()) : undefined
        )
        this.topScope().set(dec.name, dec)
        return dec
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const dec = this.varLookup(ctx.compId().ID(0).getText(), ctx.compId().ID(0))
        return new Assignment(
            Range.fromContext(ctx),
            dec,
            this.expToAST(ctx.exp())
        )
    }

    visitIfElseStmt = (ctx: IfElseStmtContext) =>
        new IfStatement(
            Range.fromContext(ctx.if_()),
            this.expToAST(ctx.if_().exp()),
            this.visit(ctx.if_()._ifcase),
            ctx.if_()._elsecase ? this.visit(ctx.if_()._elsecase) : undefined
        )

    visitWhileStmt = (ctx: WhileStmtContext) =>
        new WhileStatement(
            Range.fromContext(ctx.while_()),
            this.expToAST(ctx.while_().exp()),
            this.visit(ctx.while_().statement()))


    visitForStmt = (ctx: ForStmtContext) => {
        const ret: Statement[] = []
        if (ctx.for_().declaration())
            ret.push(this.visitDeclaration(ctx.for_().declaration()))
        const body = this.visit(ctx.for_()._body)
        if (ctx.for_()._progress) {
            const prog = this.visitStmt(ctx.for_()._progress) as Statement
            if (body instanceof BlockStatement)
                body.statements.push(prog)
            else {
                const block = new BlockStatement(
                    Range.fromContext(ctx.for_()._body),
                    [body, prog]
                )
                body.statements.push(block)
            }
        }
        const guard = ctx.for_().exp() ?
            this.expToAST(ctx.for_().exp())
            : new BooleanLiteral(Range.fromTerminal(ctx.for_().TERM(1)), true)
        ret.push(new WhileStatement(
            Range.fromContext(ctx.for_()),
            guard,
            body)
        )
        return ret
    }

    visitInc = (ctx: IncContext) => {
        if (!(ctx._target instanceof IdExprContext))
            throw new Error("Unsupported target: " + (ctx as any).constructor.name);

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        const inc = new BinaryExpression(
            Range.fromContext(ctx),
            "+",
            new Variable(
                Range.fromTerminal(ctx._target.ID()),
                dec
            ),
            new IntLiteral(undefined, 1)
        )
        return new Assignment(Range.fromContext(ctx), dec, inc)
    }

    visitDec = (ctx: DecContext) => {
        if (!(ctx._target instanceof IdExprContext))
            throw new Error("Unsupported target: " + (ctx as any).constructor.name);

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        const inc = new BinaryExpression(
            Range.fromContext(ctx),
            "-",
            new Variable(
                Range.fromTerminal(ctx._target.ID()),
                dec
            ),
            new IntLiteral(undefined, 1)
        )
        return new Assignment(Range.fromContext(ctx), dec, inc)
    }

    visitBreak = (ctx: BreakContext) =>
        new BreakStatement()

    visitReturn = (ctx: ReturnContext) =>
        new ReturnStatement(
            Range.fromContext(ctx),
            this.expToAST(ctx._expression)
        )

    visitCall = (ctx: CallContext) =>
        new CallStatement(
            Range.fromContext(ctx),
            this.handleCall(ctx)
        )

    expToAST(ctx: ExpContext):
        Expression {
        if (ctx instanceof IdExprContext) {
            const dec = this.varLookup(ctx.getText(), ctx.ID())
            return new Variable(Range.fromContext(ctx), dec)
        } else if (ctx instanceof IntExprContext)
            return new IntLiteral(
                Range.fromContext(ctx),
                Number(ctx.INT().getText())
            )

        else if (ctx instanceof BoolExprContext)
            return new BooleanLiteral(
                Range.fromContext(ctx),
                ctx.BOOLEAN().getText() == "true"
            )

        else if (ctx instanceof StringExprContext)
            return new StringLiteral(
                Range.fromContext(ctx),
                ctx.STRING().getText().substring(1, ctx.STRING().getText().length - 1)
            )

        else if (ctx instanceof UnaryOpContext)
            return new UnaryExpression(
                Range.fromContext(ctx),
                ctx.uop().getText(),
                this.expToAST(ctx._target)
            )

        else if (ctx instanceof BinaryOpAddContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                ctx.bopAdd().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            )

        else if (ctx instanceof BinaryOpMulContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                ctx.bopMul().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            );

        else if (ctx instanceof BinaryOpRelContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                ctx.bopRel().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            );

        else if (ctx instanceof CallExprContext)
            return this.handleCall(ctx.call());

        else
            throw new Error("Unsupported expression type: " + (ctx as any).constructor.name);

    }

    private handleCall(ctx: CallContext) {
        const proc = this.procedures.find(p => p.name == ctx._id.text)
        if (proc)
            return new CallExpression(
                Range.fromContext(ctx),
                proc,
                ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            )
        else
            return new UnboundCallExpression(
                Range.fromContext(ctx),
                ctx._id.text,
                ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            )
    }
}
