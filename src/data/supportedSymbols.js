export function assetFromSearchResult(result) {
  return { ...result, bias: 'neutral', confidence: 50 };
}
