import JavaGrammarParser, {
    ArrayAllocExprContext,
    ArrayAssignmentContext,
    ArrayExprContext, ArrayLiteralBracketsContext, ArrayLiteralContext,
    //ArrayLitExprContext,
    AssignmentContext,
    BinaryOpAddContext,
    BinaryOpLogContext,
    BinaryOpMulContext,
    BinaryOpRelContext,
    BlockStmtContext,
    BoolExprContext, BoolLiteralContext,
    BracketsExprContext,
    BreakContext,
    CallContext,
    CallExprContext, CallLiteralContext, ClassContext, ConditionalExprContext,
    DecContext,
    DeclarationContext,
    DoubleExprContext, DoubleLiteralContext,
    ExpContext, ExpLiteralContext, FieldContext,
    FieldExprContext,
    ForStmtContext,
    IdExprContext,
    IfElseStmtContext,
    IncContext,
    InstanceCallExprContext, InstanceCallLiteralContext,
    InstanceCallStatementContext,
    IntExprContext, IntLiteralContext,
    MethodContext, NewCallLiteralContext,
    NullExprContext, NullLiteralContext,
    ObjectAllocExprContext,
    RecordContext,
    ReturnContext,
    ScriptContext,
    StatementContext,
    StringExprContext, StringLiteralContext,
    TypeContext,
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
    CallStatement, ConditionalExpression,
    Declaration,
    DoubleLiteral,
    Expression,
    FieldAccessExpression,
    ForeignType,
    IfStatement,
    IntLiteral,
    LogicalExpression,
    NewObjectExpression,
    NullLiteral,
    PrimitiveType,
    Procedure,
    Program,
    RelationalExpression,
    ReturnStatement,
    Statement,
    StaticError,
    StaticErrorType,
    StringLiteral,
    Type,
    typeCompatibleWith,
    TypeDeclaration,
    typeName,
    UnaryExpression,
    UnboundCallExpression,
    UnboundNewObjectExpression,
    Variable,
    WhileStatement
} from "./ast";
import Range from "./Range";
import JavaGrammarVisitor from "./generated/JavaGrammarVisitor";
import {
    BailErrorStrategy,
    CharStreams,
    CommonTokenStream,
    Interval,
    ParserRuleContext,
    TerminalNode,
    Token
} from "antlr4";
import {last} from "./utils";
import JavaGrammarLexer from "./generated/JavaGrammarLexer";
import {checkBracketMatching, MatteErrorListener} from "./MatteErrorListener";


export function compile(source: string): Program | StaticError {
    try {
        return buildAST(source)
    } catch (e: any) {
        if (e.compilation)
            return {
                range: e.range,
                type: e.compilation,
                message: e.message,
                detail: e.detail
            }
        else {
            console.log(e.stack)
            throw e
        }
    }
}

function getTokenStreamAndParser(input: string): [CommonTokenStream, MatteErrorListener, JavaGrammarParser] {
    const errorListener = new MatteErrorListener(input)
    const chars = CharStreams.fromString(input);
    const lexer = new JavaGrammarLexer(chars);
    lexer.removeErrorListeners()
    lexer.addErrorListener(errorListener)
    const tokens = new CommonTokenStream(lexer);
    const bracketErrors = checkBracketMatching(tokens)
    const parser = new JavaGrammarParser(tokens);
    // if (bracketErrors) {
    //     // A bracket mismatch suggests missing/inserted tokens; fail fast instead of
    //     // letting the parser recover and silently fabricate a broken tree.
    //     parser._errHandler = new BailErrorStrategy()
    // }
    parser.removeErrorListeners()
    parser.addErrorListener(errorListener)
    return [tokens, errorListener, parser];
}


export function buildAST(source: string) {
    const [tokens, errorListener, parser] = getTokenStreamAndParser(source)
    let unit = parser.unit()
    errorListener.checkErrors()
    const visitor = new TreeVisitor(tokens)
    return visitor.visitUnit(unit)
}

export function buildASTandCall(source: string, call: string): [Program, Expression] {
    const [tokens, errorListener, parser] = getTokenStreamAndParser(source)
    let unitCtx = parser.unit();
    errorListener.checkErrors()
    const visitor = new TreeVisitor(tokens);
    const chars2 = CharStreams.fromString(call);
    const lexer2 = new JavaGrammarLexer(chars2);
    const tokens2 = new CommonTokenStream(lexer2);
    const parser2 = new JavaGrammarParser(tokens2);
    let callCtx = parser2.expLiteral();

    const program = visitor.visitUnit(unitCtx)

    visitor.tokenStream = tokens2
    try {
        const exp = visitor.visitExpLiteral(callCtx)
        if (exp instanceof UnboundCallExpression)
            throw {
                callError: `'${exp.procedureName}' not found`,
                program: program,
            }
        if (!(exp instanceof CallExpression || exp instanceof NewObjectExpression))
            throw {
                callError: "Not a valid call",
                program: program,
            }
        exp.setLoose()
        return [program, exp]
    } catch (e: any) {
        if (e.callError)
            throw e
        e.program = program
        if (e.compilation == StaticErrorType.UndeclaredVariable || e.compilation == StaticErrorType.Unsupported)
            e.callError = "Not a valid call"
        else if (e.compilation)
            e.callError = e.message
        throw {
            callError: "Not a valid call",
            program: program,
        }
    }
}

type ScopeEntry = {
    block: boolean;
    variables: Map<string, Declaration>;
}

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

function checkReturns(procedure: Procedure): void {
    function checkReturnsAux(statement: Statement, procedure: Procedure): void {
        if (statement instanceof ReturnStatement) {
            if (statement.expression == undefined) {
                if (procedure.returnType != PrimitiveType.VOID)
                    throw {
                        compilation: StaticErrorType.TypeMismatch,
                        range: statement.range,
                        message: `Function must return a value of type ${markType(procedure.returnType)}`,
                        detail: {
                            related: [procedure.returnTypeRange]
                        }
                    }

            } else {
                if (procedure.returnType == PrimitiveType.VOID)
                    throw {
                        compilation: StaticErrorType.TypeMismatch,
                        range: statement.expression.range,
                        message: `Procedure cannot return any value`,
                        detail: {
                            related: [procedure.returnTypeRange]
                        }
                    }
                if (!typeCompatibleWith((statement.expression as Expression).type, procedure.returnType)) {
                    throw {
                        compilation: StaticErrorType.TypeMismatch,
                        range: statement.expression.range,
                        message: `Expected value of type ${markType(procedure.returnType)} (not ${markType(statement.expression?.type)})`,
                        detail: {
                            related: [procedure.returnTypeRange]
                        }
                    }
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

    if (procedure.body && procedure.returnType)
        checkReturnsAux(procedure.body, procedure);
}


export function mark(text: string): string {
    return "'" + (text ?? "") + "'";
}

export function markType(type: Type | undefined): string {
    return "'" + (typeName(type) ?? "") + "'";
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

    varLookup(name: string, idCtx: TerminalNode, exp?: Expression): Declaration {
        let varsInScope: Declaration[] = []
        for (let i = this.varScope.length - 1; i >= 0; i--) {
            varsInScope.push(...Array.from(this.varScope[i].variables.values()))
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
            compilation: StaticErrorType.UndeclaredVariable,
            range: this.rangeTerminal(idCtx),
            message: `Variable ${mark(name)} not found`,
            detail: {
                related: [...varsInScope.map(v => v.nameRange)],
                hint: exp ? "If the intention is to have a new variable, write its type " + (exp.type == PrimitiveType.NULL ? "" : "(" + exp.type + ") ") + "before the name" :
                    varsInScope.length > 0 ? "Variables in scope are: " + varsInScope.map(v => mark(v.name)).join(", ") : undefined
            }
        }
    }

    findSingleType(name: string): Type | undefined {
        if (name == "int")
            return PrimitiveType.INT
        else if (name == "double")
            return PrimitiveType.DOUBLE
        else if (name == "boolean")
            return PrimitiveType.BOOLEAN
        else if (name == "String")
            return PrimitiveType.STRING
        else if (name == "void")
            return PrimitiveType.VOID
        else
            return this.types.find(t => t.name == name)
    }

    findType(ctx: TypeContext): Type | undefined {
        const name = ctx._id.text
        let type: Type | undefined = this.findSingleType(name)
        for (let d = 0; d < ctx.arrayDim_list().length; d++)
            type = new ArrayType(type)
        return type
    }

    visitUnit = (ctx: UnitContext) => {
        if (ctx.script())
            return new Program(this.visitScript(ctx.script()))
        else {
            const typeMap: [TypeDeclaration, MethodContext[]][] = []
            for (let i = 0; i < ctx.getChildCount(); i++)
                if (ctx.getChild(i) instanceof RecordContext) {
                    let typeDeclaration = this.visitRecord(ctx.getChild(i) as RecordContext);
                    typeMap.push([typeDeclaration, (ctx.getChild(i) as RecordContext).method_list()])
                    this.types.push(typeDeclaration)
                } else if (ctx.getChild(i) instanceof ClassContext) {
                    let typeDeclaration = this.visitClass(ctx.getChild(i) as ClassContext);
                    typeMap.push([typeDeclaration, (ctx.getChild(i) as ClassContext).member_list().filter(m => m.method() != null).map(m => m.method())])
                    this.types.push(typeDeclaration)
                }

            // top-level methods
            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const mctx = ctx.getChild(i) as MethodContext
                    const params = mctx.params() ? mctx.params().param_list().map(p => {
                        let type = this.findType(p.type_())
                        return new Declaration(
                            this.rangeContext(p),
                            p._id.text,
                            this.rangeToken(p._id),
                            false,
                            type ? type : new ForeignType(p.type_().getText()),
                            this.rangeContext(p.type_()),
                        )
                    }) : []
                    let type = this.findType(mctx.type_())
                    this.procedures.push(new Procedure(
                        this.rangeContext(ctx),
                        mctx._id.text,
                        this.rangeToken(mctx._id),
                        false,
                        params,
                        type ? type : new ForeignType(mctx.type_().getText()),
                        this.rangeContext(mctx.type_()),
                        undefined
                    ))
                }
            }

            typeMap.forEach(tm => {
                const type = tm[0]
                const typeCtx = tm[1]
                const recordProcedures = this.procedures.filter(p => p.range && p.instance && p.parameters.length > 0 && p.parameters[0].type == type)
                this.typeContext = type
                recordProcedures.forEach((p, i) => {
                    p.body = this.visitMethod(typeCtx[i])
                })
                this.typeContext = undefined
            })

            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const c = ctx.getChild(i) as MethodContext
                    const proc = this.procedures.find(p => p.name == c._id.text)
                    if (!proc)
                        throw {
                            compilation: StaticErrorType.MethodNotFound,
                            range: this.rangeToken(c._id),
                            message: `No method named ${mark(c._id.text)} found`,
                            detail: {
                                related: [this.procedures.map(p => p.nameRange)]
                            }
                        }
                    proc.body = this.visitMethod(ctx.getChild(i) as MethodContext)
                }
            }

            this.procedures.forEach(procedure => {
                if (procedure.returnType !== PrimitiveType.VOID &&
                    (!procedure.body || !alwaysReturns(procedure.body))) {
                    throw {
                        compilation: StaticErrorType.MissingReturn,
                        range: procedure.nameRange,
                        message: `Missing return statement with value of type ${markType(procedure.returnType)}`,
                        detail: {
                            related: [procedure.returnTypeRange]
                        }
                    }
                }
                checkReturns(procedure)
            });

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
            this.addInstanceMethod(typedec, mctx)
        })

        ctx.params().param_list().forEach(p => {
            let type = this.findType(p.type_())
            const dec = new Declaration(
                this.rangeContext(p),
                p._id.text,
                this.rangeToken(p._id),
                true,
                type ? type : new ForeignType(p.type_().getText()),
                this.rangeContext(p.type_())
            )
            typedec.fields.push(dec)

            this.procedures.push(new Procedure(
                undefined,
                p._id.text,
                undefined,
                true,
                [new Declaration(this.rangeToken(ctx._id), "this", undefined, true, typedec, undefined)],
                type ? type : new ForeignType(p.type_().getText()),
                this.rangeContext(p.type_()),
                new BlockStatement(undefined, [
                    new ReturnStatement(undefined, new Variable(undefined, dec))
                ])
            ))
        })
        return typedec
    }

    addInstanceMethod(typedec: TypeDeclaration, mctx: MethodContext) {
        const params = mctx.params() ? mctx.params().param_list().map(p => {
            let type = this.findType(p.type_())
            return new Declaration(
                this.rangeContext(p),
                p._id.text,
                this.rangeToken(p._id),
                true,
                type ? type : new ForeignType(p.type_().getText()),
                this.rangeContext(p.type_())
            )
        }) : []

        let type = mctx.type_().getText() == typedec.name ? typedec : this.findType(mctx.type_())
        this.procedures.push(new Procedure(
            this.rangeContext(mctx),
            mctx._id.text,
            this.rangeToken(mctx._id),
            true,
            [new Declaration(undefined, "this", undefined, true, typedec, undefined)].concat(params),
            type ? type : new ForeignType(mctx.type_().getText()),
            this.rangeContext(mctx.type_()),
            undefined
        ))
    }


    visitClass = (ctx: ClassContext) => {
        const typedec = new TypeDeclaration(
            ctx._id.text,
            this.rangeToken(ctx._id),
            false,
            ctx.member_list().filter(m => m.field() != null).map(f =>
                new Declaration(
                    this.rangeContext(f),
                    f.field().ID().getText(),
                    this.rangeToken(f.field()._id),
                    false,
                    this.findType(f.field().type_()) ?? new ForeignType(f.field().type_().getText()),
                    this.rangeContext(f.field().type_()),
                    f.field().exp() ? this.expToAST(f.field().exp()) : undefined
                )
            )
        )
        ctx.member_list().filter(m => m.method() != null)
            .forEach(m => this.addInstanceMethod(typedec, m.method()))
        return typedec
    }


    visitMethod = (ctx: MethodContext) => {
        this.varScope.push({
            block: false,
            variables: new Map<string, Declaration>()
        })
        ctx.params()?.param_list().forEach(p => {
            let type = this.findType(p.type_())
            this.topScope().set(p._id.text, new Declaration(
                this.rangeContext(p),
                p._id.text,
                this.rangeToken(p._id),
                false,
                type ? type : new ForeignType(p.type_().getText()),
                this.rangeContext(p.type_())
            ))
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

    arrayLiteralToAST(ctx: ArrayLiteralContext): ArrayLiteralExpression {
        return new ArrayLiteralExpression(this.rangeContext(ctx),
            ctx.expList() ? ctx.expList().exp_list().map(e => this.expToAST(e)) : []
        )
    }

    visitDeclaration = (ctx: DeclarationContext) => {
        if (last(this.varScope).variables.has(ctx._id.text))
            throw {
                compilation: StaticErrorType.DuplicateVariable,
                range: this.rangeToken(ctx._id),
                message: `Another variable named ${mark(ctx._id.text)} was declared previously`,
                detail: {
                    related: [last(this.varScope).variables.get(ctx._id.text)?.nameRange]
                }
            }
        let type: Type | undefined = this.findType(ctx.type_())
        const exp = ctx.exp() ? this.expToAST(ctx.exp()) :
            ctx.arrayLiteral() ? this.arrayLiteralToAST(ctx.arrayLiteral()) : undefined

        const dec = new Declaration(
            this.rangeContext(ctx),
            ctx._id.text,
            this.rangeToken(ctx._id),
            false,
            type ? type : new ForeignType(ctx.type_().getText()),
            this.rangeContext(ctx.type_()),
            exp
        )
        this.topScope().set(dec.name, dec)
        return dec
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const exp = this.expToAST(ctx.exp())
        const dec = this.varLookup(ctx.compId().ID(0).getText(), ctx.compId().ID(0), exp)
        if (dec.immutable)
            throw {
                compilation: StaticErrorType.ImmutableVariable,
                range: this.rangeContext(ctx),
                message: `Variable ${mark(dec.name)} is immutable, it cannot be reassigned`,
                detail: {
                    related: [dec.range]
                }
            }

        return new Assignment(
            this.rangeContext(ctx),
            dec,
            exp
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
        this.varScope.push({
            block: true,
            variables: new Map<string, Declaration>()
        })
        const ret: Statement[] = []
        if (ctx.for_().declaration())
            ret.push(this.visitDeclaration(ctx.for_().declaration()))
        let body = this.visit(ctx.for_()._body)
        if (ctx.for_().forProgress()) {
            const prog = this.visitStmt(ctx.for_().forProgress()) as Statement
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
        this.varScope.pop()
        return new BlockStatement(
            this.rangeContext(ctx),
            ret
        )
    }

    visitInc = (ctx: IncContext) => {
        if (!(ctx._target instanceof IdExprContext))
            throw {
                message: "Unsupported target: " + ctx.getText(),
                compilation: StaticErrorType.Unsupported,
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
                compilation: StaticErrorType.Unsupported,
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
            ctx._expression ? this.expToAST(ctx._expression) : undefined
        )

    visitCall = (ctx: CallContext) =>
        new CallStatement(
            this.rangeContext(ctx),
            this.handleCall(ctx)
        )

    visitInstanceCallStatement = (ctx: InstanceCallStatementContext) =>
        new CallStatement(
            this.rangeContext(ctx),
            this.handleInstanceCall(ctx, ctx.exp(),ctx.call())
        )

    expToAST(ctx: ExpContext):
        Expression {
        if (ctx instanceof BracketsExprContext) {
            return this.expToAST(ctx.exp())
        } else if (ctx instanceof IdExprContext) {
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

        else if (ctx instanceof NullExprContext)
            return new NullLiteral(this.rangeContext(ctx))

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
        } else if (ctx instanceof BinaryOpMulContext)
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

            else if (ctx instanceof ConditionalExprContext)
                return new ConditionalExpression(
                    this.rangeContext(ctx),
                    this.expToAST(ctx._condition),
                    this.expToAST(ctx._trueCase),
                    this.expToAST(ctx._falseCase)
                )

        else if (ctx instanceof ArrayAllocExprContext) {
            let type: Type | undefined = this.findSingleType(ctx.ID().getText())
            return new ArrayAllocationExpression(
                this.rangeContext(ctx),
                type ? type : new ForeignType(ctx.ID().getText()),
                [this.expToAST(ctx.dimensions().exp())] // TODO multidim
            )
        } else if (ctx instanceof ArrayExprContext)
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
            return this.handleInstanceCall(ctx, ctx.exp(), ctx.call());
        } else
            throw {
                message: "Invalid expression: " + this.streamText(ctx),
                compilation: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx),
                detail: "AST-exp2AST"
            }
    }

    visitExpLiteral = (ctx: ExpLiteralContext): Expression => {
        if (ctx instanceof IntLiteralContext)
            return new IntLiteral(
                this.rangeContext(ctx),
                Number((ctx.MINUS() ? "-" : "") + ctx.INT().getText())
            )
        else if (ctx instanceof DoubleLiteralContext)
            return new DoubleLiteral(
                this.rangeContext(ctx),
                Number((ctx.MINUS() ? "-" : "") + ctx.DOUBLE().getText())
            )

        else if (ctx instanceof BoolLiteralContext)
            return new BooleanLiteral(
                this.rangeContext(ctx),
                ctx.BOOLEAN().getText() == "true"
            )

        else if (ctx instanceof StringLiteralContext)
            return new StringLiteral(
                this.rangeContext(ctx),
                ctx.STRING().getText().substring(1, ctx.STRING().getText().length - 1)
            )

        else if (ctx instanceof NullLiteralContext)
            return new NullLiteral(this.rangeContext(ctx))

        else if (ctx instanceof ArrayLiteralBracketsContext) {
            return new ArrayLiteralExpression(
                this.rangeContext(ctx),
                ctx._elements?.expLiteral_list()?.map(e => this.visitExpLiteral(e)) ?? []
            )
        } else if (ctx instanceof CallLiteralContext) {
            const proc = this.procedures.find(p => p.name == ctx._id.text)
            if (proc) {
                let args = ctx._args ? ctx._args.expLiteral_list().map(a => this.visitExpLiteral(a)) : []
                this.checkArgs(ctx, args, proc)
                return new CallExpression(
                    this.rangeContext(ctx),
                    proc,
                    args,
                    false
                )
            } else
                throw {
                    message: "Invalid call",
                    compilation: StaticErrorType.Unsupported,
                    range: this.rangeContext(ctx)
                }
        } else if (ctx instanceof InstanceCallLiteralContext) {
            const proc = this.procedures.find(p => p.name == ctx._id.text)
            if (proc) {
                let instance = this.visitExpLiteral(ctx.expLiteral());
                let args = ctx._args ? [instance, ...ctx._args.expLiteral_list().map(a => this.visitExpLiteral(a))] : [instance]
                this.checkArgs(ctx, args, proc)
                return new CallExpression(
                    this.rangeContext(ctx),
                    proc,
                    args,
                    false
                )
            } else
                throw {
                    message: "Invalid call",
                    compilation: StaticErrorType.Unsupported,
                    range: this.rangeContext(ctx)
                }
        } else if (ctx instanceof NewCallLiteralContext) {
            const typeId = ctx.ID().getText()
            const type = this.findSingleType(typeId)
            const args = ctx._args ? ctx._args.expLiteral_list().map(
                e => this.visitExpLiteral(e)
            ) : []
            if (type)
                // TODO n args check + type
                return new NewObjectExpression(
                    this.rangeContext(ctx), type, args
                )
            else
                return new UnboundNewObjectExpression(
                    this.rangeContext(ctx),
                    typeId,
                    args
                )
        } else {
            throw {
                message: "Invalid expression",
                compilation: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx)
            }
        }
    }

    private findMethodInType(type: TypeDeclaration, methodName: string):
        Procedure | undefined {
        return this.procedures.find(p => p.instance && p.name == methodName && p.parameters.length > 0 && p.parameters[0].type == type)

    }

    private handleInstanceCall(ctx: ParserRuleContext, expCtx: ExpContext, callCtx: CallContext) {
        const target = this.expToAST(expCtx)
        if (!(target instanceof Variable || target instanceof NewObjectExpression))
            throw {
                message: "Unsupported target: " + expCtx.getText(),
                compilation: StaticErrorType.Unsupported,
                range: this.rangeContext(expCtx)
            }

        if (!(target.type instanceof TypeDeclaration))
            throw {
                message: "Unsupported target: " + expCtx.getText(),
                compilation: StaticErrorType.Unsupported,
                range: this.rangeContext(expCtx)
            }

        const proc = this.findMethodInType(target.type, callCtx._id.text)
        if (!proc)
            throw {
                message: "No method named '" + callCtx._id.text + "' found for type '" + target.type.name + "'",
                compilation: StaticErrorType.MethodNotFound,
                range: this.rangeToken(callCtx._id),
                detail: "AST-instanceCall"
            }

        const args = [this.expToAST(expCtx)].concat(callCtx._args ? callCtx._args.exp_list().map(e => this.expToAST(e)) : [])
        this.checkArgs(callCtx, args, proc);

        return new CallExpression(
            this.rangeContext(ctx),
            proc,
            args,
            true
        )
    }

    private handleNewCall(ctx: ObjectAllocExprContext) {
        const type = this.findSingleType(ctx.newCall()._typeName.text)
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
                ctx.newCall()._typeName.text,
                ctx.newCall()._args ? ctx.newCall()._args.exp_list().map(
                    e => this.expToAST(e)
                ) : []
            )
    }

    private handleCall(ctx: CallContext) {
        const proc = this.procedures.find(p => p.name == ctx._id.text)
        if (proc) {
            let args = ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            if (proc.instance)
                args.unshift(new Variable(this.rangeContext(ctx), new Declaration(undefined, "this", undefined, true, proc.parameters[0].type, undefined)))
            this.checkArgs(ctx.expList() ?? ctx, args, proc)

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

    private checkArgs(ctx: ParserRuleContext, args: Expression[], proc: Procedure) {
        if (proc.parameters.length != args.length)
            throw {
                message: "Method " + mark(proc.name) + " expects " + proc.parameters.length + " arguments (not " + args.length + ")",
                compilation: StaticErrorType.NumberArgumentsMismatch,
                range: this.rangeContext(ctx),
                detail: {
                    related: [...proc.parameters.map(p => p.typeRange)]
                }
            }

        proc.parameters.forEach((p, index) => {
            if (p.type instanceof ArrayType && args[index] instanceof ArrayLiteralExpression && (args[index] as ArrayLiteralExpression).getChildren().length == 0)
                (args[index] as ArrayLiteralExpression).type = p.type

            if (!typeCompatibleWith(args[index].type, p.type))
                throw {
                    message: "The " + this.toWordOrder(index) + " parameter of method " + mark(proc.name) + " is of type " + markType(proc.parameters[index].type) + " (not " + markType(args[index].type) + ")",
                    compilation: StaticErrorType.ArgumentTypesMismatch,
                    range: this.rangeContext(ctx),
                    detail: {
                        related: [proc.parameters[index].typeRange]
                    }
                }
        })
    }

    private toWordOrder(n: number) {
        switch (n) {
            case 0:
                return "first"
            case 1:
                return "second"
            case 2:
                return "third"
            case 3:
                return "forth"
            case 4:
                return "fifth"
            case 5:
                return "sixth"
            default:
                return n + "th"
        }
    }
}
