import { Any,
  BooleanType, ContextEntry, Decoder, DictionaryType, Errors, InterfaceType, intersection, IntersectionType, LiteralType,
  NumberType,
  PartialType,
  StringType,
  type, UnionType } from "io-ts";

export type ErrorTreeNode = Map<ContextEntry, ErrorTreeNode>;

const collectTree = (e: Errors) => {
  const root: ErrorTreeNode = new Map();
  for (const error of e) {
    let node = root;
    for (let level of error.context) {
      if (!node.has(level)) {
        node.set(level, new Map());
      }
      node = node.get(level)!;
    }
  }
  return root;
};

type PlainKeySummary = {
  matchingLiterals: number,
  matchingProps: number,
};

type KeySummary = PlainKeySummary & {
  interactionKind: 'REDUCE',
} | {
  interactionKind: 'KEEP',
} | {
  interactionKind: 'EXCLUDE',
};

export const getTypeof = (ioType: Decoder<unknown, unknown>) => {
  return (
    ioType instanceof InterfaceType ||
    ioType instanceof PartialType ||
    ioType instanceof DictionaryType
      ? 'object' :
    ioType instanceof LiteralType ||
    ioType instanceof StringType
      ? 'string' :
    ioType instanceof NumberType
      ? 'number' :
    ioType instanceof BooleanType
      ? 'boolean' :
    null
  );
};

/**
 * does not include props from complex types, like recursive ones, please try
 * to arrange types to keep distinctive keys outside the function passed to t.recursion()
 * @return - null if it's a complex type and possible properties are unknown
 */
const getKnownExpectedProps = (recordType: ContextEntry['type']): Map<string, ContextEntry['type']> | null => {
  if (recordType instanceof InterfaceType) {
    return new Map(Object.entries(recordType.props));
  } else if (recordType instanceof IntersectionType) {
    const expectedProps = new Map();
    for (const typePart of recordType.types) {
      const props = getKnownExpectedProps(typePart);
      if (!props) {
        return null; // if at least one part of intersection is impossible to determine, keep option untouched
      }
      for (const [key, valueType] of props) {
        expectedProps.set(key, valueType);
      }
    }
    return expectedProps;
  } else {
    return null;
  }
};

const getKeySummary = (key: ContextEntry): KeySummary => {
  let matchingLiterals = 0;
  let matchingProps = 0;
  if (key.actual && typeof key.actual === 'object') {
    const actual = key.actual as Record<string, unknown>;
    const expectedProps = getKnownExpectedProps(key.type);
    if (!expectedProps) {
      return {interactionKind: 'KEEP'};
    }
    for (const [name, valueType] of expectedProps) {
      if (name in key.actual) {
        ++matchingProps;
        if ((valueType instanceof LiteralType) &&
            valueType.value === actual[name]
        ) {
          ++matchingLiterals;
        }
      }
    }
  }
  return { matchingProps, matchingLiterals, interactionKind: 'REDUCE' };
};

const compareSummaries = (a: PlainKeySummary, b: PlainKeySummary) => {
  if (a.matchingLiterals !== b.matchingLiterals) {
    return a.matchingLiterals - b.matchingLiterals;
  } else if (a.matchingProps !== b.matchingProps) {
    return a.matchingProps - b.matchingProps;
  } else {
    return 0;
  }
};

/** if there are options with higher amount of matching non-optional literals/keys, remove all other options */
const removeIrrelevantUnionOptions = (key: ContextEntry, failedOptions: ErrorTreeNode): ErrorTreeNode => {
  const actualTypeof = typeof key.actual;
  const hasExpectedTypeof = [...failedOptions.keys()]
    .some(k => getTypeof(k.type) === actualTypeof);
  const keyToSummary = new Map<ContextEntry, KeySummary>();
  for (const failedOption of failedOptions.keys()) {
    const expectedTypeof = getTypeof(failedOption.type);
    const summary: KeySummary = !hasExpectedTypeof || expectedTypeof === actualTypeof || !expectedTypeof
      ? getKeySummary(failedOption) : {interactionKind: 'EXCLUDE'};
    keyToSummary.set(failedOption, summary);
  }
  let bestSummary: PlainKeySummary = {matchingProps: 0, matchingLiterals: 0};
  for (const [, summary] of keyToSummary) {
    if (summary.interactionKind === 'REDUCE' && compareSummaries(summary, bestSummary) > 0) {
      bestSummary = summary;
    }
  }
  for (const key of failedOptions.keys()) {
    const summary = keyToSummary.get(key)!;
    if (summary.interactionKind === 'REDUCE' && compareSummaries(summary, bestSummary) < 0 ||
        summary.interactionKind === 'EXCLUDE'
    ) {
      failedOptions.delete(key);
    }
  }
  return failedOptions;
};

type PlainInterface = InterfaceType<Record<string, Any>>;

/**
 * {a: {d: number}, b: string} & {a: {e: number}, c: string} ->
 * {a: {d: number, e: number}, b: string, c: string}
 */
const mergeIntersection = (typeParts: ErrorTreeNode): ErrorTreeNode => {
  let interfaceParts: { type: PlainInterface, subNodes: ErrorTreeNode }[] = [];
  const unmergableParts: { type: Decoder<unknown, unknown>, subNodes: ErrorTreeNode }[] = [];
  for (const typePart of typeParts) {
    const [key, subNodes] = tryMergeIntersection(...typePart);
    if (key.type instanceof InterfaceType) {
      const type: PlainInterface = key.type;
      interfaceParts.push({ type, subNodes });
    } else {
      unmergableParts.push({ type: key.type, subNodes });
    }
  }
  if (interfaceParts.length < 2) {
    return typeParts;
  } else {
    const mergedProps: Record<string, Any> = {};
    const mergedSubNodes: ErrorTreeNode = new Map();
    for (const { type, subNodes } of interfaceParts) {
      for (const [key, value] of subNodes) {
        // this is probably not very correct...
        mergedSubNodes.set(key, value);
      }
      for (const [propName, propType] of Object.entries(type.props)) {
        const existing = mergedProps[propName] ?? null;
        if (existing) {
          if (existing instanceof IntersectionType) {
            existing.types.push(propType);
          } else {
            mergedProps[propName] = intersection([
              mergedProps[propName], propType,
            ]);
          }
        } else {
          mergedProps[propName] = propType;
        }
      }
    }
    const mergedInterface: { type: PlainInterface, subNodes: ErrorTreeNode } = {
      type: type(mergedProps),
      subNodes: mergedSubNodes,
    };
    return new Map(
      [mergedInterface, ...unmergableParts]
        .map((part, i) => {
          const key: ContextEntry = {
            key: i.toString(),
            type: part.type,
          };
          return [key, part.subNodes];
        })
    );
  }
};

const tryReduceMeaninglessWraps = (key: ContextEntry, subNodes: ErrorTreeNode): [ContextEntry, ErrorTreeNode] => {
  if (subNodes.size === 1 && (
    key.type instanceof UnionType ||
    key.type instanceof IntersectionType
  )) {
    const [remainingKey, remainingSubNodes] = [...subNodes][0];
    subNodes = remainingSubNodes;
    key = {
      key: key.key,
      type: remainingKey.type,
      actual: key.actual,
    };
  }
  return [key, subNodes];
};

const tryMergeIntersection = (key: ContextEntry, subNodes: ErrorTreeNode): [ContextEntry, ErrorTreeNode] => {
  [key, subNodes] = tryReduceMeaninglessWraps(key, subNodes);
  if ((key.type instanceof IntersectionType) && subNodes.size > 1) {
    subNodes = mergeIntersection(subNodes);
  }
  return [key, subNodes];
};

const removeIrrelevantUnionOptionsInNode = (node: ErrorTreeNode): ErrorTreeNode => {
  const newNode: ErrorTreeNode = new Map();
  for (let [key, subNodes] of node) {
    [key, subNodes] = tryMergeIntersection(key, subNodes);
    [key, subNodes] = tryReduceMeaninglessWraps(key, subNodes);
    subNodes = removeIrrelevantUnionOptionsInNode(subNodes);
    if ((key.type instanceof UnionType) && subNodes.size > 1) {
      subNodes = removeIrrelevantUnionOptions(key, subNodes);
    }
    [key, subNodes] = tryReduceMeaninglessWraps(key, subNodes);
    newNode.set(key, subNodes);
  }
  return newNode;
};

/**
 * collect io-ts error into a tree and remove union options
 * that clearly do not match the input data by tag literal
 */
const CollectIoReducedUnionErrorTree = (e: Errors): ErrorTreeNode => {
  const tree = collectTree(e);
  return removeIrrelevantUnionOptionsInNode(tree);
};

export default CollectIoReducedUnionErrorTree;
