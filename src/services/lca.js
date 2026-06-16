/**
 * Compute the Lowest Common Ancestor between two birds' ancestor paths.
 * Both paths are ordered arrays of NCBI taxIds starting at Aves root (8782).
 * Returns the index of the LCA in the path arrays.
 */
export function computeLCA(pathA, pathB) {
  let lcaIndex = 0;
  const maxLen = Math.min(pathA.length, pathB.length);
  for (let i = 0; i < maxLen; i++) {
    if (pathA[i] === pathB[i]) {
      lcaIndex = i;
    } else {
      break;
    }
  }
  return lcaIndex;
}

/**
 * Maps the LCA taxonomic rank to a feedback temperature string.
 * 5 levels: cold / cool / warm / hot / correct
 */
export function getFeedbackTemperature(rank) {
  if (!rank) return 'cold';
  switch (rank.toLowerCase()) {
    case 'class':
      return 'cold';
    case 'superorder':
    case 'order':
      return 'cool';
    case 'suborder':
    case 'family':
      return 'warm';
    case 'subfamily':
    case 'tribe':
    case 'genus':
      return 'hot';
    case 'species':
      return 'correct';
    default:
      return 'cold';
  }
}

/**
 * Compute the full result for a single guess against the answer bird.
 *
 * @param {object} guessBird  - Mongoose Bird document (lean)
 * @param {object} answerBird - Mongoose Bird document (lean)
 * @returns {object} result object
 */
export function computeGuessResult(guessBird, answerBird) {
  // Exact match
  if (guessBird.ncbiTaxId === answerBird.ncbiTaxId) {
    return { correct: true };
  }

  const lcaIndex = computeLCA(guessBird.ancestorPath, answerBird.ancestorPath);

  const lcaTaxId = guessBird.ancestorPath[lcaIndex];
  const lcaName = guessBird.ancestorNames[lcaIndex];
  const lcaRank = guessBird.ancestorRanks[lcaIndex];
  const lcaDepth = lcaIndex; // depth is the position in the ancestor path

  const feedbackTemperature = getFeedbackTemperature(lcaRank);

  return {
    correct: false,
    lcaTaxId,
    lcaName,
    lcaRank,
    lcaDepth,
    feedbackTemperature,
    ancestorPath: guessBird.ancestorPath,
  };
}
