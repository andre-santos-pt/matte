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
    DeclarationContext, DoubleExprContext,
    ExpContext, FieldExprContext,
    ForStmtContext,
    IdExprContext,
    IfElseStmtContext,
    IncContext, InstanceCallExprContext,
    IntExprContext,
    MethodContext, ObjectAllocExprContext, RecordContext,
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
    Declaration, DoubleLiteral,
    Expression, FieldAccessExpression,
    IfStatement,
    IntLiteral, NewObjectExpression,
    Procedure,
    Program,
    ReturnStatement,
    Statement, StringLiteral, TypeDeclaration,
    UnaryExpression,
    UnboundCallExpression, UnboundNewObjectExpression,
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

type ScopeEntry = {
    block: boolean;
    variables: Map<string, Declaration>;
}

class TreeVisitor extends JavaGrammarVisitor<any> {
    varScope: ScopeEntry[] = [];
    procedures: Procedure[] = [];
    types: TypeDeclaration[] = [];
    typeContext?: TypeDeclaration = undefined

    topScope(): Map<string, Declaration> {
        return this.varScope[this.varScope.length - 1].variables;
    }

    varLookup(name: string, idCtx: TerminalNode): Declaration {
        for (let i = this.varScope.length - 1; i >= 0; i--) {
            const scope = this.varScope[i].variables;
            if (scope.has(name))
                return scope.get(name)!

            if (this.typeContext) {
                if (name == "this")
                    return new Declaration(Range.fromTerminal(idCtx), "this", true, this.typeContext.name)

                const find = this.typeContext.fields.find(f => f.name == name)
                if (find)
                    return find
            }

            if (!this.varScope[i].block)
                break
        }
        throw {
            compilation: CompilationErrorType.UndeclaredVariable,
            range: Range.fromTerminal(idCtx),
            message: `Variable ${name} not declared`,
            detail: {
                related: [...last(this.varScope).variables.values()].map(v => v.range)
            }
        }
    }

    visitUnit = (ctx: UnitContext) => {
        if (ctx.script())
            return new Program(this.visitScript(ctx.script()))
        else {
            const typeMap: [TypeDeclaration, RecordContext][] = []
            for (let i = 0; i < ctx.getChildCount(); i++)
                if (ctx.getChild(i) instanceof RecordContext) {
                    let typeDeclaration = this.visitRecord(ctx.getChild(i) as RecordContext);
                    typeMap.push([typeDeclaration, ctx.getChild(i) as RecordContext])
                    this.types.push(typeDeclaration)
                }

            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const mctx = ctx.getChild(i) as MethodContext
                    const params = mctx.params() ? mctx.params().param_list().map(p =>
                        new Declaration(
                            Range.fromContext(p),
                            p._id.text,
                            false,
                            p._type_.text
                        )) : []
                    this.procedures.push(new Procedure(
                        Range.fromContext(ctx),
                        mctx._id.text,
                        Range.fromToken(mctx._id),
                        false,
                        params,
                        mctx._type_ ? mctx._type_.text : undefined,
                        undefined
                    ))
                }
            }

            typeMap.forEach(tm => {
                const type = tm[0]
                const recordCtx = tm[1]
                const recordProcedures = this.procedures.filter(p => p.range && p.instance && p.parameters.length > 0 && p.parameters[0].type == type.name)
                this.typeContext = type
                recordProcedures.forEach((p, i) => {
                    p.body = this.visitMethod(recordCtx.method_list()[i])
                })
                this.typeContext = undefined
            })

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
            return new Program(undefined, this.procedures, this.types)
        }
    }

    visitScript = (ctx: ScriptContext) => {
        this.varScope.push({
            block: false,
            variables: new Map<string, Declaration>()
        })
        let statements: Statement[] = ctx.statement_list().flatMap(stmt => {
            return this.visit(stmt)
        })
        this.varScope.pop()
        return new BlockStatement(Range.fromContext(ctx), statements)
    }

    visitRecord = (ctx: RecordContext) => {
        ctx.method_list().forEach(mctx => {
            const params = mctx.params() ? mctx.params().param_list().map(p =>
                new Declaration(
                    Range.fromContext(p),
                    p._id.text,
                    true,
                    p._type_.text
                )) : []
            this.procedures.push(new Procedure(
                Range.fromContext(ctx),
                mctx._id.text,
                Range.fromToken(mctx._id),
                true,
                [new Declaration(Range.fromToken(ctx._id), "this", true, ctx._id.text)].concat(params),
                mctx._type_ ? mctx._type_.text : undefined,
                undefined
            ))
        })
        const fields: Declaration[] = []
        ctx.params().param_list().forEach(p => {
            const dec = new Declaration(
                Range.fromContext(p),
                p._id.text,
                true,
                p._type_.text
            )
            fields.push(dec)
            this.procedures.push(new Procedure(
                undefined,
                p._id.text,
                undefined,
                true,
                [new Declaration(Range.fromToken(ctx._id), "this", true, ctx._id.text)],
                p._type_.text,
                new BlockStatement(undefined, [
                    new ReturnStatement(undefined, new Variable(undefined, dec))
                ])
            ))
        })
        return new TypeDeclaration(
            ctx._id.text,
            Range.fromToken(ctx._id),
            true,
            fields
        )
    }

    visitMethod = (ctx: MethodContext) => {
        this.varScope.push({
            block: false,
            variables: new Map<string, Declaration>()
        })
        ctx.params()?.param_list().forEach(p => {
            this.topScope().set(p._id.text, new Declaration(Range.fromContext(p), p._id.text, false, p._type_.text))
        })
        let body: Statement[] = ctx.statement_list().flatMap(s => this.visit(s))
        this.varScope.pop()
        return new BlockStatement(Range.fromTokenTo(ctx.LCURLY().symbol, ctx.LPAREN().symbol), body)
    }

    visitStmt = (ctx: StatementContext) => {
        return this.visit(ctx.getChild(0))
    }

    visitBlockStmt = (ctx: BlockStmtContext) => {
        this.varScope.push({
            block: true,
            variables: new Map<string, Declaration>()
        })
        let statements: Statement[] = []
        ctx.statement_list().forEach(stmt => statements.push(this.visit(stmt)))
        this.varScope.pop()
        return new BlockStatement(Range.fromContext(ctx), statements)
    }

    visitDeclaration = (ctx: DeclarationContext) => {
        if (last(this.varScope).variables.has(ctx._id.text))
            throw {
                compilation: CompilationErrorType.DuplicateVariable,
                range: Range.fromToken(ctx._id),
                message: `Duplicate variable '${ctx._id}'`,
                detail: {
                    related: last(this.varScope).variables.get(ctx._id.text)?.range
                }
            }
        const dec = new Declaration(
            Range.fromContext(ctx),
            ctx._id.text,
            false,
            ctx._type_.text,
            ctx.exp() ? this.expToAST(ctx.exp()) : undefined
        )
        this.topScope().set(dec.name, dec)
        return dec
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const dec = this.varLookup(ctx.compId().ID(0).getText(), ctx.compId().ID(0))
        if (dec.immutable)
            throw {
                compilation: CompilationErrorType.ImmutableVariable,
                range: Range.fromContext(ctx),
                message: `Variable '${dec.name}' is immutable and cannot be assigned to`,
                detail: {
                    related: dec.range
                }
            }

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
            throw {
                message: "Unsupported target: " + ctx.getText(),
                compilation: CompilationErrorType.Unsupported,
                range: Range.fromContext(ctx)
            }

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
            throw {
                message: "Unsupported target: " + ctx.getText(),
                compilation: CompilationErrorType.Unsupported,
                range: Range.fromContext(ctx)
            }

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

        else if (ctx instanceof DoubleExprContext)
            return new DoubleLiteral(
                Range.fromContext(ctx),
                Number(ctx.DOUBLE().getText())
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

        else if (ctx instanceof ObjectAllocExprContext)
            return this.handleNewCall(ctx);

        else if (ctx instanceof FieldExprContext)
            return new FieldAccessExpression(
                Range.fromContext(ctx),
                this.expToAST(ctx._target),
                ctx._fieldId.text
            )

        else if (ctx instanceof InstanceCallExprContext) {
            return this.handleInstanceCall(ctx);
        } else
            throw {
                message: "Unsupported expression type: " + ctx.getText(),
                compilation: CompilationErrorType.Unsupported,
                range: Range.fromContext(ctx),
                detail: "AST"
            }
    }

    private findMethodInType(type: TypeDeclaration, methodName: string):
        Procedure | undefined {
        return this.procedures.find(p => p.instance && p.name == methodName && p.parameters.length > 0 && p.parameters[0].type == type.name)

    }

    private handleInstanceCall(ctx: InstanceCallExprContext) {
        const target = this.expToAST(ctx.exp())
        if (!(target instanceof Variable || target instanceof NewObjectExpression))
            throw {
                message: "Unsupported target: " + ctx.exp().getText(),
                compilation: CompilationErrorType.Unsupported,
                range: Range.fromContext(ctx.exp())
            }

        const typeName = target instanceof Variable ? target.declaration.type : target.type.name

        const type = this.types.find(t => t.name == typeName)

        if (!type)
            throw {
                message: "Type '" + typeName + "' not found",
                compilation: CompilationErrorType.TypeMismatch,
                range: Range.fromContext(ctx.exp()),
                detail: "AST"
            }

        const proc = this.findMethodInType(type, ctx.call()._id.text)
        if (!proc)
            throw {
                message: "No method named '" + ctx.call()._id.text + "' found for type '" + typeName + "'",
                compilation: CompilationErrorType.MethodNotFound,
                range: Range.fromToken(ctx.call()._id),
                detail: "AST"
            }
        return new CallExpression(
            Range.fromContext(ctx),
            proc,
            [this.expToAST(ctx.exp())].concat(ctx.call()._args ? ctx.call()._args.exp_list().map(e => this.expToAST(e)) : []),
            true
        )
    }

    private handleNewCall(ctx: ObjectAllocExprContext) {
        const type = this.types.find(t => t.name == ctx.newCall()._type_.text)
        if (type)
            return new NewObjectExpression(
                Range.fromContext(ctx),
                type,
                ctx.newCall()._args ? ctx.newCall()._args.exp_list().map(
                    e => this.expToAST(e)
                ) : []
            )
        else
            return new UnboundNewObjectExpression(
                Range.fromContext(ctx),
                ctx.newCall()._type_.text,
                ctx.newCall()._args ? ctx.newCall()._args.exp_list().map(
                    e => this.expToAST(e)
                ) : []
            )
    }

    private handleCall(ctx: CallContext) {
        const proc = this.procedures.find(p => p.name == ctx._id.text)
        if (proc) {
            let args = ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            // TODO this is a bit hacky, we should check if the proc is an instance method and if so, add the target as first argument
            if(proc.instance)
                args.unshift(new Variable(Range.fromContext(ctx), new Declaration(undefined, "this", true, proc.parameters[0].type)))

            return new CallExpression(
                Range.fromContext(ctx),
                proc,
                args,
                false
            )
        }
        else
            return new UnboundCallExpression(
                Range.fromContext(ctx),
                ctx._id.text,
                ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            )
    }
}
