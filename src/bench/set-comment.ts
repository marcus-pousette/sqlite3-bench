import { setReadmeComment } from "./util.ts";

function main() {
  const args = process.argv.slice(2);
  const text = args.join(" ").trim();
  setReadmeComment(text);
  console.log("Updated README comment.");
}

main();

