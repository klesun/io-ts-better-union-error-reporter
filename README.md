A pretty-printer for [io-ts](https://github.com/gcanti/io-ts/issues/350) errors that filters out
unions that clearly don't match the tag literal in input data - it only includes the union option
having the most fields covered by the data.

### Installation:

```bash
npm i io-ts-better-union-error-reporter@0.0.4
```

### Usage example:
```typescript
import PrettyPrintIoTsErrors from "io-ts-better-union-error-reporter/dist/PrettyPrintIoTsErrors";
import * as t from "io-ts";

const someType: t.Decoder<unknown, unknown> = t.type({...});
const validated = someType.decode(someData);
if (validated._tag === 'Left') { // decode error
    const message = PrettyPrintIoTsErrors(validated.left);
    console.log('io-ts validation failed!', message);
}
```

### Example output:
```bash
array [
  # example with {"kind": "primitive"} supplied as input data
  at [7] object {
    name: string is mandatory
    type: "boolean"|"address"|"integer"|"string"|object|"uint256"|"int256"|string is mandatory
  # example with {} supplied as input data
  at [11] must satisfy either of
    | object {
      kind: "function" is mandatory
      inputs: CompilerDataType[] is mandatory
      output: CompilerDataType is mandatory
      id: string is mandatory
      name: string is mandatory
    | object {
      name: string is mandatory
      kind: "primitive" is mandatory
      type: "boolean"|"address"|"integer"|"string"|object|"uint256"|"int256"|string is mandatory
    | object {
      kind: "struct" is mandatory
      fields: NsFunctionField[] is mandatory
      name: string is mandatory
    | object {
      name: string is mandatory
      kind: "table" is mandatory
      fields: Field[] is mandatory
    | must satisfy every of
      & object {
        metadataId: string is mandatory
      & expected one of
         | { name: string, kind: "primitive", type: (("boolean" | "address" | "in...
         | { name: string, kind: "table", fields: Array<{ name: string, type: ({ ...
         | { kind: "struct", fields: Array<{ name: string, type: ("boolean" | "ad...
```
