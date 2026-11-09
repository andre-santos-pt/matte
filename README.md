# MatteJ

MatteJ is a prototype interpreter for a subset of Java that can be embedded in webpages, providing expression materialization over execution traces.

The interpreter is self-contained and runs entirely in the browser. It can be used standalone, but for convenience we also developed an integration with the [ACE editor](https://ace.c9.io).

## How to use (HTML embedding)

1. Download the bundle `matte-web-ace.js` from the [Releases](https://github.com/andre-santos-pt/matte/releases).
2. Write a `matte-ace` tag holding the desired code.

### Example
```html
<script src="matte-web-ace.js" defer></script>

<matte-ace call="sum([15.2, 20.2, 25.5])">
double sum(double[] a) {
    double s = 0.0;
    int i = 0;
    while(i < a.length) {
        s = s + a[i];
        i++;
    }
    return s;
}
</matte-ace>
```
- If the `call` attribute is provided, that text will appear in the call box for the specified function.
- attribute `width` is optional; if undefined, a 100% width will be used.
- attribute `height` is optional; if undefined, the editor adapts its height to the number of lines.

#### Alternative
If you need to avoid non-standard HTML tags, you may simply create a `div` with the class `matte-ace`, optionally holding the attribute `data-call`.

```html
<div class="matte-ace" data-call="foo()">...</div>
```

## Built-in Extensions

MatteJ comes with a few built-in extensions. By including the attribute `sysout`, the `print`and `println` procedures become available. They work in a similar way that `System.out.print*`, but are able to pretty print arrays and objects in JSON format.

```html
<matte-ace sysout>
print("array: "); 
int[] array = {1, 2, 3};
println(array);
</matte-ace>
```



## How to build

### Matte interpreter (standalone JS library)

```bash
npm run lib
```

### Package for ACE editor
(depends on the output of the previous step, **matte.js**)
```bash
npm run ace
```

