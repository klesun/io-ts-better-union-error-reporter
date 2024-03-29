import {
  ArrayType,
  BooleanType,
  ContextEntry,
  Decoder,
  DictionaryType, Errors,
  InterfaceType,
  IntersectionType,
  LiteralType, NullType,
  NumberType,
  PartialType, RecursiveType,
  StringType, UnionType,
} from "io-ts";
import CollectIoReducedUnionErrorTree, { ErrorTreeNode, getTypeof } from "./CollectIoReducedUnionErrorTree";

const INDENT = '  ';

const getShortType = (ioType: Decoder<unknown, unknown>): string | null => {
  return (
    ioType instanceof LiteralType ?
      JSON.stringify(ioType.value) :
    ioType instanceof ArrayType ?
      (getShortType(ioType.type) ?? 'mixed') + '[]' :
    ioType instanceof UnionType ?
      [...new Set(ioType.types.map(
        (t: Decoder<unknown, unknown>) => {
          return getShortType(t) ?? 'mixed';
        }
      ))].join('|') :
    ioType.name.match(/^\w+$/) ?
      ioType.name :
    getTypeof(ioType) ?? null
  );
};

const makeMismatchMessage = (expected: Decoder<unknown, unknown>, actual: unknown, level: number): string => {
  const expectedLiteral = expected instanceof LiteralType ? expected.value : null;
  const expectedTypeof = getTypeof(expected);
  const actualTypeof = typeof actual;
  return expected instanceof LiteralType && actualTypeof === 'string' ?
      '\'' + expected.value +'\' expected, but \'' + actual + '\' found' :
    expectedTypeof && expectedTypeof !== actualTypeof ?
      (expectedLiteral ? JSON.stringify(expectedLiteral) : expectedTypeof) + ' expected, but ' + actualTypeof + ' found' :
    expected instanceof ArrayType && !Array.isArray(actual) ?
      'array expected, but ' + typeof actual + ' found' :
    expected instanceof NullType && actual !== null ?
      'null expected, but ' + typeof actual + ' found' :
    expected instanceof RecursiveType && expected.name ?
      expected.name + ' expected' :
    // when io-ts validates an intersection type, it reasonably stops after first unsatisfied intersection
    // item, resulting in following error entries not having child errors - in such case this message serves
    // as a hint rather than a source of vital information, so we just truncate lengthy options description
    expected instanceof UnionType ?
      'expected one of\n' + expected.types
        .map((t: Decoder<unknown, unknown>) => {
          return INDENT.repeat(level) + ' | ' + t.name.slice(0, 70) + '...';
        }).join('\n'):
    (expected as (typeof expected) & {_tag: string})._tag + ' ' + expected.name + ' expected';
};

const prettyPrintErrorTree = (tree: ErrorTreeNode, parentType?: ContextEntry['type'], level = 0): string => {
  let result = '';
  for (const [key, subNodes] of tree) {
    let elementPrefix;
    if (!parentType) {
      elementPrefix = '';
    } else if (parentType instanceof UnionType) {
      elementPrefix = '| ';
    } else if (parentType instanceof IntersectionType) {
      elementPrefix = '& ';
    } else if (parentType instanceof ArrayType) {
      elementPrefix = 'at [' + key.key + '] ';
    } else {
      elementPrefix = key.key + ': ';
    }
    result += INDENT.repeat(level) + elementPrefix;
    let containerMessage;
    if (key.type instanceof UnionType) {
      containerMessage = 'must satisfy either of';
    } else if (key.type instanceof IntersectionType) {
      containerMessage = 'must satisfy every of';
    } else if (key.type instanceof ArrayType) {
      containerMessage = 'array [';
    } else if (key.type instanceof InterfaceType) {
      containerMessage = 'object {';
    } else if (key.type instanceof RecursiveType) {
      containerMessage = key.type.name + ' {';
    } else {
      containerMessage = 'invalid ' + subNodes.size + ' ' + (key.type as (typeof key.type) & {_tag: string})._tag + ' element(s)';
    }
    if (key.actual === undefined) {
      const shortType = getShortType(key.type) ?? '';
      result += (shortType + ' is mandatory\n').trimStart();
    } else if (subNodes.size > 0) {
      result += containerMessage + '\n';
      result += prettyPrintErrorTree(subNodes, key.type, level + 1);
    } else {
      result += makeMismatchMessage(key.type, key.actual, level + 1) + '\n';
    }
  }
  return result;
};

const PrettyPrintIoTsErrors = (e: Errors): string => {
  const tree = CollectIoReducedUnionErrorTree(e);
  return prettyPrintErrorTree(tree);
};

export default PrettyPrintIoTsErrors;
