/* eslint-disable  @typescript-eslint/no-explicit-any */
"use server";

import { readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import { requireOwner } from "@/actions/require-owner";

const LANGUAGE_CODE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

function getAllKeys(obj: any, prefix: string = ""): string[] {
    let keys: string[] = [];
    for (const key in obj) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === "object" && obj[key] !== null) {
            keys = [...keys, ...getAllKeys(obj[key], newPrefix)];
        } else {
            keys.push(newPrefix);
        }
    }
    return keys;
}

function findExtraKeys(enKeys: string[], targetKeys: string[]): string[] {
    return targetKeys.filter((key) => !enKeys.includes(key));
}

function removeKeyByPath(obj: any, path: string) {
    const parts = path.split(".");
    const last = parts.pop()!;

    const target = parts.reduce((acc, part) => acc && acc[part], obj);

    if (target) {
        delete target[last];

        for (let i = parts.length - 1; i >= 0; i--) {
            const parentPath = parts.slice(0, i + 1);
            const parent = parentPath.reduce((acc, part) => acc && acc[part], obj);
            const parentKey = parts[i];
            const parentTarget = i === 0 ? obj : parts.slice(0, i).reduce((acc, part) => acc && acc[part], obj);

            if (parent && Object.keys(parent).length === 0) {
                delete parentTarget[parentKey];
            } else {
                break;
            }
        }
    }
}

function findMissingKeys(enKeys: string[], targetKeys: string[]): string[] {
    return enKeys.filter((key) => !targetKeys.includes(key));
}

function getValueByPath(obj: any, path: string) {
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

function setValueByPath(obj: any, path: string, value: any) {
    const parts = path.split(".");
    const last = parts.pop()!;
    const target = parts.reduce((acc, part) => {
        if (!(part in acc)) acc[part] = {};
        return acc[part];
    }, obj);
    target[last] = value;
}

export async function getAllLanguages() {
    await requireOwner();
    const messagesDir = path.join(process.cwd(), "src/messages");
    try {
        const files = readdirSync(messagesDir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => file.replace(".json", ""))
            .filter((lang) => lang !== "en");
        return files;
    } catch (error) {
        console.error("Error reading languages directory:", error);
        return [];
    }
}

function getMessagesPath(languageCode: string): string {
    if (!LANGUAGE_CODE_PATTERN.test(languageCode)) {
        throw new Error("Invalid language code");
    }

    const messagesDir = path.resolve(process.cwd(), "src/messages");
    const targetPath = path.resolve(messagesDir, `${languageCode}.json`);

    if (!targetPath.startsWith(messagesDir + path.sep)) {
        throw new Error("Invalid language code");
    }

    return targetPath;
}

function readTranslationPair(languageCode: string) {
    const targetPath = getMessagesPath(languageCode);
    return {
        enJson: JSON.parse(readFileSync(path.join(process.cwd(), "src/messages/en.json"), "utf8")),
        targetJson: JSON.parse(readFileSync(targetPath, "utf8")),
        targetPath,
    };
}

export async function checkTranslation(languageCode: string) {
    try {
        await requireOwner();
        const { enJson, targetJson } = readTranslationPair(languageCode);

        const enKeys = getAllKeys(enJson);
        const targetKeys = getAllKeys(targetJson);

        const missingKeys = findMissingKeys(enKeys, targetKeys);
        const extraKeys = findExtraKeys(enKeys, targetKeys);

        return {
            success: true,
            missingKeys,
            extraKeys,
            totalKeys: enKeys.length,
            completedKeys: enKeys.length - missingKeys.length,
            languageCode,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            languageCode,
        };
    }
}

export async function fillMissingTranslations(languageCode: string) {
    try {
        await requireOwner();
        const { enJson, targetJson, targetPath } = readTranslationPair(languageCode);

        const enKeys = getAllKeys(enJson);
        const targetKeys = getAllKeys(targetJson);
        const missingKeys = findMissingKeys(enKeys, targetKeys);

        let fillCount = 0;
        for (const key of missingKeys) {
            const enValue = getValueByPath(enJson, key);
            setValueByPath(targetJson, key, enValue);
            fillCount++;
        }

        writeFileSync(targetPath, JSON.stringify(targetJson, null, 4));

        return {
            success: true,
            filledCount: fillCount,
            languageCode,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            languageCode,
        };
    }
}

export async function removeExtraTranslations(languageCode: string) {
    try {
        await requireOwner();
        const enPath = path.join(process.cwd(), "src/messages/en.json");
        const targetPath = getMessagesPath(languageCode);

        const enJson = JSON.parse(readFileSync(enPath, "utf8"));
        const targetJson = JSON.parse(readFileSync(targetPath, "utf8"));

        const enKeys = getAllKeys(enJson);
        const targetKeys = getAllKeys(targetJson);
        const extraKeys = findExtraKeys(enKeys, targetKeys);

        let removeCount = 0;
        for (const key of extraKeys) {
            removeKeyByPath(targetJson, key);
            removeCount++;
        }

        writeFileSync(targetPath, JSON.stringify(targetJson, null, 4));

        return {
            success: true,
            removedCount: removeCount,
            languageCode,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            languageCode,
        };
    }
}
