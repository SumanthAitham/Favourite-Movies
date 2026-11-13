import { expect, it } from "vitest";
import { isRepeatedFact } from "@/lib/facts/similarity";

it("ignores case, spacing, and punctuation when checking repeats", () => {
  expect(isRepeatedFact("THE SCORE used an orchestra!", "The score used an orchestra.")).toBe(true);
});
it("catches a small wording change in a long repeated fact", () => {
  expect(isRepeatedFact(
    "The film used practical effects and miniature sets to create its spectacular city scenes.",
    "The film used practical effects and miniature sets to create its memorable city scenes.",
  )).toBe(true);
});
it("allows different details about the same film", () => {
  expect(isRepeatedFact("The film used miniature sets for its city scenes.", "The score was recorded with a full orchestra in London.")).toBe(false);
});
it("does not infer similarity from a few shared words in short facts", () => {
  expect(isRepeatedFact("The film won two awards.", "The film used three cameras.")).toBe(false);
});
