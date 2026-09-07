import fs from "fs";
import path from "path";

type JsonValue = string | number | boolean | JsonObject | JsonValue[];
interface JsonObject {
    [key: string]: JsonValue;
}

function getAllKeys(obj: JsonObject, prefix = ""): string[] {
    let keys: string[] = [];
    for (const key in obj) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            keys = [...keys, ...getAllKeys(value as JsonObject, newPrefix)];
        } else {
            keys.push(newPrefix);
        }
    }
    return keys;
}

function getValueByPath(obj: JsonObject, path: string): JsonValue | undefined {
    return path.split(".").reduce<JsonValue | undefined>((acc, part) => {
        if (typeof acc === "object" && acc !== null && !Array.isArray(acc)) {
            return (acc as JsonObject)[part];
        }
        return undefined;
    }, obj);
}

function setValueByPath(obj: JsonObject, path: string, value: JsonValue): void {
    const parts = path.split(".");
    const last = parts.pop();
    const target = parts.reduce((acc, part) => {
        if (!(part in acc)) acc[part] = {};
        return acc[part] as JsonObject;
    }, obj);
    if (last) target[last] = value;
}

function syncTranslations(): void {
    const messagesDir = path.join(__dirname, "../src/messages");
    const enPath = path.join(messagesDir, "en.json");
    const enJson: JsonObject = JSON.parse(fs.readFileSync(enPath, "utf8"));
    const enKeys = getAllKeys(enJson);

    const languages = ["tr", "cs", "es", "pl", "ru"];

    languages.forEach((lang) => {
        const langPath = path.join(messagesDir, `${lang}.json`);
        let langJson: JsonObject = {};

        try {
            langJson = JSON.parse(fs.readFileSync(langPath, "utf8"));
        } catch {
            console.log(`Creating new ${lang}.json file`);
        }

        const langKeys = getAllKeys(langJson);
        const missingKeys = enKeys.filter((key) => !langKeys.includes(key));

        console.log(`\n${lang.toUpperCase()}:`);
        console.log(`  Total keys: ${enKeys.length}`);
        console.log(`  Existing keys: ${langKeys.length}`);
        console.log(`  Missing keys: ${missingKeys.length}`);

        if (missingKeys.length > 0) {
            missingKeys.forEach((key) => {
                const enValue = getValueByPath(enJson, key);
                if (enValue !== undefined) {
                    setValueByPath(langJson, key, enValue);
                }
            });

            fs.writeFileSync(langPath, JSON.stringify(langJson, null, 4));
            console.log(`  Added ${missingKeys.length} missing translations`);
        } else {
            console.log(`  No missing translations`);
        }
    });

    console.log("\nTranslation sync complete.");
}

syncTranslations();
