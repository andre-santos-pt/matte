import {
    ASTVisitor,
    ArithmeticExpression,
    BlockStatement,
    Declaration,
    IntLiteral,
    PrimitiveType,
    Procedure,
    Program,
    ReturnStatement,
    TypeDeclaration,
    Variable,
    IfStatement,
    WhileStatement, Assignment
} from "../ast";
import Range from "../Range";
import {buildAST} from "../antlr2ast";

describe("ASTVisitor", () => {
    it("visits while and if statements in a function parsed from source", () => {
        const program = buildAST(`
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
});
