import {Interpreter,} from '../Interpreter';
import assert from "assert";

describe('Matte Interpreter Test Extensions', () => {
    describe('static', () => {
        it('println to console', () => {
            const originalLog = console.log;
            const logHistory: string[] = [];

            console.log = function (...args) {
                logHistory.push(...args.map(a => a.toString()));
                originalLog.apply(console, args);
            };
            const interpreter = new Interpreter();
            interpreter.addExtensionProcedure("println", args => {
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

        it('list', () => {
            const interpreter = new Interpreter();
            interpreter.addExtensionType("List", args => {
                return {
                    evaluation: [],
                    materialization: undefined
                }
            },
                ["add", args => {
                    args[0].evaluation.push(args[1].evaluation)
                    return { evaluation: undefined, materialization: undefined } } ]
                )

            interpreter.parseAndRun(`
                List list = new List();
                list.add(3);
            `)

        })
    })
})
