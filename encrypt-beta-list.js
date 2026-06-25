// encrypt-beta-list.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const plaintextPath = path.join(__dirname, "public", "betausers.txt");
const encryptedPath = path.join(__dirname, "secure", "betausers.enc");

if (!process.env.BETA_KEY) {
  console.error("❌ BETA_KEY not found in environment. Set it before running.");
  process.exit(1);
}

const key = crypto.scryptSync(process.env.BETA_KEY, "salt", 32); // 256-bit AES key
const iv = crypto.randomBytes(16); // Initialization vector
const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

const input = fs.createReadStream(plaintextPath);
const output = fs.createWriteStream(encryptedPath);

output.write(iv); // prepend IV to file

input.pipe(cipher).pipe(output);

output.on("finish", () => {
  console.log("✅ Encrypted betausers.txt to secure/betausers.enc");
});