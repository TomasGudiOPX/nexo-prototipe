export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.(?:js|mjs|cjs|json|ts)$/.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
