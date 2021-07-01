A pretty-printer for [io-ts](https://github.com/gcanti/io-ts/issues/350) errors that filters out
unions that clearly don't match the tag literal in input data - it only includes the union option
having the most fields covered by the input data.

### Installation:

<sub>package.json</sub>
```json
{
  "dependencies": {
    "io-ts-better-union-error-reporter": soon
  }
}
```

```bash
npm i
```

Note, since this library is written in typescript, you'll have to whitelist it in your `tsconfig.json`, as `/node_modules/` are excluded by default. If you are using `webpack`, `ts-node`, or something else, you'll have to whitelist `/node_modules/io-ts-better-union-error-reporter` there as well.

### Usage example:
```typescript
import PrettyPrintIoTsErrors from "io-ts-better-union-error-reporter/PrettyPrintIoTsErrors";
import * as t from "io-ts";

const validated = someType.decode(someData);
if (validated._tag === 'Left') { // decode error
    const message = PrettyPrintIoTsErrors(validated.left);
    console.log('io-ts validation failed!', message);
}
```

### Example output:
```
[
  at [11] must be one of
    {
      kind: "function" is mandatory
      inputs: CompilerDataType[] is mandatory
      output: CompilerDataType is mandatory
      id: string is mandatory
      name: string is mandatory
    {
      name: string is mandatory
      kind: "primitive" is mandatory
      type: "boolean"|"address"|"integer"|"string"|object|"uint256"|"int256"|string is mandatory
    {
      kind: "struct" is mandatory
      fields: NsFunctionField[] is mandatory
      name: string is mandatory
    {
      name: string is mandatory
      kind: "table" is mandatory
      fields: Field[] is mandatory
    invalid 2 IntersectionType element(s)
      0: {
        metadataId: string is mandatory
      1: UnionType ({ name: string, kind: "primitive", type: (("boolean" | "address" | "integer" | "string") | { kind: "address", blockchain: string } | ("uint256" | "int256" | string)) } | { name: string, kind: "table", fields: Array<{ name: string, type: ({ kind: "predefinedTypeAlias", id: string } | ("boolean" | "address" | "integer" | "string") | { kind: "address", blockchain: string } | ({ kind: "function", inputs: Array<CompilerDataType>, output: CompilerDataType } & Partial<{ staticReplacer: (undefined | any) }>) | { kind: "struct", fields: Array<Field> } | { kind: "tuple", parts: Array<CompilerDataType> } | { kind: "table", from: CompilerDataType, to: CompilerDataType } | { kind: "list", of: CompilerDataType }) }> } | { kind: "struct", fields: Array<{ name: string, type: ("boolean" | "address" | "integer" | "string") }>, name: string }) expected
  at [12] {
    name: string is mandatory
    type: "boolean"|"address"|"integer"|"string"|object|"uint256"|"int256"|string is mandatory
```

I'm using this lib with `ts-node`:
```javascript
const { register } = require('ts-node');

register({
    // otherwise it ignores ts files imported from node_modules
    // add here any other npm libs with source .ts files you are going to import
    ignore: [/node_modules\/(?!io-ts-better-union-error-reporter\/)/],
});
```

Can't guarantee that it will work in other environments.
