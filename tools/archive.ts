import fs from "fs";
import fetch from "node-fetch";

const input = JSON.parse(fs.readFileSync("input.json", "utf8"));
console.log(input);
fs.mkdirSync("photos");

async function main() {
    for (const item of input) {
        const response = await fetch(item.photo_url);
        const buffer = await response.buffer();
        const filename = `${item.task_name} (${item.first_name} + ${item.second_name}).jpg`;
        fs.writeFileSync(`photos/${filename}`, buffer);
    }
}

main();