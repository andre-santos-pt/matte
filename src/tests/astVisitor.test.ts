import {
    ASTVisitor,
    ArithmeticExpression,
    ArrayAssignment,
    ArrayElementExpression,
    ArrayLiteralExpression,
    ArrayType,
    BlockStatement,
    BooleanLiteral,
    CastExpression,
    CallExpression,
    ConditionalExpression,
    Declaration,
    FieldAccessExpression,
    IntLiteral,
    LogicalExpression,
    PrimitiveType,
    Procedure,
    Program,
    RelationalExpression,
    ReturnStatement,
    TypeDeclaration,
    NewObjectExpression,
    UnaryExpression,
    Variable,
    IfStatement,
    WhileStatement, Assignment
} from "../ast";
import Range from "../Range";
import {compile} from "./utils";

describe("ASTVisitor", () => {
    it("sets parent links while translating source into an AST", () => {
        const program = compile("int sum(int value) { return value + 1; }");
        const procedure = program.procedures[0];
        const parameter = procedure.parameters[0];
        const body = procedure.body!;
        const statement = body.statements[0] as ReturnStatement;
        const expression = statement.expression as ArithmeticExpression;

        expect(program.parent).toBeUndefined();
        expect(procedure.parent).toBe(program);
        expect(parameter.parent).toBe(procedure);
        expect(body.parent).toBe(procedure);
        expect(statement.parent).toBe(body);
        expect(expression.parent).toBe(statement);
        expect(expression.left.parent).toBe(expression);
        expect(expression.right.parent).toBe(expression);
    });

    // it("sets parent links for calls translated separately from the program", () => {
    //     const [program, call] = buildASTandCall("int sum(int value) { return value; }", "sum(1)");
    //
    //     expect(program.procedures[0].parent).toBe(program);
    //     expect(call.parent).toBeUndefined();
    //     if (!(call instanceof CallExpression))
    //         throw new Error("Expected a call expression");
    //     expect(call.args[0].parent).toBe(call);
    // });

    it("visits while and if statements in a function parsed from source", () => {
        const program = compile(`
            int count(int n) {
                int i = 0;
                while (i < n) {
                    if (i == 2) {
                        i = i + 1;
                    } else {
                        i = i + 1;
                        return i;
                    }
                }
                return i;
            }
        `);
        const visitor = new class extends ASTVisitor {
            declarations = 0;
            whileStatements = 0;
            ifStatements = 0;
            assigns = 0;
            returns = 0;

            override visitDeclaration(declaration: Declaration) {
                this.declarations++;
                super.visitDeclaration(declaration);
            }

            override visitWhileStatement(statement: WhileStatement): void {
                this.whileStatements++;
                super.visitWhileStatement(statement);
            }

            override visitIfStatement(statement: IfStatement): void {
                this.ifStatements++;
                super.visitIfStatement(statement);
            }

            override visitAssignment(assignment: Assignment) {
                this.assigns++;
                super.visitAssignment(assignment);
            }
            override visitReturnStatement(statement: ReturnStatement) {
                this.returns++;
                super.visitReturnStatement(statement);
            }
        };

        program.accept(visitor);
        expect(visitor.declarations).toBe(2);
        expect(visitor.whileStatements).toBe(1);
        expect(visitor.ifStatements).toBe(1);
        expect(visitor.assigns).toBe(2);
        expect(visitor.returns).toBe(2);

    });

    it("traverses a program and its structural children", () => {
        const range = new Range(0, 1, 1, 0);
        const local = new Declaration(undefined, "x", undefined, false, PrimitiveType.INT, undefined);
        local.initializer = new ArithmeticExpression(
            range,
            "+",
            new IntLiteral(range, 1),
            new IntLiteral(range, 2)
        );
        const field = new Declaration(undefined, "y", undefined, false, PrimitiveType.INT, undefined);
        const procedure = new Procedure(
            undefined,
            "readX",
            undefined,
            false,
            [],
            PrimitiveType.INT,
            undefined,
            new BlockStatement(undefined, [
                new ReturnStatement(undefined, new Variable(range, local))
            ])
        );
        const program = new Program(
            new BlockStatement(undefined, [local]),
            [procedure],
            [new TypeDeclaration("Data", range, false, [field])]
        );
        const visitor = new class extends ASTVisitor {
            declarations = 0;
            integers = 0;
            variables = 0;

            override visitDeclaration(declaration: Declaration): void {
                this.declarations++;
                super.visitDeclaration(declaration);
            }

            override visitIntLiteral(expression: IntLiteral): void {
                this.integers++;
                super.visitIntLiteral(expression);
            }

            override visitVariable(expression: Variable): void {
                this.variables++;
                super.visitVariable(expression);
            }
        };

        program.accept(visitor);

        expect(visitor.declarations).toBe(2);
        expect(visitor.integers).toBe(2);
        expect(visitor.variables).toBe(1);
    });

    it("reports semantic errors through validation without throwing during AST construction", () => {
        const range = new Range(0, 1, 1, 0);
        const integer = new IntLiteral(range, 1);
        const boolean = new BooleanLiteral(range, true);
        const program = new Program(
            new BlockStatement(range, [
                new ArrayAssignment(range, integer, boolean, boolean),
                new ArrayAssignment(range, new Variable(range, new Declaration(range, "values", range, false, new ArrayType(PrimitiveType.INT), range)), integer, boolean),
                new IfStatement(range, integer, new BlockStatement(range, []), undefined),
                new WhileStatement(range, integer, new BlockStatement(range, [])),
                new ReturnStatement(range, new ArrayElementExpression(range, integer, boolean)),
                new ReturnStatement(range, new ConditionalExpression(range, integer, integer, boolean)),
                new ReturnStatement(range, new ArithmeticExpression(range, "+", boolean, integer)),
                new ReturnStatement(range, new ArithmeticExpression(range, "^", integer, integer)),
                new ReturnStatement(range, new RelationalExpression(range, "<", boolean, integer)),
                new ReturnStatement(range, new UnaryExpression(range, "-", boolean)),
                new ReturnStatement(range, new CastExpression(range, PrimitiveType.INT, boolean)),
                new ReturnStatement(range, new ArrayLiteralExpression(range, [integer, boolean])),
                new ReturnStatement(range, new LogicalExpression(range, "&&", integer, boolean)),
                new ReturnStatement(range, new FieldAccessExpression(range, integer, "field", range)),
                new ReturnStatement(range, new FieldAccessExpression(range, new Variable(range, new Declaration(range, "values", range, false, new ArrayType(PrimitiveType.INT), range)), "field", range)),
                new ReturnStatement(range, new NewObjectExpression(range, PrimitiveType.INT, []))
            ]),
            [new Procedure(range, "instanceMethod", range, true, [])]
        );

        const errors = program.checkStaticErrors();

        expect(errors.length).toBeGreaterThan(10);
        expect(errors.some(error => error.message === "Not an object type")).toBe(true);
        expect(errors.some(error => error.message.includes("Expected boolean expression"))).toBe(true);
        expect(errors.every(error => error.type !== undefined)).toBe(true);
    });
});
