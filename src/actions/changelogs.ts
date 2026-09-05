import "server-only";

import fs from "fs/promises";
import path from "path";

const CHANGELOG_PATH = path.join(process.cwd(), "changelog.json");

export async function readChangelogs() {
    try {
        const content = await fs.readFile(CHANGELOG_PATH, "utf-8");
        return JSON.parse(content);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return [];
        }

        throw error;
    }
}
