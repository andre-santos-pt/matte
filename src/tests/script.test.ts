import {Interpreter, RuntimeErrorType} from '../Interpreter';

import {compilationError, runtimeError, script} from "./utils";
import {ArithmeticExpression, Assignment, StaticErrorType} from "../ast";
import {buildAST} from "../antlr2ast";

describe('Matte Interpreter Test Script', () => {
    describe('Script', () => {

        it('script mode', () => {
            script(`
        int i = 10;
        int j = i + 5;
        j = j + 5;
        int z = i + j + 50;
        `, new Map()
                .set("i", 10)
                .set("j", 20)
                .set("z", 80)
            )
        });

        it('compound arithmetic assignments', () => {
            script(`
                int value = 100;
                value += 10;
                int added = value;
                value -= 10;
                int subtracted = value;
                value *= 2;
                int multiplied = value;
                value /= 4;
                int divided = value;
                value %= 7;
            `, new Map()
                .set("value", 1)
                .set("added", 110)
                .set("subtracted", 100)
                .set("multiplied", 200)
                .set("divided", 50))
        });

        it('translates compound assignments to regular assignments', () => {
            const result = buildAST('int value = 2; value *= 3;')
            const assignment = result.program?.block?.statements[1]
            expect(assignment).toBeInstanceOf(Assignment)
            expect((assignment as Assignment).expression).toBeInstanceOf(ArithmeticExpression)
            expect(((assignment as Assignment).expression as ArithmeticExpression).operator).toBe("*")
        });

        it('final variable declarations are immutable', () => {
            script(`
                final int answer = 42;
                final var copy = answer;
            `, new Map()
                .set("answer", 42)
                .set("copy", 42))
        });

        it('final variable cannot be reassigned', () => {
            compilationError(`
                final int answer = 42;
                answer = 0;
            `, StaticErrorType.ImmutableVariable)
        });

        it('final variable cannot be incremented', () => {
            compilationError(`
                final int answer = 42;
                answer++;
            `, StaticErrorType.ImmutableVariable)
        });

        it('var not found assign', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        x = j + 5;
        int z = i + j + 50;
        `, StaticErrorType.UndeclaredVariable)
        });

        it('unknown token', () => {
            compilationError(`
        #i = 10;
        `, StaticErrorType.TokenError)
        });

        it('missing semicolon', () => {
            compilationError(`
        int i = 10
        int j = i + 5;
        `, StaticErrorType.SyntaxError)
        });

        it('rejects a number immediately followed by an identifier', () => {
            compilationError('int i = 0a;', StaticErrorType.SyntaxError)
        });

        it('EOF', () => {
            compilationError(`
        int i = 0;
        while(i != 10) {
            i = i + 1;
            `, StaticErrorType.SyntaxError)
        })

        it('break outside a loop is a static error', () => {
            const result = buildAST('break;')
            expect(result.errors.some(error => error.type === StaticErrorType.BreakOutsideLoop)).toBe(true)
        })

        it('break inside a loop is valid', () => {
            const result = buildAST('while(true) { break; }')
            expect(result.errors.some(error => error.type === StaticErrorType.BreakOutsideLoop)).toBe(false)
        })

        it('break inside a loop is valid', () => {
            const result = buildAST('while(true) { if(true) break; }')
            expect(result.errors.some(error => error.type === StaticErrorType.BreakOutsideLoop)).toBe(false)
        })


        it('var not found exp', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        j = a + 5;
        int z = i + j + 50;
        `, StaticErrorType.UndeclaredVariable)
        });


        it('var not found exp', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        int i = j + 5;
        `, StaticErrorType.DuplicateVariable)
        });

        it('operation types error', () => {
            compilationError(`
        int i = 10;
        boolean j = true;
        int x = j + i;
        `, StaticErrorType.TypeMismatch)
        });

        it('dec no init', () => {
            script(`
        int i;
        i = 1;
        int j = i;
        i = j * 2;
        i = i * 3;
        `, new Map().set("i", 6).set("j", 1));
        });
        it('if', () => {
            script(`
        int n = -2;
        if(n < 0) {
            n = -n;
        }
        `, new Map().set("n", 2))
        });

        it('if-else', () => {
            script(`
        int n = -2;
        if(n > 0) {
            n = -n;
        }
        else
            n = 0;
        `, new Map().set("n", 0))
        });

        it('while', () => {
            script(`
        int i = 0;
        while(i != 10) {
            i = i + 1;
        }
        `, new Map().set("i", 10))
        });

        it('while true break', () => {
            script(`
        int i = 0;
        while(true) {
            i = i + 1;
            if(i == 10)
                break;
        }
        `, new Map().set("i", 10))
        });

        it('while loop max', () => {
            runtimeError(`
        int i = 0;
        while(i != 100) {
            i = i + 1;
        }
        `, RuntimeErrorType.MaxIterationsReached, undefined, new Interpreter(100))
        });

        it('integer division by zero', () => {
            runtimeError('int result = 10 / 0;', RuntimeErrorType.DivisionByZero)
        });

        it('double division by zero', () => {
            runtimeError('double result = 10.0 / 0.0;', RuntimeErrorType.DivisionByZero)
        });

        it('casts double values to int by truncating toward zero', () => {
            script(`
                int positive = (int) 3.9;
                int negative = (int) -3.9;
                int negativeFraction = (int) -0.9;
                int fromExpression = (int) (1.5 + 2.8);
                int castBeforeMultiplication = (int) 3.9 * 2;
                int groupedSubtraction = (positive) - 1;
            `, new Map()
                .set("positive", 3)
                .set("negative", -3)
                .set("negativeFraction", 0)
                .set("fromExpression", 4)
                .set("castBeforeMultiplication", 6)
                .set("groupedSubtraction", 2))
        });

        it('casts int expressions to double', () => {
            script(`
                double integerDivision = 3 / 2;
                double doubleDivision = (double) 3 / 2;
                double castFraction = (double) 3.9;
            `, new Map()
                .set("integerDivision", 1)
                .set("doubleDivision", 1.5)
                .set("castFraction", 3.9))
        });

        it('paren types bug', () => {
            script(`
                int a = 3;
                int b = (a) - 1;
            `, new Map()
                .set("a", 3)
                .set("b", 2)
            )
        });

        it('remainder by zero', () => {
            runtimeError('int result = 10 % 0;', RuntimeErrorType.DivisionByZero)
        });


        it('inc while', () => {
            script(`
        int i = 0;
        while(i != 10) {
            i++;
        }
        `, new Map().set("i", 10))
        });




        it('for', () => {
            script(`
        for(int i = 0; i != 10; i = i + 1) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for inc', () => {
            script(`
        for(int i = 0; i != 10; i++) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for no init', () => {
            script(`
        int i = 0;
        for(; i != 10; i = i + 1) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for no prog', () => {
            script(`
        int i = 0;
        for(; i != 10; ) {
            i = i + 1;
        }
        `, new Map().set("i", 10))
        });

        it('for dec', () => {
            script(`
        for( int i = 10; i != 0; i--) {
        
        }
        `, new Map().set("i", 0))
        });

        it('empty for', () => {
            script(`
        int i = 0;
        for(; ; ) {
            i = i + 1;
            if(i == 10)
                break;
        }
        `, new Map().set("i", 10))
        });

        it('var out of scope', () => {
            compilationError(`
        for(int i = 0;  i < 10; i = i + 1 ) {
            
        }
        int j = i;
        `, StaticErrorType.UndeclaredVariable)
        });

        it('nested for', () => {
            script(`
        int c = 0;
        for(int i = 0; i != 10; i++)
            for(int j = 0; j != 20; j++)
                c++;
        `, new Map()
                .set("c", 200)
                .set("i", 10)
                .set("j", 20))
        });

        it('conditional', () => {
            script(`
            int a = 0;
            int b = a == 0 ? -1 : 1;
            int c = b == 0 ? 1 : 2;
        `, new Map()
                .set("a", 0)
                .set("b", -1)
                .set("c", 2)
            )
        });

        it('array references', () => {
            const code = `
                int[] values = null;
                values = new int[3];
                int[] ref = values;
            `
            const interpreter = new Interpreter();
            let result = interpreter.parseAndRun(code);
            console.log(result);
        });


        it('string', () => {
            script(`
        String hello = "ola";
        String helloExc = hello + "!";
        `, new Map()
                .set("hello", "ola")
                .set("helloExc", "ola!")
            )
        });

        it('comments', () => {
           const p = script(`
       
        int sum = 5; // variable
       
        int result = sum + 10;  // This is a comment
        `, new Map()
                .set("sum", 5)
                .set("result", 15)
            )
            console.log(p?.block?.statements)
        });

    })
})
