import { askUserOutputFromFormData, askUserInputSchema, summarizeAskUserAnswers } from "./src/domains/ledger-ai/domain/askUserTool";
const input = askUserInputSchema.parse({ questions: [
  { id: "cat", prompt: "Which category?", choices: [{ value: "food", label: "Food" }, { value: "fun", label: "Fun" }], allowOther: true },
  { id: "rows", prompt: "Which rows?", multiple: true, required: false, choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
]});
const fd = new FormData(); fd.append("cat", "Custom thing"); fd.append("rows", "a"); fd.append("rows", "b");
const out = askUserOutputFromFormData(input, fd);
console.log(JSON.stringify(out)); console.log(summarizeAskUserAnswers(out));
const fd2 = new FormData(); fd2.append("cat", "food");
console.log(summarizeAskUserAnswers(askUserOutputFromFormData(input, fd2)));
