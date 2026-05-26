import {Interpreter,} from '../Interpreter';
import assert from "assert";

describe('Matte Interpreter Test Extensions', () => {
    describe('Collections', () => {
        it('console static', () => {
            const originalLog = console.log;
            const logHistory: string[] = [];

            console.log = function (...args) {
                logHistory.push(...args.map(a => a.toString()));
                originalLog.apply(console, args);
            };
            const interpreter = new Interpreter();
            interpreter.addExtensionFunction("println", args => {
                console.log(args[0])
                return {
                    evaluation: undefined,
                    materialization: undefined
                }
            })
            interpreter.parseAndRun(`
                println(3);
                println(1);
                println("!!");
            `)
            assert.deepStrictEqual(logHistory, ["3","1","!!"])
        })
    })
})
