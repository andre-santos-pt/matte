import JavaGrammarParser, {
    AssignmentContext,
    BinaryOpAddContext,
    BinaryOpMulContext,
    BinaryOpRelContext,
    BlockStmtContext,
    BoolExprContext,
    DeclarationContext,
    ExpContext,
    IdExprContext,
    IfContext,
    IfElseStmtContext,
    IntExprContext,
    ScriptContext,
    StatementContext,
    UnaryOpContext,
    UnitContext,
    WhileStmtContext
} from "./generated/JavaGrammarParser";
import {
    Assignment,
    BinaryExpression, BlockStatement, BooleanLiteral,
    Declaration,
    Expression, IfStatement,
    IntLiteral, Program,
    Statement, UnaryExpression, Variable, WhileStatement
} from "./ast";
import Range from "./Range";
import JavaGrammarVisitor from "./generated/JavaGrammarVisitor";
import {ParseTree} from "antlr4";


export function parseTreeToAST(ctx: UnitContext): Program {
    const visitor = new ParseTreeVisitor();
    return visitor.visitUnit(ctx);
}

class ParseTreeVisitor extends JavaGrammarVisitor<any> {
    varScope: Map<string, Declaration>[] = [];

    topScope(): Map<string, Declaration> {
        return this.varScope[this.varScope.length - 1];
    }

    varLookup(name: string): Declaration | undefined {
        for (let i = this.varScope.length - 1; i >= 0; i--) {
            const scope = this.varScope[i];
            if (scope.has(name)) {
                return scope.get(name)!;
            }
        }
        return undefined;
    }

    visitUnit = (ctx: UnitContext) => {
        return new Program(
            this.visitScript(ctx.script())
        )
    }

    visitScript = (ctx: ScriptContext) => {
        this.varScope.push(new Map<string, Declaration>())
        let statements: Statement[] = ctx.statement_list().map(stmt => {
            return this.visit(stmt)
        })
        this.varScope.pop()
        return new BlockStatement(Range.fromContext(ctx), statements)
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
        const dec = new Declaration(
            Range.fromContext(ctx),
            ctx._id.text,
            ctx.exp() ? this.expToAST(ctx.exp()) : null
        )
        this.topScope().set(dec.name, dec)
        return dec
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const dec = this.varLookup(ctx.compId().ID(0).getText())
        if (!dec) throw new Error(`Variable ${ctx.compId().ID(0).getText()} not declared`); // TODO : java specific
        const ass = new Assignment(
            Range.fromContext(ctx),
            dec,
            this.expToAST(ctx.exp())
        )
        return ass
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

    expToAST(ctx: ExpContext): Expression {
        if (ctx instanceof IdExprContext) {
            const dec = this.varLookup((ctx as IdExprContext).getText())
            if (!dec) throw new Error(`Variable ${(ctx as IdExprContext).getText()} not declared`);
            return new Variable(Range.fromContext(ctx), dec)
        } else if (ctx instanceof IntExprContext)
            return new IntLiteral(Range.fromContext(ctx), Number((ctx as IntExprContext).INT().getText()));
        else if (ctx instanceof BoolExprContext)
            return new BooleanLiteral(Range.fromContext(ctx), (ctx as BoolExprContext).BOOLEAN().getText() == "true")
        else if (ctx instanceof UnaryOpContext)
            return new UnaryExpression(
                Range.fromContext(ctx),
                (ctx as UnaryOpContext).uop().getText(),
                this.expToAST((ctx as UnaryOpContext)._target),
            )
        else if (ctx instanceof BinaryOpAddContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                (ctx as BinaryOpAddContext).bopAdd().getText(),
                this.expToAST((ctx as BinaryOpAddContext)._left),
                this.expToAST((ctx as BinaryOpAddContext)._right)
            );

        else if (ctx instanceof BinaryOpMulContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                (ctx as BinaryOpMulContext).bopMul().getText(),
                this.expToAST((ctx as BinaryOpMulContext)._left),
                this.expToAST((ctx as BinaryOpMulContext)._right)
            );

        else if (ctx instanceof BinaryOpRelContext)
            return new BinaryExpression(
                Range.fromContext(ctx),
                (ctx as BinaryOpRelContext).bopRel().getText(),
                this.expToAST((ctx as BinaryOpRelContext)._left),
                this.expToAST((ctx as BinaryOpRelContext)._right)
            );

        else {
            throw new Error("Unsupported expression type: " + (ctx as any).constructor.name);
        }
    }
}
