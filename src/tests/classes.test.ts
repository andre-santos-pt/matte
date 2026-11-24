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
})
