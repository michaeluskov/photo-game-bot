import { WordInContextProvider } from "../../src/wordInContext/wordInContextProvider";

describe("wordInContextProvider", () => {
  it("gets context", async () => {
    const provider = new WordInContextProvider(1);
    const providerResult = await provider.getWordInContext("give a damn", "English");
    const result = providerResult.result;
    expect(result).toContain("____");
  });
});
