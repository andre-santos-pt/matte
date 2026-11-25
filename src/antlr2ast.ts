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
    CallExprContext, CallLiteralContext, CastExprContext, CharExprContext, CharLiteralContext, ClassContext, ConditionalExprContext,
    DecContext,
    DeclarationContext,
    ConstructorContext, DoubleExprContext, DoubleLiteralContext,
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
    ArrayLengthExpression,
    ArrayLiteralExpression,
    ArrayType,
    Assignment,
    BlockStatement,
    BooleanLiteral,
    CharLiteral,
    BreakStatement,
    CallExpression,
    CallStatement, ConditionalExpression,
    CastExpression,
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
    setASTParents,
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
import {
    checkBracketMatching,
    checkTokenMisconceptions,
    MatteErrorListener
} from "./MatteErrorListener";


export interface CompilationResult {
    errors: StaticError[]
    program?: Program
}

export function compile(source: string): CompilationResult {
    try {
        return buildAST(source)
    } catch (e: any) {
            console.log(e.stack)
            throw e
        //}
    }
}

function getTokenStreamAndParser(input: string): [CommonTokenStream, MatteErrorListener, JavaGrammarParser] {
    const errorListener = new MatteErrorListener(input)
    const chars = CharStreams.fromString(input);
    const lexer = new JavaGrammarLexer(chars);
    lexer.removeErrorListeners()
    lexer.addErrorListener(errorListener)
    const tokens = new CommonTokenStream(lexer);
    const parser = new JavaGrammarParser(tokens);
    parser.removeErrorListeners()
    parser.addErrorListener(errorListener)
    return [tokens, errorListener, parser];
}


export function buildAST(source: string): CompilationResult {
    const [tokens, errorListener, parser] = getTokenStreamAndParser(source)
    const bracketErrors = checkBracketMatching(tokens)
    if(bracketErrors.length != 0)
        return {
            errors: bracketErrors
        }

    const miscErrors = checkTokenMisconceptions(tokens)
    if(miscErrors.length != 0)
        return {
            errors: miscErrors
        }

    let unit = parser.unit()
    if (errorListener.errors.length != 0)
        return {
            errors: errorListener.errors
        }
    const visitor = new TreeVisitor(tokens)
    const program = visitor.visitUnit(unit)
    setASTParents(program)
    return {
        errors: visitor.errors.length != 0 ? visitor.errors : program.checkStaticErrors(),
        program
    }
}

export function buildASTandCall(source: string, call: string): [CompilationResult, Expression | undefined] {
    const [tokens, errorListener, parser] = getTokenStreamAndParser(source)
    let unitCtx = parser.unit();
    const visitor = new TreeVisitor(tokens);
    const chars2 = CharStreams.fromString(call);

    const lexer2 = new JavaGrammarLexer(chars2);
    lexer2.removeErrorListeners()
    lexer2.addErrorListener(errorListener)

    const tokens2 = new CommonTokenStream(lexer2);
    const parser2 = new JavaGrammarParser(tokens2);
    parser2.removeErrorListeners()
    parser2.addErrorListener(errorListener)

    let callCtx = parser2.expCall();

    if (errorListener.errors.length != 0)
        throw {
            callError: errorListener.errors[0]
        }

    const program = visitor.visitUnit(unitCtx)
    setASTParents(program)

    visitor.tokenStream = tokens2
    try {
        const exp = visitor.visitExpLiteral(callCtx.expLiteral())
        if(visitor.errors.length != 0)
            throw {
                callError: visitor.errors[0]
            }
        if (exp instanceof UnboundCallExpression)
            throw {
                callError: {
                    message: `'${exp.procedureName}' not found`
                },
                program: program,
            }
        if (!(exp instanceof CallExpression || exp instanceof NewObjectExpression))
            throw {
                callError: {
                    message: "Not a valid call"
                },
                program: program,
            }
        setASTParents(exp)
        exp.setLoose()

        return [{
            errors:  visitor.errors.length != 0 ? visitor.errors : program.checkStaticErrors(),
            program
        }, exp]
    } catch (e: any) {
        if (e.callError)
            throw e
        // e.program = program
        // if (e.compilation == StaticErrorType.UndeclaredVariable || e.compilation == StaticErrorType.Unsupported)
        //     e.callError = "Not a valid call"
        // else if (e.compilation)
        //     e.callError = e.message
        throw {
            callError: "Not a valid call",
            program: e.program,
        }
    }
}


type ScopeEntry = {
    block: boolean;
    variables: Map<string, Declaration>;
}


export function mark(text: string): string {
    return "'" + (text ?? "") + "'";
}

export function markType(type: Type | undefined): string {
    return "'" + (typeName(type) ?? "") + "'";
}

class LineComment {
    range: Range;
    text: string;
    constructor(range: Range, text: string) {
        this.range = range;
        this.text = text;
    }
}

class TreeVisitor extends JavaGrammarVisitor<any> {
    varScope: ScopeEntry[] = [];
    procedures: Procedure[] = [];
    types: TypeDeclaration[] = [];
    typeContext?: TypeDeclaration = undefined
    tokenStream: CommonTokenStream

    comments: LineComment[] = [];

    errors: StaticError[] = [];

    constructor(tokenStream: CommonTokenStream) {
        super();
        this.tokenStream = tokenStream
        this.comments = this.attachComments(this.tokenStream)
    }

    attachComments(tokens: CommonTokenStream): LineComment[] {
        return tokens.tokens
            .filter(token => token.type === JavaGrammarLexer.LINE_COMMENT)
            .map(token => new LineComment(this.rangeToken(token), token.text.substring(2).trim()))
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

    private rangeContextTo(from: ParserRuleContext, to: ParserRuleContext): Range {
        const start = from.start.start;
        const end = (to.stop?.stop || start) + 1; // Handle cases where _stop might be undefined
        return new Range(
            start,
            end,
            from.start.line,
            to.start.column,
            this.tokenStream.getText(new Interval(start, end))
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
        this.errors.push({
            type: StaticErrorType.UndeclaredVariable,
            range: this.rangeTerminal(idCtx),
            message: `Variable ${mark(name)} not found`,
            detail: {
                related: [...varsInScope.map(v => v.nameRange)],
                hint: exp ? "If the intention is to have a new variable, write its type " + (exp.type == PrimitiveType.NULL ? "" : "(" + exp.type + ") ") + "before the name" :
                    varsInScope.length > 0 ? "Variables in scope are: " + varsInScope.map(v => mark(v.name)).join(", ") : undefined
            }
        })
        const range = this.rangeTerminal(idCtx)
        return new Declaration(range, name, range, false, new ForeignType(name), undefined)
    }

    findSingleType(name: string): Type | undefined {
        if (name == "int")
            return PrimitiveType.INT
        else if (name == "double")
            return PrimitiveType.DOUBLE
        else if (name == "char")
            return PrimitiveType.CHAR
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
            const typeMap: [TypeDeclaration, MethodContext[], ConstructorContext[]][] = []
            for (let i = 0; i < ctx.getChildCount(); i++)
                if (ctx.getChild(i) instanceof RecordContext) {
                    let typeDeclaration = this.visitRecord(ctx.getChild(i) as RecordContext);
                    typeMap.push([typeDeclaration, (ctx.getChild(i) as RecordContext).method_list(), []])
                    this.types.push(typeDeclaration)
                } else if (ctx.getChild(i) instanceof ClassContext) {
                    let typeDeclaration = this.visitClass(ctx.getChild(i) as ClassContext);
                    const members = (ctx.getChild(i) as ClassContext).member_list();
                    typeMap.push([
                        typeDeclaration,
                        members.filter(m => m.method() != null).map(m => m.method()),
                        members.filter(m => m.constructor_() != null).map(m => m.constructor_())
                    ])
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
                const methodContexts = tm[1]
                const constructorContexts = tm[2]
                this.typeContext = type
                methodContexts.forEach(method => {
                    const procedure = this.findMethodInType(type, method._id.text)
                    if (procedure)
                        procedure.body = this.visitMethod(method)
                })
                constructorContexts.forEach(constructor => {
                    const procedure = this.findMethodInType(type, "$init")
                    if (procedure)
                        procedure.body = this.parseConstructorBody(constructor)
                })
                this.typeContext = undefined
            })

            for (let i = 0; i < ctx.getChildCount(); i++) {
                if (ctx.getChild(i) instanceof MethodContext) {
                    const c = ctx.getChild(i) as MethodContext
                    const proc = this.procedures.find(p => p.name == c._id.text)
                    if (!proc) {
                        this.errors.push({
                            type: StaticErrorType.MethodNotFound,
                            range: this.rangeToken(c._id),
                            message: `No method named ${mark(c._id.text)} found`,
                            detail: {
                                related: [this.procedures.map(p => p.nameRange)]
                            }
                        })
                        continue
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
                    f.field().FINAL() != null,
                    this.findType(f.field().type_()) ?? new ForeignType(f.field().type_().getText()),
                    this.rangeContext(f.field().type_()),
                    f.field().exp() ? this.expToAST(f.field().exp()) : undefined
                )
            )
        )
        ctx.member_list().forEach(member => {
            if (member.method())
                this.addInstanceMethod(typedec, member.method())
            else if (member.constructor_())
                this.addInstanceConstructor(typedec, member.constructor_())
        })
        return typedec
    }

    addInstanceConstructor(typedec: TypeDeclaration, ctx: ConstructorContext): void {
        if (ctx._id.text !== typedec.name) {
            this.errors.push({
                type: StaticErrorType.SyntaxError,
                range: this.rangeToken(ctx._id),
                message: `Constructor name must match class name '${typedec.name}'`
            });
            return;
        }
        if (this.findMethodInType(typedec, "$init")) {
            this.errors.push({
                type: StaticErrorType.SyntaxError,
                range: this.rangeToken(ctx._id),
                message: `Class '${typedec.name}' can only declare one constructor`
            });
            return;
        }

        const params = ctx.params()?.param_list().map(param => {
            const type = this.findType(param.type_());
            return new Declaration(
                this.rangeContext(param),
                param._id.text,
                this.rangeToken(param._id),
                true,
                type ?? new ForeignType(param.type_().getText()),
                this.rangeContext(param.type_())
            );
        }) ?? [];
        this.procedures.push(new Procedure(
            this.rangeContext(ctx),
            "$init",
            this.rangeToken(ctx._id),
            true,
            [new Declaration(undefined, "this", undefined, true, typedec, undefined), ...params],
            PrimitiveType.VOID,
            undefined,
            undefined
        ));
    }

    parseConstructorBody(ctx: ConstructorContext): BlockStatement {
        this.varScope.push({
            block: false,
            variables: new Map<string, Declaration>()
        });
        ctx.params()?.param_list().forEach(param => {
            const type = this.findType(param.type_());
            this.topScope().set(param._id.text, new Declaration(
                this.rangeContext(param),
                param._id.text,
                this.rangeToken(param._id),
                false,
                type ?? new ForeignType(param.type_().getText()),
                this.rangeContext(param.type_())
            ));
        });
        const body = ctx.statement_list().flatMap(statement => this.visit(statement));
        this.varScope.pop();
        return new BlockStatement(this.rangeContext(ctx), body);
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
        const stmt = this.visit(ctx.getChild(0))
        if(stmt instanceof Statement) {
            const comment = this.comments.find(c => c.range.line == stmt.range?.line)
            if(comment)
                stmt.comment = comment.text
        }
        return stmt
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
            ctx.arrayLiteralElement_list().map(element =>
                element.arrayLiteral()
                    ? this.arrayLiteralToAST(element.arrayLiteral()!)
                    : this.expToAST(element.exp()!)
            )
        )
    }

    isJavaKeyword(id: string) {
        return [
            "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends", "false", "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try", "void", "volatile", "while"
        ].includes(id)
    }

    checkImmutableAssignment(dec: Declaration, range: Range) {
        if (dec.immutable)
            this.errors.push({
                type: StaticErrorType.ImmutableVariable,
                range,
                message: `Variable ${mark(dec.name)} is immutable, it cannot be reassigned`,
                detail: {
                    related: [dec.typeRange] // TODO highlight final keyword
                }
            })
    }

    visitDeclaration = (ctx: DeclarationContext) => {
        if (last(this.varScope).variables.has(ctx._id.text))
            this.errors.push({
                type: StaticErrorType.DuplicateVariable,
                range: this.rangeToken(ctx._id),
                message: `Another variable named ${mark(ctx._id.text)} was declared previously`,
                detail: {
                    related: [last(this.varScope).variables.get(ctx._id.text)?.nameRange]
                }
            })
        const inferred = ctx.VAR() != null
        const exp = ctx.exp() ? this.expToAST(ctx.exp()) :
            ctx.arrayLiteral() ? this.arrayLiteralToAST(ctx.arrayLiteral()) : undefined
        let type: Type | undefined = inferred ? exp?.type : this.findType(ctx.type_())

        if (inferred && (!exp || !type || type == PrimitiveType.NULL ||
            type instanceof ArrayType && !type.componentType)) {
            this.errors.push({
                type: StaticErrorType.CannotInferType,
                range: this.rangeContext(ctx),
                message: exp
                    ? "Cannot infer a variable type from this initializer"
                    : "A variable declared with 'var' must have an initializer",
                detail: {}
            })
        }

        if(this.isJavaKeyword(ctx._id.text))
            this.errors.push({
                type: StaticErrorType.KeywordUsedAsIdentifier,
                range: this.rangeToken(ctx._id),
                message: `Identifier ${mark(ctx._id.text)} is a Java keyword`,
                detail: {}
            })
        const dec = new Declaration(
            this.rangeContext(ctx),
            ctx._id.text,
            this.rangeToken(ctx._id),
            ctx.FINAL() != null,
            type ? type : new ForeignType(ctx.type_()?.getText() ?? ctx._id.text),
            inferred ? this.rangeTerminal(ctx.VAR()!) : this.rangeContext(ctx.type_()),
            exp
        )
        this.topScope().set(dec.name, dec)
        return dec
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const exp = this.expToAST(ctx.exp())
        const dec = this.varLookup(ctx.compId().ID(0).getText(), ctx.compId().ID(0), exp)
        this.checkImmutableAssignment(dec, this.rangeContext(ctx))

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
        if (!(ctx._target instanceof IdExprContext)) {
            this.errors.push({
                message: "Unsupported target: " + ctx.getText(),
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx)
            })
            return new BlockStatement(this.rangeContext(ctx), [])
        }

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        this.checkImmutableAssignment(dec, this.rangeContext(ctx))
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
        if (!(ctx._target instanceof IdExprContext)) {
            this.errors.push({
                message: "Unsupported target: " + ctx.getText(),
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx)
            })
            return new BlockStatement(this.rangeContext(ctx), [])
        }

        const dec = this.varLookup(ctx._target.getText(), ctx._target.ID())
        this.checkImmutableAssignment(dec, this.rangeContext(ctx))
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
        new BreakStatement(this.rangeContext(ctx))

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
            this.handleInstanceCall(ctx, ctx.exp(), ctx.call())
        )

    expToAST(ctx: ExpContext):
        Expression {
        if (ctx instanceof BracketsExprContext) {
            return this.expToAST(ctx.exp())
        } else if (ctx instanceof CastExprContext) {
            return new CastExpression(
                this.rangeContext(ctx),
                ctx._castType.text == "int" ? PrimitiveType.INT : PrimitiveType.DOUBLE,
                this.expToAST(ctx._target)
            )
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

        else if (ctx instanceof CharExprContext)
            return new CharLiteral(
                this.rangeContext(ctx),
                ctx.CHAR().getText().substring(1, ctx.CHAR().getText().length - 1)
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
            const typeName = ctx._typeName.text
            let type: Type | undefined = this.findSingleType(typeName)
            return new ArrayAllocationExpression(
                this.rangeContext(ctx),
                type ? type : new ForeignType(typeName),
                ctx.dimensions().exp_list().map(dimension => this.expToAST(dimension))
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

        else if (ctx instanceof FieldExprContext) {
            const target = this.expToAST(ctx._target)
            if (ctx._fieldId.text == "length" && target.type instanceof ArrayType)
                return new ArrayLengthExpression(this.rangeContext(ctx), target)
            return new FieldAccessExpression(
                this.rangeContext(ctx),
                target,
                ctx._fieldId.text,
                this.rangeToken(ctx._fieldId)
            )
        }

        else if (ctx instanceof InstanceCallExprContext) {
            return this.handleInstanceCall(ctx, ctx.exp(), ctx.call());
        } else
        {
            this.errors.push({
                message: "Invalid expression: " + this.streamText(ctx),
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx),
                detail: "AST-exp2AST"
            })
            return new NullLiteral(this.rangeContext(ctx))
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

        else if (ctx instanceof CharLiteralContext)
            return new CharLiteral(
                this.rangeContext(ctx),
                ctx.CHAR().getText().substring(1, ctx.CHAR().getText().length - 1)
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
                this.checkArgs(ctx.expLiteralList()?.expLiteral_list() ?? [ctx], args, proc)
                return new CallExpression(
                    this.rangeContext(ctx),
                    proc,
                    args,
                    false
                )
            } else {
                this.errors.push({
                    message: `No method named ${mark(ctx._id.text)} found`,
                    type: StaticErrorType.MethodNotFound,
                    range: this.rangeToken(ctx._id),
                    detail: {
                        related: this.procedures.map(p => p.nameRange),
                        hint: this.procedures.length == 0 ? undefined : "Do you mean " + this.procedures.map(p => mark(p.name)).join(", ") + "?"
                    }
                })
                return new UnboundCallExpression(this.rangeContext(ctx), ctx._id.text, false, [])
            }
        } else if (ctx instanceof InstanceCallLiteralContext) {
            const proc = this.procedures.find(p => p.name == ctx._id.text)
            if (proc) {
                let instance = this.visitExpLiteral(ctx.expLiteral());
                let args = ctx._args ? [instance, ...ctx._args.expLiteral_list().map(a => this.visitExpLiteral(a))] : [instance]
                this.checkArgs(ctx.expLiteralList()?.expLiteral_list() ?? [ctx], args, proc)
                return new CallExpression(
                    this.rangeContext(ctx),
                    proc,
                    args,
                    true
                )
            } else {
                this.errors.push({
                    message: "Instance call not supported here",
                    type: StaticErrorType.Unsupported,
                    range: this.rangeContext(ctx)
                })
                const instance = this.visitExpLiteral(ctx.expLiteral())
                const args = ctx._args ? [instance, ...ctx._args.expLiteral_list().map(a => this.visitExpLiteral(a))] : [instance]
                return new UnboundCallExpression(this.rangeContext(ctx), ctx._id.text, true, args)
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
            this.errors.push({
                message: "Invalid expression",
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(ctx)
            })
            return new NullLiteral(this.rangeContext(ctx))
        }
    }

    private findMethodInType(type: TypeDeclaration, methodName: string):
        Procedure | undefined {
        return this.procedures.find(p => p.instance && p.name == methodName && p.parameters.length > 0 && p.parameters[0].type == type)
    }

    private handleInstanceCall(ctx: ParserRuleContext, expCtx: ExpContext, callCtx: CallContext) {
        const target = this.expToAST(expCtx)
        if (!(target instanceof Variable || target instanceof NewObjectExpression))
        {
            this.errors.push({
                message: "Unsupported target: " + expCtx.getText(),
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(expCtx)
            })
            const args = [target].concat(callCtx._args ? callCtx._args.exp_list().map(e => this.expToAST(e)) : [])
            return new UnboundCallExpression(this.rangeContext(ctx), callCtx._id.text, true, args)
        }

        const args = [this.expToAST(expCtx)].concat(callCtx._args ? callCtx._args.exp_list().map(e => this.expToAST(e)) : [])

        let proc: Procedure | undefined = undefined

        if (target.type instanceof TypeDeclaration)
            proc = this.findMethodInType(target.type, callCtx._id.text)
        else if (target.type instanceof ForeignType)
            return new UnboundCallExpression(
                this.rangeContext(ctx),
                callCtx._id.text,
                true,
                args
            )
        else {
            this.errors.push({
                message: "Unsupported target: " + expCtx.getText(),
                type: StaticErrorType.Unsupported,
                range: this.rangeContext(expCtx)
            })
            return new UnboundCallExpression(this.rangeContext(ctx), callCtx._id.text, true, args)
        }

        if (!proc)
        {
            this.errors.push({
                message: "No method named '" + callCtx._id.text + "' found for type '" + target.type.name + "'",
                type: StaticErrorType.MethodNotFound,
                range: this.rangeToken(callCtx._id),
                detail: "AST-instanceCall"
            })
            return new UnboundCallExpression(this.rangeContext(ctx), callCtx._id.text, true, args)
        }


        this.checkArgs(callCtx.expList()?.exp_list() ?? [callCtx], args, proc);

        return new CallExpression(
            this.rangeContext(ctx),
            proc,
            args,
            true
        )
    }

    private handleNewCall(ctx: ObjectAllocExprContext) {
        const type = this.findSingleType(ctx.newCall()._typeName.text)
        const args = ctx.newCall()._args ? ctx.newCall()._args.exp_list().map(e => this.expToAST(e)) : [];
        if (type) {
            if (type instanceof TypeDeclaration && !type.isRecord) {
                const constructor = this.findMethodInType(type, "$init");
                if (constructor)
                    this.checkArgs(ctx.newCall()?.expList()?.exp_list() ?? [ctx.newCall()], args, constructor, 1);
                else if (args.length > 0) {
                    this.errors.push({
                        message: `Class '${type.name}' has no constructor accepting arguments`,
                        type: StaticErrorType.NumberArgumentsMismatch,
                        range: this.rangeContext(ctx)
                    });
                }
            }
            return new NewObjectExpression(
                this.rangeContext(ctx),
                type,
                args
            )
        } else
            return new UnboundNewObjectExpression(
                this.rangeContext(ctx),
                ctx.newCall()._typeName.text,
                args
            )
    }

    private handleCall(ctx: CallContext) {
        const proc = this.procedures.find(p => p.name == ctx._id.text)
        if (proc) {
            let args = ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            if (proc.instance)
                args.unshift(new Variable(this.rangeContext(ctx), new Declaration(undefined, "this", undefined, true, proc.parameters[0].type, undefined)))
            this.checkArgs(ctx.expList()?.exp_list() ?? [ctx], args, proc)

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
                false,
                ctx._args ? ctx._args.exp_list().map(e => this.expToAST(e)) : []
            )
    }

    private checkArgs(ctx: ParserRuleContext[], args: Expression[], proc: Procedure, parameterOffset = 0) {
        const expectedCount = proc.parameters.length - parameterOffset;
        if (expectedCount != args.length)
        {
            this.errors.push({
                message: "Method " + mark(proc.name) + " expects " + expectedCount + " arguments (not " + args.length + ")",
                type: StaticErrorType.NumberArgumentsMismatch,
                range: args.length == 0 ? this.rangeTokenTo(ctx[0].getToken(JavaGrammarParser.LPAREN,0).symbol,
                    ctx[0].getToken(JavaGrammarParser.RPAREN, 0).symbol) : this.rangeContextTo(ctx[0], ctx[ctx.length - 1]),
                detail: {
                    related: [...proc.parameters.slice(parameterOffset).map(p => p.typeRange)]
                }
            })
            return
        }

        args.forEach((arg, index) => {
            const parameter = proc.parameters[index + parameterOffset];
            if (parameter.type instanceof ArrayType && arg instanceof ArrayLiteralExpression && arg.getChildren().length == 0)
                arg.type = parameter.type;

            if (!typeCompatibleWith(arg.type, parameter.type))
                this.errors.push({
                    message: "The " + this.toWordOrder(index) + " parameter of method " + mark(proc.name) + " is of type " + markType(parameter.type) + " (not " + markType(arg.type) + ")",
                    type: StaticErrorType.ArgumentTypesMismatch,
                    range: this.rangeContext(ctx[index]),
                    detail: {
                        related: [parameter.typeRange]
                    }
                })
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
