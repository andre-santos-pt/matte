import {cases, compilationError, runtimeError} from "./utils";
import {StaticErrorType} from "../ast";
import {RuntimeErrorType} from "../Interpreter";

describe('Matte Interpreter Objects', () => {

    it('Turtle', () => {
        cases(`
            class Turtle {
                int x = 0;
                int y = 0;
                int directionX = 1;
                int directionY = 0;
            
                void move() {
                    x = x + directionX;
                    y = y + directionY;
                }
            
                void rotateRight() {
                    if(directionX == 0) {
                        directionX = directionY == 1 ? -1 : 1;
                        directionY = 0;
                    }
                    else {
                        directionY = directionX == 1 ? 1 : -1;
                        directionX = 0;
                    }
                }
                
                int getX() {
                    return this.x;
                }
                
                int getDirectionX() {
                    return directionX;
                }
            }
            
            void main() {
                Turtle t = new Turtle();
                t.move();
                t.move();
            }
            `,
            ["main()", undefined],
            ["new Turtle().getX()", 0],
            ["new Turtle().getDirectionX()", 1]

        );

    })

    it('runs a constructor after initializing fields', () => {
        cases(`
            class Box {
                int value = 2;

                Box(int initial) {
                    value = initial;
                }

                int getValue() {
                    return value;
                }
            }
            `,
            ["new Box(9).getValue()", 9]
        );
    });

    it('runs a no-argument constructor after field initializers', () => {
        cases(`
            class Box {
                int value = 2;

                Box() {
                    value = value + 3;
                }

                int getValue() {
                    return value;
                }
            }
            `,
            ["new Box().getValue()", 5]
        );
    });

    it('validates constructor arguments', () => {
        compilationError(`
            class Box {
                Box() {}
            }

            void main() {
                Box box = new Box(1);
            }
            `,
            StaticErrorType.NumberArgumentsMismatch
        );
    });

    it('validates constructor parameter types', () => {
        compilationError(`
            class Box {
                Box(int value) {}
            }

            void main() {
                Box box = new Box(true);
            }
            `,
            StaticErrorType.ArgumentTypesMismatch
        );
    });

})
