import 'dotenv/config';
import path from 'path';
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function list() {
  const apiKey = process.env.HEYGEN_API_KEY;
  console.log("Using Key:", apiKey?.slice(0, 5) + "...");
  const response = await fetch("https://api.heygen.com/v2/avatars", {
    headers: { "x-api-key": apiKey! }
  });
  const data = await response.json();
  console.log("Data keys:", Object.keys(data || {}));
  if (data.data) {
    console.log("Data.data keys:", Object.keys(data.data));
    const list = data.data.avatars || data.data.list || [];
    console.log("Found", list.length, "avatars");
    list.forEach((a: any) => {
      if (a.gender === 'male') {
        console.log(`- ${a.avatar_id} (${a.name})`);
      }
    });
  } else {
    console.log("Response:", JSON.stringify(data));
  }
}

list();
