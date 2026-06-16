import JavaGrammarParser, {
    ArrayAllocExprContext,
    ArrayAssignmentContext,
    ArrayExprContext,
    ArrayLitExprContext,
    AssignmentContext,
    BinaryOpAddContext,
    BinaryOpLogContext,
    BinaryOpMulContext,
    BinaryOpRelContext,
    BlockStmtContext,
    BoolExprContext,
    BreakContext,
    CallContext,
    CallExprContext,
    DecContext,
    DeclarationContext,
    DoubleExprContext,
    ExpContext,
    FieldExprContext,
    ForStmtContext,
    IdExprContext,
    IfElseStmtContext,
    IncContext,
    InstanceCallExprContext,
    IntExprContext,
    MethodContext,
    ObjectAllocExprContext,
    RecordContext,
    ReturnContext,
    ScriptContext,
    StatementContext,
    StringExprContext,
    UnaryOpContext,
    UnitContext,
    WhileStmtContext
} from "./generated/JavaGrammarParser";
import {
    ArithmeticExpression,
    ArrayAllocationExpression,
    ArrayAssignment,
    ArrayElementExpression,
    ArrayLiteralExpression,
    ArrayType,
    Assignment,
    BlockStatement,
    BooleanLiteral,
    BreakStatement,
    CallExpression,
    CallStatement,
    Declaration,
    DoubleLiteral,
    Expression,
    FieldAccessExpression,
    ForeignType,
    IfStatement,
    IntLiteral,
    LogicalExpression,
    NewObjectExpression,
    PrimitiveType,
    Procedure,
    Program,
    RelationalExpression,
    ReturnStatement,
    Statement,
    StringLiteral,
    Type,
    TypeDeclaration,
    UnaryExpression,
    UnboundCallExpression,
    UnboundNewObjectExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";
import JavaGrammarVisitor from "./generated/JavaGrammarVisitor";
import {
    CharStreams,
    CommonTokenStream,
    Interval,
    ParserRuleContext,
    TerminalNode,
    Token
} from "antlr4";
import {CompilationErrorType} from "./Interpreter";
import {last} from "./utils";
import JavaGrammarLexer from "./generated/JavaGrammarLexer";


export function getParser(input: string) {
    const chars = CharStreams.fromString(input);
    const lexer = new JavaGrammarLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    return new JavaGrammarParser(tokens);
}

export function buildAST(source: string) {
    const chars = CharStreams.fromString(source);
    const lexer = new JavaGrammarLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new JavaGrammarParser(tokens);
    let unit = parser.unit();
    const visitor = new TreeVisitor(tokens);
    return visitor.visitUnit(unit);
}

export function buildASTandCall(source: string, call: string): [Program, Expression] {
    const chars = CharStreams.fromString(source);
    const lexer = new JavaGrammarLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new JavaGrammarParser(tokens);
    let unitCtx = parser.unit();
    const visitor = new TreeVisitor(tokens);

    const chars2 = CharStreams.fromString(call);
    const lexer2 = new JavaGrammarLexer(chars2);
    const tokens2 = new CommonTokenStream(lexer2);
    const parser2 = new JavaGrammarParser(tokens2);
    let callCtx = parser2.exp();

    const program = visitor.visitUnit(unitCtx)

    visitor.tokenStream = tokens2
    const exp = visitor.expToAST(callCtx)
    return [program, exp]
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
    tokenStream: CommonTokenStream

    constructor(tokenStream: CommonTokenStream) {
        super();
        this.tokenStream = tokenStream
    }

    private streamText(ctx: ParserRuleContext) {
        return this.tokenStream.getText(new Interval(ctx.start, ctx.stop))
    }

    private rangeContext(ctx: ParserRuleContext): Range {
        const start = ctx.start.start;
        const end = (ctx.stop?.stop || start) + 1; // Handle cases where _stop might be undefined
        return new Range(
            start,
            end,
            ctx.start.line,
            ctx.start.column,
            this.streamText(ctx)
        );
    }

    private rangeToken(token: Token): Range {
        return new Range(
            token.start,
            token.stop + 1,
            token.line,
            token.column,
            this.tokenStream.getText(new Interval(token, token))
        );
    }

    private rangeTerminal(node: TerminalNode): Range {
        return this.rangeToken(node.symbol)
    }

    private rangeTokenTo(from: Token, to: Token): Range {
        return new Range(
            from.start,
            to.stop + 1,
            from.line,
            to.column,
            this.tokenStream.getText(new Interval(from, to))
        );
    }

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
                    return new Declaration(this.rangeTerminal(idCtx), "this", undefined, true, this.typeContext, undefined)

                const find = this.typeContext.fields.find(f => f.name == name)
                if (find)
                    return find
            }

            if (!this.varScope[i].block)
                break
        }
        throw {
            compilation: CompilationErrorType.UndeclaredVariable,
            range: this.rangeTerminal(idCtx),
            message: `Variable ${name} not declared`,
            detail: {
                related: [...last(this.varScope).variables.values()].map(v => v.range)
            }
        }
    }

    findType(name: string): Type | undefined {
        if(name == "int")
            return PrimitiveType.INT
        else if(name == "double")
            return PrimitiveType.DOUBLE
        else if(name == "boolean")
            return PrimitiveType.BOOLEAN
        else if(name == "String")
            return PrimitiveType.STRING
        else
            return this.types.find(t => t.name == name)
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
                    const params = mctx.params() ? mctx.params().param_list().map(p => {
                        let type = this.findType(p._type_.text)
                        return new Declaration(
                            this.rangeContext(p),
                            p._id.text,
                            this.rangeToken(p._id),
                            false,
                            type ? type : new ForeignType(p._type_.text),
                            this.rangeToken(p._type_),
                        )
                    }) : []
                    let type = this.findType(mctx._type_.text)
                    this.procedures.push(new Procedure(
                        this.rangeContext(ctx),
                        mctx._id.text,
                        this.rangeToken(mctx._id),
                        false,
                        params,
                        type ? type : new ForeignType(mctx._type_.text),
                        undefined
                    ))
                }
            }

            typeMap.forEach(tm => {
                const type = tm[0]
                const recordCtx = tm[1]
                const recordProcedures = this.procedures.filter(p => p.range && p.instance && p.parameters.length > 0 && p.parameters[0].type == type)
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
                            range: this.rangeToken(c._id),
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
        return new BlockStatement(this.rangeContext(ctx), statements)
    }

    visitRecord = (ctx: RecordContext) => {
        const typedec = new TypeDeclaration(
            ctx._id.text,
            this.rangeToken(ctx._id),
            true,
            []
        )
        ctx.method_list().forEach(mctx => {
            const params = mctx.params() ? mctx.params().param_list().map(p => {
                let type = this.findType(p._type_.text)
                return new Declaration(
                    this.rangeContext(p),
                    p._id.text,
                    this.rangeToken(p._id),
                    true,
                    type ? type : new ForeignType(p._type_.text),
                    this.rangeToken(p._type_)
                )
            }) : []

            let type = mctx._type_.text == ctx._id.text ? typedec : this.findType(mctx._type_.text)
            this.procedures.push(new Procedure(
                this.rangeContext(ctx),
                mctx._id.text,
                this.rangeToken(mctx._id),
                true,
                [new Declaration(this.rangeToken(ctx._id), "this", undefined, true, typedec, undefined)].concat(params),
                type ? type : new ForeignType(mctx._type_.text),
                undefined
            ))
        })

        ctx.params().param_list().forEach(p => {
            let type = this.findType(p._type_.text)
            const dec = new Declaration(
                this.rangeContext(p),
                p._id.text,
                this.rangeToken(p._id),
                true,
                type ? type : new ForeignType(p._type_.text),
                this.rangeToken(p._type_)
            )
            typedec.fields.push(dec)

            this.procedures.push(new Procedure(
                undefined,
                p._id.text,
                undefined,
                true,
                [new Declaration(this.rangeToken(ctx._id), "this", undefined, true, typedec, undefined)],
                type ? type : new ForeignType(p._type_.text),
                new BlockStatement(undefined, [
                    new ReturnStatement(undefined, new Variable(undefined, dec))
                ])
            ))
        })
        return typedec
    }

    visitMethod = (ctx: MethodContext) => {
        this.varScope.push({
            block: false,
            variables: new Map<string, Declaration>()
        })
        ctx.params()?.param_list().forEach(p => {
            let type = this.findType(p._type_.text)
            this.topScope().set(p._id.text, new Declaration(this.rangeContext(p), p._id.text, this.rangeToken(p._id), false, type ? type : new ForeignType(p._type_.text), this.rangeToken(p._type_)))
        })
        let body: Statement[] = ctx.statement_list().flatMap(s => this.visit(s))
        this.varScope.pop()
        return new BlockStatement(this.rangeTokenTo(ctx.LCURLY().symbol, ctx.LPAREN().symbol), body)
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
        return new BlockStatement(this.rangeContext(ctx), statements)
    }

    visitDeclaration = (ctx: DeclarationContext) => {
        if (last(this.varScope).variables.has(ctx._id.text))
            throw {
                compilation: CompilationErrorType.DuplicateVariable,
                range: this.rangeToken(ctx._id),
                message: `Duplicate variable '${ctx._id}'`,
                detail: {
                    related: last(this.varScope).variables.get(ctx._id.text)?.range
                }
            }
        let type: Type | undefined = this.findType(ctx._type_.text)
        if(type && ctx.arrayDim_list().length > 0)
            type = new ArrayType(type)
        const dec = new Declaration(
            this.rangeContext(ctx),//this.getRange(ctx),
            ctx._id.text,
            this.rangeToken(ctx._id),
            false,
            type ? type : new ForeignType(ctx._type_.text),
            this.rangeToken(ctx._type_),
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
                range: this.rangeContext(ctx),
                message: `Variable '${dec.name}' is immutable and cannot be assigned to`,
                detail: {
                    related: dec.range
                }
            }

        return new Assignment(
            this.rangeContext(ctx),
            dec,
            this.expToAST(ctx.exp())
        )
    }

    visitArrayAssignment = (ctx: ArrayAssignmentContext) => {
        const target = this.expToAST(ctx._target)
        const index = this.expToAST(ctx._index)
        return new ArrayAssignment(
            this.rangeContext(ctx),
            target,
            index,
            this.expToAST(ctx._expression)
        )
    }

    visitIfElseStmt = (ctx: IfElseStmtContext) =>
        new IfStatement(
            this.rangeContext(ctx.if_()),
            this.expToAST(ctx.if_().exp()),
            this.visit(ctx.if_()._ifcase),
            ctx.if_()._elsecase ? this.visit(ctx.if_()._elsecase) : undefined
        )

    visitWhileStmt = (ctx: WhileStmtContext) =>
        new WhileStatement(
            this.rangeContext(ctx.while_()),
            this.expToAST(ctx.while_().exp()),
            this.visit(ctx.while_().statement()))


    visitForStmt = (ctx: ForStmtContext) => {
        const ret: Statement[] = []
        if (ctx.for_().declaration())
            ret.push(this.visitDeclaration(ctx.for_().declaration()))
        let body = this.visit(ctx.for_()._body)
        if (ctx.for_()._progress) {
            const prog = this.visitStmt(ctx.for_()._progress) as Statement
            if (body instanceof BlockStatement)
                body.statements.push(prog)
            else {
                body = new BlockStatement(
                    this.rangeContext(ctx.for_()._body),
                    [body, prog]
                )
            }
        }
        const guard = ctx.for_().exp() ?
            this.expToAST(ctx.for_().exp())
            : new BooleanLiteral(this.rangeTerminal(ctx.for_().TERM(1)), true)
        ret.push(new WhileStatement(
            this.rangeContext(ctx.for_()),
            guard,
            body)
        )
        return new BlockStatement(
            this.rangeContext(ctx),
            ret
        )
    }

    visitInc = (ctx: IncContext) => {
        if (!(ctx._target instanceof IdExprContext))
            throw {
                message: "Unsupported target: " + ctx.getText(),
                compilation: CompilationErrorType.Unsupported,
                range: this.rangeContext(ctx)
            }

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        const inc = new ArithmeticExpression(
            this.rangeContext(ctx),
            "+",
            new Variable(
                this.rangeTerminal(ctx._target.ID()),
                dec
            ),
            new IntLiteral(undefined, 1)
        )
        return new Assignment(this.rangeContext(ctx), dec, inc)
    }

    visitDec = (ctx: DecContext) => {
        if (!(ctx._target instanceof IdExprContext))
            throw {
                message: "Unsupported target: " + ctx.getText(),
                compilation: CompilationErrorType.Unsupported,
                range: this.rangeContext(ctx)
            }

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        const inc = new ArithmeticExpression(
            this.rangeContext(ctx),
            "-",
            new Variable(
                this.rangeTerminal(ctx._target.ID()),
                dec
            ),
            new IntLiteral(undefined, 1)
        )
        return new Assignment(this.rangeContext(ctx), dec, inc)
    }

    visitBreak = (ctx: BreakContext) =>
        new BreakStatement()

    visitReturn = (ctx: ReturnContext) =>
        new ReturnStatement(
            this.rangeContext(ctx),
            this.expToAST(ctx._expression)
        )

    visitCall = (ctx: CallContext) =>
        new CallStatement(
            this.rangeContext(ctx),
            this.handleCall(ctx)
        )

    expToAST(ctx: ExpContext):
        Expression {
        if (ctx instanceof IdExprContext) {
            const dec = this.varLookup(ctx.getText(), ctx.ID())
            return new Variable(this.rangeContext(ctx), dec)
        } else if (ctx instanceof IntExprContext)
            return new IntLiteral(
                this.rangeContext(ctx),
                Number(ctx.INT().getText())
            )

        else if (ctx instanceof DoubleExprContext)
            return new DoubleLiteral(
                this.rangeContext(ctx),
                Number(ctx.DOUBLE().getText())
            )

        else if (ctx instanceof BoolExprContext)
            return new BooleanLiteral(
                this.rangeContext(ctx),
                ctx.BOOLEAN().getText() == "true"
            )

        else if (ctx instanceof StringExprContext)
            return new StringLiteral(
                this.rangeContext(ctx),
                ctx.STRING().getText().substring(1, ctx.STRING().getText().length - 1)
            )

        else if (ctx instanceof UnaryOpContext)
            return new UnaryExpression(
                this.rangeContext(ctx),
                ctx.uop().getText(),
                this.expToAST(ctx._target)
            )

        else if (ctx instanceof BinaryOpAddContext) {
            const left = this.expToAST(ctx._left)
            const right = this.expToAST(ctx._right)
            // TODO string concat
            // if(left.type == PrimitiveType.STRING || right.type == PrimitiveType.STRING)
            //     return new CallExpression(this.rangeContext(ctx), t)
            return new ArithmeticExpression(
                this.rangeContext(ctx),
                ctx.bopAdd().getText(),
                left,
                right
            )
        }

        else if (ctx instanceof BinaryOpMulContext)
            return new ArithmeticExpression(
                this.rangeContext(ctx),
                ctx.bopMul().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            );

        else if (ctx instanceof BinaryOpRelContext)
            return new RelationalExpression(
                this.rangeContext(ctx),
                ctx.bopRel().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            );

        else if (ctx instanceof BinaryOpLogContext)
            return new LogicalExpression(
                this.rangeContext(ctx),
                ctx.bopLog().getText(),
                this.expToAST(ctx._left),
                this.expToAST(ctx._right)
            )

        else if (ctx instanceof ArrayLitExprContext)
            return new ArrayLiteralExpression(
                this.rangeContext(ctx),
                ctx.expList() ? ctx.expList().exp_list().map(e => this.expToAST(e)) : []
            )

        else if (ctx instanceof ArrayAllocExprContext) {
            let type: Type | undefined = this.findType(ctx.ID().getText())
            return new ArrayAllocationExpression(
                this.rangeContext(ctx),
                type ? type : new ForeignType(ctx.ID().getText()),
                [this.expToAST(ctx.dimensions().exp())] // TODO multidim
            )
        }
        else if (ctx instanceof ArrayExprContext)
            return new ArrayElementExpression(
                this.rangeContext(ctx),
                this.expToAST(ctx._target),
                this.expToAST(ctx._index),
            )

        else if (ctx instanceof CallExprContext)
            return this.handleCall(ctx.call());

        else if (ctx instanceof ObjectAllocExprContext)
            return this.handleNewCall(ctx);

        else if (ctx instanceof FieldExprContext)
            return new FieldAccessExpression(
                this.rangeContext(ctx),
                this.expToAST(ctx._target),
                ctx._fieldId.text,
                this.rangeToken(ctx._fieldId)
            )

        else if (ctx instanceof InstanceCallExprContext) {
            return this.handleInstanceCall(ctx);
        } else
            throw {
                message: "Unsupported expression type: " + this.streamText(ctx),
                compilation: CompilationErrorType.Unsupported,
                range: this.rangeContext(ctx),
                detail: "AST-exp2AST"
            }
    }

    private findMethodInType(type: TypeDeclaration, methodName: string):
        Procedure | undefined {
        return this.procedures.find(p => p.instance && p.name == methodName && p.parameters.length > 0 && p.parameters[0].type == type)

    }

    private handleInstanceCall(ctx: InstanceCallExprContext) {
        const target = this.expToAST(ctx.exp())
        if (!(target instanceof Variable || target instanceof NewObjectExpression))
            throw {
                message: "Unsupported target: " + ctx.exp().getText(),
                compilation: CompilationErrorType.Unsupported,
                range: this.rangeContext(ctx.exp())
            }

        const typeName = target instanceof Variable ? target.declaration.type : target.type.name

        const type = this.types.find(t => t.name == typeName)

        if (!type)
            throw {
                message: "Type '" + typeName + "' not found",
                compilation: CompilationErrorType.TypeMismatch,
                range: this.rangeContext(ctx.exp()),
                detail: "AST-instanceCall"
            }

        const proc = this.findMethodInType(type, ctx.call()._id.text)
        if (!proc)
            throw {
                message: "No method named '" + ctx.call()._id.text + "' found for type '" + typeName + "'",
                compilation: CompilationErrorType.MethodNotFound,
                range: this.rangeToken(ctx.call()._id),
                detail: "AST-instanceCall"
            }

        const args = [this.expToAST(ctx.exp())].concat(ctx.call()._args ? ctx.call()._args.exp_list().map(e => this.expToAST(e)) : [])
        this.checkArgs(ctx.call(), args, proc);

        return new CallExpression(
            this.rangeContext(ctx),
            proc,
            args,
            true
        )
    }

    private handleNewCall(ctx: ObjectAllocExprContext) {
        const type = this.types.find(t => t.name == ctx.newCall()._type_.text)
        if (type)
            // TODO n args check
            return new NewObjectExpression(
                this.rangeContext(ctx),
                type,
                ctx.newCall()._args ? ctx.newCall()._args.exp_list().map(
                    e => this.expToAST(e)
                ) : []
            )
        else
            return new UnboundNewObjectExpression(
                this.rangeContext(ctx),
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
            if (proc.instance)
                args.unshift(new Variable(this.rangeContext(ctx), new Declaration(undefined, "this", undefined, true, proc.parameters[0].type, undefined)))
            this.checkArgs(ctx, args, proc)

            return new CallExpression(
                this.rangeContext(ctx),
                proc,
                args,
                false
            )
        } else
            return new UnboundCallExpression(
                this.rangeContext(ctx),
                ctx._id.text,
                ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            )
    }

    private checkArgs(ctx: CallContext, args: Expression[], proc: Procedure) {
        if (proc.parameters.length != args.length)
            throw {
                message: 'Wrong number of arguments',
                compilation: CompilationErrorType.NumberArgumentsMismatch,
                range: this.rangeContext(ctx),
                detail: "AST-getArgs"
            }

        proc.parameters.forEach((p, index) => {
            if (p.type != args[index].type)
                throw {
                    message: 'Argument type mismatch',
                    compilation: CompilationErrorType.ArgumentTypesMismatch,
                    range: this.rangeContext(ctx._args ? ctx._args.exp(proc.instance ? index - 1 : index) : ctx),
                    detail: "AST-getArgs"
                }
        })
    }
}
