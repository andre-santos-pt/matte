import {RuntimeErrorType} from '../Interpreter';

import {compilationError, runtimeError, script} from "./utils";
import {StaticErrorType} from "../ast";

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
        while(i != 101) {
            i = i + 1;
        }
        `, RuntimeErrorType.MaxIterationsReached)
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

        it('string', () => {
            script(`
        String hello = "ola";
        String helloExc = hello + "!";
        `, new Map()
                .set("hello", "ola")
                .set("helloExc", "ola!")
            )
        });
    })
})
