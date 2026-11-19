import {buildAST, getJavaCode} from "../antlr2ast";

describe("getJavaCode", () => {
    it("renders a program block as a script without a wrapper", () => {
        const program = buildAST("int count = 1; count = count + 2;")

        expect(getJavaCode(program)).toBe("int count = 1;\ncount = (count + 2);")
        expect(getJavaCode(buildAST(getJavaCode(program)))).toBe(getJavaCode(program))
    });

    it("renders declarations and procedures for a non-script program", () => {
        const program = buildAST("int twice(int value) { return value * 2; }")

        expect(getJavaCode(program)).toBe(
            "int twice(int value) {\n    return (value * 2);\n}"
        )
    });

    it("renders int casts", () => {
        const code = getJavaCode(buildAST("int value = (int) 3.9;"))

        expect(code).toBe("int value = (int) 3.9;")
        expect(getJavaCode(buildAST(code))).toBe(code)
    });

    it("renders class and record declarations with their instance methods", () => {
        const program = buildAST(`
            class Box {
                int value;
                int get() { return value; }
            }
            record Point(int x, int y) {
                int sum() { return x + y; }
            }
        `)
        const code = getJavaCode(program)

        expect(code).toContain("class Box {")
        expect(code).toContain("record Point(int x, int y) {")
        expect(getJavaCode(buildAST(code))).toBe(code)
    });
});
