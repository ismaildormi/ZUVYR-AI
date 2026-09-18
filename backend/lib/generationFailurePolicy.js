'use strict';

function policyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function positiveInteger(value, code) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw policyError(code);
  }

  return number;
}

function nonNegativeInteger(value, code) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw policyError(code);
  }

  return number;
}

function isGenerationFailureExhausted({
  error,
  attemptsMade,
  maxAttempts
} = {}) {
  const attempts =
    nonNegativeInteger(
      attemptsMade,
      'invalid_generation_attempts_made'
    );

  const maximum =
    positiveInteger(
      maxAttempts,
      'invalid_generation_max_attempts'
    );

  return (
    error?.name === 'UnrecoverableError' ||
    attempts >= maximum
  );
}

function generationFailureDisposition(input = {}) {
  const exhausted =
    isGenerationFailureExhausted(input);

  return Object.freeze({
    exhausted,
    refundAllowed: exhausted,
    persistFailure: exhausted,
    retryPending: !exhausted
  });
}

module.exports = {
  isGenerationFailureExhausted,
  generationFailureDisposition
};
